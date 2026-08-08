# GRAIN

GRAIN is a scroll-driven landing page for a photo-consent and provenance concept.

## Public release

The deployable application is the landing page in `frontend/`. The public build intentionally includes only `index.html`; the local image-processing workspace is not linked from the site and is not deployed to Vercel.

## Local development

```powershell
Set-Location frontend
npm install
npm run dev
```

The site runs at `http://127.0.0.1:5173`.

## Notes

The `backend/` directory is local research tooling. It is not a claim of universal protection against third-party AI image editors.
