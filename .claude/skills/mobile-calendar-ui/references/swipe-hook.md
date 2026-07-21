# `useSwipeNav` — design notes

This documents *why* the swipe hook (`assets/useSwipeNav.ts`) is shaped the way it is.
Read this before changing it; several parts look removable but each fixes a real bug
that showed up on-device.

## Signature

```ts
const swipe = useSwipeNav(onSwipeLeft, onSwipeRight, resetKey);
// returns: { blank: boolean, handlers: {...touch handlers}, style: React.CSSProperties }
```

- `onSwipeLeft` — fired when the user swipes left (natural gesture for "next month").
- `onSwipeRight` — fired for "previous month".
- `resetKey` — the current period key (e.g. `period.key`). The hook watches this to know
  when the *newly navigated* month's data has actually loaded. See "Blank timing" below.

Apply `style={swipe.style}` and `{...swipe.handlers}` to the moving element, wrap that
element in an `overflow-hidden` parent, and gate per-cell content on `swipe.blank`.

## Why each piece exists

### Follow-the-finger drag (`onTouchMove` sets `translateX(dx)`, `transition:none`)
The original complaint was that changing months felt like a dead press — tap the arrow,
a beat of nothing, then a jump. Real latency (a server round-trip for the new month) is
unavoidable, but *perceived* latency is not: if the calendar moves with the finger from
frame one, the user is watching motion during the entire fetch and never perceives a
stall. During the drag we must disable the CSS transition (`transition:none`), otherwise
the element lags the finger.

### Swipe-vs-scroll discrimination
A month grid is vertically scrollable content. If any horizontal-ish drag navigated, the
page would be unscrollable. So a gesture only counts as navigation when the horizontal
movement dominates (`|dx| > |dy|`) and exceeds a threshold (~50px). Below threshold or
mostly-vertical → treat as scroll, snap back to center, do nothing. There's also a small
(~10px) dead zone before we commit to "this is a drag" at all, so taps don't jitter.

### Release: slide-out vs snap-back
On `onTouchEnd`, if the swipe cleared the threshold we finish the motion — animate the
element the rest of the way off-screen in the swipe direction, then navigate. If it
didn't, we animate back to `translateX(0)` (snap-back) and restore content. Turning the
transition back on here is what makes both the completion and the snap-back smooth.

### Slide the incoming month IN (the double `requestAnimationFrame`)
After navigating we don't just reset to center — that would pop. Instead:
1. Turn off the transition and jump the element to just off the *opposite* edge
   (`-dir * width`), so the new month is staged off-screen.
2. `requestAnimationFrame` → `requestAnimationFrame` → turn the transition on and set
   `translateX(0)`.

Two nested rAFs are required, not one. The browser needs to actually paint the staged
off-screen position before we start the transition; scheduling the change one frame later
isn't reliably after that paint, so a single rAF sometimes skips the slide-in and pops.
The double rAF guarantees a painted start frame, so the transition always runs.

### `blank` + `resetKey` timing (the stale-content fix)
`router.push` changes the URL and triggers a server re-render, but for a moment the React
tree still holds the *previous* month's data. Without intervention, the freshly
slid-in calendar shows last month's entries for a beat, then swaps — visually jarring.

The hook fixes this with a `blank` flag consumed by the caller to hide per-cell content:
- Set `blank = true` the instant a drag begins.
- Keep it `true` through the slide-out, navigation, and slide-in.
- Flip it back to `false` only when `resetKey` changes — a `useEffect([resetKey])` — which
  happens exactly when the new period's data has arrived and re-rendered.

So the caller does `const items = swipe.blank ? undefined : itemsFor(date)` and renders
only day numbers + frame while `blank`. The empty calendar slides in, and content appears
the moment real data lands. If you ever see the wrong month's content flash during a
swipe, the cause is almost always that `resetKey` isn't the value that changes on
navigation, or the caller forgot to gate content on `blank`.

## Tuning knobs
- **Threshold** (default 50px): raise it if accidental swipes are firing, lower it if
  swipes feel unresponsive.
- **Animation duration** (default `0.18s ease-out` in `style.transition`): the whole
  gesture should feel quick. Above ~0.25s it starts to feel sluggish.
- **Slide-out delay** (the `setTimeout` before navigating, ~180ms): should roughly match
  the animation duration so navigation fires as the old month finishes leaving.

## Non-obvious gotchas
- The moving element and the touch-handler element are the same node — that's fine; a tap
  moves too little to cross the threshold, so tap-to-select and swipe-to-navigate coexist.
- Keep the explicit ＜＞ buttons calling the same navigation. They're the desktop/
  discoverable/accessible path; swipe is a mobile enhancement, not a replacement.
- The hook is client-only (`"use client"`), uses `window`/`requestAnimationFrame`, and
  must not run its measurements during SSR.
