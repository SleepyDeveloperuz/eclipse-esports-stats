# Eclipse Coach — Competitive Analytics & Performance Heuristics v2.36.0+

Private team dashboard intelligence and player-profile detail for **Eclipse Esports**. Every authenticated teammate can review coach insights for every roster member. Public Meta Lab never loads this feature. No external AI calls, database writes, or opaque player rankings.

---

## 1. Core Architecture & Philosophy

Eclipse Coach is a transparent, deterministic performance heuristic system designed for competitive MLBB play. It does not treat statistics as absolute truth or causal proof. Instead, it surfaces statistically meaningful shifts between consecutive blocks of play within identical contexts, prompting targeted VOD reviews.

### Official Team Roster & Role Anchoring

Coach insights are anchored to the 6 official roster players and their designated lanes:

| In-Game Nickname (IGN) | Haqiqiy Ism (Real Name) | Asosiy Rol (Primary) | Qo‘shimcha Rol (Secondary) | Coach Heuristic Priority |
| :--- | :--- | :--- | :--- | :--- |
| `heavenly as always` | **Husniddin** | Roamer | Jungler / Mid Laner | Teamfight participation, vision deaths, early rotation tempo |
| `Shadow as always` | **Sanjar** | Gold Laner | Jungler | Deaths/min, gold efficiency, late-game positioning |
| `no one's hero` | **Ulug'bek** | Roamer | Gold Laner | Teamfight participation, damage taken efficiency, peeling |
| `Lyza the heroine` | **Shohruh** | EXP Laner | Mid Laner | Turret pressure, lane wave cut, frontline engagement |
| `- Kenia` | **Otabek** | Jungler | EXP Laner | Objective secure tempo, deaths/min, burst target priority |
| `LEADER` | **Nabixo'ja** | Mid Laner | Roamer | Damage/min, high-ground defense, initiation timing |

---

## 2. Comparison Contract & Cohort Isolation

To avoid misleading comparisons between unrelated situations, Eclipse Coach enforces strict cohort isolation:

1. **Eligible Matches Only:** Only analytics-eligible, non-draft matches with valid past/current dates and unique 18-digit Battle IDs enter the cohort. Matches marked for review (`needsReview: true`) are excluded.
2. **Context Dimensions (Cohort Equality):** Two matches are compared **only** if they match on all 5 dimensions:
   - **Player Identity:** Exact roster player ID.
   - **Hero:** Exact hero used (e.g. `Tigreal` is never compared against `Khufra`).
   - **Played Lane / Role:** Exact recorded lane played (e.g. `Roamer`, `Gold Laner`, `EXP Laner`). Roster preferred lane is never substituted for actual played lane.
   - **Party Size / Scope:** 
     - `team5`: 5-man premade tournament/scrim games.
     - `squad`: Trio games (3 Eclipse members + 2 random pub players).
     - `individual`: Solo or duo games.
     - *Team 5, Squad, and Practice are strictly separated and never mixed.*
   - **Match Mode:** Ranked only by default. Casual and Brawl matches are excluded.
3. **Guest Player Exclusion:** In Trio matches (`scope: 'squad'`), the 2 random pub players (`guestStats`) are completely excluded from team cohorts. They never influence player averages, teamfight participation denominators, or coaching recommendations.
4. **Block-Based Comparison (5 vs 5):**
   - Requires at least **10 matching matches** in the exact same cohort.
   - Evaluates the most recent block of 5 completed matches (`after`) against the immediately preceding block of 5 matches (`before`).
   - Pending matches (1–4 matches after a completed block) are displayed as pending progress (`pending: N`, `remaining: 5 - N`) but do not trigger advice until the new 5-match block is complete.
5. **Per-Minute Normalization:**
   - All rates (`deathsPerMinute`, `damagePerMinute`, `goldPerMinute`, `turretDamagePerMinute`) use each individual match's `durationSeconds`.
   - Matches with zero or missing duration are omitted.
   - Unknown values never default to zero. Each block requires at least 5 known values. True zero (e.g. 0 deaths) remains valid and known.
6. **Time Gating & Stale Data Suppression:**
   - If the most recent completed block is older than **30 days**, all recommendations are suppressed (`status: 'stale'`).
   - If the 10-match comparison spans more than **90 days**, recommendations are suppressed to prevent comparing across outdated game patches.
   - Match dates and raw evidence links remain visible even when advice is suppressed.

---

## 3. Metric Thresholds & Role Sensitivity

Eclipse Coach monitors 5 core signals evaluated in strict priority order:

| Priority | Signal | Minimum Relative Shift | Minimum Absolute Delta | Role-Specific Rule |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **Deaths per Minute** | 20% | 0.1 deaths/min | Highest priority for all roles. |
| **2** | **Teamfight Participation** | — | 10 percentage points | Primary metric for Roamers and Initiators. |
| **3** | **Gold per Minute** | 15% | 50 gold/min | Ignored for Roamers (descriptive only). |
| **4** | **Damage per Minute** | 15% | 300 damage/min | Ignored for Roamers (descriptive only). |
| **5** | **Turret Damage per Minute** | 20% | 100 turret dmg/min | Primary for EXP/Gold; descriptive for Roamers. |

### Roamer Protection Rule
For players operating in the `Roamer` lane (e.g. Husniddin or Ulug'bek), resource reductions (damage/min, gold/min, turret damage/min) are treated as **descriptive notes**, not negative performance warnings. A roamer who buys roam boots and concedes farm to carries is performing correctly; the engine never falsely flags this as bad carry play.

### Recommendation Limit
To prevent cognitive overload, the engine generates:
- Exactly **one primary review priority** (if negative thresholds are met).
- At most **two additional observations** (positive improvements or descriptive notes).
- Contextual advice framing: "Review VOD positioning around 8-12 minute lord setups" rather than "Deal more damage".

---

## 4. Weekly Focus Handoff

When the Captain identifies a recurring performance pattern in Coach:
1. Captain clicks `[Haftalik Fokusga Qoralama]` on any supported metric (`deathsPerMinute`, `damagePerMinute`, `goldPerMinute`).
2. The system pre-fills a Weekly Focus draft for the current Tashkent-calendar week.
3. This action is atomic, private to the Captain, and does not save or publish anything until confirmed.
4. Existing unsaved drafts are safely preserved.
5. The UI clearly notes that Weekly Focus tracks the entire selected team scope (`team5` or `squad`), whereas Coach inspects this specific hero/lane cohort.

---

## 5. Verification & Testing

Eclipse Coach heuristics are validated by automated offline tests in `tests/coach.test.js`:
- Minimum sample size gating (requires 10 matches, ignores < 10).
- Cohort isolation across hero, lane, party size, and match type.
- Missing values and zero duration handling.
- Roamer resource drop suppression.
- Stale data and 30-day/90-day time fences.
- XSS escaping and JSDOM interaction testing.
- Offline and blocked localStorage resilience.
