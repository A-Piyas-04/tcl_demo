# Record-only conversion — progress and what's left

**Plan:** `C:\Users\ACER\.claude\plans\quirky-snuggling-wilkes.md` (the full 12-step plan, findings,
decisions and open questions). This file tracks where implementation stopped so it can resume cleanly.

**Branch:** `better-ux`. Each step is its own commit. Paused mid-Step-4 at a token limit.

**The goal, in one line:** every screen records what a person observed (with the date it happened), or
reports on what has been recorded. Nothing decides, curates, prescribes, or implies an external party
uses the system. `src/features/product2` is the canonical business model; where `src/data` disagrees,
`src/data` is the flaw.

---

## Done (committed)

### Step 1 — Verb sweep ✅ `commit: record-only: verb sweep…`
Action verbs that implied the system performs the deal became record verbs. "Open engagement" → "Record
an offer"; "Create offer" → "Record an offer"; "No offer has been issued" → "No offer is recorded";
"Request a sample" → "Record a sample request"; "Raise another round" → "Record another sample round";
"Reject the engagement" → "Record it as rejected"; "Raise indent" → "Record the indent"; "Chase the
manufacturer now" → "No renewal is recorded"; "Chase the forwarder." → "The ETA on record has passed…".
Files: `OfferPanel.tsx`, `SamplePanel.tsx`, `ClientOrderDetail.tsx`, `ClientOrderForm.tsx`,
`ExpiringDocuments.tsx`, `DocumentLibrary.tsx`, `ShipmentList.tsx`, `RequirementForm.tsx`,
`IndentDetail.tsx`.

### Step 2 — Dashboard observations ✅ (same commit)
`attentionGroups` (`selectors.ts`): field `why` → `note`; all nine instruction strings rewritten as
observations ("Chase the client's QC for a result." → "No result has been recorded since the sample was
dispatched."); the "nothing offered" group title reworded; the note now renders as a quiet subtitle in
`Dashboard.tsx`. Groups, counts, items and `seeAll` unchanged — the required morning list is preserved.

### Step 3 — Refusals → warnings ✅ (same commit)
New shared `RecordAnyway` in `components/ui/form.tsx` (an `InlineWarning` + a non-blocking note; the
docblock states the rule: an error/disabled-submit is permitted **only** when the input cannot be
stored). Five of six refusal sites converted to non-blocking warnings:
- `ClientOrderForm.tsx` — unapproved-source block and below-MOQ block no longer gate save (`canSave`
  now requires only line completeness). The old `InlineError` "Line blocked" is a `RecordAnyway`.
- `OfferPanel.tsx` — the lapsed-price `blocked` flag deleted entirely; the dialog opens and the person
  types the quoted price.
- `SamplePanel.tsx` — a closed engagement no longer disables the round actions; the warning is a fact.
- `product2/tradeDialogs.tsx` — **the ship-after-LC-expiry block is gone** (it refused the demurrage
  case); now a warning that names the demurrage follow-up. Also softened before-LC-opened to a warning.
- **The sixth site, `EngagementBoard.tsx` drag guards, was intentionally deferred to Step 7** — it
  needs the stage-model changes (`reviewStageChange`, removal of `fromRecord` enforcement) to avoid a
  broken intermediate state. Noted below.
- `StageDialogs.tsx` future-date refusal was **kept** on purpose: a future event has not happened, so
  that date genuinely cannot be recorded.

### Step 4 — Real event dates — COMPLETE ✅
This is the fix for the headline bug (the development register filed events under the keystroke month).
- `changeStage` takes `occurredOn` for **all ten stages**; `stageChangedAt` and `StageHistoryEntry`
  hold the event date; days-in-stage counts from it; future dates refused.
- `approvedOn` no longer nulled on a later REJECTED/IDENTIFIED move. `firstOfferedOn`/`firstSampleOn`
  deleted as stored fields and derived from the earliest offer/sample.
- The three secondary stamps fixed: `setManufacturerStatus` (blacklist date), `setPortfolio`
  (start/end), `raiseIndents` (indent date) take a typed `occurredOn`/`orderDate`. `StatusChangeDialog`
  and the raise-indent dialog gained a "Date this happened" field; portfolio toggles pass `today()`
  from the caller, keeping `today()` out of api.ts's event fields.

### Step 5 — `recordOffer` — COMPLETE ✅
`recordOffer({clientCompanyId, manufacturerProductId, requirementId?, offerDate, …})` finds-or-creates
the engagement (stage history "Engagement created from a recorded offer") then runs `createOffer` with
`occurredOn = offerDate`. `RecordOfferDialog` lists **every** source for the molecule (represented or
not). The old `openEngagements` (and its forced `requirement.status='ENGAGED'`) is **deleted**.

### Step 6 — Picker deleted — COMPLETE ✅
`RequirementDetail.tsx` rewritten record-and-report: gone are the "Pick sources" button, candidate
checkboxes, the "sources that cannot answer this" exclusion panel, `CandidateRow`, `exclusionReason`,
and the prescriptive `NextStepCard` banner. In their place a neutral **"Sources in the register"** list
(facts only) with a single **"Record an offer"** action (opens `RecordOfferDialog`). `SOURCING_GAP_COPY`
reworded as observations. *(Not done, low value: renaming `candidateCount`→`representedSourceCount`;
turning `/requirements/unsourced` into an explicit coverage report; a board-header "Record an offer"
entry point for requirement-less phone enquiries.)*

### Step 7 — Typed stages — COMPLETE ✅
`STAGES_SET_BY_RECORDS`, `stageNeedsRecord` and the `fromRecord` flag deleted; `manualNextStages`
returns every allowed transition; `changeStage` no longer refuses a hand-set stage. The board drag now
always opens the stage dialog (so the event date is recorded) instead of shaking back or silently
stamping today. *(Pragmatic deviation from the plan: `STAGE_TRANSITIONS` is **kept as a guard** rather
than demoted to pure warnings — out-of-graph jumps like IDENTIFIED→APPROVED are still refused. If TCL
needs to record such a jump, revisit `checkStageChange`→`reviewStageChange`.)*

---

## Where it stopped

Steps 1–7 are committed and `tsc --noEmit` is green. Resume at **Step 8** below.

---

## Left to do

### Step 8 — The record/derive seam — COMPLETE ✅
`tradeStatusView(db)` added to `selectors.ts` **returning Maps** (wrapping the existing
`deriveTradeStatuses`, so the result cannot be assigned back). `writeTrade` **deleted**; its three
callers now use plain `write`, so a trade write never silently overwrites a person's status.
`statusDisagreements(db)` lists every row where the recorded status differs from what the quantities
imply, surfaced as a dashboard attention group (`key: 'status'`). Stored `status` stays authoritative
and typed — the ~20 UI call sites are untouched.
*(Pragmatic deviations: `deriveTradeStatuses` kept in `rules.ts` as the shared computation — not moved —
and its local `deliberate` stays with it; the seed still stamps initial statuses via it directly rather
than a renamed `stampSeedStatuses`; the disagreement appears as a dashboard group only, no inline chip
on each detail page yet.)*

### Step 9 — Decascade — PARTIAL ⚠️
Done:
- **Clearance no longer fabricates an arrival date** (`ShipmentDetail.tsx`). The warning that said "the
  arrival will be set to this date as well" is replaced by an optional, blank "Arrival date" field;
  leaving it blank keeps the arrival unrecorded rather than inventing it from the clearance date.
- **`openEngagements` forced-`ENGAGED` removed** — the whole function was deleted in Step 5/6.
- The first-indent COMMERCIAL move now records the **indent order date** (not today) and is noted
  "First indent recorded" rather than "Automatic".

Still to do (each needs new UI, deferred as not "quick"):
- `raiseIndents` invented `Commission` (`api.ts` ~1112) → remove; **needs new code**: add
  `createCommission(indentId, {agreedOn, payableBy, basis, rate, amount})` + a dialog. Note the only
  invented fact today is `payableBy:'CLIENT'`; basis/amount/status are already honest "to be agreed"
  stubs, so the tracker still works meanwhile.
- Stage auto-advance on offer/sample records → optional confirmable prompt (currently they advance with
  the real event date, which is defensible: the record implies the stage).
- `createOffer` supersede-all → prompt with live offers pre-ticked.
- `CommissionActions.tsx` computed amount/status → editable suggestion.

### Step 10 — Port product2's model + demurrage
New `types.ts` entities: `LcRecord` (with `expiryDate` **and `latestShipmentDate`**), `ProformaInvoice`
(replacing the `proformaInvoiceRef` string), `DemurrageCharge` (child of shipment, `shipmentId`
nullable). Add `Shipment.shippedOn` (**the main model has no actual departure date today**),
`IndentLine.fobUnitPrice`, `Indent.transportCharges`, `Commission.basis` → `'FOB' | 'TOTAL'`. Lateness
is **stored** (a deliberate exception — the governing LC can change, so it isn't recomputable), with the
person confirming the comparison and `lcIdAtShipment` recorded. Fix product2's own two violations
(stop blocking post-expiry ship date — partly done in Step 3; persist `lateAgainstLc`). Seed: an
`LcRecord` + `ProformaInvoice` per indent, FOB + freight, **one leg shipped after latest-shipment** so
demurrage has a reason to exist, 2–4 demurrage rows.

### Step 11 — Delete the judgement engine
Delete `nextStepFor`, `requirementNextStep`, `commercialStep`, `NextAction`, `NextStep` (selectors) and
`NextStepCard`, `runNext` (`DealProgress.tsx`, `EngagementDetail.tsx`). Keep `TradeSteps`. Replace with
`recordState(db, e)` → `RecordSummary` (two lists: *What is recorded* / *Not recorded* as plain noun
phrases, no tone/icon/button). product2's launcher block stays with copy changes ("Next step" → "Not
recorded yet").

### Step 12 — Dead code, tests, spec
Delete `demoStories`, `ResolvedStory`, `DEMO_STORIES` (no UI consumer). Rewrite
`scripts/walkthrough.mjs` (it's already stale — line 115 asserts the removed drag refusal, line 126
references deleted demo stories, lines 128-135 assert "Choose which sources to offer"; fix `OUT`
defaulting to `/tmp/tcl-walk` on Windows). Amend `dcos/05-user-flows.md:47` ("Select one or more
sources" → record an offer) and note against FR-M7-05 that *propose* means a confirmable dialog.

---

## Open questions for TCL (unchanged from the plan)

Each is modelled either way; answers only set defaults/wording. The two most load-bearing:
1. **Is `IndentLine.unitPrice` already FOB?** If yes, `fobUnitPrice` is a rename and the data is clean;
   if CFR/CIF, FOB is new data nobody has.
2. **Requirement status: manual or derived?** The app contradicts itself three ways today; default
   under "derive for display only" is manual with a derived progress line beside it.

Also: who bears demurrage by default; does `TOTAL` mean FOB+freight or more; one commission per indent
or several; withdrawn-approval field vs history; LC amendments (history table vs edit-in-place, which
Step 10's `lcIdAtShipment` depends on); over-shipment hard refusal vs `RecordAnyway`; multi-source offer
shortcut.

---

## Verify at every step
`npx tsc --noEmit` (clean, strict, `noUnusedLocals`) · `npm run build` · `npm run shots` (54 routes × 3
widths: 0 console errors / 0 overflows / 0 failed routes) · the refinement pass's audit script (0
violations). `npm run walkthrough` is stale and rewritten in Step 12.
