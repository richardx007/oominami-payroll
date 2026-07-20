---
name: print-and-pdf-download
description: Add a "print this" + "download as PDF" pair to a React/Next.js page for a small, mostly-static panel (a poster, a QR code sheet, a notice, a single-page form) — not a data table or long report. Covers three hard-won gotchas that all look unrelated but come from the same root causes: (1) iOS/iPadOS home-screen PWAs (standalone display-mode) cannot call window.print() at all — detect it and hide the print button, offer PDF download instead; (2) toggling a body class + @media print to show/hide a "print sheet" inside the current page tends to produce a blank second printed page — print via a fresh, isolated window.open() document instead; (3) forcing that sheet to exactly one page's physical dimensions (height:297mm + @page{margin:0}) fights the OS/browser's own print margin and pushes content into a phantom second page — let content size naturally instead of forcing full-page height. Also covers the PDF side: rendering CJK/any-script text into a PDF via html2canvas+jsPDF so no font needs to be embedded. Use whenever adding print/PDF export to a page, when "print doesn't work on iPhone/iPad", or when print output shows an unexpected blank extra page.
---

# Print + PDF download for a small static panel (React/Next.js)

For a **poster-sized, mostly-static panel** — a QR code sheet, a flyer, a single notice, a
simple form — that needs both a "印刷"/"Print" button and a "PDFダウンロード"/"Download PDF"
button. **Not** for large data tables or multi-page reports (see "Different problem" below).

This grew out of three consecutive round-trips fixing the same feature, each fix revealing the
next problem. Apply all three gotchas up front instead of rediscovering them one at a time.

## The three gotchas, in the order symptoms actually appear

### Gotcha 1 — `window.print()` is a no-op in iOS/iPadOS home-screen PWAs

If the app is added to the iOS/iPadOS home screen (`display-mode: standalone`), WebKit
**silently does nothing** when `window.print()` is called — no error, no dialog, the button just
looks dead. It works fine in a normal Safari tab. This is a platform limitation, not a bug in
your code — there is no CSS/JS workaround, only detection.

**Fix: detect it and hide the print button**, showing only the PDF-download button (which uses a
real file download, not `window.print()`, and works in standalone mode):

```ts
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
const isStandalone =
  (navigator as unknown as { standalone?: boolean }).standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;
const printSupported = !(isIOS && isStandalone);
```

Run this in a `useEffect` (it needs `navigator`/`window`, so it can't run at render time on the
server) and conditionally render the print button on `printSupported`.

### Gotcha 2 — "hide everything else, show the sheet, `window.print()`" produces a blank 2nd page

The common pattern for printing "just this one thing" out of a larger app page is: portal a
`.print-sheet` div to `document.body`, add a `body.print-mode` class, use `@media print { body.print-mode > *:not(.print-sheet) { display:none } }` to hide everything else, call
`window.print()`, then remove the class. **This is fragile** — depending on content size, other
elements the hide-rule doesn't quite reach (script tags, portals from other components, PWA
banners, framework-injected nodes), and browser/OS quirks, it can produce **a genuine blank
second printed page** even though visually only one page's content exists. This project hit that
bug, "fixed" it once, and had it resurface later from an unrelated change.

**Fix: don't print from the current document at all.** Open a brand-new, empty window and
`document.write()` a **complete, minimal, self-contained HTML document** into it — just the
title/content/styles needed, nothing else — then print *that* window:

```ts
const w = window.open("", "_blank");
if (!w) { alert("ポップアップがブロックされました。"); return; }
const doc = w.document;
doc.open();
doc.write(`<!DOCTYPE html><html>...(see assets/PrintablePanel.tsx)...</html>`);
doc.close();
w.onafterprint = () => w.close();
w.setTimeout(() => { w.focus(); w.print(); }, 200); // let data-URL images paint first
```

There is structurally nothing else in that document that could contribute to a stray page. This
is strictly more reliable than any amount of `display:none`/`@media print` scoping in the host
page, and it's less code.

### Gotcha 3 — forcing the sheet to *exactly* one page's physical size backfires

Once printing from an isolated document (or even inside a scoped sheet), the instinct is to make
the box match the paper exactly: `width:210mm; height:297mm;` plus `@page { margin: 0; }` to kill
default headers/footers. **This can itself cause the blank-second-page bug**: many browsers/OS
print pipelines apply their **own** minimum print margin regardless of `@page{margin:0}`
(especially iOS AirPrint), so a box sized to *literally fill the page* ends up slightly taller
than the actual printable area once that margin is subtracted — and the overflow spills onto a
second, otherwise-empty page.

**Fix: don't force full-page height.** Set only `@page { size: A4 portrait; }` (page size, no
margin override), give the content box a `width` (for layout/wrapping) but **no fixed
height/min-height**, and let it size to its natural content height. For a small
poster/QR-sheet/notice, natural content height is comfortably under one page regardless of
whatever margin the OS decides to reserve — so there's no overflow to spill in the first place.
The mental model: **don't try to fill the page exactly; make sure you clearly fit inside it.**

```css
@page { size: A4 portrait; }         /* size only — no margin:0 */
body { width: 210mm; padding: 14mm 12mm; }  /* no height / min-height */
```

## PDF download: html2canvas + jsPDF (no font embedding needed)

`jsPDF`'s built-in fonts (Helvetica/Times/Courier) don't support Japanese or most non-Latin
scripts — text drawn with `pdf.text()` directly would render as blank boxes unless you embed a
custom TTF (large asset, extra build complexity). **Avoid that entirely** by rasterizing the
already-styled DOM node with `html2canvas` (which uses the browser's own font stack via `<canvas>`
`fillText`, so whatever the OS renders on screen is what ends up in the image) and dropping that
single image into a one-page PDF with `jsPDF`:

```ts
const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
  import("html2canvas"),
  import("jspdf"),
]);
const canvas = await html2canvas(sheetRef.current, { scale: 3, backgroundColor: "#ffffff" });
const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
pdf.save("filename.pdf");
```

Notes:
- `pdf.addImage(...)` places one raster image at fixed (x, y, width, height) mm coordinates — it
  never auto-paginates on its own, so this is always exactly one page regardless of the source
  canvas's pixel aspect ratio (it gets scaled/stretched to fit the given box).
- The DOM node being captured must actually be in the document and laid out (not
  `display:none`) at capture time. Portal it to `document.body` and toggle a class that shows it
  **off-screen** (`position:fixed; left:-10000px;`) just before calling `html2canvas`, then hide
  it again after. Wait one or two `requestAnimationFrame`s after toggling the class before
  capturing, so the browser has actually applied the layout change.
- **This node can safely use `height:297mm; overflow:hidden;`** (unlike the print-window body in
  Gotcha 3) — there's no OS print-margin process involved here, `addImage`'s fixed target
  dimensions guarantee one page regardless of what the source canvas looks like.
- Both libraries are heavy (`jspdf` ~140KB gz, `html2canvas` ~50KB gz) — always `import()` them
  dynamically inside the click handler, never at module top level, so they don't bloat the initial
  page bundle.

## Files in this skill

| File | Purpose |
| --- | --- |
| `assets/PrintablePanel.tsx` | Full reference component: print button (Gotcha 1 detection + Gotcha 2/3 isolated-window printing) + PDF button (html2canvas+jsPDF). Adapt the markup/styles to your panel. |
| `assets/capture-sheet.css` | Companion CSS for the PDF-capture source node (`.pdf-capture-sheet` / `body.pdf-capture-mode`). |

## Different problem: large tables / multi-page reports

If what you're printing is a **data table, a report spanning multiple pages, or anything meant
to reflow across pages**, this skill doesn't apply — that's a `@media print` styling problem on
the actual page content (font/padding shrinking, `overflow: visible`, letting the browser
paginate naturally), not an isolated-single-sheet problem. Don't force those into a one-page
isolated window; let the browser print engine paginate the real content in place, and just tune
`@media print` rules (see e.g. `.print-report` styling in this project's `globals.css` for that
pattern, used for payslip printing).

## Verify

`npm run build` must pass. For a real check, drive it in an actual browser: click print, confirm
exactly one physical page (not two, with the second blank); click PDF download, open the file
and confirm one page with correctly rendered non-Latin text. If testing on iOS, check both a
normal Safari tab (print should work) and an installed home-screen icon (print button should be
hidden; PDF download should still work).
