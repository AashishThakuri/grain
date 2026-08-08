import argparse
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run matched clean/protected InstructPix2Pix evaluations."
    )
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--model", default="timbrooks/instruct-pix2pix")
    parser.add_argument("--revision", default=None)
    parser.add_argument("--cache-dir", type=Path, default=None)
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--guidance-scale", type=float, default=7.5)
    parser.add_argument("--image-guidance-scale", type=float, default=1.5)
    parser.add_argument("--resolution", type=int, default=512)
    parser.add_argument("--max-runs", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def load_manifest(path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != 1:
        raise ValueError("Unsupported manifest schemaVersion.")
    if not payload.get("cases"):
        raise ValueError("Manifest contains no benchmark cases.")
    return payload


def enumerate_runs(manifest):
    for case in manifest["cases"]:
        for prompt in case["prompts"]:
            for seed in case["seeds"]:
                # Keep clean and protected conditions adjacent so a bounded smoke
                # run cannot accidentally evaluate only one side of the comparison.
                for condition in case["conditions"]:
                    image_path = Path(condition["image"])
                    if not image_path.is_file():
                        raise FileNotFoundError(
                            f"Missing condition image: {image_path}"
                        )
                    yield {
                        "caseId": case["id"],
                        "conditionId": condition["id"],
                        "conditionKind": condition["kind"],
                        "image": image_path,
                        "promptId": prompt["id"],
                        "promptFamily": prompt["family"],
                        "instruction": prompt["instruction"],
                        "seed": int(seed),
                    }


def main():
    args = parse_args()
    args.manifest = args.manifest.resolve()
    args.out = args.out.resolve()
    if args.cache_dir:
        args.cache_dir = args.cache_dir.resolve()
    manifest = load_manifest(args.manifest)
    runs = list(enumerate_runs(manifest))
    if args.max_runs > 0:
        runs = runs[: args.max_runs]

    if args.dry_run:
        print(json.dumps({
            "valid": True,
            "plannedRuns": len(runs),
            "model": args.model,
            "manifestCompilerVersion": manifest.get("compilerVersion"),
        }, indent=2))
        return

    args.out.mkdir(parents=True, exist_ok=True)

    import torch
    import diffusers
    import transformers
    from PIL import Image, ImageOps
    from diffusers import (
        EulerAncestralDiscreteScheduler,
        StableDiffusionInstructPix2PixPipeline,
    )

    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but torch.cuda.is_available() is false.")
    device = "cuda" if args.device == "auto" and torch.cuda.is_available() else args.device
    if device == "auto":
        device = "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    pipeline = StableDiffusionInstructPix2PixPipeline.from_pretrained(
        args.model,
        revision=args.revision,
        cache_dir=str(args.cache_dir) if args.cache_dir else None,
        torch_dtype=dtype,
        use_safetensors=True,
    )
    pipeline.scheduler = EulerAncestralDiscreteScheduler.from_config(
        pipeline.scheduler.config
    )
    if device == "cuda":
        pipeline.enable_model_cpu_offload()
    else:
        pipeline.to(device)
    pipeline.set_progress_bar_config(desc="GRAIN model evaluation")

    results = []
    started_at = time.perf_counter()

    for index, run in enumerate(runs, start=1):
        output_directory = (
            args.out
            / run["caseId"]
            / run["conditionId"]
            / run["promptId"]
        )
        output_directory.mkdir(parents=True, exist_ok=True)
        output_path = output_directory / f"seed-{run['seed']}.png"
        image = Image.open(run["image"]).convert("RGB")
        image = ImageOps.fit(
            image,
            (args.resolution, args.resolution),
            method=Image.Resampling.LANCZOS,
        )
        generator_device = "cuda" if device == "cuda" else "cpu"
        generator = torch.Generator(device=generator_device).manual_seed(run["seed"])
        run_started_at = time.perf_counter()
        print(
            f"[grain-eval] {index}/{len(runs)} case={run['caseId']} "
            f"condition={run['conditionId']} prompt={run['promptId']} seed={run['seed']}",
            flush=True,
        )

        try:
            output = pipeline(
                prompt=run["instruction"],
                image=image,
                num_inference_steps=args.steps,
                guidance_scale=args.guidance_scale,
                image_guidance_scale=args.image_guidance_scale,
                generator=generator,
            ).images[0]
            output.save(output_path)
            results.append({
                **{key: value for key, value in run.items() if key != "image"},
                "inputImage": str(run["image"].resolve()),
                "outputImage": str(output_path.resolve()),
                "runtimeSeconds": round(time.perf_counter() - run_started_at, 3),
                "status": "complete",
            })
        except Exception as error:
            results.append({
                **{key: value for key, value in run.items() if key != "image"},
                "inputImage": str(run["image"].resolve()),
                "outputImage": None,
                "runtimeSeconds": round(time.perf_counter() - run_started_at, 3),
                "status": "failed",
                "error": str(error),
            })

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": args.model,
        "revision": args.revision,
        "device": device,
        "torchVersion": torch.__version__,
        "diffusersVersion": diffusers.__version__,
        "transformersVersion": transformers.__version__,
        "pythonVersion": platform.python_version(),
        "compilerVersion": manifest.get("compilerVersion"),
        "settings": {
            "steps": args.steps,
            "guidanceScale": args.guidance_scale,
            "imageGuidanceScale": args.image_guidance_scale,
            "resolution": args.resolution,
        },
        "claimBoundary": (
            "These outputs are evidence for this exact model and configuration only. "
            "They do not establish universal protection."
        ),
        "totalRuntimeSeconds": round(time.perf_counter() - started_at, 3),
        "results": results,
    }
    report_path = args.out / "evaluation-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(report_path.resolve())


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"[grain-eval] fatal: {error}", file=sys.stderr)
        raise
