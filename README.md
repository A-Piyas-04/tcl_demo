# TCL Sourcing Platform — front-end prototype

A clickable prototype of the application specified in `../dcos`. It runs entirely in
the browser on demonstration data: **no backend, no database, no network calls.**

It exists to be presented. Every screen is real, every list is populated, and the
business rules actually refuse what they should, so a demonstration can show both
the happy path and what happens when someone gets it wrong.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

For a presentation laptop with no network, build once and serve the static files:

```bash
npm run build
npm run preview
```

Fonts are bundled, so the build works offline.

Other scripts:

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript, strict, no emit |
| `npm run build` | Type-checks then produces `dist/` |
| `node scripts/screenshot.mjs` | Visits every route at 1280, 820 and 390px, captures screenshots, reports console errors and horizontal overflow |
| `node scripts/walkthrough.mjs` | Drives the CRUD story and asserts the rules refuse what they should |

Both scripts need the dev server or preview server running first. The screenshot
script covers 1280, 820 and 390 px. Without Playwright's own browser, point them
at an installed Chrome with `PLAYWRIGHT_CHROMIUM_PATH`.

---

## Signing in

The login screen lists TCL's staff. Picking a person signs in as them; no password
is checked. Choose a **Full Access** person to demonstrate the work, or a **View
Only** person (Sadia Rahman, Kamrul Khan) to show the read-only session.

You can also switch the role mid-demonstration from the user menu, which is the
quickest way to show that write actions disappear rather than grey out.

---

## Presenter controls

In the user menu, top right:

- **Role in force** — switch between Full Access and View Only live.
- **Simulated latency** — off, realistic (default) or slow. Realistic makes the
  skeleton loading states visible; off makes the demonstration snappy.
- **Show rule notes** — the short "Rule" notes that explain what the database
  enforces, and the *Demonstration stories* panel on the dashboard. Turn them off
  for a cleaner screen.
- **Reset demonstration data** — restores the seed exactly. Everything created
  during a demonstration is discarded.

Keyboard: `⌘K` or `Ctrl-K` or `/` opens the command palette (search covers product
synonyms and CAS numbers). `g` then `d`, `r`, `e`, `o`, `i`, `s`, `k`, `p`, `m`,
`c`, `a` jumps to Dashboard, Requirements, Engagements, Client orders, Indents,
Shipments, Commission, Products, Manufacturers, Clients or Reports.

## How it is organised

The sidebar follows the work, with related lists as tabs under one entry:

| Group | Entries (tabs) |
|---|---|
| Home | Dashboard — what needs attention today |
| Sourcing | Requirements (All, Unsourced demand) · Engagements (Pipeline, Sample rounds) |
| Trade | Orders (Client orders, Indents) · Shipments (Shipments, Batches) · Commission (Tracker, Analysis) |
| Directory | Products · Manufacturers · Clients |
| Insight | Reports (Reports, Relationship explorer, Documents & certificates) |

An **engagement** is one client considering one manufacturer's product — a
client × supplier deal. Its page shows the sourcing stages, the trade steps that
follow approval, and a **Next step** card whose button does the next thing. An
**indent** is the order TCL places on a manufacturer on a client's behalf.

Design notes, the audit and open questions for TCL are in [`docs/`](docs):
[current-state audit](docs/CURRENT_STATE_AUDIT.md),
[proposed structure](docs/PROPOSED_PRODUCT_STRUCTURE.md),
[client questions](docs/CLIENT_CLARIFICATION_QUESTIONS.md),
[refactoring summary](docs/REFACTORING_SUMMARY.md).

---

## What to show, in order

A fifteen-minute route that follows one deal from enquiry to commission. The
dashboard's *Demonstration stories* panel links to each record used here.

1. **Dashboard** — *Needs attention*: what to chase, grouped by sourcing, trade
   and commission, each item one click from its record. Beside it, the pipeline
   and the commission book (TCL's only revenue).
2. **Story 1, a new enquiry (Beximco needs Budesonide)** — the next step says
   two represented sources can supply it. Tick both and open the engagements.
3. **The new engagement** — the Next step card says *Create offer*. Record it and
   watch the stage move to Offered; the next step becomes *Request a sample*.
4. **Engagements → Pipeline** — drag a card to Offered: it is refused because an
   offer has to be recorded, with a button to open the engagement. Drag one to
   On hold: it asks for a reason.
5. **Story 3, a sample under evaluation (Ibn Sina)** — record the outcome; after a
   pass, *Record approval*.
6. **Story 4, approved but not ordered (Healthcare, Capecitabine)** — *Record client
   order* opens the order form already filled with the client and source. Save it
   and raise the indent.
7. **Story 5, goods on the way (Aristopharma)** — the Orders & shipments tab: the
   order, the indent with its letter of credit, the shipment in transit.
8. **Story 6, delivered and paid (Square, Budesonide)** — one order split 300 kg from
   Biocon and 200 kg from Wockhardt. Open the order: the Fulfilment panel shows
   both indents, their shipments and the commission (received on one, invoiced on
   the other).
9. **Commission** — invoice or record a receipt; then the Analysis tab by client,
   manufacturer and month.
10. **Products → Budesonide** and **Clients → Square** — the same triangle from the
    register side, and "Other clients taking this molecule", which logs every view.
11. **Reports** — the development register, then the Relationship explorer.
12. **Switch to View Only**, then **Admin → audit log** — every action from the
    demonstration, with who did it.

---

## How it is put together

```
src/
  data/           the whole "backend", in memory
    types.ts      entities, mirroring dcos/07-database-schema.sql v0.3
    reference.ts  reference data and display labels (the seeded tables)
    seed.ts       deterministic demonstration data
    rules.ts      the business rules the database enforces, re-implemented
    store.ts      zustand store: the database, the session, presenter settings
    api.ts        async facade with latency, refusals and the audit trail
    selectors.ts  the read models (the SQL views, as functions)
  components/ui/  the shared kit: panels, buttons, tables, dialogs, stage rail
  layout/         app shell, navigation rail, command palette, login, splash
  features/       one folder per area, each owning its routes
  lib/            hooks and formatting helpers
```

**Screens only ever call `data/api.ts` and `data/selectors.ts`.** Replacing the
fake API with HTTP calls to a real server is a change to one file; nothing in
`features/` would need to move.

`data/rules.ts` is a deliberate duplicate of what the database enforces, so the
prototype refuses the same things for the same reasons. Each rule names the
document section it comes from.

---

## Honest limits

- There is no server and no database. Everything lives in memory and is lost on
  reload, which is why "reset demonstration data" is instant.
- File uploads record metadata and show a progress bar; no file is stored.
- Record merging in duplicate review is explained but not implemented.
- Reference data is editable in the specification; here it is module constants, so
  those screens are read-only and say so.
- Company and product names are real trade names used as plausible examples. Every
  transaction, price, date, person, document and batch is invented.
