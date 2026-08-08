"""Research-only guided InstructPix2Pix U-Net DCT optimization baseline.

This is a model-specific research experiment inspired by the early-timestep
objective in DiffusionGuard. It follows InstructPix2Pix's three-way classifier
free guidance path so that the research target includes the edit prompt rather
than a prompt-free U-Net response. It is not part of GRAIN's deterministic
production compiler and must never be exposed via the HTTP API.
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
        description="Research-only early-denoising U-Net DCT optimization."
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
    parser.add_argument("--step-size", type=float, default=0.25,
                        help="Projected-gradient step in 8-bit values.")
    parser.add_argument("--iterations", type=int, default=80)
    parser.add_argument("--coefficients-per-block", type=int, default=4)
    parser.add_argument("--denoising-steps", type=int, default=4)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--prompt", required=True,
                        help="Exact edit prompt targeted by this research-only candidate.")
    parser.add_argument("--guidance-scale", type=float, default=7.5)
    parser.add_argument("--image-guidance-scale", type=float, default=1.5)
    parser.add_argument("--objective", choices=["divergence", "noise-norm"], default="divergence")
    parser.add_argument("--loss-scale", type=float, default=1000000.0,
                        help="Gradient scaling for half-precision research runs.")
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

    if args.epsilon <= 0 or args.step_size <= 0 or args.iterations <= 0 or args.denoising_steps <= 0:
        raise ValueError("epsilon, step-size, iterations, and denoising-steps must be positive.")
    if not 1 <= args.coefficients_per_block <= len(MID_BAND_POSITIONS):
        raise ValueError(f"coefficients-per-block must be 1 through {len(MID_BAND_POSITIONS)}.")

    import torch
    from PIL import Image, ImageOps
    from diffusers import EulerAncestralDiscreteScheduler, StableDiffusionInstructPix2PixPipeline

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but torch.cuda.is_available() is false.")
    device = "cuda" if args.device == "auto" and torch.cuda.is_available() else args.device
    if device == "auto":
        device = "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    source = ImageOps.fit(
        Image.open(args.input).convert("RGB"),
        (args.resolution, args.resolution),
        method=Image.Resampling.LANCZOS,
    )
    clean = tensor_from_image(source, torch).to(device=device, dtype=dtype)
    started_at = time.perf_counter()

    pipeline = StableDiffusionInstructPix2PixPipeline.from_pretrained(
        args.model,
        cache_dir=str(args.cache_dir) if args.cache_dir else None,
        torch_dtype=dtype,
        use_safetensors=True,
    ).to(device)
    pipeline.scheduler = EulerAncestralDiscreteScheduler.from_config(pipeline.scheduler.config)
    pipeline.vae.eval()
    pipeline.unet.eval()
    pipeline.text_encoder.eval()
    for module in (pipeline.vae, pipeline.unet, pipeline.text_encoder):
        for parameter in module.parameters():
            parameter.requires_grad_(False)

    tokens = pipeline.tokenizer(
        args.prompt,
        padding="max_length",
        max_length=pipeline.tokenizer.model_max_length,
        return_tensors="pt",
    )
    with torch.no_grad():
        text_embeddings = pipeline.text_encoder(tokens.input_ids.to(device))[0].detach()

    pipeline.scheduler.set_timesteps(args.denoising_steps, device=device)
    timestep = pipeline.scheduler.timesteps[0].long()
    generator = torch.Generator(device=device).manual_seed(args.seed)
    latent_height = args.resolution // pipeline.vae_scale_factor
    latent_width = args.resolution // pipeline.vae_scale_factor
    latent_channels = pipeline.vae.config.latent_channels
    noise_latents = torch.randn(
        (1, latent_channels, latent_height, latent_width),
        generator=generator,
        device=device,
        dtype=dtype,
    ) * pipeline.scheduler.init_noise_sigma

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
    scaling_factor = pipeline.vae.config.scaling_factor
    with torch.no_grad():
        empty_tokens = pipeline.tokenizer(
            "",
            padding="max_length",
            max_length=pipeline.tokenizer.model_max_length,
            return_tensors="pt",
        )
        empty_embeddings = pipeline.text_encoder(empty_tokens.input_ids.to(device))[0].detach()
        guided_text_embeddings = torch.cat([
            text_embeddings,
            empty_embeddings,
            empty_embeddings,
        ])
        clean_image_latents = pipeline.vae.encode(clean).latent_dist.mode() * scaling_factor
        clean_noise_prediction = None

    delta = torch.zeros_like(clean)
    history = []

    def guided_noise_prediction(image_latents):
        conditional_images = torch.cat([
            image_latents,
            image_latents,
            torch.zeros_like(image_latents),
        ])
        conditional_noise = torch.cat([noise_latents] * 3)
        model_input = pipeline.scheduler.scale_model_input(conditional_noise, timestep)
        model_input = torch.cat([model_input, conditional_images], dim=1)
        raw_prediction = pipeline.unet(
            model_input,
            timestep,
            encoder_hidden_states=guided_text_embeddings,
        ).sample
        text_prediction, image_prediction, unconditional_prediction = raw_prediction.chunk(3)
        return (
            unconditional_prediction
            + args.guidance_scale * (text_prediction - image_prediction)
            + args.image_guidance_scale * (image_prediction - unconditional_prediction)
        )

    with torch.no_grad():
        clean_noise_prediction = guided_noise_prediction(clean_image_latents).detach()

    for iteration in range(1, args.iterations + 1):
        delta = delta.detach().requires_grad_(True)
        protected = (clean + delta).clamp(-1, 1)
        image_latents = pipeline.vae.encode(protected).latent_dist.mode() * scaling_factor
        noise_prediction = guided_noise_prediction(image_latents)
        prediction_divergence = torch.mean(
            (noise_prediction.float() - clean_noise_prediction.float()) ** 2
        )
        raw_objective = -prediction_divergence if args.objective == "divergence" else -noise_prediction.float().norm(p=2)
        objective = raw_objective * args.loss_scale
        gradient = torch.autograd.grad(objective, delta)[0]

        with torch.no_grad():
            candidate = delta - step_size * gradient.sign()
            candidate = dct_project(candidate, mask, basis, torch)
            max_absolute = candidate.abs().amax(dim=(1, 2, 3), keepdim=True).clamp_min(1e-12)
            candidate = candidate * torch.minimum(torch.ones_like(max_absolute), epsilon / max_absolute)
            delta = candidate

        if iteration == 1 or iteration == args.iterations or iteration % 10 == 0:
            history.append({
                "iteration": iteration,
                "objective": float(raw_objective.detach().float().cpu()),
                "noisePredictionNorm": float(noise_prediction.norm(p=2).detach().float().cpu()),
                "noisePredictionMseFromClean": float(prediction_divergence.detach().float().cpu()),
                "gradientMeanAbsolute": float(gradient.detach().abs().float().mean().cpu()),
                "maximumPixelDelta": float((delta.detach().abs().amax().float() * 255.0).cpu()),
            })
            print(
                f"[grain-unet-research] iteration={iteration}/{args.iterations} "
                f"mse_from_clean={history[-1]['noisePredictionMseFromClean']:.8f} "
                f"max_delta={history[-1]['maximumPixelDelta']:.3f}",
                flush=True,
            )

    protected = (clean + delta.detach()).clamp(-1, 1)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    image_from_tensor(protected.float()).save(args.out)

    absolute_delta = (protected - clean).abs().float()
    mse = torch.mean((protected.float() - clean.float()) ** 2)
    psnr = float(20 * torch.log10(torch.tensor(2.0, device=device) / torch.sqrt(mse.clamp_min(1e-12))).cpu())

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "kind": "research-only-instruct-pix2pix-unet-dct-baseline",
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
            "denoisingSteps": args.denoising_steps,
            "seed": args.seed,
            "prompt": args.prompt,
            "guidanceScale": args.guidance_scale,
            "imageGuidanceScale": args.image_guidance_scale,
            "objective": args.objective,
            "lossScale": args.loss_scale,
            "dctPositions": [list(position) for position in MID_BAND_POSITIONS[: args.coefficients_per_block]],
        },
        "metrics": {
            "maximumPixelDelta8Bit": float((absolute_delta.amax() * 255.0).cpu()),
            "meanPixelDelta8Bit": float((absolute_delta.mean() * 255.0).cpu()),
            "psnrDb": psnr,
            "runtimeSeconds": round(time.perf_counter() - started_at, 3),
        },
        "history": history,
        "claimBoundary": [
            "This optimization targets only the named U-Net, scheduler, prompt, and seed.",
            "It is research-only and never runs in the production GRAIN compiler.",
            "A changed output does not prove that an edit is blocked or that the result transfers to another model.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(args.out)
    print(args.report)


if __name__ == "__main__":
    main()
