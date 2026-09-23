# v2.27.0 — Eclipse Progress

Deployed and promoted on 2026-09-16 after explicit owner approval. No database migration, new paid service, or additional Vercel function was needed. Existing automatic-first single-match scanning stays in place.

## Team features

- **Eclipse Weekly:** Monday–Sunday recap generated from official matches, separately for Team 5 and Practice. Captain previews and publishes a server-recomputed snapshot; teammates can view the publication archive and download a PNG. Republishing updates one week/scope, not a duplicate. Empty weeks cannot be published. Up to 104 publications are retained; remove an old publication explicitly if needed.
- **Multi-match upload:** a separate tool linked from Match Desk accepts up to ten screenshots / five matches. One metadata scan classifies the screenshots and reads exact string Battle IDs, dates, results and durations. Only unambiguous ID groups become matches. Each group then uses the existing numeric scanner and original-catalog portrait matcher, followed by a compact preview and one “send ready matches” action. Failed items stay in the queue; accepted items are never intentionally resent. Existing server duplicate checks also cover identical Battle ID / roster retries. Teammate entries still require captain approval.
- **Win vs Loss:** per-player deaths/min, damage/min, gold/min, teamfight participation and match rating, filtered by scope, hero, lane and match type. Per-metric sample counts are shown; missing metrics/duration never become zero. Results are descriptive, not causal or opponent-adjusted.
- **Hero Journey:** first and recent non-overlapping groups of up to five matches, best recorded ratings, existing captain hero-pool status, and sample warnings. No fabricated mastery score.
- **Eclipse Moments:** recorded MVPs, selected-context personal records (ties labelled), and any manually selected recorded match can become a Solar Eclipse PNG card. A hero portrait outage does not block the card. No comeback/shotcalling narrative is inferred from a scoreboard.
- **Correction history and Undo:** captain-only server journal records before/after edits and deletes from both direct match APIs and whole-document cloud sync. Undo checks the current revision, match fingerprint, later edits and roster references; replays are idempotent. Restoring a deleted match and Undo itself are audited atomically in the same database transaction.

## Limits and safety

- Screenshots remain in tab memory only; batch navigation pauses scanning. Reload/close loses unsent images. No new server image storage or compulsory hero/medal confirmation step.
- Readable Battle IDs are required for automatic grouping. Ambiguous/repeated screenshots are listed, not guessed; use the existing single-match flow for them. A date absent from screenshots uses the clearly visible batch date. Match type remains a visible choice and lane can remain a labelled roster default.
- Existing OCR and submission quotas apply. The batch indexing call also counts toward the OCR quota. The feature is not a claim of 100% recognition accuracy.
- Correction history starts with this release and retains at most 200 events / approximately 900 KB. Pruned-event count is visible. It cannot reconstruct corrections made before this journal existed. Mac backups remain the full recovery mechanism and now accept the history and weekly sidecars.
- Old deployed code can still accept authorized writes without creating new journal entries. Do not use old deployment URLs for ongoing edits after promotion.
- Team 5 and Practice never share statistical samples. Unknown roster IDs, invalid/review records, guests pretending to complete Team 5 and inconsistent participant scopes are excluded.
- Server writes are revision/CAS guarded. Publishing and Undo require captain access; private correction details are not available to teammates. Logging out clears captain views and the batch state.

## Verification

Focused pure-model, in-memory storage/API and DOM tests cover scope eligibility, null metrics, date boundaries, non-overlapping windows, exact-ID grouping, Battle ID preservation, duplicate retries, publication authorization, atomic history, stale Undo and partial batch retries. Existing scanner DOM regressions are included. No browser testing or live team-data writes are used.

Pre-deployment checks: **287 regression tests plus 8 existing UI regressions passed, zero failed/skipped** with the temporary external jsdom runtime. Syntax checks passed for all 55 JavaScript files. These checks include a mocked provider contract, not a fresh live-provider accuracy benchmark.

## Deployment

- Production: https://eclipse-esports-stats.vercel.app
- Immutable deployment: https://eclipse-esports-stats-2p89dzytq-khusniddindev-6696s-projects.vercel.app
- ID: `dpl_3z9Hfz43KuAn6N8aZMuAhtoaH8X6`; status READY; vanilla JavaScript + Node API functions; remote build approximately 2 seconds.
- Source: existing `c905391` checkout plus preserved v2.26.1 changes and uncommitted v2.27.0 changes. No GitHub push was performed.
- Nine assets matched the tested source byte-for-byte on both the protected candidate and the main production domain. OCR and the new history/weekly reads correctly returned application JSON 401 responses without authentication. Security headers and JavaScript MIME types were checked.
- The deployment-scoped ten-minute log check returned one Node `DEP0169` deprecation warning about `url.parse()` on an expected 401 request, not a failed smoke check. No such call exists in application source. Its upstream origin has not been traced. No continuous monitoring or log-drain configuration was added.
- No production match, vote, report or correction was created during verification. No browser test or paid OCR-provider call was made.
- Prior stable deployment retained for rollback: `eclipse-esports-stats-iyzgmn7ck-khusniddindev-6696s-projects.vercel.app` (v2.26.1). Rolling code back stops new correction journaling; it is not a data rollback.
