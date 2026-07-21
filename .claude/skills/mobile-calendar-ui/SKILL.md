---
name: mobile-calendar-ui
description: >-
  Build a mobile-first month calendar in React/Next.js + Tailwind where each day
  cell shows per-day content (shifts, events, tasks, work entries) — the pattern
  behind this app's シフト予定表 and 勤務表. Use this whenever building or refining ANY
  month-grid calendar UI: Japanese-holiday-aware red weekend/holiday coloring,
  fitting event/task badges into tight day cells, balancing font sizes and
  centering, cell borders/outlines/padding, left/right swipe to change months
  with a finger-following slide animation, blanking stale content during the
  transition, and the "tap a day → detail panel opens below (mobile) or beside
  it (desktop)" master-detail UX. Reach for this even when the user only says
  "calendar", "月表示", "シフト表", "カレンダーのスワイプ", "祝日を赤く", or "日をタップして詳細",
  and don't reinvent the swipe/animation logic — a ready hook is bundled here.
---

# Mobile-first month calendar UI/UX

This skill captures the calendar patterns that were refined over many rounds of
real-device testing for this payroll app's **シフト予定表 (shift roster)** and
**勤務表 (timesheet)**. Both share one layout: a 7-column month grid on the left/top,
a detail panel on the right/bottom, holiday-aware coloring, per-day content inside
each cell, and swipe-to-change-month with a follow-the-finger slide.

The guiding principle throughout is **density without clutter**: phone screens are
narrow, so every millimeter of padding and every font-size point is deliberate.
Prefer the concrete values below as starting points — they are what actually looked
right on an iPhone — and adjust from there rather than starting from framework defaults.

Reference implementations in this repo:
- `src/app/admin/shifts/ShiftSchedule.tsx` — the richest example (multi-person day cells, editable).
- `src/app/(employee)/timesheet/ui.tsx` — single-user variant with a per-day input form.
- `src/lib/useSwipeNav.ts` — the swipe/animation hook (also bundled at `assets/useSwipeNav.ts`).

---

## 1. Overall layout: master-detail that reflows by breakpoint

The calendar and its detail panel live in one responsive container. On desktop they
sit side by side (two columns); on mobile they stack, so the detail appears *directly
below* the calendar — which is exactly where a thumb expects it after tapping a day.

```tsx
<div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:items-start">
  <div className="space-y-4">{/* period nav + calendar + legend */}</div>
  <div className="lg:sticky lg:top-20">{/* detail panel */}</div>
</div>
```

`lg:items-start` + `lg:sticky lg:top-20` keeps the detail panel pinned while the
calendar column scrolls on desktop, without affecting the stacked mobile flow.

---

## 2. Holiday- and weekday-aware red/blue coloring

Japanese calendars color **Sundays and public holidays red, Saturdays blue**. Holidays
are not derivable from the weekday, so pass in a `Record<"YYYY-MM-DD", holidayName>`
map (this repo fetches it via `src/lib/holidays.ts`). Apply the same rule in two places:
the weekday header row and each day number.

```tsx
// Weekday header (index 0 = Sunday, 6 = Saturday)
{WEEKDAYS.map((w, i) => (
  <div className={`py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}>{w}</div>
))}

// Day number — holiday OR Sunday → red, Saturday → blue, else neutral
const isHoliday = !!holidays[date];
const textColor =
  isHoliday || dow === 0 ? "text-red-500"
  : dow === 6 ? "text-blue-500"
  : "text-gray-700";
```

Put the holiday **name** on the cell's `title={holidays[date]}` so it surfaces on
hover/long-press without spending vertical space in the cell. When a day is *selected*
and inverts to a colored background, drop the red/blue text color (it clashes with the
fill) — selection state wins over holiday coloring.

---

## 3. Fitting per-day content (events / tasks / shifts) into a cell

This is the hardest part on mobile: cells are ~45px wide and you may need to show
several items. What worked here:

- **Give the cell a floor, not a fixed height**: `min-h-16 sm:min-h-20`. Content grows
  the cell; empty cells stay compact and the grid rows stay even.
- **Center the day number, left-align the content** below it. The number is a landmark
  (scan-and-center), the content is a list (read left-to-right).
- **Each item is a full-width color band**, not free text — `block w-full truncate`.
  Truncation is a feature: it guarantees one item = one line, so N items = N predictable
  lines. A `title` attribute carries the full text for anyone who needs it.
- **Tiny type, tight leading**: `text-[9px] leading-tight sm:text-[10px]`. Yes, that is
  small — it is legible on a phone and lets ~5 Japanese characters fit per band.
- **Encode a category by vertical position** when items belong to fixed buckets. The
  shift roster stacks three sub-rows per cell (早番 / 遅番 / 深夜) so a person's row
  position alone communicates their shift slot — no label needed inside the cramped band.
- **Color = identity**: each person/category gets a stable background color
  (`backgroundColor: m.color`), so the eye groups by color across days.
- **Let bands touch the cell edges** (`p-0` on the button, `gap-px` between bands). In a
  dense calendar, breathing room *inside* a cell costs a whole character of width; spend
  it on content and let the cell borders do the separating.

```tsx
<div className="flex flex-1 flex-col gap-px">
  {BUCKETS.map((k) => (
    <div key={k} className="flex min-h-[15px] flex-col gap-px">
      {itemsByBucket(date, k).map((it) => (
        <span
          key={it.id}
          className="block w-full truncate text-[9px] leading-tight sm:text-[10px]"
          style={{ backgroundColor: it.color, color: it.textColor }}
          title={it.fullLabel}
        >
          {it.shortLabel}
        </span>
      ))}
    </div>
  ))}
</div>
```

For a **single item per day** (like the timesheet's start/end time), you don't need
bands — a two-line `text-[10px]` block centered under the day number reads cleanly. Use
a small colored pill only for exceptional states (e.g. a missing clock-out shown as an
amber `退勤?` chip) so the exception pops against the calm default.

---

## 4. Fonts, weight, and centering — the balance that reads well

The instinct to make everything uniform is wrong for calendars; a clear **hierarchy**
is what makes a dense grid scannable. The scale that landed here:

| Element              | Classes                                         | Why |
|----------------------|-------------------------------------------------|-----|
| Period label (月見出し) | `text-xl font-extrabold text-blue-800`          | The anchor — biggest, boldest, colored. |
| Nav arrows ＜ ＞       | `text-2xl font-bold text-gray-600`              | Big tap target, but gray so it recedes vs. the label. |
| Weekday header       | `text-sm font-semibold text-gray-600` on `bg-gray-100` | A quiet ruler along the top. |
| Day number           | `text-base font-bold sm:text-lg`                | Second-loudest; the thing you scan for. |
| In-cell content      | `text-[9px]–text-[10px] leading-tight`          | Detail tier — deliberately small. |
| Legend / notes       | `text-xs text-gray-600`                         | Reference tier, below the fold of attention. |

Centering rules: **center landmarks, left-align lists.** Day numbers and the period
label are centered; multi-item cell content and the detail panel are left-aligned.
Weekday headers are centered because they must align to the columns beneath them.

Keep the period-nav row on **one line even on the narrowest phone**: shrink the label to
`text-xl` (not 2xl/3xl), make arrows `shrink-0`, and push any trailing element
(employee name, section title) to the right with `ml-auto`. A calendar header that wraps
to two lines feels broken.

---

## 5. Cell borders, outlines, and the frame

- **Frame the whole calendar** with a strong rounded border so it reads as one object:
  `rounded-xl border-2 border-gray-400 bg-white p-0.5 sm:p-2`. Tighter padding on phones
  (`p-0.5`) buys precious width; loosen it at `sm:`.
- **Separate cells with hairlines**, not gaps: `border border-gray-100` on each cell.
  Hairlines cost zero layout space and keep the grid rhythm; gaps waste width.
- **Today**: a soft fill (`bg-gray-100`) — present but not shouting.
- **Selected day**: a ring that sits *above* neighbors, `z-10 ring-2 ring-blue-500`.
  A ring (outline) doesn't shift layout the way a border-width change would, so nothing
  reflows when selection moves. In the single-item timesheet variant, selection instead
  inverts the cell to `bg-blue-600 text-white` — either works; pick inversion when cells
  are mostly empty, a ring when cells are content-dense (so you don't hide the content).

---

## 6. Swipe to change month + follow-the-finger animation

**Don't hand-roll this — use the bundled `assets/useSwipeNav.ts`** (already living at
`src/lib/useSwipeNav.ts` in this repo). It encodes several lessons that are easy to get
wrong. Read `references/swipe-hook.md` for the full rationale; the essentials:

- **The animation is the point.** Before it existed, tapping the ＜＞ arrows felt like a
  dead press: tap → nothing → (data loads) → jump. The fix wasn't to make data faster —
  it was to give the finger something that moves *immediately*. During the drag the
  calendar tracks the finger 1:1 with `transition:none`; on release it either slides the
  rest of the way out and navigates, or snaps back. The perceived latency disappears
  because the user is watching motion the whole time the fetch happens underneath.
- **Distinguish swipe from scroll.** Only treat a gesture as horizontal navigation when
  `|dx| > |dy|` and `|dx|` clears a ~50px threshold. Otherwise it's a vertical scroll and
  you must ignore it, or the page becomes impossible to scroll.
- **Clip the slide-out.** The outgoing month translates a full viewport width; wrap the
  calendar in a plain `overflow-hidden` div so that never spawns a horizontal scrollbar.
- **Slide the new month IN, not just the old one OUT.** After navigating, place the
  incoming month just off the opposite edge (no transition), then on the next frame
  animate it to center. Two nested `requestAnimationFrame`s are needed so the browser
  paints the off-screen position before the transition starts — one frame isn't enough.
- **Blank stale content during the transition.** This is subtle and important. After
  `router.push`, the *old* month's data is still in memory until the server re-renders
  with the new period, so without care the new month slides in showing last month's
  entries for a beat. The hook exposes a `blank` flag: it's `true` from the moment a drag
  starts, and flips back to `false` only when the `resetKey` you pass (the period key)
  actually changes — i.e. the new data has arrived. While `blank`, render each cell's
  day number and frame but **skip its content** (`const items = swipe.blank ? undefined
  : itemsFor(date)`). The result: a clean empty calendar slides in, then fills with the
  correct month's content the instant it loads.

Wiring it up:

```tsx
const swipe = useSwipeNav(
  () => router.push(hrefForMonth(+1)),  // swipe left  → next month
  () => router.push(hrefForMonth(-1)),  // swipe right → prev month
  period.key                            // resetKey: clears `blank` when data arrives
);

<div className="overflow-hidden">
  <div className="rounded-xl border-2 border-gray-400 bg-white p-2"
       style={swipe.style} {...swipe.handlers}>
    {/* ...cells; use swipe.blank to hide per-day content mid-transition... */}
  </div>
</div>
```

Keep the ＜＞ arrow buttons too — they call the same navigation. Swipe and buttons are
complementary: swipe is the natural phone gesture, the arrows are the discoverable/
desktop affordance and an accessibility fallback.

---

## 7. Tap a day → detail below (mobile) / beside (desktop)

The whole calendar is a picker; the real work happens in the detail panel. Keep the
selected date in one piece of state and let the panel react to it.

- **`selected: string | null`** lives in the calendar component. Tapping a day toggles
  it (`setSelected(isSelected ? null : date)`) so tapping the same day again closes the
  panel.
- **Render the day cell as a `<button>`**, not a div — free keyboard focus, Enter/Space
  activation, and correct semantics. (Note: a real *tap* barely moves, so it never trips
  the swipe threshold; tap and swipe coexist on the same element without conflict.)
- **The panel is a sibling in the detail column**, so on mobile it appears right under
  the calendar and on desktop beside it — no modal, no route change. A modal would hide
  the calendar the user is comparing against; inline keeps both visible.
- **Empty state matters**: when nothing is selected, show a quiet placeholder
  ("日付を選ぶと、その日の詳細を表示します") rather than a blank void, and tailor its wording to
  whether the panel will be editable ("…を編集できます" vs "…を確認できます").
- **After an edit, refresh in place**: on a successful server action call
  `router.refresh()` (and clear `selected` if the edit closes the panel). Surface the
  result inline as a one-line message — green for success, red for failure —
  `className={result.ok ? "text-green-700" : "text-red-600"}`.

This master-detail split keeps each surface simple: the grid answers "which day?", the
panel answers "what about it?", and neither has to do both.

---

## Bundled resources
- `assets/useSwipeNav.ts` — copy into `src/lib/` (or your equivalent). The swipe +
  slide-animation + blank-during-transition hook described in §6.
- `references/swipe-hook.md` — deeper notes on why the hook is built the way it is
  (rAF double-frame, blank/resetKey timing, threshold tuning). Read it before modifying
  the hook.
