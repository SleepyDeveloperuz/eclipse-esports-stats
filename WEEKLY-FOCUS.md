# Weekly focus and scan usage measurement · v2.35.0

## Weekly workflow

- Open Eclipse Progress → Eclipse Weekly. Select Team 5 or Practice (1–4).
- Captain saves one task for the current Tashkent-calendar week, plus the metric to observe. It is immediately visible to signed-in teammates, independently of publishing the Weekly report. Public Meta Lab gets no access.
- The positive/review signals describe the previous two weeks, Ranked only. We compare identical player + hero + lane + tracked party-size cohorts with at least five known observations in each week. Every matched cohort has equal weight. Unknown metrics are not zero, unknown lanes are excluded, and guests are not included.
- The task baseline is the previous week's snapshot when saved. Editing task text does not replace that baseline; changing the metric computes its baseline. Past/future weeks cannot be edited. Both match revision and separate focus revision guard against stale writes.
- On the following week, the prior task compares its saved baseline with the task week's recorded matches. No matched sample means no verdict. Opponents, game state and patch effects are not controlled; numbers are not evidence of causality or proof the task was completed.
- Up to 104 focus records are retained without automatic deletion. Reports and focus records preserve each other on writes. Full Mac backups include both.

## AI usage ledger

- The OCR/portrait/model algorithms are unchanged. Single-match and multi-match workers share the same instrumentation.
- A completed attempt records a random ID, ready/review/error/cancelled outcome and total scan time. Timing includes detail preparation, OCR and automatic hero/role resolution, not the initial file conversion. Delivery is best effort with a five-second timeout and a separate authenticated rate limit. There is no third-party analytics service.
- At the end of automatic fill, a comparison snapshot stays only in memory. On successful new submission, only changed field categories are stored. Blank→filled counts as a change; date, match type, note and submitter are excluded. Restored drafts, edits to existing matches and edits while automation is running do not claim untouched autofill. Images, names, stat values and provider error strings are never placed in this ledger.
- Only the server can mark an event as submitted, atomically with a valid submission. A viewer pending submission counts as submitted, not as approved. Duplicates/rejected requests do not increment it. IDs are ownership-bound, repeated events are idempotent, and late terminal events cannot erase accepted evidence.
- Captain's Weekly foldout displays the latest 30 measured submissions, changed field categories, median completed-scan duration and separate error/cancellation counts. It is **not** accuracy: accepting wrong output without edits still counts as unchanged. Browsers closed/offline and drafts restored later can be unobserved. A small sample is not a model benchmark.
- The ledger retains the last 300 attempts and exposes how many were pruned. It is included in backup/restore. It does not affect match statistics, rankings, awards or hero selection.

## Deliberately deferred

Per-player coaching in profiles and a dashboard summary are not part of this release, as agreed. They require a separate discussion of evidence, context and sample-size safeguards.
