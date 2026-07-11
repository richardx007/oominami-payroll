---
name: pwa-auto-update
description: Add a battle-tested PWA update UX to a React app (Next.js App Router OR Vite + React) — a logo/button tap that refreshes to the latest version, and an "update available" banner prompting a one-tap update. Built as a minimal, cache-free service worker that NEVER intercepts navigation, so it is safe everywhere (including Cloudflare Workers / opennext, where cache-based service workers break App Router navigation). Use this whenever the user wants to add or port PWA update prompts, a "new version available" toast/banner, one-tap or tap-to-refresh updating, service-worker skipWaiting/update handling, or fix "This page couldn't load"/stale-version problems after adding a PWA/service worker, in a Next.js or Vite React project. Trigger even if the user only describes the symptom ("users don't get the new version until I reload", "menu navigation breaks after I added a PWA").
---

# PWA Auto-Update (React — minimal, cache-free SW)

Give a React PWA two things:

1. **"Update available" banner** (`ReloadPrompt.tsx`) — detects a new deploy and lets the user update with one tap.
2. **Tap-to-refresh** (`reloadApp.ts`) — wire to a logo/button; activates a waiting new version and reloads.

The service worker is **generated at build time** (`generate-sw.mjs`) and is deliberately **minimal: it has NO `fetch` handler and caches nothing.** Its only jobs are (a) letting the browser detect a new version (via a stamped `SW_VERSION`) and (b) honoring `SKIP_WAITING`. Because it never intercepts requests, it cannot break navigation; because it caches nothing, the app is always served fresh — normal use already gets the latest, and the banner/logo-tap are the "update right now" affordances.

> **Why not `vite-plugin-pwa` / `@serwist/next` / Workbox `defaultCache`?**
> This skill originally used caching plugins. On **Cloudflare Workers + opennext** `@serwist/next`'s `defaultCache` intercepted navigations/RSC and made **every App Router menu tap fail with "This page couldn't load"** (production outage; only hard reload worked), and it forced a `webpack` build (dropping Next's Turbopack). Precache-based SWs (incl. `vite-plugin-pwa` autoUpdate) also cause stale-version and post-update blank-screen issues on iOS. The minimal cache-free SW below avoids all of that. Only reach for a caching SW if you genuinely need **offline** support AND have verified navigation/RSC caching on your actual host.

## Shared core (framework-agnostic)

These three files are identical for Next.js and Vite:

- `assets/reloadApp.ts` — `reloadApp()` tap-to-refresh (SKIP_WAITING → controllerchange → reload, with a fallback timer for iOS).
- `assets/ReloadPrompt.tsx` — `<ReloadPrompt />` banner using plain `navigator.serviceWorker` (no deps). Its update button reloads **synchronously** (iOS Safari doesn't reliably fire `controllerchange`).
- `assets/generate-sw.mjs` — build-time generator → `public/sw.js`, stamped with `SW_VERSION` (git short SHA; fallback `Date.now()`). The SW has **no `fetch` listener**; on `activate` it clears stale caches and `clients.claim()`s.

Common wiring for both:
1. Copy the three files (`reloadApp.ts`, `ReloadPrompt.tsx` under `src/pwa/`; `generate-sw.mjs` under `scripts/`).
2. Prepend the generator to the build and gitignore the output:
   - **Next:** `"build": "node scripts/generate-sw.mjs && next build"`
   - **Vite:** `"build": "node scripts/generate-sw.mjs && vite build"`
   - `.gitignore`: `/public/sw.js`
3. Render `<ReloadPrompt />` once at the app root; wrap the logo in a button calling `reloadApp()`.

`generate-sw.mjs` writes to `<root>/public/sw.js`, which both Next and Vite serve at `/sw.js` and copy into the build output. No dependencies are added; **do not** install `@serwist/*`, `next-pwa`, `vite-plugin-pwa`, or `workbox-*`.

## Wiring — Next.js (App Router)

- Put `reloadApp.ts` / `ReloadPrompt.tsx` under `src/app/pwa/`.
- Root `app/layout.tsx`: render `<ReloadPrompt/>` in `<body>`, add `viewportFit: "cover"` to the `viewport` export. See `assets/snippets/layout.tsx`.
- Add `app/manifest.ts` (`assets/snippets/manifest.ts`) → `/manifest.webmanifest`.
- **Middleware:** exclude `/sw.js` and `/manifest.webmanifest` from the matcher (else unauthenticated requests redirect to `/login` and SW registration breaks):
  `"/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"`
- Keep the existing build tool (Turbopack). **Do not** switch to `--webpack`.

## Wiring — Vite + React

- Put `reloadApp.ts` / `ReloadPrompt.tsx` under `src/pwa/`.
- Render `<ReloadPrompt/>` at the app root (e.g. `src/App.tsx`) and wire the logo to `reloadApp()`. See `assets/snippets/vite-App.tsx`. Tip: gate the banner with `import.meta.env.PROD` so it doesn't appear during `vite dev`.
- `index.html` `<head>`: add `<link rel="manifest" href="/manifest.webmanifest">` and `viewport-fit=cover`. See `assets/snippets/vite-index.html`.
- Add a static `public/manifest.webmanifest` (`assets/snippets/vite-manifest.webmanifest`).
- No middleware/SSR concerns (static SPA). React Router client navigation is unaffected (the SW has no `fetch` handler).

## Visible version stamp (build timestamp in the UI)

Always surface a **human-readable version** somewhere persistent in the UI (footer, sidebar
bottom, settings). It lets you and users confirm at a glance whether a device actually picked up
the latest deploy — the single most useful signal when debugging "did the update land?". Use a
**build timestamp** (not just the git SHA, which means nothing to end users). Recommended format
`ver.yyyy-mm-dd hh:MM` in the app's local timezone.

Expose the timestamp as a build-time constant so it's baked into the bundle (no runtime clock,
identical for every viewer):

- **Next.js** — compute it in `next.config.ts` and pass through `env` so
  `process.env.NEXT_PUBLIC_BUILD_TIME` is inlined at build. See
  `assets/snippets/next-config-build-time.ts`. Then render it, e.g. at the bottom of the sidebar:
  ```tsx
  <div className="text-xs text-gray-400">
    ver.{process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev"}
  </div>
  ```
  `next.config` runs on every `next build` (including the opennext/Cloudflare build), so the stamp
  refreshes each deploy. Format in a fixed timezone (e.g. `Asia/Tokyo`) via `Intl.DateTimeFormat`
  so it doesn't depend on the build machine's TZ.
- **Vite** — inject via `define` in `vite.config.ts`:
  `define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) }` (add a `declare const
  __BUILD_TIME__: string;`), then format for display.

Note this is a *display* value; update **detection** still rides on the version-stamped SW
(`SW_VERSION`). The two are independent and don't need to match.

## Verify

`npm run build` must pass and emit `public/sw.js` **without a `fetch` handler**:
`grep -c 'addEventListener("fetch"' public/sw.js` → `0`.
For a real check, drive a headless browser against the prod build: confirm the SW registers, client navigation still works, then bump `SW_VERSION` on disk + call `registration.update()` and confirm the banner appears and the update button reloads. The full cross-deploy update flow only truly exercises across **two real deployments**.

## Design notes / gotchas (learned the hard way)

- **No `fetch` handler = cannot break navigation.** Keep it that way; never add runtime/navigation caching to this SW.
- **iOS standalone: the update button must reload synchronously.** iOS Safari (home-screen) doesn't reliably fire `controllerchange`, so relying on it makes the button look dead. The banner posts `SKIP_WAITING` best-effort then calls `window.location.reload()` synchronously, with a large tap target + `touch-action: manipulation`.
- **Update detection needs the SW script to change per deploy** — that's why `SW_VERSION` is stamped. Browsers fetch the SW script bypassing the HTTP cache, so a new deploy is picked up on the next update check (navigation, or the ~1-min poll in `ReloadPrompt`).
- **First install must not auto-reload.** `ReloadPrompt` guards its `controllerchange` reload behind "was there a controller at mount?".
- **Recovering a fleet stuck on a bad (caching) SW:** deploy a `/sw.js` that unregisters itself + clears caches (kill-switch), or deploy this minimal SW (it replaces the bad one and, having no `fetch` handler, restores navigation). iOS may need a full quit+relaunch to pick up the new SW.

## Files in this skill

| File | Purpose |
| --- | --- |
| `assets/generate-sw.mjs` | Build-time generator for `public/sw.js` (minimal, no `fetch`, version-stamped). Shared. |
| `assets/reloadApp.ts` | `reloadApp()` tap-to-refresh. Shared. |
| `assets/ReloadPrompt.tsx` | `<ReloadPrompt />` update banner (synchronous-reload button for iOS). Shared. |
| `assets/snippets/layout.tsx` | **Next.js** root-layout wiring reference. |
| `assets/snippets/manifest.ts` | **Next.js** `app/manifest.ts` reference. |
| `assets/snippets/vite-App.tsx` | **Vite** app-root wiring reference (ReloadPrompt + logo). |
| `assets/snippets/vite-index.html` | **Vite** `index.html` `<head>` additions (manifest link + viewport). |
| `assets/snippets/vite-manifest.webmanifest` | **Vite** static web-app-manifest. |
| `assets/snippets/next-config-build-time.ts` | **Next.js** `next.config.ts` exposing `NEXT_PUBLIC_BUILD_TIME` (visible version stamp). |
