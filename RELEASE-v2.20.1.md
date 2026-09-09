# v2.20.1 — audit fixes

- Practice Lite OCR distinguishes Eclipse roster members from guest scoreboard rows. Five visible rows no longer imply Team 5. Unrecognized names require manual review.
- Match save, submission approval and Briefing voting share one durable, revision-checked Redis document. Gist is a one-time migration source, not a competing writer. See DEPLOYMENT.md before deployment.
- Submission creation/approval validates against the canonical hero catalog. Existing queue management remains available when the catalog is unavailable.
- Eclipse Index v1.1 excludes the player from the role baseline. It needs at least two other players, six peer scores and three dates in the same role, lineup size, scope and game mode. No comparable peers means no Index, not a fabricated 100.
- Personal form compares the player's own context-matched history. Period growth uses the previous window's median; the match trajectory uses up to 20 prior observations and needs at least three. Neither is a teammate ranking.
- Leaderboard medals require six eligible samples over at least three dates. Wider-sample confidence starts at 15 matches over three dates; this is a product heuristic, not statistical certainty.
- Lite completeness checks Lite's required fields. Missing advanced metrics remain visibly unavailable without marking valid Lite records defective.
- Patch detail failures show partial processing and unknown counts rather than fresh zero changes. A new parsed release invalidates hero-detail caches. Daily source refresh is not instantaneous live game telemetry.
- Initial catalog import does not label every hero NEW. Subsequent additions are explicitly labeled as additions to this catalog, not proof of an in-game release date.
- Briefing includes an accessible completed-VOD list and match selector. Reopening a poll clears its final decision while retaining prior votes.

No production data was migrated by implementation or local tests. Do not deploy without the storage cutover checklist.
