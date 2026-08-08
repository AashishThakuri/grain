# GRAIN Image Compiler Architecture

## Mission

GRAIN is a deterministic image protection compiler. It transforms an uploaded image into a visually close protected export while adding bounded mathematical signals that are intended to make downstream AI editing and image-to-image reuse less stable.

The runtime compiler does not use model inference, pretrained networks, LLMs, diffusion models, or generated perturbations.

## Current Compiler

Version: `0.8.0-benchmark-gated-baseline`

Implementation: `src/compiler/imageCompiler.js`

HTTP entry point: `src/server.js`

Pipeline stages:

1. `decode-rgba`
   Decode the uploaded image with EXIF rotation applied and normalize it to RGBA.

2. `saliency-estimation`
   Estimate likely important regions using deterministic local features: center weighting, edge strength, skin-like color heuristics, and luminance contrast.

3. `bounded-frequency-field`
   Add very small deterministic high-frequency and mid-frequency luma/chroma shifts. Each channel is clamped to a mode-specific maximum delta.

4. `mid-frequency-block-basis`
   Apply small DCT-like cosine basis patterns inside local blocks. This targets preprocessing pipelines that resize, compress, or aggregate local image structure.

5. `quantization-aware-dct`
   Optionally modify selected mid-band coefficients in an explicit 8 by 8 DCT using JPEG quality-scaled quantization steps. This is an internal deterministic research stage. It does not reproduce DCT-Shield's VAE-guided optimization.

6. `consent-bit-carrier`
   Encode a low-amplitude consent signal into blue-channel parity at selected deterministic positions. This is not visible text and should not visibly alter the image.

7. `directive-morse-carrier`
   Encode a consent/refusal directive into additional RGB parity positions, including a Morse-derived bitstream. This is a non-visible carrier, not a guaranteed model-control mechanism.

8. `semantic-visual-carrier`
   Optionally add low-contrast, repeated no-edit consent text and code-like markers into the image surface. This keeps the canvas size unchanged and gives OCR/vision systems semantic refusal context in the pixels.

9. `hard-refusal-layer`
   Optionally add large visible refusal text, center consent bands, and code blocks over the same canvas. This is the strongest readable mode because it does not rely on a hidden message.

10. `visible-consent-frame`
   Optionally add a readable no-edit consent frame outside the original photo area. This gives image-only systems a visible signal without masking the subject.

11. `metadata-intent`
   Add EXIF metadata describing the protection intent. This is only a weak signal because metadata can be stripped.

12. `quality-metrics`
   Report visible delta, weighted layer energy, PSNR, maximum channel delta, compiler version, stages, mode, and consent carrier status.

13. `encode-export`
   Export as PNG or high-quality JPEG.

## Mode Philosophy

`pixel` caps channel movement at one byte step so the export is visually matched to the original while still carrying a deterministic pixel-level signal.

`dct-research` enables the quantization-aware DCT candidate. It is retained for controlled external-model evaluation and is not the default because it did not improve normalized JPEG signal retention at matched distortion.

`light` prioritizes near-zero visual change with slightly more signal energy than `pixel`.

`strong` balances visible similarity and larger signal energy.

`resistance` increases multi-scale frequency and chroma stress for image-edit testing while staying bounded.

`pixel` is the default for the protection page because it is the only current mode that passed the initial multi-image visual-quality suite. Its AI-edit effectiveness is unverified.

`semantic-mesh` is the softer visible mode. It keeps the output dimensions unchanged while embedding faint no-edit consent instructions directly into the pixels.

`max` is the highest hidden stress mode and does not add visible identity masks, text, or extra borders.

`consent-frame` is optional. It keeps the photo area readable while adding a visible border-level refusal/consent instruction for systems that ignore metadata and hidden carriers.

## Why This Is Deterministic

The compiler seed is derived from the input image hash. The same input and settings produce the same protected output. There is no runtime randomness.

## Current Evidence

Automated tests prove:

- deterministic output for the same input and settings
- bounded visual delta on a synthetic sample
- versioned stage metrics are returned

The 2026-07-10 three-image visual suite found:

- `pixel`: 3 of 3 visual-quality passes; mean SSIM `0.998800`; mean Delta E 76 `0.333630`; mean PSNR `54.51 dB`.
- `resistance`: 0 of 3 visual-quality passes.
- `max`: 0 of 3 visual-quality passes.
- `dct-research`: 3 of 3 visual-quality passes; mean SSIM `0.993839`; mean Delta E 76 `0.442801`; mean PSNR `49.29 dB`.

The DCT candidate retained more absolute difference after JPEG 75 because it added more initial signal, but its normalized retention was lower than `pixel`. It remains an experiment rather than a proven improvement.

Reports:

- `reports/benchmark-suite-2026-07-10.json`
- `reports/benchmark-suite-dct-candidate-2026-07-10.json`

Endpoint tests have shown the backend returns protected image files with metrics.

Local benchmark on `frontend/public/img/aesthetic-01.jpg` using `pixel` mode and PNG export:

- visible delta: `0.12 channel avg`
- maximum channel delta: `1.00`
- PSNR: `57.43 dB`
- luminance correlation: `0.999999`
- identity carrier agreement before compression: `1.0`

Report file: `reports/local-benchmark-pixel-aesthetic-01.json`

Local benchmark on the same image using `resistance` mode and PNG export:

- visible delta: `1.21 channel avg`
- maximum channel delta: `10.00`
- PSNR: `43.51 dB`
- luminance correlation: `0.999516`
- identity carrier agreement before compression: `1.0`

Report file: `reports/local-benchmark-resistance-aesthetic-01.json`

Local benchmark on the same image using `max` mode, PNG export, and directive carrier:

- visible delta: `1.89 channel avg`
- maximum channel delta: `16.00`
- PSNR: `39.84 dB`
- luminance correlation: `0.998821`
- consent carrier agreement before compression: `1.0`
- embedded metadata text was present in the encoded PNG buffer

Report file: `reports/local-benchmark-max-directive-aesthetic-01.json`

Endpoint test on the same image using `consent-frame` mode and PNG export:

- compiler version: `0.6.0-semantic-mesh-carrier`
- visible delta inside the photo area: `1.89 channel avg`
- output dimensions: `1062 x 1062`
- consent signal: `visible consent frame + metadata + rgb directive carrier`

The center image remains readable; the added frame carries visible no-edit consent language.

Endpoint test on the same image using `semantic-mesh` mode and PNG export:

- compiler version at the time of that test: `0.7.0-hard-refusal-layer`
- output dimensions remained `900 x 900`
- consent signal: `semantic mesh + metadata + rgb directive carrier`

The export stays the same size as the source and embeds faint consent text/code markers into the image surface.

Automated test for `hard-refusal` confirms the output remains the same dimensions as the source and reports:

`hard refusal layer + semantic mesh + metadata + rgb directive carrier`

## Current Limitations

The compiler has been evaluated against one named open image editor. Manual
ChatGPT and Gemini tests reported by the user still completed requested edits.
There is no reproducible closed-commercial benchmark or evidence that any mode
blocks those systems.

The current saliency estimator is heuristic. It does not perform face detection or segmentation because the runtime compiler must remain non-ML.

Metadata is useful for intent but not robust because many platforms strip it.

Directive carriers may be ignored by image-only models that do not read metadata or decode hidden bitstreams.

Pixel-safe perturbations may be too weak against some models, while stronger perturbations become visible. This is the main trade-off.

Visible consent frames communicate the owner's intent but can be ignored or
cropped. They are not a cryptographic or universal block.

Semantic mesh is a visual consent carrier. It cannot force a closed model to
obey a message that its policy or pipeline ignores, and no current result shows
that it blocks a named editor.

Hard refusal is the most visually explicit consent mode in this compiler. It is
not the strongest proven protection mode, because even visible text cannot force
an independent model to obey image-borne instructions.
