# Eclipse Weekly Focus & AI Usage Ledger · v2.36.0+

The **Eclipse Weekly Focus** and **AI Usage Ledger** subsystem provides tactical squad guidance and operational monitoring for Eclipse Esports. It enables the Captain to set weekly developmental milestones and observe scan automation performance without third-party tracking services.

---

## 1. Weekly Focus Engine

The Weekly Focus engine bridges high-level strategy and match execution across the Tashkent-calendar week (`Asia/Tashkent` timezone, Monday 00:00 to Sunday 23:59).

### Tactical Workflow
1. **Scope Selection:** Captain selects either **Team 5** (`team5`) for full 5-man tournament lineups or **Squad** (`squad`) for Trio/partial squad matches.
2. **Task Creation:** Captain formulates one actionable task for the current calendar week (e.g. *"Review first death after every ranked game"* or *"Prioritize lane freeze before first turtle"*), assigning one core observable metric:
   - `deathsPerMinute`: Defensive discipline, map awareness, anti-gank survivability.
   - `damagePerMinute`: Teamfight output, harass pressure, damage uptime.
   - `goldEarned` (per min): Farming efficiency, objective gold, lane wave clearance.
3. **Instant Visibility:** Once saved, the active focus is immediately visible to all authenticated teammates in the private team dashboard. The public Meta Lab has no access to team focus records.
4. **Automated Server Baseline:**
   - The task baseline is atomically computed from the prior calendar week's matches at the time of creation.
   - Editing task text preserves the initial baseline; changing the observed metric recomputes a fresh baseline from that prior week.
   - Past and future weeks are read-only and cannot be altered.

### Comparison Contract & Statistical Safeguards
- **Cohort Matching:** Evaluates identical `(playerId + heroUsed + rolePlayed + scope)` cohorts with at least **5 known observations** in both the baseline week and the task week.
- **Equal Cohort Weight:** Each qualified cohort carries equal weight in the aggregate delta calculation.
- **Strict Data Gating:**
   - Casual and practice matches are excluded.
   - In Trio games, guest pub players (`guestStats`) are excluded.
   - Unknown metrics or missing match durations are never counted as zero; they are excluded from the denominator.
   - Unknown or unconfirmed lane roles are excluded.
- **Evaluation Verdict:** At the conclusion of the calendar week, the system compares the recorded matches against the baseline. If insufficient matching samples exist, the system safely reports no verdict rather than guessing.
- **History Retention:** Up to **104 focus records** (2 full years) are retained in Upstash Redis without automatic truncation.

---

## 2. Concurrency & Data Integrity

- **Dual Revision Protection:** Every focus update requires matching `expectedRevision` (team core data revision) and `expectedFocusRevision` (focus storage revision). Stale writes or concurrent edits from another device are rejected with HTTP 409 Conflict.
- **Publishing Isolation:** Weekly Focus tasks operate independently of Weekly Report publishing. Reports can be published, updated, or unpublished without resetting or corrupting active focus tasks.
- **Backup Parity:** Mac offline backup scripts (`scripts/team-backup-daily.mjs`) capture all focus records and revision sidecars in the atomic snapshot.

---

## 3. AI Usage Ledger & Audit Trail

The AI Usage Ledger tracks the efficiency, latency, and reliability of the Gemini Vision screenshot ingestion pipeline across both single-match and batch uploads.

### Instrumentation Principles
- **Attempt Tracking:** Each screenshot scan records a unique attempt ID, outcome status (`ready`, `review`, `error`, `cancelled`), and total processing duration.
- **Timing Scope:** Processing time covers image detail preparation, Gemini Vision OCR, smart roster matching, and hero portrait resolution (excluding initial client-side file selection).
- **Modification Categories:** On submission, the server records which field categories were modified from the AI output (e.g. `hero`, `kda`, `role`, `score`). Blank-to-filled counts as a change; unchanged fields confirm OCR precision.
- **Privacy & Security Guarantees:**
  - Raw screenshots and base64 payloads are **never** persisted in the ledger.
  - Player names, individual stats, and provider API error traces are strictly excluded.
  - Rate-limited and authenticated: Only server-side endpoints can record or mutate ledger events.

### Captain's Foldout Dashboard
In the private Captain Weekly panel, an operational summary displays:
- The **latest 30 recorded submissions** with their status indicators.
- **Median scan duration** across completed attempts.
- Total counts for manual review triggers, provider errors, and cancellations.
- Ledger bounds: Retains the **latest 300 attempts** in Redis, automatically pruning older entries while reporting pruned volume.

---

## 4. Verification & Testing

The Weekly Focus and AI Ledger specifications are validated by automated tests:
- `tests/weekly-focus.test.js`: Cohort equality, guest isolation, sample size gating, revision conflicts, and non-adjacent week rejection.
- `tests/progress-api.test.js`: Authorization gates, role checks, and revision protection.
- `tests/progress-ui.test.js`: Captain interaction, task drafting, error feedback, and responsive rendering.
