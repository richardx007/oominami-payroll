---
name: pwa-auto-update
description: Add a battle-tested PWA update UX to a Next.js (App Router) + React app — a logo/button tap that refreshes to the latest version, and an "update available" banner prompting a one-tap update. Built as a minimal, cache-free service worker that NEVER intercepts navigation, so it is safe on Cloudflare Workers / opennext (where cache-based service workers break App Router navigation). Use this whenever the user wants to add or port PWA update prompts, a "new version available" toast/banner, one-tap or tap-to-refresh updating, service-worker skipWaiting/update handling, or fix "This page couldn't load" on every menu tap after adding a PWA/service worker, in a Next.js + React (App Router) project. Trigger even if the user only describes the symptom ("users don't get the new version until I reload", "menu navigation shows 'This page couldn't load' after I added a PWA").
---

# PWA Auto-Update (Next.js App Router — minimal, cache-free SW)

Give a Next.js (App Router) PWA two things:

1. **"Update available" banner** (`ReloadPrompt.tsx`) — detects a new deploy and lets the user update with one tap.
2. **Tap-to-refresh** (`reloadApp.ts`) — wire to a logo/button; activates a waiting new version and reloads.

The service worker is **generated at build time** (`generate-sw.mjs`) and is deliberately **minimal: it has NO `fetch` handler and caches nothing.** Its only jobs are (a) letting the browser detect a new version (via a stamped `SW_VERSION`) and (b) honoring `SKIP_WAITING`. Because it never intercepts requests, it cannot break navigation, and because it caches nothing, the app is always served fresh from the server — normal navigation already gets the latest; the banner/logo-tap are the "update right now" affordances.

> **Why not `@serwist/next` / `next-pwa` / Workbox `defaultCache`?**
> This skill was first built on `@serwist/next`. On **Cloudflare Workers + opennext** it caused a production outage: `defaultCache` intercepts same-origin navigations and RSC requests with `NetworkFirst`, and **every App Router menu tap failed with "This page couldn't load"** (only a hard reload worked). It also forces a `webpack` build (`@serwist/next` doesn't support Turbopack), swapping out Next 16's default build — another risk. The minimal cache-free SW below avoids **both** failure modes and is host-agnostic. Only reach for a caching SW (Serwist/Workbox) if you genuinely need offline support AND have verified navigation/RSC caching on your actual host.

## Before you start: confirm the project fits

- Next.js **App Router** (`app/` dir). Find the root `app/layout.tsx` and where the app logo/header lives.
- No extra runtime deps are needed (plain `navigator.serviceWorker`). **Do not** add `@serwist/*`, `next-pwa`, or `workbox-*`.
- **Keep the existing build tool.** If the project builds with Turbopack (`next build` on Next ≥16), leave it. Do **not** switch to `--webpack`.
- **Cloudflare / opennext note:** the SW is emitted to `public/sw.js` and served as a static asset. If the project has middleware, make sure `/sw.js` and `/manifest.webmanifest` are **excluded from the middleware matcher** (otherwise unauthenticated requests get redirected to `/login` and SW registration breaks).

## Integration steps

Do these in order; keep the project building (`npm run build`) after each.

### 1. Copy the files

- `assets/reloadApp.ts` → `src/app/pwa/reloadApp.ts`
- `assets/ReloadPrompt.tsx` → `src/app/pwa/ReloadPrompt.tsx`
- `assets/generate-sw.mjs` → `scripts/generate-sw.mjs`

### 2. Generate the SW at build time

Prepend the generator to the build script so `public/sw.js` is (re)written before Next builds, and gitignore the generated file:

```jsonc
// package.json
"scripts": { "build": "node scripts/generate-sw.mjs && next build" }
```
```gitignore
/public/sw.js
```

`generate-sw.mjs` stamps `SW_VERSION` with the git short SHA (fallback: `Date.now()`), so each deploy produces a byte-different `/sw.js` → the browser detects an update → the banner shows. The generated SW has **no `fetch` listener**; on `activate` it clears any stale caches (e.g. from a previous Serwist install) and `clients.claim()`s.

### 3. Add the web app manifest (optional but recommended)

Add `app/manifest.ts` from `assets/snippets/manifest.ts` (served at `/manifest.webmanifest`; Next injects the `<link>`). Fill in name/colors/icons.

### 4. Wire the root layout

From `assets/snippets/layout.tsx`: render `<ReloadPrompt />` inside `<body>`, and add `viewportFit: "cover"` to the `viewport` export for iOS safe areas. **No boot splash / watchdog is needed** with a cache-free SW (there's no stale-chunk blank-screen failure mode to recover from).

### 5. Wire tap-to-refresh on the logo

Wrap the app logo in a client `LogoButton` that calls `reloadApp()` (see the comment at the bottom of `assets/snippets/layout.tsx`). Place it in the admin/employee headers.

### 6. Exclude `/sw.js` & `/manifest.webmanifest` from middleware (if any)

```ts
// middleware matcher — add sw.js and manifest.webmanifest to the negative lookahead
"/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
```

### 7. Verify

`npm run build` must pass and emit `public/sw.js` **without a `fetch` handler** (`grep -c 'addEventListener("fetch"' public/sw.js` → 0). For a real check, drive a headless browser against `npm run start`: confirm the SW registers, client-side navigation still works, then bump `SW_VERSION` on disk + call `registration.update()` and confirm the banner appears and "更新" reloads. Note the full cross-deploy update flow only truly exercises across **two real deployments**.

## Design notes / gotchas (learned the hard way)

- **No `fetch` handler = cannot break navigation.** This is the whole point. Keep it that way. Do not add runtime/navigation caching to this SW.
- **iOS standalone: the update button must reload synchronously.** iOS Safari (standalone/home-screen) does **not** reliably fire `controllerchange`, so relying on it to trigger the reload makes "更新" look dead. The banner's button therefore posts `SKIP_WAITING` best-effort and then calls `window.location.reload()` **synchronously** in the click handler. It also uses a large tap target + `touch-action: manipulation`. (`reloadApp()` for the logo keeps a fallback timer for the same reason.)
- **Update detection needs the SW script to change per deploy.** That's why `SW_VERSION` is stamped. A byte-identical `/sw.js` would never trigger an update. Browsers fetch the SW script bypassing the HTTP cache (default `updateViaCache: 'imports'`), so a new deploy is picked up on the next update check (navigation, or the ~1-minute poll in `ReloadPrompt`).
- **First install must not auto-reload.** `ReloadPrompt` guards its `controllerchange` reload behind "was there a controller at mount?" so the very first install (via `clients.claim()`) doesn't spuriously reload.
- **Recovering a fleet stuck on a bad (caching) SW:** deploy a `/sw.js` that unregisters itself and clears caches (kill-switch), or — as here — deploy this minimal SW, which replaces the bad one and, having no `fetch` handler, immediately restores navigation. iOS may need a full quit+relaunch (or Settings → Safari → Website Data) to pick up the new SW.

## Files in this skill

| File | Purpose |
| --- | --- |
| `assets/generate-sw.mjs` | Build-time generator for `public/sw.js` (minimal, no `fetch`, version-stamped). |
| `assets/reloadApp.ts` | `reloadApp()` — tap-to-refresh for the logo (SKIP_WAITING → controllerchange → reload, with fallback timer). |
| `assets/ReloadPrompt.tsx` | `<ReloadPrompt />` update banner (plain `navigator.serviceWorker`; synchronous-reload button for iOS). |
| `assets/snippets/layout.tsx` | Root-layout wiring reference (`<ReloadPrompt/>` + `viewport-fit`, LogoButton sketch). |
| `assets/snippets/manifest.ts` | `app/manifest.ts` web-app-manifest reference. |
