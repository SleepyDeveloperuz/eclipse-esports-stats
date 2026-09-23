# v2.26.1 — Automatic-first screenshot submissions

Deployed to production after explicit owner approval. This release keeps the existing storage and approval contracts; it requires no database migration. The prior v2.25.1 deployment remains available for rollback.

## Submission flow

- Selecting or dropping a screenshot starts processing automatically. Both screenshots can be selected together. Reads are coalesced; replacing an image cancels stale work and queues the latest pair.
- Numeric extraction runs alongside preparation of original hero references. The local portrait locator keeps original screenshot row numbers even after guests are excluded. The best valid catalog match fills the hero immediately, without a confirmation button.
- An optional, size-bounded medal-column close-up supplements the full originals in the same AI request. The full screenshots remain authoritative. Unsupported layouts skip the crop or use the original evidence.
- Missing KDA/result/positions, unknown medals or conflicting MVP badges trigger at most one automatic recheck within the existing total provider budget. Rechecks preserve already-read numeric values, align by unique identity, and reject conflicting row assignments. Unresolved duplicate MVPs remain unknown rather than being invented or requiring every medal to be manually selected.
- A compact completed summary exposes Submit and optional Edit. Hero alternatives and manual crop tools are tucked into optional corrections. Incomplete required values remain visible rather than being fabricated.
- Roster primary lane is used only as a labelled default when no lane is supplied; the screenshot does not prove that lane was played. The summary also shows date/type form choices. A player without a saved lane may still need a correction.
- Manual edits, navigation, form replacement and image replacement invalidate pending work. Restored drafts no longer enforce obsolete hero/medal review gates. Screenshots, crops and provider metadata are not saved in local drafts.

## Development-set evidence

Five previously supplied scoreboard + damage pairs, 25 friendly-side player rows, 21 distinct heroes. These are known development examples, not a held-out set.

| Measurement | Numeric-only baseline | Supplementary badge close-up |
| --- | ---: | ---: |
| Numeric fields | 225/225 | 225/225 |
| Medal classifications | 19/25 | 25/25 |
| Match outcomes | 5/5 | 5/5 |
| Independently readable durations | 4/4 | 4/4 |

The actual form, portrait locator and matcher were then exercised offline with the recorded close-up responses and original pixels. All five synthetic all-player roster fixtures became submit-ready without edits, with 25/25 heroes, 25/25 medals and 225/225 numeric fields matching the labels. No submission was sent or added to the database.

This replay used warm references and synthetic roster names derived from the OCR results. It does not establish independent real-roster identification, actual lanes, date/type accuracy, cold-cache/mobile latency, or accuracy on unseen images. Fresh unseen screenshot pairs are still needed before claiming broader reliability. Similarity scores are not displayed as confidence percentages.

## Safety and checks

- Existing authentication, rate limits, captain approval and duplicate protection remain in place.
- Optional derived images have separate format/size checks. No external image URLs are accepted for this field.
- Offline regression tests cover no-edit submissions, upload races, cancellation, nullable values, recheck merging, provenance, stale drafts, and the existing application behavior.
- Final local check: 276/276 Node + DOM regression tests passed with no skips; syntax checks passed for 48 JavaScript files; `git diff --check` passed.
- Candidate validation used no browser automation, new credentials, production data writes or migration. Deployment was authorized separately after validation.

## Production deployment

- Deployment: `dpl_45eBHFgT8ZZ3HJJ9tivSQ2C85ogT` (READY), built remotely in approximately 2 seconds and promoted to the main domain.
- Site: [eclipse-esports-stats.vercel.app](https://eclipse-esports-stats.vercel.app).
- HTTP checks before and after promotion: index and three changed frontend scripts exactly matched the tested source; the OCR and submission APIs returned JSON 401 for unauthenticated requests. Security headers were present.
- Immediate deployment-scoped error-log query returned no error entries. This is a short smoke check, not ongoing monitoring or a new live OCR accuracy test.
- No team records were created or modified during deployment verification. No GitHub push was performed.
