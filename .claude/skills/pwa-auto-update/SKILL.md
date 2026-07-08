---
name: pwa-auto-update
description: Add a battle-tested PWA auto-update UX to a Vite + React app — an "update available" banner for one-tap updating, a logo/button tap that safely refreshes to the latest version, and automatic recovery from the blank/black screen that sometimes appears right after a PWA updates (especially on iOS/iPadOS). Use this whenever the user wants to add or port PWA update prompts, a "new version available" toast/banner, one-tap or tap-to-refresh updating, service worker skipWaiting/update handling, or fix a blank/white/black screen after a PWA or service worker update, in a Vite + React (+ vite-plugin-pwa) project. Trigger even if the user only describes the symptom ("my PWA goes blank after updating", "users don't get the new version until I reload a bunch") without naming the mechanism.
---

# PWA Auto-Update (Vite + React)

Port a small, self-contained kit into a Vite + React PWA so users reliably get new versions. It provides three things:

1. **"Update available" banner** (`ReloadPrompt.tsx`) — detects a new service worker and lets the user update with one tap.
2. **Tap-to-refresh** (`reloadApp.ts`) — wire to a logo or button; safely activates a waiting new version and reloads.
3. **Blank-screen auto-recovery** — a boot splash + watchdog in `index.html` plus `pwaRecovery.ts`, so a botched update self-heals instead of leaving a black/white screen.

The bundled files live in `assets/`. They depend only on React + `vite-plugin-pwa` (no Tailwind, no icon library) so they drop into any project.

## Before you start: confirm the project fits

This kit targets **Vite + React + `vite-plugin-pwa`**. Verify before changing anything:

- There is a `vite.config.*` and React is in `package.json`. If it's not a Vite + React app, stop and tell the user — the kit won't apply as-is.
- Check whether `vite-plugin-pwa` is a dependency. If missing, plan to add it (`npm i -D vite-plugin-pwa` and `npm i workbox-window`).
- Find the entry (usually `src/main.tsx`), the root component (`src/App.tsx`), the `index.html`, and where the app logo/header lives (for tap-to-refresh). Read them before editing so your edits match the project's existing style and structure.

Don't assume paths — inspect the repo first. Match the surrounding code's conventions when you wire things in.

## Integration steps

Do these in order. After each edit, keep the project building.

### 1. Copy the source files

Copy the four files from this skill's `assets/` into the project, conventionally under `src/pwa/`:
`reloadApp.ts`, `ReloadPrompt.tsx`, `pwaRecovery.ts`, `pwa-globals.d.ts`.

Make sure `pwa-globals.d.ts` is inside the TypeScript `include` glob (usually `src/**`). If the project is plain JS, drop the `.d.ts` and remove the TS-only bits.

### 2. Configure vite-plugin-pwa (`registerType: 'prompt'`)

Add `VitePWA({ registerType: 'prompt', manifest: {...} })` to the Vite `plugins` array. See `assets/snippets/vite.config.ts` for the shape. `prompt` is essential: `autoUpdate` would silently reload and defeat the whole point of user-controlled updating. Fill in `manifest` name/colors/icons from the project's existing assets.

### 3. Edit `index.html` (splash + watchdog)

From `assets/snippets/index.html`, add two things:

- The **boot-splash** `<div id="boot-splash">…</div>` **inside** `#root`, so the screen shows a branded loading state (not black) while JS loads. Swap the logo path and background color to match the app.
- The **watchdog** `<script>` right after `<head>` opens. It reloads once if the app hasn't mounted after ~6s — this is what rescues a hard-stuck blank screen, so it must be inline (it has to run even if the main bundle fails to load).

### 4. Wire the entry (`main.tsx`)

- Call `installPwaRecovery()` once, before `createRoot(...)`.
- Render `<ReloadPrompt />` alongside the app (e.g. just after `<App />`). Style it via props: `<ReloadPrompt accentColor="#2563eb" position="top" />`.

### 5. Signal successful mount (`App.tsx`)

In the root component's first-run effect, call `markAppMounted()`:

```tsx
useEffect(() => { markAppMounted() }, [])
```

This is the flag the watchdog checks; without it the watchdog would reload a perfectly healthy app.

### 6. Wire tap-to-refresh

On the app logo (or any "refresh"/"check for updates" control), call `reloadApp()`:

```tsx
<button onClick={() => reloadApp()} aria-label="Reload app (apply updates)"> <Logo/> </button>
```

### 7. Verify

Run the project's build (e.g. `npm run build`) and fix any type/import errors. If the app is easy to run locally and not behind auth, a quick smoke check is nice, but a clean production build is the key gate — the update flow only truly exercises across two real deployments.

## Why it's built this way (so you can adapt confidently)

- **`registerType: 'prompt'`** hands update timing to the user instead of silently reloading.
- **`reloadApp()`** avoids two failure modes: a plain `location.reload()` won't activate a waiting new service worker (user stays on the old version), while reloading *during* the new SW's install can serve a mismatched mix of old/new assets and paint a blank screen. So it sends `SKIP_WAITING`, waits for `controllerchange`, then reloads once (with a fallback timer for browsers that don't fire it). The generated SW must honor `SKIP_WAITING` — `vite-plugin-pwa`'s default `generateSW` does.
- **Splash + watchdog + `vite:preloadError`** turn "rare hard-stuck blank screen after update" into "shows a logo, then self-reloads once." The splash removes the black paint; the watchdog recovers a never-mounted app; `installPwaRecovery` recovers a failed lazy-chunk import.

## Known caveats to tell the user

- The splash/watchdog only take effect **from the next update onward** — the copy carrying them has to land on the device first.
- If a device is *already* stuck blank (pre-kit), recovery is: force-quit and relaunch the PWA; if still stuck, iOS → Settings → Safari → Advanced → Website Data → delete the site's data → relaunch. Re-adding to the home screen is not required.
- On iOS standalone, combine with `viewport-fit=cover` and `env(safe-area-inset-*)` padding on top bars so headers don't hide under the status bar.

## Files in this skill

| File | Purpose |
| --- | --- |
| `assets/reloadApp.ts` | `reloadApp()` — safe tap-to-refresh (SKIP_WAITING → controllerchange → reload). |
| `assets/ReloadPrompt.tsx` | `<ReloadPrompt />` update banner; props for color/text/position/interval. |
| `assets/pwaRecovery.ts` | `installPwaRecovery()` + `markAppMounted()`. |
| `assets/pwa-globals.d.ts` | Types: `virtual:pwa-register/react` + `Window.__APP_MOUNTED__`. |
| `assets/snippets/index.html` | Boot-splash + watchdog reference to merge into the app's `index.html`. |
| `assets/snippets/vite.config.ts` | `VitePWA({ registerType: 'prompt' })` reference. |
