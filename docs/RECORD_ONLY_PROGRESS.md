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

### Step 4 — Real event dates — CORE DONE ✅ `commit: record-only: real event dates…`, REMAINDER OPEN
This is the fix for the headline bug (the development register filed events under the keystroke month).
Done:
- `changeStage` takes `occurredOn` for **all ten stages** (was `effectiveOn`, approval-only).
  `stageChangedAt` and `StageHistoryEntry.changedAt` now hold the event date; days-in-stage counts from
  it; future dates refused.
- `approvedOn` no longer nulled on a later REJECTED/IDENTIFIED move (a rejection doesn't unmake an
  approval); `firstCommercialOn` and `approvedOn` record the event date.
- `firstOfferedOn` / `firstSampleOn` **deleted as stored fields** (`types.ts`) and derived from the
  earliest offer/sample via new selectors `firstOfferedOn(db, engId)` / `firstSampleOn(db, engId)`.
  `EngagementDetail.tsx` and `seed.ts` updated; the four auto-advance calls in `api.ts` now pass the
  real record date.
- `StageDialogs.tsx` shows a "Date this happened" field for every stage change.

---

## Where it stopped (mid-file)

**`StatusChangeDialog.tsx` was open and about to gain a date field.** No uncommitted changes remain
(the Step-4 checkpoint is committed), so resume cleanly from the list below. `tsc --noEmit` is green at
this commit.

---

## Left to do

### Finish Step 4 — the three secondary `today()` stamps
These still stamp the keystroke date instead of the event date. Lower-value than the engagement
lifecycle, but needed for the acceptance grep ("no `today()` in `api.ts` except a value passed from a
dialog"):
- `api.ts:252` `setManufacturerStatus` → `blacklistedOn: today()`. Add an `occurredOn` param + a date
  field in `StatusChangeDialog.tsx` (was the next edit).
- `api.ts:432` / `:440` `setPortfolio` → `startedOn` / `endedOn: today()`. Add a date param; dialogs
  `ManufacturerProductForm.tsx` / `SourceDetail.tsx`.
- `api.ts:1036` `raiseIndents` → `orderDate: today()`. Pass the indent date from the raise-indent flow.

### Step 5 — `recordOffer` (ship before deleting the picker)
`openEngagements` (`api.ts:530`) is the **only** engagement-creation path in the running app — replace
it with `recordOffer({requirementId?, clientCompanyId, manufacturerProductId, offerDate, price, …})`
that finds-or-creates the engagement then runs `createOffer` with `occurredOn = offerDate`. Add
`RecordOfferDialog` beside `OfferDialog` (share an extracted `OfferFields`), source picker lists **all**
sources. Both paths coexist during this step. **Hard constraint: Step 5 must land before Step 6.**

### Step 6 — `KnownSourcesPanel`; delete the picker
New `features/pipeline/KnownSources.tsx` over `allSourcesFor(db, productId)` — every source, flat list,
facts only, no checkboxes, no "candidate/available/cannot answer" verdicts, a thin `FilterBar` for the
flagship lookup. Delete from `RequirementDetail.tsx`: `NextStepCard`, the "Pick sources" `<h2>`-button,
`CandidateRow`, `exclusionReason`, the "Sources that cannot answer this" panel, the "Above the client's
target" badge. Keep `sourcingGap` (rewrite `SOURCING_GAP_COPY` as observations) and `matchingSources`
(rename → `representedSourcesFor`); rename `candidateCount` → `representedSourceCount`.
`/requirements/unsourced` becomes a register-coverage report. Add a "Record an offer" action to the
engagement board header.

### Step 7 — Typed stages (and the deferred board drag guard)
Delete `STAGES_SET_BY_RECORDS`, `stageNeedsRecord`, the `fromRecord` check; `manualNextStages` returns
all ten. Keep `STAGE_TRANSITIONS` (FR-M6-06) but demote `checkStageChange` → `reviewStageChange`
returning warnings, never `ok:false` except same-stage. Convert `EngagementBoard.tsx:149-184` drag
guards here (drop the shake + both early returns; open the stage dialog carrying the warning). FR-M7-05
says the system shall "automatically **propose**" — a confirmable dialog, never perform.
*Note:* the four auto-advance `changeStage(..., {fromRecord:true})` calls still carry `fromRecord`;
once `stageNeedsRecord` is gone, `fromRecord` is dead and should be removed from `StageChangeInput`.

### Step 8 — The record/derive seam
`deriveTradeStatuses` (`rules.ts:157-232`) → `tradeStatusView(db)` in `selectors.ts` **returning Maps**
(cannot be assigned back). Delete `writeTrade` (`api.ts:113-117`) and `deliberate` (`rules.ts:185`).
Stored `status` stays authoritative/typed (UI call sites untouched). Add `statusDisagreements(db)` as an
inline chip + attention group ("Recorded as Open. Shipments add up to 500 of 500 kg — mark it
shipped?"). Seed keeps a private `stampSeedStatuses`.

### Step 9 — Decascade
- `api.ts:1075-1090` invented `Commission` → remove; **needs new code**: there is only
  `updateCommission` and no create path, so add `createCommission(indentId, {agreedOn, payableBy,
  basis, rate, amount})` + a dialog.
- Stage auto-advance (`:752,:815,:846,:865,:1105`) → a confirmable prompt with an editable date.
- `createOffer` supersede-all (`:742-749`) → prompt with live offers pre-ticked.
- `openEngagements` forces `ENGAGED` (`:602-604`) → remove (contradicts `RequirementDetail.tsx:190`).
- Clearance fabricates arrival (`ShipmentDetail.tsx:627-631`) → remove; blank arrival field.
- `CommissionActions.tsx:147,178,191` computed amount/status → editable suggestion.

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
