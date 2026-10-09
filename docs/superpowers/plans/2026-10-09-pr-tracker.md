# LGU Purchase Request Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + Supabase web app that tracks where each LGU Purchase Request physically is and what its processing status is, with an immutable audit trail, office dashboards, a notification bell, and a printable QR routing slip.

**Architecture:** All workflow rules live in Postgres `SECURITY DEFINER` functions in the `pr_tracker` schema. Each function locks the PR row, validates the action, applies it, and writes the audit event and notifications in one transaction. Row Level Security limits reads to involved offices. Next.js (App Router) server components read through RLS-protected views, and server actions call the RPC functions. There is no service-role key and no Realtime.

**Tech Stack:**
- Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript (strict), pnpm 10, Node 22.
- Supabase: Postgres 15+, Auth with Google, Storage; `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.x; Supabase CLI 2.x with local Docker stack; pgTAP.
- Tailwind CSS v4 + shadcn/ui (Radix), `@tanstack/react-table` v8, react-hook-form + zod 4, `@dnd-kit`, `qrcode`, sonner.
- Vitest for unit tests and Playwright for end-to-end tests.

**Spec:** `docs/superpowers/specs/2026-10-09-pr-tracker-design.md`. Read it before starting any task.

## Global Constraints

- Every database object lives in schema `pr_tracker`. The Storage bucket is named `pr-tracker-attachments`.
- The Supabase project is **shared** with other apps:
  - Never use Supabase Auth hooks.
  - Never create objects in `public`.
  - Never run `supabase db push` against the remote project (see Task 28).
- No Supabase Realtime. The notification bell polls every **60 s** while the tab is visible.
- The app never uses the service-role key. Privileged logic runs only in `SECURITY DEFINER` functions with `set search_path = ''`.
- Writes to workflow tables go **only** through RPC functions. Direct INSERT/UPDATE/DELETE privileges are never granted to `authenticated`.
- `pr_events` is append-only, enforced by grants **and** a trigger.
- Routing Slip No. format is `RS-YYYY-MM-#####`. The 5-digit sequence resets each year, computed in `Asia/Manila` time.
- All dates and times shown in the UI use time zone `Asia/Manila`. Money is shown as PHP (`₱`, `en-PH`).
- Uploads must be ≤ `max_upload_mb` (default **20**). Allowed MIME types:
  - `application/pdf`
  - `image/jpeg`
  - `image/png`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Every button that changes data opens a confirmation modal.** Any reason or remark is entered inside that modal, and the confirm button is disabled while the action runs.
- **Every tabular view uses the shared `DataTable` component** (TanStack Table v8).
- The layout has a **dark sidebar** and a light content area.
- Super admin is `berlcamp@gmail.com`. It is seeded by migration.
- Office codes: `GSO`, `MAYOR`, `BUDGET`, `BAC` (Bids and Awards Committee), `ACCTG`, `TREAS`.
- Seed default route (step: office, purpose):
  1. GSO, For review
  2. MAYOR, For approval
  3. BUDGET, For certification of funds
  4. MAYOR, For approval
  5. BAC, For procurement
  6. MAYOR, For signing of NOA / NTP
  7. BAC, For processing
  8. GSO, For processing
  9. ACCTG, For processing
  10. TREAS, For payment processing
- Env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_ENABLE_DEV_LOGIN` (local and E2E only; never set in production).

### Decisions this plan makes where the spec was silent or refined

1. **Super admin comes from the seed migration, not an env var.**
   - The super admin profile is inserted by the seed migration (Task 5), so `SUPER_ADMIN_EMAIL` is not needed at runtime.
   - The DB refuses to modify or reassign the `super_admin` row.
2. **Sign-in provider allowlist.** `link_my_profile()` only links an auth user whose sign-in provider is listed in `app_settings.allowed_auth_providers` (production: `["google"]`).
   - This stops someone from signing up with email+password on the shared project, using an allowlisted email, to take over that profile.
3. **Suggested next stop skips steps belonging to the current holder's office.** The suggestion is the first step after `route_step` whose office differs from the holding office.
   - Example: when GSO creates a PR, the suggestion is step 2 (Mayor) rather than step 1 (GSO itself).
4. **The office a PR is in transit to can view it** before receiving it. RLS treats `current_office_id = my office` as involved.
5. **`purchase_requests` has three extra columns:**
   - `sent_by_office_id` and `prev_route_step` support recall.
   - `current_purpose` holds the route-step purpose shown while the PR is in transit.
6. **Only explicit `add_remark`, status changes, attachments, receive, complete and cancel notify followers.**
   - Forward and return notify only the destination office.
   - Recall notifies the office that was expecting the PR.
   - Receive also notifies the office that sent it.
7. **Completing or cancelling sets `current_since = now()`.** "Completed this month" uses that timestamp.
8. **Local and E2E sign-in uses `/dev-login` (email + password).**
   - It is gated by `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true`.
   - It is also gated by the DB provider allowlist, which is `["google","email"]` only in local `seed.sql`.
9. **What counts as "an action button".** Printing, downloading and navigation do not open a confirmation modal. Every button that changes data does. Three things also skip it:
   - Marking notifications as read (personal UI state).
   - Adding or removing rows in a form that hasn't been saved yet.
   - Reordering steps before **Save route**.

   Saving the form itself always confirms.
10. **The confirmation modal is also the form.** For modals that collect input (forward, return, add user, …), the modal both holds the fields and acts as the confirmation. It states exactly what will happen.
11. **Route-suggestion logic exists only in the database.** It is tested with pgTAP (Task 8), not Vitest, so the rule isn't duplicated in TypeScript. Vitest covers the UI-side rules that mirror the DB (permissions, totals, formatting).
12. **The Default Route editor is a drag-and-drop list, not a `DataTable`.** All other list views use `DataTable`.

## Review Focus

1. **Allowlisted email from a non-Google sign-up.** Someone signs up on the shared project with an allowlisted email through email/password or another provider. They must be rejected (`link_my_profile` returns null). A profile already bound to another auth user must never be re-bound. Test: Task 6 Step 1.
2. **Two people click Receive on the same PR**, or one person double-clicks. The second call must fail with "Already received by <name> (<office>) at <time>", with exactly one `received` event. Test: Task 8 Step 1 (`receive twice`).
3. **Routes where an office repeats** (Mayor at steps 2, 4 and 6).
   - From step 3 (Budget), forwarding to Mayor must land on step 4, not 2 or 6.
   - Returning to GSO from Mayor must restore GSO's step.
   - An off-route forward keeps the step.
   Test: Task 8 Step 1.
4. **An uninvolved office reads a PR, its line items, events or private notes through the REST API**, by guessing an ID. It must get zero rows. Admins must still not see another office's private notes. Test: Task 10 Step 1.
5. **Bad line items:** zero items, quantity ≤ 0, negative unit cost, or fractional amounts. These must be rejected with a line-specific message, and totals must round half-up to centavos exactly as Postgres `round(numeric, 2)` does, in both DB and UI. Test: Task 7 Step 1 and Task 15 Step 1 (`lineTotal`).

---

## File Structure

```
pr-tracker/
├── proxy.ts                               # session refresh + auth redirect (Next 16 "proxy")
├── app/
│   ├── layout.tsx                         # root: fonts, Toaster
│   ├── globals.css                        # Tailwind v4 + design tokens (dark sidebar)
│   ├── login/page.tsx                     # "Sign in with Google"
│   ├── dev-login/page.tsx                 # local/E2E only (env-gated)
│   ├── not-authorized/page.tsx
│   ├── auth/callback/route.ts             # code exchange + link_my_profile
│   ├── auth/signout/route.ts
│   ├── print/slips/page.tsx               # 1/4-A4 routing slips (?ids=…&layout=single|4up)
│   ├── print/slips/print-toolbar.tsx
│   └── (app)/
│       ├── layout.tsx                     # requireProfile + SidebarProvider + Topbar
│       ├── page.tsx                       # Dashboard
│       ├── dashboard-tables.tsx           # client column defs for dashboard tables
│       ├── prs/
│       │   ├── page.tsx                   # PR list (server-paginated)
│       │   ├── pr-list-table.tsx  pr-list-filters.tsx
│       │   ├── actions.ts                 # createPr, updatePr
│       │   ├── new/page.tsx
│       │   └── [id]/
│       │       ├── page.tsx               # PR detail
│       │       ├── edit/page.tsx
│       │       └── actions.ts             # workflow server actions
│       ├── track/page.tsx  track/track-form.tsx   # RS No. lookup form
│       ├── track/[rs]/page.tsx            # QR target
│       ├── reports/page.tsx
│       ├── reports/report-tables.tsx  reports/date-range.tsx
│       ├── notifications/actions.ts
│       └── admin/
│           ├── layout.tsx                 # requireAdmin
│           ├── actions.ts
│           ├── users/page.tsx  users/users-table.tsx
│           ├── offices/page.tsx offices/offices-table.tsx
│           ├── route/page.tsx  route/route-editor.tsx
│           ├── statuses/page.tsx statuses/statuses-table.tsx
│           └── settings/page.tsx settings/settings-form.tsx
├── components/
│   ├── ui/…                               # shadcn generated
│   ├── app-sidebar.tsx  topbar.tsx  global-search.tsx  notification-bell.tsx
│   ├── confirm-action-dialog.tsx
│   ├── data-table/data-table.tsx  data-table/column-header.tsx
│   └── pr/
│       ├── movement-badge.tsx  pr-header.tsx  pr-form.tsx
│       ├── pr-action-bar.tsx   receive-button.tsx pr-timeline.tsx remarks-panel.tsx
│       ├── private-notes-panel.tsx attachments-panel.tsx line-items-table.tsx rs-link.tsx
│       └── tracking-view.tsx   routing-slip.tsx
├── lib/
│   ├── types.ts                           # domain types shared by UI
│   ├── supabase/{server.ts,client.ts,database.types.ts,rows.ts}
│   ├── auth/{profile.ts,safe-next.ts}
│   ├── actions/rpc.ts                     # rpcAction + ActionResult
│   ├── format.ts                          # dates, money, location line
│   ├── csv.ts
│   ├── search.ts                          # global search target + list params
│   └── pr/{schema.ts,permissions.ts,timeline.ts,routing-slip.ts,files.ts}
├── supabase/
│   ├── config.toml
│   ├── seed.sql                           # LOCAL ONLY: pgTAP helpers + demo users
│   ├── migrations/20261009000100_core_tables.sql … 20261009001200_storage.sql
│   └── tests/*.test.sql                   # pgTAP
├── e2e/{global-setup.ts,helpers.ts,main-flow.spec.ts,return-and-override.spec.ts,auth.spec.ts,slip.spec.ts}
├── vitest.config.ts  playwright.config.ts  .env.example  README.md
```

Each pure function in `lib/` has a sibling `*.test.ts`.

---

### Task 1: Scaffold the Next.js app and tooling

**Files:**
- Create: the project skeleton via `create-next-app`, `vitest.config.ts`, `.env.example`, `lib/smoke.test.ts` (deleted at end of task)
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces:
  - pnpm scripts `dev`, `build`, `lint`, `test`, `test:db`, `db:reset`, `db:types`, `e2e`.
  - The `@/` path alias resolving to the repo root.

- [ ] **Step 1: Generate the app in place** (the repo currently holds only `docs/`)

```bash
cd /Users/berltreasurecampomanes/Documents/GithubBuilds/pr-tracker
pnpm dlx create-next-app@16 . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --yes
```

Expected: `app/`, `package.json` and `next.config.ts` are created, and `docs/` is untouched. If the CLI refuses because the folder is not empty, run it in a temp dir and move the files in (`rsync -a tmp/ ./ --exclude .git`).

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
pnpm add @supabase/supabase-js@^2 @supabase/ssr@^0.12 zod@^4 react-hook-form @hookform/resolvers@^5 @tanstack/react-table@^8 qrcode @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities server-only
pnpm add -D vitest@^4 vite-tsconfig-paths @types/qrcode @playwright/test
```

`@tanstack/react-table` is pinned to v8 on purpose. v9 changed the API that the shadcn data-table pattern relies on.

- [ ] **Step 3: Initialise shadcn/ui** (choose **Radix** primitives and the **Neutral** base colour if prompted)

```bash
pnpm dlx shadcn@latest init --yes
pnpm dlx shadcn@latest add button input textarea label select dialog dropdown-menu popover tabs badge card table separator skeleton tooltip sidebar sonner checkbox scroll-area sheet avatar
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Add scripts to `package.json`** (merge into the existing `"scripts"`)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "test:db": "supabase test db",
    "db:reset": "supabase db reset",
    "db:types": "supabase gen types typescript --local --schema pr_tracker > lib/supabase/database.types.ts",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 6: Write `.env.example`, and copy it to `.env.local`**

```bash
# Local values come from `supabase status` (API URL and anon/publishable key)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Local / E2E only. NEVER set in Vercel production.
NEXT_PUBLIC_ENABLE_DEV_LOGIN=true
```

Make sure `.gitignore` contains `.env*.local`, `/test-results`, `/playwright-report`.

- [ ] **Step 7: Write a smoke test, and run it to prove Vitest works**

`lib/smoke.test.ts`:
```ts
import { expect, test } from "vitest";
test("vitest runs", () => expect(1 + 1).toBe(2));
```

Run: `pnpm test`
Expected: 1 passed. Then delete `lib/smoke.test.ts`.

- [ ] **Step 8: Verify the build and commit**

Run: `pnpm build`
Expected: build succeeds.

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with shadcn, vitest, supabase deps"
```

---

### Task 2: Local Supabase, core tables, pgTAP test helpers

**Files:**
- Create:
  - `supabase/config.toml` (via `supabase init`, then edited)
  - `supabase/migrations/20261009000100_core_tables.sql`
  - `supabase/seed.sql`
  - `supabase/tests/01_core_tables.test.sql`

**Interfaces:**
- Produces:
  - Schema `pr_tracker`.
  - Enums `user_role`, `movement_state`, `event_type`.
  - Tables `offices`, `profiles`, `app_settings`, `default_route_steps`, `office_statuses`, `routing_slip_counters`.
  - Trigger fn `pr_tracker.touch_updated_at()`.
- Produces (local only, seed.sql), the test helpers:
  - `tests.create_auth_user(p_email text, p_provider text default 'google') returns uuid`
  - `tests.make_user(p_email text, p_office_code text, p_role pr_tracker.user_role default 'staff', p_active boolean default true) returns uuid` (returns the profile id)
  - `tests.authenticate_as(p_email text) returns void`
  - `tests.clear_authentication() returns void`
  - `tests.sample_header() returns jsonb`
  - `tests.sample_items() returns jsonb`

- [ ] **Step 1: Init Supabase and expose the schema**

```bash
supabase init
```

Edit `supabase/config.toml`:

```toml
[api]
schemas = ["public", "graphql_public", "pr_tracker"]
extra_search_path = ["public", "extensions"]

[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]

[auth.email]
enable_signup = true
enable_confirmations = false
```

Start the stack: `supabase start`. Expected: it prints the API URL and anon key. Copy both into `.env.local`.

- [ ] **Step 2: Write the failing pgTAP test** `supabase/tests/01_core_tables.test.sql`

```sql
begin;
select plan(10);

select has_schema('pr_tracker');
select has_table('pr_tracker', 'offices', 'offices table exists');
select has_table('pr_tracker', 'profiles', 'profiles table exists');
select has_table('pr_tracker', 'app_settings', 'app_settings table exists');
select has_table('pr_tracker', 'default_route_steps', 'default_route_steps table exists');
select has_table('pr_tracker', 'office_statuses', 'office_statuses table exists');
select has_table('pr_tracker', 'routing_slip_counters', 'routing_slip_counters table exists');

select throws_ok(
  $$insert into pr_tracker.profiles (email, full_name, role) values ('nooffice@x.test', 'No Office', 'staff')$$,
  '23514', null, 'staff profile requires an office'
);

select throws_ok(
  $$insert into pr_tracker.profiles (email, full_name, role) values ('UPPER@x.test', 'Upper', 'admin')$$,
  '23514', null, 'emails must be stored lower-case'
);

select throws_ok(
  $$insert into pr_tracker.profiles (email, full_name, role) values ('second-super@x.test', 'Dup', 'super_admin'),
                                                               ('third-super@x.test', 'Dup2', 'super_admin')$$,
  '23505', null, 'only one super_admin allowed'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Write `supabase/seed.sql`** (local only; never applied to production). It holds the pgTAP helpers. Task 5 appends demo data to it.

```sql
-- LOCAL ONLY. Applied by `supabase db reset`; never pushed to the shared project.
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.create_auth_user(p_email text, p_provider text default 'google')
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          jsonb_build_object('provider', p_provider, 'providers', jsonb_build_array(p_provider)),
          '{}'::jsonb, now(), now(), '', '', '', '');
  return v_id;
end $$;

create or replace function tests.make_user(
  p_email text, p_office_code text,
  p_role pr_tracker.user_role default 'staff', p_active boolean default true)
returns uuid language plpgsql as $$
declare v_auth uuid := tests.create_auth_user(p_email); v_profile uuid;
begin
  insert into pr_tracker.profiles (auth_user_id, email, full_name, designation, office_id, role, active)
  values (v_auth, lower(p_email), 'Test ' || split_part(p_email, '@', 1), 'Tester',
          (select id from pr_tracker.offices where code = p_office_code), p_role, p_active)
  returning id into v_profile;
  return v_profile;
end $$;

create or replace function tests.authenticate_as(p_email text)
returns void language plpgsql as $$
declare v_uid uuid; v_provider text;
begin
  select id, coalesce(raw_app_meta_data ->> 'provider', 'google') into v_uid, v_provider
    from auth.users where email = p_email;
  if v_uid is null then raise exception 'test user % not found', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_uid, 'email', p_email, 'role', 'authenticated',
    'app_metadata', json_build_object('provider', v_provider))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.clear_authentication()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function tests.sample_header()
returns jsonb language sql as $$
  select jsonb_build_object(
    'pr_date', '2026-10-09', 'purpose', 'Office supplies for Q4',
    'responsibility_center_code', '1011', 'fund_cluster', '01',
    'requested_by_name', 'Maria Santos', 'requested_by_designation', 'Social Welfare Officer',
    'approved_by_name', 'Hon. Juan Cruz', 'approved_by_designation', 'City Mayor');
$$;

create or replace function tests.sample_items()
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('stock_no', 'SP-001', 'unit', 'ream', 'description', 'Bond paper A4', 'quantity', 10, 'unit_cost', 245.50),
    jsonb_build_object('stock_no', '', 'unit', 'box', 'description', 'Ballpen black', 'quantity', 2, 'unit_cost', 120));
$$;

grant execute on all functions in schema tests to authenticated, anon;
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `supabase db reset && supabase test db`
Expected: FAIL. `tests.make_user` creation errors (type `pr_tracker.user_role` does not exist) and `has_schema` fails. This proves the test is wired.

- [ ] **Step 5: Write the migration** `supabase/migrations/20261009000100_core_tables.sql`

```sql
create schema if not exists pr_tracker;
grant usage on schema pr_tracker to authenticated, service_role;

-- Functions are NOT executable by PUBLIC unless explicitly granted.
alter default privileges in schema pr_tracker revoke execute on functions from public;

create type pr_tracker.user_role as enum ('super_admin', 'admin', 'staff');
create type pr_tracker.movement_state as enum ('draft', 'in_transit', 'received', 'returned', 'completed', 'cancelled');
create type pr_tracker.event_type as enum (
  'created', 'edited', 'forwarded', 'recalled', 'received', 'returned', 'status_changed',
  'remark_added', 'private_note_added', 'attachment_added', 'attachment_superseded',
  'pr_no_assigned', 'mode_set', 'completed', 'cancelled', 'followed', 'unfollowed');

create or replace function pr_tracker.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table pr_tracker.offices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  name text not null check (length(trim(name)) > 0),
  is_processing_office boolean not null default false,
  can_assign_pr_no boolean not null default false,
  can_set_mode_of_procurement boolean not null default false,
  can_complete boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table pr_tracker.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique check (email = lower(email) and email like '%@%'),
  full_name text not null check (length(trim(full_name)) > 0),
  designation text,
  office_id uuid references pr_tracker.offices(id),
  role pr_tracker.user_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_needs_office check (role <> 'staff' or office_id is not null)
);
create unique index profiles_single_super_admin on pr_tracker.profiles ((true)) where role = 'super_admin';
create index profiles_office_idx on pr_tracker.profiles (office_id);
create trigger profiles_touch before update on pr_tracker.profiles
  for each row execute function pr_tracker.touch_updated_at();

create table pr_tracker.app_settings (
  key text primary key,
  value jsonb not null
);

create table pr_tracker.default_route_steps (
  id uuid primary key default gen_random_uuid(),
  step_order int not null unique check (step_order >= 1),
  office_id uuid not null references pr_tracker.offices(id),
  purpose text not null check (length(trim(purpose)) > 0)
);

create table pr_tracker.office_statuses (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references pr_tracker.offices(id),
  label text not null check (length(trim(label)) > 0),
  sort_order int not null default 0,
  active boolean not null default true,
  unique (office_id, label)
);

create table pr_tracker.routing_slip_counters (
  year int primary key,
  last_value int not null default 0
);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `supabase db reset && supabase test db`
Expected: `01_core_tables.test.sql .. ok`, all 10 tests pass.

- [ ] **Step 7: Commit**

```bash
git add supabase
git commit -m "feat(db): pr_tracker schema, core tables, pgTAP helpers"
```

---

### Task 3: PR tables and an append-only audit log

**Files:**
- Create: `supabase/migrations/20261009000200_pr_tables.sql`, `supabase/tests/02_pr_tables.test.sql`

**Interfaces:**
- Consumes: the Task 2 tables and enums.
- Produces tables:
  - `purchase_requests` (incl. `sent_by_office_id`, `prev_route_step`, `current_purpose`)
  - `pr_line_items` (generated `total_cost`)
  - `pr_involved_offices`
  - `pr_events` (bigint identity id)
  - `pr_remarks` (`office_id` nullable, for admins without an office)
  - `pr_private_notes`
  - `pr_attachments`
  - `pr_followers`
  - `notifications` (bigint id)
  - `notification_reads`
- Produces the trigger fn `pr_tracker.prevent_event_mutation()`.

- [ ] **Step 1: Write the failing test** `supabase/tests/02_pr_tables.test.sql`

```sql
begin;
select plan(9);

select has_table('pr_tracker', 'purchase_requests', 'purchase_requests exists');
select has_table('pr_tracker', 'pr_line_items', 'pr_line_items exists');
select has_table('pr_tracker', 'pr_events', 'pr_events exists');
select has_table('pr_tracker', 'notifications', 'notifications exists');
select has_column('pr_tracker', 'purchase_requests', 'route_step', 'route_step column');

-- Fixture rows inserted directly as postgres (owner) to exercise constraints/triggers.
insert into pr_tracker.offices (id, code, name) values ('00000000-0000-0000-0000-0000000000a1', 'TST', 'Test Office');
insert into pr_tracker.profiles (id, email, full_name, office_id)
  values ('00000000-0000-0000-0000-0000000000b1', 'fixture@x.test', 'Fixture', '00000000-0000-0000-0000-0000000000a1');
insert into pr_tracker.purchase_requests (id, routing_slip_no, origin_office_id, purpose, requested_by_name, current_office_id, created_by)
  values ('00000000-0000-0000-0000-0000000000c1', 'RS-TEST', '00000000-0000-0000-0000-0000000000a1', 'Fixture', 'Someone',
          '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');
insert into pr_tracker.pr_line_items (pr_id, line_no, unit, description, quantity, unit_cost)
  values ('00000000-0000-0000-0000-0000000000c1', 1, 'pc', 'Thing', 1.5, 10.25);

select is((select total_cost from pr_tracker.pr_line_items where pr_id = '00000000-0000-0000-0000-0000000000c1'),
          15.38::numeric, 'total_cost = round(qty*cost, 2), half away from zero');

insert into pr_tracker.pr_events (pr_id, event_type, actor_id)
  values ('00000000-0000-0000-0000-0000000000c1', 'created', '00000000-0000-0000-0000-0000000000b1');

select throws_like($$update pr_tracker.pr_events set remark = 'x'$$, '%append-only%', 'events cannot be updated');
select throws_like($$delete from pr_tracker.pr_events$$, '%append-only%', 'events cannot be deleted');
select throws_ok(
  $$insert into pr_tracker.pr_line_items (pr_id, line_no, unit, description, quantity, unit_cost)
    values ('00000000-0000-0000-0000-0000000000c1', 2, 'pc', 'Bad', 0, 1)$$,
  '23514', null, 'quantity must be > 0');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `relation "pr_tracker.purchase_requests" does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009000200_pr_tables.sql`

```sql
create table pr_tracker.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  routing_slip_no text not null unique,
  pr_no text unique,
  origin_office_id uuid not null references pr_tracker.offices(id),
  responsibility_center_code text,
  fund_cluster text,
  pr_date date not null default ((now() at time zone 'Asia/Manila')::date),
  purpose text not null check (length(trim(purpose)) > 0),
  requested_by_name text not null check (length(trim(requested_by_name)) > 0),
  requested_by_designation text,
  approved_by_name text,
  approved_by_designation text,
  mode_of_procurement text,
  grand_total numeric(16,2) not null default 0,
  movement_state pr_tracker.movement_state not null default 'draft',
  current_office_id uuid not null references pr_tracker.offices(id),
  current_status_id uuid references pr_tracker.office_statuses(id),
  current_since timestamptz not null default now(),
  current_purpose text,
  route_step int not null default 0 check (route_step >= 0),
  sent_by_office_id uuid references pr_tracker.offices(id),
  prev_route_step int,
  first_forwarded_at timestamptz,
  created_by uuid not null references pr_tracker.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_requests_current_idx on pr_tracker.purchase_requests (current_office_id, movement_state);
create index purchase_requests_origin_idx on pr_tracker.purchase_requests (origin_office_id);
create index purchase_requests_sent_by_idx on pr_tracker.purchase_requests (sent_by_office_id);
create trigger purchase_requests_touch before update on pr_tracker.purchase_requests
  for each row execute function pr_tracker.touch_updated_at();

create table pr_tracker.pr_line_items (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid not null references pr_tracker.purchase_requests(id) on delete cascade,
  line_no int not null check (line_no >= 1),
  stock_no text,
  unit text not null check (length(trim(unit)) > 0),
  description text not null check (length(trim(description)) > 0),
  quantity numeric(14,2) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  total_cost numeric(16,2) generated always as (round(quantity * unit_cost, 2)) stored,
  unique (pr_id, line_no)
);

create table pr_tracker.pr_involved_offices (
  pr_id uuid not null references pr_tracker.purchase_requests(id) on delete cascade,
  office_id uuid not null references pr_tracker.offices(id),
  primary key (pr_id, office_id)
);
create index pr_involved_offices_office_idx on pr_tracker.pr_involved_offices (office_id);

create table pr_tracker.pr_events (
  id bigint generated always as identity primary key,
  pr_id uuid not null references pr_tracker.purchase_requests(id),
  event_type pr_tracker.event_type not null,
  actor_id uuid not null references pr_tracker.profiles(id),
  actor_office_id uuid references pr_tracker.offices(id),
  from_office_id uuid references pr_tracker.offices(id),
  to_office_id uuid references pr_tracker.offices(id),
  status_id uuid references pr_tracker.office_statuses(id),
  override_reason text,
  remark text,
  from_route_step int,
  to_route_step int,
  route_purpose text,
  is_private boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index pr_events_pr_idx on pr_tracker.pr_events (pr_id, id);
create index pr_events_type_idx on pr_tracker.pr_events (event_type, created_at);

create or replace function pr_tracker.prevent_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'pr_events is append-only';
end $$;
create trigger pr_events_no_update before update or delete on pr_tracker.pr_events
  for each row execute function pr_tracker.prevent_event_mutation();
create trigger pr_events_no_truncate before truncate on pr_tracker.pr_events
  for each statement execute function pr_tracker.prevent_event_mutation();

create table pr_tracker.pr_remarks (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid not null references pr_tracker.purchase_requests(id),
  office_id uuid references pr_tracker.offices(id),
  author_id uuid not null references pr_tracker.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index pr_remarks_pr_idx on pr_tracker.pr_remarks (pr_id, created_at);

create table pr_tracker.pr_private_notes (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid not null references pr_tracker.purchase_requests(id),
  office_id uuid not null references pr_tracker.offices(id),
  author_id uuid not null references pr_tracker.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index pr_private_notes_idx on pr_tracker.pr_private_notes (pr_id, office_id);

create table pr_tracker.pr_attachments (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid not null references pr_tracker.purchase_requests(id),
  office_id uuid not null references pr_tracker.offices(id),
  uploaded_by uuid not null references pr_tracker.profiles(id),
  storage_path text not null unique,
  filename text not null,
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text not null,
  superseded_at timestamptz,
  superseded_reason text,
  created_at timestamptz not null default now()
);
create index pr_attachments_pr_idx on pr_tracker.pr_attachments (pr_id);

create table pr_tracker.pr_followers (
  pr_id uuid not null references pr_tracker.purchase_requests(id) on delete cascade,
  office_id uuid not null references pr_tracker.offices(id),
  created_at timestamptz not null default now(),
  primary key (pr_id, office_id)
);
create index pr_followers_office_idx on pr_tracker.pr_followers (office_id);

create table pr_tracker.notifications (
  id bigint generated always as identity primary key,
  recipient_office_id uuid not null references pr_tracker.offices(id),
  pr_id uuid not null references pr_tracker.purchase_requests(id),
  event_id bigint not null references pr_tracker.pr_events(id),
  type pr_tracker.event_type not null,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on pr_tracker.notifications (recipient_office_id, id desc);

create table pr_tracker.notification_reads (
  notification_id bigint not null references pr_tracker.notifications(id) on delete cascade,
  profile_id uuid not null references pr_tracker.profiles(id),
  read_at timestamptz not null default now(),
  primary key (notification_id, profile_id)
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `01` and `02` both ok.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): purchase request, audit event, attachment and notification tables"
```

---

### Task 4: Security helpers, internal workflow helpers, grants and RLS

**Files:**
- Create: `supabase/migrations/20261009000300_security.sql`, `supabase/tests/03_security.test.sql`

**Interfaces:**
- Consumes: the Task 2–3 tables.
- Produces public helpers (granted to `authenticated`):
  - `current_profile_id() → uuid`
  - `current_office_id() → uuid`
  - `is_active_user() → boolean`
  - `is_admin() → boolean`
  - `is_super_admin() → boolean`
  - `is_involved(p_pr_id uuid) → boolean`
  - `can_view_pr(p_pr_id uuid) → boolean`
- Produces internal helpers (**not** granted):
  - `_clean(text) → text` (trimmed text, with empty strings turned into null)
  - `_actor() → profiles` (raises "Your account is not authorized")
  - `_actor_with_office() → profiles` (raises "Your account is not assigned to an office")
  - `_lock_pr(uuid) → purchase_requests` (`FOR UPDATE`; raises "Purchase request not found")
  - `_is_holder(purchase_requests, uuid) → boolean` (draft at origin, or received at that office)
  - `_require_holder(purchase_requests, profiles)` (raises "This PR is not at your office")
  - `_require_received_holder(purchase_requests, profiles)` (same message; requires state `received`)
  - `_log_event(uuid, event_type, profiles, jsonb) → bigint` (jsonb keys: `from_office_id`, `to_office_id`, `status_id`, `override_reason`, `remark`, `from_route_step`, `to_route_step`, `route_purpose`, `is_private`, `payload`)
  - `_notify(bigint, uuid, event_type, uuid[], uuid)` (args: event id, pr id, type, recipients, excluded office)
  - `_followers(uuid) → uuid[]`
  - `_add_remark(uuid, profiles, text)` (no-op when the text is blank)

- [ ] **Step 1: Write the failing test** `supabase/tests/03_security.test.sql`

```sql
begin;
select plan(10);

insert into pr_tracker.offices (code, name) values ('TSA', 'Test A');
select tests.make_user('active@x.test', 'TSA');
select tests.make_user('inactive@x.test', 'TSA', 'staff', false);
select tests.make_user('adm@x.test', 'TSA', 'admin');

select tests.authenticate_as('active@x.test');
select ok(pr_tracker.is_active_user(), 'active staff is active');
select is(pr_tracker.current_office_id(), (select id from pr_tracker.offices where code = 'TSA'), 'office resolved');
select ok(not pr_tracker.is_admin(), 'staff is not admin');
select throws_ok($$insert into pr_tracker.offices (code, name) values ('HACK', 'Hack')$$,
                 '42501', null, 'authenticated cannot insert offices directly');
select throws_ok($$select pr_tracker._actor()$$, '42501', null, 'internal helpers are not executable');
select is((select count(*)::int from pr_tracker.offices where code = 'TSA'), 1, 'active user reads offices');

select tests.clear_authentication();
select tests.authenticate_as('inactive@x.test');
select ok(not pr_tracker.is_active_user(), 'inactive user is not active');
select is((select count(*)::int from pr_tracker.offices), 0, 'inactive user reads nothing');

select tests.clear_authentication();
select tests.authenticate_as('adm@x.test');
select ok(pr_tracker.is_admin(), 'admin is admin');
select ok(not pr_tracker.is_super_admin(), 'admin is not super admin');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `function pr_tracker.is_active_user() does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009000300_security.sql`

```sql
-- ---------- public helpers (used by RLS and UI) ----------
create or replace function pr_tracker.current_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from pr_tracker.profiles p where p.auth_user_id = auth.uid() and p.active
$$;

create or replace function pr_tracker.current_office_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.office_id from pr_tracker.profiles p where p.auth_user_id = auth.uid() and p.active
$$;

create or replace function pr_tracker.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pr_tracker.profiles p where p.auth_user_id = auth.uid() and p.active)
$$;

create or replace function pr_tracker.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pr_tracker.profiles p
                  where p.auth_user_id = auth.uid() and p.active and p.role in ('admin', 'super_admin'))
$$;

create or replace function pr_tracker.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pr_tracker.profiles p
                  where p.auth_user_id = auth.uid() and p.active and p.role = 'super_admin')
$$;

-- Involved = office created/received it, OR it is currently addressed to/held by my office.
create or replace function pr_tracker.is_involved(p_pr_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pr_tracker.pr_involved_offices i
                  where i.pr_id = p_pr_id and i.office_id = pr_tracker.current_office_id())
      or exists (select 1 from pr_tracker.purchase_requests p
                  where p.id = p_pr_id and p.current_office_id = pr_tracker.current_office_id())
$$;

create or replace function pr_tracker.can_view_pr(p_pr_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select pr_tracker.is_admin() or pr_tracker.is_involved(p_pr_id)
$$;

grant execute on function pr_tracker.current_profile_id(), pr_tracker.current_office_id(),
  pr_tracker.is_active_user(), pr_tracker.is_admin(), pr_tracker.is_super_admin(),
  pr_tracker.is_involved(uuid), pr_tracker.can_view_pr(uuid) to authenticated;

-- ---------- internal helpers (NOT granted) ----------
create or replace function pr_tracker._clean(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(trim(p), '')
$$;

create or replace function pr_tracker._actor()
returns pr_tracker.profiles language plpgsql stable security definer set search_path = '' as $$
declare v pr_tracker.profiles;
begin
  select * into v from pr_tracker.profiles where auth_user_id = auth.uid() and active;
  if not found then raise exception 'Your account is not authorized'; end if;
  return v;
end $$;

create or replace function pr_tracker._actor_with_office()
returns pr_tracker.profiles language plpgsql stable security definer set search_path = '' as $$
declare v pr_tracker.profiles := pr_tracker._actor();
begin
  if v.office_id is null then raise exception 'Your account is not assigned to an office'; end if;
  return v;
end $$;

create or replace function pr_tracker._lock_pr(p_pr_id uuid)
returns pr_tracker.purchase_requests language plpgsql security definer set search_path = '' as $$
declare v pr_tracker.purchase_requests;
begin
  select * into v from pr_tracker.purchase_requests where id = p_pr_id for update;
  if not found then raise exception 'Purchase request not found'; end if;
  return v;
end $$;

create or replace function pr_tracker._is_holder(p_pr pr_tracker.purchase_requests, p_office_id uuid)
returns boolean language sql immutable set search_path = '' as $$
  select (p_pr.movement_state = 'received' and p_pr.current_office_id = p_office_id)
      or (p_pr.movement_state = 'draft' and p_pr.origin_office_id = p_office_id)
$$;

create or replace function pr_tracker._require_holder(p_pr pr_tracker.purchase_requests, p_actor pr_tracker.profiles)
returns void language plpgsql set search_path = '' as $$
begin
  if not pr_tracker._is_holder(p_pr, p_actor.office_id) then
    raise exception 'This PR is not at your office';
  end if;
end $$;

create or replace function pr_tracker._require_received_holder(p_pr pr_tracker.purchase_requests, p_actor pr_tracker.profiles)
returns void language plpgsql set search_path = '' as $$
begin
  if p_pr.movement_state <> 'received' or p_pr.current_office_id is distinct from p_actor.office_id then
    raise exception 'This PR is not at your office';
  end if;
end $$;

create or replace function pr_tracker._log_event(
  p_pr_id uuid, p_type pr_tracker.event_type, p_actor pr_tracker.profiles, p_fields jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into pr_tracker.pr_events (
    pr_id, event_type, actor_id, actor_office_id, from_office_id, to_office_id, status_id,
    override_reason, remark, from_route_step, to_route_step, route_purpose, is_private, payload)
  values (
    p_pr_id, p_type, p_actor.id, p_actor.office_id,
    (p_fields ->> 'from_office_id')::uuid, (p_fields ->> 'to_office_id')::uuid, (p_fields ->> 'status_id')::uuid,
    p_fields ->> 'override_reason', p_fields ->> 'remark',
    (p_fields ->> 'from_route_step')::int, (p_fields ->> 'to_route_step')::int, p_fields ->> 'route_purpose',
    coalesce((p_fields ->> 'is_private')::boolean, false),
    coalesce(p_fields -> 'payload', '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create or replace function pr_tracker._notify(
  p_event_id bigint, p_pr_id uuid, p_type pr_tracker.event_type, p_offices uuid[], p_exclude uuid)
returns void language sql security definer set search_path = '' as $$
  insert into pr_tracker.notifications (recipient_office_id, pr_id, event_id, type)
  select distinct o, p_pr_id, p_event_id, p_type
    from unnest(p_offices) as o
   where o is not null and o is distinct from p_exclude;
$$;

create or replace function pr_tracker._followers(p_pr_id uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(f.office_id), '{}'::uuid[]) from pr_tracker.pr_followers f where f.pr_id = p_pr_id
$$;

create or replace function pr_tracker._add_remark(p_pr_id uuid, p_actor pr_tracker.profiles, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pr_tracker._clean(p_body) is not null then
    insert into pr_tracker.pr_remarks (pr_id, office_id, author_id, body)
    values (p_pr_id, p_actor.office_id, p_actor.id, trim(p_body));
  end if;
end $$;

-- ---------- grants: read-only through RLS ----------
grant select on all tables in schema pr_tracker to authenticated;
revoke select on pr_tracker.routing_slip_counters from authenticated;

alter table pr_tracker.offices enable row level security;
alter table pr_tracker.profiles enable row level security;
alter table pr_tracker.app_settings enable row level security;
alter table pr_tracker.default_route_steps enable row level security;
alter table pr_tracker.office_statuses enable row level security;
alter table pr_tracker.routing_slip_counters enable row level security;
alter table pr_tracker.purchase_requests enable row level security;
alter table pr_tracker.pr_line_items enable row level security;
alter table pr_tracker.pr_involved_offices enable row level security;
alter table pr_tracker.pr_events enable row level security;
alter table pr_tracker.pr_remarks enable row level security;
alter table pr_tracker.pr_private_notes enable row level security;
alter table pr_tracker.pr_attachments enable row level security;
alter table pr_tracker.pr_followers enable row level security;
alter table pr_tracker.notifications enable row level security;
alter table pr_tracker.notification_reads enable row level security;

create policy offices_read on pr_tracker.offices for select to authenticated
  using ((select pr_tracker.is_active_user()));
create policy profiles_read on pr_tracker.profiles for select to authenticated
  using ((select pr_tracker.is_active_user()));
create policy app_settings_read on pr_tracker.app_settings for select to authenticated
  using ((select pr_tracker.is_active_user()));
create policy route_read on pr_tracker.default_route_steps for select to authenticated
  using ((select pr_tracker.is_active_user()));
create policy statuses_read on pr_tracker.office_statuses for select to authenticated
  using ((select pr_tracker.is_active_user()));

create policy prs_read on pr_tracker.purchase_requests for select to authenticated
  using (pr_tracker.can_view_pr(id));
create policy items_read on pr_tracker.pr_line_items for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy involved_read on pr_tracker.pr_involved_offices for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy remarks_read on pr_tracker.pr_remarks for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy attachments_read on pr_tracker.pr_attachments for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy followers_read on pr_tracker.pr_followers for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy events_read on pr_tracker.pr_events for select to authenticated
  using (pr_tracker.can_view_pr(pr_id)
         and (not is_private or actor_office_id = (select pr_tracker.current_office_id())));
create policy notes_read on pr_tracker.pr_private_notes for select to authenticated
  using (office_id = (select pr_tracker.current_office_id()));
create policy notifications_read on pr_tracker.notifications for select to authenticated
  using (recipient_office_id = (select pr_tracker.current_office_id()));
create policy notification_reads_read on pr_tracker.notification_reads for select to authenticated
  using (profile_id = (select pr_tracker.current_profile_id()));
-- routing_slip_counters: no policy, no grant.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `01`–`03` ok.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): RLS, security helpers and internal workflow helpers"
```

---

### Task 5: Seed reference data (migration) and local demo data (seed.sql)

**Files:**
- Create: `supabase/migrations/20261009000400_seed_reference_data.sql`, `supabase/tests/04_seed.test.sql`
- Modify: `supabase/seed.sql` (append demo data)

**Interfaces:**
- Produces:
  - The 6 processing offices with the permission flags from the spec.
  - The 10-step default route.
  - Starter office statuses.
  - `app_settings` keys `lgu_name`, `stuck_threshold_days` (5), `max_upload_mb` (20), `allowed_auth_providers` (`["google"]`).
  - The super-admin profile `berlcamp@gmail.com`.
- Produces (local only):
  - Office `CSWD`.
  - Password users `cswd@test.local`, `gso@test.local`, `mayor@test.local`, `budget@test.local`, `bac@test.local`, `acctg@test.local`, `treas@test.local`, `admin@test.local` (role admin, office null), all with password `password123`.
  - `allowed_auth_providers` = `["google","email"]`.

- [ ] **Step 1: Write the failing test** `supabase/tests/04_seed.test.sql`

```sql
begin;
select plan(7);

select is((select count(*)::int from pr_tracker.default_route_steps), 10, 'route has 10 steps');
select results_eq(
  $$select o.code from pr_tracker.default_route_steps s join pr_tracker.offices o on o.id = s.office_id order by s.step_order$$,
  $$values ('GSO'),('MAYOR'),('BUDGET'),('MAYOR'),('BAC'),('MAYOR'),('BAC'),('GSO'),('ACCTG'),('TREAS')$$,
  'route order matches spec');
select ok((select can_assign_pr_no from pr_tracker.offices where code = 'BUDGET'), 'Budget assigns PR No.');
select ok((select can_set_mode_of_procurement from pr_tracker.offices where code = 'BAC'), 'BAC sets mode');
select ok((select can_complete from pr_tracker.offices where code = 'TREAS'), 'Treasurer completes');
select is((select role::text from pr_tracker.profiles where email = 'berlcamp@gmail.com'), 'super_admin', 'super admin seeded');
select ok((select count(*) from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id where o.code = 'MAYOR') >= 5,
          'Mayor statuses seeded');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL in `04_seed`, `route has 10 steps` got 0.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009000400_seed_reference_data.sql`

```sql
insert into pr_tracker.offices (code, name, is_processing_office, can_assign_pr_no, can_set_mode_of_procurement, can_complete) values
  ('GSO',    'General Services Office',   true, false, false, false),
  ('MAYOR',  'Mayor''s Office',           true, false, false, false),
  ('BUDGET', 'City Budget Office',        true, true,  false, false),
  ('BAC',    'Bids and Awards Committee', true, false, true,  false),
  ('ACCTG',  'City Accounting Office',    true, false, false, false),
  ('TREAS',  'City Treasurer''s Office',  true, false, false, true)
on conflict (code) do nothing;

insert into pr_tracker.default_route_steps (step_order, office_id, purpose)
select v.step, o.id, v.purpose
from (values
  (1,  'GSO',    'For review'),
  (2,  'MAYOR',  'For approval'),
  (3,  'BUDGET', 'For certification of funds'),
  (4,  'MAYOR',  'For approval'),
  (5,  'BAC',    'For procurement'),
  (6,  'MAYOR',  'For signing of NOA / NTP'),
  (7,  'BAC',    'For processing'),
  (8,  'GSO',    'For processing'),
  (9,  'ACCTG',  'For processing'),
  (10, 'TREAS',  'For payment processing')
) as v(step, code, purpose)
join pr_tracker.offices o on o.code = v.code
on conflict (step_order) do nothing;

insert into pr_tracker.office_statuses (office_id, label, sort_order)
select o.id, v.label, v.ord
from (values
  ('BUDGET', 'For certification of funds', 1), ('BUDGET', 'Funds certified / earmarked', 2), ('BUDGET', 'Insufficient funds', 3),
  ('BAC', 'For mode determination', 1), ('BAC', 'For posting (PhilGEPS)', 2), ('BAC', 'For canvass', 3), ('BAC', 'Awarded', 4),
  ('GSO', 'For review', 1), ('GSO', 'For canvass', 2), ('GSO', 'For purchase', 3),
  ('MAYOR', 'For Mayor''s approval', 1), ('MAYOR', 'Approved', 2), ('MAYOR', 'Disapproved', 3),
  ('MAYOR', 'For signing of NOA/NTP', 4), ('MAYOR', 'NOA/NTP signed', 5),
  ('ACCTG', 'For obligation', 1), ('ACCTG', 'Obligated', 2),
  ('TREAS', 'For payment processing', 1), ('TREAS', 'Paid', 2)
) as v(code, label, ord)
join pr_tracker.offices o on o.code = v.code
on conflict (office_id, label) do nothing;

insert into pr_tracker.app_settings (key, value) values
  ('lgu_name', '"City Government"'::jsonb),
  ('stuck_threshold_days', '5'::jsonb),
  ('max_upload_mb', '20'::jsonb),
  ('allowed_auth_providers', '["google"]'::jsonb)
on conflict (key) do nothing;

insert into pr_tracker.profiles (email, full_name, designation, office_id, role)
values ('berlcamp@gmail.com', 'Super Administrator', 'System Administrator', null, 'super_admin')
on conflict (email) do nothing;
```

- [ ] **Step 4: Append local demo data to `supabase/seed.sql`**

```sql
-- ---------- local demo data (E2E + manual testing) ----------
update pr_tracker.app_settings set value = '["google","email"]'::jsonb where key = 'allowed_auth_providers';

insert into pr_tracker.offices (code, name) values ('CSWD', 'City Social Welfare and Development Office')
on conflict (code) do nothing;

create or replace function tests.create_password_user(p_email text, p_password text)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), now(), now(), now());
  return v_id;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('cswd@test.local',   'CSWD',   'staff', 'Carla Cswd'),
    ('gso@test.local',    'GSO',    'staff', 'Gabriel Gso'),
    ('mayor@test.local',  'MAYOR',  'staff', 'Marites Mayor'),
    ('budget@test.local', 'BUDGET', 'staff', 'Benjie Budget'),
    ('bac@test.local',    'BAC',    'staff', 'Bea Bac'),
    ('acctg@test.local',  'ACCTG',  'staff', 'Andres Acctg'),
    ('treas@test.local',  'TREAS',  'staff', 'Tess Treas'),
    ('admin@test.local',  null,     'admin', 'Ada Admin')
  ) as t(email, code, role, name)
  loop
    insert into pr_tracker.profiles (auth_user_id, email, full_name, designation, office_id, role)
    values (tests.create_password_user(r.email, 'password123'), r.email, r.name, 'Staff',
            (select id from pr_tracker.offices where code = r.code), r.role::pr_tracker.user_role);
  end loop;
end $$;
```

The seeded users are **already linked** (`auth_user_id` is set), so local sign-in works through `link_my_profile`. The tests' `tests.make_user` uses `@x.test` emails, so they don't collide.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `01`–`04` ok.

- [ ] **Step 6: Commit**

```bash
git add supabase
git commit -m "feat(db): seed offices, default route, statuses, settings, super admin; local demo users"
```

---

### Task 6: Allowlisted sign-in RPCs

**Files:**
- Create: `supabase/migrations/20261009000500_auth_rpc.sql`, `supabase/tests/05_auth.test.sql`

**Interfaces:**
- Produces:
  - `pr_tracker.get_my_profile() → jsonb | null`. Shape: `{id, email, full_name, designation, role, office: {id, code, name, can_assign_pr_no, can_set_mode_of_procurement, can_complete} | null}`.
  - `pr_tracker.link_my_profile() → jsonb | null`. Returns the same shape on success, or null when the user isn't authorized.

- [ ] **Step 1: Write the failing test** (Review Focus #1) `supabase/tests/05_auth.test.sql`

```sql
begin;
select plan(7);

update pr_tracker.app_settings set value = '["google"]'::jsonb where key = 'allowed_auth_providers';

insert into pr_tracker.profiles (email, full_name, office_id)
  values ('newbie@x.test', 'Newbie', (select id from pr_tracker.offices where code = 'GSO'));
select tests.create_auth_user('newbie@x.test', 'google');

select tests.authenticate_as('newbie@x.test');
select is(pr_tracker.link_my_profile() ->> 'email', 'newbie@x.test', 'first Google sign-in links the profile');
select is(pr_tracker.get_my_profile() -> 'office' ->> 'code', 'GSO', 'profile includes office');
select tests.clear_authentication();
select isnt((select auth_user_id from pr_tracker.profiles where email = 'newbie@x.test'), null, 'auth_user_id stored');

-- unknown email
select tests.create_auth_user('stranger@x.test', 'google');
select tests.authenticate_as('stranger@x.test');
select is(pr_tracker.link_my_profile(), null, 'unknown email is declined');
select tests.clear_authentication();

-- allowlisted email but email/password provider (shared project attack)
insert into pr_tracker.profiles (email, full_name, office_id)
  values ('victim@x.test', 'Victim', (select id from pr_tracker.offices where code = 'GSO'));
select tests.create_auth_user('victim@x.test', 'email');
select tests.authenticate_as('victim@x.test');
select is(pr_tracker.link_my_profile(), null, 'non-allowed provider is declined');
select tests.clear_authentication();
select is((select auth_user_id from pr_tracker.profiles where email = 'victim@x.test'), null, 'profile stays unlinked');

-- profile already bound to a different auth user
insert into pr_tracker.profiles (email, full_name, office_id, auth_user_id)
  values ('bound@x.test', 'Bound', (select id from pr_tracker.offices where code = 'GSO'),
          tests.create_auth_user('someone-else@x.test'));
select tests.create_auth_user('bound@x.test', 'google');
select tests.authenticate_as('bound@x.test');
select is(pr_tracker.link_my_profile(), null, 'profile bound to another auth user is not re-bound');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `function pr_tracker.link_my_profile() does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009000500_auth_rpc.sql`

```sql
create or replace function pr_tracker.get_my_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'full_name', p.full_name, 'designation', p.designation, 'role', p.role,
    'office', case when o.id is null then null else jsonb_build_object(
      'id', o.id, 'code', o.code, 'name', o.name,
      'can_assign_pr_no', o.can_assign_pr_no,
      'can_set_mode_of_procurement', o.can_set_mode_of_procurement,
      'can_complete', o.can_complete) end)
  from pr_tracker.profiles p
  left join pr_tracker.offices o on o.id = p.office_id
  where p.auth_user_id = auth.uid() and p.active
$$;

create or replace function pr_tracker.link_my_profile()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_provider text := auth.jwt() -> 'app_metadata' ->> 'provider';
  v_allowed jsonb;
  v_profile pr_tracker.profiles;
begin
  if v_uid is null or v_email is null then return null; end if;

  select value into v_allowed from pr_tracker.app_settings where key = 'allowed_auth_providers';
  if v_provider is null or not (coalesce(v_allowed, '["google"]'::jsonb) ? v_provider) then
    return null;
  end if;

  select * into v_profile from pr_tracker.profiles where email = v_email for update;
  if not found or not v_profile.active then return null; end if;

  if v_profile.auth_user_id is null then
    update pr_tracker.profiles set auth_user_id = v_uid where id = v_profile.id;
  elsif v_profile.auth_user_id <> v_uid then
    return null;
  end if;

  return pr_tracker.get_my_profile();
end $$;

grant execute on function pr_tracker.get_my_profile(), pr_tracker.link_my_profile() to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `05_auth` ok, 7/7.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): allowlisted profile linking with provider check"
```

---

### Task 7: Create and edit PRs, with routing slip numbering

**Files:**
- Create: `supabase/migrations/20261009000600_pr_create_edit.sql`, `supabase/tests/06_create_edit.test.sql`

**Interfaces:**
- Consumes: the Task 4 internal helpers.
- Produces:
  - `pr_tracker.create_pr(p_header jsonb, p_items jsonb) → uuid`
  - `pr_tracker.update_pr_content(p_pr_id uuid, p_header jsonb, p_items jsonb) → void`
- Header JSON keys:
  - `pr_date` (`YYYY-MM-DD`, optional, defaults to today in Manila)
  - `purpose` (required)
  - `responsibility_center_code`
  - `fund_cluster`
  - `requested_by_name` (required)
  - `requested_by_designation`
  - `approved_by_name`
  - `approved_by_designation`
- Item JSON keys: `stock_no`, `unit`, `description`, `quantity`, `unit_cost`.
- Internal helpers: `_next_routing_slip_no()`, `_validate_header(jsonb)`, `_replace_line_items(uuid, jsonb)`, `_pr_snapshot(uuid) → jsonb` (`{header:{…, grand_total}, items:[…]}`).

- [ ] **Step 1: Write the failing test** (Review Focus #5) `supabase/tests/06_create_edit.test.sql`

```sql
begin;
select plan(13);

select tests.make_user('c1@x.test', 'CSWD');
select tests.make_user('g1@x.test', 'GSO');

select tests.authenticate_as('c1@x.test');
select set_config('tests.pr1', pr_tracker.create_pr(tests.sample_header(), tests.sample_items())::text, true);
select set_config('tests.pr2', pr_tracker.create_pr(tests.sample_header(), tests.sample_items())::text, true);

select matches((select routing_slip_no from pr_tracker.purchase_requests where id = current_setting('tests.pr1')::uuid),
               '^RS-\d{4}-\d{2}-\d{5}$', 'routing slip format');
select is(
  (select right(b.routing_slip_no, 5)::int - right(a.routing_slip_no, 5)::int
     from pr_tracker.purchase_requests a, pr_tracker.purchase_requests b
    where a.id = current_setting('tests.pr1')::uuid and b.id = current_setting('tests.pr2')::uuid),
  1, 'sequence increments by one');
select is((select grand_total from pr_tracker.purchase_requests where id = current_setting('tests.pr1')::uuid),
          2695.00::numeric, 'grand total = 10*245.50 + 2*120');
select is((select movement_state::text from pr_tracker.purchase_requests where id = current_setting('tests.pr1')::uuid),
          'draft', 'new PR is draft');
select is((select count(*)::int from pr_tracker.pr_followers where pr_id = current_setting('tests.pr1')::uuid), 1,
          'origin auto-follows');
select is((select event_type::text from pr_tracker.pr_events where pr_id = current_setting('tests.pr1')::uuid), 'created',
          'created event logged');

select throws_like($$select pr_tracker.create_pr(tests.sample_header(), '[]'::jsonb)$$,
                   '%at least one line item%', 'empty items rejected');
select throws_like($$select pr_tracker.create_pr(tests.sample_header(),
                     '[{"unit":"pc","description":"x","quantity":0,"unit_cost":1}]'::jsonb)$$,
                   'Line 1: quantity must be greater than zero', 'zero quantity rejected with line number');
select throws_like($$select pr_tracker.create_pr(tests.sample_header(),
                     '[{"unit":"pc","description":"x","quantity":1,"unit_cost":1},{"unit":"pc","description":"y","quantity":1,"unit_cost":-5}]'::jsonb)$$,
                   'Line 2: unit cost cannot be negative', 'negative cost rejected');
select throws_like($$select pr_tracker.create_pr(tests.sample_header() - 'purpose', tests.sample_items())$$,
                   'Purpose is required', 'purpose required');

-- edit while draft: allowed, no snapshot
select lives_ok(format($$select pr_tracker.update_pr_content(%L, tests.sample_header() || '{"purpose":"Changed"}', tests.sample_items())$$,
                       current_setting('tests.pr1')), 'origin edits draft');

-- other office cannot edit
select tests.clear_authentication();
select tests.authenticate_as('g1@x.test');
select throws_like(format($$select pr_tracker.update_pr_content(%L, tests.sample_header(), tests.sample_items())$$,
                          current_setting('tests.pr1')),
                   'Only the originating office can edit this PR', 'non-origin cannot edit');

-- locked once forwarded (forward_pr is defined in Task 8; simulate lock directly as owner)
select tests.clear_authentication();
update pr_tracker.purchase_requests set movement_state = 'in_transit', first_forwarded_at = now()
 where id = current_setting('tests.pr1')::uuid;
select tests.authenticate_as('c1@x.test');
select throws_like(format($$select pr_tracker.update_pr_content(%L, tests.sample_header(), tests.sample_items())$$,
                          current_setting('tests.pr1')),
                   'This PR is locked%', 'locked after forwarding');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `function pr_tracker.create_pr(jsonb, jsonb) does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009000600_pr_create_edit.sql`

```sql
create or replace function pr_tracker._next_routing_slip_no()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Manila';
  v_seq int;
begin
  insert into pr_tracker.routing_slip_counters as c (year, last_value)
  values (extract(year from v_now)::int, 1)
  on conflict (year) do update set last_value = c.last_value + 1
  returning c.last_value into v_seq;
  return 'RS-' || to_char(v_now, 'YYYY-MM') || '-' || lpad(v_seq::text, 5, '0');
end $$;

create or replace function pr_tracker._validate_header(p_header jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if pr_tracker._clean(p_header ->> 'purpose') is null then raise exception 'Purpose is required'; end if;
  if pr_tracker._clean(p_header ->> 'requested_by_name') is null then raise exception 'Requested by is required'; end if;
end $$;

create or replace function pr_tracker._replace_line_items(p_pr_id uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bad record;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase request needs at least one line item';
  end if;

  for v_bad in
    select t.ord, t.item from jsonb_array_elements(p_items) with ordinality as t(item, ord) order by t.ord
  loop
    if pr_tracker._clean(v_bad.item ->> 'unit') is null then
      raise exception 'Line %: unit is required', v_bad.ord; end if;
    if pr_tracker._clean(v_bad.item ->> 'description') is null then
      raise exception 'Line %: description is required', v_bad.ord; end if;
    if coalesce((v_bad.item ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'Line %: quantity must be greater than zero', v_bad.ord; end if;
    if (v_bad.item ->> 'unit_cost') is null or (v_bad.item ->> 'unit_cost')::numeric < 0 then
      raise exception 'Line %: unit cost cannot be negative', v_bad.ord; end if;
  end loop;

  delete from pr_tracker.pr_line_items where pr_id = p_pr_id;
  insert into pr_tracker.pr_line_items (pr_id, line_no, stock_no, unit, description, quantity, unit_cost)
  select p_pr_id, t.ord, pr_tracker._clean(t.item ->> 'stock_no'), trim(t.item ->> 'unit'),
         trim(t.item ->> 'description'), (t.item ->> 'quantity')::numeric, (t.item ->> 'unit_cost')::numeric
    from jsonb_array_elements(p_items) with ordinality as t(item, ord);

  update pr_tracker.purchase_requests
     set grand_total = (select coalesce(sum(i.total_cost), 0) from pr_tracker.pr_line_items i where i.pr_id = p_pr_id)
   where id = p_pr_id;
end $$;

create or replace function pr_tracker._pr_snapshot(p_pr_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'header', jsonb_build_object(
      'pr_date', p.pr_date, 'purpose', p.purpose,
      'responsibility_center_code', p.responsibility_center_code, 'fund_cluster', p.fund_cluster,
      'requested_by_name', p.requested_by_name, 'requested_by_designation', p.requested_by_designation,
      'approved_by_name', p.approved_by_name, 'approved_by_designation', p.approved_by_designation,
      'grand_total', p.grand_total),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'line_no', i.line_no, 'stock_no', i.stock_no, 'unit', i.unit, 'description', i.description,
               'quantity', i.quantity, 'unit_cost', i.unit_cost, 'total_cost', i.total_cost) order by i.line_no)
        from pr_tracker.pr_line_items i where i.pr_id = p.id), '[]'::jsonb))
  from pr_tracker.purchase_requests p where p.id = p_pr_id
$$;

create or replace function pr_tracker.create_pr(p_header jsonb, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_id uuid;
begin
  perform pr_tracker._validate_header(p_header);

  insert into pr_tracker.purchase_requests (
    routing_slip_no, origin_office_id, responsibility_center_code, fund_cluster, pr_date, purpose,
    requested_by_name, requested_by_designation, approved_by_name, approved_by_designation,
    current_office_id, created_by)
  values (
    pr_tracker._next_routing_slip_no(), v_actor.office_id,
    pr_tracker._clean(p_header ->> 'responsibility_center_code'), pr_tracker._clean(p_header ->> 'fund_cluster'),
    coalesce((p_header ->> 'pr_date')::date, (now() at time zone 'Asia/Manila')::date),
    trim(p_header ->> 'purpose'),
    trim(p_header ->> 'requested_by_name'), pr_tracker._clean(p_header ->> 'requested_by_designation'),
    pr_tracker._clean(p_header ->> 'approved_by_name'), pr_tracker._clean(p_header ->> 'approved_by_designation'),
    v_actor.office_id, v_actor.id)
  returning id into v_id;

  perform pr_tracker._replace_line_items(v_id, p_items);
  insert into pr_tracker.pr_involved_offices (pr_id, office_id) values (v_id, v_actor.office_id);
  insert into pr_tracker.pr_followers (pr_id, office_id) values (v_id, v_actor.office_id);
  perform pr_tracker._log_event(v_id, 'created', v_actor,
    jsonb_build_object('to_office_id', v_actor.office_id, 'to_route_step', 0));
  return v_id;
end $$;

create or replace function pr_tracker.update_pr_content(p_pr_id uuid, p_header jsonb, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_before jsonb;
begin
  if v_actor.office_id <> v_pr.origin_office_id then
    raise exception 'Only the originating office can edit this PR';
  end if;
  if not (v_pr.movement_state = 'draft'
          or (v_pr.movement_state = 'received' and v_pr.current_office_id = v_pr.origin_office_id)) then
    raise exception 'This PR is locked. It can only be edited while in Draft or after it is returned to your office';
  end if;
  perform pr_tracker._validate_header(p_header);

  if v_pr.first_forwarded_at is not null then
    v_before := pr_tracker._pr_snapshot(p_pr_id);
  end if;

  update pr_tracker.purchase_requests set
    responsibility_center_code = pr_tracker._clean(p_header ->> 'responsibility_center_code'),
    fund_cluster = pr_tracker._clean(p_header ->> 'fund_cluster'),
    pr_date = coalesce((p_header ->> 'pr_date')::date, pr_date),
    purpose = trim(p_header ->> 'purpose'),
    requested_by_name = trim(p_header ->> 'requested_by_name'),
    requested_by_designation = pr_tracker._clean(p_header ->> 'requested_by_designation'),
    approved_by_name = pr_tracker._clean(p_header ->> 'approved_by_name'),
    approved_by_designation = pr_tracker._clean(p_header ->> 'approved_by_designation')
  where id = p_pr_id;

  perform pr_tracker._replace_line_items(p_pr_id, p_items);

  perform pr_tracker._log_event(p_pr_id, 'edited', v_actor,
    case when v_before is null then '{}'::jsonb
         else jsonb_build_object('payload', jsonb_build_object('before', v_before, 'after', pr_tracker._pr_snapshot(p_pr_id)))
    end);
end $$;

grant execute on function pr_tracker.create_pr(jsonb, jsonb), pr_tracker.update_pr_content(uuid, jsonb, jsonb) to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `06_create_edit` ok, 13/13.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): create/edit PR with line-item validation and routing slip numbering"
```

---

### Task 8: Movement functions (forward, receive, return, recall) and route position

**Files:**
- Create: `supabase/migrations/20261009000700_pr_movement.sql`, `supabase/tests/07_movement.test.sql`

**Interfaces:**
- Consumes: the Task 4 and Task 7 functions.
- Produces:
  - `pr_tracker.suggest_next_step(p_pr_id uuid) → jsonb`. Shape: `{route_step, total_steps, next: {step_order, office_id, office_name, purpose} | null}`.
  - `pr_tracker.forward_pr(p_pr_id uuid, p_to_office_id uuid, p_override_reason text default null, p_remark text default null) → void`
  - `pr_tracker.receive_pr(p_pr_id uuid) → void`
  - `pr_tracker.return_pr(p_pr_id uuid, p_to_office_id uuid, p_reason text) → void`
  - `pr_tracker.recall_pr(p_pr_id uuid, p_reason text default null) → void`
- Internal: `_next_route_step(p_route_step int, p_holder_office uuid) → default_route_steps`. It returns the first step after `p_route_step` whose office differs from the holder, or null.

- [ ] **Step 1: Write the failing test** (Review Focus #2, #3) `supabase/tests/07_movement.test.sql`

```sql
begin;
select plan(22);

select tests.make_user('mc@x.test', 'CSWD');
select tests.make_user('mg@x.test', 'GSO');
select tests.make_user('mg2@x.test', 'GSO');
select tests.make_user('mm@x.test', 'MAYOR');
select tests.make_user('mb@x.test', 'BUDGET');
select tests.make_user('mbac@x.test', 'BAC');

create temp table ids as
select (select id from pr_tracker.offices where code = 'GSO') gso,
       (select id from pr_tracker.offices where code = 'MAYOR') mayor,
       (select id from pr_tracker.offices where code = 'BUDGET') budget,
       (select id from pr_tracker.offices where code = 'BAC') bac,
       (select id from pr_tracker.offices where code = 'CSWD') cswd;
grant select on ids to authenticated;

select tests.authenticate_as('mc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header(), tests.sample_items())::text, true);

select is(pr_tracker.suggest_next_step(current_setting('tests.pr')::uuid) -> 'next' ->> 'office_name',
          'General Services Office', 'draft suggests step 1 GSO');
select throws_like(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select mayor from ids)),
                   'A reason is required when forwarding outside the default route', 'skipping ahead needs reason');
select lives_ok(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select gso from ids)),
                'forward to suggested GSO');
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 1, 'route_step 1');
select is((select current_purpose from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid),
          'For review', 'purpose carried');

-- GSO receives; second receive (double click / colleague) fails descriptively
select tests.clear_authentication();
select tests.authenticate_as('mg@x.test');
select lives_ok(format('select pr_tracker.receive_pr(%L)', current_setting('tests.pr')), 'GSO receives');
select tests.clear_authentication();
select tests.authenticate_as('mg2@x.test');
select throws_like(format('select pr_tracker.receive_pr(%L)', current_setting('tests.pr')),
                   'Already received by Test mg (GSO) at %', 'second receive fails with who/when');
select is((select count(*)::int from pr_tracker.pr_events
            where pr_id = current_setting('tests.pr')::uuid and event_type = 'received'), 1, 'exactly one received event');

-- GSO -> Mayor (step 2) -> Budget (step 3)
select lives_ok(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select mayor from ids)), 'to Mayor');
select tests.clear_authentication(); select tests.authenticate_as('mm@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select budget from ids));
select tests.clear_authentication(); select tests.authenticate_as('mb@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 3, 'at Budget step 3');

-- From Budget, Mayor is the suggested next stop and lands on step 4 (not 2, not 6)
select is((pr_tracker.suggest_next_step(current_setting('tests.pr')::uuid) -> 'next' ->> 'step_order')::int, 4, 'suggests step 4');
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select mayor from ids));
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 4, 'Mayor at step 4');

-- Recall before Mayor receives: back to Budget, step 3
select lives_ok(format('select pr_tracker.recall_pr(%L, %L)', current_setting('tests.pr'), 'Wrong attachment'), 'Budget recalls');
select is((select movement_state::text || ':' || route_step from pr_tracker.purchase_requests
            where id = current_setting('tests.pr')::uuid), 'received:3', 'recall restores holder + step');

-- Off-route forward (Budget -> BAC is step 5, i.e. skip ahead) requires reason and jumps to step 5
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select bac from ids), 'Mayor on leave, BAC pre-check');
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 5, 'skip-ahead jumps to step 5');
select is((select override_reason from pr_tracker.pr_events where pr_id = current_setting('tests.pr')::uuid
            order by id desc limit 1), 'Mayor on leave, BAC pre-check', 'override reason logged');

-- BAC receives, returns to GSO: route_step restored to GSO's last held step (1)
select tests.clear_authentication(); select tests.authenticate_as('mbac@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select throws_like(format('select pr_tracker.return_pr(%L, %L, %L)', current_setting('tests.pr'), (select gso from ids), ''),
                   'A reason is required to return a PR', 'return needs reason');
select pr_tracker.return_pr(current_setting('tests.pr')::uuid, (select gso from ids), 'Specs incomplete');
select is((select movement_state::text || ':' || route_step from pr_tracker.purchase_requests
            where id = current_setting('tests.pr')::uuid), 'returned:1', 'returned to GSO at step 1');

-- Off-route forward to an earlier office keeps the step
select tests.clear_authentication(); select tests.authenticate_as('mg@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select cswd from ids), 'Clarify specs with end-user');
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 1, 'off-route keeps step');

-- Return to an office that never held it is rejected
select tests.clear_authentication(); select tests.authenticate_as('mc@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select throws_like(format('select pr_tracker.return_pr(%L, %L, %L)', current_setting('tests.pr'),
                          (select id from pr_tracker.offices where code = 'TREAS'), 'x'),
                   'You can only return a PR to its origin or an office that previously held it', 'return target validated');

-- Notifications: GSO got one for the return addressed to it
select tests.clear_authentication();
select ok(exists (select 1 from pr_tracker.notifications n where n.recipient_office_id = (select gso from ids)
                   and n.type = 'returned' and n.pr_id = current_setting('tests.pr')::uuid), 'destination notified on return');

-- Non-holder cannot forward
select tests.authenticate_as('mm@x.test');
select throws_like(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select gso from ids)),
                   'This PR is not at your office', 'non-holder cannot forward');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `function pr_tracker.suggest_next_step(uuid) does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009000700_pr_movement.sql`

```sql
create or replace function pr_tracker._next_route_step(p_route_step int, p_holder_office uuid)
returns pr_tracker.default_route_steps language sql stable security definer set search_path = '' as $$
  select s.* from pr_tracker.default_route_steps s
   where s.step_order > p_route_step and s.office_id is distinct from p_holder_office
   order by s.step_order limit 1
$$;

create or replace function pr_tracker.suggest_next_step(p_pr_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_pr pr_tracker.purchase_requests;
  v_next pr_tracker.default_route_steps;
  v_name text;
begin
  if not pr_tracker.can_view_pr(p_pr_id) then raise exception 'Purchase request not found'; end if;
  select * into v_pr from pr_tracker.purchase_requests where id = p_pr_id;
  v_next := pr_tracker._next_route_step(v_pr.route_step, v_pr.current_office_id);
  select name into v_name from pr_tracker.offices where id = v_next.office_id;
  return jsonb_build_object(
    'route_step', v_pr.route_step,
    'total_steps', (select count(*) from pr_tracker.default_route_steps),
    'next', case when v_next.id is null then null else jsonb_build_object(
      'step_order', v_next.step_order, 'office_id', v_next.office_id,
      'office_name', v_name, 'purpose', v_next.purpose) end);
end $$;

create or replace function pr_tracker.forward_pr(
  p_pr_id uuid, p_to_office_id uuid, p_override_reason text default null, p_remark text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_next pr_tracker.default_route_steps;
  v_later pr_tracker.default_route_steps;
  v_new_step int;
  v_purpose text;
  v_override boolean := false;
  v_event bigint;
begin
  perform pr_tracker._require_holder(v_pr, v_actor);
  if p_to_office_id = v_actor.office_id then
    raise exception 'You cannot forward a PR to your own office';
  end if;
  if not exists (select 1 from pr_tracker.offices where id = p_to_office_id and active) then
    raise exception 'Destination office not found or inactive';
  end if;

  v_next := pr_tracker._next_route_step(v_pr.route_step, v_actor.office_id);
  if v_next.id is not null and v_next.office_id = p_to_office_id then
    v_new_step := v_next.step_order;
    v_purpose := v_next.purpose;
  else
    v_override := true;
    select * into v_later from pr_tracker.default_route_steps
     where step_order > v_pr.route_step and office_id = p_to_office_id
     order by step_order limit 1;
    if found then
      v_new_step := v_later.step_order;
      v_purpose := v_later.purpose;
    else
      v_new_step := v_pr.route_step;
      v_purpose := null;
    end if;
    if pr_tracker._clean(p_override_reason) is null then
      raise exception 'A reason is required when forwarding outside the default route';
    end if;
  end if;

  update pr_tracker.purchase_requests set
    movement_state = 'in_transit', current_office_id = p_to_office_id, current_status_id = null,
    current_since = now(), current_purpose = v_purpose, sent_by_office_id = v_actor.office_id,
    prev_route_step = v_pr.route_step, route_step = v_new_step,
    first_forwarded_at = coalesce(first_forwarded_at, now())
  where id = p_pr_id;

  v_event := pr_tracker._log_event(p_pr_id, 'forwarded', v_actor, jsonb_build_object(
    'from_office_id', v_actor.office_id, 'to_office_id', p_to_office_id,
    'from_route_step', v_pr.route_step, 'to_route_step', v_new_step, 'route_purpose', v_purpose,
    'override_reason', case when v_override then trim(p_override_reason) end,
    'remark', pr_tracker._clean(p_remark)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_remark);
  perform pr_tracker._notify(v_event, p_pr_id, 'forwarded', array[p_to_office_id], v_actor.office_id);
end $$;

create or replace function pr_tracker.receive_pr(p_pr_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_last record;
  v_event bigint;
begin
  if v_pr.movement_state = 'received' and v_pr.current_office_id = v_actor.office_id then
    select p.full_name, o.code, e.created_at into v_last
      from pr_tracker.pr_events e
      join pr_tracker.profiles p on p.id = e.actor_id
      join pr_tracker.offices o on o.id = e.actor_office_id
     where e.pr_id = p_pr_id and e.event_type = 'received' and e.actor_office_id = v_actor.office_id
     order by e.id desc limit 1;
    if found then
      raise exception 'Already received by % (%) at %', v_last.full_name, v_last.code,
        to_char(v_last.created_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM');
    end if;
    raise exception 'This PR is already at your office';
  end if;
  if v_pr.movement_state not in ('in_transit', 'returned') or v_pr.current_office_id <> v_actor.office_id then
    raise exception 'This PR is not addressed to your office';
  end if;

  update pr_tracker.purchase_requests set
    movement_state = 'received', current_since = now(), current_status_id = null,
    sent_by_office_id = null, prev_route_step = null
  where id = p_pr_id;
  insert into pr_tracker.pr_involved_offices (pr_id, office_id) values (p_pr_id, v_actor.office_id)
  on conflict do nothing;

  v_event := pr_tracker._log_event(p_pr_id, 'received', v_actor, jsonb_build_object(
    'from_office_id', v_pr.sent_by_office_id, 'to_office_id', v_actor.office_id,
    'to_route_step', v_pr.route_step, 'route_purpose', v_pr.current_purpose));
  perform pr_tracker._notify(v_event, p_pr_id, 'received',
    array[v_pr.sent_by_office_id] || pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.return_pr(p_pr_id uuid, p_to_office_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_step int;
  v_event bigint;
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if pr_tracker._clean(p_reason) is null then
    raise exception 'A reason is required to return a PR';
  end if;
  if p_to_office_id = v_actor.office_id
     or not exists (select 1 from pr_tracker.pr_involved_offices where pr_id = p_pr_id and office_id = p_to_office_id) then
    raise exception 'You can only return a PR to its origin or an office that previously held it';
  end if;

  select e.to_route_step into v_step from pr_tracker.pr_events e
   where e.pr_id = p_pr_id and e.event_type = 'received' and e.actor_office_id = p_to_office_id
   order by e.id desc limit 1;
  v_step := coalesce(v_step, 0);

  update pr_tracker.purchase_requests set
    movement_state = 'returned', current_office_id = p_to_office_id, current_status_id = null,
    current_since = now(), current_purpose = null, sent_by_office_id = v_actor.office_id,
    prev_route_step = v_pr.route_step, route_step = v_step
  where id = p_pr_id;

  v_event := pr_tracker._log_event(p_pr_id, 'returned', v_actor, jsonb_build_object(
    'from_office_id', v_actor.office_id, 'to_office_id', p_to_office_id,
    'from_route_step', v_pr.route_step, 'to_route_step', v_step, 'remark', trim(p_reason)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_reason);
  perform pr_tracker._notify(v_event, p_pr_id, 'returned', array[p_to_office_id], v_actor.office_id);
end $$;

create or replace function pr_tracker.recall_pr(p_pr_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_to_draft boolean;
  v_event bigint;
begin
  if v_pr.movement_state not in ('in_transit', 'returned') or v_pr.sent_by_office_id is distinct from v_actor.office_id then
    raise exception 'You can only recall a PR your office sent that has not been received yet';
  end if;
  v_to_draft := v_actor.office_id = v_pr.origin_office_id
    and not exists (select 1 from pr_tracker.pr_events where pr_id = p_pr_id and event_type = 'received');

  update pr_tracker.purchase_requests set
    movement_state = (case when v_to_draft then 'draft' else 'received' end)::pr_tracker.movement_state,
    current_office_id = v_actor.office_id, current_status_id = null, current_since = now(),
    current_purpose = null, route_step = coalesce(v_pr.prev_route_step, v_pr.route_step),
    sent_by_office_id = null, prev_route_step = null,
    first_forwarded_at = case when v_to_draft then null else first_forwarded_at end
  where id = p_pr_id;

  v_event := pr_tracker._log_event(p_pr_id, 'recalled', v_actor, jsonb_build_object(
    'from_office_id', v_pr.current_office_id, 'to_office_id', v_actor.office_id,
    'from_route_step', v_pr.route_step, 'to_route_step', coalesce(v_pr.prev_route_step, v_pr.route_step),
    'remark', pr_tracker._clean(p_reason)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_reason);
  perform pr_tracker._notify(v_event, p_pr_id, 'recalled', array[v_pr.current_office_id], v_actor.office_id);
end $$;

grant execute on function
  pr_tracker.suggest_next_step(uuid),
  pr_tracker.forward_pr(uuid, uuid, text, text),
  pr_tracker.receive_pr(uuid),
  pr_tracker.return_pr(uuid, uuid, text),
  pr_tracker.recall_pr(uuid, text)
to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `07_movement` ok, 22/22. If the `Already received by Test mg (GSO)` assertion fails, check that `tests.make_user` builds `full_name` as `'Test ' || split_part(email,'@',1)`.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): forward/receive/return/recall with route position and notifications"
```

---

### Task 9: Processing functions (status, remarks, notes, attachments, PR No., mode, complete, cancel, follow)

**Files:**
- Create: `supabase/migrations/20261009000800_pr_processing.sql`, `supabase/tests/08_processing.test.sql`

**Interfaces:**
- Produces (all granted to `authenticated`):
  - `set_status(p_pr_id uuid, p_status_id uuid, p_remark text default null) → void`
  - `add_remark(p_pr_id uuid, p_body text) → void`
  - `add_private_note(p_pr_id uuid, p_body text) → void`
  - `register_attachment(p_pr_id uuid, p_storage_path text, p_filename text, p_size_bytes bigint, p_mime_type text) → uuid`
  - `supersede_attachment(p_attachment_id uuid, p_reason text) → void`
  - `assign_pr_no(p_pr_id uuid, p_pr_no text) → void`
  - `set_mode_of_procurement(p_pr_id uuid, p_mode text) → void`
  - `complete_pr(p_pr_id uuid, p_remark text default null) → void`
  - `cancel_pr(p_pr_id uuid, p_reason text) → void`
  - `follow_pr(p_pr_id uuid) → void`
  - `unfollow_pr(p_pr_id uuid) → void`
- Produces the internal `_allowed_mime_types() → text[]`.

- [ ] **Step 1: Write the failing test** `supabase/tests/08_processing.test.sql`

```sql
begin;
select plan(17);

select tests.make_user('pc@x.test', 'CSWD');
select tests.make_user('pg@x.test', 'GSO');
select tests.make_user('pb@x.test', 'BUDGET');
select tests.make_user('pt@x.test', 'TREAS');
select tests.make_user('pa@x.test', 'GSO', 'admin');

select tests.authenticate_as('pc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header(), tests.sample_items())::text, true);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));

select tests.clear_authentication(); select tests.authenticate_as('pg@x.test');
select throws_like(format('select pr_tracker.set_status(%L, %L)', current_setting('tests.pr'),
                          (select s.id from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id
                            where o.code = 'GSO' limit 1)),
                   'This PR is not at your office', 'cannot set status before receiving');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select lives_ok(format('select pr_tracker.set_status(%L, %L, %L)', current_setting('tests.pr'),
                       (select s.id from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id
                         where o.code = 'GSO' and s.label = 'For review'), 'Reviewing specs'),
                'GSO sets own status');
select throws_like(format('select pr_tracker.set_status(%L, %L)', current_setting('tests.pr'),
                          (select s.id from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id
                            where o.code = 'MAYOR' limit 1)),
                   'That status does not belong to your office', 'cannot use another office status');
select lives_ok(format('select pr_tracker.add_private_note(%L, %L)', current_setting('tests.pr'), 'Supplier X is slow'),
                'private note added');
select throws_like(format('select pr_tracker.assign_pr_no(%L, %L)', current_setting('tests.pr'), '2026-10-001'),
                   'Your office is not allowed to assign PR numbers', 'GSO cannot assign PR No.');
select throws_like(format('select pr_tracker.complete_pr(%L)', current_setting('tests.pr')),
                   'Your office is not allowed to complete PRs', 'GSO cannot complete');
select throws_like(format('select pr_tracker.register_attachment(%L, %L, %L, %s, %L)', current_setting('tests.pr'),
                          current_setting('tests.pr') || '/x-file.exe', 'file.exe', 100, 'application/x-msdownload'),
                   'File type not allowed', 'bad mime rejected');

-- origin office adds a remark -> followers (origin) excluded as actor; GSO not a follower yet
select tests.clear_authentication(); select tests.authenticate_as('pc@x.test');
select lives_ok(format('select pr_tracker.add_remark(%L, %L)', current_setting('tests.pr'), 'Please prioritise'),
                'origin can remark while not holding');
select throws_like(format('select pr_tracker.cancel_pr(%L, %L)', current_setting('tests.pr'), 'No longer needed'),
                   'Only the originating office (while it holds the PR) or an administrator can cancel it',
                   'origin cannot cancel while PR is elsewhere');

-- GSO follows, then Budget path for PR No.
select tests.clear_authentication(); select tests.authenticate_as('pg@x.test');
select lives_ok(format('select pr_tracker.follow_pr(%L)', current_setting('tests.pr')), 'GSO follows');
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'BUDGET'), 'Mayor away');
select tests.clear_authentication(); select tests.authenticate_as('pb@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select lives_ok(format('select pr_tracker.assign_pr_no(%L, %L)', current_setting('tests.pr'), '2026-10-001'),
                'Budget assigns PR No.');
select is((select payload ->> 'new' from pr_tracker.pr_events where pr_id = current_setting('tests.pr')::uuid
            and event_type = 'pr_no_assigned'), '2026-10-001', 'PR No. change logged');

-- Treasurer path for completion
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'TREAS'), 'Fast track');
select tests.clear_authentication(); select tests.authenticate_as('pt@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select lives_ok(format('select pr_tracker.complete_pr(%L, %L)', current_setting('tests.pr'), 'Paid'), 'Treasurer completes');
select is((select movement_state::text from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid),
          'completed', 'state completed');
select throws_like(format('select pr_tracker.forward_pr(%L, %L, %L)', current_setting('tests.pr'),
                          (select id from pr_tracker.offices where code = 'GSO'), 'x'),
                   'This PR is not at your office', 'completed PR cannot move');

select tests.clear_authentication();
select ok(exists (select 1 from pr_tracker.notifications n join pr_tracker.offices o on o.id = n.recipient_office_id
                   where o.code = 'GSO' and n.type = 'completed' and n.pr_id = current_setting('tests.pr')::uuid),
          'follower GSO notified on completion');
select is((select count(*)::int from pr_tracker.pr_events where pr_id = current_setting('tests.pr')::uuid
            and event_type = 'private_note_added' and is_private and remark is null), 1,
          'private note event is private and has no body');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `function pr_tracker.set_status(uuid, uuid, unknown) does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009000800_pr_processing.sql`

```sql
create or replace function pr_tracker._allowed_mime_types()
returns text[] language sql immutable set search_path = '' as $$
  select array['application/pdf', 'image/jpeg', 'image/png',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
$$;

create or replace function pr_tracker.set_status(p_pr_id uuid, p_status_id uuid, p_remark text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_event bigint;
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not exists (select 1 from pr_tracker.office_statuses
                  where id = p_status_id and office_id = v_actor.office_id and active) then
    raise exception 'That status does not belong to your office';
  end if;
  update pr_tracker.purchase_requests set current_status_id = p_status_id where id = p_pr_id;
  v_event := pr_tracker._log_event(p_pr_id, 'status_changed', v_actor,
    jsonb_build_object('status_id', p_status_id, 'remark', pr_tracker._clean(p_remark)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_remark);
  perform pr_tracker._notify(v_event, p_pr_id, 'status_changed', pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.add_remark(p_pr_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_event bigint;
begin
  if not (pr_tracker._is_holder(v_pr, v_actor.office_id) or v_pr.origin_office_id = v_actor.office_id) then
    raise exception 'Only the office holding this PR or the originating office can add remarks';
  end if;
  if pr_tracker._clean(p_body) is null then raise exception 'Remark cannot be empty'; end if;
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_body);
  v_event := pr_tracker._log_event(p_pr_id, 'remark_added', v_actor, jsonb_build_object('remark', trim(p_body)));
  perform pr_tracker._notify(v_event, p_pr_id, 'remark_added', pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.add_private_note(p_pr_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
begin
  perform pr_tracker._require_holder(v_pr, v_actor);
  if pr_tracker._clean(p_body) is null then raise exception 'Note cannot be empty'; end if;
  insert into pr_tracker.pr_private_notes (pr_id, office_id, author_id, body)
  values (p_pr_id, v_actor.office_id, v_actor.id, trim(p_body));
  perform pr_tracker._log_event(p_pr_id, 'private_note_added', v_actor, jsonb_build_object('is_private', true));
end $$;

create or replace function pr_tracker.register_attachment(
  p_pr_id uuid, p_storage_path text, p_filename text, p_size_bytes bigint, p_mime_type text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_max_mb numeric;
  v_id uuid;
  v_event bigint;
begin
  if not (pr_tracker._is_holder(v_pr, v_actor.office_id) or v_pr.origin_office_id = v_actor.office_id) then
    raise exception 'Only the office holding this PR or the originating office can add attachments';
  end if;
  if p_mime_type is null or not (p_mime_type = any (pr_tracker._allowed_mime_types())) then
    raise exception 'File type not allowed';
  end if;
  select (value #>> '{}')::numeric into v_max_mb from pr_tracker.app_settings where key = 'max_upload_mb';
  v_max_mb := coalesce(v_max_mb, 20);
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > v_max_mb * 1024 * 1024 then
    raise exception 'File is larger than % MB', v_max_mb;
  end if;
  if p_storage_path is null or p_storage_path not like p_pr_id::text || '/%' then
    raise exception 'Invalid attachment path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'pr-tracker-attachments' and name = p_storage_path) then
    raise exception 'Upload not found. Please upload the file again';
  end if;

  insert into pr_tracker.pr_attachments (pr_id, office_id, uploaded_by, storage_path, filename, size_bytes, mime_type)
  values (p_pr_id, v_actor.office_id, v_actor.id, p_storage_path, trim(p_filename), p_size_bytes, p_mime_type)
  returning id into v_id;
  v_event := pr_tracker._log_event(p_pr_id, 'attachment_added', v_actor,
    jsonb_build_object('payload', jsonb_build_object('attachment_id', v_id, 'filename', trim(p_filename))));
  perform pr_tracker._notify(v_event, p_pr_id, 'attachment_added', pr_tracker._followers(p_pr_id), v_actor.office_id);
  return v_id;
end $$;

create or replace function pr_tracker.supersede_attachment(p_attachment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_att pr_tracker.pr_attachments;
begin
  select * into v_att from pr_tracker.pr_attachments where id = p_attachment_id for update;
  if not found then raise exception 'Attachment not found'; end if;
  perform pr_tracker._lock_pr(v_att.pr_id);
  if v_att.office_id <> v_actor.office_id then
    raise exception 'Only the office that uploaded this file can mark it superseded';
  end if;
  if v_att.superseded_at is not null then raise exception 'This attachment is already superseded'; end if;
  if pr_tracker._clean(p_reason) is null then raise exception 'A reason is required'; end if;
  update pr_tracker.pr_attachments set superseded_at = now(), superseded_reason = trim(p_reason) where id = p_attachment_id;
  perform pr_tracker._log_event(v_att.pr_id, 'attachment_superseded', v_actor, jsonb_build_object(
    'remark', trim(p_reason), 'payload', jsonb_build_object('attachment_id', v_att.id, 'filename', v_att.filename)));
end $$;

create or replace function pr_tracker.assign_pr_no(p_pr_id uuid, p_pr_no text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_new text := pr_tracker._clean(p_pr_no);
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not (select can_assign_pr_no from pr_tracker.offices where id = v_actor.office_id) then
    raise exception 'Your office is not allowed to assign PR numbers';
  end if;
  if v_new is null then raise exception 'PR No. is required'; end if;
  if exists (select 1 from pr_tracker.purchase_requests where pr_no = v_new and id <> p_pr_id) then
    raise exception 'PR No. % is already used by another PR', v_new;
  end if;
  update pr_tracker.purchase_requests set pr_no = v_new where id = p_pr_id;
  perform pr_tracker._log_event(p_pr_id, 'pr_no_assigned', v_actor,
    jsonb_build_object('payload', jsonb_build_object('old', v_pr.pr_no, 'new', v_new)));
end $$;

create or replace function pr_tracker.set_mode_of_procurement(p_pr_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_new text := pr_tracker._clean(p_mode);
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not (select can_set_mode_of_procurement from pr_tracker.offices where id = v_actor.office_id) then
    raise exception 'Your office is not allowed to set the mode of procurement';
  end if;
  if v_new is null then raise exception 'Mode of procurement is required'; end if;
  update pr_tracker.purchase_requests set mode_of_procurement = v_new where id = p_pr_id;
  perform pr_tracker._log_event(p_pr_id, 'mode_set', v_actor,
    jsonb_build_object('payload', jsonb_build_object('old', v_pr.mode_of_procurement, 'new', v_new)));
end $$;

create or replace function pr_tracker.complete_pr(p_pr_id uuid, p_remark text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_event bigint;
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not (select can_complete from pr_tracker.offices where id = v_actor.office_id) then
    raise exception 'Your office is not allowed to complete PRs';
  end if;
  update pr_tracker.purchase_requests set movement_state = 'completed', current_since = now() where id = p_pr_id;
  v_event := pr_tracker._log_event(p_pr_id, 'completed', v_actor, jsonb_build_object('remark', pr_tracker._clean(p_remark)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_remark);
  perform pr_tracker._notify(v_event, p_pr_id, 'completed', pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.cancel_pr(p_pr_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_event bigint;
begin
  if v_pr.movement_state in ('completed', 'cancelled') then
    raise exception 'This PR is already %', v_pr.movement_state;
  end if;
  if not (pr_tracker.is_admin()
          or (v_actor.office_id = v_pr.origin_office_id
              and (v_pr.movement_state = 'draft'
                   or (v_pr.movement_state = 'received' and v_pr.current_office_id = v_pr.origin_office_id)))) then
    raise exception 'Only the originating office (while it holds the PR) or an administrator can cancel it';
  end if;
  if pr_tracker._clean(p_reason) is null then raise exception 'A reason is required to cancel a PR'; end if;
  update pr_tracker.purchase_requests set movement_state = 'cancelled', current_since = now() where id = p_pr_id;
  v_event := pr_tracker._log_event(p_pr_id, 'cancelled', v_actor, jsonb_build_object('remark', trim(p_reason)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_reason);
  perform pr_tracker._notify(v_event, p_pr_id, 'cancelled',
    array[v_pr.current_office_id] || pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.follow_pr(p_pr_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
begin
  if not pr_tracker.is_involved(p_pr_id) then
    raise exception 'Only offices involved in this PR can follow it';
  end if;
  insert into pr_tracker.pr_followers (pr_id, office_id) values (p_pr_id, v_actor.office_id) on conflict do nothing;
  if found then perform pr_tracker._log_event(p_pr_id, 'followed', v_actor, '{}'::jsonb); end if;
end $$;

create or replace function pr_tracker.unfollow_pr(p_pr_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
begin
  delete from pr_tracker.pr_followers where pr_id = p_pr_id and office_id = v_actor.office_id;
  if found then perform pr_tracker._log_event(p_pr_id, 'unfollowed', v_actor, '{}'::jsonb); end if;
end $$;

grant execute on function
  pr_tracker.set_status(uuid, uuid, text),
  pr_tracker.add_remark(uuid, text),
  pr_tracker.add_private_note(uuid, text),
  pr_tracker.register_attachment(uuid, text, text, bigint, text),
  pr_tracker.supersede_attachment(uuid, text),
  pr_tracker.assign_pr_no(uuid, text),
  pr_tracker.set_mode_of_procurement(uuid, text),
  pr_tracker.complete_pr(uuid, text),
  pr_tracker.cancel_pr(uuid, text),
  pr_tracker.follow_pr(uuid),
  pr_tracker.unfollow_pr(uuid)
to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `08_processing` ok, 17/17.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): status, remarks, private notes, attachments, PR No., mode, complete, cancel, follow"
```

---

### Task 10: Read views, tracking lookup, notification RPCs, reports, and RLS visibility tests

**Files:**
- Create: `supabase/migrations/20261009000900_views_reports.sql`, `supabase/tests/09_visibility_reports.test.sql`

**Interfaces:**
- Produces views (all `security_invoker`, granted select to `authenticated`):
  - `pr_overview`: `purchase_requests.*` plus `origin_office_code`, `origin_office_name`, `current_office_code`, `current_office_name`, `current_status_label`, `sent_by_office_name`, `total_steps`, `days_here`.
  - `pr_timeline`: `id`, `pr_id`, `event_type`, `created_at`, `actor_name`, `actor_office_name`, `from_office_name`, `to_office_name`, `status_label`, `override_reason`, `remark`, `from_route_step`, `to_route_step`, `route_purpose`, `is_private`, `payload`.
  - `followed_activity`: `id`, `pr_id`, `routing_slip_no`, `purpose`, `event_type`, `created_at`, `actor_name`, `actor_office_name`.
  - `my_notifications`: `id`, `pr_id`, `routing_slip_no`, `purpose`, `type`, `created_at`, `actor_name`, `actor_office_name`, `to_office_name`, `is_read`.
- Produces RPCs:
  - `tracking_lookup(p_routing_slip_no text) → jsonb | null`. Keys: `pr_id` (null unless the caller can view), `can_view`, `routing_slip_no`, `pr_no`, `origin_office_name`, `current_office_name`, `movement_state`, `current_status_label`, `current_purpose`, `current_since`, `route_step`, `total_steps`, `timeline: [{event_type, from_office_name, to_office_name, created_at}]`.
  - `unread_notification_count() → int`
  - `mark_notifications_read(p_ids bigint[]) → void`
  - `mark_all_notifications_read() → void`
  - `report_office_days(p_from date, p_to date) → table(office_id uuid, office_code text, office_name text, prs_handled bigint, avg_days numeric, median_days numeric, max_days numeric, avg_transit_days numeric)`
  - `report_stuck_prs() → table(pr_id uuid, routing_slip_no text, origin_office_name text, current_office_name text, movement_state text, days numeric, can_view boolean)`

- [ ] **Step 1: Write the failing test** (Review Focus #4) `supabase/tests/09_visibility_reports.test.sql`

```sql
begin;
select plan(14);

select tests.make_user('vc@x.test', 'CSWD');
select tests.make_user('vg@x.test', 'GSO');
select tests.make_user('vt@x.test', 'TREAS');
select tests.make_user('va@x.test', 'ACCTG', 'admin');

select tests.authenticate_as('vc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header(), tests.sample_items())::text, true);
select pr_tracker.add_private_note(current_setting('tests.pr')::uuid, 'CSWD-only note');
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));

-- destination can see before receiving
select tests.clear_authentication(); select tests.authenticate_as('vg@x.test');
select is((select count(*)::int from pr_tracker.pr_overview where id = current_setting('tests.pr')::uuid), 1,
          'in-transit destination sees PR');
select is((select count(*)::int from pr_tracker.pr_private_notes where pr_id = current_setting('tests.pr')::uuid), 0,
          'GSO cannot read CSWD private note');
select is((select count(*)::int from pr_tracker.pr_timeline where pr_id = current_setting('tests.pr')::uuid and is_private), 0,
          'GSO cannot see CSWD private-note event');
select is(pr_tracker.unread_notification_count(), 1, 'GSO has one unread notification');
select pr_tracker.mark_all_notifications_read();
select is(pr_tracker.unread_notification_count(), 0, 'mark all read');

-- uninvolved office sees nothing via REST tables, but tracking lookup works without pr_id
select tests.clear_authentication(); select tests.authenticate_as('vt@x.test');
select is((select count(*)::int from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 0, 'TREAS cannot read PR');
select is((select count(*)::int from pr_tracker.pr_line_items where pr_id = current_setting('tests.pr')::uuid), 0, 'TREAS cannot read items');
select is((select count(*)::int from pr_tracker.pr_events where pr_id = current_setting('tests.pr')::uuid), 0, 'TREAS cannot read events');
select is(pr_tracker.tracking_lookup('RS-1999-01-00000'), null, 'unknown RS returns null');
select tests.clear_authentication();
select set_config('tests.rs', (select routing_slip_no from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), true);
select tests.authenticate_as('vt@x.test');
select is(pr_tracker.tracking_lookup(lower(current_setting('tests.rs'))) ->> 'current_office_name', 'General Services Office',
          'tracking lookup works for uninvolved, case-insensitive');
select is(pr_tracker.tracking_lookup(current_setting('tests.rs')) ->> 'pr_id', null, 'tracking hides pr_id from uninvolved');

-- admin sees PR but not private notes
select tests.clear_authentication(); select tests.authenticate_as('va@x.test');
select is((select count(*)::int from pr_tracker.pr_overview where id = current_setting('tests.pr')::uuid), 1, 'admin sees PR');
select is((select count(*)::int from pr_tracker.pr_private_notes where pr_id = current_setting('tests.pr')::uuid), 0,
          'admin cannot read private notes');

-- report: synthetic hold of exactly 2 days at GSO
select tests.clear_authentication();
insert into pr_tracker.pr_events (pr_id, event_type, actor_id, actor_office_id, to_office_id, created_at)
select current_setting('tests.pr')::uuid, 'received', p.id, p.office_id, p.office_id, now() + interval '1 day'
  from pr_tracker.profiles p where p.email = 'vg@x.test';
insert into pr_tracker.pr_events (pr_id, event_type, actor_id, actor_office_id, from_office_id, created_at)
select current_setting('tests.pr')::uuid, 'forwarded', p.id, p.office_id, p.office_id, now() + interval '3 days'
  from pr_tracker.profiles p where p.email = 'vg@x.test';
select tests.authenticate_as('vg@x.test');
select is((select avg_days from pr_tracker.report_office_days(current_date - 1, current_date + 10) where office_code = 'GSO'),
          2.00::numeric, 'GSO average hold is 2 days');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `relation "pr_tracker.pr_overview" does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009000900_views_reports.sql`

```sql
create view pr_tracker.pr_overview with (security_invoker = true) as
select p.*,
       oo.code as origin_office_code, oo.name as origin_office_name,
       co.code as current_office_code, co.name as current_office_name,
       s.label as current_status_label,
       so.name as sent_by_office_name,
       (select count(*) from pr_tracker.default_route_steps)::int as total_steps,
       round((extract(epoch from (now() - p.current_since)) / 86400.0)::numeric, 1) as days_here
from pr_tracker.purchase_requests p
join pr_tracker.offices oo on oo.id = p.origin_office_id
join pr_tracker.offices co on co.id = p.current_office_id
left join pr_tracker.office_statuses s on s.id = p.current_status_id
left join pr_tracker.offices so on so.id = p.sent_by_office_id;

create view pr_tracker.pr_timeline with (security_invoker = true) as
select e.id, e.pr_id, e.event_type, e.created_at,
       a.full_name as actor_name, ao.name as actor_office_name,
       fo.name as from_office_name, t.name as to_office_name,
       s.label as status_label, e.override_reason, e.remark,
       e.from_route_step, e.to_route_step, e.route_purpose, e.is_private, e.payload
from pr_tracker.pr_events e
join pr_tracker.profiles a on a.id = e.actor_id
left join pr_tracker.offices ao on ao.id = e.actor_office_id
left join pr_tracker.offices fo on fo.id = e.from_office_id
left join pr_tracker.offices t on t.id = e.to_office_id
left join pr_tracker.office_statuses s on s.id = e.status_id;

create view pr_tracker.followed_activity with (security_invoker = true) as
select e.id, e.pr_id, p.routing_slip_no, p.purpose, e.event_type, e.created_at,
       a.full_name as actor_name, ao.name as actor_office_name
from pr_tracker.pr_events e
join pr_tracker.pr_followers f on f.pr_id = e.pr_id and f.office_id = pr_tracker.current_office_id()
join pr_tracker.purchase_requests p on p.id = e.pr_id
join pr_tracker.profiles a on a.id = e.actor_id
left join pr_tracker.offices ao on ao.id = e.actor_office_id
where not e.is_private and e.event_type not in ('followed', 'unfollowed');

create view pr_tracker.my_notifications with (security_invoker = true) as
select n.id, n.pr_id, p.routing_slip_no, p.purpose, n.type, n.created_at,
       a.full_name as actor_name, ao.name as actor_office_name, t.name as to_office_name,
       exists (select 1 from pr_tracker.notification_reads r
                where r.notification_id = n.id and r.profile_id = pr_tracker.current_profile_id()) as is_read
from pr_tracker.notifications n
join pr_tracker.purchase_requests p on p.id = n.pr_id
join pr_tracker.pr_events e on e.id = n.event_id
join pr_tracker.profiles a on a.id = e.actor_id
left join pr_tracker.offices ao on ao.id = e.actor_office_id
left join pr_tracker.offices t on t.id = e.to_office_id;

grant select on pr_tracker.pr_overview, pr_tracker.pr_timeline, pr_tracker.followed_activity,
  pr_tracker.my_notifications to authenticated;

create or replace function pr_tracker.tracking_lookup(p_routing_slip_no text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pr pr_tracker.purchase_requests; v_can boolean;
begin
  if not pr_tracker.is_active_user() then raise exception 'Your account is not authorized'; end if;
  select * into v_pr from pr_tracker.purchase_requests where routing_slip_no = upper(trim(p_routing_slip_no));
  if not found then return null; end if;
  v_can := pr_tracker.can_view_pr(v_pr.id);
  return jsonb_build_object(
    'pr_id', case when v_can then v_pr.id end,
    'can_view', v_can,
    'routing_slip_no', v_pr.routing_slip_no,
    'pr_no', v_pr.pr_no,
    'origin_office_name', (select name from pr_tracker.offices where id = v_pr.origin_office_id),
    'current_office_name', (select name from pr_tracker.offices where id = v_pr.current_office_id),
    'movement_state', v_pr.movement_state,
    'current_status_label', (select label from pr_tracker.office_statuses where id = v_pr.current_status_id),
    'current_purpose', v_pr.current_purpose,
    'current_since', v_pr.current_since,
    'route_step', v_pr.route_step,
    'total_steps', (select count(*) from pr_tracker.default_route_steps),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('event_type', e.event_type, 'from_office_name', fo.name,
                                          'to_office_name', t.name, 'created_at', e.created_at) order by e.id)
        from pr_tracker.pr_events e
        left join pr_tracker.offices fo on fo.id = e.from_office_id
        left join pr_tracker.offices t on t.id = e.to_office_id
       where e.pr_id = v_pr.id
         and e.event_type in ('created', 'forwarded', 'received', 'returned', 'recalled', 'completed', 'cancelled')),
      '[]'::jsonb));
end $$;

create or replace function pr_tracker.unread_notification_count()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from pr_tracker.notifications n
   where n.recipient_office_id = pr_tracker.current_office_id()
     and not exists (select 1 from pr_tracker.notification_reads r
                      where r.notification_id = n.id and r.profile_id = pr_tracker.current_profile_id())
$$;

create or replace function pr_tracker.mark_notifications_read(p_ids bigint[])
returns void language sql security definer set search_path = '' as $$
  insert into pr_tracker.notification_reads (notification_id, profile_id)
  select n.id, pr_tracker.current_profile_id() from pr_tracker.notifications n
   where n.id = any (p_ids) and n.recipient_office_id = pr_tracker.current_office_id()
     and pr_tracker.current_profile_id() is not null
  on conflict do nothing
$$;

create or replace function pr_tracker.mark_all_notifications_read()
returns void language sql security definer set search_path = '' as $$
  insert into pr_tracker.notification_reads (notification_id, profile_id)
  select n.id, pr_tracker.current_profile_id() from pr_tracker.notifications n
   where n.recipient_office_id = pr_tracker.current_office_id()
     and pr_tracker.current_profile_id() is not null
  on conflict do nothing
$$;

create or replace function pr_tracker.report_office_days(p_from date, p_to date)
returns table (office_id uuid, office_code text, office_name text, prs_handled bigint,
               avg_days numeric, median_days numeric, max_days numeric, avg_transit_days numeric)
language sql stable security definer set search_path = '' as $$
  with ev as (
    select e.id, e.pr_id, e.event_type, e.actor_office_id, e.to_office_id, e.created_at
      from pr_tracker.pr_events e
     where e.event_type in ('received', 'recalled', 'forwarded', 'returned', 'completed', 'cancelled')
  ),
  holds as (
    select s.actor_office_id as office_id, s.pr_id,
           extract(epoch from (nx.created_at - s.created_at)) / 86400.0 as days, nx.created_at as ended_at
      from ev s
      join lateral (select n.created_at from ev n where n.pr_id = s.pr_id and n.id > s.id order by n.id limit 1) nx on true
     where s.event_type in ('received', 'recalled')
  ),
  transits as (
    select f.to_office_id as office_id,
           extract(epoch from (nx.created_at - f.created_at)) / 86400.0 as days, nx.created_at as ended_at
      from ev f
      join lateral (select n.event_type, n.created_at from ev n where n.pr_id = f.pr_id and n.id > f.id
                     order by n.id limit 1) nx on nx.event_type = 'received'
     where f.event_type in ('forwarded', 'returned')
  ),
  h as (
    select holds.office_id, count(distinct holds.pr_id) as prs, avg(days) as a,
           percentile_cont(0.5) within group (order by days) as m, max(days) as mx
      from holds where (ended_at at time zone 'Asia/Manila')::date between p_from and p_to
     group by holds.office_id
  ),
  t as (
    select transits.office_id, avg(days) as a from transits
     where (ended_at at time zone 'Asia/Manila')::date between p_from and p_to
     group by transits.office_id
  )
  select o.id, o.code, o.name, coalesce(h.prs, 0),
         round(h.a::numeric, 2), round(h.m::numeric, 2), round(h.mx::numeric, 2), round(t.a::numeric, 2)
    from pr_tracker.offices o
    left join h on h.office_id = o.id
    left join t on t.office_id = o.id
   where pr_tracker.is_active_user() and (h.office_id is not null or t.office_id is not null)
   order by h.a desc nulls last, o.name
$$;

create or replace function pr_tracker.report_stuck_prs()
returns table (pr_id uuid, routing_slip_no text, origin_office_name text, current_office_name text,
               movement_state text, days numeric, can_view boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.routing_slip_no, oo.name, co.name, p.movement_state::text,
         round((extract(epoch from (now() - p.current_since)) / 86400.0)::numeric, 1),
         pr_tracker.can_view_pr(p.id)
    from pr_tracker.purchase_requests p
    join pr_tracker.offices oo on oo.id = p.origin_office_id
    join pr_tracker.offices co on co.id = p.current_office_id
   where pr_tracker.is_active_user()
     and p.movement_state in ('in_transit', 'returned', 'received')
     and p.current_since <= now() - make_interval(days => coalesce(
           (select (value #>> '{}')::int from pr_tracker.app_settings where key = 'stuck_threshold_days'), 5))
   order by p.current_since
$$;

grant execute on function
  pr_tracker.tracking_lookup(text),
  pr_tracker.unread_notification_count(),
  pr_tracker.mark_notifications_read(bigint[]),
  pr_tracker.mark_all_notifications_read(),
  pr_tracker.report_office_days(date, date),
  pr_tracker.report_stuck_prs()
to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `09_visibility_reports` ok, 14/14.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): overview/timeline/notification views, tracking lookup, reports"
```

---

### Task 11: Admin RPCs

**Files:**
- Create: `supabase/migrations/20261009001000_admin_rpc.sql`, `supabase/tests/10_admin.test.sql`

**Interfaces:**
- Produces (granted to `authenticated`; each checks `is_admin()`):
  - `admin_upsert_profile(p_id uuid, p_email text, p_full_name text, p_designation text, p_office_id uuid, p_role pr_tracker.user_role, p_active boolean) → uuid`
  - `admin_upsert_office(p_id uuid, p_code text, p_name text, p_is_processing_office boolean, p_can_assign_pr_no boolean, p_can_set_mode_of_procurement boolean, p_can_complete boolean, p_active boolean) → uuid`
  - `admin_set_route(p_steps jsonb) → void`. Takes `[{office_id, purpose}]` in order.
  - `admin_upsert_status(p_id uuid, p_office_id uuid, p_label text, p_sort_order int, p_active boolean) → uuid`
  - `admin_set_setting(p_key text, p_value jsonb) → void`. Keys: `lgu_name`, `stuck_threshold_days`, `max_upload_mb`.

- [ ] **Step 1: Write the failing test** `supabase/tests/10_admin.test.sql`

```sql
begin;
select plan(10);

select tests.make_user('ad@x.test', 'GSO', 'admin');
select tests.make_user('st@x.test', 'GSO');
-- link the seeded super admin to a test auth user
update pr_tracker.profiles set auth_user_id = tests.create_auth_user('berlcamp@gmail.com') where email = 'berlcamp@gmail.com';

select tests.authenticate_as('st@x.test');
select throws_like($$select pr_tracker.admin_set_setting('lgu_name', '"X"')$$, 'Administrator access required', 'staff blocked');

select tests.clear_authentication(); select tests.authenticate_as('ad@x.test');
select isnt(pr_tracker.admin_upsert_profile(null, ' New.User@LGU.gov.ph ', 'New User', 'Clerk',
            (select id from pr_tracker.offices where code = 'BAC'), 'staff', true), null, 'admin creates staff');
select is((select email from pr_tracker.profiles where full_name = 'New User'), 'new.user@lgu.gov.ph', 'email normalised');
select throws_like($$select pr_tracker.admin_upsert_profile(null, 'x2@x.test', 'X2', null, null, 'admin', true)$$,
                   'Only the super admin can grant the admin role', 'admin cannot create admins');
select throws_like(format($$select pr_tracker.admin_upsert_profile(%L, 'berlcamp@gmail.com', 'Hacked', null, null, 'staff', false)$$,
                          (select id from pr_tracker.profiles where email = 'berlcamp@gmail.com')),
                   'The super admin account cannot be modified here', 'super admin protected');
select throws_like($$select pr_tracker.admin_set_setting('allowed_auth_providers', '["email"]')$$,
                   'Unknown or protected setting%', 'provider allowlist not editable from app');
select lives_ok($$select pr_tracker.admin_set_setting('stuck_threshold_days', '7')$$, 'threshold updated');
select lives_ok(format($$select pr_tracker.admin_set_route(jsonb_build_array(
                   jsonb_build_object('office_id', %L, 'purpose', 'For review'),
                   jsonb_build_object('office_id', %L, 'purpose', 'For approval')))$$,
                 (select id from pr_tracker.offices where code = 'GSO'), (select id from pr_tracker.offices where code = 'MAYOR')),
                'route replaced');
select is((select count(*)::int from pr_tracker.default_route_steps), 2, 'route has 2 steps');

select tests.clear_authentication(); select tests.authenticate_as('berlcamp@gmail.com');
select isnt(pr_tracker.admin_upsert_profile(null, 'admin2@x.test', 'Admin Two', null, null, 'admin', true), null,
            'super admin can create admins');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `function pr_tracker.admin_set_setting(unknown, unknown) does not exist`.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009001000_admin_rpc.sql`

```sql
create or replace function pr_tracker._require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not pr_tracker.is_admin() then raise exception 'Administrator access required'; end if;
end $$;

create or replace function pr_tracker.admin_upsert_profile(
  p_id uuid, p_email text, p_full_name text, p_designation text, p_office_id uuid,
  p_role pr_tracker.user_role, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_existing pr_tracker.profiles;
  v_id uuid := p_id;
begin
  perform pr_tracker._require_admin();
  -- Protect existing privileged rows before validating input.
  if p_id is not null then
    select * into v_existing from pr_tracker.profiles where id = p_id for update;
    if not found then raise exception 'Account not found'; end if;
    if v_existing.role = 'super_admin' then raise exception 'The super admin account cannot be modified here'; end if;
    if v_existing.role = 'admin' and not pr_tracker.is_super_admin() then
      raise exception 'Only the super admin can modify administrator accounts';
    end if;
  end if;
  if p_role = 'super_admin' then raise exception 'The super admin role cannot be assigned'; end if;
  if p_role = 'admin' and not pr_tracker.is_super_admin() then
    raise exception 'Only the super admin can grant the admin role';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email address'; end if;
  if pr_tracker._clean(p_full_name) is null then raise exception 'Full name is required'; end if;
  if p_role = 'staff' and p_office_id is null then raise exception 'Staff accounts must belong to an office'; end if;
  if exists (select 1 from pr_tracker.profiles where email = v_email and id is distinct from p_id) then
    raise exception 'An account with this email already exists';
  end if;

  if p_id is null then
    insert into pr_tracker.profiles (email, full_name, designation, office_id, role, active)
    values (v_email, trim(p_full_name), pr_tracker._clean(p_designation), p_office_id, p_role, coalesce(p_active, true))
    returning id into v_id;
  else
    update pr_tracker.profiles set
      email = v_email, full_name = trim(p_full_name), designation = pr_tracker._clean(p_designation),
      office_id = p_office_id, role = p_role, active = coalesce(p_active, true),
      auth_user_id = case when v_existing.email = v_email then auth_user_id else null end
    where id = p_id;
  end if;
  return v_id;
end $$;

create or replace function pr_tracker.admin_upsert_office(
  p_id uuid, p_code text, p_name text, p_is_processing_office boolean, p_can_assign_pr_no boolean,
  p_can_set_mode_of_procurement boolean, p_can_complete boolean, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(trim(p_code)); v_id uuid := p_id;
begin
  perform pr_tracker._require_admin();
  if v_code !~ '^[A-Z0-9_]{2,20}$' then
    raise exception 'Office code must be 2-20 letters, digits or underscores';
  end if;
  if pr_tracker._clean(p_name) is null then raise exception 'Office name is required'; end if;
  if exists (select 1 from pr_tracker.offices where code = v_code and id is distinct from p_id) then
    raise exception 'Office code % is already used', v_code;
  end if;
  if p_id is null then
    insert into pr_tracker.offices (code, name, is_processing_office, can_assign_pr_no, can_set_mode_of_procurement, can_complete, active)
    values (v_code, trim(p_name), p_is_processing_office, p_can_assign_pr_no, p_can_set_mode_of_procurement, p_can_complete, coalesce(p_active, true))
    returning id into v_id;
  else
    update pr_tracker.offices set code = v_code, name = trim(p_name), is_processing_office = p_is_processing_office,
      can_assign_pr_no = p_can_assign_pr_no, can_set_mode_of_procurement = p_can_set_mode_of_procurement,
      can_complete = p_can_complete, active = coalesce(p_active, true)
    where id = p_id;
    if not found then raise exception 'Office not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function pr_tracker.admin_set_route(p_steps jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bad record;
begin
  perform pr_tracker._require_admin();
  if jsonb_typeof(p_steps) is distinct from 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'The route needs at least one step';
  end if;
  for v_bad in select t.ord, t.step from jsonb_array_elements(p_steps) with ordinality as t(step, ord) loop
    if not exists (select 1 from pr_tracker.offices where id = (v_bad.step ->> 'office_id')::uuid and active) then
      raise exception 'Step %: office not found or inactive', v_bad.ord;
    end if;
    if pr_tracker._clean(v_bad.step ->> 'purpose') is null then
      raise exception 'Step %: purpose is required', v_bad.ord;
    end if;
  end loop;
  delete from pr_tracker.default_route_steps where true;
  insert into pr_tracker.default_route_steps (step_order, office_id, purpose)
  select t.ord, (t.step ->> 'office_id')::uuid, trim(t.step ->> 'purpose')
    from jsonb_array_elements(p_steps) with ordinality as t(step, ord);
end $$;

create or replace function pr_tracker.admin_upsert_status(
  p_id uuid, p_office_id uuid, p_label text, p_sort_order int, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id;
begin
  perform pr_tracker._require_admin();
  if pr_tracker._clean(p_label) is null then raise exception 'Status label is required'; end if;
  if exists (select 1 from pr_tracker.office_statuses
              where office_id = p_office_id and label = trim(p_label) and id is distinct from p_id) then
    raise exception 'This office already has a status named %', trim(p_label);
  end if;
  if p_id is null then
    insert into pr_tracker.office_statuses (office_id, label, sort_order, active)
    values (p_office_id, trim(p_label), coalesce(p_sort_order, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    update pr_tracker.office_statuses set label = trim(p_label), sort_order = coalesce(p_sort_order, 0),
      active = coalesce(p_active, true)
    where id = p_id;
    if not found then raise exception 'Status not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function pr_tracker.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pr_tracker._require_admin();
  case p_key
    when 'lgu_name' then
      if jsonb_typeof(p_value) <> 'string' or pr_tracker._clean(p_value #>> '{}') is null then
        raise exception 'LGU name is required'; end if;
    when 'stuck_threshold_days' then
      if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 365 then
        raise exception 'Stuck threshold must be between 1 and 365 days'; end if;
    when 'max_upload_mb' then
      if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 1 and 50 then
        raise exception 'Max upload size must be between 1 and 50 MB'; end if;
    else
      raise exception 'Unknown or protected setting: %', p_key;
  end case;
  insert into pr_tracker.app_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end $$;

grant execute on function
  pr_tracker.admin_upsert_profile(uuid, text, text, text, uuid, pr_tracker.user_role, boolean),
  pr_tracker.admin_upsert_office(uuid, text, text, boolean, boolean, boolean, boolean, boolean),
  pr_tracker.admin_set_route(jsonb),
  pr_tracker.admin_upsert_status(uuid, uuid, text, int, boolean),
  pr_tracker.admin_set_setting(text, jsonb)
to authenticated;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `supabase db reset && supabase test db`
Expected: `10_admin` ok, 10/10.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): admin RPCs for users, offices, route, statuses, settings"
```

---

### Task 12: Storage bucket and policies

**Files:**
- Create: `supabase/migrations/20261009001100_storage.sql`, `supabase/tests/11_storage.test.sql`

**Interfaces:**
- Produces:
  - Bucket `pr-tracker-attachments` (private, 50 MB hard cap, allowed MIME list).
  - `pr_tracker.attachment_pr_id(text) → uuid`
  - `pr_tracker.can_upload_attachment(uuid) → boolean`
  - Policies `pr_tracker_attachments_select` and `pr_tracker_attachments_insert` on `storage.objects`.
- Upload object path: `{pr_id}/{uuid}-{safe_filename}`.

- [ ] **Step 1: Write the failing test** `supabase/tests/11_storage.test.sql`

```sql
begin;
select plan(6);

select tests.make_user('sc@x.test', 'CSWD');
select tests.make_user('st2@x.test', 'TREAS');
select tests.authenticate_as('sc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header(), tests.sample_items())::text, true);

select ok(exists (select 1 from storage.buckets where id = 'pr-tracker-attachments' and not public), 'private bucket exists');
select is(pr_tracker.attachment_pr_id(current_setting('tests.pr') || '/abc-file.pdf'), current_setting('tests.pr')::uuid, 'parses pr id');
select is(pr_tracker.attachment_pr_id('not-a-uuid/file.pdf'), null, 'garbage path -> null');
select ok(pr_tracker.can_upload_attachment(current_setting('tests.pr')::uuid), 'origin may upload');
select tests.clear_authentication(); select tests.authenticate_as('st2@x.test');
select ok(not pr_tracker.can_upload_attachment(current_setting('tests.pr')::uuid), 'uninvolved may not upload');
select tests.clear_authentication();
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'pr_tracker_attachments_insert'), 'insert policy exists');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase test db`
Expected: FAIL, `private bucket exists` fails and `attachment_pr_id` does not exist.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261009001100_storage.sql`

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pr-tracker-attachments', 'pr-tracker-attachments', false, 52428800, array[
  'application/pdf', 'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create or replace function pr_tracker.attachment_pr_id(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

create or replace function pr_tracker.can_upload_attachment(p_pr_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from pr_tracker.purchase_requests p
     where p.id = p_pr_id
       and pr_tracker.current_office_id() is not null
       and (pr_tracker._is_holder(p, pr_tracker.current_office_id())
            or p.origin_office_id = pr_tracker.current_office_id()))
$$;

grant execute on function pr_tracker.attachment_pr_id(text), pr_tracker.can_upload_attachment(uuid) to authenticated;

create policy pr_tracker_attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'pr-tracker-attachments' and pr_tracker.can_view_pr(pr_tracker.attachment_pr_id(name)));

create policy pr_tracker_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pr-tracker-attachments' and pr_tracker.can_upload_attachment(pr_tracker.attachment_pr_id(name)));
-- No update/delete policies: attachments are never overwritten or removed.
```

- [ ] **Step 4: Run all DB tests**

Run: `supabase db reset && supabase test db`
Expected: all 11 files ok.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): private attachment bucket with involvement-based policies"
```

---

### Task 13: Pure domain library (types, formatting, schema, permissions, timeline text, files, CSV, search)

**Files:**
- Create:
  - `lib/types.ts`, `lib/format.ts`, `lib/csv.ts`, `lib/search.ts`, `lib/auth/safe-next.ts`
  - `lib/pr/schema.ts`, `lib/pr/permissions.ts`, `lib/pr/timeline.ts`, `lib/pr/routing-slip.ts`, `lib/pr/files.ts`
- Test: `lib/format.test.ts`, `lib/csv.test.ts`, `lib/search.test.ts`, `lib/auth/safe-next.test.ts`, `lib/pr/schema.test.ts`, `lib/pr/permissions.test.ts`, `lib/pr/timeline.test.ts`, `lib/pr/routing-slip.test.ts`, `lib/pr/files.test.ts`

**Interfaces:**
- Produces (used by every UI task):
  - `lib/types.ts`: `MovementState`, `Role`, `EventType`, `OfficeRef`, `Profile`
  - `lib/format.ts`:
    - `MOVEMENT_LABELS`
    - `daysBetween(fromIso: string, now?: Date): number`
    - `formatDaysHere(days: number): string`
    - `formatPeso(n: number): string`
    - `formatDate(iso: string): string`
    - `formatDateTime(iso: string): string`
    - `locationLine(pr: LocationInput, now?: Date): string`
  - `lib/pr/schema.ts`:
    - `lineItemSchema`, `prFormSchema`, `EMPTY_ITEM`
    - types `PrFormValues`, `LineItemValues`
    - `lineTotal(qty, cost): number`
    - `grandTotal(items): number`
    - `toRpcPayload(values): { header: Record<string, string | null>; items: LineItemValues[] }`
  - `lib/pr/permissions.ts`: `PrAction`, `availableActions(pr: PrForActions, actor: ActorForActions): Set<PrAction>`
  - `lib/pr/timeline.ts`:
    - `TimelineEvent`, `describeEvent(e: TimelineEvent, totalSteps: number): string`
    - `diffSnapshots(before: Snapshot, after: Snapshot): string[]`
    - `NotificationRow`, `notificationText(n: NotificationRow): string`
  - `lib/pr/routing-slip.ts`:
    - `SlipStep`, `SlipRow`
    - `buildSlipRows(steps: SlipStep[], blankRows?: number): SlipRow[]`
    - `trackUrl(appUrl: string, rs: string): string`
    - `truncate(s: string, n: number): string`
  - `lib/pr/files.ts`:
    - `ALLOWED_MIME_TYPES`
    - `safeFileName(name: string): string`
    - `validateFile(f: {name: string; size: number; type: string}, maxMb: number): string | null`
  - `lib/csv.ts`: `toCsv(rows: Record<string, unknown>[], columns: {key: string; header: string}[]): string`
  - `lib/search.ts`:
    - `RS_PATTERN`
    - `searchTarget(q: string): string | null`
    - `parseListParams(sp: Record<string, string | string[] | undefined>): ListParams`
  - `lib/auth/safe-next.ts`: `safeNext(raw: string | null | undefined): string`

- [ ] **Step 1: Write the failing tests** (Review Focus #5 is covered by `lineTotal`)

`lib/format.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { daysBetween, formatDaysHere, formatPeso, locationLine } from "./format";

const now = new Date("2026-10-12T02:00:00Z");

describe("format", () => {
  test("daysBetween is non-negative fractional days", () => {
    expect(daysBetween("2026-10-09T02:00:00Z", now)).toBe(3);
    expect(daysBetween("2026-10-13T02:00:00Z", now)).toBe(0);
  });
  test("formatDaysHere", () => {
    expect(formatDaysHere(0.4)).toBe("less than a day");
    expect(formatDaysHere(1.2)).toBe("1 day");
    expect(formatDaysHere(3.9)).toBe("3 days");
  });
  test("formatPeso", () => {
    expect(formatPeso(2695)).toBe("₱2,695.00");
  });
  test("locationLine received with status", () => {
    expect(locationLine({
      movement_state: "received", current_office_name: "Mayor's Office",
      current_status_label: "For Mayor's approval", current_purpose: "For approval",
      current_since: "2026-10-09T02:00:00Z", route_step: 4, total_steps: 10,
    }, now)).toBe("Received at Mayor's Office · For Mayor's approval · 3 days here");
  });
  test("locationLine in transit shows purpose and step", () => {
    expect(locationLine({
      movement_state: "in_transit", current_office_name: "Mayor's Office",
      current_status_label: null, current_purpose: "For signing of NOA / NTP",
      current_since: "2026-10-12T01:00:00Z", route_step: 6, total_steps: 10,
    }, now)).toBe("In transit → Mayor's Office · for signing of NOA / NTP · step 6 of 10");
  });
  test("locationLine off-route transit has no step", () => {
    expect(locationLine({
      movement_state: "in_transit", current_office_name: "Legal Office",
      current_status_label: null, current_purpose: null,
      current_since: "2026-10-12T01:00:00Z", route_step: 3, total_steps: 10,
    }, now)).toBe("In transit → Legal Office");
  });
  test("locationLine returned / draft / completed", () => {
    const base = { current_status_label: null, current_purpose: null, current_since: "2026-10-11T02:00:00Z", route_step: 0, total_steps: 10 };
    expect(locationLine({ ...base, movement_state: "returned", current_office_name: "GSO" }, now)).toBe("Returned → GSO · 1 day waiting");
    expect(locationLine({ ...base, movement_state: "draft", current_office_name: "CSWD" }, now)).toBe("Draft at CSWD");
    expect(locationLine({ ...base, movement_state: "completed", current_office_name: "Treasurer" }, now)).toBe("Completed at Treasurer");
  });
});
```

`lib/pr/schema.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { grandTotal, lineTotal, prFormSchema, toRpcPayload } from "./schema";

const valid = {
  pr_date: "2026-10-09", purpose: "Supplies", responsibility_center_code: "", fund_cluster: "01",
  requested_by_name: "Maria", requested_by_designation: "", approved_by_name: "", approved_by_designation: "",
  items: [{ stock_no: "", unit: "ream", description: "Bond paper", quantity: 10, unit_cost: 245.5 }],
};

describe("pr schema", () => {
  test("lineTotal rounds half up to centavos like Postgres", () => {
    expect(lineTotal(1.5, 10.25)).toBe(15.38);
    expect(lineTotal(3, 0.1)).toBe(0.3);
    expect(lineTotal(2, 120)).toBe(240);
  });
  test("grandTotal sums rounded lines", () => {
    expect(grandTotal([{ quantity: 10, unit_cost: 245.5 }, { quantity: 2, unit_cost: 120 }])).toBe(2695);
  });
  test("valid form parses", () => {
    expect(prFormSchema.safeParse(valid).success).toBe(true);
  });
  test("requires at least one item", () => {
    const r = prFormSchema.safeParse({ ...valid, items: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Add at least one line item");
  });
  test("rejects zero quantity and negative cost", () => {
    const r = prFormSchema.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 0, unit_cost: -1 }] });
    const msgs = r.error?.issues.map((i) => i.message);
    expect(msgs).toContain("Quantity must be greater than zero");
    expect(msgs).toContain("Unit cost cannot be negative");
  });
  test("toRpcPayload turns blanks into null", () => {
    const { header, items } = toRpcPayload(prFormSchema.parse(valid));
    expect(header.responsibility_center_code).toBeNull();
    expect(header.purpose).toBe("Supplies");
    expect(items[0]).toEqual({ stock_no: "", unit: "ream", description: "Bond paper", quantity: 10, unit_cost: 245.5 });
  });
});
```

`lib/pr/permissions.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { availableActions } from "./permissions";

const office = (id: string, flags: Partial<{ can_assign_pr_no: boolean; can_set_mode_of_procurement: boolean; can_complete: boolean }> = {}) =>
  ({ id, can_assign_pr_no: false, can_set_mode_of_procurement: false, can_complete: false, ...flags });
const staff = (o: ReturnType<typeof office>) => ({ role: "staff" as const, office: o });
const pr = (p: Partial<{ movement_state: string; origin_office_id: string; current_office_id: string; sent_by_office_id: string | null }>) =>
  ({ movement_state: "draft", origin_office_id: "cswd", current_office_id: "cswd", sent_by_office_id: null, ...p }) as never;

describe("availableActions", () => {
  test("origin in draft can edit, forward, cancel", () => {
    const a = availableActions(pr({}), staff(office("cswd")));
    expect([...a].sort()).toEqual(["add_attachment", "add_private_note", "add_remark", "cancel", "edit", "forward"]);
  });
  test("destination sees receive only while in transit", () => {
    const a = availableActions(pr({ movement_state: "in_transit", current_office_id: "gso", sent_by_office_id: "cswd" }), staff(office("gso")));
    expect([...a]).toEqual(["receive"]);
  });
  test("sender can recall while in transit", () => {
    const a = availableActions(pr({ movement_state: "in_transit", current_office_id: "gso", sent_by_office_id: "cswd" }), staff(office("cswd")));
    expect(a.has("recall")).toBe(true);
    expect(a.has("cancel")).toBe(false);
  });
  test("holder with flags gets PR No., mode and complete", () => {
    const a = availableActions(pr({ movement_state: "received", current_office_id: "treas" }),
      staff(office("treas", { can_assign_pr_no: true, can_set_mode_of_procurement: true, can_complete: true })));
    for (const x of ["forward", "return", "set_status", "assign_pr_no", "set_mode", "complete"]) expect(a.has(x as never)).toBe(true);
  });
  test("admin without office can only cancel non-terminal PRs", () => {
    expect([...availableActions(pr({ movement_state: "received", current_office_id: "gso" }), { role: "admin", office: null })]).toEqual(["cancel"]);
    expect(availableActions(pr({ movement_state: "completed" }), { role: "admin", office: null }).size).toBe(0);
  });
  test("origin edits after return once received back", () => {
    expect(availableActions(pr({ movement_state: "received" }), staff(office("cswd"))).has("edit")).toBe(true);
    expect(availableActions(pr({ movement_state: "returned" }), staff(office("cswd"))).has("edit")).toBe(false);
  });
});
```

`lib/pr/timeline.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { describeEvent, diffSnapshots, notificationText } from "./timeline";

const base = {
  actor_name: "Gabriel", actor_office_name: "GSO", from_office_name: null, to_office_name: null, status_label: null,
  override_reason: null, remark: null, to_route_step: null, route_purpose: null, payload: {},
};

describe("timeline", () => {
  test("forward on route", () => {
    expect(describeEvent({ ...base, event_type: "forwarded", to_office_name: "Mayor's Office", route_purpose: "For approval", to_route_step: 4 }, 10))
      .toBe("Forwarded to Mayor's Office for approval (step 4 of 10)");
  });
  test("forward off route with reason", () => {
    expect(describeEvent({ ...base, event_type: "forwarded", to_office_name: "Legal", override_reason: "Needs legal review" }, 10))
      .toBe("Forwarded to Legal outside the default route. Reason: Needs legal review");
  });
  test("PR No. change", () => {
    expect(describeEvent({ ...base, event_type: "pr_no_assigned", payload: { old: "A", new: "B" } }, 10)).toBe("PR No. changed from A to B");
    expect(describeEvent({ ...base, event_type: "pr_no_assigned", payload: { old: null, new: "B" } }, 10)).toBe("PR No. B assigned");
  });
  test("diffSnapshots lists header and item changes", () => {
    const before = { header: { purpose: "Old", grand_total: 100 }, items: [
      { line_no: 1, description: "Paper", unit: "ream", quantity: 10, unit_cost: 10, stock_no: null },
      { line_no: 2, description: "Pen", unit: "box", quantity: 1, unit_cost: 5, stock_no: null } ] };
    const after = { header: { purpose: "New", grand_total: 120 }, items: [
      { line_no: 1, description: "Paper", unit: "ream", quantity: 12, unit_cost: 10, stock_no: null },
      { line_no: 3, description: "Clip", unit: "box", quantity: 1, unit_cost: 2, stock_no: null } ] };
    expect(diffSnapshots(before, after)).toEqual([
      'Purpose: "Old" → "New"',
      'Grand total: "100" → "120"',
      "Line 1 quantity: 10 → 12",
      "Line 2 removed: Pen",
      "Line 3 added: Clip",
    ]);
  });
  test("notificationText", () => {
    expect(notificationText({ type: "forwarded", actor_office_name: "CSWD", routing_slip_no: "RS-2026-10-00001" }))
      .toBe("CSWD forwarded RS-2026-10-00001 to your office");
    expect(notificationText({ type: "completed", actor_office_name: "TREAS", routing_slip_no: "RS-1" })).toBe("RS-1 was completed");
  });
});
```

`lib/pr/routing-slip.test.ts`:
```ts
import { expect, test } from "vitest";
import { buildSlipRows, trackUrl, truncate } from "./routing-slip";

test("one row per step in order, plus blanks; repeats kept", () => {
  const rows = buildSlipRows([
    { step_order: 2, office_name: "Mayor's Office", purpose: "For approval" },
    { step_order: 1, office_name: "GSO", purpose: "For review" },
    { step_order: 3, office_name: "Mayor's Office", purpose: "For signing" },
  ]);
  expect(rows.map((r) => r.label)).toEqual(["GSO", "Mayor's Office", "Mayor's Office", "", ""]);
  expect(rows[0].purpose).toBe("For review");
});
test("trackUrl", () => {
  expect(trackUrl("https://pr.example.gov.ph/", "RS-2026-10-00001")).toBe("https://pr.example.gov.ph/track/RS-2026-10-00001");
});
test("truncate", () => {
  expect(truncate("abcdef", 4)).toBe("abc…");
  expect(truncate("abc", 4)).toBe("abc");
});
```

`lib/pr/files.test.ts`:
```ts
import { expect, test } from "vitest";
import { safeFileName, validateFile } from "./files";

test("safeFileName strips unsafe chars and keeps extension", () => {
  expect(safeFileName("Quotation (final) #2.pdf")).toBe("Quotation_final_2.pdf");
  expect(safeFileName("../../etc/passwd")).toBe("etc_passwd");
  expect(safeFileName("x".repeat(200) + ".pdf").length).toBeLessThanOrEqual(100);
});
test("validateFile", () => {
  expect(validateFile({ name: "a.pdf", size: 1000, type: "application/pdf" }, 20)).toBeNull();
  expect(validateFile({ name: "a.exe", size: 1000, type: "application/x-msdownload" }, 20)).toBe("File type not allowed. Use PDF, JPG, PNG, DOCX or XLSX.");
  expect(validateFile({ name: "a.pdf", size: 21 * 1024 * 1024, type: "application/pdf" }, 20)).toBe("File is larger than 20 MB.");
  expect(validateFile({ name: "a.pdf", size: 0, type: "application/pdf" }, 20)).toBe("File is empty.");
});
```

`lib/csv.test.ts`:
```ts
import { expect, test } from "vitest";
import { toCsv } from "./csv";

test("escapes quotes, commas, newlines and neutralises formulas", () => {
  const csv = toCsv([{ a: 'He said "hi"', b: "x,y", c: "=SUM(A1)", d: 2.5 }],
    [{ key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" }, { key: "d", header: "D" }]);
  expect(csv).toBe('A,B,C,D\r\n"He said ""hi""","x,y",\'=SUM(A1),2.5');
});
```

`lib/search.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseListParams, searchTarget } from "./search";

test("searchTarget routes RS numbers to tracking page", () => {
  expect(searchTarget(" rs-2026-10-00012 ")).toBe("/track/RS-2026-10-00012");
  expect(searchTarget("bond paper")).toBe("/prs?q=bond%20paper");
  expect(searchTarget("  ")).toBeNull();
});
test("parseListParams applies defaults and whitelists", () => {
  expect(parseListParams({})).toEqual({ page: 1, size: 25, sort: "created_at", dir: "desc", q: "", state: "", office: "", from: "", to: "", min: "", max: "" });
  const p = parseListParams({ page: "3", size: "50", sort: "grand_total.asc", state: "received", q: "paper" });
  expect(p).toMatchObject({ page: 3, size: 50, sort: "grand_total", dir: "asc", state: "received", q: "paper" });
  expect(parseListParams({ size: "9999", sort: "password.asc", state: "hacked" })).toMatchObject({ size: 25, sort: "created_at", state: "" });
});
```

`lib/auth/safe-next.test.ts`:
```ts
import { expect, test } from "vitest";
import { safeNext } from "./safe-next";

test("only allows same-site relative paths", () => {
  expect(safeNext("/prs/1")).toBe("/prs/1");
  expect(safeNext("//evil.com")).toBe("/");
  expect(safeNext("https://evil.com")).toBe("/");
  expect(safeNext(null)).toBe("/");
  expect(safeNext("/\\evil.com")).toBe("/");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL, `Failed to resolve import "./format"` (and the same for each module).

- [ ] **Step 3: Implement the modules**

`lib/types.ts`:
```ts
export type MovementState = "draft" | "in_transit" | "received" | "returned" | "completed" | "cancelled";
export type Role = "super_admin" | "admin" | "staff";
export type EventType =
  | "created" | "edited" | "forwarded" | "recalled" | "received" | "returned" | "status_changed"
  | "remark_added" | "private_note_added" | "attachment_added" | "attachment_superseded"
  | "pr_no_assigned" | "mode_set" | "completed" | "cancelled" | "followed" | "unfollowed";

export type OfficeRef = {
  id: string; code: string; name: string;
  can_assign_pr_no: boolean; can_set_mode_of_procurement: boolean; can_complete: boolean;
};

export type Profile = {
  id: string; email: string; full_name: string; designation: string | null;
  role: Role; office: OfficeRef | null;
};
```

`lib/format.ts`:
```ts
import type { MovementState } from "./types";

export const MOVEMENT_LABELS: Record<MovementState, string> = {
  draft: "Draft", in_transit: "In transit", received: "Received",
  returned: "Returned", completed: "Completed", cancelled: "Cancelled",
};

const TZ = "Asia/Manila";

export function daysBetween(fromIso: string, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export function formatDaysHere(days: number): string {
  const d = Math.floor(days);
  if (d < 1) return "less than a day";
  return d === 1 ? "1 day" : `${d} days`;
}

export function formatPeso(n: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, dateStyle: "medium" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export type LocationInput = {
  movement_state: MovementState;
  current_office_name: string;
  current_status_label: string | null;
  current_purpose: string | null;
  current_since: string;
  route_step: number;
  total_steps: number;
};

export function locationLine(pr: LocationInput, now: Date = new Date()): string {
  const days = formatDaysHere(daysBetween(pr.current_since, now));
  switch (pr.movement_state) {
    case "draft":
      return `Draft at ${pr.current_office_name}`;
    case "in_transit":
      return pr.current_purpose
        ? `In transit → ${pr.current_office_name} · ${lcFirst(pr.current_purpose)} · step ${pr.route_step} of ${pr.total_steps}`
        : `In transit → ${pr.current_office_name}`;
    case "returned":
      return `Returned → ${pr.current_office_name} · ${days} waiting`;
    case "received":
      return [`Received at ${pr.current_office_name}`, pr.current_status_label, `${days} here`].filter(Boolean).join(" · ");
    case "completed":
      return `Completed at ${pr.current_office_name}`;
    case "cancelled":
      return "Cancelled";
  }
}
```

`lib/pr/schema.ts`:
```ts
import { z } from "zod";

export const lineItemSchema = z.object({
  stock_no: z.string().trim(),
  unit: z.string().trim().min(1, "Unit is required"),
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.number("Quantity is required").positive("Quantity must be greater than zero"),
  unit_cost: z.number("Unit cost is required").min(0, "Unit cost cannot be negative"),
});

export const prFormSchema = z.object({
  pr_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  purpose: z.string().trim().min(1, "Purpose is required"),
  responsibility_center_code: z.string().trim(),
  fund_cluster: z.string().trim(),
  requested_by_name: z.string().trim().min(1, "Requested by is required"),
  requested_by_designation: z.string().trim(),
  approved_by_name: z.string().trim(),
  approved_by_designation: z.string().trim(),
  items: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

export type PrFormValues = z.infer<typeof prFormSchema>;
export type LineItemValues = z.infer<typeof lineItemSchema>;

export const EMPTY_ITEM: LineItemValues = { stock_no: "", unit: "", description: "", quantity: 1, unit_cost: 0 };

/** Mirrors Postgres round(qty * cost, 2): half away from zero (all values are non-negative). */
export function lineTotal(quantity: number, unitCost: number): number {
  return Math.round((quantity * unitCost + Number.EPSILON) * 100) / 100;
}

export function grandTotal(items: { quantity: number; unit_cost: number }[]): number {
  const cents = items.reduce((sum, i) => sum + Math.round(lineTotal(i.quantity || 0, i.unit_cost || 0) * 100), 0);
  return cents / 100;
}

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

export function toRpcPayload(values: PrFormValues) {
  return {
    header: {
      pr_date: values.pr_date,
      purpose: values.purpose,
      responsibility_center_code: blankToNull(values.responsibility_center_code),
      fund_cluster: blankToNull(values.fund_cluster),
      requested_by_name: values.requested_by_name,
      requested_by_designation: blankToNull(values.requested_by_designation),
      approved_by_name: blankToNull(values.approved_by_name),
      approved_by_designation: blankToNull(values.approved_by_designation),
    } as Record<string, string | null>,
    items: values.items.map(({ stock_no, unit, description, quantity, unit_cost }) => ({
      stock_no, unit, description, quantity, unit_cost,
    })),
  };
}
```

`lib/pr/permissions.ts`:
```ts
import type { MovementState, Role } from "../types";

export type PrAction =
  | "edit" | "forward" | "receive" | "return" | "recall" | "set_status" | "add_remark"
  | "add_private_note" | "add_attachment" | "assign_pr_no" | "set_mode" | "complete" | "cancel";

export type PrForActions = {
  movement_state: MovementState;
  origin_office_id: string;
  current_office_id: string;
  sent_by_office_id: string | null;
};

export type ActorForActions = {
  role: Role;
  office: { id: string; can_assign_pr_no: boolean; can_set_mode_of_procurement: boolean; can_complete: boolean } | null;
};

/** UI mirror of the DB rules (DB remains the authority). */
export function availableActions(pr: PrForActions, actor: ActorForActions): Set<PrAction> {
  const a = new Set<PrAction>();
  const terminal = pr.movement_state === "completed" || pr.movement_state === "cancelled";
  if (!terminal && actor.role !== "staff") a.add("cancel");
  const office = actor.office;
  if (!office) return a;

  const isOrigin = pr.origin_office_id === office.id;
  const receivedHere = pr.movement_state === "received" && pr.current_office_id === office.id;
  const draftHere = pr.movement_state === "draft" && isOrigin;
  const holds = receivedHere || draftHere;
  const pending = pr.movement_state === "in_transit" || pr.movement_state === "returned";

  if (draftHere || (receivedHere && isOrigin)) { a.add("edit"); a.add("cancel"); }
  if (holds) { a.add("forward"); a.add("add_private_note"); }
  if (holds || isOrigin) { a.add("add_remark"); a.add("add_attachment"); }
  if (pending && pr.current_office_id === office.id) a.add("receive");
  if (pending && pr.sent_by_office_id === office.id) a.add("recall");
  if (receivedHere) {
    a.add("return");
    a.add("set_status");
    if (office.can_assign_pr_no) a.add("assign_pr_no");
    if (office.can_set_mode_of_procurement) a.add("set_mode");
    if (office.can_complete) a.add("complete");
  }
  return a;
}
```

`lib/pr/timeline.ts`:
```ts
import type { EventType } from "../types";

export type TimelineEvent = {
  event_type: EventType;
  actor_name: string;
  actor_office_name: string | null;
  from_office_name: string | null;
  to_office_name: string | null;
  status_label: string | null;
  override_reason: string | null;
  remark: string | null;
  to_route_step: number | null;
  route_purpose: string | null;
  payload: Record<string, unknown>;
};

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function describeEvent(e: TimelineEvent, totalSteps: number): string {
  const who = e.actor_office_name ? `${e.actor_name} (${e.actor_office_name})` : e.actor_name;
  switch (e.event_type) {
    case "created": return `Created by ${who}`;
    case "edited": return e.payload.before ? `Edited by ${who} after return` : `Edited by ${who}`;
    case "forwarded": {
      const base = e.route_purpose && e.to_route_step
        ? `Forwarded to ${e.to_office_name} ${lcFirst(e.route_purpose)} (step ${e.to_route_step} of ${totalSteps})`
        : `Forwarded to ${e.to_office_name} outside the default route`;
      return e.override_reason ? `${base}. Reason: ${e.override_reason}` : base;
    }
    case "received": return `Received by ${who}`;
    case "returned": return `Returned to ${e.to_office_name}. Reason: ${str(e.remark)}`;
    case "recalled": return `Recalled from ${e.from_office_name} by ${who}`;
    case "status_changed": return `Status set to "${str(e.status_label)}"`;
    case "remark_added": return `Remark: ${str(e.remark)}`;
    case "private_note_added": return "Private note added";
    case "attachment_added": return `Attached ${str(e.payload.filename)}`;
    case "attachment_superseded": return `Marked ${str(e.payload.filename)} as superseded. Reason: ${str(e.remark)}`;
    case "pr_no_assigned":
      return e.payload.old ? `PR No. changed from ${str(e.payload.old)} to ${str(e.payload.new)}` : `PR No. ${str(e.payload.new)} assigned`;
    case "mode_set": return `Mode of procurement set to ${str(e.payload.new)}`;
    case "completed": return "Completed";
    case "cancelled": return `Cancelled. Reason: ${str(e.remark)}`;
    case "followed": return `${e.actor_office_name ?? e.actor_name} followed this PR`;
    case "unfollowed": return `${e.actor_office_name ?? e.actor_name} unfollowed this PR`;
  }
}

type SnapItem = { line_no: number; stock_no: string | null; unit: string; description: string; quantity: number; unit_cost: number };
export type Snapshot = { header: Record<string, unknown>; items: SnapItem[] };

const HEADER_LABELS: Record<string, string> = {
  pr_date: "Date", purpose: "Purpose", responsibility_center_code: "Responsibility center code",
  fund_cluster: "Fund cluster", requested_by_name: "Requested by", requested_by_designation: "Requested by designation",
  approved_by_name: "Approved by", approved_by_designation: "Approved by designation", grand_total: "Grand total",
};
const ITEM_FIELDS: (keyof SnapItem)[] = ["stock_no", "unit", "description", "quantity", "unit_cost"];
const ITEM_LABELS: Record<string, string> = {
  stock_no: "stock no.", unit: "unit", description: "description", quantity: "quantity", unit_cost: "unit cost",
};

export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  for (const key of Object.keys(HEADER_LABELS)) {
    const a = str(before.header[key]);
    const b = str(after.header[key]);
    if (a !== b) out.push(`${HEADER_LABELS[key]}: "${a}" → "${b}"`);
  }
  const lines = [...new Set([...before.items, ...after.items].map((i) => i.line_no))].sort((x, y) => x - y);
  for (const n of lines) {
    const a = before.items.find((i) => i.line_no === n);
    const b = after.items.find((i) => i.line_no === n);
    if (!a && b) { out.push(`Line ${n} added: ${b.description}`); continue; }
    if (a && !b) { out.push(`Line ${n} removed: ${a.description}`); continue; }
    for (const f of ITEM_FIELDS) {
      if (str(a![f]) !== str(b![f])) out.push(`Line ${n} ${ITEM_LABELS[f]}: ${str(a![f])} → ${str(b![f])}`);
    }
  }
  return out;
}

export type NotificationRow = { type: EventType; actor_office_name: string | null; routing_slip_no: string };

export function notificationText(n: NotificationRow): string {
  const who = n.actor_office_name ?? "An administrator";
  const rs = n.routing_slip_no;
  switch (n.type) {
    case "forwarded": return `${who} forwarded ${rs} to your office`;
    case "returned": return `${who} returned ${rs} to your office`;
    case "received": return `${who} received ${rs}`;
    case "recalled": return `${who} recalled ${rs}`;
    case "status_changed": return `${who} updated the status of ${rs}`;
    case "remark_added": return `${who} added a remark on ${rs}`;
    case "attachment_added": return `${who} attached a file to ${rs}`;
    case "completed": return `${rs} was completed`;
    case "cancelled": return `${rs} was cancelled`;
    default: return `${rs} was updated`;
  }
}
```

`lib/pr/routing-slip.ts`:
```ts
export type SlipStep = { step_order: number; office_name: string; purpose: string };
export type SlipRow = { label: string; purpose: string | null };

export function buildSlipRows(steps: SlipStep[], blankRows = 2): SlipRow[] {
  const ordered = [...steps].sort((a, b) => a.step_order - b.step_order);
  return [
    ...ordered.map((s) => ({ label: s.office_name, purpose: s.purpose })),
    ...Array.from({ length: blankRows }, () => ({ label: "", purpose: null })),
  ];
}

export function trackUrl(appUrl: string, rs: string): string {
  return `${appUrl.replace(/\/+$/, "")}/track/${encodeURIComponent(rs)}`;
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
```

`lib/pr/files.ts`:
```ts
export const ALLOWED_MIME_TYPES = [
  "application/pdf", "image/jpeg", "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export function safeFileName(name: string): string {
  // Drop directory parts (including "." / ".." segments) so paths cannot be smuggled in.
  const base = name.split(/[\\/]/).filter((p) => p && !/^\.+$/.test(p)).join("_");
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  const ext = dot > 0 ? base.slice(dot).replace(/[^A-Za-z0-9.]/g, "") : "";
  return `${(stem || "file").slice(0, 100 - ext.length)}${ext}`;
}

export function validateFile(f: { name: string; size: number; type: string }, maxMb: number): string | null {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(f.type)) return "File type not allowed. Use PDF, JPG, PNG, DOCX or XLSX.";
  if (f.size <= 0) return "File is empty.";
  if (f.size > maxMb * 1024 * 1024) return `File is larger than ${maxMb} MB.`;
  return null;
}
```

`lib/csv.ts`:
```ts
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  const head = columns.map((c) => cell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(","));
  return [head, ...body].join("\r\n");
}
```

`lib/search.ts`:
```ts
export const RS_PATTERN = /^RS-\d{4}-\d{2}-\d{5}$/i;

export function searchTarget(q: string): string | null {
  const t = q.trim();
  if (!t) return null;
  if (RS_PATTERN.test(t)) return `/track/${t.toUpperCase()}`;
  return `/prs?q=${encodeURIComponent(t)}`;
}

const SORTABLE = ["created_at", "routing_slip_no", "pr_no", "grand_total", "pr_date", "days_here", "current_since"] as const;
const STATES = ["draft", "in_transit", "received", "returned", "completed", "cancelled"];
const SIZES = [10, 25, 50, 100];

export type ListParams = {
  page: number; size: number; sort: (typeof SORTABLE)[number]; dir: "asc" | "desc";
  q: string; state: string; office: string; from: string; to: string; min: string; max: string;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isNum = (s: string) => /^\d+(\.\d+)?$/.test(s);
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export function parseListParams(sp: Record<string, string | string[] | undefined>): ListParams {
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  const sizeRaw = parseInt(one(sp.size), 10);
  const [sortCol, sortDir] = one(sp.sort).split(".");
  const sort = (SORTABLE as readonly string[]).includes(sortCol) ? (sortCol as ListParams["sort"]) : "created_at";
  return {
    page,
    size: SIZES.includes(sizeRaw) ? sizeRaw : 25,
    sort,
    dir: sortCol === sort && sortDir === "asc" ? "asc" : "desc",
    q: one(sp.q).trim().slice(0, 100),
    state: STATES.includes(one(sp.state)) ? one(sp.state) : "",
    office: isUuid(one(sp.office)) ? one(sp.office) : "",
    from: isDate(one(sp.from)) ? one(sp.from) : "",
    to: isDate(one(sp.to)) ? one(sp.to) : "",
    min: isNum(one(sp.min)) ? one(sp.min) : "",
    max: isNum(one(sp.max)) ? one(sp.max) : "",
  };
}
```

`lib/auth/safe-next.ts`:
```ts
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all 9 test files pass. If `formatPeso` prints `PHP 2,695.00` on your Node ICU build, change the test expectation to match `/₱|PHP/` and keep the function as is.

- [ ] **Step 5: Commit**

```bash
git add lib
git commit -m "feat(lib): domain types, formatting, PR schema, permissions, timeline text, files, csv, search"
```

---

### Task 14: Supabase clients, auth proxy, sign-in and sign-out flows

**Files:**
- Create:
  - `lib/supabase/database.types.ts` (generated)
  - `lib/supabase/server.ts`, `lib/supabase/client.ts`
  - `lib/auth/profile.ts`
  - `proxy.ts`
  - `app/auth/callback/route.ts`, `app/auth/signout/route.ts`
  - `app/login/page.tsx`, `app/login/google-button.tsx`
  - `app/dev-login/page.tsx`, `app/dev-login/dev-login-form.tsx`
  - `app/not-authorized/page.tsx`

**Interfaces:**
- Consumes: `get_my_profile`, `link_my_profile` (Task 6), `safeNext` (Task 13), the `Profile` type.
- Produces:
  - `createClient(): Promise<SupabaseClient<Database, "pr_tracker">>` (server)
  - `createBrowserSupabase(): SupabaseClient<Database, "pr_tracker">` (client)
  - `getCurrentProfile(): Promise<Profile | null>` (React `cache`d)
  - `requireProfile(): Promise<Profile>`
  - `requireAdmin(): Promise<Profile>`
  - Routes: `/login`, `/dev-login`, `/not-authorized`, `/auth/callback`, `/auth/signout?to=`

- [ ] **Step 1: Generate DB types**

Run: `supabase db reset && pnpm db:types`
Expected: `lib/supabase/database.types.ts` exists and contains `pr_tracker: {` with `Functions: { forward_pr: …`.

- [ ] **Step 2: Write the Supabase clients**

`lib/supabase/server.ts`:
```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database, "pr_tracker">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "pr_tracker" },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; proxy.ts refreshes the session cookie.
          }
        },
      },
    },
  );
}
```

`lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createBrowserSupabase() {
  return createBrowserClient<Database, "pr_tracker">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "pr_tracker" } },
  );
}
```

If `tsc` complains about the second generic argument, check the installed `@supabase/ssr` signature (`node_modules/@supabase/ssr/dist/main/createServerClient.d.ts`) and match its generic order. The schema **must** remain `pr_tracker`.

- [ ] **Step 3: Write `lib/auth/profile.ts`**

```ts
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error || !data) return null;
  return data as unknown as Profile;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/signout?to=/not-authorized");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role === "staff") redirect("/");
  return profile;
}
```

- [ ] **Step 4: Write `proxy.ts`** (Next 16 renamed `middleware` to `proxy`)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PREFIXES = ["/login", "/dev-login", "/auth", "/not-authorized"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
```

- [ ] **Step 5: Write the auth routes**

`app/auth/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?error=session`);

  const { data: profile } = await supabase.rpc("link_my_profile");
  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/not-authorized`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
```

`app/auth/signout/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut();
  const to = searchParams.get("to");
  return NextResponse.redirect(`${origin}${to ? safeNext(to) : "/login"}`);
}
```

- [ ] **Step 6: Write the pages**

`app/login/google-button.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";

export function GoogleButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  async function signIn() {
    setPending(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }
  return (
    <Button size="lg" className="w-full" onClick={signIn} disabled={pending}>
      {pending ? "Redirecting…" : "Sign in with Google"}
    </Button>
  );
}
```

`app/login/page.tsx`:
```tsx
import { GoogleButton } from "./google-button";
import { safeNext } from "@/lib/auth/safe-next";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">PR Tracker</h1>
          <p className="text-sm text-muted-foreground">Purchase Request document tracking</p>
        </div>
        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Sign-in failed. Please try again.</p>}
        <GoogleButton next={safeNext(next)} />
        <p className="text-center text-xs text-muted-foreground">Only accounts registered by an administrator can sign in.</p>
      </div>
    </main>
  );
}
```

`app/not-authorized/page.tsx`:
```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-6">
      <div className="max-w-sm space-y-4 rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Account not authorized</h1>
        <p className="text-sm text-muted-foreground">Your account is not authorized. Please contact the administrator.</p>
        <Button asChild variant="outline"><Link href="/login">Back to sign in</Link></Button>
      </div>
    </main>
  );
}
```

`app/dev-login/dev-login-form.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/client";

export function DevLoginForm() {
  const [email, setEmail] = useState("cswd@test.local");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
    if (error) return setError(error.message);
    window.location.href = "/auth/callback";
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Label htmlFor="email">Email</Label>
      <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Label htmlFor="password">Password</Label>
      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">Dev sign in</Button>
    </form>
  );
}
```

`app/dev-login/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { DevLoginForm } from "./dev-login-form";

export default function DevLoginPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true") notFound();
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border p-8">
        <h1 className="font-semibold">Developer sign-in (local only)</h1>
        <DevLoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Verify manually**

Run: `pnpm dev`. Then:
1. Open `http://localhost:3000/`. Expected: a redirect to `/login?next=%2F`.
2. Open `/dev-login` and sign in as `cswd@test.local`. Expected: a redirect to `/`. This 404s until Task 16 creates `(app)/page.tsx`, which is fine for now.
3. In Supabase Studio (`http://127.0.0.1:54323`), run `update pr_tracker.profiles set active=false where email='gso@test.local'`. Sign in as gso. Expected: you land on `/not-authorized`. Then set it back to `true`.

Run: `pnpm build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): supabase clients, proxy session guard, Google + dev sign-in, allowlist callback"
```

---

### Task 15: Shared UI building blocks (RPC action helper, ConfirmActionDialog, DataTable, MovementBadge)

**Files:**
- Create:
  - `lib/actions/rpc.ts`
  - `components/confirm-action-dialog.tsx`
  - `components/data-table/data-table.tsx`, `components/data-table/column-header.tsx`
  - `components/pr/movement-badge.tsx`

**Interfaces:**
- Produces:
  - `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`
  - `rpcAction<T>(fn: string, args: Record<string, unknown>, revalidate?: string[]): Promise<ActionResult<T>>` (server only)
  - `<ConfirmActionDialog trigger? open? onOpenChange? title description confirmLabel? destructive? canConfirm? successMessage? onConfirm onSuccess? children? />`
  - `<DataTable columns data searchPlaceholder? emptyMessage? getRowClassName? server?={rowCount, pageIndex, pageSize} />`. In server mode the table reads and writes the URL params `page`, `size`, `sort`, `q`.
  - `<DataTableColumnHeader column title />`
  - `<MovementBadge state />`

- [ ] **Step 1: Write `lib/actions/rpc.ts`**

```ts
import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export async function rpcAction<T = null>(
  fn: string,
  args: Record<string, unknown>,
  revalidate: string[] = [],
): Promise<ActionResult<T>> {
  const supabase = await createClient();
  // Function names are checked by the DB; generated types are bypassed here to keep one generic helper.
  const { data, error } = await (supabase.rpc as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
  if (error) return { ok: false, error: error.message };
  revalidate.forEach((p) => revalidatePath(p));
  return { ok: true, data: (data ?? null) as T };
}
```

- [ ] **Step 2: Write `components/confirm-action-dialog.tsx`**

```tsx
"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/actions/rpc";

type Props<T> = {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  canConfirm?: boolean;
  successMessage?: string;
  onConfirm: () => Promise<ActionResult<T>>;
  onSuccess?: (data: T) => void;
  children?: ReactNode;
};

export function ConfirmActionDialog<T>({
  trigger, open: openProp, onOpenChange, title, description, confirmLabel = "Confirm",
  destructive, canConfirm = true, successMessage = "Done", onConfirm, onSuccess, children,
}: Props<T>) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => { setOpenState(o); onOpenChange?.(o); };
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        toast.error(result.error);
        router.refresh();
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      onSuccess?.(result.data);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild><div>{description}</div></DialogDescription>
        </DialogHeader>
        {children && <div className="space-y-3">{children}</div>}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending || !canConfirm} onClick={confirm}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write `components/data-table/column-header.tsx`**

```tsx
"use client";
import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DataTableColumnHeader<TData, TValue>({ column, title }: { column: Column<TData, TValue>; title: string }) {
  if (!column.getCanSort()) return <span>{title}</span>;
  const dir = column.getIsSorted();
  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(dir === "asc")}>
      {title}
      {dir === "asc" ? <ArrowUp className="ml-1 size-3.5" /> : dir === "desc" ? <ArrowDown className="ml-1 size-3.5" /> : <ChevronsUpDown className="ml-1 size-3.5 opacity-50" />}
    </Button>
  );
}
```

- [ ] **Step 4: Write `components/data-table/data-table.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ServerMode = { rowCount: number; pageIndex: number; pageSize: number };

type Props<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  getRowClassName?: (row: TData) => string | undefined;
  server?: ServerMode;
  toolbar?: React.ReactNode;
};

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder = "Search…", emptyMessage = "No records.", getRowClassName, server, toolbar,
}: Props<TData, TValue>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const initialSort = params.get("sort")?.split(".");
  const [sorting, setSorting] = useState<SortingState>(
    server && initialSort?.[0] ? [{ id: initialSort[0], desc: initialSort[1] !== "asc" }] : [],
  );
  const [globalFilter, setGlobalFilter] = useState(server ? params.get("q") ?? "" : "");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  function pushParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  // Server mode: debounce search into the URL.
  useEffect(() => {
    if (!server) return;
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== globalFilter) pushParams({ q: globalFilter || null, page: null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilter]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting, globalFilter, columnVisibility,
      ...(server ? { pagination: { pageIndex: server.pageIndex, pageSize: server.pageSize } } : {}),
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      if (server) pushParams({ sort: next[0] ? `${next[0].id}.${next[0].desc ? "desc" : "asc"}` : null, page: null });
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    ...(server
      ? { manualPagination: true, manualSorting: true, manualFiltering: true, rowCount: server.rowCount }
      : { getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel() }),
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = Math.max(1, table.getPageCount());
  const go = (index: number) => (server ? pushParams({ page: String(index + 1) }) : table.setPageIndex(index));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={searchPlaceholder} value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-9 w-full sm:w-64" />
        {toolbar}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-9"><Settings2 className="mr-2 size-4" />Columns</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllColumns().filter((c) => c.getCanHide()).map((c) => (
              <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} className="capitalize">
                {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id.replaceAll("_", " ")}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={getRowClassName?.(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length} className="h-20 text-center text-muted-foreground">{emptyMessage}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{server ? server.rowCount : table.getFilteredRowModel().rows.length} record(s)</span>
        <div className="flex items-center gap-2">
          <span>Page {pageIndex + 1} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => go(pageIndex - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={pageIndex + 1 >= pageCount} onClick={() => go(pageIndex + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `components/pr/movement-badge.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { MOVEMENT_LABELS } from "@/lib/format";
import type { MovementState } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<MovementState, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  in_transit: "bg-amber-100 text-amber-800 border-amber-200",
  received: "bg-blue-100 text-blue-800 border-blue-200",
  returned: "bg-orange-100 text-orange-800 border-orange-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
};

export function MovementBadge({ state }: { state: MovementState }) {
  return <Badge variant="outline" className={cn("font-medium", STYLES[state])}>{MOVEMENT_LABELS[state]}</Badge>;
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

```bash
git add -A
git commit -m "feat(ui): rpc action helper, confirm dialog, data table, movement badge"
```

---

### Task 16: Design system and app shell (dark sidebar, top bar, global search)

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`
- Create:
  - `app/(app)/layout.tsx`, `app/(app)/page.tsx` (temporary placeholder, replaced in Task 22)
  - `components/app-sidebar.tsx`, `components/topbar.tsx`, `components/global-search.tsx`

**Interfaces:**
- Consumes: `requireProfile` (Task 14), `searchTarget` (Task 13), shadcn `sidebar`.
- Produces:
  - `<AppSidebar profile />`
  - `<Topbar profile bell? />`. The `bell` slot is filled in Task 21.
  - The design tokens in `globals.css`.

- [ ] **Step 1: Run the ui-ux-pro-max skill for the design system**

Invoke the `ui-ux-pro-max:ui-ux-pro-max` skill with this request: *"Design system for a government (LGU) document-tracking web app: data-dense dashboards and tables, dark navy sidebar, light content area, shadcn/ui + Tailwind v4, accessible contrast, status colours for draft / in transit / received / returned / completed / cancelled."*

Apply its recommended palette, font pairing and spacing to the token block in Step 2:
- Keep the variable **names** exactly as shadcn generates them.
- Keep the movement-state colours readable. The Task 15 badge classes may be updated to match.
- If the skill recommends a font other than Inter, load it with `next/font/google` in Step 3 instead.

- [ ] **Step 2: Set the tokens in `app/globals.css`**

Replace the generated `:root` sidebar and primary variables. Keep the rest of the shadcn-generated file. Use the skill's values, or these defaults if the skill gives none:

```css
:root {
  --radius: 0.5rem;
  --background: oklch(0.985 0.002 250);
  --foreground: oklch(0.21 0.03 264);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.21 0.03 264);
  --primary: oklch(0.49 0.17 258);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.96 0.005 250);
  --muted-foreground: oklch(0.5 0.02 260);
  --border: oklch(0.91 0.008 250);
  --ring: oklch(0.49 0.17 258);

  /* Dark sidebar */
  --sidebar: oklch(0.2 0.035 264);
  --sidebar-foreground: oklch(0.9 0.012 260);
  --sidebar-primary: oklch(0.62 0.17 255);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.27 0.04 264);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.27 0.04 264);
  --sidebar-ring: oklch(0.62 0.17 255);
}

@media print {
  @page { margin: 0; }
}
```

- [ ] **Step 3: Update `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: "PR Tracker", description: "LGU Purchase Request document tracker" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Write `components/app-sidebar.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Building2, FilePlus2, FileText, LayoutDashboard, ListChecks, QrCode, Route, Settings, Users,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Profile } from "@/lib/types";

const MAIN = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prs", label: "Purchase Requests", icon: FileText },
  { href: "/prs/new", label: "New PR", icon: FilePlus2, needsOffice: true },
  { href: "/track", label: "Track", icon: QrCode },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];
const ADMIN = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/offices", label: "Offices", icon: Building2 },
  { href: "/admin/route", label: "Default Route", icon: Route },
  { href: "/admin/statuses", label: "Office Statuses", icon: ListChecks },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const main = MAIN.filter((i) => !i.needsOffice || profile.office);

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="text-base font-semibold text-sidebar-primary-foreground">PR Tracker</div>
        <div className="text-xs text-sidebar-foreground/70">{profile.office?.name ?? "Administration"}</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((i) => (
                <SidebarMenuItem key={i.href}>
                  <SidebarMenuButton asChild isActive={isActive(i.href) && !(i.href === "/prs" && pathname === "/prs/new")}>
                    <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {profile.role !== "staff" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN.map((i) => (
                  <SidebarMenuItem key={i.href}>
                    <SidebarMenuButton asChild isActive={isActive(i.href)}>
                      <Link href={i.href}><i.icon /><span>{i.label}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="px-4 py-3 text-xs text-sidebar-foreground/60">{profile.email}</SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 5: Write `components/global-search.tsx` and `components/topbar.tsx`**

`components/global-search.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchTarget } from "@/lib/search";

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();
  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => { e.preventDefault(); const t = searchTarget(q); if (t) router.push(t); }}
    >
      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input aria-label="Search by routing slip, PR No. or purpose" placeholder="Search RS No., PR No., purpose…"
             className="h-9 pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}
```

`components/topbar.tsx`:
```tsx
import Link from "next/link";
import { LogOut } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./global-search";
import type { Profile } from "@/lib/types";

export function Topbar({ profile, bell }: { profile: Profile; bell?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        {bell}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="max-w-48 truncate">{profile.full_name}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="font-medium">{profile.full_name}</div>
              <div className="text-xs text-muted-foreground">{profile.office?.name ?? profile.role.replace("_", " ")}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/auth/signout"><LogOut className="mr-2 size-4" />Sign out</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```

- [ ] **Step 6: Write `app/(app)/layout.tsx` and a placeholder dashboard**

`app/(app)/layout.tsx`:
```tsx
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { requireProfile } from "@/lib/auth/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <SidebarProvider>
      <AppSidebar profile={profile} />
      <SidebarInset>
        <Topbar profile={profile} />
        <main className="flex-1 space-y-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

`app/(app)/page.tsx` (placeholder):
```tsx
export default function DashboardPage() {
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
```

- [ ] **Step 7: Verify manually**

Run: `pnpm dev`. Dev sign in as `cswd@test.local`. Check:
- A dark navy sidebar with Dashboard / Purchase Requests / New PR / Track / Reports, and no Admin group.
- Sign out returns to `/login`.
- Dev sign in as `admin@test.local`. The Admin group is visible and "New PR" is hidden (no office).
- Narrow the window below 768px: the sidebar collapses into a sheet opened by the trigger.

Run: `pnpm build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): design tokens, dark sidebar app shell, top bar with global search"
```

---

### Task 17: PR create and edit form

**Files:**
- Create:
  - `lib/supabase/rows.ts`
  - `components/pr/pr-form.tsx`
  - `app/(app)/prs/actions.ts`
  - `app/(app)/prs/new/page.tsx`
  - `app/(app)/prs/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `prFormSchema`, `grandTotal`, `lineTotal`, `toRpcPayload` (Task 13); `ConfirmActionDialog`, `rpcAction` (Task 15); `create_pr`, `update_pr_content` (Task 7).
- Produces:
  - Row types `PrOverviewRow`, `TimelineRow`, `NotificationViewRow`, `LineItemRow`, `OfficeRow`, `ProfileRow`, `OfficeStatusRow`, `RouteStepRow`
  - `createPr(values: PrFormValues): Promise<ActionResult<string>>`
  - `updatePr(prId: string, values: PrFormValues): Promise<ActionResult<null>>`
  - `<PrForm mode prId? defaultValues />` (uses `EMPTY_ITEM` from `lib/pr/schema.ts`)

- [ ] **Step 1: Write `lib/supabase/rows.ts`**

```ts
import type { Database } from "./database.types";

type S = Database["pr_tracker"];
export type PrOverviewRow = S["Views"]["pr_overview"]["Row"];
export type TimelineRow = S["Views"]["pr_timeline"]["Row"];
export type NotificationViewRow = S["Views"]["my_notifications"]["Row"];
export type FollowedActivityRow = S["Views"]["followed_activity"]["Row"];
export type LineItemRow = S["Tables"]["pr_line_items"]["Row"];
export type OfficeRow = S["Tables"]["offices"]["Row"];
export type ProfileRow = S["Tables"]["profiles"]["Row"];
export type OfficeStatusRow = S["Tables"]["office_statuses"]["Row"];
export type RouteStepRow = S["Tables"]["default_route_steps"]["Row"];
```

- [ ] **Step 2: Write `app/(app)/prs/actions.ts`**

```ts
"use server";
import { prFormSchema, toRpcPayload, type PrFormValues } from "@/lib/pr/schema";
import { rpcAction, type ActionResult } from "@/lib/actions/rpc";

export async function createPr(values: PrFormValues): Promise<ActionResult<string>> {
  const parsed = prFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form" };
  const { header, items } = toRpcPayload(parsed.data);
  return rpcAction<string>("create_pr", { p_header: header, p_items: items }, ["/", "/prs"]);
}

export async function updatePr(prId: string, values: PrFormValues): Promise<ActionResult<null>> {
  const parsed = prFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form" };
  const { header, items } = toRpcPayload(parsed.data);
  return rpcAction("update_pr_content", { p_pr_id: prId, p_header: header, p_items: items }, [`/prs/${prId}`, "/prs"]);
}
```

- [ ] **Step 3: Write `components/pr/pr-form.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { formatPeso } from "@/lib/format";
import { EMPTY_ITEM, grandTotal, lineTotal, prFormSchema, type PrFormValues } from "@/lib/pr/schema";
import { createPr, updatePr } from "@/app/(app)/prs/actions";

const HEADER_FIELDS: { name: keyof PrFormValues; label: string; type?: string }[] = [
  { name: "pr_date", label: "Date", type: "date" },
  { name: "responsibility_center_code", label: "Responsibility Center Code" },
  { name: "fund_cluster", label: "Fund Cluster" },
  { name: "requested_by_name", label: "Requested by (name)" },
  { name: "requested_by_designation", label: "Requested by (designation)" },
  { name: "approved_by_name", label: "Approved by (name)" },
  { name: "approved_by_designation", label: "Approved by (designation)" },
];

export function PrForm({ mode, prId, defaultValues }: { mode: "create" | "edit"; prId?: string; defaultValues: PrFormValues }) {
  const router = useRouter();
  const [pending, setPending] = useState<PrFormValues | null>(null);
  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<PrFormValues>({
    resolver: zodResolver(prFormSchema),
    defaultValues,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const total = grandTotal(items.map((i) => ({ quantity: Number(i.quantity) || 0, unit_cost: Number(i.unit_cost) || 0 })));

  return (
    <>
      <form onSubmit={handleSubmit((v) => setPending(v))} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Purchase Request</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {HEADER_FIELDS.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input id={f.name} type={f.type ?? "text"} {...register(f.name)} />
                {errors[f.name] && <p className="text-xs text-destructive">{String(errors[f.name]?.message)}</p>}
              </div>
            ))}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Textarea id="purpose" rows={2} {...register("purpose")} />
              {errors.purpose && <p className="text-xs text-destructive">{errors.purpose.message}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line items</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => append(EMPTY_ITEM)}><Plus className="mr-1 size-4" />Add line</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {errors.items?.root && <p className="text-sm text-destructive">{errors.items.root.message}</p>}
            {errors.items?.message && <p className="text-sm text-destructive">{errors.items.message}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="w-10 p-1">#</th><th className="w-28 p-1">Stock/Prop. No.</th><th className="w-24 p-1">Unit</th>
                      <th className="p-1">Item description</th><th className="w-24 p-1">Qty</th><th className="w-32 p-1">Unit cost</th>
                      <th className="w-32 p-1 text-right">Total</th><th className="w-10 p-1" /></tr>
                </thead>
                <tbody>
                  {fields.map((field, i) => (
                    <tr key={field.id} className="align-top">
                      <td className="p-1 pt-3">{i + 1}</td>
                      <td className="p-1"><Input aria-label={`Line ${i + 1} stock no`} {...register(`items.${i}.stock_no`)} /></td>
                      <td className="p-1"><Input aria-label={`Line ${i + 1} unit`} {...register(`items.${i}.unit`)} /></td>
                      <td className="p-1"><Input aria-label={`Line ${i + 1} description`} {...register(`items.${i}.description`)} /></td>
                      <td className="p-1"><Input aria-label={`Line ${i + 1} quantity`} type="number" step="0.01" min="0" {...register(`items.${i}.quantity`, { valueAsNumber: true })} /></td>
                      <td className="p-1"><Input aria-label={`Line ${i + 1} unit cost`} type="number" step="0.01" min="0" {...register(`items.${i}.unit_cost`, { valueAsNumber: true })} /></td>
                      <td className="p-1 pt-3 text-right tabular-nums">{formatPeso(lineTotal(Number(items[i]?.quantity) || 0, Number(items[i]?.unit_cost) || 0))}</td>
                      <td className="p-1"><Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} onClick={() => remove(i)} disabled={fields.length === 1}><Trash2 className="size-4" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errors.items && Array.isArray(errors.items) && (
              <ul className="text-xs text-destructive">
                {errors.items.map((e, i) => e && Object.values(e).map((fe) => (
                  <li key={`${i}-${String((fe as { message?: string })?.message)}`}>Line {i + 1}: {(fe as { message?: string })?.message}</li>
                )))}
              </ul>
            )}
            <div className="flex justify-end text-base font-semibold">Grand total: <span className="ml-2 tabular-nums">{formatPeso(total)}</span></div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Back</Button>
          <Button type="submit">{mode === "create" ? "Create PR" : "Save changes"}</Button>
        </div>
      </form>

      <ConfirmActionDialog<string | null>
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={mode === "create" ? "Create this purchase request?" : "Save changes to this purchase request?"}
        description={
          <p>{pending?.items.length ?? 0} line item(s) totalling <b>{formatPeso(total)}</b>.{" "}
            {mode === "create" ? "It will be saved as a Draft at your office. You can forward it afterwards." : "The change is recorded in the audit trail."}</p>
        }
        confirmLabel={mode === "create" ? "Create PR" : "Save changes"}
        successMessage={mode === "create" ? "Purchase request created" : "Changes saved"}
        onConfirm={() => (mode === "create" ? createPr(pending!) : updatePr(prId!, pending!))}
        onSuccess={(id) => router.push(`/prs/${mode === "create" ? id : prId}`)}
      />
    </>
  );
}
```

- [ ] **Step 4: Write the pages**

`app/(app)/prs/new/page.tsx`:
```tsx
import { requireProfile } from "@/lib/auth/profile";
import { PrForm } from "@/components/pr/pr-form";
import { EMPTY_ITEM } from "@/lib/pr/schema";

export default async function NewPrPage() {
  const profile = await requireProfile();
  if (!profile.office) return <p className="text-muted-foreground">Your account is not assigned to an office, so it cannot create PRs.</p>;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New Purchase Request</h1>
      <p className="text-sm text-muted-foreground">Office/Section: {profile.office.name}</p>
      <PrForm mode="create" defaultValues={{
        pr_date: today, purpose: "", responsibility_center_code: "", fund_cluster: "",
        requested_by_name: profile.full_name, requested_by_designation: profile.designation ?? "",
        approved_by_name: "", approved_by_designation: "", items: [EMPTY_ITEM],
      }} />
    </div>
  );
}
```

`app/(app)/prs/[id]/edit/page.tsx`:
```tsx
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { availableActions } from "@/lib/pr/permissions";
import { PrForm } from "@/components/pr/pr-form";
import type { MovementState } from "@/lib/types";

export default async function EditPrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: pr }, { data: items }] = await Promise.all([
    supabase.from("purchase_requests").select("*").eq("id", id).maybeSingle(),
    supabase.from("pr_line_items").select("*").eq("pr_id", id).order("line_no"),
  ]);
  if (!pr) notFound();
  const actions = availableActions({ ...pr, movement_state: pr.movement_state as MovementState }, profile);
  if (!actions.has("edit")) redirect(`/prs/${id}`);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit {pr.routing_slip_no}</h1>
      <PrForm mode="edit" prId={id} defaultValues={{
        pr_date: pr.pr_date, purpose: pr.purpose,
        responsibility_center_code: pr.responsibility_center_code ?? "", fund_cluster: pr.fund_cluster ?? "",
        requested_by_name: pr.requested_by_name, requested_by_designation: pr.requested_by_designation ?? "",
        approved_by_name: pr.approved_by_name ?? "", approved_by_designation: pr.approved_by_designation ?? "",
        items: (items ?? []).map((i) => ({ stock_no: i.stock_no ?? "", unit: i.unit, description: i.description,
          quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) })),
      }} />
    </div>
  );
}
```

- [ ] **Step 5: Verify manually**

Run: `pnpm dev`. Dev sign in as `cswd@test.local`, open `/prs/new`, then:
1. Remove the description. Click **Create PR**. Expected: an inline error, and no modal opens.
2. Fill the form with two lines and click **Create PR**. Expected: the confirmation modal shows the line count and the total. Confirm. Expected: you are routed to `/prs/<id>`. That page 404s until Task 18, which is fine.
3. In Studio, `select routing_slip_no, grand_total from pr_tracker.purchase_requests` shows the new row.

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pr): create and edit purchase request form with confirmation"
```

---

### Task 18: PR detail page (header, details, timeline, remarks, private notes)

**Files:**
- Create:
  - `app/(app)/prs/[id]/page.tsx`
  - `components/pr/pr-header.tsx`, `components/pr/line-items-table.tsx`, `components/pr/pr-timeline.tsx`
  - `components/pr/remarks-panel.tsx`, `components/pr/private-notes-panel.tsx`
  - `app/(app)/prs/[id]/actions.ts` (initially only `addRemark`, `addPrivateNote`)

**Interfaces:**
- Consumes: the Task 10 views, Task 13 formatting/timeline, Task 15 components.
- Produces:
  - Server actions `addRemark(prId, body)` and `addPrivateNote(prId, body)`. Task 19 adds the rest to the same file.
  - `<PrHeader pr actions?>`, `<LineItemsTable items>`, `<PrTimeline events totalSteps>`, `<RemarksPanel prId remarks canAdd>`, `<PrivateNotesPanel prId notes canAdd>`
  - `<TextActionDialog trigger title description label required? multiline? confirmLabel destructive? initialValue? successMessage onConfirm(text)>` (in `components/pr/remarks-panel.tsx`, exported; reused by Task 19)

- [ ] **Step 1: Write `app/(app)/prs/[id]/actions.ts`** (first two actions)

```ts
"use server";
import { rpcAction } from "@/lib/actions/rpc";

const paths = (id: string) => [`/prs/${id}`, "/"];

export async function addRemark(prId: string, body: string) {
  return rpcAction("add_remark", { p_pr_id: prId, p_body: body }, paths(prId));
}

export async function addPrivateNote(prId: string, body: string) {
  return rpcAction("add_private_note", { p_pr_id: prId, p_body: body }, paths(prId));
}
```

- [ ] **Step 2: Write `components/pr/remarks-panel.tsx`** (includes the reusable `TextActionDialog`)

```tsx
"use client";
import { useState, type ReactNode } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import type { ActionResult } from "@/lib/actions/rpc";
import { formatDateTime } from "@/lib/format";
import { addRemark } from "@/app/(app)/prs/[id]/actions";

export function TextActionDialog({
  trigger, title, description, label, required = false, multiline = true, confirmLabel, destructive,
  initialValue = "", successMessage, onConfirm,
}: {
  trigger: ReactNode; title: string; description: ReactNode; label: string; required?: boolean; multiline?: boolean;
  confirmLabel: string; destructive?: boolean; initialValue?: string; successMessage: string;
  onConfirm: (text: string) => Promise<ActionResult<unknown>>;
}) {
  const [text, setText] = useState(initialValue);
  return (
    <ConfirmActionDialog
      trigger={trigger} title={title} description={description} confirmLabel={confirmLabel}
      destructive={destructive} successMessage={successMessage}
      canConfirm={!required || text.trim().length > 0}
      onOpenChange={(o) => o && setText(initialValue)}
      onConfirm={() => onConfirm(text.trim())}
    >
      <Label htmlFor="action-text">{label}{required ? "" : " (optional)"}</Label>
      {multiline
        ? <Textarea id="action-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        : <Input id="action-text" value={text} onChange={(e) => setText(e.target.value)} />}
    </ConfirmActionDialog>
  );
}

type Remark = { id: string; body: string; created_at: string; author: { full_name: string } | null; office: { name: string } | null };

export function RemarksPanel({ prId, remarks, canAdd }: { prId: string; remarks: Remark[]; canAdd: boolean }) {
  return (
    <div className="space-y-4">
      {canAdd && (
        <TextActionDialog
          trigger={<Button size="sm"><MessageSquarePlus className="mr-2 size-4" />Add remark</Button>}
          title="Add a remark?" description="Remarks are visible to every office involved in this PR, and followers are notified."
          label="Remark" required confirmLabel="Add remark" successMessage="Remark added"
          onConfirm={(t) => addRemark(prId, t)}
        />
      )}
      {remarks.length === 0 && <p className="text-sm text-muted-foreground">No remarks yet.</p>}
      <ul className="space-y-3">
        {remarks.map((r) => (
          <li key={r.id} className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">{r.author?.full_name} · {r.office?.name ?? "Admin"} · {formatDateTime(r.created_at)}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/pr/private-notes-panel.tsx`**

```tsx
"use client";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { TextActionDialog } from "./remarks-panel";
import { addPrivateNote } from "@/app/(app)/prs/[id]/actions";

type Note = { id: string; body: string; created_at: string; author: { full_name: string } | null };

export function PrivateNotesPanel({ prId, notes, canAdd }: { prId: string; notes: Note[]; canAdd: boolean }) {
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" />Only your office can see these notes.</p>
      {canAdd && (
        <TextActionDialog
          trigger={<Button size="sm" variant="outline">Add private note</Button>}
          title="Add a private note?" description="Only staff of your office will see this note."
          label="Note" required confirmLabel="Add note" successMessage="Note added"
          onConfirm={(t) => addPrivateNote(prId, t)}
        />
      )}
      {notes.length === 0 && <p className="text-sm text-muted-foreground">No private notes.</p>}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border border-dashed p-3">
            <div className="text-xs text-muted-foreground">{n.author?.full_name} · {formatDateTime(n.created_at)}</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Write `components/pr/line-items-table.tsx`**

```tsx
"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { formatPeso } from "@/lib/format";
import type { LineItemRow } from "@/lib/supabase/rows";

const columns: ColumnDef<LineItemRow>[] = [
  { accessorKey: "line_no", header: ({ column }) => <DataTableColumnHeader column={column} title="#" /> },
  { accessorKey: "stock_no", header: "Stock/Prop. No." },
  { accessorKey: "unit", header: "Unit" },
  { accessorKey: "description", header: "Item description" },
  { accessorKey: "quantity", header: ({ column }) => <DataTableColumnHeader column={column} title="Qty" />, cell: ({ row }) => Number(row.original.quantity).toLocaleString("en-PH") },
  { accessorKey: "unit_cost", header: "Unit cost", cell: ({ row }) => formatPeso(Number(row.original.unit_cost)) },
  { accessorKey: "total_cost", header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />, cell: ({ row }) => formatPeso(Number(row.original.total_cost)) },
];

export function LineItemsTable({ items }: { items: LineItemRow[] }) {
  return <DataTable columns={columns} data={items} searchPlaceholder="Filter items…" emptyMessage="No line items." />;
}
```

- [ ] **Step 5: Write `components/pr/pr-timeline.tsx`**

```tsx
import { describeEvent, diffSnapshots, type Snapshot, type TimelineEvent } from "@/lib/pr/timeline";
import { formatDateTime } from "@/lib/format";
import type { TimelineRow } from "@/lib/supabase/rows";

export function PrTimeline({ events, totalSteps }: { events: TimelineRow[]; totalSteps: number }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 border-l pl-6">
      {events.map((e) => {
        const ev = e as unknown as TimelineEvent;
        const payload = (e.payload ?? {}) as { before?: Snapshot; after?: Snapshot };
        const diff = e.event_type === "edited" && payload.before && payload.after ? diffSnapshots(payload.before, payload.after) : [];
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[29px] top-1.5 size-3 rounded-full border-2 border-background bg-primary" />
            <div className="text-sm font-medium">{describeEvent(ev, totalSteps)}</div>
            <div className="text-xs text-muted-foreground">{e.actor_name}{e.actor_office_name ? ` · ${e.actor_office_name}` : ""} · {formatDateTime(e.created_at!)}</div>
            {e.event_type === "forwarded" && e.remark && <p className="mt-1 text-sm">Remark: {e.remark}</p>}
            {diff.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{diff.map((d) => <li key={d}>{d}</li>)}</ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 6: Write `components/pr/pr-header.tsx`**

```tsx
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MovementBadge } from "./movement-badge";
import { formatDate, formatPeso, locationLine } from "@/lib/format";
import type { PrOverviewRow } from "@/lib/supabase/rows";
import type { MovementState } from "@/lib/types";

export function PrHeader({ pr, actions }: { pr: PrOverviewRow; actions?: React.ReactNode }) {
  const state = pr.movement_state as MovementState;
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Routing Slip No.</div>
            <h1 className="font-mono text-2xl font-semibold">{pr.routing_slip_no}</h1>
            <div className="mt-1 text-sm text-muted-foreground">PR No.: <span className="font-medium text-foreground">{pr.pr_no ?? "Not yet assigned"}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <MovementBadge state={state} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/print/slip/${pr.id}`} target="_blank"><Printer className="mr-2 size-4" />Print routing slip</Link>
            </Button>
          </div>
        </div>
        <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium" data-testid="location-line">
          {locationLine({
            movement_state: state, current_office_name: pr.current_office_name!, current_status_label: pr.current_status_label,
            current_purpose: pr.current_purpose, current_since: pr.current_since!, route_step: pr.route_step!, total_steps: pr.total_steps!,
          })}
        </p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-muted-foreground">Origin</dt><dd className="font-medium">{pr.origin_office_name}</dd></div>
          <div><dt className="text-muted-foreground">Date</dt><dd className="font-medium">{formatDate(pr.pr_date!)}</dd></div>
          <div><dt className="text-muted-foreground">Grand total</dt><dd className="font-medium tabular-nums">{formatPeso(Number(pr.grand_total))}</dd></div>
          <div><dt className="text-muted-foreground">Mode of procurement</dt><dd className="font-medium">{pr.mode_of_procurement ?? "—"}</dd></div>
        </dl>
        {actions}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Write `app/(app)/prs/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { availableActions } from "@/lib/pr/permissions";
import type { MovementState } from "@/lib/types";
import { PrHeader } from "@/components/pr/pr-header";
import { LineItemsTable } from "@/components/pr/line-items-table";
import { PrTimeline } from "@/components/pr/pr-timeline";
import { RemarksPanel } from "@/components/pr/remarks-panel";
import { PrivateNotesPanel } from "@/components/pr/private-notes-panel";

export default async function PrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: pr } = await supabase.from("pr_overview").select("*").eq("id", id).maybeSingle();
  if (!pr) notFound();

  const officeId = profile.office?.id;
  const empty = Promise.resolve({ data: [] as never[] });
  const [items, timeline, remarks, notes] = await Promise.all([
    supabase.from("pr_line_items").select("*").eq("pr_id", id).order("line_no"),
    supabase.from("pr_timeline").select("*").eq("pr_id", id).order("id", { ascending: false }),
    supabase.from("pr_remarks").select("id, body, created_at, author:profiles(full_name), office:offices(name)")
      .eq("pr_id", id).order("created_at", { ascending: false }),
    officeId
      ? supabase.from("pr_private_notes").select("id, body, created_at, author:profiles(full_name)")
          .eq("pr_id", id).order("created_at", { ascending: false })
      : empty,
  ]);

  const actions = availableActions({
    movement_state: pr.movement_state as MovementState, origin_office_id: pr.origin_office_id!,
    current_office_id: pr.current_office_id!, sent_by_office_id: pr.sent_by_office_id,
  }, profile);

  return (
    <div className="space-y-6">
      <PrHeader pr={pr} />
      <Tabs defaultValue="details">
        <TabsList className="flex-wrap">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="remarks">Remarks ({remarks.data?.length ?? 0})</TabsTrigger>
          {officeId && <TabsTrigger value="notes">Private notes</TabsTrigger>}
        </TabsList>
        <TabsContent value="details" className="space-y-4">
          <Card><CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Purpose: </span>{pr.purpose}</div>
            <div><span className="text-muted-foreground">Responsibility Center Code: </span>{pr.responsibility_center_code ?? "—"}</div>
            <div><span className="text-muted-foreground">Fund Cluster: </span>{pr.fund_cluster ?? "—"}</div>
            <div><span className="text-muted-foreground">Requested by: </span>{pr.requested_by_name}{pr.requested_by_designation ? `, ${pr.requested_by_designation}` : ""}</div>
            <div><span className="text-muted-foreground">Approved by: </span>{pr.approved_by_name ?? "—"}{pr.approved_by_designation ? `, ${pr.approved_by_designation}` : ""}</div>
          </CardContent></Card>
          <LineItemsTable items={items.data ?? []} />
        </TabsContent>
        <TabsContent value="timeline"><PrTimeline events={timeline.data ?? []} totalSteps={pr.total_steps ?? 0} /></TabsContent>
        <TabsContent value="remarks">
          <RemarksPanel prId={id} remarks={(remarks.data ?? []) as never} canAdd={actions.has("add_remark")} />
        </TabsContent>
        {officeId && (
          <TabsContent value="notes">
            <PrivateNotesPanel prId={id} notes={(notes.data ?? []) as never} canAdd={actions.has("add_private_note")} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 8: Verify manually**

Dev sign in as `cswd@test.local` and open the PR created in Task 17. Expected:
- The header shows "Draft at City Social Welfare and Development Office".
- The Timeline shows "Created by Carla Cswd (City Social …)".
- **Add remark** opens a modal, and the confirm button stays disabled until text is entered. After you confirm, the remark appears.
- Dev sign in as `treas@test.local` and open the same URL. Expected: a 404 (not involved).

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(pr): detail page with header, line items, timeline with edit diffs, remarks, private notes"
```

---

### Task 19: Workflow action bar and modals

**Files:**
- Modify:
  - `app/(app)/prs/[id]/actions.ts` (add the workflow actions)
  - `app/(app)/prs/[id]/page.tsx` (load the action data and render `<PrActionBar>` inside `<PrHeader actions>`)
- Create: `components/pr/pr-action-bar.tsx`, `components/pr/receive-button.tsx`

**Interfaces:**
- Consumes: the Task 8–9 RPCs, `TextActionDialog` (Task 18), `availableActions` (Task 13).
- Produces server actions:
  - `receivePr(prId)`
  - `forwardPr(prId, toOfficeId, overrideReason: string | null, remark: string | null)`
  - `returnPr(prId, toOfficeId, reason)`
  - `recallPr(prId, reason: string | null)`
  - `setStatus(prId, statusId, remark: string | null)`
  - `assignPrNo(prId, prNo)`
  - `setModeOfProcurement(prId, mode)`
  - `completePr(prId, remark: string | null)`
  - `cancelPr(prId, reason)`
  - `followPr(prId)`
  - `unfollowPr(prId)`
- Produces the components:
  - `<ReceiveButton prId routingSlipNo officeName size? />`
  - `<PrActionBar pr actions suggestion offices returnTargets statuses myOfficeId isFollowing canFollow />`

- [ ] **Step 1: Add the workflow actions to `app/(app)/prs/[id]/actions.ts`**

Append:
```ts
export async function receivePr(prId: string) {
  return rpcAction("receive_pr", { p_pr_id: prId }, paths(prId));
}
export async function forwardPr(prId: string, toOfficeId: string, overrideReason: string | null, remark: string | null) {
  return rpcAction("forward_pr", { p_pr_id: prId, p_to_office_id: toOfficeId, p_override_reason: overrideReason, p_remark: remark }, paths(prId));
}
export async function returnPr(prId: string, toOfficeId: string, reason: string) {
  return rpcAction("return_pr", { p_pr_id: prId, p_to_office_id: toOfficeId, p_reason: reason }, paths(prId));
}
export async function recallPr(prId: string, reason: string | null) {
  return rpcAction("recall_pr", { p_pr_id: prId, p_reason: reason }, paths(prId));
}
export async function setStatus(prId: string, statusId: string, remark: string | null) {
  return rpcAction("set_status", { p_pr_id: prId, p_status_id: statusId, p_remark: remark }, paths(prId));
}
export async function assignPrNo(prId: string, prNo: string) {
  return rpcAction("assign_pr_no", { p_pr_id: prId, p_pr_no: prNo }, paths(prId));
}
export async function setModeOfProcurement(prId: string, mode: string) {
  return rpcAction("set_mode_of_procurement", { p_pr_id: prId, p_mode: mode }, paths(prId));
}
export async function completePr(prId: string, remark: string | null) {
  return rpcAction("complete_pr", { p_pr_id: prId, p_remark: remark }, paths(prId));
}
export async function cancelPr(prId: string, reason: string) {
  return rpcAction("cancel_pr", { p_pr_id: prId, p_reason: reason }, paths(prId));
}
export async function followPr(prId: string) {
  return rpcAction("follow_pr", { p_pr_id: prId }, paths(prId));
}
export async function unfollowPr(prId: string) {
  return rpcAction("unfollow_pr", { p_pr_id: prId }, paths(prId));
}
```

- [ ] **Step 2: Write `components/pr/receive-button.tsx`**

```tsx
"use client";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { receivePr } from "@/app/(app)/prs/[id]/actions";

export function ReceiveButton({ prId, routingSlipNo, officeName, size = "default" }: {
  prId: string; routingSlipNo: string; officeName: string; size?: "default" | "sm";
}) {
  return (
    <ConfirmActionDialog
      trigger={<Button size={size}><Inbox className="mr-2 size-4" />Receive</Button>}
      title={`Receive ${routingSlipNo}?`}
      description={<p>This records that <b>{officeName}</b> has physically received the document now. The sending office will be notified.</p>}
      confirmLabel="Receive" successMessage="Received"
      onConfirm={() => receivePr(prId)}
    />
  );
}
```

- [ ] **Step 3: Write `components/pr/pr-action-bar.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { Ban, Bell, BellOff, CheckCircle2, Hash, ListChecks, Pencil, Send, Undo2, Gavel, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { TextActionDialog } from "./remarks-panel";
import { ReceiveButton } from "./receive-button";
import type { PrAction } from "@/lib/pr/permissions";
import {
  assignPrNo, cancelPr, completePr, followPr, forwardPr, recallPr, returnPr, setModeOfProcurement, setStatus, unfollowPr,
} from "@/app/(app)/prs/[id]/actions";

type Option = { id: string; name: string };
export type Suggestion = { step_order: number; office_id: string; office_name: string; purpose: string } | null;

type Props = {
  pr: { id: string; routing_slip_no: string; pr_no: string | null; mode_of_procurement: string | null;
        current_office_name: string; sent_by_office_name: string | null; total_steps: number };
  actions: PrAction[];
  suggestion: Suggestion;
  offices: Option[];
  returnTargets: Option[];
  statuses: { id: string; label: string }[];
  myOfficeId: string | null;
  myOfficeName: string | null;
  isFollowing: boolean;
  canFollow: boolean;
};

const MODES = ["Competitive Bidding", "Small Value Procurement", "Shopping", "Direct Contracting",
  "Negotiated Procurement", "Repeat Order", "Direct Acquisition", "Emergency Purchase"];

export function PrActionBar(p: Props) {
  const has = (a: PrAction) => p.actions.includes(a);
  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      {has("receive") && p.myOfficeName && <ReceiveButton prId={p.pr.id} routingSlipNo={p.pr.routing_slip_no} officeName={p.myOfficeName} />}
      {has("forward") && <ForwardDialog {...p} />}
      {has("set_status") && <StatusDialog {...p} />}
      {has("assign_pr_no") && (
        <TextActionDialog
          trigger={<Button variant="outline"><Hash className="mr-2 size-4" />Assign PR No.</Button>}
          title={`Assign PR No. to ${p.pr.routing_slip_no}?`}
          description={p.pr.pr_no ? `Current PR No. is ${p.pr.pr_no}. The change will be logged.` : "The PR No. will be recorded in the audit trail."}
          label="PR No." required multiline={false} initialValue={p.pr.pr_no ?? ""}
          confirmLabel="Save PR No." successMessage="PR No. saved"
          onConfirm={(t) => assignPrNo(p.pr.id, t)}
        />
      )}
      {has("set_mode") && (
        <TextActionDialog
          trigger={<Button variant="outline"><Gavel className="mr-2 size-4" />Mode of procurement</Button>}
          title="Set mode of procurement?"
          description={<span>Common modes: {MODES.join(", ")}.</span>}
          label="Mode of procurement" required multiline={false} initialValue={p.pr.mode_of_procurement ?? ""}
          confirmLabel="Save mode" successMessage="Mode of procurement saved"
          onConfirm={(t) => setModeOfProcurement(p.pr.id, t)}
        />
      )}
      {has("return") && <ReturnDialog {...p} />}
      {has("recall") && (
        <TextActionDialog
          trigger={<Button variant="outline"><RotateCcw className="mr-2 size-4" />Recall</Button>}
          title={`Recall ${p.pr.routing_slip_no}?`}
          description={<p>It has not been received by <b>{p.pr.current_office_name}</b> yet. Recalling brings it back to your office, and they will be notified.</p>}
          label="Reason" confirmLabel="Recall" successMessage="Recalled"
          onConfirm={(t) => recallPr(p.pr.id, t || null)}
        />
      )}
      {has("complete") && (
        <TextActionDialog
          trigger={<Button className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-2 size-4" />Complete</Button>}
          title={`Mark ${p.pr.routing_slip_no} as completed?`}
          description="This closes the PR. It can no longer be forwarded or updated."
          label="Remark" confirmLabel="Complete" successMessage="PR completed"
          onConfirm={(t) => completePr(p.pr.id, t || null)}
        />
      )}
      {has("edit") && <Button asChild variant="outline"><Link href={`/prs/${p.pr.id}/edit`}><Pencil className="mr-2 size-4" />Edit</Link></Button>}
      {p.canFollow && (
        <ConfirmActionDialog
          trigger={<Button variant="ghost">{p.isFollowing ? <BellOff className="mr-2 size-4" /> : <Bell className="mr-2 size-4" />}{p.isFollowing ? "Unfollow" : "Follow"}</Button>}
          title={p.isFollowing ? "Stop following this PR?" : "Follow this PR?"}
          description={p.isFollowing ? "Your office will no longer get notifications about this PR." : "Your office will be notified when this PR is received, updated or completed."}
          confirmLabel={p.isFollowing ? "Unfollow" : "Follow"} successMessage={p.isFollowing ? "Unfollowed" : "Following"}
          onConfirm={() => (p.isFollowing ? unfollowPr(p.pr.id) : followPr(p.pr.id))}
        />
      )}
      {has("cancel") && (
        <TextActionDialog
          trigger={<Button variant="ghost" className="text-destructive"><Ban className="mr-2 size-4" />Cancel PR</Button>}
          title={`Cancel ${p.pr.routing_slip_no}?`} description="Cancelled PRs cannot be reopened."
          label="Reason" required destructive confirmLabel="Cancel PR" successMessage="PR cancelled"
          onConfirm={(t) => cancelPr(p.pr.id, t)}
        />
      )}
    </div>
  );
}

function ForwardDialog({ pr, suggestion, offices, myOfficeId }: Props) {
  const [to, setTo] = useState(suggestion?.office_id ?? "");
  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const offRoute = !suggestion || to !== suggestion.office_id;
  const toName = offices.find((o) => o.id === to)?.name;
  const reset = () => { setTo(suggestion?.office_id ?? ""); setReason(""); setRemark(""); };

  return (
    <ConfirmActionDialog
      trigger={<Button><Send className="mr-2 size-4" />Forward</Button>}
      title={`Forward ${pr.routing_slip_no}?`}
      description={!to ? "Choose the destination office." : offRoute
        ? <p>Send to <b>{toName}</b>. This is <b>not</b> the default next stop{suggestion ? ` (${suggestion.office_name} · ${suggestion.purpose})` : ""}, so a reason is required.</p>
        : <p>Send to <b>{toName}</b> · {suggestion!.purpose.toLowerCase()} (step {suggestion!.step_order} of {pr.total_steps}).</p>}
      confirmLabel="Forward" successMessage="Forwarded"
      canConfirm={!!to && (!offRoute || reason.trim().length > 0)}
      onOpenChange={(o) => o && reset()}
      onConfirm={() => forwardPr(pr.id, to, offRoute ? reason.trim() : null, remark.trim() || null)}
    >
      <Label>Destination office</Label>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger aria-label="Destination office"><SelectValue placeholder="Select office" /></SelectTrigger>
        <SelectContent>
          {offices.filter((o) => o.id !== myOfficeId).map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}{suggestion?.office_id === o.id ? " (suggested)" : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {offRoute && to && (
        <>
          <Label htmlFor="override-reason">Reason for leaving the default route</Label>
          <Textarea id="override-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </>
      )}
      <Label htmlFor="forward-remark">Remark (optional)</Label>
      <Textarea id="forward-remark" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
    </ConfirmActionDialog>
  );
}

function ReturnDialog({ pr, returnTargets }: Props) {
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const toName = returnTargets.find((o) => o.id === to)?.name;
  return (
    <ConfirmActionDialog
      trigger={<Button variant="outline"><Undo2 className="mr-2 size-4" />Return</Button>}
      title={`Return ${pr.routing_slip_no}?`}
      description={to ? <p>Send it back to <b>{toName}</b> for correction.</p> : "Choose the office to return it to."}
      confirmLabel="Return" successMessage="Returned"
      canConfirm={!!to && reason.trim().length > 0}
      onOpenChange={(o) => { if (o) { setTo(returnTargets[0]?.id ?? ""); setReason(""); } }}
      onConfirm={() => returnPr(pr.id, to, reason.trim())}
    >
      <Label>Return to</Label>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger aria-label="Return to office"><SelectValue placeholder="Select office" /></SelectTrigger>
        <SelectContent>{returnTargets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
      <Label htmlFor="return-reason">Reason</Label>
      <Textarea id="return-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
    </ConfirmActionDialog>
  );
}

function StatusDialog({ pr, statuses }: Props) {
  const [statusId, setStatusId] = useState("");
  const [remark, setRemark] = useState("");
  const label = statuses.find((s) => s.id === statusId)?.label;
  return (
    <ConfirmActionDialog
      trigger={<Button variant="outline"><ListChecks className="mr-2 size-4" />Update status</Button>}
      title={`Update status of ${pr.routing_slip_no}?`}
      description={label ? <p>Set the processing status to <b>{label}</b>. Followers will be notified.</p> : "Choose a status from your office's list."}
      confirmLabel="Update status" successMessage="Status updated"
      canConfirm={!!statusId}
      onOpenChange={(o) => { if (o) { setStatusId(""); setRemark(""); } }}
      onConfirm={() => setStatus(pr.id, statusId, remark.trim() || null)}
    >
      <Label>Status</Label>
      <Select value={statusId} onValueChange={setStatusId}>
        <SelectTrigger aria-label="Status"><SelectValue placeholder="Select status" /></SelectTrigger>
        <SelectContent>{statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      <Label htmlFor="status-remark">Remark (optional)</Label>
      <Textarea id="status-remark" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
    </ConfirmActionDialog>
  );
}
```

- [ ] **Step 4: Load the action data in `app/(app)/prs/[id]/page.tsx`**

After the `actions` are computed, add:
```tsx
  const actionList = [...actions];
  const [suggestionRes, officesRes, involvedRes, statusesRes, followRes] = await Promise.all([
    actions.has("forward") ? supabase.rpc("suggest_next_step", { p_pr_id: id }) : Promise.resolve({ data: null }),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
    supabase.from("pr_involved_offices").select("office_id, office:offices(name)").eq("pr_id", id),
    officeId ? supabase.from("office_statuses").select("id, label").eq("office_id", officeId).eq("active", true).order("sort_order") : empty,
    officeId ? supabase.from("pr_followers").select("office_id").eq("pr_id", id).eq("office_id", officeId) : empty,
  ]);
  const suggestion = ((suggestionRes.data as { next?: unknown } | null)?.next ?? null) as Suggestion;
  const returnTargets = (involvedRes.data ?? [])
    .filter((i) => i.office_id !== officeId)
    .map((i) => ({ id: i.office_id, name: (i.office as { name: string } | null)?.name ?? "" }));
  const terminal = pr.movement_state === "completed" || pr.movement_state === "cancelled";
```

Replace `<PrHeader pr={pr} />` with:
```tsx
      <PrHeader pr={pr} actions={
        <PrActionBar
          pr={{ id, routing_slip_no: pr.routing_slip_no!, pr_no: pr.pr_no, mode_of_procurement: pr.mode_of_procurement,
                current_office_name: pr.current_office_name!, sent_by_office_name: pr.sent_by_office_name, total_steps: pr.total_steps ?? 0 }}
          actions={actionList} suggestion={suggestion}
          offices={officesRes.data ?? []} returnTargets={returnTargets} statuses={statusesRes.data ?? []}
          myOfficeId={officeId ?? null} myOfficeName={profile.office?.name ?? null}
          isFollowing={(followRes.data ?? []).length > 0}
          canFollow={!!officeId && !terminal}
        />
      } />
```
Add `import { PrActionBar, type Suggestion } from "@/components/pr/pr-action-bar";`.

- [ ] **Step 5: Verify manually** (three browser profiles, or sign out and in between steps)

1. As `cswd`, open the draft PR and click **Forward**. Expected: GSO is preselected "(suggested)", and the description reads "for review (step 1 of 10)". Confirm. Expected: the location line reads "In transit → General Services Office · for review · step 1 of 10".
2. As `cswd`, **Recall** is visible. Don't use it yet.
3. As `gso`, open the PR. Expected: only **Receive** is shown. Receive it. Then **Update status** → "For review". Then **Forward** with Mayor preselected, and confirm.
4. As `gso`, open the PR in a second tab before step 3's receive and click **Receive** in both tabs. Expected: the second shows the toast "Already received by Gabriel Gso (GSO) at …".
5. As `mayor`, receive the PR. Pick **Forward** → choose "City Treasurer's Office". Expected: the warning appears and **Forward** stays disabled until a reason is typed. Cancel the dialog instead.

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pr): workflow action bar with confirmation modals for every action"
```

---

### Task 20: Attachments (upload, list, download, supersede)

**Files:**
- Modify:
  - `app/(app)/prs/[id]/actions.ts` (add `registerAttachment`, `supersedeAttachment`, `getAttachmentUrl`)
  - `app/(app)/prs/[id]/page.tsx` (add the Attachments tab)
- Create: `components/pr/attachments-panel.tsx`

**Interfaces:**
- Consumes: `register_attachment`, `supersede_attachment` (Task 9); bucket policies (Task 12); `validateFile`, `safeFileName` (Task 13).
- Produces:
  - `registerAttachment(prId, path, filename, size, mime): Promise<ActionResult<string>>`
  - `supersedeAttachment(attachmentId, prId, reason)`
  - `getAttachmentUrl(attachmentId): Promise<ActionResult<string>>`
  - `<AttachmentsPanel prId attachments canUpload myOfficeId maxMb />`

- [ ] **Step 1: Add the server actions**

Append to `app/(app)/prs/[id]/actions.ts`:
```ts
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/rpc";

export async function registerAttachment(prId: string, path: string, filename: string, size: number, mime: string) {
  return rpcAction<string>("register_attachment", {
    p_pr_id: prId, p_storage_path: path, p_filename: filename, p_size_bytes: size, p_mime_type: mime,
  }, paths(prId));
}

export async function supersedeAttachment(attachmentId: string, prId: string, reason: string) {
  return rpcAction("supersede_attachment", { p_attachment_id: attachmentId, p_reason: reason }, paths(prId));
}

export async function getAttachmentUrl(attachmentId: string): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data: att } = await supabase.from("pr_attachments").select("storage_path, filename").eq("id", attachmentId).maybeSingle();
  if (!att) return { ok: false, error: "Attachment not found" };
  const { data, error } = await supabase.storage.from("pr-tracker-attachments")
    .createSignedUrl(att.storage_path, 60, { download: att.filename });
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create download link" };
  return { ok: true, data: data.signedUrl };
}
```
(Move the new imports to the top of the file.)

- [ ] **Step 2: Write `components/pr/attachments-panel.tsx`**

```tsx
"use client";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { TextActionDialog } from "./remarks-panel";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { safeFileName, validateFile } from "@/lib/pr/files";
import { formatDateTime } from "@/lib/format";
import { getAttachmentUrl, registerAttachment, supersedeAttachment } from "@/app/(app)/prs/[id]/actions";

export type AttachmentItem = {
  id: string; filename: string; size_bytes: number; mime_type: string; created_at: string;
  superseded_at: string | null; superseded_reason: string | null; office_id: string;
  uploader: { full_name: string } | null; office: { name: string } | null;
};

export function AttachmentsPanel({ prId, attachments, canUpload, myOfficeId, maxMb }: {
  prId: string; attachments: AttachmentItem[]; canUpload: boolean; myOfficeId: string | null; maxMb: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const problem = file ? validateFile(file, maxMb) : null;

  async function upload() {
    if (!file) return { ok: false as const, error: "Choose a file" };
    const err = validateFile(file, maxMb);
    if (err) return { ok: false as const, error: err };
    const path = `${prId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await createBrowserSupabase().storage.from("pr-tracker-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { ok: false as const, error: `Upload failed: ${error.message}` };
    return registerAttachment(prId, path, file.name, file.size, file.type);
  }

  async function download(id: string) {
    const res = await getAttachmentUrl(id);
    if (!res.ok) return toast.error(res.error);
    window.open(res.data, "_blank", "noopener");
  }

  const columns: ColumnDef<AttachmentItem>[] = [
    { accessorKey: "filename", header: "File", cell: ({ row }) => (
      <span className={row.original.superseded_at ? "text-muted-foreground line-through" : ""}>{row.original.filename}</span>) },
    { id: "office", header: "Office", accessorFn: (r) => r.office?.name ?? "" },
    { id: "uploader", header: "Uploaded by", accessorFn: (r) => r.uploader?.full_name ?? "" },
    { accessorKey: "size_bytes", header: "Size", cell: ({ row }) => `${(row.original.size_bytes / 1024 / 1024).toFixed(2)} MB` },
    { accessorKey: "created_at", header: "Uploaded", cell: ({ row }) => formatDateTime(row.original.created_at) },
    { id: "status", header: "Status", cell: ({ row }) => row.original.superseded_at
      ? <Badge variant="outline" title={row.original.superseded_reason ?? ""}>Superseded</Badge> : <Badge variant="secondary">Current</Badge> },
    { id: "actions", header: "", enableHiding: false, cell: ({ row }) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => download(row.original.id)}><Download className="mr-1 size-4" />Download</Button>
        {!row.original.superseded_at && row.original.office_id === myOfficeId && (
          <TextActionDialog
            trigger={<Button variant="ghost" size="sm">Mark superseded</Button>}
            title={`Mark "${row.original.filename}" as superseded?`}
            description="Files are never deleted. Superseded files stay visible but struck through."
            label="Reason" required confirmLabel="Mark superseded" successMessage="Marked superseded"
            onConfirm={(t) => supersedeAttachment(row.original.id, prId, t)}
          />
        )}
      </div>) },
  ];

  return (
    <div className="space-y-4">
      {canUpload && (
        <ConfirmActionDialog<string>
          trigger={<Button size="sm"><Paperclip className="mr-2 size-4" />Upload attachment</Button>}
          title="Upload attachment?"
          description={file ? <p>Attach <b>{file.name}</b> ({(file.size / 1024 / 1024).toFixed(2)} MB) to this PR. Followers will be notified.</p>
                            : `PDF, JPG, PNG, DOCX or XLSX up to ${maxMb} MB.`}
          confirmLabel="Upload" successMessage="File attached"
          canConfirm={!!file && !problem}
          onOpenChange={(o) => o && setFile(null)}
          onConfirm={upload}
        >
          <Label htmlFor="attachment-file">File</Label>
          <Input id="attachment-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                 onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {problem && <p className="text-sm text-destructive">{problem}</p>}
        </ConfirmActionDialog>
      )}
      <DataTable columns={columns} data={attachments} searchPlaceholder="Filter files…" emptyMessage="No attachments." />
    </div>
  );
}
```

- [ ] **Step 3: Add the tab to the detail page**

Add these to the `Promise.all` in `page.tsx`:
```ts
    supabase.from("pr_attachments")
      .select("id, filename, size_bytes, mime_type, created_at, superseded_at, superseded_reason, office_id, uploader:profiles(full_name), office:offices(name)")
      .eq("pr_id", id).order("created_at"),
    supabase.from("app_settings").select("value").eq("key", "max_upload_mb").maybeSingle(),
```
Destructure them as `attachments, maxMbRes`. Add the trigger `<TabsTrigger value="attachments">Attachments ({attachments.data?.length ?? 0})</TabsTrigger>` and the content:
```tsx
        <TabsContent value="attachments">
          <AttachmentsPanel prId={id} attachments={(attachments.data ?? []) as never}
            canUpload={actions.has("add_attachment")} myOfficeId={officeId ?? null}
            maxMb={Number(maxMbRes.data?.value ?? 20)} />
        </TabsContent>
```

- [ ] **Step 4: Verify manually**

As the office holding the PR, upload a small PDF and confirm. Expected:
- It appears as "Current", and **Download** opens it.
- Choosing a `.txt` renamed to `.pdf` with type `text/plain` shows "File type not allowed…", and the confirm button is disabled.
- **Mark superseded** requires a reason, and the row then shows struck through.
- As `treas` (uninvolved), `supabase.storage.from('pr-tracker-attachments').download(path)` in the browser console must fail.

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pr): attachments upload, signed downloads, supersede"
```

---

### Task 21: Notification bell (60 s polling, no Realtime)

**Files:**
- Create: `app/(app)/notifications/actions.ts`, `components/notification-bell.tsx`
- Modify: `app/(app)/layout.tsx` (pass `bell` to `Topbar`)

**Interfaces:**
- Consumes: the `my_notifications` view, `unread_notification_count`, `mark_notifications_read`, `mark_all_notifications_read` (Task 10); `notificationText` (Task 13).
- Produces:
  - `getNotifications(): Promise<{ unread: number; items: NotificationViewRow[] }>`
  - `markNotificationsRead(ids: number[])`
  - `markAllNotificationsRead()`
  - `<NotificationBell />`

- [ ] **Step 1: Write `app/(app)/notifications/actions.ts`**

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { rpcAction } from "@/lib/actions/rpc";
import type { NotificationViewRow } from "@/lib/supabase/rows";

export async function getNotifications(): Promise<{ unread: number; items: NotificationViewRow[] }> {
  const supabase = await createClient();
  const [count, list] = await Promise.all([
    supabase.rpc("unread_notification_count"),
    supabase.from("my_notifications").select("*").order("id", { ascending: false }).limit(20),
  ]);
  return { unread: (count.data as number | null) ?? 0, items: list.data ?? [] };
}

export async function markNotificationsRead(ids: number[]) {
  return rpcAction("mark_notifications_read", { p_ids: ids });
}

export async function markAllNotificationsRead() {
  return rpcAction("mark_all_notifications_read", {});
}
```

- [ ] **Step 2: Write `components/notification-bell.tsx`**

Marking notifications read is personal UI state, so it does **not** open a confirmation modal (see Decision 9).

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notificationText } from "@/lib/pr/timeline";
import { formatDateTime } from "@/lib/format";
import type { EventType } from "@/lib/types";
import type { NotificationViewRow } from "@/lib/supabase/rows";
import { getNotifications, markAllNotificationsRead, markNotificationsRead } from "@/app/(app)/notifications/actions";

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationViewRow[]>([]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const res = await getNotifications();
    setUnread(res.unread);
    setItems(res.items);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  async function openItem(n: NotificationViewRow) {
    if (!n.is_read) await markNotificationsRead([n.id!]);
    setOpen(false);
    router.push(`/prs/${n.pr_id}`);
    refresh();
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) refresh(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${unread} unread)`} className="relative">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="link" size="sm" disabled={unread === 0}
                  onClick={async () => { await markAllNotificationsRead(); refresh(); }}>Mark all as read</Button>
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">No notifications.</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)}
                        className={`w-full border-b px-4 py-3 text-left text-sm hover:bg-muted ${n.is_read ? "text-muted-foreground" : "bg-primary/5 font-medium"}`}>
                  <div>{notificationText({ type: n.type as EventType, actor_office_name: n.actor_office_name, routing_slip_no: n.routing_slip_no! })}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground">{n.purpose}</div>
                  <div className="text-xs font-normal text-muted-foreground">{formatDateTime(n.created_at!)}</div>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Wire it into `app/(app)/layout.tsx`**

Change `<Topbar profile={profile} />` to:
```tsx
<Topbar profile={profile} bell={profile.office ? <NotificationBell /> : null} />
```
and add `import { NotificationBell } from "@/components/notification-bell";`.

- [ ] **Step 4: Verify manually**

As `cswd`, forward a PR to GSO. As `gso`, within 60 s (or on reload) the bell shows **1**. Click the item: it opens the PR, and the badge disappears after the refresh. In DevTools → Network, confirm there are no websocket/realtime connections and one server-action POST per minute.

Run: `pnpm build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(notifications): office notification bell with 60s polling and per-user read state"
```

---

### Task 22: Office dashboard

**Files:**
- Modify: `app/(app)/page.tsx` (replace the placeholder)
- Create: `app/(app)/dashboard-tables.tsx`, `components/pr/rs-link.tsx`

**Interfaces:**
- Consumes: the `pr_overview` and `followed_activity` views, `report_stuck_prs`; `ReceiveButton` (Task 19); `DataTable`, `MovementBadge`.
- Produces:
  - `<RsLink id rs />`
  - `<IncomingTable rows officeName />`
  - `<OnHandTable rows threshold />`
  - `<MyPrsTable rows />`
  - `<FollowingTable rows />`
  - `<StuckTable rows />`

- [ ] **Step 1: Write `components/pr/rs-link.tsx`**

```tsx
import Link from "next/link";

export function RsLink({ id, rs }: { id: string; rs: string }) {
  return <Link href={`/prs/${id}`} className="font-mono font-medium text-primary hover:underline">{rs}</Link>;
}
```

- [ ] **Step 2: Write `app/(app)/dashboard-tables.tsx`**

```tsx
"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { MovementBadge } from "@/components/pr/movement-badge";
import { ReceiveButton } from "@/components/pr/receive-button";
import { RsLink } from "@/components/pr/rs-link";
import { formatDateTime, formatDaysHere, formatPeso, locationLine } from "@/lib/format";
import { describeEvent, type TimelineEvent } from "@/lib/pr/timeline";
import type { MovementState } from "@/lib/types";
import type { FollowedActivityRow, PrOverviewRow } from "@/lib/supabase/rows";

const rs: ColumnDef<PrOverviewRow> = {
  accessorKey: "routing_slip_no", header: ({ column }) => <DataTableColumnHeader column={column} title="Routing Slip" />,
  cell: ({ row }) => <RsLink id={row.original.id!} rs={row.original.routing_slip_no!} />,
};
const purpose: ColumnDef<PrOverviewRow> = {
  accessorKey: "purpose", header: "Purpose", cell: ({ row }) => <span className="line-clamp-2 max-w-72">{row.original.purpose}</span>,
};
const amount: ColumnDef<PrOverviewRow> = {
  accessorKey: "grand_total", header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
  cell: ({ row }) => <span className="tabular-nums">{formatPeso(Number(row.original.grand_total))}</span>,
};
const days = (title: string): ColumnDef<PrOverviewRow> => ({
  accessorKey: "days_here", header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
  cell: ({ row }) => formatDaysHere(Number(row.original.days_here)),
});

export function IncomingTable({ rows, officeName }: { rows: PrOverviewRow[]; officeName: string }) {
  const columns: ColumnDef<PrOverviewRow>[] = [
    rs, purpose,
    { accessorKey: "sent_by_office_name", header: "From" },
    { accessorKey: "movement_state", header: "Type", cell: ({ row }) => <MovementBadge state={row.original.movement_state as MovementState} /> },
    { accessorKey: "current_purpose", header: "For", cell: ({ row }) => row.original.current_purpose ?? "—" },
    days("Waiting"),
    { id: "receive", header: "", enableHiding: false, cell: ({ row }) => (
      <ReceiveButton size="sm" prId={row.original.id!} routingSlipNo={row.original.routing_slip_no!} officeName={officeName} />) },
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="Nothing waiting to be received." />;
}

export function OnHandTable({ rows, threshold }: { rows: PrOverviewRow[]; threshold: number }) {
  const columns: ColumnDef<PrOverviewRow>[] = [
    rs, purpose,
    { accessorKey: "origin_office_name", header: "Origin" },
    { accessorKey: "current_status_label", header: "Status", cell: ({ row }) => row.original.current_status_label ?? "—" },
    amount, days("Days here"),
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="No PRs on hand."
    getRowClassName={(r) => (Number(r.days_here) >= threshold ? "bg-amber-50" : undefined)} />;
}

export function MyPrsTable({ rows }: { rows: PrOverviewRow[] }) {
  const columns: ColumnDef<PrOverviewRow>[] = [
    rs, purpose,
    { id: "where", header: "Where is it now", cell: ({ row }) => {
      const r = row.original;
      return locationLine({ movement_state: r.movement_state as MovementState, current_office_name: r.current_office_name!,
        current_status_label: r.current_status_label, current_purpose: r.current_purpose, current_since: r.current_since!,
        route_step: r.route_step!, total_steps: r.total_steps! });
    } },
    amount,
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="Your office has no open PRs." />;
}

export function FollowingTable({ rows }: { rows: FollowedActivityRow[] }) {
  const columns: ColumnDef<FollowedActivityRow>[] = [
    { accessorKey: "routing_slip_no", header: "Routing Slip", cell: ({ row }) => <RsLink id={row.original.pr_id!} rs={row.original.routing_slip_no!} /> },
    { id: "what", header: "Activity", cell: ({ row }) => describeEvent({
        ...(row.original as unknown as TimelineEvent), from_office_name: null, to_office_name: null, status_label: null,
        override_reason: null, remark: null, to_route_step: null, route_purpose: null, payload: {},
      }, 0) },
    { accessorKey: "actor_office_name", header: "Office" },
    { accessorKey: "created_at", header: "When", cell: ({ row }) => formatDateTime(row.original.created_at!) },
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="No recent activity on followed PRs." />;
}

export type StuckRow = { pr_id: string; routing_slip_no: string; origin_office_name: string; current_office_name: string;
  movement_state: string; days: number; can_view: boolean };

export function StuckTable({ rows }: { rows: StuckRow[] }) {
  const columns: ColumnDef<StuckRow>[] = [
    { accessorKey: "routing_slip_no", header: "Routing Slip", cell: ({ row }) => (
      <Link className="font-mono text-primary hover:underline" href={`/track/${row.original.routing_slip_no}`}>{row.original.routing_slip_no}</Link>) },
    { accessorKey: "origin_office_name", header: "Origin" },
    { accessorKey: "current_office_name", header: "Current office" },
    { accessorKey: "movement_state", header: "State", cell: ({ row }) => <MovementBadge state={row.original.movement_state as MovementState} /> },
    { accessorKey: "days", header: ({ column }) => <DataTableColumnHeader column={column} title="Days" /> },
  ];
  return <DataTable columns={columns} data={rows} emptyMessage="No stuck PRs." />;
}
```

The Following table only shows the event type and actor. That's why `describeEvent` gets nulls for the detail fields. The PR link carries the context.

- [ ] **Step 3: Write `app/(app)/page.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { FollowingTable, IncomingTable, MyPrsTable, OnHandTable, StuckTable, type StuckRow } from "./dashboard-tables";

function manilaMonthStart(): string {
  const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  return `${ym}-01T00:00:00+08:00`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card><CardContent className="p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!profile.office) {
    const { data } = await supabase.rpc("report_stuck_prs");
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your account is not assigned to an office. Showing PRs that are stuck across all offices.</p>
        <Card><CardHeader><CardTitle>Stuck PRs</CardTitle></CardHeader><CardContent><StuckTable rows={(data ?? []) as StuckRow[]} /></CardContent></Card>
      </div>
    );
  }

  const officeId = profile.office.id;
  const [incoming, onHand, mine, drafts, completed, following, threshold] = await Promise.all([
    supabase.from("pr_overview").select("*").eq("current_office_id", officeId).in("movement_state", ["in_transit", "returned"]).order("current_since"),
    supabase.from("pr_overview").select("*").eq("current_office_id", officeId).eq("movement_state", "received").order("current_since"),
    supabase.from("pr_overview").select("*").eq("origin_office_id", officeId).not("movement_state", "in", "(completed,cancelled)")
      .order("updated_at", { ascending: false }).limit(100),
    supabase.from("purchase_requests").select("id", { count: "exact", head: true }).eq("origin_office_id", officeId).eq("movement_state", "draft"),
    supabase.from("purchase_requests").select("id", { count: "exact", head: true }).eq("movement_state", "completed").gte("current_since", manilaMonthStart()),
    supabase.from("followed_activity").select("*").order("id", { ascending: false }).limit(15),
    supabase.from("app_settings").select("value").eq("key", "stuck_threshold_days").maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{profile.office.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Incoming" value={incoming.data?.length ?? 0} />
        <Stat label="On hand" value={onHand.data?.length ?? 0} />
        <Stat label="Drafts" value={drafts.count ?? 0} />
        <Stat label="Completed this month" value={completed.count ?? 0} />
      </div>
      <Card><CardHeader><CardTitle>Incoming — needs to be received</CardTitle></CardHeader>
        <CardContent><IncomingTable rows={incoming.data ?? []} officeName={profile.office.name} /></CardContent></Card>
      <Card><CardHeader><CardTitle>On hand</CardTitle></CardHeader>
        <CardContent><OnHandTable rows={onHand.data ?? []} threshold={Number(threshold.data?.value ?? 5)} /></CardContent></Card>
      <Card><CardHeader><CardTitle>My office&apos;s PRs</CardTitle></CardHeader>
        <CardContent><MyPrsTable rows={mine.data ?? []} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Following — recent activity</CardTitle></CardHeader>
        <CardContent><FollowingTable rows={following.data ?? []} /></CardContent></Card>
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

As `gso` with a PR forwarded to GSO:
- **Incoming** lists it with a **Receive** button.
- After receiving, it moves to **On hand**.
- In Studio, run `update pr_tracker.purchase_requests set current_since = now() - interval '6 days' where …`. Reload. Expected: the row is highlighted amber.

As `cswd`, **My office's PRs** shows "Received at General Services Office · …".

Run: `pnpm build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(dashboard): incoming, on hand, my PRs, following, summary cards"
```

---

### Task 23: Purchase Requests list (server-paginated, filters, slip selection)

**Files:**
- Modify: `lib/search.ts`, `lib/search.test.ts` (add `sanitizeSearch`)
- Create: `app/(app)/prs/page.tsx`, `app/(app)/prs/pr-list-table.tsx`, `app/(app)/prs/pr-list-filters.tsx`

**Interfaces:**
- Consumes: `parseListParams` (Task 13), `DataTable` server mode (Task 15).
- Produces:
  - `sanitizeSearch(q: string): string`
  - `<PrListTable rows rowCount pageIndex pageSize offices />`
  - `<PrListFilters offices />`

- [ ] **Step 1: Write the failing test**

Append to `lib/search.test.ts`:
```ts
import { sanitizeSearch } from "./search";

test("sanitizeSearch strips PostgREST filter syntax", () => {
  expect(sanitizeSearch("paper,(x)*%")).toBe("paper x");
  expect(sanitizeSearch('a"b\\c:d')).toBe("a b c d");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/search.test.ts`
Expected: FAIL, `sanitizeSearch is not a function`.

- [ ] **Step 3: Implement it**

Append to `lib/search.ts`:
```ts
/** Removes characters that have meaning inside a PostgREST `or=(…)` filter. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%"\\:]/g, " ").replace(/\s+/g, " ").trim();
}
```

Run: `pnpm test lib/search.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `app/(app)/prs/pr-list-filters.tsx`**

```tsx
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOVEMENT_LABELS } from "@/lib/format";

export function PrListFilters({ offices }: { offices: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v && v !== "all") next.set(k, v); else next.delete(k);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={params.get("state") ?? "all"} onValueChange={(v) => set("state", v)}>
        <SelectTrigger className="h-9 w-36" aria-label="State"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All states</SelectItem>
          {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={params.get("office") ?? "all"} onValueChange={(v) => set("office", v)}>
        <SelectTrigger className="h-9 w-52" aria-label="Current office"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any current office</SelectItem>
          {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="date" aria-label="From date" className="h-9 w-40" defaultValue={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />
      <Input type="date" aria-label="To date" className="h-9 w-40" defaultValue={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />
      <Input type="number" aria-label="Minimum amount" placeholder="Min ₱" className="h-9 w-28" defaultValue={params.get("min") ?? ""} onBlur={(e) => set("min", e.target.value)} />
      <Input type="number" aria-label="Maximum amount" placeholder="Max ₱" className="h-9 w-28" defaultValue={params.get("max") ?? ""} onBlur={(e) => set("max", e.target.value)} />
      <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>Clear</Button>
    </div>
  );
}
```

- [ ] **Step 5: Write `app/(app)/prs/pr-list-table.tsx`**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { MovementBadge } from "@/components/pr/movement-badge";
import { RsLink } from "@/components/pr/rs-link";
import { formatDate, formatDaysHere, formatPeso } from "@/lib/format";
import type { MovementState } from "@/lib/types";
import type { PrOverviewRow } from "@/lib/supabase/rows";
import { PrListFilters } from "./pr-list-filters";

export function PrListTable({ rows, rowCount, pageIndex, pageSize, offices }: {
  rows: PrOverviewRow[]; rowCount: number; pageIndex: number; pageSize: number; offices: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  const columns: ColumnDef<PrOverviewRow>[] = [
    { id: "select", enableHiding: false, header: "", cell: ({ row }) => (
      <Checkbox aria-label={`Select ${row.original.routing_slip_no}`} checked={selected.includes(row.original.id!)}
                onCheckedChange={(v) => toggle(row.original.id!, !!v)} />) },
    { accessorKey: "routing_slip_no", header: ({ column }) => <DataTableColumnHeader column={column} title="Routing Slip" />,
      cell: ({ row }) => <RsLink id={row.original.id!} rs={row.original.routing_slip_no!} /> },
    { accessorKey: "pr_no", header: ({ column }) => <DataTableColumnHeader column={column} title="PR No." />, cell: ({ row }) => row.original.pr_no ?? "—" },
    { accessorKey: "pr_date", header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />, cell: ({ row }) => formatDate(row.original.pr_date!) },
    { accessorKey: "purpose", header: "Purpose", enableSorting: false, cell: ({ row }) => <span className="line-clamp-2 max-w-72">{row.original.purpose}</span> },
    { accessorKey: "origin_office_name", header: "Origin", enableSorting: false },
    { accessorKey: "current_office_name", header: "Current office", enableSorting: false },
    { accessorKey: "movement_state", header: "State", enableSorting: false, cell: ({ row }) => <MovementBadge state={row.original.movement_state as MovementState} /> },
    { accessorKey: "current_status_label", header: "Status", enableSorting: false, cell: ({ row }) => row.original.current_status_label ?? "—" },
    { accessorKey: "days_here", header: ({ column }) => <DataTableColumnHeader column={column} title="Days here" />, cell: ({ row }) => formatDaysHere(Number(row.original.days_here)) },
    { accessorKey: "grand_total", header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />, cell: ({ row }) => <span className="tabular-nums">{formatPeso(Number(row.original.grand_total))}</span> },
  ];

  return (
    <DataTable
      columns={columns} data={rows} searchPlaceholder="Search RS No., PR No., purpose…" emptyMessage="No purchase requests found."
      server={{ rowCount, pageIndex, pageSize }}
      toolbar={
        <>
          <PrListFilters offices={offices} />
          <Button asChild variant="outline" size="sm" className="h-9" aria-disabled={selected.length === 0}>
            <Link href={selected.length ? `/print/slips?layout=4up&ids=${selected.join(",")}` : "#"} target="_blank"
                  onClick={(e) => selected.length === 0 && e.preventDefault()}>
              <Printer className="mr-2 size-4" />Print selected slips ({selected.length})
            </Link>
          </Button>
        </>
      }
    />
  );
}
```

`DataTable` maps sort ids from `accessorKey`. These match the `SORTABLE` whitelist in `parseListParams` (`routing_slip_no`, `pr_no`, `pr_date`, `days_here`, `grand_total`).

- [ ] **Step 6: Write `app/(app)/prs/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/profile";
import { parseListParams, sanitizeSearch } from "@/lib/search";
import { PrListTable } from "./pr-list-table";

export default async function PrListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireProfile();
  const p = parseListParams(await searchParams);
  const supabase = await createClient();

  let query = supabase.from("pr_overview").select("*", { count: "exact" });
  const term = sanitizeSearch(p.q);
  if (term) query = query.or(`routing_slip_no.ilike.*${term}*,pr_no.ilike.*${term}*,purpose.ilike.*${term}*`);
  if (p.state) query = query.eq("movement_state", p.state as never);
  if (p.office) query = query.eq("current_office_id", p.office);
  if (p.from) query = query.gte("pr_date", p.from);
  if (p.to) query = query.lte("pr_date", p.to);
  if (p.min) query = query.gte("grand_total", Number(p.min));
  if (p.max) query = query.lte("grand_total", Number(p.max));
  const from = (p.page - 1) * p.size;

  const [{ data, count, error }, { data: offices }] = await Promise.all([
    query.order(p.sort, { ascending: p.dir === "asc" }).range(from, from + p.size - 1),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Purchase Requests</h1>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <PrListTable rows={data ?? []} rowCount={count ?? 0} pageIndex={p.page - 1} pageSize={p.size} offices={offices ?? []} />
    </div>
  );
}
```

- [ ] **Step 7: Verify manually**

Create about 30 PRs locally with this SQL in Studio. Run it as the cswd user by temporarily inserting through the RPC in a `do` block with `set_config`, or create them through the UI:
```sql
select set_config('request.jwt.claims', json_build_object('sub', (select auth_user_id from pr_tracker.profiles where email='cswd@test.local'), 'role','authenticated')::text, true);
select pr_tracker.create_pr(tests.sample_header(), tests.sample_items()) from generate_series(1,30);
```
Then check:
- Pagination shows "Page 1 of 2" at size 25.
- Sorting by Amount updates the URL (`sort=grand_total.asc`).
- Searching "Office supplies" filters the rows.
- The State filter works.
- Selecting two rows and clicking **Print selected slips (2)** opens a new tab. That tab 404s until Task 24, which is fine.

Run: `pnpm test && pnpm build`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(prs): server-paginated PR list with filters, search and slip selection"
```

---

### Task 24: Tracking page and the printable routing slip with QR code

**Files:**
- Create:
  - `app/(app)/track/page.tsx`, `app/(app)/track/track-form.tsx`, `app/(app)/track/[rs]/page.tsx`
  - `components/pr/tracking-view.tsx`, `components/pr/routing-slip.tsx`
  - `app/print/slips/page.tsx`, `app/print/slips/print-toolbar.tsx`
- Modify: `components/pr/pr-header.tsx` (the print link points to `/print/slips?ids=<id>&layout=single`)

**Interfaces:**
- Consumes: `tracking_lookup` (Task 10); `buildSlipRows`, `trackUrl`, `truncate` (Task 13); `qrcode`.
- Produces:
  - Routes `/track`, `/track/[rs]`, and `/print/slips?ids=a,b&layout=single|4up`
  - `TrackingResult` type
  - `<TrackingView data />`
  - `<RoutingSlip lguName pr qr rows />`

- [ ] **Step 1: Write the tracking pages**

`app/(app)/track/track-form.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TrackForm() {
  const [rs, setRs] = useState("");
  const router = useRouter();
  return (
    <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (rs.trim()) router.push(`/track/${encodeURIComponent(rs.trim().toUpperCase())}`); }}>
      <Input aria-label="Routing slip number" placeholder="RS-2026-10-00001" value={rs} onChange={(e) => setRs(e.target.value)} />
      <Button type="submit">Track</Button>
    </form>
  );
}
```

`app/(app)/track/page.tsx`:
```tsx
import { TrackForm } from "./track-form";

export default function TrackPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Track a PR</h1>
      <p className="text-sm text-muted-foreground">Enter the routing slip number, or scan the QR code on the routing slip.</p>
      <TrackForm />
    </div>
  );
}
```

`components/pr/tracking-view.tsx`:
```tsx
import { Card, CardContent } from "@/components/ui/card";
import { MovementBadge } from "./movement-badge";
import { formatDateTime, locationLine, MOVEMENT_LABELS } from "@/lib/format";
import type { EventType, MovementState } from "@/lib/types";

export type TrackingResult = {
  pr_id: string | null; can_view: boolean; routing_slip_no: string; pr_no: string | null;
  origin_office_name: string; current_office_name: string; movement_state: MovementState;
  current_status_label: string | null; current_purpose: string | null; current_since: string;
  route_step: number; total_steps: number;
  timeline: { event_type: EventType; from_office_name: string | null; to_office_name: string | null; created_at: string }[];
};

const EVENT_TEXT: Partial<Record<EventType, (e: TrackingResult["timeline"][number]) => string>> = {
  created: () => "Created",
  forwarded: (e) => `Forwarded to ${e.to_office_name}`,
  received: (e) => `Received by ${e.to_office_name}`,
  returned: (e) => `Returned to ${e.to_office_name}`,
  recalled: (e) => `Recalled by ${e.to_office_name}`,
  completed: () => MOVEMENT_LABELS.completed,
  cancelled: () => MOVEMENT_LABELS.cancelled,
};

export function TrackingView({ data }: { data: TrackingResult }) {
  return (
    <Card><CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-2xl font-semibold">{data.routing_slip_no}</div>
          <div className="text-sm text-muted-foreground">PR No.: {data.pr_no ?? "Not yet assigned"} · Origin: {data.origin_office_name}</div>
        </div>
        <MovementBadge state={data.movement_state} />
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-sm font-medium" data-testid="location-line">{locationLine(data)}</p>
      <p className="text-xs text-muted-foreground">Your office is not involved in this PR, so only its location is shown.</p>
      <ol className="space-y-2 border-l pl-4 text-sm">
        {data.timeline.slice().reverse().map((e, i) => (
          <li key={i}><span className="font-medium">{EVENT_TEXT[e.event_type]?.(e) ?? e.event_type}</span>
            <span className="text-muted-foreground"> · {formatDateTime(e.created_at)}</span></li>
        ))}
      </ol>
    </CardContent></Card>
  );
}
```

`app/(app)/track/[rs]/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrackingView, type TrackingResult } from "@/components/pr/tracking-view";
import { TrackForm } from "../track-form";

export default async function TrackResultPage({ params }: { params: Promise<{ rs: string }> }) {
  const { rs } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("tracking_lookup", { p_routing_slip_no: decodeURIComponent(rs) });
  const result = data as unknown as TrackingResult | null;
  if (result?.can_view && result.pr_id) redirect(`/prs/${result.pr_id}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Track a PR</h1>
      <TrackForm />
      {result ? <TrackingView data={result} />
              : <p className="text-sm text-muted-foreground">No purchase request found for <span className="font-mono">{decodeURIComponent(rs)}</span>.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write `components/pr/routing-slip.tsx`**

```tsx
import { formatDate, formatPeso } from "@/lib/format";
import { truncate, type SlipRow } from "@/lib/pr/routing-slip";

type SlipPr = { routing_slip_no: string; pr_no: string | null; origin_office_name: string; pr_date: string; purpose: string; grand_total: number };

export function RoutingSlip({ lguName, pr, qr, rows, pageBreak }: { lguName: string; pr: SlipPr; qr: string; rows: SlipRow[]; pageBreak: boolean }) {
  return (
    <section
      className="box-border flex h-[148.5mm] w-[105mm] flex-col overflow-hidden border border-dashed border-gray-300 p-[5mm] text-[7pt] leading-tight text-black"
      style={{ breakInside: "avoid", breakAfter: pageBreak ? "page" : "auto" }}
    >
      <header className="flex gap-[3mm]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code" className="h-[22mm] w-[22mm]" />
        <div className="min-w-0 flex-1">
          <div className="uppercase">{lguName}</div>
          <div className="text-[8pt] font-bold">PURCHASE REQUEST ROUTING SLIP</div>
          <div className="font-mono text-[12pt] font-bold">{pr.routing_slip_no}</div>
          <div>PR No.: {pr.pr_no ?? "____________________"}</div>
        </div>
      </header>
      <dl className="mt-[2mm] grid grid-cols-2 gap-x-[3mm] gap-y-[0.5mm]">
        <div><dt className="inline font-semibold">Origin: </dt><dd className="inline">{pr.origin_office_name}</dd></div>
        <div><dt className="inline font-semibold">Date: </dt><dd className="inline">{formatDate(pr.pr_date)}</dd></div>
        <div className="col-span-2"><dt className="inline font-semibold">Purpose: </dt><dd className="inline">{truncate(pr.purpose, 110)}</dd></div>
        <div className="col-span-2"><dt className="inline font-semibold">Amount: </dt><dd className="inline">{formatPeso(pr.grand_total)}</dd></div>
      </dl>
      <table className="mt-[2mm] w-full table-fixed border-collapse">
        <thead>
          <tr className="text-left">
            <th className="w-[30%] border border-black px-[1mm]">Office / Purpose</th>
            <th className="w-[32%] border border-black px-[1mm]">Received by (signature over printed name)</th>
            <th className="w-[18%] border border-black px-[1mm]">Date/Time</th>
            <th className="w-[20%] border border-black px-[1mm]">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="h-[6.5mm] align-top">
              <td className="border border-black px-[1mm]">
                <div className="font-semibold">{r.label}</div>
                {r.purpose && <div className="text-[6pt]">{r.purpose}</div>}
              </td>
              <td className="border border-black" /><td className="border border-black" /><td className="border border-black" />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Write the print route**

`app/print/slips/print-toolbar.tsx`:
```tsx
"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ ids, fourUp }: { ids: string; fourUp: boolean }) {
  return (
    <div className="flex gap-2 border-b p-3 print:hidden">
      <Button onClick={() => window.print()}>Print</Button>
      <Button asChild variant="outline"><Link href={`/print/slips?ids=${ids}&layout=${fourUp ? "single" : "4up"}`}>
        {fourUp ? "One slip per sheet (1/4 A4)" : "4 slips per A4 sheet"}</Link></Button>
      <p className="self-center text-sm text-muted-foreground">Set the printer to 100% scale (no &quot;fit to page&quot;).</p>
    </div>
  );
}
```

`app/print/slips/page.tsx`:
```tsx
import QRCode from "qrcode";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { buildSlipRows, trackUrl } from "@/lib/pr/routing-slip";
import { RoutingSlip } from "@/components/pr/routing-slip";
import { PrintToolbar } from "./print-toolbar";

export default async function PrintSlipsPage({ searchParams }: { searchParams: Promise<{ ids?: string; layout?: string }> }) {
  await requireProfile();
  const { ids = "", layout } = await searchParams;
  const fourUp = layout === "4up";
  const idList = ids.split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 40);
  const supabase = await createClient();

  const [{ data: prs }, { data: steps }, { data: lgu }] = await Promise.all([
    supabase.from("pr_overview").select("*").in("id", idList.length ? idList : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("default_route_steps").select("step_order, purpose, office:offices(name)").order("step_order"),
    supabase.from("app_settings").select("value").eq("key", "lgu_name").maybeSingle(),
  ]);
  const rows = buildSlipRows((steps ?? []).map((s) => ({
    step_order: s.step_order, purpose: s.purpose, office_name: (s.office as { name: string } | null)?.name ?? "",
  })));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const ordered = idList.map((id) => prs?.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const slips = await Promise.all(ordered.map(async (pr) => ({
    pr, qr: await QRCode.toDataURL(trackUrl(appUrl, pr.routing_slip_no!), { margin: 0, width: 240, errorCorrectionLevel: "M" }),
  })));
  const lguName = String(lgu?.value ?? "");

  return (
    <div className="bg-white">
      <style>{fourUp ? "@page { size: A4 portrait; margin: 0; }" : "@page { size: 105mm 148.5mm; margin: 0; }"}</style>
      <PrintToolbar ids={idList.join(",")} fourUp={fourUp} />
      {slips.length === 0 && <p className="p-6 text-sm">No PRs to print (you may not have access to the selected PRs).</p>}
      <div className={fourUp ? "grid w-[210mm] grid-cols-2" : ""}>
        {slips.map(({ pr, qr }, i) => (
          <RoutingSlip key={pr.id} lguName={lguName} qr={qr} rows={rows}
            pageBreak={fourUp ? (i + 1) % 4 === 0 : true}
            pr={{ routing_slip_no: pr.routing_slip_no!, pr_no: pr.pr_no, origin_office_name: pr.origin_office_name!,
                  pr_date: pr.pr_date!, purpose: pr.purpose!, grand_total: Number(pr.grand_total) }} />
        ))}
      </div>
    </div>
  );
}
```

`app/print/` sits outside the `(app)` group, so it has no sidebar. `proxy.ts` still requires sign-in, and RLS limits it to PRs the user can view.

- [ ] **Step 4: Point the detail-page print button at the new route**

In `components/pr/pr-header.tsx`, change `href={`/print/slip/${pr.id}`}` to `href={`/print/slips?ids=${pr.id}&layout=single`}`.

- [ ] **Step 5: Verify manually**

1. On a PR page, click **Print routing slip**. Expected: a slip with a QR code, the RS No., 10 rows (Mayor appears three times) and 2 blank rows.
2. Open the print preview (Ctrl/Cmd+P). Expected: the paper size is 105 × 148.5 mm, and everything fits on one page.
3. Switch to **4 slips per A4 sheet**. Expected: a 2×2 grid on A4.
4. Scan the QR with a phone, or open `/track/RS-…`. As an involved user it redirects to the PR. As `treas` (uninvolved) it shows the read-only tracking view.

Run: `pnpm build`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(track): QR tracking page and 1/4-A4 routing slip printing (single or 4-up)"
```

---

### Task 25: Reports (average days per office, stuck PRs, CSV export)

**Files:**
- Create: `app/(app)/reports/page.tsx`, `app/(app)/reports/report-tables.tsx`, `app/(app)/reports/date-range.tsx`

**Interfaces:**
- Consumes: `report_office_days`, `report_stuck_prs` (Task 10); `toCsv` (Task 13); `StuckTable` (Task 22).
- Produces: `<OfficeDaysTable rows canExport from to />`, `<DateRange from to />`.

- [ ] **Step 1: Write `app/(app)/reports/date-range.tsx`**

```tsx
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: "from" | "to", v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.replace(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={(e) => set("from", e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={(e) => set("to", e.target.value)} /></div>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(app)/reports/report-tables.tsx`**

```tsx
"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { toCsv } from "@/lib/csv";

export type OfficeDaysRow = {
  office_id: string; office_code: string; office_name: string; prs_handled: number;
  avg_days: number | null; median_days: number | null; max_days: number | null; avg_transit_days: number | null;
};

const num = (v: number | null) => (v === null ? "—" : Number(v).toFixed(2));
const sortable = (key: keyof OfficeDaysRow, title: string): ColumnDef<OfficeDaysRow> => ({
  accessorKey: key, header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
  cell: ({ row }) => (typeof row.original[key] === "number" || row.original[key] === null ? num(row.original[key] as number | null) : String(row.original[key])),
});

const CSV_COLUMNS = [
  { key: "office_code", header: "Office code" }, { key: "office_name", header: "Office" },
  { key: "prs_handled", header: "PRs handled" }, { key: "avg_days", header: "Average days held" },
  { key: "median_days", header: "Median days held" }, { key: "max_days", header: "Max days held" },
  { key: "avg_transit_days", header: "Average days in transit to office" },
];

export function OfficeDaysTable({ rows, canExport, from, to }: { rows: OfficeDaysRow[]; canExport: boolean; from: string; to: string }) {
  const columns: ColumnDef<OfficeDaysRow>[] = [
    { accessorKey: "office_name", header: ({ column }) => <DataTableColumnHeader column={column} title="Office" /> },
    { accessorKey: "prs_handled", header: ({ column }) => <DataTableColumnHeader column={column} title="PRs handled" /> },
    sortable("avg_days", "Avg days held"), sortable("median_days", "Median"), sortable("max_days", "Max"),
    sortable("avg_transit_days", "Avg transit days"),
  ];
  function exportCsv() {
    const blob = new Blob([toCsv(rows as unknown as Record<string, unknown>[], CSV_COLUMNS)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `average-days-per-office_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <DataTable columns={columns} data={rows} searchPlaceholder="Filter offices…" emptyMessage="No movement in this period."
      toolbar={canExport ? <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}><Download className="mr-2 size-4" />Export CSV</Button> : null} />
  );
}
```

- [ ] **Step 3: Write `app/(app)/reports/page.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { StuckTable, type StuckRow } from "../dashboard-tables";
import { DateRange } from "./date-range";
import { OfficeDaysTable, type OfficeDaysRow } from "./report-tables";

const manilaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const to = isDate(sp.to) ? sp.to! : manilaDate(new Date());
  const from = isDate(sp.from) ? sp.from! : manilaDate(new Date(Date.now() - 30 * 86_400_000));
  const supabase = await createClient();
  const [days, stuck] = await Promise.all([
    supabase.rpc("report_office_days", { p_from: from, p_to: to }),
    supabase.rpc("report_stuck_prs"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <Card>
        <CardHeader>
          <CardTitle>Average days per office</CardTitle>
          <CardDescription>Time each office held a PR (received → forwarded/returned/completed), computed from the audit trail. Transit time is shown separately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DateRange from={from} to={to} />
          <OfficeDaysTable rows={(days.data ?? []) as OfficeDaysRow[]} canExport={profile.role !== "staff"} from={from} to={to} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Stuck PRs</CardTitle><CardDescription>Held or in transit longer than the threshold in Settings.</CardDescription></CardHeader>
        <CardContent><StuckTable rows={(stuck.data ?? []) as StuckRow[]} /></CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

After the Task 19 manual flow, `/reports` lists GSO and Mayor rows. As `admin@test.local`, **Export CSV** downloads a file that opens cleanly in a spreadsheet. As staff, there is no export button.

Run: `pnpm build`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(reports): average days per office with CSV export, stuck PRs"
```

---

### Task 26: Admin pages (users, offices, default route, statuses, settings)

**Files:**
- Create:
  - `app/(app)/admin/layout.tsx`, `app/(app)/admin/actions.ts`
  - `app/(app)/admin/users/page.tsx`, `app/(app)/admin/users/users-table.tsx`
  - `app/(app)/admin/offices/page.tsx`, `app/(app)/admin/offices/offices-table.tsx`
  - `app/(app)/admin/route/page.tsx`, `app/(app)/admin/route/route-editor.tsx`
  - `app/(app)/admin/statuses/page.tsx`, `app/(app)/admin/statuses/statuses-table.tsx`
  - `app/(app)/admin/settings/page.tsx`, `app/(app)/admin/settings/settings-form.tsx`

**Interfaces:**
- Consumes: the Task 11 admin RPCs, `requireAdmin` (Task 14), `ConfirmActionDialog`, `DataTable`.
- Produces server actions:
  - `saveProfile(input: ProfileInput)`
  - `saveOffice(input: OfficeInput)`
  - `saveRoute(steps: { office_id: string; purpose: string }[])`
  - `saveStatus(input: StatusInput)`
  - `saveSetting(key: "lgu_name" | "stuck_threshold_days" | "max_upload_mb", value: string | number)`

- [ ] **Step 1: Write `app/(app)/admin/layout.tsx` and `actions.ts`**

`app/(app)/admin/layout.tsx`:
```tsx
import { requireAdmin } from "@/lib/auth/profile";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
```

`app/(app)/admin/actions.ts`:
```ts
"use server";
import { rpcAction } from "@/lib/actions/rpc";

export type ProfileInput = { id: string | null; email: string; full_name: string; designation: string; office_id: string | null; role: "staff" | "admin"; active: boolean };
export type OfficeInput = { id: string | null; code: string; name: string; is_processing_office: boolean; can_assign_pr_no: boolean; can_set_mode_of_procurement: boolean; can_complete: boolean; active: boolean };
export type StatusInput = { id: string | null; office_id: string; label: string; sort_order: number; active: boolean };

export async function saveProfile(i: ProfileInput) {
  return rpcAction<string>("admin_upsert_profile", {
    p_id: i.id, p_email: i.email, p_full_name: i.full_name, p_designation: i.designation || null,
    p_office_id: i.office_id, p_role: i.role, p_active: i.active,
  }, ["/admin/users"]);
}
export async function saveOffice(i: OfficeInput) {
  return rpcAction<string>("admin_upsert_office", {
    p_id: i.id, p_code: i.code, p_name: i.name, p_is_processing_office: i.is_processing_office,
    p_can_assign_pr_no: i.can_assign_pr_no, p_can_set_mode_of_procurement: i.can_set_mode_of_procurement,
    p_can_complete: i.can_complete, p_active: i.active,
  }, ["/admin/offices"]);
}
export async function saveRoute(steps: { office_id: string; purpose: string }[]) {
  return rpcAction("admin_set_route", { p_steps: steps }, ["/admin/route"]);
}
export async function saveStatus(i: StatusInput) {
  return rpcAction<string>("admin_upsert_status", {
    p_id: i.id, p_office_id: i.office_id, p_label: i.label, p_sort_order: i.sort_order, p_active: i.active,
  }, ["/admin/statuses"]);
}
export async function saveSetting(key: "lgu_name" | "stuck_threshold_days" | "max_upload_mb", value: string | number) {
  return rpcAction("admin_set_setting", { p_key: key, p_value: value }, ["/admin/settings"]);
}
```

- [ ] **Step 2: Users**

`app/(app)/admin/users/users-table.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { saveProfile, type ProfileInput } from "../actions";

export type UserRow = { id: string; email: string; full_name: string; designation: string | null; office_id: string | null;
  role: "super_admin" | "admin" | "staff"; active: boolean; auth_user_id: string | null; office: { name: string } | null };
type Office = { id: string; name: string };

function UserDialog({ user, offices, isSuperAdmin, trigger }: { user: UserRow | null; offices: Office[]; isSuperAdmin: boolean; trigger: React.ReactNode }) {
  const blank: ProfileInput = { id: null, email: "", full_name: "", designation: "", office_id: null, role: "staff", active: true };
  const fromUser = (u: UserRow): ProfileInput => ({ id: u.id, email: u.email, full_name: u.full_name, designation: u.designation ?? "",
    office_id: u.office_id, role: u.role === "admin" ? "admin" : "staff", active: u.active });
  const [v, setV] = useState<ProfileInput>(user ? fromUser(user) : blank);
  const set = <K extends keyof ProfileInput>(k: K, val: ProfileInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const valid = v.email.includes("@") && v.full_name.trim() && (v.role !== "staff" || v.office_id);

  return (
    <ConfirmActionDialog
      trigger={trigger}
      title={user ? `Save changes to ${user.full_name}?` : "Create user account?"}
      description={<p>{user ? "Changes take effect on the user's next page load." : "The user can then sign in with Google using this exact email."}{v.email && <> Email: <b>{v.email}</b>.</>}</p>}
      confirmLabel={user ? "Save user" : "Create user"} successMessage={user ? "User saved" : "User created"}
      canConfirm={!!valid}
      onOpenChange={(o) => o && setV(user ? fromUser(user) : blank)}
      onConfirm={() => saveProfile(v)}
    >
      <Label htmlFor="u-email">Google email</Label>
      <Input id="u-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
      <Label htmlFor="u-name">Full name</Label>
      <Input id="u-name" value={v.full_name} onChange={(e) => set("full_name", e.target.value)} />
      <Label htmlFor="u-desig">Designation</Label>
      <Input id="u-desig" value={v.designation} onChange={(e) => set("designation", e.target.value)} />
      <Label>Office</Label>
      <Select value={v.office_id ?? "none"} onValueChange={(x) => set("office_id", x === "none" ? null : x)}>
        <SelectTrigger aria-label="Office"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No office (admins only)</SelectItem>
          {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Label>Role</Label>
      <Select value={v.role} onValueChange={(x) => set("role", x as ProfileInput["role"])}>
        <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="staff">Office staff</SelectItem>
          {isSuperAdmin && <SelectItem value="admin">Administrator</SelectItem>}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.active} onCheckedChange={(c) => set("active", !!c)} />Active (can sign in)</label>
    </ConfirmActionDialog>
  );
}

export function UsersTable({ users, offices, isSuperAdmin }: { users: UserRow[]; offices: Office[]; isSuperAdmin: boolean }) {
  const columns: ColumnDef<UserRow>[] = [
    { accessorKey: "full_name", header: ({ column }) => <DataTableColumnHeader column={column} title="Name" /> },
    { accessorKey: "email", header: "Email" },
    { id: "office", header: "Office", accessorFn: (r) => r.office?.name ?? "—" },
    { accessorKey: "role", header: "Role", cell: ({ row }) => <Badge variant="secondary">{row.original.role.replace("_", " ")}</Badge> },
    { accessorKey: "active", header: "Active", cell: ({ row }) => (row.original.active ? "Yes" : "No") },
    { id: "linked", header: "Signed in", cell: ({ row }) => (row.original.auth_user_id ? "Yes" : "Not yet") },
    { id: "edit", header: "", enableHiding: false, cell: ({ row }) => {
      const u = row.original;
      const editable = u.role === "staff" || (u.role === "admin" && isSuperAdmin);
      return editable ? <UserDialog user={u} offices={offices} isSuperAdmin={isSuperAdmin}
        trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} /> : null;
    } },
  ];
  return (
    <DataTable columns={columns} data={users} searchPlaceholder="Search users…"
      toolbar={<UserDialog user={null} offices={offices} isSuperAdmin={isSuperAdmin}
        trigger={<Button size="sm" className="h-9"><UserPlus className="mr-2 size-4" />Add user</Button>} />} />
  );
}
```

`app/(app)/admin/users/page.tsx`:
```tsx
import { requireAdmin } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { UsersTable, type UserRow } from "./users-table";

export default async function UsersPage() {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const [{ data: users }, { data: offices }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, designation, office_id, role, active, auth_user_id, office:offices(name)").order("full_name"),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="text-sm text-muted-foreground">Only emails listed here can sign in. Each user acts on behalf of their office.</p>
      <UsersTable users={(users ?? []) as UserRow[]} offices={offices ?? []} isSuperAdmin={profile.role === "super_admin"} />
    </div>
  );
}
```

- [ ] **Step 3: Offices**

`app/(app)/admin/offices/offices-table.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import type { OfficeRow } from "@/lib/supabase/rows";
import { saveOffice, type OfficeInput } from "../actions";

const FLAGS: { key: keyof OfficeInput; label: string }[] = [
  { key: "is_processing_office", label: "Processing office" },
  { key: "can_assign_pr_no", label: "Can assign PR No." },
  { key: "can_set_mode_of_procurement", label: "Can set mode of procurement" },
  { key: "can_complete", label: "Can complete PRs" },
  { key: "active", label: "Active" },
];

function OfficeDialog({ office, trigger }: { office: OfficeRow | null; trigger: React.ReactNode }) {
  const blank: OfficeInput = { id: null, code: "", name: "", is_processing_office: false, can_assign_pr_no: false, can_set_mode_of_procurement: false, can_complete: false, active: true };
  const from = (o: OfficeRow): OfficeInput => ({ id: o.id, code: o.code, name: o.name, is_processing_office: o.is_processing_office,
    can_assign_pr_no: o.can_assign_pr_no, can_set_mode_of_procurement: o.can_set_mode_of_procurement, can_complete: o.can_complete, active: o.active });
  const [v, setV] = useState<OfficeInput>(office ? from(office) : blank);
  return (
    <ConfirmActionDialog
      trigger={trigger} title={office ? `Save changes to ${office.name}?` : "Add office?"}
      description="Permission flags take effect immediately for every user in this office."
      confirmLabel={office ? "Save office" : "Add office"} successMessage="Office saved"
      canConfirm={/^[A-Za-z0-9_]{2,20}$/.test(v.code) && v.name.trim().length > 0}
      onOpenChange={(o) => o && setV(office ? from(office) : blank)}
      onConfirm={() => saveOffice(v)}
    >
      <Label htmlFor="o-code">Code</Label>
      <Input id="o-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
      <Label htmlFor="o-name">Name</Label>
      <Input id="o-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      {FLAGS.map((f) => (
        <label key={f.key} className="flex items-center gap-2 text-sm">
          <Checkbox checked={v[f.key] as boolean} onCheckedChange={(c) => setV({ ...v, [f.key]: !!c })} />{f.label}
        </label>
      ))}
    </ConfirmActionDialog>
  );
}

export function OfficesTable({ offices }: { offices: OfficeRow[] }) {
  const yes = (b: boolean) => (b ? "Yes" : "—");
  const columns: ColumnDef<OfficeRow>[] = [
    { accessorKey: "code", header: ({ column }) => <DataTableColumnHeader column={column} title="Code" /> },
    { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Name" /> },
    { accessorKey: "is_processing_office", header: "Processing", cell: ({ row }) => yes(row.original.is_processing_office) },
    { accessorKey: "can_assign_pr_no", header: "PR No.", cell: ({ row }) => yes(row.original.can_assign_pr_no) },
    { accessorKey: "can_set_mode_of_procurement", header: "Mode", cell: ({ row }) => yes(row.original.can_set_mode_of_procurement) },
    { accessorKey: "can_complete", header: "Complete", cell: ({ row }) => yes(row.original.can_complete) },
    { accessorKey: "active", header: "Active", cell: ({ row }) => yes(row.original.active) },
    { id: "edit", header: "", enableHiding: false, cell: ({ row }) => (
      <OfficeDialog office={row.original} trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} />) },
  ];
  return <DataTable columns={columns} data={offices} searchPlaceholder="Search offices…"
    toolbar={<OfficeDialog office={null} trigger={<Button size="sm" className="h-9"><Building2 className="mr-2 size-4" />Add office</Button>} />} />;
}
```

`app/(app)/admin/offices/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { OfficesTable } from "./offices-table";

export default async function OfficesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("offices").select("*").order("name");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Offices</h1>
      <OfficesTable offices={data ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Default route editor (drag and drop)**

`app/(app)/admin/route/route-editor.tsx`:
```tsx
"use client";
import { useRef, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { saveRoute } from "../actions";

type Office = { id: string; name: string };
type Step = { key: string; office_id: string; purpose: string };

function SortableStep({ step, index, offices, onChange, onRemove }: {
  step: Step; index: number; offices: Office[]; onChange: (s: Step) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.key });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
        className="flex items-center gap-2 rounded-md border bg-card p-2">
      <button type="button" aria-label={`Drag step ${index + 1}`} className="cursor-grab text-muted-foreground" {...attributes} {...listeners}><GripVertical className="size-4" /></button>
      <span className="w-8 text-sm font-semibold">{index + 1}</span>
      <Select value={step.office_id} onValueChange={(v) => onChange({ ...step, office_id: v })}>
        <SelectTrigger className="w-64" aria-label={`Step ${index + 1} office`}><SelectValue placeholder="Office" /></SelectTrigger>
        <SelectContent>{offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
      <Input aria-label={`Step ${index + 1} purpose`} value={step.purpose} onChange={(e) => onChange({ ...step, purpose: e.target.value })} placeholder="Purpose, e.g. For approval" />
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${index + 1}`} onClick={onRemove}><Trash2 className="size-4" /></Button>
    </li>
  );
}

export function RouteEditor({ initial, offices }: { initial: { id: string; office_id: string; purpose: string }[]; offices: Office[] }) {
  const counter = useRef(0);
  const [steps, setSteps] = useState<Step[]>(initial.map((s) => ({ key: s.id, office_id: s.office_id, purpose: s.purpose })));
  const name = (id: string) => offices.find((o) => o.id === id)?.name ?? "?";
  const valid = steps.length > 0 && steps.every((s) => s.office_id && s.purpose.trim());

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setSteps((s) => arrayMove(s, s.findIndex((x) => x.key === e.active.id), s.findIndex((x) => x.key === e.over!.id)));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Step 0 is always the originating office. The same office may appear more than once.</p>
      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <SortableStep key={s.key} step={s} index={i} offices={offices}
                onChange={(n) => setSteps((all) => all.map((x) => (x.key === s.key ? n : x)))}
                onRemove={() => setSteps((all) => all.filter((x) => x.key !== s.key))} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setSteps((s) => [...s, { key: `new-${counter.current++}`, office_id: "", purpose: "" }])}>
          <Plus className="mr-2 size-4" />Add step
        </Button>
        <ConfirmActionDialog
          trigger={<Button disabled={!valid}>Save route</Button>}
          title="Save the default route?"
          description={<div><p className="mb-2">PRs already in progress keep their step number. New suggestions use this route:</p>
            <ol className="list-decimal pl-5 text-sm">{steps.map((s) => <li key={s.key}>{name(s.office_id)} · {s.purpose}</li>)}</ol></div>}
          confirmLabel="Save route" successMessage="Route saved" canConfirm={valid}
          onConfirm={() => saveRoute(steps.map(({ office_id, purpose }) => ({ office_id, purpose: purpose.trim() })))}
        />
      </div>
    </div>
  );
}
```

`app/(app)/admin/route/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { RouteEditor } from "./route-editor";

export default async function RoutePage() {
  const supabase = await createClient();
  const [{ data: steps }, { data: offices }] = await Promise.all([
    supabase.from("default_route_steps").select("id, office_id, purpose").order("step_order"),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Default Route</h1>
      <RouteEditor initial={steps ?? []} offices={offices ?? []} />
    </div>
  );
}
```

The Default Route editor is an ordered list of steps rather than a table, because drag-and-drop ordering is its core interaction. It does **not** use `DataTable`. Every other admin list does.

- [ ] **Step 5: Office statuses**

`app/(app)/admin/statuses/statuses-table.tsx`:
```tsx
"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { OfficeStatusRow } from "@/lib/supabase/rows";
import { saveStatus, type StatusInput } from "../actions";

function StatusDialog({ officeId, officeName, status, trigger }: { officeId: string; officeName: string; status: OfficeStatusRow | null; trigger: React.ReactNode }) {
  const init: StatusInput = status
    ? { id: status.id, office_id: officeId, label: status.label, sort_order: status.sort_order, active: status.active }
    : { id: null, office_id: officeId, label: "", sort_order: 0, active: true };
  const [v, setV] = useState(init);
  return (
    <ConfirmActionDialog trigger={trigger}
      title={status ? `Save status "${status.label}"?` : `Add a status for ${officeName}?`}
      description="Statuses can be deactivated but not deleted, because past events refer to them."
      confirmLabel="Save status" successMessage="Status saved" canConfirm={v.label.trim().length > 0}
      onOpenChange={(o) => o && setV(init)} onConfirm={() => saveStatus(v)}>
      <Label htmlFor="s-label">Label</Label>
      <Input id="s-label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
      <Label htmlFor="s-order">Sort order</Label>
      <Input id="s-order" type="number" value={v.sort_order} onChange={(e) => setV({ ...v, sort_order: Number(e.target.value) || 0 })} />
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.active} onCheckedChange={(c) => setV({ ...v, active: !!c })} />Active</label>
    </ConfirmActionDialog>
  );
}

export function StatusesTable({ offices, officeId, statuses }: { offices: { id: string; name: string }[]; officeId: string; statuses: OfficeStatusRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const officeName = offices.find((o) => o.id === officeId)?.name ?? "";
  const columns: ColumnDef<OfficeStatusRow>[] = [
    { accessorKey: "sort_order", header: "Order" },
    { accessorKey: "label", header: "Label" },
    { accessorKey: "active", header: "Active", cell: ({ row }) => (row.original.active ? "Yes" : "No") },
    { id: "edit", header: "", enableHiding: false, cell: ({ row }) => (
      <StatusDialog officeId={officeId} officeName={officeName} status={row.original}
        trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} />) },
  ];
  return (
    <DataTable columns={columns} data={statuses} searchPlaceholder="Filter statuses…"
      toolbar={<>
        <Select value={officeId} onValueChange={(v) => router.replace(`${pathname}?office=${v}`)}>
          <SelectTrigger className="h-9 w-64" aria-label="Office"><SelectValue /></SelectTrigger>
          <SelectContent>{offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
        <StatusDialog officeId={officeId} officeName={officeName} status={null}
          trigger={<Button size="sm" className="h-9"><Plus className="mr-2 size-4" />Add status</Button>} />
      </>} />
  );
}
```

`app/(app)/admin/statuses/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { StatusesTable } from "./statuses-table";

export default async function StatusesPage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const supabase = await createClient();
  const { data: offices } = await supabase.from("offices").select("id, name").eq("active", true).order("name");
  const { office } = await searchParams;
  const officeId = offices?.find((o) => o.id === office)?.id ?? offices?.[0]?.id;
  const { data: statuses } = officeId
    ? await supabase.from("office_statuses").select("*").eq("office_id", officeId).order("sort_order")
    : { data: [] };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Office Statuses</h1>
      {officeId ? <StatusesTable key={officeId} offices={offices ?? []} officeId={officeId} statuses={statuses ?? []} />
                : <p className="text-sm text-muted-foreground">Create an office first.</p>}
    </div>
  );
}
```

- [ ] **Step 6: Settings**

`app/(app)/admin/settings/settings-form.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { saveSetting } from "../actions";

type Key = "lgu_name" | "stuck_threshold_days" | "max_upload_mb";
const FIELDS: { key: Key; label: string; type: "text" | "number"; help: string }[] = [
  { key: "lgu_name", label: "LGU name (printed on routing slips)", type: "text", help: "e.g. City Government of San Isidro" },
  { key: "stuck_threshold_days", label: "Stuck threshold (days)", type: "number", help: "PRs held or in transit this long are highlighted. 1–365." },
  { key: "max_upload_mb", label: "Max upload size (MB)", type: "number", help: "1–50." },
];

export function SettingsForm({ values }: { values: Record<Key, string> }) {
  const [v, setV] = useState(values);
  return (
    <div className="max-w-xl space-y-6">
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={f.key}>{f.label}</Label>
          <div className="flex gap-2">
            <Input id={f.key} type={f.type} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            <ConfirmActionDialog
              trigger={<Button variant="outline" disabled={v[f.key] === values[f.key] || !v[f.key].trim()}>Save</Button>}
              title={`Change "${f.label}"?`} description={<p>New value: <b>{v[f.key]}</b></p>}
              confirmLabel="Save setting" successMessage="Setting saved"
              onConfirm={() => saveSetting(f.key, f.type === "number" ? Number(v[f.key]) : v[f.key].trim())}
            />
          </div>
          <p className="text-xs text-muted-foreground">{f.help}</p>
        </div>
      ))}
    </div>
  );
}
```

`app/(app)/admin/settings/page.tsx`:
```tsx
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value").in("key", ["lgu_name", "stuck_threshold_days", "max_upload_mb"]);
  const get = (k: string) => String(data?.find((r) => r.key === k)?.value ?? "");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm values={{ lgu_name: get("lgu_name"), stuck_threshold_days: get("stuck_threshold_days"), max_upload_mb: get("max_upload_mb") }} />
    </div>
  );
}
```

- [ ] **Step 7: Verify manually**

As `admin@test.local`:
1. Add the user `new.clerk@test.local` (CSWD), and confirm. Expected: it appears with "Signed in: Not yet". The Role select has no "Administrator" option (only the super admin sees it).
2. Add the office `CEO` with name "City Engineer's Office".
3. On Default Route, drag step 3 above step 2 and save. Expected: the list order persists after reload. Drag it back and save again.
4. On Office Statuses for GSO, add "For inspection".
5. Settings: set the LGU name and save. Expected: the routing slip shows the new name.

Run: `pnpm build`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin): users, offices, drag-and-drop default route, office statuses, settings"
```

---

### Task 27: End-to-end tests (Playwright)

**Files:**
- Create:
  - `playwright.config.ts`
  - `e2e/global-setup.ts`, `e2e/helpers.ts`
  - `e2e/main-flow.spec.ts`, `e2e/return-and-override.spec.ts`, `e2e/auth.spec.ts`, `e2e/slip.spec.ts`
- Modify: `supabase/seed.sql` (add an auth user with no profile)

**Interfaces:**
- Consumes: the local seed users (Task 5) and the UI labels defined in Tasks 14–26. Button names used: "Dev sign in", "Create PR", "Forward", "Receive", "Return", "Edit", "Save changes", "Assign PR No.", "Save PR No.", "Complete", "Update status". The "Destination office" and "Return to office" comboboxes are used too.

- [ ] **Step 1: Add the unauthorized test user to `supabase/seed.sql`** (append)

```sql
-- auth user with NO profile, for the unauthorized-login E2E test
select tests.create_password_user('nobody@test.local', 'password123');
```

- [ ] **Step 2: Write the config and helpers**

`playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_ENABLE_DEV_LOGIN: "true" },
  },
});
```

`e2e/global-setup.ts`:
```ts
import { execSync } from "node:child_process";

export default function globalSetup() {
  execSync("supabase db reset", { stdio: "inherit" });
}
```

`e2e/helpers.ts`:
```ts
import { expect, type Browser, type Page } from "@playwright/test";

export async function loginAs(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/dev-login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Dev sign in" }).click();
  await page.waitForURL((u) => u.pathname === "/" || u.pathname === "/not-authorized");
  return page;
}

export async function confirm(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name, exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function createPr(page: Page, purpose: string): Promise<string> {
  await page.goto("/prs/new");
  await page.getByLabel("Purpose").fill(purpose);
  await page.getByLabel("Line 1 unit").fill("ream");
  await page.getByLabel("Line 1 description").fill("Bond paper A4");
  await page.getByLabel("Line 1 quantity").fill("10");
  await page.getByLabel("Line 1 unit cost").fill("245.50");
  await page.getByRole("button", { name: "Create PR" }).click();
  await expect(page.getByRole("dialog")).toContainText("₱2,455.00");
  await confirm(page, "Create PR");
  await page.waitForURL(/\/prs\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

export async function forwardToSuggested(page: Page) {
  await page.getByRole("button", { name: "Forward" }).click();
  await expect(page.getByRole("dialog")).toContainText("step");
  await confirm(page, "Forward");
}

export async function receive(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("button", { name: "Receive" }).click();
  await confirm(page, "Receive");
  await expect(page.getByTestId("location-line")).toContainText("Received at");
}
```

- [ ] **Step 3: Write `e2e/main-flow.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";
import { confirm, createPr, forwardToSuggested, loginAs, receive } from "./helpers";

test("PR travels the full default route and is completed by the Treasurer", async ({ browser }) => {
  const cswd = await loginAs(browser, "cswd@test.local");
  const path = await createPr(cswd, "E2E full route");
  await forwardToSuggested(cswd);
  await expect(cswd.getByTestId("location-line")).toHaveText("In transit → General Services Office · for review · step 1 of 10");

  const route = ["gso", "mayor", "budget", "mayor", "bac", "mayor", "bac", "gso", "acctg", "treas"];
  const pages: Record<string, Page> = {};
  for (let i = 0; i < route.length; i++) {
    const who = route[i];
    pages[who] ??= await loginAs(browser, `${who}@test.local`);
    const page = pages[who];
    await receive(page, path);

    if (who === "budget") {
      await page.getByRole("button", { name: "Assign PR No." }).click();
      await page.getByRole("dialog").getByLabel("PR No.").fill("2026-10-0001");
      await confirm(page, "Save PR No.");
      await expect(page.getByText("2026-10-0001")).toBeVisible();
    }
    if (i < route.length - 1) {
      await forwardToSuggested(page);
      await expect(page.getByTestId("location-line")).toContainText(`step ${i + 2} of 10`);
    }
  }

  const treas = pages.treas;
  await treas.getByRole("button", { name: "Complete" }).click();
  await confirm(treas, "Complete");
  await expect(treas.getByTestId("location-line")).toHaveText("Completed at City Treasurer's Office");

  await cswd.goto(path);
  await cswd.getByRole("tab", { name: "Timeline" }).click();
  await expect(cswd.getByText("Forwarded to Mayor's Office for signing of NOA / NTP (step 6 of 10)")).toBeVisible();
  await expect(cswd.getByRole("tabpanel").getByText("Completed", { exact: true })).toBeVisible();
});

test("notification bell shows incoming PR for destination office", async ({ browser }) => {
  const cswd = await loginAs(browser, "cswd@test.local");
  await createPr(cswd, "E2E bell");
  await forwardToSuggested(cswd);
  const gso = await loginAs(browser, "gso@test.local");
  await expect(gso.getByRole("button", { name: /Notifications \([1-9]\d* unread\)/ })).toBeVisible();
});
```

- [ ] **Step 4: Write `e2e/return-and-override.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { confirm, createPr, forwardToSuggested, loginAs, receive } from "./helpers";

test("off-route forward needs a reason; return, edit with diff, re-forward", async ({ browser }) => {
  const cswd = await loginAs(browser, "cswd@test.local");
  const path = await createPr(cswd, "E2E return flow");
  await forwardToSuggested(cswd);

  const gso = await loginAs(browser, "gso@test.local");
  await receive(gso, path);

  // Off-route forward: confirm disabled until a reason is given
  await gso.getByRole("button", { name: "Forward" }).click();
  const dialog = gso.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Destination office" }).click();
  await gso.getByRole("option", { name: "City Treasurer's Office" }).click();
  await expect(dialog).toContainText("not the default next stop");
  await expect(dialog.getByRole("button", { name: "Forward", exact: true })).toBeDisabled();
  await dialog.getByLabel("Reason for leaving the default route").fill("Testing");
  await expect(dialog.getByRole("button", { name: "Forward", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Return to CSWD
  await gso.getByRole("button", { name: "Return" }).click();
  await gso.getByRole("dialog").getByLabel("Reason").fill("Specs incomplete");
  await confirm(gso, "Return");
  await expect(gso.getByTestId("location-line")).toContainText("Returned → City Social Welfare");

  // CSWD receives, edits, re-forwards (suggestion back to GSO step 1)
  await receive(cswd, path);
  await cswd.getByRole("link", { name: "Edit" }).click();
  await cswd.getByLabel("Purpose").fill("E2E return flow (revised)");
  await cswd.getByRole("button", { name: "Save changes" }).click();
  await confirm(cswd, "Save changes");
  await cswd.waitForURL(new RegExp(`${path}$`));
  await cswd.getByRole("tab", { name: "Timeline" }).click();
  await expect(cswd.getByText("after return")).toBeVisible();
  await expect(cswd.getByText('Purpose: "E2E return flow" → "E2E return flow (revised)"')).toBeVisible();
  await forwardToSuggested(cswd);
  await expect(cswd.getByTestId("location-line")).toContainText("General Services Office · for review · step 1 of 10");
});
```

- [ ] **Step 5: Write `e2e/auth.spec.ts` and `e2e/slip.spec.ts`**

`e2e/auth.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("unauthenticated users are sent to login", async ({ page }) => {
  await page.goto("/prs");
  await expect(page).toHaveURL(/\/login\?next=%2Fprs/);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test("a signed-in account without a profile is declined", async ({ browser }) => {
  const page = await loginAs(browser, "nobody@test.local");
  await expect(page).toHaveURL(/\/not-authorized$/);
  await expect(page.getByText("Your account is not authorized. Please contact the administrator.")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
```

`e2e/slip.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { createPr, loginAs } from "./helpers";

test("routing slip renders QR code and one row per route step plus two blanks", async ({ browser }) => {
  const cswd = await loginAs(browser, "cswd@test.local");
  const path = await createPr(cswd, "E2E slip");
  const id = path.split("/").pop();
  await cswd.goto(`/print/slips?ids=${id}&layout=single`);
  await expect(cswd.getByRole("img", { name: "QR code" })).toBeVisible();
  await expect(cswd.getByText("PURCHASE REQUEST ROUTING SLIP")).toBeVisible();
  await expect(cswd.locator("section tbody tr")).toHaveCount(12);
});
```

- [ ] **Step 6: Run the E2E suite**

```bash
pnpm exec playwright install chromium
pnpm e2e
```
Expected: 6 tests pass. If a selector fails because a label differs, fix the **component** to match the label contract in this task's Interfaces, not the test.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(e2e): full route, return/override/edit, auth, routing slip"
```

---

### Task 28: Documentation, shared-project deployment, Vercel

**Files:**
- Create: `README.md`
- Modify: none in the app

**Interfaces:**
- Consumes: everything.
- Produces: the deployed app. Migrations are applied to the shared Supabase project, the `pr_tracker` schema is exposed, Google auth is configured, and the Vercel production deployment is live.

- [ ] **Step 1: Write `README.md`**

```markdown
# LGU Purchase Request Tracker

Tracks where each Purchase Request physically is and its processing status, with a tamper-proof audit trail.

## Stack
Next.js 16 · Supabase (schema `pr_tracker`, shared project) · shadcn/ui · TanStack Table · Vercel

## Local development
1. `pnpm install`
2. `supabase start` (Docker required), then copy the API URL + anon key into `.env.local` (see `.env.example`)
3. `supabase db reset` (applies migrations + local-only `supabase/seed.sql` demo users)
4. `pnpm dev` → http://localhost:3000/dev-login (password `password123`):
   cswd@, gso@, mayor@, budget@, bac@, acctg@, treas@, admin@test.local

## Tests
- `pnpm test` — unit (Vitest)
- `pnpm test:db` — database (pgTAP)
- `pnpm e2e` — end-to-end (Playwright; resets the local DB)

## Production setup (shared Supabase project)
1. Apply `supabase/migrations/*.sql` in filename order (never `seed.sql`).
2. Dashboard → Project Settings → API → **Exposed schemas**: add `pr_tracker`.
3. Dashboard → Authentication → Providers → **Google**: enabled (Client ID/secret from Google Cloud Console).
4. Authentication → URL Configuration → add `https://<vercel-domain>/auth/callback` to Redirect URLs.
5. Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL=https://<vercel-domain>`.
   **Do not** set `NEXT_PUBLIC_ENABLE_DEV_LOGIN`.
6. Sign in as the super admin (berlcamp@gmail.com), then add offices and users under Admin.

## Security notes
- Only emails listed in Admin → Users can sign in, and only through Google (`app_settings.allowed_auth_providers`).
- All writes go through `SECURITY DEFINER` functions; the audit table `pr_events` is append-only.
- No Supabase Auth hooks or Realtime are used (the project is shared).
```

- [ ] **Step 2: Run the full local verification before touching production**

```bash
supabase db reset && supabase test db && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build && pnpm e2e
```
Expected: all green. Do not continue if anything fails.

- [ ] **Step 3: Ask the owner which shared project to deploy to, and get explicit approval**

This step writes to a **shared production database**. Stop and ask: *"Which Supabase project should `pr_tracker` go into? I'll apply 11 migrations that only create objects in schema `pr_tracker`, plus the `pr-tracker-attachments` bucket and two storage policies. OK to proceed?"* Do not continue without a yes.

- [ ] **Step 4: Check for conflicts on the target project** (Supabase MCP)

- `list_tables` with `schemas: ["pr_tracker"]`. Expected: empty (the schema does not exist yet).
- `execute_sql`: `select id from storage.buckets where id = 'pr-tracker-attachments';`. Expected: no rows.
- `execute_sql`: `select policyname from pg_policies where schemaname='storage' and policyname like 'pr_tracker_%';`. Expected: no rows.

- [ ] **Step 5: Apply the migrations in order** (Supabase MCP `apply_migration`, one call per file)

Use the file's name without its timestamp prefix as `name`, and the file contents as `query`. The order is:
1. `core_tables`
2. `pr_tables`
3. `security`
4. `seed_reference_data`
5. `auth_rpc`
6. `pr_create_edit`
7. `pr_movement`
8. `pr_processing`
9. `views_reports`
10. `admin_rpc`
11. `storage`

Never apply `supabase/seed.sql`.

Then verify:
- `execute_sql`: `select count(*) from pr_tracker.default_route_steps;` → 10
- `execute_sql`: `select value from pr_tracker.app_settings where key='allowed_auth_providers';` → `["google"]`
- `get_advisors` (type `security`). Expected: no new errors referencing `pr_tracker`. Fix any warning that is about our objects before going live.

- [ ] **Step 6: Manual dashboard steps for the owner** (tell them exactly; they can't be automated safely)

1. Exposed schemas: add `pr_tracker`.
2. Google provider enabled. Add the Vercel callback URL to Redirect URLs.

- [ ] **Step 7: Deploy to Vercel**

```bash
pnpm dlx vercel link
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_URL production
pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
pnpm dlx vercel env add NEXT_PUBLIC_APP_URL production
pnpm dlx vercel --prod
```
Get the owner's confirmation before running `vercel --prod`.

- [ ] **Step 8: Production smoke test**

1. Open the production URL and click **Sign in with Google** as `berlcamp@gmail.com`. Expected: the dashboard loads with the Admin group visible.
2. `/dev-login` returns 404.
3. Sign in with a Google account that is not listed. Expected: the "not authorized" page.
4. As the super admin, create a test office and a test user (your own second Google account). Run one PR through Forward → Receive. Print the routing slip and scan the QR. Expected: it opens the production `/track/RS-…`.

- [ ] **Step 9: Commit**

```bash
git add README.md
git commit -m "docs: setup, testing and shared-project deployment guide"
```
