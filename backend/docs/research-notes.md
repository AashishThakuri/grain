# GRAIN Research Notes

This document separates implementation hypotheses and current evidence. The detailed source review is in `literature-review.md`; the adversary model is in `threat-model.md`; release and research gates are in `benchmark-protocol.md`. It is not a claim that GRAIN defeats all AI systems.

## Baseline Systems

### Glaze

Glaze protects artists by changing how style is represented to AI models while leaving art visually similar to humans. It is a useful baseline because it frames protection as model-layer disturbance rather than visible watermarking.

Strengths:

- targets style mimicry
- human-visible quality is prioritized
- mature public framing about limits

Weaknesses and bypass risk:

- mainly focused on style misuse, not every image editing workflow
- protection can be affected by preprocessing, compression, resizing, and adaptive attacks
- does not provide a universal guarantee

Compiler lesson:

GRAIN should not depend on a single visible or invisible layer. It should combine bounded signals across spatial, frequency-like, metadata, and evaluation stages.

Reference:

https://glaze.cs.uchicago.edu/what-is-glaze.html

### Nightshade

Nightshade focuses on poisoning training data so models learn incorrect associations. It is important conceptually but different from GRAIN because GRAIN protects a user image at export time.

Strengths:

- attacks model learning behavior
- prompt-specific poisoning is a strong research direction

Weaknesses and bypass risk:

- primarily training-time, not a direct runtime image-editing defense
- depends on whether protected images enter future training

Compiler lesson:

Runtime GRAIN should not pretend to be a training-data poisoner. It can borrow the idea of semantic intent but must implement deterministic image processing only.

Reference:

https://nightshade.cs.uchicago.edu/whatis.html

### PhotoGuard

PhotoGuard-style work is relevant because it studies protecting images against unauthorized edits using adversarial perturbations.

Strengths:

- directly relevant to image editing misuse
- treats malicious editing as the target threat

Weaknesses and bypass risk:

- adversarial defenses can be brittle against transformations and adaptive attacks
- white-box/transfer assumptions matter
- strong perturbations risk visible artifacts

Compiler lesson:

GRAIN needs transformation-aware benchmarking, not only one-shot output generation.

## Deterministic Techniques Considered

### High-Frequency Perturbation

How it works:

Small alternating local changes are added across channels.

Why it may help:

Vision models and diffusion pipelines can be sensitive to high-frequency changes after resizing or encoding.

Why it may fail:

JPEG compression, denoising, blur, and platform resizing may remove the signal.

Complexity:

O(width * height)

Current decision:

Included, but bounded to preserve visual quality.

### Mid-Frequency Block Basis

How it works:

Small cosine-basis fields are applied inside local blocks, inspired by DCT/JPEG structure.

Why it may help:

Mid-frequency content is more likely to survive ordinary compression than very high-frequency noise.

Why it may fail:

Heavy compression, denoising, or model preprocessing can still dampen it.

Complexity:

O(width * height)

Current decision:

Included as `mid-frequency-block-basis`.

### Saliency-Weighted Perturbation

How it works:

Deterministic heuristics estimate important regions using edges, center bias, luminance contrast, and skin-like color ranges.

Why it may help:

Identity edits often rely on subject, face, hair, skin, and clothing regions.

Why it may fail:

The heuristic can miss faces, non-human subjects, dark lighting, unusual skin tones, and important context outside the center.

Complexity:

O(width * height) with local neighbor reads.

Current decision:

Included. Future work should add non-ML geometric subject detection.

### Consent Bit Carrier

How it works:

A defensive phrase is encoded as selected parity changes in the blue channel.

Why it may help:

It creates a deterministic machine-readable carrier without visible text.

Why it may fail:

Compression, resizing, screenshotting, and channel noise can destroy parity.

Complexity:

O(width * height)

Current decision:

Included as an intent carrier, not as a guaranteed prompt injection.

### Metadata Intent

How it works:

EXIF metadata describes the desired protection policy.

Why it may help:

Some downstream systems may preserve or inspect metadata.

Why it may fail:

Most social platforms strip metadata.

Complexity:

O(1) beyond encoding.

Current decision:

Included as a weak supplementary signal only.

## Current Research Conclusion

The current compiler is an experimental signal-processing baseline, not a proven AI defense. Hidden Morse, parity, binary, or metadata messages are provenance carriers and are not expected to be decoded by ordinary image editors. Visible refusal layers are consent communication, not technical enforcement, and they violate the nearly imperceptible visual target.

The next compiler iteration must be selected by the benchmark protocol. It should prioritize transform-aware DCT and multiscale hypotheses, pass the visual gate, and then undergo direct model evaluation. Claims about specific AI systems require named, dated benchmark evidence and must not be invented.
