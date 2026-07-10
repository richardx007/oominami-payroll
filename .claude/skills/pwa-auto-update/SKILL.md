---
name: pwa-auto-update
description: Add a battle-tested PWA auto-update UX to a Next.js (App Router) + React app — an "update available" banner for one-tap updating, a logo/button tap that safely refreshes to the latest version, and automatic recovery from the blank/black screen that sometimes appears right after a PWA updates (especially on iOS/iPadOS). Use this whenever the user wants to add or port PWA update prompts, a "new version available" toast/banner, one-tap or tap-to-refresh updating, service worker skipWaiting/update handling, or fix a blank/white/black screen after a PWA or service worker update, in a Next.js + React (App Router, + @serwist/next) project. Trigger even if the user only describes the symptom ("my PWA goes blank after updating", "users don't get the new version until I reload a bunch") without naming the mechanism.
---

# PWA Auto-Update (Next.js App Router + Serwist)

Add a small, self-contained kit to a Next.js (App Router) PWA so users reliably get new versions. It provides three things:

1. **"Update available" banner** (`ReloadPrompt.tsx`) — detects a new service worker and lets the user update with one tap.
2. **Tap-to-refresh** (`reloadApp.ts`) — wire to a logo or button; safely activates a waiting new version and reloads.
3. **Blank-screen auto-recovery** — a boot splash + watchdog in the root `layout.tsx` plus `pwaRecovery.ts` / `PwaBoot.tsx`, so a botched update self-heals instead of leaving a black/white screen.

The bundled files live in `assets/`. Service Worker generation uses **`@serwist/next`** (Workbox-based, App Router compatible); the client pieces depend only on React + `@serwist/window`.

> This is the **Next.js** variant. There is a separate Vite + `vite-plugin-pwa` lineage this was ported from; the concepts are identical, only the SW plumbing differs (Serwist instead of vite-plugin-pwa, `layout.tsx` instead of `index.html`, `ChunkLoadError` instead of `vite:preloadError`).

## Before you start: confirm the project fits

This kit targets **Next.js (App Router) + React**. Verify before changing anything:

- There is a `next.config.*` and the `app/` directory (App Router). If it's a `pages/` router or a non-Next React app, stop and adapt — the layout/manifest wiring differs.
- Check dependencies. Plan to add: `npm i -D @serwist/next serwist` and `npm i @serwist/window`.
- Find the root `app/layout.tsx`, where the app logo/header lives (for tap-to-refresh), and any existing `viewport`/`metadata` exports so you merge rather than overwrite.
- **Cloudflare Workers note:** if the app deploys via `@opennextjs/cloudflare` (check for `wrangler`/`open-next` in the repo), the SW is emitted to `public/sw.js` and served as a static asset. This works, but the update flow can only be truly verified across two real deployments — flag that to the user.

Don't assume paths — inspect the repo first. Match the surrounding code's conventions (this repo uses double quotes, brand navy `#152449`, and `public/logo.svg`).

## Integration steps

Do these in order. After each edit, keep the project building (`npm run build`).

### 1. Install dependencies

```
npm i -D @serwist/next serwist
npm i @serwist/window
```

### 2. Copy the source files

Copy from this skill's `assets/` into the project, conventionally under `app/pwa/`:
`reloadApp.ts`, `ReloadPrompt.tsx`, `pwaRecovery.ts`, `PwaBoot.tsx`, `pwa-globals.d.ts`.

Make sure `pwa-globals.d.ts` is covered by the project's `tsconfig.json` `include` (Next's default `**/*.ts` covers it). Also copy `assets/snippets/sw.ts` to **`app/sw.ts`** (the SW source; not under `pwa/` because `swSrc` points at it directly).

### 3. Configure `@serwist/next` (`registerType`-equivalent = manual prompt)

Wrap the existing `nextConfig` with `withSerwistInit`. See `assets/snippets/next.config.ts`. Key options:

- `swSrc: "app/sw.ts"`, `swDest: "public/sw.js"` (matches `ReloadPrompt`'s `swUrl` default `/sw.js`).
- `register: false` — **essential**. Registration is handled by `ReloadPrompt` via `@serwist/window` so the update is user-controlled. Letting `@serwist/next` auto-register would double-register and bypass the banner.
- `disable: process.env.NODE_ENV === "development"` — keeps SW out of the dev loop.

The SW itself (`app/sw.ts`, from `assets/snippets/sw.ts`) uses `skipWaiting: false` so a new version waits until the user taps update. `serwist.addEventListeners()` includes the `SKIP_WAITING` message handler that both the banner (`messageSkipWaiting()`) and `reloadApp()` rely on.

> **Do NOT use `@serwist/next`'s `defaultCache` on Cloudflare Workers / opennext.** `defaultCache` intercepts same-origin navigations (HTML) and RSC requests with `NetworkFirst` — it is tuned for Vercel/Node and, on Cloudflare + opennext, breaks App Router client navigation (every menu tap shows "This page couldn't load"; a hard reload works). `assets/snippets/sw.ts` therefore ships a **navigation-safe** `runtimeCaching`: it caches only static assets (`/_next/static`, images/fonts/CSS) and leaves navigations, RSC, and API requests untouched (`NetworkOnly`). Keep it that way unless you are on Vercel/Node and have verified `defaultCache` works there.

### 4. Add the web app manifest

Add `app/manifest.ts` from `assets/snippets/manifest.ts` (Next serves it at `/manifest.webmanifest` and injects the `<link>` automatically). Fill in name/colors from the project and point `icons` at real PNGs (add 192/512 icons to `public/` if absent).

### 5. Edit the root `layout.tsx` (splash + watchdog + mounts)

From `assets/snippets/layout.tsx`, merge into the existing `app/layout.tsx`:

- The **watchdog** inline `<script>` in `<head>` (raw `<script dangerouslySetInnerHTML>`, not `next/script`) — it reloads once if the app hasn't mounted after ~6s. It must be inline so it runs even if the main bundle fails.
- The **boot-splash** `<div id="boot-splash">` at the top of `<body>` — a branded loading overlay (swap logo path/background to match). `markAppMounted()` removes it on mount.
- Add `viewportFit: "cover"` to the `viewport` export for iOS standalone safe-areas.
- Render `<PwaBoot />` (recovery + mount flag) and `<ReloadPrompt />` inside `<body>`.

### 6. Wire tap-to-refresh

On the app logo (or a "refresh"/"check for updates" control), call `reloadApp()`:

```tsx
<button onClick={() => reloadApp()} aria-label="最新に更新">
  <Logo />
</button>
```

In this repo the logo lives in `src/app/admin/nav.tsx` (`Logo`) and the employee header — good targets.

### 7. Verify

Run `npm run build` and fix any type/import errors. A clean production build is the key gate; the full update flow only truly exercises across two real deployments (and, on Cloudflare, that `/sw.js` and `/manifest.webmanifest` return 200 in production).

## Why it's built this way (so you can adapt confidently)

- **`register: false` + `@serwist/window`** hands update timing to the user (banner) instead of silently reloading.
- **`reloadApp()`** avoids two failure modes: a plain `location.reload()` won't activate a waiting new service worker (user stays on the old version), while reloading *during* the new SW's install can serve a mismatched mix of old/new assets and paint a blank screen. So it sends `SKIP_WAITING`, waits for `controllerchange`, then reloads once (with a fallback timer). The SW honors `SKIP_WAITING` because Serwist's `addEventListeners()` registers that handler.
- **Splash + watchdog + `ChunkLoadError` capture** turn "rare hard-stuck blank screen after update" into "shows a logo, then self-reloads once." The splash removes the black paint; the watchdog recovers a never-mounted app; `installPwaRecovery` recovers a failed dynamic chunk import (Next's equivalent of Vite's `vite:preloadError`).

## Known caveats to tell the user

- The splash/watchdog only take effect **from the next update onward** — the copy carrying them has to land on the device first.
- If a device is *already* stuck blank (pre-kit), recovery is: force-quit and relaunch the PWA; if still stuck, iOS → Settings → Safari → Advanced → Website Data → delete the site's data → relaunch.
- On iOS standalone, `viewport-fit=cover` + `env(safe-area-inset-*)` padding on top bars keeps headers clear of the status bar.
- **Cloudflare / `@opennextjs/cloudflare`:** confirm the build emits `public/sw.js` into the deployed output and that `/sw.js` is served with a JS content-type at the site root (needed for root scope). If a custom route/middleware intercepts `/sw.js`, exclude it.

## Files in this skill

| File | Purpose |
| --- | --- |
| `assets/reloadApp.ts` | `reloadApp()` — safe tap-to-refresh (SKIP_WAITING → controllerchange → reload). Framework-agnostic. |
| `assets/ReloadPrompt.tsx` | `<ReloadPrompt />` update banner (client component); registers the SW via `@serwist/window`. Props for color/text/position/interval/swUrl. |
| `assets/pwaRecovery.ts` | `installPwaRecovery()` (ChunkLoadError capture) + `markAppMounted()`. |
| `assets/PwaBoot.tsx` | `"use client"` component that runs recovery + mount flag from `layout.tsx`. |
| `assets/pwa-globals.d.ts` | Type for `Window.__APP_MOUNTED__`. |
| `assets/snippets/next.config.ts` | `withSerwistInit({ register: false, … })` reference. |
| `assets/snippets/sw.ts` | Serwist SW source → copy to `app/sw.ts`. |
| `assets/snippets/layout.tsx` | Root layout with boot-splash + watchdog + `<PwaBoot/>` + `<ReloadPrompt/>`. |
| `assets/snippets/manifest.ts` | `app/manifest.ts` web app manifest reference. |
