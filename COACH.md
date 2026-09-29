# Eclipse Coach v2.36.0

Private team dashboard summary and player-profile detail. Every authenticated teammate can see every roster member. Public Meta Lab does not load this feature. No external AI calls, database writes, or player ranking.

## Comparison contract

- Only analytics-eligible non-draft matches with valid past/current dates and unique IDs.
- Compare the same player, hero, recorded played lane, match type and tracked party size. Team 5 and Practice stay separate. Roster preferred lane is not substituted for played lane.
- Default to Ranked and the most recently played context; users can select another context. Selection is not based on the largest negative change.
- At least 10 matching matches. Each completed block of five compares against the preceding five. Pending matches are counted but do not enter comparison until their block is complete.
- Per-minute values use each match's duration. Unknown values do not count as zero. Each signal needs five known values in each block.
- Suppress advice if the latest complete block is over 30 days old or the comparison spans over 90 days. Dates and evidence remain visible.
- Signal thresholds: deaths/min 20% and 0.1; teamfight participation 10 percentage points; gold/min 15% and 50; damage/min 15% and 300; turret damage/min 20% and 100. Both relative and absolute thresholds must be met where applicable. Improvements use the opposite direction.
- Fixed priority: deaths, participation, gold, damage, turret. One review priority, at most two additional observations. Roam gold/damage/turret remain descriptive only.

These are transparent product heuristics, not validated causal explanations or statistical significance tests. Opponent, patch, draft, teammates and match circumstances are not controlled. W/L provides context, not proof. Inferred/unknown lane sources are disclosed. Recommendations ask for contextual VOD review, not blind stat maximization.

## Weekly handoff

Admin may prepare a Weekly draft for supported metrics (deaths/min, damage/min, gold/min). This does not save or publish anything. Existing unsaved drafts are preserved. Weekly measures the whole selected team scope, not this personal hero/lane cohort; UI explicitly discloses that difference. Teamfight/turret recommendations never silently become another metric.

## Verification

Automated model and JSDOM interaction tests cover sample gating, separation, missing values, duration, stale data, roam handling, evidence links, escaping, viewer controls, unavailable local storage and draft behavior. No browser visual testing or new AI-accuracy claim.
