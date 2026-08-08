# GRAIN Threat Model

Last reviewed: 2026-07-10

## Assets

- Human-recognizable identity and facial appearance.
- Clothing, body, pose, context, and scene integrity.
- Artistic style and authorship.
- Consent and provenance records.

## Protected Workflows

GRAIN evaluates four workflows separately:

1. Single-image instruction editing and inpainting.
2. Image-conditioned generation and identity-preserving generation.
3. Personalization or fine-tuning from one or more images.
4. Style learning or training-data ingestion.

A result in one workflow must not be generalized to another.

## Adversary Capabilities

The evaluator assumes an exploiter can:

- use any open or closed model;
- change model versions, encoders, samplers, prompts, and seeds;
- crop, resize, rotate, blur, sharpen, recolor, screenshot, or recompress the image;
- upscale or super-resolve the image;
- strip metadata;
- mix protected and clean images;
- run classical denoisers or model-based purification;
- inspect the compiler and adapt preprocessing to it.

This is a public-algorithm, no-secret-key threat model.

## Defender Constraints

- Production protection is deterministic and CPU compatible.
- Production protection cannot run ML inference or use pretrained models.
- The output should remain nearly imperceptible relative to the source.
- The same input, mode, and compiler version must produce the same output.

## Non-Goals

- Preventing a human from manually editing an image.
- Recalling clean copies that are already public.
- Cryptographically forcing an independent model provider to honor consent.
- Guaranteeing protection against every unknown model.
- Treating metadata or hidden messages as enforceable instructions.

## Required Claim Format

Every efficacy statement must name:

- compiler version and exact mode;
- source dataset and image count;
- model/provider and dated model version;
- task, prompt, mask, guidance, seed count, and output count;
- all preprocessing and purification steps;
- clean control and protected condition;
- quality metrics and edit-success metrics;
- confidence interval or repeated-run variability;
- known failures.

Without those fields, the output may be described only as a protected export hypothesis, not as proven AI-edit resistance.

