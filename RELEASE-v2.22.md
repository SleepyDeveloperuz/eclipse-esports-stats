# Eclipse v2.22 — Full Match Desk & Meta Atlas

- The captain's new-match page and teammate submissions share the full Match Desk. Existing match editing remains compatible with the previous editor.
- Full entry keeps damage dealt/received, turret damage, gold, teamfight %, score, medal, Savage/Maniac, team objectives, session, guests and substitutes. Unknown metrics stay null. Only five tracked roster players count as Team5.
- Captain can review/correct/approve submissions with an updatedAt conflict guard; original submitted facts are retained. Direct admin save and approval are atomic. Legacy Lite records and fingerprints remain readable.
- The form is full-width with responsive player cards and equal W/L controls. Browser-local drafts exclude screenshots. Captain and viewer drafts are separate; screenshots must be selected again after restoring.
- All signed teammates can access Meta tiers, numeric source rates, hero details/skills/counters and patches. Sync remains captain-only.
- Tier board and whole-board PNG use existing S/A/B/C/D methodology (not an invented SS tier). PNG includes every hero, source context, snapshot timestamp and experimental attribution. A bounded authenticated image proxy accepts only catalog portraits on the approved CDN; export reports an error instead of silently omitting portraits.
- Tier movement compares a real older snapshot with matching rank/window/methodology. No matching snapshot means no arrows. This data becomes available on the next successful scheduled/manual rank sync.
- OCR distinguishes catalog membership from visual recognition. New Match Desk requires explicit hero confirmation, can show a cropped portrait and rescan only that crop; candidates are catalog-filtered. Crop availability depends on the model locating the portrait. Manual selection remains available. No measured accuracy claim is made without labeled real-game fixtures.

Verification: Node syntax checks, full regression suite, full submission API workflow against an isolated in-memory team repository, and separate DOM checks for form/draft/confirmation/admin review/tier controls/poster layout. No synthetic matches are written to production during verification.

Deployment keeps all existing production environment variables and passwords unchanged. Before/after full backups are private; no migration or data rewrite is required.
