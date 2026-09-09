# v2.21 — evidence-first team workflow

Local candidate; not deployed. The live release remains v2.20.1.

## Implemented

- A persistent Team 5 / Practice (1–4) control now applies to roster, player profiles, analytics and the match ledger. Profiles use the selected context for totals and personal trends. The ledger retains review-required records; admins can still find unclassified legacy entries in either context.
- Team Pulse compares win-rate deltas only after both groups contain five valid Team 5 matches. Smaller samples show W/L and actual group counts without a trend delta. Its separator no longer spans the full grid.
- Active Dream Team formation and cross-role Index awards were removed. Role coverage reports actual matches, unique heroes and assigned roles, without claiming strength or readiness. Historical analytics engine methods remain for compatibility.
- Player tables and career totals use alphabetical ordering rather than Index or cumulative Damage medals. In-game score replaces the headline profile Index. Experimental Index remains available in a disclosure and secondary table columns.
- Most-picked heroes are labelled as most-played, not Signature. A few wins no longer award automatic mastery tiers. Assigned roles and most-played roles are distinguished.
- Short submissions support 1–5 active roster members. The server derives Team 5 for five members, individual for one, squad for two through four. Storage field `entryMode: practice_lite` and deterministic IDs remain backward-compatible; this field describes input depth, not lineup size. Missing advanced metrics remain null.
- The short form has one scoreboard upload, optional medal input, and accurate disclosure that Captain reviews extracted numbers, not a stored screenshot. Both wins and losses should be entered. Rejected submissions can be loaded into the submitter's form, corrected and resubmitted; replacing an edited form requires confirmation.
- The meta board prioritizes source rank and Win/Pick/Ban. Eclipse tiers are explicitly experimental, not Moonton tiers. Counter/synergy data is described as a statistical signal, not a guarantee.
- Patch parsing never claims complete coverage from article length. Briefing highlights automatically detected changes to heroes played in valid records within the last 90 calendar days (both contexts), plus new-hero announcements. No detected change is not proof that a hero was unchanged.
- Admin-only `GET /api/backup` downloads the existing durable team snapshot, including match/player data, Briefing, vote sidecars and submissions. It does not seed, write or repair storage. The CLI export shares this validation. Backups contain private team data and must not be publicly shared.
- Core browser import rejects a full server backup and malformed top-level containers before mutation. The settings labels distinguish browser statistics from a full server snapshot.

## Verification

- Run `npm run check` and `npm test` before deployment.
- Regression tests cover Team5 short submission normalization → storage → approval → analytics, small samples, role coverage, context-aware templates, source sorting, patch limitations/relevance, backup access control and read-only export, and rejection of full backups by the core importer.
- Template tests are not visual browser or live end-to-end verification. A local browser preview was blocked by the browser access policy; no workaround was used. Desktop/mobile visual QA and a preview-deployment check remain before publication.
- No production records, passwords, environment variables, or live deployments are changed by this release preparation.

## Follow-up work, not included

- Independent scheduled off-site backups and a guarded full-server restore workflow. The new download is a manual snapshot, not automated disaster recovery. Redis history keys are not part of the export; restoration requires validating the namespace/revision and handling history/initialization markers explicitly.
- Optional Captain-curated hero readiness labels (training/main/ready), rather than inferring mastery from small samples.
- Further dashboard empty-state/layout polish after visual review.

## Release procedure

Do not rerun the Gist-to-Redis migration for this update. No environment changes or schema migration are needed. Take a private full backup before publishing, verify the candidate, and deploy only after the owner explicitly requests it. Do not test writes against shared production data as part of local verification.
