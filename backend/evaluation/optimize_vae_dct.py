"""Research-only VAE-guided DCT protection baseline.

This script is deliberately outside the production compiler. It uses the
selected editor's VAE and gradients to measure how much a model-specific
frequency-domain perturbation can change the editor's latent representation.
It must never be exposed through the GRAIN HTTP API or presented as a
cross-model guarantee.
"""

import argparse
import json
import math
import platform
import time
from datetime import datetime, timezone
from pathlib import Path


MID_BAND_POSITIONS = (
    (1, 2),
    (2, 1),
    (2, 2),
    (1, 3),
    (3, 1),
    (2, 3),
    (3, 2),
)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Research-only VAE-guided DCT protection optimization."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--model", default="timbrooks/instruct-pix2pix")
    parser.add_argument("--cache-dir", type=Path, default=None)
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    parser.add_argument("--resolution", type=int, default=512)
    parser.add_argument("--epsilon", type=float, default=2.0,
                        help="Maximum RGB channel change in 8-bit values.")
    parser.add_argument("--step-size", type=float, default=0.35,
                        help="Projected-gradient step in 8-bit values.")
    parser.add_argument("--iterations", type=int, default=80)
    parser.add_argument("--coefficients-per-block", type=int, default=4)
    return parser.parse_args()


def dct_basis(block_size, torch, device, dtype):
    position = torch.arange(block_size, device=device, dtype=dtype)
    frequency = position[:, None]
    basis = torch.cos(math.pi * (position[None, :] + 0.5) * frequency / block_size)
    basis[0] *= math.sqrt(1 / block_size)
    basis[1:] *= math.sqrt(2 / block_size)
    return basis


def image_to_blocks(tensor, block_size):
    batch, channels, height, width = tensor.shape
    if height % block_size or width % block_size:
        raise ValueError("The model input must be divisible by the DCT block size.")
    return tensor.reshape(
        batch, channels, height // block_size, block_size, width // block_size, block_size
    ).permute(0, 1, 2, 4, 3, 5)


def blocks_to_image(blocks):
    batch, channels, blocks_y, blocks_x, block_height, block_width = blocks.shape
    return blocks.permute(0, 1, 2, 4, 3, 5).reshape(
        batch, channels, blocks_y * block_height, blocks_x * block_width
    )


def dct2(blocks, basis, torch):
    return torch.einsum("fi,...ij,gj->...fg", basis, blocks, basis)


def idct2(coefficients, basis, torch):
    return torch.einsum("fi,...fg,gj->...ij", basis, coefficients, basis)


def dct_project(delta, mask, basis, torch):
    blocks = image_to_blocks(delta, mask.shape[-1])
    coefficients = dct2(blocks, basis, torch)
    return blocks_to_image(idct2(coefficients * mask, basis, torch))


def tensor_from_image(image, torch):
    import numpy as np

    data = np.asarray(image, dtype=np.float32) / 127.5 - 1.0
    return torch.from_numpy(data).permute(2, 0, 1).unsqueeze(0)


def image_from_tensor(tensor):
    import numpy as np
    from PIL import Image

    data = tensor.detach().squeeze(0).permute(1, 2, 0).clamp(-1, 1)
    data = ((data + 1.0) * 127.5).round().to("cpu").numpy().astype(np.uint8)
    return Image.fromarray(data, mode="RGB")


def main():
    args = parse_args()
    args.input = args.input.resolve()
    args.out = args.out.resolve()
    args.report = (args.report or args.out.with_suffix(".json")).resolve()
    if args.cache_dir:
        args.cache_dir = args.cache_dir.resolve()

    if args.epsilon <= 0 or args.step_size <= 0 or args.iterations <= 0:
        raise ValueError("epsilon, step-size, and iterations must be positive.")
    if not 1 <= args.coefficients_per_block <= len(MID_BAND_POSITIONS):
        raise ValueError(f"coefficients-per-block must be 1 through {len(MID_BAND_POSITIONS)}.")

    import torch
    from PIL import Image, ImageOps
    from diffusers import StableDiffusionInstructPix2PixPipeline

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but torch.cuda.is_available() is false.")
    device = "cuda" if args.device == "auto" and torch.cuda.is_available() else args.device
    if device == "auto":
        device = "cpu"

    source = ImageOps.fit(
        Image.open(args.input).convert("RGB"),
        (args.resolution, args.resolution),
        method=Image.Resampling.LANCZOS,
    )
    clean = tensor_from_image(source, torch).to(device=device, dtype=torch.float32)

    started_at = time.perf_counter()
    pipeline = StableDiffusionInstructPix2PixPipeline.from_pretrained(
        args.model,
        cache_dir=str(args.cache_dir) if args.cache_dir else None,
        torch_dtype=torch.float32,
        use_safetensors=True,
    )
    vae = pipeline.vae.to(device).eval()
    for parameter in vae.parameters():
        parameter.requires_grad_(False)

    with torch.no_grad():
        clean_latent = vae.encode(clean).latent_dist.mean.detach()

    block_size = 8
    basis = dct_basis(block_size, torch, device, clean.dtype)
    blocks_y = clean.shape[-2] // block_size
    blocks_x = clean.shape[-1] // block_size
    mask = torch.zeros((1, 1, blocks_y, blocks_x, block_size, block_size), device=device, dtype=clean.dtype)
    for horizontal, vertical in MID_BAND_POSITIONS[: args.coefficients_per_block]:
        mask[..., vertical, horizontal] = 1.0
    mask = mask.expand(1, clean.shape[1], -1, -1, -1, -1)

    epsilon = args.epsilon / 255.0
    step_size = args.step_size / 255.0
    delta = torch.zeros_like(clean, requires_grad=True)
    history = []

    for iteration in range(1, args.iterations + 1):
        protected = (clean + delta).clamp(-1, 1)
        latent = vae.encode(protected).latent_dist.mean
        latent_mse = torch.mean((latent - clean_latent) ** 2)
        latent_mse.backward()

        with torch.no_grad():
            candidate = delta + step_size * delta.grad.sign()
            candidate = dct_project(candidate, mask, basis, torch)
            max_absolute = candidate.abs().amax(dim=(1, 2, 3), keepdim=True).clamp_min(1e-12)
            candidate = candidate * torch.minimum(torch.ones_like(max_absolute), epsilon / max_absolute)
            delta.copy_(candidate)
            delta.grad.zero_()

        if iteration == 1 or iteration == args.iterations or iteration % 10 == 0:
            history.append({
                "iteration": iteration,
                "latentMse": float(latent_mse.detach().cpu()),
                "maximumPixelDelta": float((delta.detach().abs().amax() * 255.0).cpu()),
            })
            print(
                f"[grain-vae-research] iteration={iteration}/{args.iterations} "
                f"latent_mse={history[-1]['latentMse']:.8f} "
                f"max_delta={history[-1]['maximumPixelDelta']:.3f}",
                flush=True,
            )

    protected = (clean + delta.detach()).clamp(-1, 1)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    image_from_tensor(protected).save(args.out)

    absolute_delta = (protected - clean).abs()
    mse = torch.mean((protected - clean) ** 2)
    psnr = float(20 * torch.log10(torch.tensor(2.0, device=device) / torch.sqrt(mse.clamp_min(1e-12))).cpu())
    with torch.no_grad():
        final_latent_mse = float(torch.mean((vae.encode(protected).latent_dist.mean - clean_latent) ** 2).cpu())

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "kind": "research-only-vae-guided-dct-baseline",
        "model": args.model,
        "device": device,
        "torchVersion": torch.__version__,
        "pythonVersion": platform.python_version(),
        "input": str(args.input),
        "output": str(args.out),
        "settings": {
            "resolution": args.resolution,
            "epsilon8Bit": args.epsilon,
            "stepSize8Bit": args.step_size,
            "iterations": args.iterations,
            "coefficientsPerBlock": args.coefficients_per_block,
            "dctPositions": [list(position) for position in MID_BAND_POSITIONS[: args.coefficients_per_block]],
        },
        "metrics": {
            "maximumPixelDelta8Bit": float((absolute_delta.amax() * 255.0).cpu()),
            "meanPixelDelta8Bit": float((absolute_delta.mean() * 255.0).cpu()),
            "psnrDb": psnr,
            "latentMse": final_latent_mse,
            "runtimeSeconds": round(time.perf_counter() - started_at, 3),
        },
        "history": history,
        "claimBoundary": [
            "This optimization targets only the named VAE and configuration.",
            "It is research-only and never runs in the production GRAIN compiler.",
            "A latent shift does not prove that an edit is blocked or that the result transfers to another model.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(args.out)
    print(args.report)


if __name__ == "__main__":
    main()
