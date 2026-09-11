# v2.26.0 — Numeric OCR and local icon review

## Workflow

- Gemini reads visible K/D/A, score, Gold, Damage, duration, result and IGNs. The scoreboard contract no longer asks it to guess heroes, lanes or portrait coordinates. Unknown values stay null.
- Each returned player retains the original left-team `sourceRow` (1–5). Filtered guests never shift which icon belongs to a tracked player; missing or duplicate row IDs use manual cropping.
- A bounded local pixel/template search identifies a five-row portrait column. It searches location, size and spacing against the currently loaded canonical references; it does not use fixed match coordinates or predicted hero names. It accounts for simple black borders and normalized scale, then refines candidate crops.
- The existing local matcher compares each suggested crop with the live reference catalog and presents three candidates. No candidate is automatically confirmed. A manual crop and manual hero selection remain available when geometry, resources or the compute budget are insufficient.
- References stay cached; a prepared catalog is reused across rows. Screenshot pixels/crops are transient and are not stored in localStorage, the team database, shared reference records or this repository.
- OCR medals require explicit review. Duplicate friendly-team MVP selections are flagged and cannot be submitted until corrected. The OCR result is never treated as independently verified match data.
- Changing images, editing fields or navigating away cannot allow stale work to replace a newer choice. Model, version, elapsed time and sanitized fallback attempts are visible in the scan status, not persisted in the match draft.

## Provider safety

- Keep Gemini 3.5 Flash-Lite with Gemini 2.5 Flash compatibility fallback. Gemini 3.8 was not promoted: five earlier requests returned 503, so its recognition accuracy could not be measured.
- HTTP 200 alone is not success. Blocked, truncated, empty, malformed JSON and unusable result shapes trigger a bounded fallback. Response body reading is inside the timeout. Thought parts are excluded.
- Maximum 32 seconds per model, 65 seconds total. A nearly exhausted budget does not start another provider request. Provider exception text, request bodies and credentials are not logged or returned.
- Existing auth, rate limits, storage namespaces and historic match data are unchanged. No migration or new service is required.

## Evidence and limitations

- Five user-supplied screenshot pairs (25 friendly rows, 21 different heroes, one layout family) were used as a **development regression set**, not a held-out evaluation.
- Automatic localization plus the unchanged local matcher proposed the correct first candidate for 25/25 rows on that set. All still required user confirmation. Localization took approximately 7 seconds per screenshot on the test Mac with preloaded references; initial reference preparation and mobile timing are additional.
- One resized and one simply letterboxed derivative each retained 5/5 first candidates. A derivative with a missing portrait row was rejected. Blank/solid/unsupported-size fixtures and cancellation/compute-budget checks reject without producing partial crops. These controls are not evidence of universal layout support.
- One additional numeric-only Gemini request validated the deployed request shape: 45/45 labelled numeric fields, correct original row indexes, and no hero guesses. Numeric accuracy beyond this small sample is not guaranteed. Older model-comparison results must not be attributed to this new pipeline.
- Offline tests cover provider fallback/provenance, nullable values, original-row mapping, user review, duplicate MVPs, stale responses, draft persistence and existing application behavior. Browser automation was intentionally not used at the owner's request.

Private screenshots and detailed benchmark artifacts remain outside the source repository. Public release notes contain only aggregate results.
