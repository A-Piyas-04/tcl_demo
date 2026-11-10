# Refactoring summary

What changed in the front-end demo, what was kept, and how it was tested. The demo is still front-end only: no backend,
database, authentication or new business entity was added. The reasons for each change are in
[PROPOSED_PRODUCT_STRUCTURE.md](PROPOSED_PRODUCT_STRUCTURE.md), and the problems they address are in
[CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md).

---

## 1. Navigation

- **Sidebar:** 14 entries in 6 groups became 10 in 4 groups (Home, Sourcing, Trade, Directory, Insight), with Admin in
  the rail footer. Each entry has a plain-language tooltip (`src/layout/AppShell.tsx`).
- **Section tabs:** a new `SectionTabs` primitive (`src/components/ui/primitives.tsx`), with the tab sets defined in
  `src/layout/sections.tsx`:
  - Requirements | Unsourced demand
  - Pipeline | Sample rounds
  - Client orders | Indents
  - Shipments | Batches
  - Tracker | Analysis
  - Reports | Relationship explorer | Documents & certificates
- **Rail highlighting:** an entry stays highlighted for its tabs and detail pages; for example, Orders is lit on
  `/indents/*`.
- **Mobile bottom bar:** Home, Requests, Deals, Orders, More. The "More" sheet includes Admin.
- **Keyboard:** `g a` opens Reports.
- **Routes:** URLs are unchanged, apart from the following:
  - New: `/commissions/analysis`.
  - `/reports/commission` now redirects to `/commissions/analysis`.
  - `/samples/:id` now redirects to `/samples`, because it ignored the id.
- **Breadcrumbs:** the "Sources" crumb now leads to Products instead of a 404.
- **Command palette:**
  - Synonym and CAS matches now show (cmdk's built-in filter is off and filtering is ours).
  - "Go to" lists every section and tab, including Samples, Batches, Reports and Unsourced demand.

## 2. Workflow pages

**Engagement page, now the deal workspace** (`src/features/pipeline/EngagementDetail.tsx`, `DealProgress.tsx`):
- The header shows the client and molecule, then the manufacturer.
- Progress covers both the sourcing stages and five trade steps: order, indent, shipped, delivered, commission.
- A **Next step** card with one action button opens the existing offer, sample and approval dialogs, or links to the
  next record.
- Tabs: Overview, Offers & samples, Orders & shipments, Documents (with upload), History.
- The broken `/orders/:id` link is gone.
- The "Change stage" menu offers only the manual moves: approve, commercial, hold, reject, discontinue, reopen.

**Requirement page** (`RequirementDetail.tsx`):
- The heading reads "<Client> needs <molecule>", followed by the next step for the request.
- Each engagement shows a compact stage rail and its own next step.
- The engagements come first once they exist.
- Unsourced cases explain which gap applies.

**Client order page** (`ClientOrderDetail.tsx`):
- A Fulfilment panel shows each indent with its LC, shipments and TCL commission, all linked.
- Each line links to its engagement and requirement.

**Indent page:** links back to its client order(s). The free-form commission editor is replaced by the shared commission
actions.

**Shipment page:**
- The client and the order on each delivery are links.
- "Held at customs" is offered only while in transit or arrived.

**Client order form:** prefilled from `?client=&source=&engagement=`. Clearing lines when the client changes now says so.

## 3. Rules and data integrity

| Change | Where |
|---|---|
| Offered, Sample requested, Sample sent and Under evaluation can only be reached by recording the offer or sample. The board refuses the drag with an "Open engagement" action, and the API refuses it too (except when resuming from hold). | `stageNeedsRecord`, `manualNextStages` in `src/data/rules.ts`; `changeStage` in `src/data/api.ts`; `EngagementBoard.tsx` |
| Approving from the board asks for the same note as the detail page when no sample has passed. | `approvalContext` in `src/data/selectors.ts` |
| Sample panel: "Record outcome" only after the client has received the sample; "Request a sample" only from stages that allow it; a passed round offers "Record approval". | `SamplePanel.tsx` |
| Order, order-line, indent and shipment statuses follow from what shipped and was delivered. Shipments now reach Delivered. | `deriveTradeStatuses` in `rules.ts`, applied after shipment and delivery writes and to the seed |
| Commission actions are status-gated (agree terms → invoice → receipt, or write-off) and shared by the tracker and the indent. | `src/features/orders/CommissionActions.tsx` |
| The "Not permitted" page now writes the security-log entry it promises. | `src/features/misc/Fallbacks.tsx` |

## 4. Components consolidated

| New or moved | Replaces |
|---|---|
| `components/ui/FilterBar.tsx`: search, 2–3 main filters, "More filters" with an active count, Clear | The hand-copied 4-column filter grid on Requirements, Engagements, Samples, Client orders, Indents, Shipments, Batches, Commission, Products, Manufacturers and Clients |
| `useUrlSearch` in `lib/hooks.ts` | The debounced-search boilerplate repeated in 10 lists |
| `components/ui/records.tsx`: status badges, `DocumentsPanel`, `ActivityPanel` | The copies in `orders/shared.tsx` (which re-exports them); the engagement's own activity dialog |
| `sourcingGap` and `SOURCING_GAP_COPY` in selectors | Three copies of the unsourced logic |
| `dealProgress`, `nextStepFor`, `requirementNextStep`, `attentionGroups`, `demoStories`, `commissionMoney`, `commissionEarnedOn` | Ad-hoc joins in pages, and the conflicting monthly rules in the two commission pages |
| `sumByCurrency` and `fmtMoneyTotals` in `lib/utils.ts` | Totals that added every currency and labelled the result USD |

## 5. Dashboard

The dashboard is rebuilt around **Needs attention**, grouped by Sourcing, Trade and Commission:
- samples with no feedback;
- passed samples waiting for approval;
- approved sources with no order;
- requirements with a source but nothing offered;
- shipments held at customs, past ETA or awaiting delivery;
- letters of credit expiring;
- commission to agree or invoice.

Every item opens its record. Beside the list sit the pipeline and the commission book (totals per currency), with a
*Trade in progress* row underneath. The 8-item caps, the "molecules" mislabel and the hard-coded ageing threshold are
gone. A **Demonstration stories** panel lists the six presentation stories while presenter notes are on.

## 6. Mock data

These changes are in `src/data/seed.ts`. The generated book is unchanged, and the new passes run after it.

- **Story records:**
  - Square needs Budesonide, as an alternate source. It is dual-sourced from Biocon and Wockhardt (new represented
    sources, with prices and DMFs), each with a full history: an accepted offer, a passed sample and the approval letter.
  - One client order is split 300 kg / 200 kg across the two, with two indents, LCs, shipments, batches and full
    deliveries. Commission is received on one and invoiced on the other.
  - A new Beximco enquiry for Budesonide has two candidate sources and nothing engaged yet.
  - `DEMO_STORIES` names these and four existing records, found by name.
- **Chronology repair:** an indent never precedes its order, and a shipment never precedes its indent. Arrival,
  clearance and delivery follow in order. Nothing is dated after the demonstration day. Commission dates follow their
  indent.
- **Status alignment:**
  - A requirement is *Fulfilled* only with a Commercial engagement and *Engaged* only with engagements.
  - Clients with commercial business are Active.
  - Trade statuses are derived.
- **Result:** 14 client orders, of which 2 are completed; 17 shipments, of which 5 are delivered; 0 chronology problems
  (checked by script).

## 7. Preserved

- Every screen, route and capability is preserved; nothing was deleted:
  - requirements, matching, the board (drag still works for the manual moves);
  - offers, samples, client orders, indents, LCs, shipments, batches, deliveries, commission;
  - products, sources, manufacturers, clients, sites, contacts;
  - relationship tree and matrices, the document library, expiring documents, the four reports;
  - all admin pages, View Only mode, presenter controls, the audit and security logs;
  - the command palette, CSV exports.
- URL filters still work, so bookmarked filtered lists still open.
- The spec terms (engagement, indent, source) are kept, with plain-language subtitles.

## 8. Removed

Removed from the sidebar only: Samples, Indents, Relationships and Documents are now tabs, and Admin moved to the rail
footer. Removed from the code:
- the engagement page's own activity dialog (replaced by the shared panel);
- the indent's free-form commission dialog (replaced by the status-gated actions);
- the duplicated monthly chart on the commission tracker (it lives on Analysis).

## 9. Testing performed

All were run on this machine against `npm run preview` (production build):

| Check | Result |
|---|---|
| `npx tsc --noEmit` (strict, no unused locals) | Passes |
| `npm run build` | Passes. The existing single-chunk size warning remains. |
| `node scripts/walkthrough.mjs` | **25/25 steps pass**. New steps cover: the drag refusal; the dashboard stories and needs-attention list; the requirement's next step; the approved engagement leading to a prefilled order; the completed story's trade tab; split sourcing and fulfilment on the order; the commission tabs. Existing steps: duplicates, View Only, Not permitted, audit log, synonym search. |
| `node scripts/screenshot.mjs` at 1280, 820 and 390 px | **150 screenshots, 0 console errors, 0 failed routes, 0 pages with horizontal overflow** (one phone overflow on the requirement page was found and fixed) |
| Seed consistency script (temporary, esbuild-bundled) | 0 chronology or status contradictions; all six stories resolve with the expected next step |

The scripts accept `PLAYWRIGHT_CHROMIUM_PATH`, so a machine without Playwright's browser download can use an installed
Chrome:

```powershell
$env:PLAYWRIGHT_CHROMIUM_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
node scripts/walkthrough.mjs http://localhost:4173 $env:TEMP\tcl-walk
```

## 10. Known limitations

- Requirement status is still set by hand (question R2).
- Commission analysis and reports assume USD. The tracker, dashboard and indent list keep totals per currency.
- No cancel or hold action for orders, indents or shipments, and no way to edit shipment ETA or bill of lading after
  creation.
- Manufacturer sites and contacts are still read-only after registration.
- Record merging in duplicate review remains explained but not implemented. Reference data remains read-only.
- On the board, dnd-kit can auto-scroll during a drag, so a card may land one column further than aimed. The refusal
  message says what happened.
- Ordering of the next-step suggestions is a reasonable reading of the specification, not a confirmed procedure.

## 11. Client-dependent assumptions

These need confirming; see [CLIENT_CLARIFICATION_QUESTIONS.md](CLIENT_CLARIFICATION_QUESTIONS.md).
- **Samples:** optional, but approving without a pass needs a note (E1).
- **Stages:** offer and sample stages are set only by their records (E3).
- **Indents:** always raised from a client order (O1).
- **Order completion:** an order is completed when fully delivered (O3).
- **Commission:** earned when invoiced; invoicing is prompted after delivery (C1).
- **Terminology:** "Engagement" and "Indent" kept as the on-screen terms (T1, T2).
