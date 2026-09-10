# v2.25.1 — Practice metric totals

- Practice analytics now sum available ECL Damage and Gold values instead of hiding the whole total when one observation is missing.
- Each metric displays its own observed/total participation count and labels incomplete totals as “Qisman hisob”. The denominator is player appearances, not matches.
- Practice records use the same rule for dealt, received and turret Damage, and Gold.
- Unknown values remain unknown; an entirely missing metric still displays “—”. Recorded zero is valid. Guests remain excluded.
- KDA completeness rules, Team 5 calculations and stored match data are unchanged. No database migration is required.
- Seven focused offline regressions cover partial data, independent coverage, missing/invalid values, zero, numeric strings, guest exclusion, empty selections, KDA and both rendering paths.

Browser and live-data checks are intentionally excluded from this hotfix's automated tests.
