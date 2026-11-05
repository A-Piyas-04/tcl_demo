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
| `node scripts/screenshot.mjs` | Visits every route at 1280px and 390px, captures screenshots, reports console errors and horizontal overflow |
| `node scripts/walkthrough.mjs` | Drives the CRUD story and asserts the rules refuse what they should |

Both scripts need the dev server or preview server running first.

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
  enforces. Turn them off for a cleaner screen.
- **Reset demonstration data** — restores the seed exactly. Everything created
  during a demonstration is discarded.

Keyboard: `⌘K` or `Ctrl-K` or `/` opens the command palette (search covers product
synonyms and CAS numbers). `g` then `p`, `m`, `c`, `r`, `e`, `o`, `i`, `s`, `k`
jumps to a section.

---

## What to show, in order

A fifteen-minute route through the six questions document 10 says the business
cannot answer today:

1. **Dashboard** — the pipeline by stage, approved-but-not-ordered, unsourced
   demand, and the commission tile (TCL's only revenue).
2. **Products → Budesonide** — every manufacturer who makes it, split into what
   TCL represents and what it merely knows about, then the clients engaged on it
   and whether any is dual sourced.
3. **Clients → Square → Products taken** — the same triangle from the other
   direction, then "Other clients taking this API", which logs every view.
4. **Requirements → new** — record an alternate-source requirement; the current
   source and reason become mandatory. Then match it to sources and open
   engagements.
5. **Engagement board** — drag a card. Try an invalid jump (it springs back and
   says why), then a move that needs a reason, then a sample before an offer,
   which needs an override with a note.
6. **Client orders → new** — order one molecule from two manufacturers on one
   order (split sourcing), with the approved-source gate refusing an unapproved
   source until a reason is recorded. Then raise the indents, one per manufacturer.
7. **Indent detail** — the client's letter of credit in the manufacturer's favour,
   and the commission TCL earns from the client.
8. **Shipment detail** — add batches against an indent line; try to over-ship, try
   a short shelf life, try to deliver before customs clearance.
9. **Batch detail** — one manufacturer batch serving two clients' orders.
10. **Relationships → connection tree** — the whole triangle as a picture.
11. **Reports → development register** — the monthly register, with the stage each
    engagement was at at period end.
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
