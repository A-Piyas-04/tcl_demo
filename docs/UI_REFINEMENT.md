# UI refinement — what changed and why

A refinement pass over the existing product. **No page was added, removed or moved; no information
architecture changed; no feature was added.** What changed is typography, hierarchy, colour semantics,
density, consistency, copy and surface treatment — built as tokens and shared components first, then
applied across every page.

Companion to [IA_SIMPLIFICATION_PLAN.md](IA_SIMPLIFICATION_PLAN.md), which covers navigation and is a
separate concern.

---

## 1. The deliverable

| Layer | File | What it owns |
|---|---|---|
| Tokens | [`app/tokens.js`](../tokens.js) | Type scale, weights, colour ramps, radius, elevation |
| Theme | [`app/tailwind.config.js`](../tailwind.config.js) | Replaces (not extends) type, weight, colour, radius, shadow |
| Base + surfaces | [`src/styles/index.css`](../src/styles/index.css) | Body, focus, panel, header, cell, well, press |
| Primitives | [`src/components/ui/primitives.tsx`](../src/components/ui/primitives.tsx) | Button, Badge, Quiet, SeverityDot, PageHeading, PanelHeader, EmptyState, Field |
| Table | [`src/components/ui/DataTable.tsx`](../src/components/ui/DataTable.tsx) | Alignment, row height, truncation, NameCell, RowActions, Empty |
| Domain | [`src/components/ui/domain.tsx`](../src/components/ui/domain.tsx) | KpiTile, StageBadge, StageRail (stepper), AgeingFlag, FilingDot |
| Formatting | [`src/lib/utils.ts`](../src/lib/utils.ts) | Dates, currency, quantities, ages, pluralisation |

The theme **replaces** rather than extends the Tailwind defaults for type, weight, colour, radius and
shadow. A utility outside the token file no longer exists, so `text-[11px]`, `bg-emerald-500` or
`rounded-xl` cannot quietly reappear later.

---

## 2. Typography

One family (IBM Plex Sans). Monospace is reserved for true codes.

**Six steps, and only six.** 24 / 20 / 16 / 14 / 13 / 12 px, mapped to `2xl / xl / lg / base / sm / xs`.
Body and table text is 14px. 13px is for secondary lines and table headers. **12px exists only inside a
badge** — it is unavailable anywhere else, and an audit enforces that.

**Two weights, enforced in the token file.** `medium`, `semibold` and `bold` all resolve to 600, so a
third weight cannot enter through a utility class. Only the 400 and 600 font files are loaded.

**Figures line up everywhere.** `font-variant-numeric: tabular-nums lining-nums` is set on `body`, so
every number in every table, tile and total is tabular without each call site remembering.

### The sweep

| Change | Count |
|---|---|
| `text-xs` (12px) → `text-sm` (13px) | 401 |
| `text-2xs` (11px) → `text-sm` | 217 |
| `text-[9px] / [10px] / [11px] / [0.8rem]` → token steps | 35 |
| `uppercase` + `tracking-wide(r)` micro-labels deleted | 79 |
| `tracking-tight` deleted | 11 |
| `italic` on data deleted | 10 |
| `text-3xl / 4xl` → `text-2xl` | 6 |
| **Total** | **772** |

### Monospace

Mono is now only CAS numbers, AWB/BL numbers, document references, record identifiers (`SHP-2026-0002`,
`IND-2026-00004`), permission codes and keyboard shortcuts.

**34 illegal uses removed** — money, quantities, percentages, numeric inputs, and the static attributes
`pharmacopoeia`, `incoterm` and `grade`, which were set in mono as though "USP" and "FOB" were codes.
The old logo was a monospace letter in a box; that is gone too (§8).

---

## 3. Colour

One brand accent, one neutral ramp, four semantics. Nothing else. Verified: **zero** default-Tailwind
palette classes and **zero** one-off hex classes remain anywhere in `src`.

### The ramp

`paper` 50–400 and `ink` 50–950 are **one continuous neutral ramp** in two namespaces — `paper` is its
light end (surfaces, rules), `ink` its dark end (text, the navigation rail). Previously `paper` was warm
and `ink` was cool: two ramps pretending to be one.

### Contrast, measured

Every pair is machine-checked, not eyeballed. Body text 16.8:1; secondary text 5.4:1; white on the
primary button 6.7:1; every semantic text-on-fill pair between 5.7:1 and 8.7:1.

`ink-400` was darkened from `#8d99a6` to `#7d8a98` specifically so that **interactive** borders (inputs,
checkboxes, outlined buttons) and icons clear 3:1. Decorative rules — table separators, panel dividers —
stay lighter at `paper-300`, because 1.4.11 governs controls, not hairlines.

### Colour carries meaning

- **No tinted card backgrounds.** The KPI tile was tinted amber or red when a number was bad. Severity
  now sits on a bevelled left inlay and on the figure itself; every tile is the same surface.
- **The inverted dark commission tile is gone.** One tile being a different kind of object told the
  reader nothing they could act on. (It also had a live bug: its text classes assumed a dark background,
  so after the first pass the figures rendered near-invisible on white.)
- **Row tinting removed — 10 instances.** Lists shaded whole rows amber or red for "held at customs",
  "past ETA", "expired". Two pages carried a *swatch legend* to decode the shading, which is the clearest
  possible sign the mechanism was wrong. Severity is on the ETA figure and the status badge; the legends
  are gone.
- **The nine-hue stage rainbow is gone.** The seven pipeline stages are a single ordered dimension, so
  they are one hue in deepening steps (`accent-300` → `accent-900`) with an identical chip, because the
  *label* says which stage it is. Only the three exits — on hold, rejected, discontinued — differ, and
  those are genuine semantics (warn / danger / neutral).
- **The avatar palette of five hues is gone.** A colour per person was colour carrying no meaning.
- **Never by colour alone.** Severity pairs with an icon or a word: `AgeingFlag` renders an alert icon
  beside an over-threshold age; `SeverityDot` pairs a dot with its label.

---

## 4. Badges and status

**`Badge` means a state that changes over time** — a stage, an order status, an expiry warning. One size,
one radius, one style, 12px.

**`Quiet` is new** and is for fixed attributes — pharmacopoeia, therapeutic area, grade, requirement kind.
These were coloured pills implying a status they never had. On the dashboard, `New` / `Alternate` pills
became plain "New development" / "Alternate source".

`StageBadge` had two sizes; it now has one. `size` is still accepted and ignored so call sites stay valid.

---

## 5. Tables

- **Header alignment matches cell alignment, always** — the header inherits the column's `align`.
  `'center'` was removed from the `Column` type, so a centred column is now a type error.
- **14 date and figure columns switched to right-aligned** (audit-driven): audit timestamps, user
  activation and last-login, collected %, register dates, document issue/expiry/upload, batch expiry,
  stage-changed, sample requested/dispatched.
- **Fixed row height** (44px, 40px dense), 1px separators, sticky header. The per-row entry animation was
  removed — it fought the fixed height and delayed first read.
- **Minimum column widths** so a name column never collapses; truncation takes the **end** with an
  ellipsis and carries the full value as a `title`, so the first word stays readable.
- **`Empty`, `NumCell`, `RowActions`** added. `RowActions` stops propagation so an in-row control does
  not also open the record behind it.
- **Keyboard path**: rows are focusable and open on Enter; sortable headers are focusable and sort on
  Enter/Space.
- `EMPTY` (`—`) is exported from `utils.ts` and every formatter returns it, so absent values are written
  one way.

---

## 6. Page structure

- **Multi-step progress compressed.** `StageRail` was a seven-segment track with a label under every
  segment. It is now one inline row: the track, then a single line naming where the deal stands and the
  date it got there. Under 56px.
- **Duplicate counts removed — 13.** List headings printed a badge from the **unfiltered total**
  (`db.shipments.length`) while the table toolbar printed the **filtered** count (`rows.length`), both in
  identical styling. They agreed only until you typed in the filter box. The count now lives once, in the
  toolbar, beside the rows it counts; headings keep only exception counts ("1 held at customs"), which
  are different facts.
- **The ⓘ epidemic is fixed at its source.** `splitBlurb()` routed any subtitle over 34 characters to a
  hover tooltip, which is what put an info mark beside nearly every heading, tile and empty state in the
  product. Subtitles now render in place and `tip` is always null. `HelpTip` survives for the rare case a
  section earns one.

---

## 7. Buttons

One filled action per view. `danger` is deliberately **not** filled — an irreversible action is outlined
with danger text and confirmed, rather than being the brightest thing on screen. An Accept/Reject pair is
`primary` + `secondary`.

Every size clears the 36px pointer target (`h-9` minimum); `.hit` raises it to 44px on touch.

---

## 8. Data formatting, enforced globally

| Rule | Before | Now |
|---|---|---|
| Dates | `05-Oct-2026`, and raw `2026-10-05` leaking from four selector strings | `05 Oct 2026` everywhere |
| Months | `October 2026` | `Oct 2026` |
| Currency | `189k` next to `7,553` | One format; `compact` is a *request* that `fmtMoney` ignores below a 1,000,000 threshold, so a tile can never abbreviate while its list does not |
| Quantities | `600 KG` | `600 kg` — space, lower case |
| Ages | `84d`, `705d` | `84 days`, with `ageTone()` grading at a warn and a danger threshold |
| Absent | mixed `—`, `''`, `'Any'` | `EMPTY` from one place |
| Record ids | — | already fixed-width per type (`SHP-2026-0002`, `IND-2026-00004`); unchanged |

---

## 9. Copy

- **Demo scaffolding removed from the product surface**: the "Demonstration stories" panel on the
  dashboard, the `Prototype with demonstration data — no live database` footer on every page, the
  "A demonstration: choose a colleague" line on sign-in, and the demo framing in menus and dialogs.
- **32 process-explainer subtitles shortened** to one short line. Example: *"Indents are the orders TCL
  places on a manufacturer on a client's behalf, one per manufacturer per client order. The client pays
  the manufacturer, usually by letter of credit."* → *"Orders TCL places on a manufacturer for a client"*.
- **8 internal spec references removed from UI strings** — `(FR-M2-05)`, `(UC-03 alternate 6a)` and
  similar were rendering to users. They remain in code comments, where they belong.
- **Grammar and pluralisation fixed.** `2 letters of credit expire within 45 days or already has` →
  `… or have already expired`; `41 ageings` → `41 past threshold`; `9 enquirys` → `9 enquiries`.
  `pluralise()` now applies English spelling rules by default (`-y → -ies`, `-s/-sh/-ch/-x → -es`), so
  the class of bug cannot recur from a call site forgetting the second argument.
- Headings shortened to 2–4 words: *"Molecules clients asked for that TCL cannot supply"* →
  *"Unsourced demand"*.

---

## 10. Correctness

Two real bugs surfaced while applying the rules:

1. **`AnimatedNumber` counted up on scroll-into-view.** Any KPI tile below the fold rendered **0** until
   the reader happened to scroll to it — so the tile disagreed with its own hint line and with the list it
   linked to. It now renders its value immediately. (The name is kept so call sites stay valid.)
2. **Heading and toolbar counts came from different queries** (total vs filtered) in identical styling
   across 13 list headings. Resolved as in §6.

---

## 11. Accessibility

- 4.5:1 text and 3:1 interactive-border/icon contrast, machine-verified across the palette.
- One visible focus ring (`ring-2 ring-accent-600 ring-offset-2`) on everything interactive.
- Keyboard path through tabs, sortable headers and table rows.
- 36px minimum hit target, 44px under `pointer: coarse`.
- `prefers-reduced-motion` honoured.
- Decorative dots, bars and the mark carry `aria-hidden`; the stage track exposes a text label.

---

## 12. Surface treatment — "instrument", not "card"

> This section supersedes two lines of the original brief (*"one elevation level (or borders only, no
> shadows)"* and *"no decorative tint"*), at your instruction, after the first pass came back reading as
> a default template. Everything structural above is unaffected.

The flat white rectangle with a tinted edge is what every dashboard template ships with. The surface
system is now a real depth model: **one light source above**, a 1px lit top edge on anything raised, and
tight dark shadows rather than large soft clouds — machined plates on a console, which is what this
product is.

Four elevations, each meaning something:

| Step | Meaning | Used by |
|---|---|---|
| `recessed` | cut into the surface | inputs, table headers, wells |
| `raised` | sitting on it | panels, tiles, board cards |
| `lifted` | picked up | hover, drag, the active card |
| `pop` | off the surface entirely | menus, dialogs, tooltips |

Plus `key` and `pressed` for the primary action, which is built as a physical key: a vertical gradient, a
lit top edge, a hard bottom edge, and it sinks 1px with an inset shadow when pressed (`.pressable`).

Also: the workspace carries a fine 32px machined grain that only registers at the edges of the panels on
it; panel headers sit in a shallow milled channel; the KPI severity edge is a bevelled inlay with its own
highlight and shadow rather than a flat 2px rule; form controls read as cut into the panel.

**One corner radius (7px) throughout.** Spacing is on an 8px scale, with 4px retained only as an
icon-to-label gap.

### The mark

The rounded accent square with a "T" in it was replaced by
[`src/layout/Mark.tsx`](../src/layout/Mark.tsx): a supply chevron and a demand chevron closing on the axis
between them — TCL's actual business, drawn in `currentColor` so it inherits the accent on paper and the
rail's light ink on dark.

### The brand pair

A muted violet (`accent`) against the graphite neutral, chosen to sit apart from all four semantics
(green / amber / red / blue) so an accent is never mistaken for a status. It is spent on the mark, the
primary action, the active nav item, the current step and the single-hue chart ramp — and almost nowhere
else.

---

## 13. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` (strict, `noUnusedLocals`) | clean |
| `npm run build` | clean |
| Compliance audit (9 rules, `src/**`) | **0 violations** |
| Contrast audit (28 pairs) | **0 failures** |
| Screenshot sweep, 54 routes × 3 widths | **162 shots, 0 console errors, 0 horizontal overflows, 0 failed routes** |

The compliance audit checks: no type below 13px, no step outside the six, no ALL-CAPS letterspaced
labels, no italics on data, no default-Tailwind palette, no one-off hex, no centred columns, no removed
shadow tokens, no spec references in UI strings, and that 12px appears only inside the badge components.

---

## 14. Not done, and why

| Item | Status |
|---|---|
| 8px spacing in **page-level** layout | Shared components and base CSS are on the 8px scale. Page files still contain 4px half-steps (`gap-1.5`, `py-2.5`) inherited from before. Mechanically sweepable, but it is churn across ~60 files with real overflow risk, and it is invisible next to everything above. Flagged rather than silently skipped. |
| `PrototypeNote` on the eight **Admin** pages | Kept. These say "Read-only in this build" and similar — a genuine build-state disclosure on an internal admin screen, not product-surface scaffolding. Say the word and they go. |
| Demo controls in the user menu | The *copy* is neutralised ("Session", "Access level", "Response delay") and the footer banner is gone, but the role switch, latency control and reset still work. Removing them would delete the only way to demonstrate View Only — a feature change, which this pass was told not to make. |
| Charts (Recharts) | Palette now resolves through tokens, but the per-series colour logic inside each report was not individually re-specified. Worth a dedicated pass if the reports matter. |

### Pages that cannot comply without an IA change

**None.** Every rule in the brief was satisfiable within the existing page structure.
