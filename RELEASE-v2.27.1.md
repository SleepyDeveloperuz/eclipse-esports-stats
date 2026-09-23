# v2.27.1 — HEIC screenshot support

- Single-match admin/member uploads and Multi-match accept HEIC and HEIF.
- Up to 8 MiB HEIC input / 24 megapixels; locally converted to JPEG with a
  maximum 2560-pixel edge and 3 MiB output before the existing AI pipeline.
- Normal JPEG/PNG/WEBP uploads retain their previous paths and size limits.
- Automatic scan waits for both conversions; replacing an image discards stale
  work. Conversion errors preserve typed fields and never trigger a stale scan.
- Conversion is isolated in a same-origin worker with a 45-second timeout.
  The decoder loads only for HEIC. No CSP relaxation, third-party conversion
  service, database migration, AI provider changes or new review gates.
- Vendored unmodified CSP decoder from heic-to 1.5.2:
  `vendor/heic-to-1.5.2/libheif.js`, SHA-256
  `356068bb64947a76f1490ee139b2cab52f62e5e60d1945413aed9ab94c09e754`.
  Licenses and provenance are included in that directory.

## Verification

Focused upload/DOM tests cover paired conversion, stale replacements, failed
decoding, empty-MIME HEIF, cancellation, timeout and batch conversion. Existing
automatic OCR/hero/medal paths are included. A public libheif v1.22.2 HEIC sample
decoded to 1280 × 854 RGBA using the actual vendored decoder with dynamic code
generation and WebAssembly disabled. No browser QA or paid OCR calls were made.
The user's failing HEIC file has not been supplied, so that exact file is untested.

## Production deployment — 2026-09-18

Deployed and promoted after user approval to https://eclipse-esports-stats.vercel.app.
Deployment: `dpl_AgRPuvKwMjsDZjJmTAaAh7nebhXr` (READY).
Candidate: https://eclipse-esports-stats-h0opm8foe-khusniddindev-6696s-projects.vercel.app
All 301 local tests passed. Actual HEIC-to-JPEG conversion produced a valid
1280 × 854 JPEG (531,434 bytes). Deployment checks verify exact source hashes
for the HTML, upload scripts, worker, decoder and license files; JavaScript
MIME types, unchanged strict CSP and anonymous API access protection are checked.
No database mutations, paid OCR calls or browser testing were performed.
