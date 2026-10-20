# SAAO Reporting Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SAAO budget-reporting module (data entry, draft/finalized reports, dashboard, print, Excel) inside the existing PR Tracker.

**Architecture:** New `saao_*` tables in the existing `pr_tracker` schema. All writes go through `security definer` RPCs with role checks, and tables carry read-only RLS. One living "book" per fiscal year and fund holds a node tree plus figures. Reports are drafts computed live by `saao_compute_lines`, or finalized immutable snapshots. A single TypeScript `rollup` builds every total for the grid, dashboard, print and Excel. `calc.ts` mirrors the SQL line formulas for instant editor feedback, and a generated test keeps the two in step.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript, Supabase (Postgres, pgTAP), Tailwind 4, existing `components/ui/*`, vitest, Playwright, exceljs 4.4.0 (new; export only).

**Spec:** `docs/superpowers/specs/2026-10-20-saao-design.md`. Section numbers (§) and rule IDs (R1–R15) below refer to it.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing any route, page, server action or route handler. This is Next 16.4, not the version in your training data.
- **Never** alter, drop or reset existing tables, functions or policies. Migrations are additive only. Never touch the shared/production Supabase project; the user applies prod migrations.
- Every SAAO object is named `pr_tracker.saao_*` (internal helpers are `pr_tracker._saao_*`). Functions use `security definer set search_path = ''` and fully qualified names, matching existing migrations. Grant execute to `authenticated` only on public RPCs.
- Amounts: `numeric(18,2)` in SQL, integer centavos (`number`) in TypeScript. Never use float arithmetic on pesos.
- Budget roles are, in rank order: `viewer` (1) < `encoder` (2) < `finalizer` (3) < `budget_admin` (4). PR `admin`/`super_admin` may manage access only.
- Don't add shadcn components. Reuse `components/ui/*`, `components/data-table/*`, `sonner`, `lucide-react` and `@dnd-kit`. The only new dependency is `exceljs@4.4.0`. Don't add a chart library.
- Provisional rules (R3, R5, R7, R9 zero display, R11, R12) and awaiting rules (R13–R15) must carry a `// PROVISIONAL (Rn)` / `// AWAITING BUDGET OFFICE (Rn)` comment wherever implemented, and must appear in the report's "Basis of figures" note.
- Tests use fiscal years ≥ 2090 so they never collide with the seeded FY2026 book.
- Run e2e on a production build at :3100 with `PW_CHANNEL=chrome` (see the project memory e2e recipe).
- Commit after each task. End commit messages with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Viewer reading drafts or live data:** a viewer queries `saao_nodes`, `saao_obligations` or a draft `saao_report_rows` directly through PostgREST and must get zero rows. Owning tests: Task 1 and Task 6.
2. **Editing after finalization:** someone tries to change a finalized report's rows, or the data feeding them, after finalization. The snapshot must stay identical. Owning test: Task 6, "finalized snapshot unchanged after edits".
3. **Bad amount input:** `1,234.50`, `(500)`, `1e9`, `=1+2`, `abc`, `1.005` and empty strings each produce a clear validation message, or the correct centavos. Nothing becomes NaN and nothing is silently rounded. Owning test: Task 4, `money.test.ts`.
4. **Pasting a range larger than the visible editable area, or onto calculated columns:** the preview flags the skipped cells and never writes to calculated columns. Owning test: Task 10, `paste.test.ts`.
5. **Zero and negative denominators:** a line or subtotal with adjusted appropriation 0, or negative after reversions, shows "—" for the percentage, and print and Excel never show NaN, Infinity or `#DIV/0!`. Owning tests: Task 4 (`calc`/`rollup`) and Task 13 (xlsx).

---

### Task 1: Core schema, access helpers, RLS

**Files:**
- Create: `supabase/migrations/20261020000100_saao_core.sql`
- Test: `supabase/tests/14_saao_core.test.sql`
- Modify: `supabase/seed.sql` (append `tests.grant_saao(p_email text, p_role text)`, which inserts into `saao_access` as postgres)

**Interfaces:**
- Produces tables exactly as in spec §4.1–4.7, §4.9 and §4.10: `saao_funds`, `saao_classifications`, `saao_books`, `saao_nodes`, `saao_movements`, `saao_movement_lines`, `saao_obligations`, `saao_allotments`, `saao_line_extras`, `saao_access`, `saao_audit`. Column names, checks and defaults come from the spec, including `effective_date date not null`.
- Produces: `pr_tracker.saao_role() returns text` (null when no access or the profile is inactive); `pr_tracker._saao_rank(p_role text) returns int`; `pr_tracker._saao_require(p_min text) returns pr_tracker.profiles` (raises `'Budget access required'` or `'Your budget role does not allow this'`); `pr_tracker._saao_audit(p_book_id uuid, p_actor_id uuid, p_entity text, p_entity_id uuid, p_action text, p_before jsonb, p_after jsonb) returns void`; `pr_tracker.saao_my_access() returns text`.
- Seeds: fund `GF`/'General Fund'; classifications `PS` 'Personal Services' (10), `MOOE` 'Maintenance and Other Operating Expenses' (20), `CO` 'Capital Outlay' (30). Uses `on conflict do nothing`.

- [ ] **Step 1: Write the failing pgTAP test** `14_saao_core.test.sql`. Assertions:
  - `has_table` for all 11 tables.
  - `saao_role()` is null for a user with no grant and `'viewer'` after `tests.grant_saao`.
  - A viewer sees 1 row in `saao_funds` and 0 rows in `saao_nodes` (after a postgres-inserted node exists).
  - An encoder sees that node.
  - A no-role staff user sees 0 funds.
  - Inserting a child under a `line` node raises (trigger).
  - A node whose `parent_id` belongs to another book raises.
  - A supplemental movement without `sb_number` raises a check violation.
  - Duplicate `(book_id, sb_number)` raises.
  - `authenticated` cannot `insert` into `saao_audit` (`throws_ok … 42501`).
- [ ] **Step 2: Run** `pnpm test:db`. Expected: FAIL (tables missing).
- [ ] **Step 3: Write the migration.**
  - RLS select policies: reference tables (funds, classifications, books) use `saao_role() is not null`. Live tables (nodes, movements, movement_lines, obligations, allotments, line_extras) use `_saao_rank(saao_role()) >= 2`. `saao_access` uses `_saao_rank(saao_role()) >= 4 or is_admin() or profile_id = current_profile_id()`. `saao_audit` uses rank ≥ 3.
  - No insert/update/delete policies. Grant `select` on all tables to `authenticated`.
  - Triggers: `_saao_nodes_guard` (parent must be the same book and not `line`/`note`; `appropriation <> 0` only when `kind='line'`; `classification_id` required when `kind='classification'`) and `touch_updated_at` on nodes and movements.
  - Indexes: `saao_nodes (book_id, parent_id, sort_order)`, `saao_movement_lines (node_id)`, `saao_allotments (node_id)`.
  - Unique: `saao_movements (book_id, sb_number) where sb_number is not null`.
- [ ] **Step 4: Run** `pnpm test:db`. Expected: PASS, with all existing test files still passing.
- [ ] **Step 5: Commit** `feat(saao): core schema, access helpers and RLS`

### Task 2: Settings, access, books and structure RPCs

**Files:**
- Create: `supabase/migrations/20261020000200_saao_structure_rpc.sql`
- Test: `supabase/tests/15_saao_structure.test.sql`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces (all `returns uuid` unless noted; each writes `_saao_audit`):
  - `saao_set_access(p_profile_id uuid, p_role text) returns void`: `p_role` null revokes. Allowed for `is_admin()` or a budget_admin.
  - `saao_upsert_fund(p_id uuid, p_code text, p_name text, p_active boolean)`: budget_admin.
  - `saao_upsert_classification(p_id uuid, p_code text, p_name text, p_sort_order int, p_active boolean)`: budget_admin. Code matches `^[A-Z0-9_]{2,12}$`.
  - `saao_create_book(p_fiscal_year int, p_fund_id uuid, p_title text, p_copy_from uuid, p_copy_appropriations boolean)`: budget_admin. Copying reproduces the whole node tree with new ids, keeps the same kinds/labels/codes/classifications/order, and sets appropriations to 0 unless `p_copy_appropriations`. Header defaults are `["Republic of the Philippines","PROVINCE OF MISAMIS OCCIDENTAL","Ozamiz City"]` and certifier title `'City Budget Officer'`.
  - `saao_update_book(p_id uuid, p_patch jsonb) returns void`: budget_admin. Allowed keys: `title, allotment_mode, movement_rule, extra_labels, header_lines, certifier_name, certifier_title`. Unknown keys raise `'Unknown book setting: %'`.
  - `saao_add_node(p_book_id uuid, p_parent_id uuid, p_after_id uuid, p_kind text, p_label text, p_account_code text, p_classification_id uuid)`: encoder. Inserts after sibling `p_after_id`, or last when null, then renumbers siblings 10, 20, 30, …
  - `saao_update_node(p_id uuid, p_patch jsonb) returns void`: encoder. Allowed keys: `label, account_code, classification_id, office_id, total_label, show_total, appropriation, appropriation_ref, active`. Account code, when not null, matches `^\d-\d{2}-\d{2}-\d{3}$`, otherwise raise `'Account code must look like 5-02-03-010'`. `active=false` on a line with figures raises `'This line has figures; remove them before deactivating'`.
  - `saao_move_node(p_id uuid, p_new_parent_id uuid, p_after_id uuid) returns void`: encoder. Rejects moving a node under itself or its descendants.
  - `saao_delete_node(p_id uuid) returns void`: encoder. Raises `'This line has figures and cannot be deleted'` / `'Remove the rows under this heading first'`.
  - Internal: `_saao_line_has_figures(p_node_id uuid) returns boolean`: true when appropriation ≠ 0 or any movement line, obligation, allotment or extra exists.

- [ ] **Step 1: Write the failing test.** Assertions:
  - A viewer and an encoder both fail `saao_create_book` with `'Your budget role does not allow this'`.
  - A budget_admin creates FY2091 GF.
  - The encoder adds section → classification → line, and they come back ordered 10/20 under the right parents.
  - `saao_move_node` of a section under its own line raises.
  - An invalid account code raises the message above.
  - Deleting a line with appropriation 5,000 raises, and deleting one with 0 succeeds.
  - Copying the book to FY2092 yields the same node count and 0 total appropriation.
  - A PR admin without a budget role can call `saao_set_access`, but `saao_role()` remains null for them.
  - Each mutation adds one `saao_audit` row.
- [ ] **Step 2: Run** `pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement the migration.**
- [ ] **Step 4: Run** `pnpm test:db`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(saao): settings, access, book and structure RPCs`

### Task 3: Financial data-entry RPCs and batch apply

**Files:**
- Create: `supabase/migrations/20261020000300_saao_entry_rpc.sql`
- Test: `supabase/tests/16_saao_entry.test.sql`

**Interfaces:**
- Produces (encoder unless noted; all audited with before/after):
  - `saao_upsert_movement(p_id uuid, p_book_id uuid, p_kind text, p_sb_number int, p_reference_no text, p_title text, p_effective_date date, p_status text, p_status_note text, p_remarks text) returns uuid`
  - `saao_delete_movement(p_id uuid) returns void`: only when it has no lines, otherwise raise `'Remove the movement lines first'`.
  - `saao_set_movement_line(p_movement_id uuid, p_node_id uuid, p_amount numeric) returns void`: 0 deletes the row. The node must be a `line` of the movement's book.
  - `saao_set_obligation(p_node_id uuid, p_month int, p_amount numeric, p_entry text) returns void`: amount 0 with null entry deletes the row. Month must be 1–12.
  - `saao_upsert_allotment(p_id uuid, p_node_id uuid, p_amount numeric, p_reference_no text, p_allotment_date date, p_status text, p_remarks text) returns uuid`; `saao_delete_allotment(p_id uuid) returns void`
  - `saao_set_extra(p_node_id uuid, p_field text, p_mode text, p_amount numeric) returns void`: `p_mode` null deletes the row.
  - `saao_apply_batch(p_book_id uuid, p_ops jsonb) returns int` (count applied). Each op is one of:
    - `{"op":"update_node","id":…,"patch":{…}}`
    - `{"op":"add_node","parent_id":…,"after_id":…,"kind":…,"label":…,"account_code":…,"classification_id":…}`
    - `{"op":"movement_line","movement_id":…,"node_id":…,"amount":…}`
    - `{"op":"obligation","node_id":…,"month":…,"amount":…,"entry":…}`
    - `{"op":"extra","node_id":…,"field":…,"mode":…,"amount":…}`

    Ops run in order inside the RPC's single transaction, dispatching to the functions above. Any error aborts everything and raises `'Row %: %'` with the 1-based op index. Every referenced node must belong to `p_book_id`. Maximum 2,000 ops.

- [ ] **Step 1: Write the failing test.** Assertions:
  - A viewer fails every RPC.
  - A movement line on a node of another book raises.
  - Setting a movement line to 0 removes the row.
  - Obligation month 13 raises.
  - A batch with 3 valid ops then 1 invalid op raises `'Row 4:%'` and leaves 0 of the 3 applied.
  - A valid batch returns 3.
  - Setting `allotment_mode` does not affect these RPCs.
  - `saao_delete_movement` with lines raises.
- [ ] **Step 2: Run** `pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:db`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(saao): financial data-entry RPCs and batch apply`

### Task 4: TypeScript money, rules, calc and rollup

**Files:**
- Create: `lib/saao/types.ts`, `lib/saao/money.ts`, `lib/saao/rules.ts`, `lib/saao/calc.ts`, `lib/saao/rollup.ts`, `lib/saao/fixtures/basic.json`
- Test: `lib/saao/money.test.ts`, `lib/saao/calc.test.ts`, `lib/saao/rollup.test.ts`

**Interfaces:**
- `types.ts`:
  - `SaaoRole = "viewer"|"encoder"|"finalizer"|"budget_admin"`
  - `NodeKind = "section"|"group"|"classification"|"line"|"note"`
  - `MovementKind = "supplemental"|"realignment"|"augmentation"|"reversion"|"nta_reduction"|"other"`
  - `RecordStatus = "pending"|"approved"|"cancelled"`
  - `AllotmentMode = "equals_adjusted"|"recorded"`; `MovementRule = "all_entered"|"approved_only"`
  - `LineAmounts` holds these centavo fields: `appropriation, nta, sb: Record<string, number>, supplemental, realignment, totalChanges, adjusted, allotment, obligation, months: number[] /*12*/, balanceAppropriation, balanceAllotment, cna1, cna2, cna3, savings, savingsHalf`.
  - `ReportRow = { seq: number; parentSeq: number|null; depth: number; kind: NodeKind; nodeId: string|null; label: string; accountCode: string|null; classificationCode: string|null; classificationName: string|null; totalLabel: string|null; showTotal: boolean; amounts: LineAmounts|null }`
- `money.ts`:
  - `parseAmount(input: string): { ok: true; centavos: number; entry: string|null } | { ok: false; error: string }`. Accepts `1,234.50`, a leading `-`, `(500)` → −50000, and `a+b-c` expressions of plain numbers (entry = the normalised expression only when it contains an operator). Rejects more than 2 decimals with `"Use at most 2 decimal places"`, any other character with `"Amount must be a number"`, `=` prefixes (stripped first, then parsed), and values of 1e13 or more with `"Amount is too large"`. Empty → `{ok:true, centavos:0, entry:null}`.
  - `formatAmount(c: number): string` → `"1,234.50"`, `"-1,234.50"`, `"0.00"`; `formatPct(p: number|null): string` → `"40.24%"` or `"—"`; `toPeso(c: number): number`; `fromNumeric(v: string|number|null): number` (parses PostgREST numeric strings exactly).
- `rules.ts`:
  - `export const RULES: { id: string; klass: "C"|"P"|"A"; title: string }[]` with R1–R15 titled as in spec §3.
  - `export const NTA_IN_TOTAL_CHANGES = true // PROVISIONAL (R3)`
  - `export const BALANCE_APPROPRIATION = "allotment_minus_obligation" as const // PROVISIONAL (R7)`
  - `basisOfFigures(rules: { allotmentMode: AllotmentMode; movementRule: MovementRule }): string[]`: the human sentences for the print note.
- `calc.ts`:
  - `type LineInput = { appropriation: number; movements: { kind: MovementKind; sbNumber: number|null; status: RecordStatus; effectiveDate: string; amount: number }[]; obligations: { month: number; amount: number }[]; allotments: { amount: number; status: RecordStatus; date: string }[]; extras: Partial<Record<"cna_1"|"cna_2"|"cna_3"|"savings", { mode: "balance"|"amount"; amount: number|null }>> }`
  - `type CalcContext = { cutoff: string /*YYYY-MM-DD*/; allotmentMode: AllotmentMode; movementRule: MovementRule }`
  - `computeLine(input: LineInput, ctx: CalcContext): LineAmounts`, implementing R1–R14 exactly as spec §3. Movements count when `effectiveDate <= cutoff` and (rule `all_entered`, or status `approved`). Obligations count when `month <= cutoff month`. Recorded allotments count when approved and `date <= cutoff`. `savingsHalf = Math.round(savings / 2)`, half-away-from-zero, matching SQL `round(x/2, 2)`.
- `rollup.ts`:
  - `type DisplayRow = { key: string; type: "node"|"subtotal"|"grand"; row: ReportRow; depth: number; label: string; amounts: LineAmounts|null; pct: number|null; sectionSeq: number|null }`
  - `rollup(rows: ReportRow[], opts?: { sectionSeq?: number }): DisplayRow[]`: rows in tree order. After each non-leaf node with `showTotal` and at least one line descendant, emit a `subtotal` with label `totalLabel ?? "TOTAL " + label`. A final `grand` row reads "GRAND TOTAL" (omitted when `sectionSeq` filters to one section). `pct = obligation / adjusted * 100` when `adjusted > 0`, else null (R9; negative adjusted → null).
  - `sectionSummaries(rows: ReportRow[]): { seq: number; label: string; amounts: LineAmounts; pct: number|null }[]`: one per depth-0 node. A top-level stand-alone line is its own section.
  - `classificationTotals(rows: ReportRow[]): { code: string; name: string; amounts: LineAmounts }[]`: uses a line's own classification, else its nearest classification ancestor, else `{code:"UNCLASSIFIED", name:"Unclassified"}`.
  - `monthlyTotals(rows: ReportRow[]): number[]` (12 entries).
- `fixtures/basic.json`:
  - Settings: one book, cutoff `2090-09-30`.
  - Tree: 2 sections (one with a group and a note), PS/MOOE/CO classifications, and one top-level stand-alone line.
  - Data:
    - 6 lines, one with appropriation 0.
    - SB-1, SB-2, a realignment netting to zero, and a pending augmentation dated before the cutoff.
    - An NTA reduction of −1,000.00, and a movement dated after the cutoff.
    - Obligations in months 1, 9 and 10.
    - Extras in `balance` and `amount` modes.
  - Expected values: per-line `LineAmounts` and grand totals for 4 contexts, covering `{all_entered, approved_only} × {equals_adjusted, recorded}`.

- [ ] **Step 1: Write failing tests.**
  - `money.test.ts` covers each accept/reject case listed above, including `"1.005"` → error, `"(1,234.50)"` → −123450, `"895256+57158+441937"` → 139435100 with that entry, and `"abc"` → error.
  - `calc.test.ts` iterates the fixture contexts and asserts `computeLine` equals the expected values. Named cases: `"zero appropriation line has null pct"`, `"pending movement excluded under approved_only"`, `"October obligation excluded at September cutoff"`, `"NTA reduction lowers total changes"`, `"recorded allotment mode uses approved allotments only"`.
  - `rollup.test.ts`: the subtotal of a group equals the sum of its lines; a note produces no amounts; subtotal pct is computed from the totals (assert 40.24 from obligation 61036503867 / adjusted 151688286636, the §2.4 figures); a negative adjusted gives pct null; `sectionSummaries` counts the stand-alone line as a section; `classificationTotals` puts it under UNCLASSIFIED; the grand total equals the sum of section summaries.
- [ ] **Step 2: Run** `pnpm test lib/saao`. Expected: FAIL.
- [ ] **Step 3: Implement the four modules.**
- [ ] **Step 4: Run** `pnpm test lib/saao`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(saao): money parsing, rule registry, line calc and rollup`

### Task 5: SQL line computation, kept in step with TypeScript

**Files:**
- Create: `supabase/migrations/20261020000400_saao_compute.sql`
- Create: `scripts/saao/fixture-to-sql.ts` (run with `pnpm tsx`; add `tsx` as a devDependency only if it is not already resolvable via `pnpm dlx`. Prefer `node --experimental-strip-types`, which Node ≥ 22.6 supports; check `node -v` first)
- Create (generated): `supabase/tests/17_saao_compute.test.sql`
- Test: `lib/saao/fixture-sql.test.ts`
- Modify: `package.json` scripts: `"saao:fixture-sql": "node --experimental-strip-types scripts/saao/fixture-to-sql.ts"`

**Interfaces:**
- Produces: `pr_tracker.saao_compute_lines(p_book_id uuid, p_cutoff date) returns table(node_id uuid, appropriation numeric, nta numeric, sb jsonb, supplemental numeric, realignment numeric, total_changes numeric, adjusted numeric, allotment numeric, obligation numeric, months numeric[], balance_appropriation numeric, balance_allotment numeric, cna_1 numeric, cna_2 numeric, cna_3 numeric, savings numeric, savings_half numeric)`. It returns one row per `kind='line'` node of the book, reads the book's `allotment_mode`/`movement_rule`, and requires encoder (`_saao_require('encoder')`).
- Produces: `buildFixtureSql(fixture): string` exported from the script. It emits a pgTAP file that creates the fixture book as postgres (fiscal year 2090), then for each context sets the book settings and asserts `saao_compute_lines` per line, and the sums, equal the expected values (`results_eq`).

- [ ] **Step 1: Write** `fixture-sql.test.ts`, asserting that `buildFixtureSql(fixture)` equals the committed contents of `supabase/tests/17_saao_compute.test.sql`. This is the drift guard; the message tells you to run `pnpm saao:fixture-sql`.
- [ ] **Step 2: Run** `pnpm test lib/saao/fixture-sql`. Expected: FAIL (file missing).
- [ ] **Step 3: Implement** the script, generate the test file, and write `saao_compute_lines` using set-based aggregates per table joined on `node_id`, mirroring R1–R14.
- [ ] **Step 4: Run** `pnpm test && pnpm test:db`. Expected: PASS for both.
- [ ] **Step 5: Commit** `feat(saao): SQL line computation with generated parity test`

### Task 6: Reports: draft, finalize, revise, snapshot

**Files:**
- Create: `supabase/migrations/20261020000500_saao_reports.sql`
- Test: `supabase/tests/18_saao_reports.test.sql`

**Interfaces:**
- Produces tables `saao_reports` and `saao_report_rows` per spec §4.8. `saao_report_rows` stores `months numeric[]` instead of m1..m12, and `sb jsonb`.
- RLS: report and row select are allowed when (`status in ('finalized','superseded')` and `saao_role() is not null`) or rank ≥ 2.
- Produces:
  - `saao_create_draft(p_book_id uuid, p_cutoff date) returns uuid`: encoder. Normalises to month end. If a draft already exists for that cutoff, returns its id. If a finalized report exists, raises `'This month is already finalized; start a revision instead'`.
  - `saao_delete_draft(p_report_id uuid) returns void`: encoder, drafts only.
  - `saao_unapproved_movements(p_report_id uuid) returns table(id uuid, reference_no text, title text, kind text, status text, status_note text, total numeric)`: movements of the book with `effective_date <= cutoff`, status ≠ approved, that are counted under the current `movement_rule`.
  - `saao_finalize(p_report_id uuid, p_acknowledged uuid[]) returns void`: finalizer. Follows the spec §7.2 steps. Raises `'Review the unapproved movements before finalizing'` when the acknowledged set ≠ the `saao_unapproved_movements` id set. It inserts **every node** of the book in DFS order: `seq` from 1; `parent_seq`; `depth`; `section_seq`; classification code/name per the effective-classification rule; line amounts from `saao_compute_lines`; nulls for non-lines. It freezes `rules` (`allotment_mode`, `movement_rule`, `extra_labels`, rule classes), `header` (`header_lines`, certifier, fund code/name, fiscal_year, cutoff) and `movements` (all counted movements with totals), and supersedes the previous finalized version.
  - `saao_start_revision(p_report_id uuid, p_reason text) returns uuid`: finalizer. The source must be finalized. Raises `'A revision reason is required'`.
  - `pr_tracker.saao_live_rows(p_book_id uuid, p_cutoff date) returns setof jsonb`: encoder. Produces the same row shape as `saao_report_rows`, computed live, using the same DFS function as finalize (`_saao_tree_rows(p_book_id)`).

- [ ] **Step 1: Write the failing test.** Assertions:
  - An encoder creates a draft; calling again returns the same id.
  - The encoder cannot finalize.
  - A finalizer with a pending movement and empty ack fails with the message above; with the ack it finalizes.
  - The viewer now sees the report and its rows. Before finalization, the viewer saw 0 rows of the draft.
  - **"finalized snapshot unchanged after edits":** change the appropriation and add an obligation after finalizing; the snapshot's sum of adjusted and obligation is unchanged.
  - `saao_create_draft` for the same month raises the "already finalized" message.
  - A revision with an empty reason raises; with a reason it creates v2 draft. Finalizing v2 sets v1 to `superseded`, and both remain readable by the viewer.
  - `authenticated` cannot update `saao_report_rows` (42501).
  - The row count in the snapshot equals the node count.
- [ ] **Step 2: Run** `pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test:db`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(saao): draft, finalize, revision and immutable snapshots`

### Task 7: One-time FY2026 General Fund seed

**Files:**
- Create: `scripts/saao/gen_seed.py` (dev-only; run as `python3 -I scripts/saao/gen_seed.py "<workbook path>" > supabase/migrations/20261020000600_saao_seed_fy2026_gf.sql`)
- Create (generated): `supabase/migrations/20261020000600_saao_seed_fy2026_gf.sql`
- Test: `supabase/tests/19_saao_seed.test.sql`

**Interfaces:**
- Consumes the workbook at `/Users/berltreasurecampomanes/Desktop/GENERAL FUND- OCTOBER  2026.xlsx` (note the two spaces). Copy it into the scratchpad first; it must never be committed.
- Produces one FY2026 GF book (title "FY 2026 General Fund"), plus nodes, movements, movement lines, obligations and extras as described in spec §12, "One-time seed". The SQL is idempotent: wrap it in `do $$ … if exists (select 1 from pr_tracker.saao_books b join pr_tracker.saao_funds f on f.id=b.fund_id where b.fiscal_year=2026 and f.code='GF') then return; …`. Ids come from `gen_random_uuid()` via temp mapping tables keyed by workbook row number.

**Tree inference** (the algorithm the script must follow, using sheet `SAAO` rows 13–1362):
1. A row is a **line** when column V holds a formula of the form `=I{r}+U{r}`, or column X holds `=OBLIGATION!T…`. Description: the first non-empty text in A–F. Code: the first `\d-\d{2}-\d{2}-\d{3}` match in G or H, else null. Appropriation: I.
2. A row is a **total** (skipped, but used to close groups) when column A–C text starts with `TOTAL`, `Sub Total`, `GRAND TOTAL` or `Total`, or V is a `SUM(`/`+` formula of other V cells.
3. Any other row with text is a **heading**. If the text, stripped and uppercased, is one of `PERSONAL SERVICES`, `MAINTENANCE AND OTHER OPERATING EXPENSES`, `CAPITAL OUTLAY`, `MOOE`, or starts with `MAINTENANCE AND OTHER OPERATING`, it is a `classification` (PS/MOOE/CO). Otherwise it is a `section` when it is the first heading after a grand-total component boundary (the rows listed in the I1364 formula mark section ends), else a `group`. A heading directly followed by indented rows and no amounts, whose children have no V formula, becomes a `note`.
4. Parent = the nearest open heading with a smaller indent column (A=0 … F=5). Classification headings at the same indent as a group open a new level under the current section or group. A total row closes every heading opened since the first row of its SUM range.
5. The `total_label` of a closed heading is the total row's text.

**Movements:** SB-1..SB-3 come from SAAO columns K, L and M (only non-zero cells); they are `supplemental` with sb_number 1–3, titled "Supplemental Budget No. n". Each RealignmentReversion column G..AF with any non-zero cell becomes one movement. Its row-10 header becomes the title, with whitespace collapsed. `reference_no` is the first `\d{3}-\d{4}` match or the resolution number. Kind: header containing `SOURCE FOR SB` → `reversion`; `AUGMENTATION` → `augmentation`; `REALIGNMENT` or `RESOLUTION` → `realignment`. Status comes from the row-9 note (spec §12). `effective_date` is `2026-01-01`, with the remarks text from spec §12. Movement line node = the line at the **same row number**, except for the misaligned references listed in the design analysis: use the SAAO T/X formula's referenced row to map source rows to SAAO lines.

**Obligations:** OBLIGATION columns G..R are months 1–12, mapped via SAAO X's referenced row. Formula cells `=a+b+c` store `entry` without `=` and amount = the evaluated sum. Constants have no entry.

**Extras:** AA/AC/AD/AE are `cna_1`/`cna_2`/`cna_3`/`savings`. A cell `=Z{r}` → mode `balance`; a numeric constant → mode `amount`. Formula errors and subtotal rows are skipped.

- [ ] **Step 1: Write** `19_saao_seed.test.sql`. As postgres, with a finalizer granted, call `saao_compute_lines(<FY2026 GF book>, '2026-10-31')` and assert the sums equal the spec §2.4 figures exactly:
  - appropriation 1477560233.28
  - supplemental 78854376.62
  - realignment −39531743.54
  - adjusted 1516882866.36
  - obligation 610365038.67
  - balance_allotment 906517827.69
  - savings 6836180.36
  - savings_half 3418090.18
  - SB-1 5512422.54 / SB-2 14732435.00 / SB-3 58609519.08

  Also assert, for City Mayor's Office, City Council and City Administrator, that the section's adjusted sum equals workbook rows 164 (395338865.14), 476 (97509323.06) and 530 (39792740.98). Also assert that line count ≥ 900.
- [ ] **Step 2: Run** `pnpm test:db`. Expected: FAIL (no seed).
- [ ] **Step 3: Implement** `gen_seed.py`, generate the migration, and run `supabase db reset --local`. Then iterate on the tree inference until every section total listed in the I1364 formula matches its workbook V value. Add a script self-check that prints every mismatch and exits non-zero when there is any.
- [ ] **Step 4: Run** `pnpm test:db`. Expected: PASS. Also confirm every other test file still passes with the seed present.
- [ ] **Step 5: Commit** the script and migration: `feat(saao): one-time FY2026 General Fund seed from October workbook`

### Task 8: Server data layer, navigation, book switcher, settings pages

**Files:**
- Create: `lib/saao/access.ts`, `lib/saao/queries.ts`, `lib/saao/book-cookie.ts`
- Create: `app/(app)/budget/layout.tsx`, `app/(app)/budget/book-switcher.tsx`, `app/(app)/budget/actions.ts`
- Create: `app/(app)/budget/settings/page.tsx` plus tab components `access-tab.tsx`, `books-tab.tsx`, `rules-tab.tsx`, `labels-tab.tsx`, `funds-tab.tsx`, `classifications-tab.tsx`
- Modify: `components/app-sidebar.tsx` (add a "Budget" group, shown when `saaoRole` is set; PR admins without a role see only "Budget Settings")
- Modify: `app/(app)/layout.tsx` (fetch `saao_my_access` and pass `saaoRole` to `AppSidebar`)
- Modify: `lib/supabase/database.types.ts` (regenerate with `pnpm db:types`)
- Test: `lib/saao/queries.test.ts` (row mapping only)

**Interfaces:**
- `access.ts`: `getSaaoRole(): Promise<SaaoRole|null>` (cached, via `saao_my_access`); `requireSaao(min: SaaoRole): Promise<{ profile: Profile; role: SaaoRole }>`, which redirects to `/` when the role is too low; `atLeast(role: SaaoRole|null, min: SaaoRole): boolean`.
- `book-cookie.ts`: cookie `saao_book`; `getSelectedBookId(books: {id:string}[]): Promise<string|null>`, which falls back to the latest fiscal year.
- `queries.ts`:
  - `listBooks()`
  - `getBook(id)`
  - `listReports(bookId?)`
  - `getReport(id)`
  - `getReportRows(reportId): Promise<ReportRow[]>`: snapshot rows mapped with `fromNumeric`.
  - `getLiveRows(bookId, cutoff): Promise<ReportRow[]>`: via `saao_live_rows`.
  - `getEditorData(bookId)`: nodes, movements with lines, obligations, allotments and extras, for the editor and `calc.ts`.
  - `toReportRow(json: unknown): ReportRow`: exported for the test.
- `actions.ts`: `"use server"` wrappers via `rpcAction` for every RPC from Tasks 2, 3 and 6. Names are camelCase of the RPC without the `saao_` prefix (`setAccess`, `createBook`, `updateBook`, `addNode`, `updateNode`, `moveNode`, `deleteNode`, `upsertMovement`, `deleteMovement`, `setMovementLine`, `setObligation`, `upsertAllotment`, `deleteAllotment`, `setExtra`, `applyBatch`, `createDraft`, `deleteDraft`, `finalizeReport`, `startRevision`, `upsertFund`, `upsertClassification`). Each revalidates `/budget` as a layout.
- Sidebar items: Budget Dashboard `/budget` (icon `PieChart`), SAAO Reports `/budget/saao` (`Sheet`), Appropriations `/budget/data/appropriations` (`Landmark`), Allotments `/budget/data/allotments` (`Wallet`), Obligations `/budget/data/obligations` (`Receipt`), Budget Movements `/budget/data/movements` (`ArrowLeftRight`), Ending Balance `/budget/ending-balance` (`Scale`), Report History `/budget/history` (`History`), Budget Settings `/budget/settings` (`SlidersHorizontal`). The Budget Data items use `SidebarGroupLabel` "Budget Data" as a sub-label.

- [ ] **Step 1: Read** `node_modules/next/dist/docs/01-app` guides on layouts, server actions, cookies and `searchParams`. Write `queries.test.ts`: `toReportRow` maps a snapshot JSON with numeric strings (`"1477560233.28"`) to centavos 147756023328, and `months` to 12 numbers.
- [ ] **Step 2: Run** `pnpm test lib/saao/queries`. Expected: FAIL.
- [ ] **Step 3: Implement** the data layer, sidebar, layout and settings tabs. The Access tab uses the existing data-table to list active profiles with a role `Select` (None/Viewer/Encoder/Finalizer/Budget admin). The Rules tab shows R5/R11 with "Provisional — awaiting Budget Office confirmation" text and a confirm dialog (existing `confirm-action-dialog`).
- [ ] **Step 4: Run** `pnpm test && pnpm lint && pnpm build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(saao): data layer, budget navigation and settings`

### Task 9: Read-only SAAO view, report history

**Files:**
- Create: `components/saao/saao-table.tsx` (read-only render of `DisplayRow[]`), `components/saao/report-header.tsx`, `components/saao/basis-note.tsx`, `components/saao/columns.ts`
- Create: `app/(app)/budget/history/page.tsx`, `app/(app)/budget/history/[id]/page.tsx`
- Test: `lib/saao/columns.test.ts`

**Interfaces:**
- `columns.ts`: `saaoColumns(sbNumbers: number[], labels: Record<"cna_1"|"cna_2"|"cna_3"|"savings", string>): { key: string; header: string; group?: string; get: (a: LineAmounts) => number; editable?: "appropriation"|"sb"|"extra" }[]`. Order follows spec §8.3: Annual · NTA · SB-n… · Supplemental · Realign/Reversion · Total Changes · Adjusted · Allotment · Obligation · Bal. Approp. · Bal. Allot. · CNA1 · % (special) · CNA2 · CNA3 · Savings · 50% Savings. The workbook places % between CNA columns, so keep its order: AA, AB(%), AC, AD, AE, AF.
- `SaaoTable({ rows: DisplayRow[]; columns; sectionFilter?: number })`: sticky header and description column, `overflow-x-auto`, subtotal rows `font-semibold bg-muted/40`, grand row `font-bold border-t-2`, amounts right-aligned in `tabular-nums` via `formatAmount`.
- `ReportHeader({ book, report, cutoffLabel })`: header lines, title, "As of October 31, 2026", fund, and a status badge (Draft amber / Finalized green / Superseded grey with "superseded by vN").
- `BasisNote({ rules, acknowledged })`: renders `basisOfFigures` plus the list of acknowledged unapproved movements.

- [ ] **Step 1: Write** `columns.test.ts`: with `sbNumbers [1,2,3]` the headers come back in the order above, and `% ` sits between CNA1 and CNA2.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** the components and pages. History lists reports of the selected book with the spec §8.7 columns, using the existing data-table. `[id]` loads snapshot rows (finalized/superseded) or live rows (draft; encoder+ only, otherwise a 404 via `notFound()`) and supports `?section=<seq>`. Draft pages show the banner "DRAFT — not official. Figures change as data is entered."
- [ ] **Step 4: Run** `pnpm test && pnpm build`. Expected: PASS. Manually open `/budget/history` against local data, with the seed applied: create a draft as encoder and confirm its grand totals equal §2.4.
- [ ] **Step 5: Commit** `feat(saao): read-only SAAO report view and history`

### Task 10: SAAO workspace editor

**Files:**
- Create: `app/(app)/budget/saao/page.tsx`, `app/(app)/budget/saao/workspace.tsx` (client), `components/saao/editable-grid.tsx`, `components/saao/structure-menu.tsx`, `components/saao/paste-preview-dialog.tsx`, `components/saao/finalize-dialog.tsx`, `lib/saao/paste.ts`, `lib/saao/editor-state.ts`
- Test: `lib/saao/paste.test.ts`, `lib/saao/editor-state.test.ts`

**Interfaces:**
- `paste.ts`:
  - `parseClipboard(text: string): string[][]`: handles TSV, quoted cells with tabs or newlines (Excel quoting), and drops the trailing empty line.
  - `type PasteTarget = { rowKey: string; nodeId: string; colKey: string; editable: false | "label"|"code"|"appropriation"|"sb"|"extra"|"obligation"|"movement_line" }`
  - `planPaste(cells: string[][], targets: PasteTarget[][], current: (nodeId: string, colKey: string) => string): { changes: { nodeId: string; colKey: string; from: string; to: string; centavos?: number; entry?: string|null }[]; errors: { row: number; col: number; message: string }[]; skipped: number }`. Non-editable or out-of-range cells increment `skipped` and never produce a change. Amounts go through `parseAmount`.
  - `changesToOps(changes, ctx: { sbMovementIds: Record<string,string>; bookId: string }): unknown[]`: converts changes to `saao_apply_batch` ops.
- `editor-state.ts`: `buildEditorRows(data: EditorData, ctx: CalcContext): ReportRow[]`, using `calc.computeLine` per line in tree order (the same DFS order as SQL: sort by `sort_order`, then `created_at`). `applyLocalEdit(data, edit): EditorData` gives the optimistic update.
- Workspace behaviour, per spec §8.3:
  - Active cell state `{rowKey, colKey}`. Arrow keys, Tab and Shift+Tab move between cells. Enter, F2 or typing enters edit mode; Enter commits, Esc cancels.
  - On commit: `parseAmount` → optimistic local update → server action → toast and rollback on error.
  - Realignment and Obligation cells are links (`/budget/data/movements?line=<id>`, `/budget/data/obligations?line=<id>`).
  - A "+ SB" button creates the next supplemental movement via `upsertMovement` (prompting for reference number and date).
  - The structure menu (row `DropdownMenu`) offers: Add line below, Add group below, Add classification below, Add note below, Add child, Indent, Outdent, Move up, Move down, Set classification…, Link to PR office… (sections only; `updateNode({office_id})`), Edit total label…, Delete. Indent = move under the previous sibling (last); Outdent = move after the parent.
  - Search filters rows, keeping ancestors.
  - The finalize dialog loads `saao_unapproved_movements`, requires a tick per movement and a final confirmation, then calls `finalizeReport`.
  - The top bar has the month selector, report state, and buttons per role (`atLeast`).
  - Render only the input for the active cell. Other cells are text, which keeps about 1,000 × 20 cells fast.

- [ ] **Step 1: Write tests.**
  - `paste.test.ts`: `"a\tb\n1\t2\n"` → 2×2; a quoted cell with an embedded tab; a 3×3 paste onto a 2-column editable area gives 3 skipped; a paste onto an `Adjusted` (non-editable) column gives 0 changes; `"1,000.50"` → 100050; `"x"` → error with row/col; `changesToOps` produces `obligation` and `movement_line` ops with the right ids.
  - `editor-state.test.ts`: `buildEditorRows` on the fixture equals the rows expected for context 1; `applyLocalEdit` of an appropriation updates that line's adjusted.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test && pnpm lint && pnpm build`. Expected: PASS. Then, in the browser on local data, run through these steps:
  1. Edit an appropriation and see adjusted recalculate.
  2. Paste a 2×3 block and see the preview.
  3. Add and indent a line.
  4. Finalize with the pending-movement acknowledgement.
- [ ] **Step 5: Commit** `feat(saao): SAAO workspace editor with keyboard grid, structure editing and paste`

### Task 11: Budget Data screens

**Files:**
- Create: `app/(app)/budget/data/appropriations/page.tsx` + `appropriations-grid.tsx`
- Create: `app/(app)/budget/data/obligations/page.tsx` + `obligations-grid.tsx`
- Create: `app/(app)/budget/data/movements/page.tsx` + `movements-table.tsx`, and `app/(app)/budget/data/movements/[id]/page.tsx` + `movement-form.tsx` + `movement-lines-grid.tsx`
- Create: `app/(app)/budget/data/allotments/page.tsx` + `allotments-table.tsx`
- Create: `components/saao/line-picker.tsx` (searchable popover listing lines as "Section › … › Description (code)")
- Test: `lib/saao/movement-summary.test.ts`, `lib/saao/movement-summary.ts`

**Interfaces:**
- `movement-summary.ts`: `summarizeMovement(lines: { amount: number }[]): { plus: number; minus: number; net: number }`; `netWarning(kind: MovementKind, net: number): string|null`, which returns `"This realignment does not net to zero (net ₱x)"` for `realignment`/`augmentation` when net ≠ 0, and null otherwise.
- All grids reuse `components/saao/editable-grid.tsx` from Task 10 with a different column set:
  - Obligations: Jan–Dec + Total; months after the selected cutoff are shaded; the cell tooltip shows `entry`.
  - Appropriations: Code · Description · Classification · Annual · Reference · Adjusted (read-only).
  - Movement lines: Line (picker) · Amount · running Net.
- The movements list shows ref, kind, SB no., title, date, a status badge with the note, +, −, net, and is filterable by kind and status. Status changes go through `upsertMovement`.
- The allotments page shows the banner "Allotments are not used in reports while the book's allotment rule is 'equals adjusted appropriation' (provisional, R5)." whenever `allotment_mode = 'equals_adjusted'`.
- `?line=<id>` on obligations and movements pre-filters to that line.

- [ ] **Step 1: Write** `movement-summary.test.ts`: lines [+300000, −300000] give net 0 and no warning; a realignment with [+5, −3] gets the warning; a `reversion` with [−5] gets no warning.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test && pnpm build`. Expected: PASS. Then in the browser: enter an obligation `100+200` and see 300.00 with the tooltip; add a realignment and see the net warning.
- [ ] **Step 5: Commit** `feat(saao): appropriations, obligations, movements and allotments screens`

### Task 12: Dashboard, drill-down, ending balance

**Files:**
- Create: `app/(app)/budget/page.tsx`, `app/(app)/budget/dashboard/summary-cards.tsx`, `app/(app)/budget/dashboard/charts.tsx`, `app/(app)/budget/dashboard/section-table.tsx`
- Create: `app/(app)/budget/ending-balance/page.tsx`, `lib/saao/ending-balance.ts`
- Test: `lib/saao/ending-balance.test.ts`, `lib/saao/dashboard.test.ts`, `lib/saao/dashboard.ts`

**Interfaces:**
- `dashboard.ts`:
  - `pickDefaultReport(reports: { id: string; status: string; cutoff_date: string }[]): string|null`: the latest-cutoff `finalized` report, never a draft.
  - `summaryCards(rows: ReportRow[]): { key: string; label: string; centavos: number|null; pct?: number|null; provisional?: string }[]`: the 8 cards from spec §8.2. Allotment and both balances carry `provisional: "R5"`/`"R7"`.
  - `topSections(rows, n = 15)`, with the remainder summed into "Others".
- `ending-balance.ts`: `endingBalanceMatrix(rows: ReportRow[]): { sections: { seq: number; label: string; byClass: Record<string, number>; total: number }[]; classes: { code: string; name: string }[]; columnTotals: Record<string, number>; grand: number }`, built from `balanceAllotment` using `classificationTotals` logic per section. `// AWAITING BUDGET OFFICE (R15)`
- Charts are hand-written SVG components inside `charts.tsx` (load the `dataviz` skill before writing them): `HBarChart`, `GroupedBarChart`, `StackedBar`, `MonthlyColumns`. They take data from `rollup` helpers only.
- Page query params: `?book=&report=&section=&preview=draft`. `preview=draft` is honoured only for encoder+; it switches to live rows of the latest draft and shows an amber "DRAFT PREVIEW — not official" frame. With no finalized report, the empty state reads "No finalized SAAO report for {book title} yet." plus, for encoder+, a link to the workspace.
- Clicking a section row goes to `/budget/history/{reportId}?section={seq}`.

- [ ] **Step 1: Write tests.**
  - `pickDefaultReport` ignores a newer draft and returns the latest finalized; it returns null when only drafts exist.
  - `summaryCards` on the fixture equals the fixture grand totals.
  - `endingBalanceMatrix`: the row total equals the sum of its cells, the grand total equals the rollup grand `balanceAllotment`, and the stand-alone line lands in UNCLASSIFIED.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** (after loading the `dataviz` skill).
- [ ] **Step 4: Run** `pnpm test && pnpm build`. Expected: PASS. Then in the browser, as a viewer: the dashboard is empty until a report is finalized; after it is, the cards equal §2.4 for the seeded book finalized at October.
- [ ] **Step 5: Commit** `feat(saao): budget dashboard, section drill-down and ending balance framework`

### Task 13: Print and Excel export

**Files:**
- Create: `app/print/saao/[id]/page.tsx`, `app/print/saao/[id]/print-toolbar.tsx`
- Create: `app/(app)/budget/export/[id]/route.ts`, `lib/saao/xlsx.ts`
- Modify: `package.json` (add `exceljs@4.4.0`)
- Test: `lib/saao/xlsx.test.ts`

**Interfaces:**
- `xlsx.ts`: `buildSaaoWorkbook(input: { header: { lines: string[]; title: string; fund: string; asOf: string; status: "draft"|"finalized"|"superseded"; version: number }; rows: DisplayRow[]; columns: ReturnType<typeof saaoColumns>; basis: string[]; certifier: { name: string|null; title: string|null } }): ExcelJS.Workbook` (sheet "SAAO"); `buildEndingBalanceWorkbook(matrix, header): ExcelJS.Workbook`.
  - Numbers are written as numbers (pesos = centavos/100) with `numFmt '#,##0.00;-#,##0.00'`. % cells use `0.00` or are blank when null.
  - Subtotal rows are bold, the grand row is bold with a top border, and header rows are merged across all columns.
  - A draft gets "DRAFT — NOT OFFICIAL" in row 1. The basis lines and the "Certified Correct:" block go after the table.
  - No formulas are written.
- Route `GET /budget/export/[id]?sheet=saao|ending-balance`: authorization uses the user's Supabase client (RLS decides visibility; 404 when not visible). Responds with `Content-Disposition: attachment; filename="SAAO-FY2026-GF-2026-10-v1.xlsx"`.
- Print page: same data path as history `[id]`, `@page { size: 13in 8.5in landscape; margin: 10mm }` (long bond), repeat `thead` on each page, a DRAFT watermark for drafts, then the basis note and certifier block. The toolbar has Print and Back.

- [ ] **Step 1: Write** `xlsx.test.ts`. Build from the fixture rollup and assert:
  - The A-column cell of the grand row is "GRAND TOTAL".
  - The adjusted cell value equals the fixture total / 100 and is a number.
  - No cell has a formula.
  - A null-pct cell is empty, not NaN.
  - The draft status writes "DRAFT — NOT OFFICIAL" in A1.
  - `await wb.xlsx.writeBuffer()` resolves.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Install** with `pnpm add exceljs@4.4.0`, then implement.
- [ ] **Step 4: Run** `pnpm test && pnpm build`. Expected: PASS. Then download the export from the browser, open it in Numbers or Excel, and check that the grand totals match.
- [ ] **Step 5: Commit** `feat(saao): print layout and Excel export`

### Task 14: End-to-end flow and regression

**Files:**
- Create: `e2e/saao.spec.ts`
- Modify: `e2e/global-setup.ts` (create dev-login users `budget.encoder@x.test`, `budget.finalizer@x.test`, `mayor.viewer@x.test` and grant SAAO roles, following the existing global-setup pattern)
- Modify: `README.md` (short "Budget / SAAO module" section: roles, how to grant access, migration order, the seed being one-time, and the open Budget Office questions linking to spec §9)

**Interfaces:**
- Consumes all pages above.

- [ ] **Step 1: Write** `e2e/saao.spec.ts` with these tests:
  - `"viewer sees empty dashboard and no draft"`: the viewer opens `/budget`, sees the empty state, and `/budget/history/<draftId>` returns not found.
  - `"encoder builds a small book and drafts"`: on a test book FY2093 created via settings by the finalizer (who is also budget_admin in setup), the encoder adds a section, a classification and a line, types appropriation 100,000.00 and obligation `20000+5000` for January, creates a draft for January, and sees Adjusted 100,000.00 and Obligation 25,000.00 (25.00%).
  - `"finalizer finalizes; viewer sees official figures; later edit does not change them"`: after finalization, the viewer dashboard card Obligations reads ₱25,000.00. The encoder then changes the obligation to 30,000, and the viewer still sees 25,000.00 on the finalized report.
  - `"revision keeps v1"`: the finalizer starts a revision with reason "Correct January obligation" and finalizes. History shows v1 Superseded and v2 Finalized, and the dashboard shows 30,000.00.
  - `"export downloads xlsx"`: the download event filename ends with `.xlsx`.
- [ ] **Step 2: Run** the e2e recipe: `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true pnpm build`, then Playwright with the :3100 config override and `PW_CHANNEL=chrome`. Expected: the new spec fails only where the UI is missing (it should all exist by now, so fix whatever fails).
- [ ] **Step 3: Fix** what fails.
- [ ] **Step 4: Run** the full suite: `pnpm test && pnpm test:db && pnpm lint && pnpm build`, then all e2e specs (existing PR specs plus saao) on :3100. Expected: everything passes, with no changes to existing specs.
- [ ] **Step 5: Commit** `test(saao): end-to-end budget flow; docs: SAAO module README`
