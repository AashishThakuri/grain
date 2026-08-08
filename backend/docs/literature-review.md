# GRAIN Literature Review

Last reviewed: 2026-07-10

## Scope and Claim Boundary

This review covers proactive image protections, attacks on those protections, image-editing architectures, deterministic signal processing, watermarking, and evaluation methods relevant to GRAIN.

The published evidence does not support a universal claim that an imperceptible perturbation can force every current or future image model to refuse or fail. Several papers show that common preprocessing and purification can remove or weaken protective perturbations. GRAIN therefore treats every compiler stage as a hypothesis until it is evaluated against a named model, model version, task, prompt set, seed set, and preprocessing threat model.

Production GRAIN may not run neural inference or optimize against a pretrained model. That excludes direct reproduction of most published adversarial protections, which depend on gradients from a VAE, UNet, CLIP-like encoder, face recognizer, or diffusion process. Those systems remain essential evaluation baselines.

## Protection Systems

### PhotoGuard

Source: [PhotoGuard paper and code](https://github.com/MadryLab/photoguard)

Mechanism:

- Encoder attack moves the protected image's latent representation away from the clean representation.
- Diffusion attack optimizes the end-to-end editing process toward an unwanted target.

Strengths:

- Directly targets malicious image editing.
- Establishes latent-space and end-to-end attack surfaces.

Failure modes:

- Depends on a known or transferable model.
- Preprocessing, model changes, masking, and purification can reduce transfer.
- Stronger optimization can increase visible artifacts and runtime.

Complexity:

- Multiple neural forward and backward passes per image; far above O(N) signal processing.

GRAIN decision:

- Evaluation baseline only. It cannot be part of the production compiler because it requires model inference and gradients.

### Glaze

Source: [Glaze paper](https://arxiv.org/abs/2302.04222)

Mechanism:

- Optimizes a visually bounded style cloak so a model learns a misleading style representation.

Strengths:

- Targets style mimicry rather than generic corruption.
- Includes artist studies and adaptive evaluations.

Failure modes:

- Targets training and style learning, not every single-image edit path.
- Later work shows upscaling and other preprocessing can substantially weaken protection.

Complexity:

- Neural feature extraction and iterative optimization.

GRAIN decision:

- Training-time baseline only. Do not describe deterministic pixel patterns as equivalent to Glaze.

### Nightshade

Source: [Nightshade paper](https://arxiv.org/abs/2310.13828)

Mechanism:

- Prompt-specific training-data poisoning makes a text-to-image model learn incorrect concept associations.

Strengths:

- Attacks model learning at concept level.
- Demonstrates effects from a comparatively small number of poison samples under its evaluated setup.

Failure modes:

- Only applies when images enter training.
- Does not block a model from editing a single uploaded image.
- Requires optimization against model representations.

Complexity:

- Iterative model-guided optimization plus downstream training evaluation.

GRAIN decision:

- Out of scope for runtime protection. Keep separate from single-image editing claims.

### Anti-DreamBooth

Source: [Anti-DreamBooth paper](https://openaccess.thecvf.com/content/ICCV2023/papers/Van_Le_Anti-DreamBooth_Protecting_Users_from_Personalized_Text-to-image_Synthesis_ICCV_2023_paper.pdf)

Mechanism:

- Uses bilevel min-max optimization to perturb user photos so personalized diffusion fine-tuning becomes less useful.

Strengths:

- Directly studies face personalization and multiple diffusion configurations.

Failure modes:

- Sensitive to training method, model version, clean/protected mixture, preprocessing, and purification.
- It is not a single-image feed-forward editing defense.

Complexity:

- Expensive nested optimization involving diffusion fine-tuning.

GRAIN decision:

- Personalization benchmark baseline only.

### Mist

Source: [Mist paper](https://arxiv.org/abs/2305.12683)

Mechanism:

- Combines adversarial losses to improve transfer across diffusion-based imitation methods.

Strengths:

- Explicitly studies cross-method transfer and purification.

Failure modes:

- Remains model-guided and can be weakened by stronger or adaptive purification.

Complexity:

- Iterative neural optimization.

GRAIN decision:

- Evaluation baseline only.

### Distraction Is All You Need

Source: [CVPR 2024 paper](https://openaccess.thecvf.com/content/CVPR2024/html/Lo_Distraction_is_All_You_Need_Memory-Efficient_Image_Immunization_against_Diffusion-Based_CVPR_2024_paper.html)

Mechanism:

- Perturbs cross-attention behavior and uses timestep-universal updates to disrupt semantic edit localization.

Strengths:

- Targets editing rather than only training.
- Reduces memory compared with end-to-end image-space objectives.

Failure modes:

- Depends on access to a representative diffusion architecture.
- Transfer to closed multimodal editors is not guaranteed.

Complexity:

- Repeated neural forward/backward passes across timesteps.

GRAIN decision:

- Editing benchmark baseline only.

### DCT-Shield

Source: [ICCV 2025 paper](https://openaccess.thecvf.com/content/ICCV2025/html/Bala_DCT-Shield_A_Robust_Frequency_Domain_Defense_against_Malicious_Image_Editing_ICCV_2025_paper.html)

Mechanism:

- Runs the JPEG encode path through RGB-to-YCbCr conversion, chroma handling, 8 by 8 DCT, and quantization.
- Adds bounded perturbations after quantization so gradients are not zeroed by the quantizer.
- Optimizes those coefficients with projected gradient descent against a VAE latent objective. The reported default uses JPEG quality 0.95, a coefficient bound of 1, step size 0.1, and 1,000 iterations on 512 by 512 images.
- Includes mask-aware and Y-channel variants for different edit and compression conditions.

Strengths:

- Directly addresses JPEG purification.
- Motivates frequency-domain placement instead of arbitrary pixel noise.

Failure modes:

- The perturbation is still model-optimized; DCT placement alone is not evidence of adversarial effectiveness.
- Other purification, resynthesis, cropping, or architecture changes remain threats.

Complexity:

- DCT transforms plus iterative neural optimization.

GRAIN decision:

- Adopt DCT-aware deterministic placement and JPEG simulation as hypotheses. A coefficient must cross at least one quantization level to survive that quantizer, but the resulting spatial reconstruction must still pass GRAIN's visual gate.
- Do not claim DCT-Shield effectiveness without its VAE-guided objective. Deterministic coefficient placement is not equivalent to the published method.

### Newer Robustness-Oriented Defenses

Relevant sources:

- [StyleGuard](https://arxiv.org/abs/2505.18766)
- [High-Frequency Anti-DreamBooth](https://arxiv.org/abs/2409.08167)
- [AntiPure, ICCV 2025](https://openaccess.thecvf.com/content/ICCV2025/html/Yang_Towards_Robust_Defense_against_Customization_via_Protective_Perturbation_Resistant_to_ICCV_2025_paper.html)
- [Edit Away and My Face Will Not Stay, CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/html/Wang_Edit_Away_and_My_Face_Will_not_Stay_Personal_Biometric_CVPR_2025_paper.html)

Shared lesson:

- Robustness improves when optimization includes purification, upscaling, identity objectives, or ensembles.
- All still rely on neural objectives during protection and therefore cannot be copied into the production constraints of this project.

## Attacks and Negative Results

### IMPRESS

Source: [NeurIPS 2023 paper](https://papers.nips.cc/paper_files/paper/2023/hash/222dda29587fbc2979ca99fd5ed00735-Abstract-Conference.html)

Finding:

- Diffusion reconstruction can identify and reduce inconsistencies introduced by imperceptible protective perturbations.

GRAIN implication:

- A local fidelity score and an intact hidden bitstream do not demonstrate protection. Purification must be part of evaluation.

### Practical Protective-Perturbation Evaluation and GrIDPure

Source: [CVPR 2024 paper](https://openaccess.thecvf.com/content/CVPR2024/html/Zhao_Can_Protective_Perturbation_Safeguard_Personal_Data_from_Being_Exploited_by_CVPR_2024_paper.html)

Finding:

- JPEG compression, Gaussian blur, mixed clean/protected training sets, different fine-tuning methods, and diffusion purification weaken multiple protections.
- The paper's practical threat model includes crop, compression, blur, unknown fine-tuning method, and explicit purification.

GRAIN implication:

- Every accepted experiment must include natural transformations and an adaptive purification plan.

### Adversarial Perturbations Cannot Reliably Protect Artists

Source: [ICLR 2025 paper](https://arxiv.org/abs/2406.12027)

Finding:

- Off-the-shelf upscaling and related preprocessing can bypass popular style protections in the evaluated mimicry setting.

GRAIN implication:

- Universal protection language is prohibited. The system may report only named, dated benchmark outcomes.

### FreqPure and Later Purification Work

Sources:

- [FreqPure, ICCV Workshops 2025](https://openaccess.thecvf.com/content/ICCV2025W/APAI/html/Ju_FreqPure_a_High-frequency_Preservation_Diffusion-based_Purification_Method_for_Protective_Perturbation_ICCVW_2025_paper.html)
- [Fragile by Design, AAAI 2026](https://ojs.aaai.org/index.php/AAAI/article/view/41170)

Finding:

- Purifiers increasingly preserve natural high-frequency detail while removing adversarial components.

GRAIN implication:

- A defense concentrated only in high frequencies is structurally fragile.

## Image-Editing Architecture Review

### Latent Diffusion

Source: [Latent Diffusion Models](https://arxiv.org/abs/2112.10752)

Relevant path:

1. The image is encoded into a lower-dimensional latent representation.
2. Noise is added or an inversion path estimates a latent/noise state.
3. A UNet denoises while text or other conditions enter through cross-attention.
4. A decoder reconstructs pixels.

Implication:

- Tiny pixel changes only matter if they survive the encoder and downstream preprocessing. Pixel parity and metadata are normally outside this path.

### SDEdit

Source: [SDEdit](https://arxiv.org/abs/2108.01073)

Relevant path:

- Noise is deliberately added before denoising. This naturally suppresses many fragile high-frequency signals.

### InstructPix2Pix

Source: [CVPR 2023 paper](https://openaccess.thecvf.com/content/CVPR2023/html/Brooks_InstructPix2Pix_Learning_To_Follow_Image_Editing_Instructions_CVPR_2023_paper.html)

Relevant path:

- A conditional diffusion network receives the input image and instruction directly and does not require per-image fine-tuning.

Implication:

- Training-time poisons and style cloaks do not automatically protect this feed-forward editing path.

### Image-Prompt and Multimodal Editors

Sources:

- [IP-Adapter](https://arxiv.org/abs/2308.06721)
- [SmartEdit](https://openaccess.thecvf.com/content/CVPR2024/html/Huang_SmartEdit_Exploring_Complex_Instruction-based_Image_Editing_with_Multimodal_Large_Language_CVPR_2024_paper.html)
- [InsightEdit](https://openaccess.thecvf.com/content/CVPR2025/html/Xu_InsightEdit_Towards_Better_Instruction_Following_for_Image_Editing_CVPR_2025_paper.html)

Implication:

- Modern systems can extract image features through separate encoders or multimodal reasoning paths. A perturbation that transfers to one Stable Diffusion VAE may fail on another visual encoder.

## Deterministic Signal-Processing Review

### Fourier and Spatial Frequency

Mechanism:

- A 2D Fourier transform decomposes an image into spatial frequencies and phases.

Potential value:

- Allows explicit placement across low, middle, and high frequencies.
- Supports measurement of which bands survive resize, blur, and compression.

Failure modes:

- High frequencies are removed by blur, resize, and denoising.
- Low frequencies are robust but quickly become visible.

Complexity:

- O(N log N) with an FFT; direct transforms are slower.

Decision:

- Add spectral measurements. Do not concentrate the compiler in one band.

### Block DCT and JPEG

Standards source: [ITU-T T.81 JPEG](https://www.itu.int/rec/T-REC-T.81)

Mechanism:

- JPEG converts color, commonly subsamples chroma, partitions the image into 8 by 8 blocks, transforms blocks with a DCT, quantizes coefficients, and entropy-codes the result.

Potential value:

- Mid-frequency coefficient placement can survive better than pixel parity and can be benchmarked against exact JPEG quality settings.

Failure modes:

- Quantization removes small coefficients; block alignment changes after crop or rescale; strong coefficients become visible.

Complexity:

- O(N) for fixed 8 by 8 blocks.

Decision:

- Retain DCT-aware experiments. Add explicit JPEG survival metrics and alignment attacks.

### Wavelets

Mechanism:

- Multiresolution wavelets split image content into low-frequency approximation and directional detail subbands.

Potential value:

- Enables scale-aware placement and can distribute a signal across resolution levels.

Failure modes:

- Detail bands are vulnerable to denoising; approximation-band changes are visible.

Complexity:

- O(N) for separable Haar or lifting implementations.

Decision:

- Candidate deterministic stage. It must first beat the DCT baseline under the same visual gate.

### Perceptual Hashing and Handcrafted Features

Mechanism:

- pHash uses low-frequency DCT comparisons; HOG summarizes local gradient orientation.

Potential value:

- They are deterministic proxies for coarse structure and preprocessing stability.

Failure modes:

- Modern model features are learned and are not equivalent to pHash or HOG.

Complexity:

- O(N) after fixed-size reduction.

Decision:

- Use only as diagnostics. Feature drift is a hypothesis, not AI efficacy evidence.

### Image Statistics and Quality Metrics

Source: [SSIM paper](https://ece.uwaterloo.ca/~z70wang/publications/ssim.html)

Metrics selected:

- PSNR for signal magnitude.
- Windowed SSIM for local structural fidelity.
- CIELAB Delta E 76 for color drift.
- pHash distance for coarse low-frequency drift.
- HOG cosine similarity for edge/shape drift.

Failure modes:

- No single metric equals human judgment. A user study or expert visual review remains necessary for release candidates.

### Watermarking and Provenance

Relevant source: [C2PA specification](https://c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html)

Mechanism:

- Signed provenance manifests describe origin and edits. Invisible watermarks encode detection signals.

Potential value:

- Supports attribution, evidence, and platform cooperation.

Failure modes:

- Provenance does not technically prevent editing.
- Metadata can be stripped, and generative reconstruction can remove invisible watermarks.

Decision:

- Treat provenance as a separate product layer. It should never be reported as edit prevention.

## Synthesis for GRAIN

Accepted principles:

1. Separate single-image editing, personalization, style learning, and training-data poisoning threat models.
2. Optimize deterministic stages for transform survival, not for self-decoding on the pristine export.
3. Keep perturbations distributed across scales and color/luminance channels under a strict visual gate.
4. Treat pHash, HOG, DCT, and carrier metrics as diagnostics only.
5. Require direct model evaluation for every protection claim.
6. Include JPEG, resize, crop, blur, screenshot, upscaling, and purification in evaluation.
7. Record failures and reject any stage that does not improve model outcomes at matched visual quality.

Rejected claims:

- Hidden text, Morse, emoji, binary, EXIF, or parity bits are not guaranteed model instructions.
- A visible refusal sentence cannot force a closed model to obey.
- A deterministic transform that has not been tested against a model is not an adversarial defense yet.

## Closed-Model Boundary and Provider Cooperation

OpenAI documents that ChatGPT Images accepts an uploaded image and a text
instruction to edit it. That behavior matches the manual ChatGPT tests and is
not controlled by image metadata or untrusted pixel-carried text.

Sources:

- [Images in ChatGPT](https://help.openai.com/en/articles/11084440-chatgpt-image-library)
- [ChatGPT image inputs](https://help.openai.com/en/articles/8400551-chatgpt-image-inputs-faq)

Provider-recognized provenance can support later verification, but it is not a
technical refusal mechanism. C2PA uses signed manifests for provenance and
tamper evidence; OpenAI and Google describe C2PA and SynthID in the context of
identifying content, not preventing a third-party model from editing an input.

Sources:

- [C2PA technical specification](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html)
- [OpenAI C2PA in ChatGPT Images](https://help.openai.com/en/articles/8912793-c2pa-in-dall-e-3)
- [Google SynthID](https://deepmind.google/models/synthid/)

Therefore a credible production architecture must separate three claims:

1. Deterministic pixel processing can preserve a visual match and carry a
   non-binding signal.
2. Signed provenance can support evidence and downstream verification.
3. Preventing a closed model from editing a public image requires the model
   provider to recognize and enforce a verified policy, or requires not exposing
   the original pixels through access-controlled delivery.

The current GRAIN compiler only implements the first claim. It must not present
the result as a universal adversarial block.
