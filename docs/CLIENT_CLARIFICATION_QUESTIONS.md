# Questions for TCL

These are unresolved business questions. The demo works under the assumption written against each question, and the
answer could change the screens. They are ordered by impact, highest first within each group. Numbers such as Q12 refer
to the open questions in `../dcos/00-project-overview-and-glossary.md`.

**Priority:** **A** could change the structure or the main workflow; **B** changes rules or fields; **C** is wording or
presentation.

---

## Terminology

| # | Question | Why it matters | Demo assumption | Priority |
|---|---|---|---|---|
| T1 | Do your staff say "engagement" for one client considering one manufacturer's product? If not, what do they say ("deal", "development", "file")? | It is the main record of the system and its name appears on every screen. | "Engagement", with "client × supplier deal" as a subtitle. | C |
| T2 | Is "indent" the term everyone uses, including clients and manufacturers, for the order TCL places on a manufacturer? | It is the second most visible term. | "Indent", with "order placed on a manufacturer" as a subtitle. | C |

## Client requirements

| # | Question | Why it matters | Demo assumption | Priority |
|---|---|---|---|---|
| R1 | Does every piece of business start with a recorded client requirement, or do engagements also start without one (a manufacturer proposing a product, an existing relationship)? | Decides whether the requirement or the engagement is the natural starting point and home of a deal. | Both: requirements open engagements, and engagements loaded at go-live have no requirement. | A |
| R2 | Should a requirement's status follow its engagements (for example, *fulfilled* once one source is supplying commercially, *lost* once all are rejected)? | If yes, the status becomes automatic and is never edited by hand. | Manual, as in the specification. The page shows progress beside it. | B |
| R3 | One requirement can be answered by several sources. Is it "fulfilled" when the first one supplies, or only when the client's whole volume is covered? | Affects the development register and the unsourced figures. | Not decided; the seed marks it fulfilled once any source is commercial. | B |
| R4 | Does the monthly development register count a requirement in the month of enquiry or the month of approval? (spec Q12) | Changes the register's totals. | Month of enquiry. | B |

## Manufacturer engagement and samples

| # | Question | Why it matters | Demo assumption | Priority |
|---|---|---|---|---|
| E1 | Is a sample always needed before approval, or can a client approve on documents alone? | Decides whether the sample step can be skipped. | Optional, but approving without a passed sample needs a written note. | A |
| E2 | Can a sample be sent before any offer? Is that an override or simply normal? (spec Q14) | Changes a rule the demo enforces. | Allowed as an override with a reason. | B |
| E3 | Should moving an engagement to *Offered* or a sample stage always require the offer or sample record? | The demo now refuses those moves on the board without the record. | Yes; the record moves the stage. | B |
| E4 | Is the client's approval a single event, or are there steps (QC pass, regulatory filing, DGDA approval) to track separately? (spec Q13) | Could add a stage or a checklist to the engagement. | One approval date, reference and optional conditions. | A |
| E5 | Who records the outcome of a sample: TCL from the client's report, or does the client send a formal letter that must be filed? | Decides whether a document is mandatory at that step. | TCL records it; the approval letter can be attached. | C |

## Products and sources

| # | Question | Why it matters | Demo assumption | Priority |
|---|---|---|---|---|
| P1 | How exclusive are agencies? Can TCL represent two manufacturers for the same molecule, and does exclusivity limit who TCL may offer? (spec Q3) | Could add rules to source matching and offers. | Several represented sources per molecule; exclusivity is recorded, not enforced. | B |
| P2 | Do clients refer to products by their own brand names that should be searchable? (spec Q4) | Search and matching. | Generic names, synonyms and CAS only. | C |

## Orders and indents

| # | Question | Why it matters | Demo assumption | Priority |
|---|---|---|---|---|
| O1 | Is there always a client order before an indent, or does TCL sometimes place an indent on a verbal instruction? | Decides whether indents can be created on their own. | An indent is always raised from a client order line. | A |
| O2 | Can one indent cover several client orders from the same client? | Changes how orders and indents link. | Supported by the data model; normally one. | B |
| O3 | Who decides an order is complete? Fully delivered, fully paid, or someone closing it? | The demo now derives order and indent status from deliveries. | Completed when everything ordered is delivered. | B |
| O4 | Are orders ever cancelled or put on hold part-way through, and what happens to the indent and the commission? | No cancel or hold action exists yet. | Not implemented. | B |
| O5 | Are orders always in USD, or also EUR or another currency? | Totals are now kept per currency; reports still assume USD. | USD throughout the demonstration data. | C |

## Shipments

| # | Question | Why it matters | Demo assumption | Priority |
|---|---|---|---|---|
| S1 | Does customs clearance apply to the whole shipment, or can part of a consignment be cleared? (spec assumption A7) | Decides whether delivery is recorded per shipment or per line. | Whole shipment. | B |
| S2 | Do goods go to a client factory only, or also to a bonded or third-party warehouse? (spec Q10) | Affects delivery sites. | Client factories marked as delivery sites. | C |
| S3 | Who in TCL updates shipment progress, and from what source (forwarder email, tracking portal)? | Decides who the "goods on the way" follow-ups go to. | Any Full Access user. | C |

## Commission

| # | Question | Why it matters | Demo assumption | Priority |
|---|---|---|---|---|
| C1 | When does commission become payable: when the indent is placed, when goods ship, when they are delivered, or when the client pays the manufacturer? | Decides when the system prompts "invoice the commission", and what "earned" means in reports. | Earned when invoiced (or on the indent date while pending); the prompt appears once goods are delivered. | A |
| C2 | How is commission calculated: a percentage of indent value, slabs, or a fixed amount per deal? Can it be "to be decided" when the indent is placed? (spec Q2) | Decides the fields on the commission and whether figures can be computed automatically. | Percentage or fixed, with "to be decided" allowed. | A |
| C3 | Is commission ever payable by the manufacturer rather than the client? | The data model allows it; the screens assume the client. | Always the client. | B |
| C4 | Are commissions invoiced per indent, or several indents on one invoice? | Changes the invoicing action. | One invoice reference per indent. | B |
| C5 | Is a write-off a formal decision with an approver? | Could add an approval step. | Any Full Access user, with a reason. | C |

## Documents and reporting

| # | Question | Why it matters | Demo assumption | Priority |
|---|---|---|---|---|
| D1 | Which documents are mandatory at which step (COA on shipment, approval letter on approval, LC before shipment)? | Could turn reminders into refusals. | None are mandatory; expiry is warned. | B |
| D2 | Must actual files be stored, and for how long? (NFR-DQ-06, ten-year retention to be confirmed) | Out of scope for the demo; shapes the real system. | Metadata only; no file is stored. | C |
| D3 | Which three or four figures does management look at every week? | Decides what the dashboard leads with. | The *Needs attention* list, then pipeline and commission. | A |
| D4 | Should "Mine" on the dashboard also cover shipments and commission, and who owns those? | Ownership is defined for engagements and requirements only. | Shipments, credits and commission appear under *Everyone*. | C |
