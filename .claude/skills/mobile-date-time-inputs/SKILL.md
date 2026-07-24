---
name: mobile-date-time-inputs
description: >-
  Lay out native HTML date/time inputs (<input type="date">, "time",
  "datetime-local") in forms that will be used on phones — especially iOS
  Safari, where the native picker renders WIDER than a specified width and
  overflows or overlaps neighboring fields. Use this whenever you place a
  date or time field in a mobile-facing form or a responsive row of inputs,
  when a date/time field "はみ出す"/overflows its box, overlaps the next input,
  or forces the form to stack too tall — and when someone reports a
  layout bug on iPhone/iPad that a desktop browser doesn't reproduce. Reach
  for this even if the request is just "add a date field to this form",
  "適用開始日を入力欄に", "put the date and amount side by side", or "the
  date picker is spilling over on mobile". Don't hand-tune widths blind:
  the fix is a specific, repeatable pattern, and the bug can only be
  verified on a real iOS device.
---

# Native date/time inputs in mobile forms

Native `<input type="date">` / `type="time"` / `type="datetime-local"` are great
(they give users the OS picker for free), but on **iOS Safari** they behave unlike
text inputs and unlike the same elements on desktop Chrome/Firefox. Getting this
wrong produces a very specific, recurring bug: the field's contents spill out of
its rounded box, or the widget overlaps the input next to it, or — when you "fix"
it by stacking everything vertically — the form becomes absurdly tall on a phone.

This skill is the distilled fix. Two reference implementations live in this repo:
- `src/app/admin/employees/ui.tsx` — `historyDateClass` / `historyFieldClass`, the
  date-fixed-width + value-flex pattern (§2).
- `src/app/(employee)/timesheet/ui.tsx` — `timeInputClass`, the shrink-the-widget
  pattern for tight multi-column rows (§3).

## 1. Why it breaks (understand this before touching widths)

On iOS Safari, a date/time input renders a **native control sized to its content**
("2026/07/24" plus an internal stepper/disclosure). Crucially:

- It has a **hard intrinsic minimum width** and will **not shrink below it**, even
  with `width` set, `min-w-0`, `box-border`, or `overflow-hidden`. When the box you
  give it is narrower than that minimum, the digits render *outside* the box — that's
  the "はみ出し"/overflow you see, and it visually collides with the next field.
- Its intrinsic width is **larger than you'd guess** and larger than the same element
  on desktop, so a layout that looks perfect in a desktop browser is broken on iPhone.
- Because it won't shrink, the three "natural" mobile layouts all fail:
  - `w-full` inside `flex-col` → each field claims its own line → the form gets tall.
  - `grid grid-cols-2` (50/50) → on a narrow phone, 50% < the widget's minimum →
    overflow/overlap.
  - `flex-1` alone → flexbox tries to shrink it past its minimum → overflow.

The takeaway: **stop trying to make the date/time input fit an arbitrary width.
Instead, reserve the width it actually needs, and make the *other* fields flex.**

## 2. The primary pattern — reserve the picker's width, flex the rest

Give the date/time input a **fixed, comfortable width that fits the native widget**
and mark it `shrink-0` so flex can never squeeze it. Let sibling fields be
`flex-1 min-w-0` so they absorb the remaining space. Wrap the row in
`flex flex-wrap items-center gap-2` so it stays on one line when it fits and wraps
only when it genuinely must — not forced-stacked, not forced-side-by-side.

```tsx
// Comfortable widths that fit the iOS native widget with slack:
//   date "YYYY/MM/DD"      → w-36 (≈144px)   (go w-40 if you also show a label/icon)
//   time "HH:MM"           → w-24–w-28
//   datetime-local         → w-52–w-56
const dateClass  = "w-36 shrink-0 rounded-lg border px-2 py-2 text-sm ...";
const fieldClass = "min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm ...";

<div className="flex flex-wrap items-center gap-2">
  <input type="date" aria-label="適用開始日" className={dateClass} />
  <input type="number" placeholder="金額" className={fieldClass} />
</div>
```

Guidelines that make this robust:

- **`shrink-0` on the date/time input is the load-bearing part.** Without it, flexbox
  shrinks the input below the widget's minimum and you're back to overflow.
- **`min-w-0` on the flexible siblings**, so *they* (not the picker) give up space when
  the row is tight. A flex item defaults to `min-width: auto` and won't shrink below its
  content; `min-w-0` releases that.
- **`flex-wrap`, not `flex-col`.** Wrapping keeps short rows on one line and only breaks
  when the viewport truly can't hold them — you get compactness on normal phones and
  graceful degradation on tiny ones, without hard-coding a breakpoint.
- **Don't rely on inline `<label>text<input/></label>` to add width** around a date
  input; the label text eats into the row and pushes the picker into too little space.
  Prefer `aria-label` / `placeholder` on the control itself, or a label on its own line.
- **Many fields in one form?** Don't fight one giant wrapping row. Group into intentional
  short rows (e.g. row 1: `date + category`, row 2: `dependents + buttons`). Predictable
  beats clever-but-chaotic wrapping. The tax-history form in `employees/ui.tsx` does this.

## 3. The alternative pattern — shrink the widget when you *need* it narrow

Sometimes you genuinely need the field narrow — e.g. three time columns
(start / end / break) across one phone row, where reserving each picker's full natural
width won't fit. You can shrink the native widget's footprint by **reducing its font
size and horizontal padding**, which pulls its intrinsic minimum down enough to fit:

```tsx
// From timesheet/ui.tsx — 3 time inputs across one narrow row:
const timeInputClass =
  "w-full min-w-0 box-border rounded-lg border bg-white px-1.5 py-2.5 " +
  "text-center text-sm focus:...";
```

`text-sm` + tight `px-1.5` + `box-border` + `min-w-0` shrinks the control just enough
to sit in a 3-column grid without overlapping. Use this when §2's fixed width can't fit;
use §2 (fixed width) as the default because it's less fiddly and doesn't shrink text.

## 4. Verify on a real device — you can't trust the desktop or the build

This is a **rendering** behavior of the mobile browser's native control. A successful
`build`, passing tests, and a desktop-browser check tell you nothing about whether the
overflow is fixed — desktop renders these inputs narrower and *does* let them shrink, so
the desktop view can look perfect while the iPhone is still broken (and vice versa).

So: after applying the pattern, **tell the user this can only be confirmed on an actual
iPhone/iPad and ask them to check** that (a) the date/time digits sit inside the box and
(b) the row isn't taller than intended. Don't declare it fixed from a green build alone.
If you're iterating on a reported overflow, expect a round-trip through the user's device.

## 5. Quick checklist when adding a date/time field to a mobile form
- [ ] Date/time input has a **fixed width** sized to the widget (§2) — or the shrink
      treatment (§3) if it must be narrow — never bare `w-full`/`flex-1`/50%-grid.
- [ ] `shrink-0` on the picker; `flex-1 min-w-0` on the neighbors.
- [ ] Row is `flex flex-wrap`, not `flex-col` (too tall) or fixed `grid-cols-2` (overlap).
- [ ] No width-hungry inline label wrapped around the picker.
- [ ] Told the user to verify on a real iOS device.
