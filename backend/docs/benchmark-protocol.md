# GRAIN Benchmark Protocol

Last reviewed: 2026-07-10

## Gate A: Determinism and Engineering

Required:

- Byte-identical output for identical input, mode, format, and compiler version.
- No neural inference or network call in the production compiler.
- Bounded memory and input-pixel limit.
- Valid PNG and JPEG outputs.
- Stage-level timing and versioned configuration.

## Gate B: Visual Fidelity

Default release thresholds on the identity transform:

- PSNR at least 40 dB.
- Windowed SSIM at least 0.99.
- Mean Delta E 76 at most 1.5.
- pHash Hamming distance at most 6 of 64 bits.

These metrics are necessary but not sufficient. Final candidates also require side-by-side visual review at 100 percent and 400 percent zoom on calibrated displays.

HOG cosine similarity is reported as a handcrafted feature-drift diagnostic, not a visual-fidelity gate. Small imperceptible changes can alter gradients in flat regions, which is precisely why HOG must not be treated as a human-perception metric.

## Gate C: Distribution Robustness

Evaluate both source and protected image through the same transform:

- JPEG quality 95, 75, and 50.
- WebP quality 90 and 70.
- Resize to 75 and 50 percent.
- Center crop to 90 percent.
- Gaussian blur sigma 0.5 and 1.2.
- Screenshot-like downscale, 4:2:0 JPEG encode, and upscale.

Future required transforms:

- crop then realign;
- rotation and perspective correction;
- sharpen and denoise;
- platform-specific Instagram, WhatsApp, TikTok, LinkedIn, and browser screenshot profiles;
- classical and diffusion-based purification.

Gate C measures whether the compiler's signal survives transformations. It does not prove that an AI editor is affected.

## Gate D: AI Editing Efficacy

For each named model and model version:

1. Select at least 20 diverse source images with consent for testing.
2. Use at least five edit families: identity change, clothing change, context replacement, style transfer, and object insertion/removal.
3. Run clean and protected conditions with matched prompts and at least ten seeds where the model exposes seeds.
4. Repeat after JPEG 75, resize 50 percent, crop 90 percent, screenshot roundtrip, and the strongest available purification.
5. Score prompt adherence, source identity retention, unintended artifacts, background preservation, and human-rated edit success.
6. Keep raw outputs and immutable manifests.

Predefined research target:

- Visual Gate B passes.
- Median protected edit-success rate is at most 70 percent of the clean control across at least three open model families.
- The reduction remains statistically directionally consistent after JPEG 75, resize 50 percent, and screenshot roundtrip.
- No evaluated model family regresses by more than five percentage points relative to the previous compiler version.

This target is a research gate, not a promise to users. Closed-model results apply only to the dated model version tested.

### Current Failed Baselines

The following candidates are explicitly rejected as protection claims:

- Hidden directives, metadata, Morse, parity bits, and emoji-derived carriers:
  they are not trusted instructions to a model.
- Deterministic DCT candidates: visual gates passed, but matched open-model
  tests still completed the requested edits.
- Prompt-targeted U-Net DCT research: it changed some InstructPix2Pix outputs
  but did not consistently prevent the requested edit; the upper-bound result
  failed fidelity and triggered a model safety checker.

An output difference, an internal carrier-decoding score, or a model safety
filter must never be reported as a blocked edit. A release claim needs task-level
review showing that the requested edit failed while the clean control succeeds.

## Gate E: Personalization and Training

Evaluate separately against DreamBooth, LoRA, Textual Inversion, and at least one image-adapter path. Include mixed clean/protected ratios of 0, 20, 50, 80, and 100 percent protected images.

Record identity similarity, prompt adherence, generated-image quality, and failure rate. Do not mix these outcomes with single-image editing results.

## Current Local Benchmark

Run one image:

```bash
npm run benchmark -- ../frontend/public/img/aesthetic-01.jpg --mode=pixel --format=png --out=reports/example.json
```

Run a suite:

```bash
npm run benchmark:suite -- ../frontend/public/img --modes=pixel,resistance,max --limit=3 --out=reports/suite.json
```

The local suite currently covers Gates A through C only. Gate D and Gate E require external model evaluation.

## DCT Candidate Sweep

The DCT candidate set is deliberately evaluated as named conditions rather than silently changing the user-facing mode:

```bash
npm run benchmark:prepare -- ../frontend/public/img/aesthetic-01.jpg --dct-variants=evaluation/dct-variants.json --limit=1 --out-dir=reports/dct-model-inputs
```

Each manifest records the exact DCT quality target, coefficient strength, and number of modified coefficients. The saved manifest must accompany any model evaluation and score report. A result that changes an editor output is still not evidence that the requested edit was prevented; task-specific output review remains mandatory.

Run the visual and preprocessing gate first:

```bash
npm run benchmark:dct-variants -- ../frontend/public/img --variants=evaluation/dct-variants.json --limit=3 --out=reports/dct-variant-visual-report.json
```

Only variants passing the visual gate for every evaluated photo can progress to paired image-editor evaluation.
