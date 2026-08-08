# GRAIN Backend

Local image-protection service for the GRAIN frontend.

## Run

```bash
npm install
npm run dev
```

The server listens at `http://127.0.0.1:8787`.

## What It Does

`POST /api/protect` accepts one image and runs the deterministic GRAIN image compiler.

Current compiler stages:

- deterministic RGBA normalization
- saliency-weighted bounded perturbation
- mid-frequency block-basis modulation
- invisible consent carrier
- semantic mesh carrier
- visible consent frame mode
- metadata intent
- PNG or high-quality JPEG export
- versioned metrics

This is real image processing, not a placeholder. It is still not a universal guarantee against every closed AI model. Use it as a current-model resistance layer and benchmark it against the specific systems you care about.

## Documentation

- `docs/architecture.md`
- `docs/literature-review.md`
- `docs/threat-model.md`
- `docs/benchmark-protocol.md`
- `docs/research-notes.md`
- `docs/experiments.md`
