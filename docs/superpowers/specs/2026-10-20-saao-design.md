# SAAO Reporting Module — Design Spec

**Date:** 2026-10-20
**Owner:** berlcamp@gmail.com
**Status:** Draft for review
**Reference workbook:** `GENERAL FUND- OCTOBER 2026.xlsx` (Budget Office, Ozamiz City)

## 1. Purpose

The Mayor and the City Administrator currently ask the City Budget Office for budget-utilization figures. This module lets them view those figures themselves, inside the existing PR Tracker. The Budget Office maintains the SAAO (Statement/Status of Appropriations, Allotments and Obligations) data directly in the app instead of in the workbook.

This is a **reporting and monitoring module**. It is not a budgeting, accounting or procurement system.

### Success criteria
- The Budget Office can maintain a full fiscal year of SAAO data (structure, appropriations, supplemental budgets, realignments, monthly obligations) in the app and produce a report "as of" any month-end that reproduces the workbook's figures and layout.
- The Mayor and City Administrator can open a dashboard showing the latest **finalized** report, and can drill into any office, without database access and without editing rights.
- A finalized report never changes. A correction creates a new version, records who made it and why, and keeps the old version.
- Every number shown in the editor, dashboard, report, print and Excel export comes from one calculation path.
- Every rule that affects official totals and has not been confirmed by the Budget Office is labelled **provisional** in the code, in this document and on the report.

### Non-goals
- Excel upload, worksheet parsing, column mapping or import of any kind. (Pasting a copied cell range into the editor grid is allowed; see §8.4.)
- Budget preparation or approval workflows, a general ledger, purchase orders, or BAC management.
- Creating obligations automatically from PRs. A PR is not proof of an obligation, and the module does not read PR data.
- Changing existing PR Tracker behaviour.

### Anti-goals (failure even if it "works")
- Draft figures shown to officials as if official.
- A rule the Budget Office never approved quietly becomes the official computation.
- The same peso entered in two places and counted twice.
- An older finalized report showing different numbers after later data entry.

## 2. What the workbook does (findings)

The analysis was run against the October 2026 workbook on 2026-10-20.

### 2.1 Sheets
| Sheet | Contents | Status |
|---|---|---|
| `SAAO` | The report. About 1,000 line rows across 1,364 rows. Headers: Republic of the Philippines / Province of Misamis Occidental / Ozamiz City / "STATUS OF APPROPRIATION, ALLOTMENT & OBLIGATION" / "As of October, 2026". Footer: "Certified Correct:", then the City Budget Officer's name and title. | Working |
| `OBLIGATION` | The same rows as SAAO, with monthly obligation amounts January–December. Total obligation is the sum of the months. Cells often hold `=a+b+c`, i.e. several entries added up in one cell. | Working; title says "2019" |
| `RealignmentReversion` | The same rows. **One column per movement document** (e.g. "OCM-AUGMENTATION 001-2026 – 300,000", "SOURCE FOR SB 1 – PS SAVINGS JAN–FEB 2026"). Each cell is a signed amount for that line. A status note sits above some columns ("WAITING FOR APPROVAL", "CANCELLED – MAY 28, 2026", "for resolution", "Cancelled #19 & #20"). Column BI totals all of them. | Working; title says "2024" |
| `SUMMARY OF ENDING BALANCE` | Balance per office, grouped by MOOE / PS / Capital Outlay / Long-term obligation / 5% budgetary reserve / Aid to Barangay / 2% Discretionary. | **Broken**: every value is `#REF!` and the labels say "December 2013" |

The three working sheets are linked **by row number**. For example, SAAO X15 = `OBLIGATION!T15`. About 45 rows reference the wrong row in another sheet; all those cells are zero today. The app replaces row links with stable line IDs.

### 2.2 Hierarchy actually used
The SAAO hierarchy is not a fixed three levels. Examples:
- **City Mayor's Office** → Personal Services → lines; → MOOE → lines, then **divisions** under MOOE (Library, CDRR Division, Nutrition Services, Tourism Related Activities, Special Programs & Projects → sub-groups "Sub Total" → Sangguniang Kabataan → program areas → activity lines); → Capital Outlay → lines; "TOTAL APPROPRIATION – CMO".
- **Peace and Order Program** (not an office) → MOOE → program groups (Combating Crime and Disorder, …) → activity lines; → Capital Outlay → groups → lines.
- Stand-alone lines at the top level: Confidential Expenses, Aid to Barangays Development, 2% Discretionary Fund, 20% Development Fund.
- **5% Calamity Fund / Statutory and Contractual Obligation** → Budgetary Requirements → MOOE / 70% Management Fund → Prevention and Mitigation → activity lines, plus descriptive sub-rows with no amounts (e.g. "Greening Program" carries ₱500,000; its four child rows are text only).
- Many lines have **no account code** (program/activity lines). Account codes sit in column G or H.
- Subtotal labels vary ("TOTAL MOOE CMO", "Sub Total", "TOTAL", "GRAND TOTAL OTHER MOOE").

### 2.3 Columns
| Col | Header | Kind | Workbook formula (dominant) |
|---|---|---|---|
| A–F | Function/Program – Project/Activity | input (text, indent = level) | — |
| G/H | Code | input | — |
| I | Annual Appropriation | **input** | — |
| J | NTA Reduction | input | empty everywhere this year |
| K–O | SB-1 … SB-5 | **input** | P–R are unused spare columns |
| S | Changes – Supplemental | calc | `SUM(K:N)` (752 rows), `SUM(K:R)` (163), `SUM(K:O)` (64), `SUM(K:P)` (47) |
| T | Realignment/Reversion | calc | `=RealignmentReversion!BI{row}` |
| U | Total Changes | calc | `S+T` (889 rows), `J+S+T` (107 rows) |
| V | Total Adjusted Appropriation | calc | `I+U` |
| W | Allotments | calc | `=V` on every line |
| X | Obligation | calc | `=OBLIGATION!T{row}` |
| Y | Balances of Appropriation | calc | `W−X` |
| Z | Balances of Allotments | calc | `=Y` |
| AA, AC, AD | C N A (three columns) | mixed | some lines `=Z`, some typed amounts |
| AB | Obligation % | calc | `(X/V)*100`; 30 cells show `#DIV/0!` |
| AE | Savings | calc | `=Z` on 72 selected MOOE lines |
| AF | 50% of Savings Amount | calc | `AE/2` |

### 2.4 Reconciliation figures (October 2026, grand total row 1364)
Annual ₱1,477,560,233.28 · SB-1 ₱5,512,422.54 · SB-2 ₱14,732,435.00 · SB-3 ₱58,609,519.08 · Supplemental ₱78,854,376.62 · Realignment/Reversion −₱39,531,743.54 · Adjusted ₱1,516,882,866.36 · Obligations ₱610,365,038.67 · Balance ₱906,517,827.69 · 40.24% · Savings ₱6,836,180.36 · 50% Savings ₱3,418,090.18.

SB-1 and SB-2 equal the negative "SOURCE FOR SB-n – PS SAVINGS" columns in the movement sheet. A supplemental budget funded from savings is therefore recorded twice on purpose: once as +SB-n and once as −savings in the realignment column. The two net to zero on the adjusted appropriation. This is the workbook's convention, not double counting, and the design keeps it (§4.3).

## 3. Rule classification

Every rule falls into one of three classes. The class lives in code as a constant (`lib/saao/rules.ts`) and is printed in a "Basis of figures" note on every report.

- **C – Confirmed from workbook.** The formula is the same on every line (or the exceptions are clear errors) and is arithmetically unambiguous.
- **P – Provisional.** This is how the workbook behaves today, but it may be a shortcut rather than policy. The two that move official totals materially today, R5 and R11, are per-book settings. The others (R3, R7, the R9 zero display, R12) are named constants in `lib/saao/rules.ts` and in `saao_compute_lines`. Changing one is a small code change with a test, never a data migration.
- **A – Awaiting confirmation.** The workbook has no reliable rule. The column exists, values are entered or tagged manually, and the report labels it "unconfirmed".

| # | Rule | Class | Implementation |
|---|---|---|---|
| R1 | Supplemental = sum of all SB-n amounts for the line (all SB numbers, no fixed column range) | C | sum of supplemental movement lines |
| R2 | Realignment/Reversion = sum of all non-supplemental, non-NTA movement amounts for the line | C | sum of movement lines |
| R3 | Total Changes = NTA Reduction + Supplemental + Realignment/Reversion | **P** | The workbook includes NTA on only 107 rows. Applying it to all lines changes nothing this year because NTA is empty. NTA amounts are stored signed (a reduction is negative). |
| R4 | Adjusted Appropriation = Annual + Total Changes | C | |
| R5 | Allotment = Adjusted Appropriation | **P** | Book setting `allotment_mode = 'equals_adjusted'`. The alternative `'recorded'` sums `saao_allotments` rows instead. |
| R6 | Obligation = sum of monthly obligations for months ≤ report cutoff month | C (sum) / **P** (cutoff filter) | The workbook simply holds months to date. The cutoff filter is needed so a revised September report ignores October entries. |
| R7 | Balance of Appropriation = Allotment − Obligation | **P** | Workbook formula `W−X`. It is equivalent to Adjusted − Obligation only while R5 holds. Textbook usage would be Adjusted − Allotment; flagged for the Budget Office (Q2). |
| R8 | Balance of Allotment = Allotment − Obligation | C | Under R5 this equals R7, matching `Z=Y`. |
| R9 | Obligation % = Obligation ÷ Adjusted × 100; when Adjusted = 0 → shown as "—" (null), never an error | C (formula) / **P** (zero display) | Subtotal % = subtotal obligation ÷ subtotal adjusted, never a sum of percentages. A few workbook subtotal rows sum percentages; those are errors. |
| R10 | Subtotals / totals = sum of descendant lines, for every amount column | C | Replaces the hand-typed SUM ranges. |
| R11 | Movement counting: which movement statuses count in totals | **P** | Book setting `movement_rule = 'all_entered'` (workbook behaviour: every entered amount counts, whatever its note). Alternative: `'approved_only'`. Finalization shows the non-approved movements that would be counted, and the finalizer must acknowledge them (§7.3). |
| R12 | Movement dating: a movement counts in a report if `effective_date ≤ cutoff_date` | **P** | The workbook has no dates. Needed for correct historical revisions. |
| R13 | CNA (1), CNA (2), CNA (3), Savings: per line, each is blank, "= Balance of Allotment", or a typed amount | **A** | Reproduces the workbook's mix of `=Z` and typed values. Column labels are configurable per book. |
| R14 | 50% of Savings = Savings × 0.5 | C (formula) / **A** (meaning) | Lines: Savings × 0.5 (rounded half away from zero). Subtotals and totals: half of the summed savings, rounded once — reproduces the workbook total 3,418,090.18. |
| R15 | Summary of Ending Balance grouping and which balance it shows | **A** | Framework report: balance of allotment by top-level section × classification. Labelled unconfirmed (§9.5). |

## 4. Data model

All objects live in the existing `pr_tracker` schema with a `saao_` prefix. **No existing table, function or policy is altered.** Amounts are `numeric(18,2)`. Every write goes through `security definer` RPCs, following the PR Tracker convention; tables get read-only RLS policies.

### 4.1 Reference data
```
saao_funds            id, code (unique, e.g. 'GF'), name ('General Fund'), active
saao_classifications  id, code (unique: 'PS','MOOE','CO', + any added), name, sort_order, active
```
Seeded with GF and PS/MOOE/CO. Budget admins can add more.

### 4.2 Book: one fiscal year of one fund
```
saao_books   id, fiscal_year int, fund_id → saao_funds, title,
             allotment_mode text  check in ('equals_adjusted','recorded')  default 'equals_adjusted'   -- R5
             movement_rule  text  check in ('all_entered','approved_only') default 'all_entered'       -- R11
             extra_labels   jsonb default {"cna_1":"C N A","cna_2":"C N A","cna_3":"C N A","savings":"Savings"} -- R13
             header_lines   jsonb  (LGU header lines, editable; default from the workbook)
             certifier_name, certifier_title  (signatory block, editable; no invented text)
             created_by, created_at
             unique (fiscal_year, fund_id)
```
The book is the living working set that the Budget Office keeps up to date all year, the way they keep the workbook now. Reports are snapshots of a book as of a cutoff date (§7).

### 4.3 Hierarchy: one adjacency tree per book
```
saao_nodes   id, book_id, parent_id → saao_nodes (null = top level), sort_order,
             kind  text check in ('section','group','classification','line','note'),
             label text,                -- description as printed
             account_code text null,    -- lines only; null allowed (program/activity lines)
             classification_id null → saao_classifications   -- required on kind='classification'; optional override on lines
             office_id null → offices   -- optional link to an existing PR Tracker office (sections only)
             total_label text null,     -- custom subtotal caption, e.g. 'TOTAL MOOE CMO'; null = auto "TOTAL <label>"
             show_total boolean default true,
             appropriation numeric(18,2) not null default 0,   -- Annual Appropriation (lines only; 0 elsewhere)
             appropriation_ref text null,                      -- ordinance / AB number
             active boolean default true, created_at, updated_at
```
- **section**: a top level, i.e. an office or special grouping (City Mayor's Office, Peace and Order Program, Statutory and Contractual Obligation). Dashboard "department" figures are per section.
- **group**: a division, program or sub-group at any depth (Library, CDRR Division, Special Programs and Projects, Combating Crime and Disorder).
- **classification**: a PS / MOOE / CO heading. It can sit anywhere in the tree, so both *Office → Classification → Division* (CMO) and *Program → Classification → Group* (Peace & Order) work.
- **line**: a leaf that carries figures. The account code is optional. Its *effective classification* is its own `classification_id`, otherwise the nearest classification ancestor, otherwise "Unclassified" (shown as such in charts, e.g. Confidential Expenses).
- **note**: a descriptive row with no figures (e.g. the sub-items under "Greening Program").

Constraints: lines and notes cannot have children (enforced by trigger); `parent.book_id = book_id`; appropriation ≠ 0 only on lines; `(book_id, parent_id, sort_order)` is indexed. **A line that carries any figure** (appropriation, movement line, obligation, allotment, extra) **can be neither deleted nor deactivated.** Its figures must be removed first, normally by a reversion movement for its balance. This means totals can never silently lose a hidden line. Headings and notes may be deleted only when they have no children. `active` is kept only for lines with no figures, to hide them from the grid; inactive lines contribute nothing because they have nothing.

Grouping rows are never line items and carry no typed amounts. Every total is computed (R10).

The `office_id` link is optional and informational. It lets a later phase scope access per office; this phase does not use it for permissions. The existing six-office list is not changed.

### 4.4 Budget movements (supplemental budgets, realignments, augmentations, reversions, NTA reductions)
```
saao_movements        id, book_id, kind text check in
                        ('supplemental','realignment','augmentation','reversion','nta_reduction','other'),
                      sb_number int null       -- required iff kind='supplemental'; unique per book (SB-1, SB-2 …)
                      reference_no text, title text, effective_date date not null,
                      status text check in ('pending','approved','cancelled') default 'approved',
                      status_note text null    -- e.g. 'for resolution', 'cancelled May 28, 2026'
                      remarks text null, created_by, created_at, updated_at
saao_movement_lines   id, movement_id, node_id (must be a line of the same book), amount numeric(18,2) (signed, ≠ 0),
                      unique (movement_id, node_id)
```
- One movement row is one column of the RealignmentReversion sheet, or one SB-n column of SAAO. The register keeps source (−) and destination (+) lines together, so a realignment's lines visibly net to zero. The app shows a "net" figure and warns, without blocking, when a realignment or augmentation does not net to zero.
- **Report presentation:**
  - SB-n column = sum of lines of the supplemental movement with that `sb_number`. Columns are generated from whichever SB numbers exist, so SB-6 needs no schema change.
  - NTA Reduction column = `nta_reduction` lines.
  - Realignment/Reversion column = everything else.
- **No double counting:** each amount exists in exactly one `saao_movement_lines` row. The SAAO grid's SB-n cells and the movement screen edit the same row. The "SOURCE FOR SB-n" savings are a separate `reversion` movement, as in the workbook (§2.4).
- Status is always kept and shown. R11 decides whether a status is counted.

### 4.5 Obligations: monthly totals per line
```
saao_obligations   node_id (line), month smallint 1..12, amount numeric(18,2), entry text null,
                   updated_by, updated_at, primary key (node_id, month)
```
The workbook stores monthly totals. Individual obligation transactions (ObR numbers) are **not** modelled: the report doesn't need them, and holding them would make this an accounting system. `entry` keeps the typed expression when a user enters `895256+57158+441937`, the way the workbook cells hold them. `amount` is the evaluated sum. Rows with amount 0 and no entry are deleted, not stored.

### 4.6 Allotments (used only when `allotment_mode = 'recorded'`)
```
saao_allotments   id, node_id (line), amount numeric(18,2), reference_no, allotment_date date,
                  status text check in ('pending','approved','cancelled') default 'approved', remarks,
                  created_by, created_at
```
Allotment (recorded) = sum of approved rows with `allotment_date ≤ cutoff`. The table and screen exist now. While the mode is `equals_adjusted`, the screen shows a banner saying recorded allotments are not used in reports.

### 4.7 CNA / Savings tags (R13)
```
saao_line_extras   node_id (line), field text check in ('cna_1','cna_2','cna_3','savings'),
                   mode text check in ('balance','amount'), amount numeric(18,2) null (required iff mode='amount'),
                   primary key (node_id, field)
```
No row means blank. `balance` means the value equals the line's Balance of Allotment.

### 4.8 Reports, versions and snapshots (§7)
```
saao_reports   id, book_id, cutoff_date date (month end), version int,
               status text check in ('draft','finalized','superseded'),
               revision_of → saao_reports null, revision_reason text null,
               rules jsonb null            -- frozen copy of allotment_mode, movement_rule, labels, rule classes, at finalization
               header jsonb null           -- frozen header lines, certifier, fund, year, cutoff label
               movements jsonb null        -- frozen list of movements counted (ref, kind, title, status, total)
               acknowledged_unapproved jsonb null  -- movement ids the finalizer acknowledged (R11)
               created_by, created_at, finalized_by, finalized_at
               unique (book_id, cutoff_date, version)
               partial unique: one 'draft' per (book_id, cutoff_date)
               partial unique: one 'finalized' per (book_id, cutoff_date)
saao_report_rows  report_id, seq int, node_id uuid null (traceability only; no FK, so later node deletes can't break history),
                  parent_seq int null, depth int, kind, label, account_code, classification_code, classification_name,
                  section_seq int, total_label, show_total,
                  appropriation, nta, sb jsonb {"1":…, "2":…}, supplemental, realignment, total_changes, adjusted,
                  allotment, obligation, m1 … m12, balance_appropriation, balance_allotment,
                  cna_1, cna_2, cna_3, savings, savings_half       -- leaf rows carry amounts; non-leaf rows carry nulls
                  primary key (report_id, seq)
```
Snapshot rows store **every node** (headings, lines, notes), with line-level amounts only. Totals are re-derived from the frozen rows at display time by the same rollup function used for drafts, so the subtotal logic exists once. Monthly columns are stored so the trend chart for a finalized report comes from the snapshot.

### 4.9 Access
```
saao_access   profile_id → profiles (PK), role text check in ('viewer','encoder','finalizer','budget_admin'),
              granted_by, granted_at
```
This is a separate table, so `profiles`, `get_my_profile()` and `admin_upsert_profile()` stay untouched. See §6.

### 4.10 Audit
```
saao_audit   id bigserial, book_id null, actor_id → profiles, at timestamptz,
             entity text, entity_id uuid, action text, before jsonb null, after jsonb null
```
Every RPC that changes a financial value, structure, movement status, setting, access grant or report state writes one row. The table is insert-only from RPCs and has no update/delete grants. Budget admins and finalizers can read it.

### 4.11 Migration plan
One additive migration, `supabase/migrations/20261020000100_saao_core.sql`, plus later stage migrations (`…0200_saao_rpc.sql`, `…0300_saao_reports.sql`). Each one:
- `create table` / `create function` / `create policy` only. There is no `drop` or `alter` on existing objects, and no `db reset` against shared environments.
- Seeds `saao_funds` (GF) and `saao_classifications` (PS, MOOE, CO) with `on conflict do nothing`.
- Has a matching pgTAP file in `supabase/tests/`.

The user applies migrations to production themselves; the agent never touches the shared Supabase project.

## 5. Calculation path (one source of truth)

1. **Line computation in SQL:** `pr_tracker.saao_compute_lines(book_id, cutoff_date)` returns one row per line, with every column in §4.8 computed per §3 and the book's settings. This is the official computation. Finalization inserts its output into `saao_report_rows`.
2. **Rollup in TypeScript:** `lib/saao/rollup.ts` turns ordered rows (live or snapshot) into a tree with subtotals, section totals and the grand total. Subtotal % = subtotal obligation ÷ subtotal adjusted (R9).
3. **Live preview in TypeScript:** `lib/saao/calc.ts` mirrors step 1 so the editor can recalculate instantly while typing. Amounts are integer centavos, so there is no float drift. Both implementations are tested against the same shared fixture (`lib/saao/fixtures/*.json` is loaded by vitest and inlined into the pgTAP test), so drift fails CI.
4. Draft reports, dashboards (when an authorized user previews a draft), finalized reports, print and Excel export all go through rows → `rollup.ts`. Nothing keeps a separate total.

## 6. Roles and permissions

`saao_access.role` is independent of the PR Tracker role. A person with no row has no budget access, so the Budget menu is hidden and RLS returns nothing. PR Tracker `admin`/`super_admin` users can manage budget access even without a budget role, but they cannot see figures unless they grant themselves a role, and that grant is audited.

| Capability | none | viewer (Mayor, City Admin) | encoder (Budget staff) | finalizer (Budget Officer) | budget_admin | PR admin / super admin |
|---|---|---|---|---|---|---|
| See Budget menu | – | ✓ | ✓ | ✓ | ✓ | access page only |
| Dashboard and finalized reports, drill-down, print, export | – | ✓ | ✓ | ✓ | ✓ | – |
| See draft figures (always labelled DRAFT) | – | – | ✓ | ✓ | ✓ | – |
| Edit structure, appropriations, movements, obligations, allotments, extras | – | – | ✓ | ✓ | ✓ | – |
| Change movement status | – | – | ✓ | ✓ | ✓ | – |
| Create draft report for a cutoff | – | – | ✓ | ✓ | ✓ | – |
| Finalize report; start a revision | – | – | – | ✓ | ✓ | – |
| Book settings (allotment mode, movement rule, labels, header, certifier); funds; classifications; new book / copy structure | – | – | – | – | ✓ | – |
| Grant/revoke budget access | – | – | – | – | ✓ | ✓ |
| Read audit log | – | – | – | ✓ | ✓ | – |

Enforcement:
- **RLS** on every `saao_*` table: `select` requires `pr_tracker.saao_role() is not null`. Draft-only data is restricted further: `saao_reports`/`saao_report_rows` of a draft are visible only to encoder and above. Viewers can read finalized and superseded reports and their rows, plus the books/funds/classifications needed for labels. The live data tables (nodes, movements, obligations, allotments, extras) are readable by encoder and above only. Viewers see figures only through finalized snapshots, so they can never see unfinalized numbers.
- **RPCs** call `pr_tracker._saao_require(min_role)`, which raises an exception when the role is too low.
- **Server components** check `getSaaoAccess()` to hide pages and buttons. This is cosmetic only; RLS and the RPCs enforce access.
- No service-role key is used anywhere in the module.

## 7. Reports: draft, finalize, revise

### 7.1 Draft
An encoder chooses a book and a cutoff month and creates a draft report (`saao_create_draft`). A draft holds no numbers. Opening it computes live via `saao_compute_lines(book, cutoff)`. Data entry saves cell by cell and is immediately reflected, so there is no separate "save draft" step for figures. The draft is a named intent to report as of that cutoff, and it is what gets finalized. Each draft page shows a **DRAFT – not official** banner and watermark, on print as well.

### 7.2 Finalize (`saao_finalize(report_id, acknowledged_movement_ids)`, finalizer only)
In one transaction:
1. Lock the report row; it must be a draft.
2. Validate: a line under a section must have an effective classification, or the finalizer accepts "Unclassified"; no line may have a negative adjusted appropriation without a warning being acknowledged; all R11 checks below must pass.
3. **R11 check:** list the movements counted under the book's `movement_rule` whose status is not `approved` and whose effective date is ≤ cutoff. If that set differs from `acknowledged_movement_ids`, raise "Review the unapproved movements before finalizing". The UI shows the list and requires explicit ticks.
4. Insert `saao_compute_lines` output into `saao_report_rows`, and freeze `rules`, `header` and `movements`.
5. Set status `finalized`, `finalized_by`, `finalized_at`. If this is a revision, set the earlier finalized version to `superseded`.
6. Write an audit row.

Once finalized, report rows have no update/delete path. No RPC exists for it and RLS grants only `select`.

### 7.3 Revision
`saao_start_revision(report_id, reason)` (finalizer; reason required) creates a new draft with the same book and cutoff, `version + 1` and `revision_of`. A revision recomputes from the book **as it is now**. Movements and obligations are still filtered by the cutoff (R6, R12), but structure, appropriations and CNA/Savings tags have no history, so their current values apply. This is intended: a revision exists to correct errors in those values. The design deliberately does not keep dated history of the structure. The finalized original remains the record of what was reported at the time. The finalized version stays the official one until the revision is finalized. Then it becomes `superseded`, which stays viewable in Report History and is marked "Superseded by v2 on …, reason: …".

### 7.4 Which report is "official"
For a (book, cutoff), the official report is the single `finalized` row. The dashboard defaults to the most recent finalized cutoff of the selected book. If none exists, it shows an empty state ("No finalized report for FY2026 General Fund yet") and never falls back to draft data. Encoders and above get a separate "Preview draft" toggle that switches the page to an amber DRAFT theme.

## 8. Screens

### 8.1 Navigation
The sidebar gets a new group, **Budget**, visible only with a budget role:
- Budget Dashboard — `/budget`
- SAAO Reports — `/budget/saao`
- Budget Data (sub-items): Appropriations `/budget/data/appropriations` · Allotments `/budget/data/allotments` · Obligations `/budget/data/obligations` · Budget Movements `/budget/data/movements`
- Ending Balance — `/budget/ending-balance`
- Report History — `/budget/history`
- Budget Settings — `/budget/settings` (budget_admin; PR admins see only the Access tab)

A **book switcher** (FY + fund) sits in the page header of every Budget page and is remembered in a cookie. There is one book per FY/fund.

### 8.2 Budget Dashboard (`/budget`)
- **Header strip:** fiscal year, fund, "As of October 31, 2026", status badge (Finalized v1 / Revised v2), finalized by/at. Filters: book, cutoff (finalized cutoffs only), section.
- **Summary cards:** Annual Appropriation · Budget Changes · Adjusted Appropriation · Allotments · Obligations · Balance of Appropriation · Balance of Allotment · Obligation %. Each card whose figure depends on a provisional rule shows a small "provisional" marker with a tooltip.
- **Charts** (hand-built SVG/CSS following the dataviz skill; no chart dependency):
  1. Obligations by section (horizontal bars, top 15 + "others").
  2. Adjusted vs Allotment vs Obligation by section (grouped bars; Allotment hidden while R5 makes it identical, with a note).
  3. Distribution by classification (PS / MOOE / CO / Unclassified stacked bar).
  4. Monthly obligations Jan..cutoff (columns from snapshot m1..m12).
  5. Utilization by section (bars of Obligation %, sorted).
  6. Budget movements in this report (from the frozen `movements` list: ref, kind, status, total).
- **Section table:** Section · Adjusted · Allotment · Obligation · Bal. Appropriation · Bal. Allotment · Obligation %, sortable. Clicking a row opens `/budget/history/[reportId]?section=<seq>`, the read-only SAAO filtered to that section with its full breakdown.

### 8.3 SAAO Reports (`/budget/saao`): the workspace
- **Top bar:** book switcher; "As of" month selector; the current report state for that month (none / Draft / Finalized v1); buttons: Create draft · Preview · Finalize (finalizer) · Start revision (finalizer) · Print · Export Excel.
- **Grid:** the full SAAO in workbook column order. Columns: Description (indented by depth) · Code · Annual · NTA · SB-1..SB-n · Supplemental · Realign/Reversion · Total Changes · Adjusted · Allotment · Obligation · Bal. Approp. · Bal. Allot. · CNA ×3 · Obligation % · Savings · 50% Savings. Subtotal rows appear after each group with their labels.
  - **Editable cells:** description, code, Annual (lines), SB-n (lines; writes the SB-n movement line; SB-n must exist first, created from a "+ SB" button), CNA/Savings mode or amount. Calculated columns are read-only and greyed; there are no editable totals.
  - **Not editable here:** Realignment (edited in the Movements screen; the cell links there) and Obligation (edited in the Obligations screen; the cell links there). Each value still has exactly one source.
  - **Keyboard:** arrow keys / Tab / Enter move between cells; typing starts editing; Esc cancels; Enter commits. Amounts accept `1,234.50` and `a+b+c`.
  - **Structure:** row context menu / toolbar to add a section, group, classification, line or note above/below/as child; indent/outdent; move up/down (drag reorder with the existing `@dnd-kit`); deactivate/delete.
  - Sticky Description column and header; horizontal scroll; section and grand total rows stay emphasised. A search box filters by description or code and keeps ancestor rows visible.
  - **Validation messages** inline (e.g. "Code must look like 5-02-03-010", "Amount must be a number", "SB-4 does not exist yet").
- Finalized reports open read-only from History. The workspace always edits the live book.

### 8.4 Paste from Excel (optional convenience; no import)
In any editable grid (SAAO, Obligations, Movement lines), Ctrl/Cmd+V of a rectangular tab-separated range pastes starting at the focused cell, across the visible editable columns. A preview dialog lists the affected rows (description, column, old → new, invalid cells in red) before anything is saved. Applying it calls one batch RPC (all or nothing, audited). It never creates structure rows on its own. Pasting into Description/Code on new blank lines is allowed, which lets staff copy structure from their workbook a block at a time. There is no file picker anywhere.

### 8.5 Budget Data
- **Appropriations:** a filterable list of lines (section, classification, code, description) with Annual Appropriation and reference number, edited inline. It shows the original appropriation next to the computed Adjusted, so the baseline is never overwritten by adjustments. Adjustments happen only through movements.
- **Allotments:** register (add/edit/status) per line. Banner while `allotment_mode = equals_adjusted`.
- **Obligations:** grid of lines × Jan–Dec plus Total, with the section filter and search. Entry accepts expressions; a tooltip shows the stored expression. Months after the selected cutoff are shaded (they are still allowed, for data entered early).
- **Budget Movements:** a register list (ref, kind, SB no., title, effective date, status + note, net, total +, total −). The detail page has a header form plus a line grid (pick lines by search; amount ±; running net; paste supported). Status changes are audited. A cancelled movement keeps its lines; R11 decides whether they count.

### 8.6 Ending Balance (`/budget/ending-balance`)
For the selected report (finalized by default; draft preview for encoder+): a matrix of sections × classifications (PS / MOOE / CO / Unclassified) showing Balance of Allotment, with row and column totals. It is computed from the same rows via `rollup.ts`. The banner reads: "Layout pending Budget Office confirmation — see open questions." Nothing on it is editable. Print and Excel export are available.

### 8.7 Report History (`/budget/history`)
Table columns: FY · Fund · Cutoff · Version · Status (Draft / Finalized / Superseded) · Created by/at · Finalized by/at · Revision reason. Opening a row goes to `/budget/history/[id]`, the read-only SAAO from the snapshot (or live for a draft, bannered), with Print / Export Excel / Ending Balance links.

### 8.8 Budget Settings (`/budget/settings`)
Tabs:
- **Access** (grant/revoke roles; pick from existing profiles).
- **Books** (create; optionally copy structure from an earlier book, which copies nodes only, with appropriations set to zero unless "copy appropriations" is ticked).
- **Book rules** (allotment mode, movement rule; each shows its R-number and a provisional warning; changing one is audited and affects drafts only, never finalized reports).
- **Labels & header** (CNA/Savings labels, header lines, certifier name/title).
- **Funds**, **Classifications**.

### 8.9 Print and Excel
- **Print** `/print/saao/[reportId]`, following the existing `/print/slips` pattern: legal or long-bond landscape, the header lines from the book, title "STATUS OF APPROPRIATION, ALLOTMENT & OBLIGATION", fund, "As of October 31, 2026", the full table with subtotals and grand total, the "Basis of figures" note listing any provisional rules in effect (and acknowledged unapproved movements), and the "Certified Correct:" block with the certifier name/title from the book. A DRAFT watermark is added when the report is not finalized. PDF output is the browser's Save as PDF.
- **Excel** `GET /budget/export/[reportId]?sheet=saao|ending-balance`, a route handler generating `.xlsx` with **exceljs**. It is the one new dependency, used only for export. Numbers are written as numbers with `#,##0.00`, subtotal rows are bold, the header rows are merged, and the provisional note goes in the footer. Subtotal cells hold values, not formulas, so the file shows exactly the app's figures.

### 8.10 States
Every page has a loading skeleton (existing `Skeleton`), an empty state with a next action ("Create the FY2026 General Fund book"), success toasts (existing `sonner`) and inline errors that show the RPC message.

## 9. Open questions for the Budget Office

These do not block building. Each maps to a rule ID; the answer becomes a settings change or a small formula change.

1. **(R5)** Do allotments always equal the adjusted appropriation, or are allotments released separately (e.g. by quarter or by Allotment Release Order)?
2. **(R7)** Should "Balance of Appropriation" be Adjusted − Allotment (usual meaning) or Allotment − Obligation (current workbook)? Today they print the same number twice.
3. **(R11)** Should pending ("waiting for approval", "for resolution") and cancelled movements count in the official totals? The October file counts 003-2026 (₱2.5M, waiting), the SB-3 source marked "for resolution" (₱1.5M) and 018-2026 (marked "Cancelled #19 & #20").
4. **(R12)** Should a movement count from its approval date, its effective date, or always (whole year)?
5. **(R3)** NTA Reduction: should it reduce Total Changes on every line? Is it entered as a negative amount?
6. **(R13)** What are the three "C N A" columns, how is each line's balance assigned to CNA or Savings, and what are the typed CNA amounts (e.g. ₱2,939,858.33 on Travelling Expenses, CMO)?
7. **(R14)** Is "50% of Savings" always exactly half of Savings, and what is it used for?
8. **(R15)** What should the Summary of Ending Balance show: which balance, which office list (it names City Economic Enterprise, CDRRMO and "Non-Office", which are not in the SAAO), and which groupings (Long-term obligation, 5% reserve, 70%/30%, Aid to Barangay, 2% Discretionary)?
9. **(R6)** Are obligations reported by month of obligation (ObR date) or month recorded?
10. Should the printed SAAO include any signatory besides "Certified Correct: City Budget Officer"?
11. Are funds other than the General Fund (e.g. Special Education Fund, Economic Enterprise) expected in this module?

## 10. Implementation stages

Each stage ends with passing `pnpm test`, `pnpm test:db`, `pnpm lint`, `pnpm build`, and a commit.

1. **Design** (this document) and the plan.
2. **Foundation:** core migration (§4.1–4.7, 4.9, 4.10), RLS, `saao_role()`/`_saao_require`, settings RPCs (funds, classifications, books, access), node CRUD + move/indent RPCs, appropriation/movement/obligation/allotment/extras RPCs with audit, batch-paste RPC. pgTAP for every RPC's permissions and validation.
3. **Computation and reports:** `saao_compute_lines`, `lib/saao/calc.ts`, `rollup.ts`, shared fixture tests (including the October reconciliation figures on a reduced fixture, plus zero/negative/edge cases), reports tables, draft/finalize/revise RPCs, snapshot immutability tests.
4. **SAAO workspace UI:** grid, keyboard navigation, structure editing, inline amounts, SB columns, search, paste preview, finalize dialog with R11 acknowledgement, read-only report view.
5. **Dashboard and drill-down.**
6. **Supporting screens:** appropriations, allotments, obligations, movements, ending balance, history, settings.
7. **Print and Excel export; sidebar; e2e tests:** encoder creates a book, enters data, finalizes; viewer sees finalized only; draft is never visible to the viewer; a revision preserves v1.

## 11. Testing

- **Vitest:** `calc.ts` (each rule, zero denominators, negative adjustments, cutoff filtering, movement rule switch, allotment mode switch, extras modes), `rollup.ts` (deep trees, notes, empty groups, % at subtotal), the amount-expression parser, the TSV paste parser and diff, and Excel row building.
- **pgTAP:**
  - Every RPC rejects lower roles.
  - RLS: viewer cannot read live tables or drafts; no-role user sees nothing.
  - `saao_compute_lines` matches the shared fixture.
  - Finalize freezes rows; later edits don't change them.
  - Revision supersedes correctly.
  - Unique draft/finalized per cutoff.
  - R11 acknowledgement is enforced.
  - Audit rows are written.
  - Node tree constraints hold.
- **Playwright** (prod build on :3100 per the project's e2e recipe): the encoder→finalizer→viewer flow above, plus a regression run of the existing PR e2e specs.
- **Regression:** the existing pgTAP and vitest suites must still pass unchanged.

## 12. Owner decisions (2026-10-20)
- Build on the workbook's current behaviour, keeping confirmed and provisional rules separate (§3). Don't wait for the Budget Office.
- The SAAO gets its own organisational hierarchy, linked to existing offices only where appropriate.
- Budget permissions are added without disturbing existing roles. Enforcement is server-side and through RLS.
- Excel export may use a dependency. No import of any kind.
- **One-time seed:** a developer-written migration (`supabase/migrations/2026102000xx_saao_seed_fy2026_gf.sql`, generated once by a script kept outside the app) loads the October 2026 workbook into the FY2026 General Fund book:
  - Structure, account codes and annual appropriations.
  - SB-1..SB-3 as supplemental movements.
  - Each RealignmentReversion column as one movement. Its status comes from the note above the column: "WAITING FOR APPROVAL" / "for resolution" become `pending`, and notes containing "Cancelled" become `cancelled`. The note text is kept in `status_note`; columns with no note become `approved`.
  - Monthly obligations, keeping each cell's `a+b+c` expression in `entry`.
  - CNA/Savings tags.

  The workbook has no movement dates, so seeded movements get `effective_date = 2026-01-01` and the remark "Effective date not recorded in the workbook — set the actual date". The seed is verified to reproduce every §2.4 grand total under the default rules before it is committed. This is not an import feature: there is no upload, and nothing the Budget Office runs. The user applies it to production.

## 13. Calls made by the designer (not decided by the owner)
- **Accounts for officials:** no change to `profiles`. The Mayor signs in as staff of the existing MAYOR office. The City Administrator is added by an admin, through the existing Offices page, as a non-processing office ("City Administrator's Office", code `CADMIN`), and then signs in as its staff. That is a data entry, not a code change. They see only their own office's PRs, which is normal PR Tracker behaviour, and their budget access comes from `saao_access`. The Budget menu sits beside the PR menu; the home page stays the PR dashboard.
- Movements require an effective date (the Budget Office knows each document's date even though the workbook doesn't show it).
- Lines with figures cannot be deleted or deactivated (§4.3).
- Revisions recompute from current structure and appropriations (§7.3).
- The reconciliation fixture is a reduced extract of real rows from the reference workbook (kept outside the repo; only the derived numbers go into `lib/saao/fixtures/`), plus the §2.4 grand totals as documentation.
- One living "book" per FY/fund, with reports as dated snapshots of it, instead of copying the full dataset into each report.
- Monthly obligation totals instead of individual obligation records.
- Snapshot stores line amounts; totals are re-derived by one rollup function.
- Hand-built SVG charts instead of adding a chart library; exceljs as the only new dependency.
- A separate `saao_access` table instead of altering `profiles` or the existing role enum.
- The default status of new movements is `approved`, because the workbook's unlabelled columns are treated as approved.
- Viewers see only finalized snapshots; they never get live tables.
- PR admins manage budget access but see no figures by default.
