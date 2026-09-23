# v2.30.0 — Installable Eclipse

Deployed to production on 2026-09-21, as requested by the user. Includes the
six local v2.29.0 Meta Lab research features; see that release note for details.

## Installation

- One root-scoped manifest and stable ID shared by the private and public pages.
- Android/browser install prompt after a user click when supported; platform-aware
  manual instructions otherwise. iOS uses Safari Add to Home Screen.
- Existing Solar Eclipse mark rasterized locally into padded maskable 192/512px
  icons and a 180px Apple touch icon; no new remote image dependency.
- Standalone launch opens `/?source=pwa`; Meta Lab remains accessible without login.
- Install actions on public header, login/unavailable screen and private sidebar.
- Accessible native instructions dialog; Escape closes it without unlocking the
  mandatory team access gate. Standalone mode hides install actions.

## Offline and update boundaries

Service worker caches exactly six public shell resources: the offline page, its
CSS/JS, and three icons. All team/app navigations use the network; network failure
returns a public offline explanation. API, authenticated, cross-origin and non-GET
requests are not intercepted. No team records, credentials, screenshots or dynamic
API responses are added to Cache Storage. Existing application storage is unchanged.

No background sync, upload replay, push notification or automatic retry. A failed
upload may already have reached the server: the offline page tells users to check
history before trying again. Offline is not a second editing mode.

No forced worker activation, client claiming or page reload. A waiting update
shows a dismissible notice; users finish their work and close all site/app windows
before reopening. Worker and manifest use revalidation headers.

Authentication scope and expiry remain unchanged. Device/browser installation,
menu labels and prompt availability depend on platform support. Real-device QA
and browser testing are deliberately left to the user, as requested.

## Verification

Focused offline tests cover manifest/icons, finite cache allowlist, exclusion of
private/API/mutation traffic, offline fallback, safe cache cleanup, user-gesture
installation, iOS instructions, login-gate isolation, and non-disruptive updates.
Local verification passed: 342 tests, zero failures/skips; syntax checks passed
for 64 JavaScript files; patch whitespace check passed. No browser testing was run.
Production deployment: READY, `dpl_DqPzzNHYpua9jtPkTXnGHD2HMhqF`.
Primary URL: https://eclipseesports.vercel.app
Deployment URL: https://eclipse-esports-stats-r9jj9lu87-khusniddindev-6696s-projects.vercel.app

Read-only post-deployment checks passed: both domains serve v2.30.0; entry pages,
manifest, worker, offline assets and all three PNG icons return 200 with exact
source-byte matches. Manifest content type and manifest/worker revalidation headers
are correct. All four rank datasets return 133 heroes with scoring explanations.
Catalog and sample hero timeline return 200 (12 existing daily points). Anonymous
team sync, Briefing and submissions remain 401. Initial error-level deployment log
query returned no entries. No new monitoring/drains or production data writes.
This is a vanilla JavaScript/static frontend with Vercel API functions; built in
2 seconds. Existing working-tree changes were preserved, not committed or pushed.
