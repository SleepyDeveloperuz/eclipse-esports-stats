# Eclipse v2.32.0 — tier strength and evidence separated

- SS no longer requires patch metadata or a history warmup. Stale/missing history changes the evidence label, never the calculated strength tier.
- Win-only experimental signal: 60% absolute edge above 50% (2 percentage-point scale), 40% edge over the same rank/window median (IQR/1.349 scale, minimum 0.5 pp). Fewer than ten eligible heroes uses an explicitly labeled neutral 50%/2 pp fallback.
- Signal bands: SS >=1.5 and Win >=52%; S >=0.75 and Win >=50.5%; A >=0.25 and Win >=50%; remaining B >=-0.75, C >=-1.5, D below. These are transparent operating choices, not validated predictive cutoffs. No tier quotas.
- Smooth score = 50 + 100/pi * atan(signal). Ranking uses the unrounded signal with raw Win as a tie-breaker; 55%, 58% and 60% do not collapse to 100.
- Pick/Ban remain visible, separate draft-demand signals. No fake sample counts, confidence intervals or low-pick accuracy claims.
- Evidence can reuse raw observations from compatible patch/rank/window snapshots across scoring versions; three distinct UTC dates no longer require an additional 48-hour timer. Historical scores are never rewritten.
- Existing cached snapshots are re-scored on read, preserving the source timestamp and raw statistics; no need to wait for tomorrow's sync. New method query keys avoid serving v3 cached responses to v4 clients.
- Board, Rank Lens explanation and PNG labels reflect the new method. Old method explanations remain available for old snapshots.
- Verification: code, automated tests and read-only HTTP checks only. No browser/device visual QA, no private-match mutation or schema migration.
