# v2.33.0 — Transparent draft-priority tiers

## Scope

Rank-specific SS / S / A / B / C / D tiers now describe draft priority, not only Win performance. No AI prediction, tournament/Pro dataset, invented match counts, team-data migration or paid dependency has been added. Existing four rank filters, portraits, lane filters, Rank Lens, Hero Compare and PNG exports remain.

This is Eclipse's own experimental policy. MLBB.GG's public descriptions inspired the draft-priority interpretation; its undisclosed scoring formula was not copied or reverse-engineered. The weights and thresholds below are design choices, not fitted or independently validated accuracy claims.

## Method `eclipse-tier-5.0.0`

Only rows with finite Win/Pick/Ban rates in [0, 1] and Pick > 0 are rated. Missing data stays U; a genuine zero Ban is valid. Raw source rates and timestamps are never rewritten.

- Win signal W = 50 + (100/π) × atan(0.6 × (Win − 0.5)/0.02 + 0.4 × (Win − rank median)/spread).
- Spread = max(rank Win IQR / 1.349, 0.005).
- Pick signal P = 100 × Pick / (Pick + pick reference).
- Pick reference = max(median Pick among eligible heroes, 0.001).
- Ban signal B = 100 × Ban / (Ban + 0.10).
- Draft score = 0.50W + 0.20P + 0.30B.
- For fewer than ten eligible heroes, use neutral references: Win center 0.50, spread 0.02, Pick reference 0.01.

Pick is popularity, and Ban is avoidance/denial demand—not direct evidence of strength, causal effects or match sample size. They contribute to draft priority with diminishing returns. Unlike pure Win ranking, a contested hero can outrank a niche hero with higher Win. No positive-Win gate prevents contested heroes reaching SS.

Fixed bands: SS ≥70; S ≥60; A ≥50; B ≥40; C ≥30; D <30. No forced allocation or rank-based SS quota. Ranking and tier boundaries use full precision; presentation rounds only. Borderline marks scores within one point of a threshold. Equal signals are never split into different tiers to fill a quota.

## Quality and history

Tier strength remains independent of freshness and history availability. SS is possible on the first valid snapshot. Stable quality needs a fresh snapshot and three distinct daily observations with complete raw rates, matching rank/window/patch, fully post-patch windows, Win range ≤1.5 pp, Pick range ≤max(0.2 pp, current Pick ×25%), and Ban range ≤5 pp.

This is descriptive stability, not confidence. Overlapping seven-day snapshots are not independent match samples. Compatible raw observations from older scoring versions can be reused for quality; historical scores are not recalculated. Timeline retains method versions. Cross-method tier-change arrows are suppressed by the existing comparison guards.

## Surfaces and compatibility

- “Nega bu tier?” shows all three score contributions, anchors, formulas, thresholds and limitations.
- Board and PNG read weighting labels from snapshot methodology; older snapshots are not mislabeled as v5.
- Numeric table follows Eclipse rank, matching board order, while retaining source rank and raw rates.
- Draft assistant prioritizes lane coverage, then matchup signals, then the composite score. Raw Win is only a final numeric tiebreaker.
- Client requests use method=5 and changed assets use v2.33.0 cache keys. Existing API rescores older public cached source rates on read, preserves source timestamps, suppresses false movement, and does not write to Redis.

## Verification

Public rank fixture captured from Eclipse's public API on 2026-09-22 (source updated 09:41:32 UTC): 133 heroes per rank. These are behavioral regression inputs, not ground-truth tier labels or a predictive accuracy benchmark.

On that fixture the new method produces SS counts: Epic 7, Legend 10, Mythic 15, Glory+ 15. These are outcomes, never target counts. Automated checks cover independent score arithmetic, all tier boundaries, monotonicity, saturation, invalid rates, cohort isolation, historical quality, cache upgrades, draft ordering, and board/table/PNG consistency. No browser QA or production deployment is part of this change.

Verification result: 380/380 automated tests passed (zero failures or skips), 67 JavaScript files passed syntax checks, and `git diff --check` passed. Browser rendering and predictive accuracy were not tested.
