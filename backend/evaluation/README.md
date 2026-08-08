# External Model Evaluation

This folder is deliberately separate from the production compiler. Production protection remains deterministic and model-free. The evaluator may use pretrained models only to measure efficacy.

Use only images you own or have explicit permission to evaluate.

## Prepare Matched Inputs

```powershell
node src\cli\prepare-model-benchmark.js ..\frontend\public\img\aesthetic-01.jpg --modes=pixel,dct-research --limit=1 --out-dir=reports\model-benchmark-inputs
```

This creates one clean control and one export per compiler mode, with the same prompt set and seeds in a versioned manifest.

## Windows GPU Environment on D Drive

The local C drive does not have enough free space for the CUDA runtime and model cache. Keep both on D:

```powershell
uv venv D:\grain-eval-env --python 3.10
uv pip install --python D:\grain-eval-env\Scripts\python.exe torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu126
uv pip install --python D:\grain-eval-env\Scripts\python.exe -r evaluation\requirements.txt
$env:HF_HOME = 'D:\grain-hf-cache'
```

The CUDA 12.6 command follows the official PyTorch package instructions. The evaluator uses model CPU offload to fit the RTX 4060's 8 GB VRAM.

## Validate Without Loading a Model

```powershell
D:\grain-eval-env\Scripts\python.exe evaluation\run_instruct_pix2pix.py --manifest reports\model-benchmark-inputs\manifest.json --out reports\instruct-pix2pix-smoke --dry-run
```

## Run a Smoke Evaluation

```powershell
$env:HF_HOME = 'D:\grain-hf-cache'
D:\grain-eval-env\Scripts\python.exe evaluation\run_instruct_pix2pix.py --manifest reports\model-benchmark-inputs\manifest.json --out reports\instruct-pix2pix-smoke --cache-dir D:\grain-hf-cache --steps 20 --max-runs 6
```

Remove `--max-runs` only after the smoke run succeeds. A full benchmark must preserve the generated `evaluation-report.json`, every output image, the compiler input manifest, model revision, prompts, seeds, and settings.

## Research-Only VAE-Guided DCT Baseline

`optimize_vae_dct.py` is an upper-bound research experiment, not a production
feature. It uses gradients from the named editor's VAE to maximize latent-space
change under a bounded, mid-frequency DCT perturbation. The HTTP backend and
the deterministic production compiler must never import or execute it.

```powershell
$env:HF_HOME = 'D:\grain-hf-cache'
$env:HUGGINGFACE_HUB_CACHE = 'D:\grain-hf-cache\hub'
D:\grain-eval-env\Scripts\python.exe evaluation\optimize_vae_dct.py `
  --input ..\frontend\public\img\aesthetic-01.jpg `
  --out D:\grain-eval-reports\vae-dct\aesthetic-01.png `
  --cache-dir D:\grain-hf-cache --device cuda --epsilon 2 --iterations 80
```

Evaluate the result with the same paired-editor runner before drawing any
conclusion. A VAE-targeted image can only be described as a result for the
exact named open model and settings; it cannot establish resistance against
ChatGPT, Gemini, or future editor architectures.

## Research-Only U-Net Denoising Baseline

`optimize_instruct_unet_dct.py` follows the stronger research direction of
optimizing an early denoising U-Net response instead of only moving the VAE
latent. It is also model-specific research code and must never be called by
the production backend.

```powershell
$env:HF_HOME = 'D:\grain-hf-cache'
$env:HUGGINGFACE_HUB_CACHE = 'D:\grain-hf-cache\hub'
D:\grain-eval-env\Scripts\python.exe evaluation\optimize_instruct_unet_dct.py `
  --input ..\frontend\public\img\aesthetic-01.jpg `
  --out D:\grain-eval-reports\unet-dct\aesthetic-01.png `
  --cache-dir D:\grain-hf-cache --device cuda --epsilon 2 --iterations 80
```

The output must pass the visual gate and then be evaluated through the same
model runner. It is a research upper bound, not a portable GRAIN protection
mode and not evidence of protection against ChatGPT or Gemini.

Official references:

- https://huggingface.co/docs/diffusers/api/pipelines/pix2pix
- https://huggingface.co/timbrooks/instruct-pix2pix
- https://huggingface.co/docs/diffusers/installation
- https://docs.pytorch.org/get-started/previous-versions/
