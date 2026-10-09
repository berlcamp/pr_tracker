# LGU Purchase Request Tracker — Design Spec

**Date:** 2026-10-09
**Owner / Super admin:** berlcamp@gmail.com
**Status:** Approved (revised 2026-10-09: PR document upload replaces line items)

## 1. Purpose

Let any LGU office instantly see **where a Purchase Request (PR) physically is** and **what its processing status is**, with a full, tamper-proof audit trail from creation to completion. The system tracks the paper document; it does not replace it.

### Success criteria
- For any PR, a user can see in one glance: current office, movement state, processing status, and days at the current office.
- Every action on a PR is recorded in an immutable audit trail (who, which office, when, what).
- Each office's dashboard and notification bell show what must be received and what changed on PRs they follow.
- Admins can see which offices are bottlenecks (average days per office).

## 2. Scope

### In scope
- Google sign-in with email allowlist; super admin / admin / staff roles.
- Offices (end-user departments and processing offices), managed by admins.
- PR registration: a short header (date, purpose, amount, requested by) plus a **required upload of the signed PR document**. Line items are not encoded; they live in the uploaded PR file.
- Free forwarding with a configurable default route and logged overrides.
- Two-layer status model (system movement state + office-defined processing status).
- Receive, forward, return, recall, set status, remarks, private notes, attachments, assign PR No., set mode of procurement, complete, cancel.
- Immutable audit trail, notification bell (polling), follow PRs.
- Printable 1/4-A4 routing slip with QR code. **Only the routing slip is printed**; the PR itself is never printed by the system.
- Dashboard, PR list/search, tracking page, admin settings, reports (average days per office, stuck PRs).

### Out of scope (for now)
- Supabase Realtime.
- Purchase Orders, suppliers, APP/PPMP linkage.
- Encoding PR line items (the signed PR document is uploaded instead).
- Public (unauthenticated) tracking page.
- Email/SMS notifications.
- Head/staff role distinction within an office.

## 3. Tech stack & hosting

- **Next.js** (App Router, TypeScript), server actions for mutations.
- **Supabase** (shared existing project), all tables in custom schema **`pr_tracker`**.
  - `pr_tracker` must be added to *Exposed schemas* in API settings; clients use `db: { schema: 'pr_tracker' }`.
  - `@supabase/ssr` for auth cookies.
- **Supabase Storage** bucket `pr-tracker-attachments` (buckets are project-wide; name prefixed to avoid collisions).
- **Tailwind CSS + shadcn/ui**; **TanStack Table** via the shadcn data-table pattern for **all tabular views** (sorting, filtering, pagination, column visibility).
- **UI/UX:** designed with the `ui-ux-pro-max` skill; layout uses a **dark sidebar** navigation with a light content area.
- QR generation library (e.g. `qrcode`) for routing slips.
- **Hosting:** Vercel.

## 4. Users, roles & authentication

### Roles
| Role | Capabilities |
|---|---|
| `super_admin` | Everything admins can do, plus promote/demote admins. Exactly one: berlcamp@gmail.com, defined by env var `SUPER_ADMIN_EMAIL`. |
| `admin` | Create/edit/deactivate user accounts, manage offices, default route, office statuses, office permissions, settings; view all PRs; cancel any PR; export reports. |
| `staff` | Act on behalf of their office. **All staff within an office are equal.** |

### Authentication / allowlist
- Sign-in is **Google OAuth only**.
- Admins pre-create a profile by **email** (plus name, designation, office, role).
- In the OAuth callback, the app looks up `pr_tracker.profiles` by email:
  - Found and `active` → link `auth_user_id` on first sign-in, proceed.
  - Email equals `SUPER_ADMIN_EMAIL` → auto-provision/ensure super_admin profile, proceed.
  - Otherwise → sign out immediately and show "Your account is not authorized. Please contact the administrator."
- **No Supabase Auth hooks** are used, because hooks apply project-wide and the project is shared.
- Every RLS policy also requires `pr_tracker.is_active_user()`, so a valid Google session without an active profile sees nothing.

## 5. Offices & default route

### Seed processing offices
| Code | Name |
|---|---|
| `BUDGET` | City Budget Office |
| `BAC` | Bids and Awards Committee |
| `GSO` | General Services Office |
| `MAYOR` | Mayor's Office |
| `ACCTG` | City Accounting Office |
| `TREAS` | City Treasurer's Office |

End-user departments (e.g. CSWD, CHO, CEO) are added by admins. Any office, including processing offices, can create a PR.

### Office permission flags (admin-editable)
- `is_processing_office`
- `can_assign_pr_no` — default: BUDGET only
- `can_set_mode_of_procurement` — default: BAC only
- `can_complete` — default: TREAS only

### Default route
- An ordered list of **steps** (`default_route_steps`) editable in Settings via drag-and-drop. Each step has an office and a **purpose** label. **The same office may appear in several steps.**
- Seed route (editable):

| Step | Office | Purpose |
|---|---|---|
| 0 | Origin (end-user office) | Preparation |
| 1 | GSO | For review |
| 2 | MAYOR | For approval |
| 3 | BUDGET | For certification of funds |
| 4 | MAYOR | For approval |
| 5 | BAC | For procurement |
| 6 | MAYOR | For signing of NOA / NTP |
| 7 | BAC | For processing |
| 8 | GSO | For processing |
| 9 | ACCTG | For processing |
| 10 | TREAS | For payment processing |

  Purposes for steps 3, 5, 7, 8, 9, 10 are placeholders. Admins can edit them.

### Route position
- Because offices repeat, the suggestion is based on the PR's **route position**, not its current office. Each PR stores `route_step` (0 = origin/draft).
- **Suggested next stop** = step `route_step + 1`. The forward modal preselects that office and shows its purpose, e.g. "Forward to Mayor's Office · for approval".
- **Forward rules:**
  - **Forward to the suggested step** → `route_step` advances by 1. No reason is needed.
  - **Forward to an office that appears later in the route** (skipping ahead) → `route_step` jumps to the **first later step** with that office. An override reason is required.
  - **Forward to an office not ahead in the route** (off-route, e.g. Legal, or an earlier office) → `route_step` is unchanged. An override reason is required. When that office forwards again, the suggestion is still step `route_step + 1`, so the PR rejoins the route.
- **Return / recall** → `route_step` is restored to the value it had when the destination office last held the PR (read from that office's latest `received` event).
- The forward event stores `from_route_step`, `to_route_step` and the step purpose, so the timeline reads "Forwarded to Mayor's Office for approval (step 4 of 10)".
- If admins edit the route later, PRs already in progress keep their numeric `route_step`. The suggestion uses the current route definition, and users can always override it.

## 6. Purchase Request registration

The signed PR (standard government PR form) is prepared on paper and **uploaded**. The system stores only the header data needed for tracking, search and reports.

### Header fields
| Field | Required | Notes |
|---|---|---|
| Date | yes | Defaults to today (Asia/Manila) |
| Purpose | yes | |
| Amount | yes | Total ₱ typed by the end-user; must be > 0 |
| Requested by (name, designation) | name yes | |
| Responsibility Center Code | no | |
| Fund Cluster | no | |
| Office/Section | auto | The creating office (origin) |
| PR No. | later | Assigned by Budget |
| Mode of Procurement | later | Set by BAC |

No line items and no "Approved by" fields are stored.

### PR document (required upload)
- Every PR has exactly one **current PR document**: a PDF, JPG or PNG of the signed PR.
- **Creation flow:** the user fills the header and picks the file. Confirming creates the PR as `draft`, uploads the file, and registers it as the PR document.
- **A PR cannot be forwarded until it has a current PR document** (enforced in the database).
- **Replacing:** only the origin office can upload a replacement, and only while it may edit the PR (Draft, or after it is returned and received back). The previous file is kept and automatically marked superseded. The audit trail records "PR document replaced".
- The current PR document is shown at the top of the PR page with View/Download.
- **Other attachments** (quotations, certifications, abstracts, etc.) are separate and can be added by the holding office or the origin office (see §8).

### Numbering
- **Routing Slip No.:** auto-generated at creation, format `RS-YYYY-MM-#####`. The 5-digit sequence resets yearly and is generated atomically from `routing_slip_counters`.
- **PR No.:** entered by an office with `can_assign_pr_no` (Budget); can be changed later; every assignment/change is logged.

### Editing rules
- The origin office may edit the header fields and replace the PR document **only** while the PR is `Draft`, or after it has been **returned to and received back at the origin office**.
- Once forwarded, content is locked.
- Every header edit after the first forward stores a before/after JSON snapshot in the audit event.
- Processing offices never edit PR content (except PR No. by Budget and Mode of Procurement by BAC).

## 7. Status model (two layers)

### Layer 1 — Movement state (system-managed)
| State | Meaning |
|---|---|
| `draft` | Being prepared by origin; never forwarded. |
| `in_transit` | Forwarded to an office, not yet received. |
| `received` | Physically received by the current office. |
| `returned` | Sent back to an office (reason required), not yet received. |
| `completed` | Closed by an office with `can_complete`. Terminal. |
| `cancelled` | Withdrawn (reason required). Terminal. |

### Layer 2 — Processing status (office-defined)
- Each office has its own list of status labels managed by admins in Settings (`office_statuses`).
- Only the office currently holding the PR (state `received`) can set a status, and only from its own list.
- Setting a new processing status clears nothing else; the PR's `current_status_id` is reset to null whenever it moves to a new office.
- Seed examples:
  - BUDGET: For certification of funds; Funds certified / earmarked; Insufficient funds
  - BAC: For mode determination; For posting (PhilGEPS); For canvass; Awarded
  - GSO: For review; For canvass; For purchase
  - MAYOR: For Mayor's approval; Approved; Disapproved; For signing of NOA/NTP; NOA/NTP signed
  - ACCTG: For obligation; Obligated
  - TREAS: For payment processing; Paid

### Display format
`Received at Mayor's Office · For Mayor's approval · 3 days here`

While a PR is in transit it shows the step purpose: `In transit → Mayor's Office · for signing of NOA/NTP · step 6 of 10`.

## 8. Workflow actions

All actions are **Postgres functions (RPC)** in `pr_tracker`, `SECURITY DEFINER`, with an explicit `search_path`. Each function:
1. Resolves the caller's profile/office and verifies they are active.
2. Locks the PR row with `SELECT … FOR UPDATE` and re-checks state.
3. Applies the change.
4. Inserts the `pr_events` row and the `notifications` rows **in the same transaction**.

| Function | Who | Preconditions / effect |
|---|---|---|
| `create_pr(header)` | Any active staff | Creates a `draft` PR, generates the routing slip no., sets the origin office, adds the origin to involved offices and followers. |
| `update_pr_content(pr_id, header)` | Origin office | Allowed only in `draft`, or in `received` at the origin after a return. Snapshots the change after the first forward. |
| `forward_pr(pr_id, to_office_id, override_reason?, remark?)` | Holding office | PR is `draft` (origin) or `received` at caller's office. Override reason is required if the destination isn't the office at step `route_step + 1`. Updates `route_step` per §5 Route position. Requires a current PR document. The PR becomes `in_transit`. |
| `recall_pr(pr_id, reason?)` | The office that forwarded/returned it | Only while still `in_transit`/`returned` (not yet received). The PR returns to `received` at the caller's office (or `draft` if it was never received elsewhere), and `route_step` is restored to the caller's value. |
| `receive_pr(pr_id)` | Destination office staff | PR is `in_transit` or `returned` to caller's office. The PR becomes `received`; sets `current_since = now()`, clears `current_status_id`, adds the office to involved offices. |
| `return_pr(pr_id, to_office_id, reason)` | Holding office | Destination must be the origin or an office that previously held the PR. Reason required. Restores `route_step` to the destination's last value. The PR becomes `returned`. |
| `set_status(pr_id, status_id, remark?)` | Holding office | Status belongs to caller's office. |
| `add_remark(pr_id, body)` | Holding office or origin office | Visible to involved offices. |
| `add_private_note(pr_id, body)` | Holding office | Visible only to the authoring office. |
| `register_attachment(pr_id, path, filename, size, mime, is_pr_document)` | Holding office or origin office; **PR document: origin office while editable** | Called after a successful storage upload. A new PR document supersedes the previous one. |
| `supersede_attachment(attachment_id, reason)` | Uploading office | Attachments are never deleted; they're marked superseded. The current PR document can only be replaced, not superseded on its own. |
| `assign_pr_no(pr_id, pr_no)` | Office with `can_assign_pr_no` while holding | PR No. is unique when not null. |
| `set_mode_of_procurement(pr_id, mode)` | Office with `can_set_mode_of_procurement` while holding | — |
| `complete_pr(pr_id, remark?)` | Office with `can_complete` while holding | The PR becomes `completed`. |
| `cancel_pr(pr_id, reason)` | Origin office (while `draft` or `received` at origin) or any admin | The PR becomes `cancelled`. |
| `follow_pr(pr_id)` / `unfollow_pr(pr_id)` | Any involved office | — |
| `tracking_lookup(routing_slip_no)` | Any active user | Returns only: routing slip no., PR No., origin office, current office, movement state, processing status, current_since, and a timeline of movement events (office + timestamp, no remarks). |

## 9. Data model (`pr_tracker` schema)

```
offices(id, code UNIQUE, name, is_processing_office, can_assign_pr_no,
        can_set_mode_of_procurement, can_complete, active, created_at)

profiles(id, auth_user_id UNIQUE NULL, email UNIQUE, full_name, designation,
         office_id → offices NULL (required for staff; admins may have none),
         role ENUM(super_admin, admin, staff),
         active, created_at, updated_at)

purchase_requests(id, routing_slip_no UNIQUE, pr_no UNIQUE NULL,
         origin_office_id → offices, responsibility_center_code, fund_cluster,
         pr_date, purpose, requested_by_name, requested_by_designation,
         mode_of_procurement NULL, amount NUMERIC > 0,
         movement_state ENUM, current_office_id → offices,
         current_status_id → office_statuses NULL, current_since TIMESTAMPTZ,
         route_step INT DEFAULT 0,
         first_forwarded_at NULL, created_by → profiles, created_at, updated_at)

pr_involved_offices(pr_id, office_id, PRIMARY KEY(pr_id, office_id))

default_route_steps(id, step_order UNIQUE, office_id → offices, purpose)
   -- office_id is NOT unique: offices can repeat in the route

office_statuses(id, office_id → offices, label, sort_order, active)

routing_slip_counters(year PRIMARY KEY, last_value)

pr_events(id, pr_id, event_type ENUM, actor_id → profiles,
          actor_office_id → offices, from_office_id NULL, to_office_id NULL,
          status_id NULL, override_reason NULL, remark NULL,
          from_route_step NULL, to_route_step NULL, route_purpose NULL,
          payload JSONB,
          created_at)
   event_type: created, edited, forwarded, recalled, received, returned,
               status_changed, remark_added, private_note_added,
               attachment_added, attachment_superseded, pr_document_uploaded,
               pr_no_assigned,
               mode_set, completed, cancelled, followed, unfollowed

pr_remarks(id, pr_id, office_id, author_id, body, created_at)
pr_private_notes(id, pr_id, office_id, author_id, body, created_at)
pr_attachments(id, pr_id, office_id, uploaded_by, storage_path, filename,
               size_bytes, mime_type, is_pr_document BOOLEAN,
               superseded_at NULL,
               superseded_reason NULL, created_at)

pr_followers(pr_id, office_id, PRIMARY KEY(pr_id, office_id))

notifications(id, recipient_office_id, pr_id, event_id → pr_events,
              type, created_at)
notification_reads(notification_id, profile_id, read_at,
                   PRIMARY KEY(notification_id, profile_id))

app_settings(key PRIMARY KEY, value JSONB)
   e.g. stuck_threshold_days = 5, lgu_name, max_upload_mb = 20
```

Private notes do write a `pr_events` row (type `private_note_added`) so the timeline records that *a* note was added. The event row does not contain the note body, and the event is shown only to the authoring office.

## 10. Security (RLS & grants)

- RLS is enabled on every table in `pr_tracker`.
- Helper functions: `is_active_user()`, `current_office_id()`, `is_admin()`, `is_involved(pr_id)`.
- **Read:**
  - PRs, remarks, attachments, events, and followers → `is_admin() OR is_involved(pr_id)`.
  - Private notes and private-note events → `office_id = current_office_id()`.
  - Notifications → `recipient_office_id = current_office_id()`.
  - Offices, office statuses, and the default route → any active user.
  - Profiles → any active user can read basic fields; only admins can write.
- **Write:** direct `INSERT/UPDATE/DELETE` on workflow tables is **revoked** from `authenticated`. All writes go through RPC functions. `pr_events` has no update/delete path for anyone.
- Admin-managed tables (offices, profiles, default route, statuses, settings) are written through admin RPCs that check `is_admin()`. Promoting or demoting admins checks `super_admin`.
- **Storage:** the bucket `pr-tracker-attachments` is private, with paths `{pr_id}/{uuid}-{filename}`. Upload/read are allowed when the user is involved in that PR (path-prefix check). There is no delete policy. Downloads use short-lived signed URLs.
- Size limit `max_upload_mb` (default 20). Allowed types: PDF, JPG/PNG, DOCX, XLSX.

## 11. Notifications

- **No Realtime.** The bell fetches the unread count on page load and polls every **60 s** while the tab is visible.
- Notifications are addressed to an **office**. Read state is **per user** (`notification_reads`).
- Triggers (created inside the action functions):
  - Your office is the destination of a forward or return.
  - A PR your office follows is received, gets a status change, remark, or attachment, or is completed or cancelled.
  - A PR your office forwarded is received by the destination.
- The actor's own office is not notified about its own actions.
- The bell dropdown shows the latest 20, with a "Mark all as read" option. Clicking an item opens the PR and marks it read.

## 12. Screens

### Layout
- A **dark sidebar** for navigation (Dashboard, Purchase Requests, New PR, Track, Reports, Admin [admins only]), with a collapsible version on mobile.
- Top bar: global search by routing slip / PR No., the notification bell, and a user menu (name, office, sign out).
- The UI/UX design system (colors, typography, spacing, components) is produced with the `ui-ux-pro-max` skill during implementation.

### Data tables
- **All list views use TanStack Table** (shadcn data-table pattern): sortable columns, column filters, global search, pagination, and column visibility toggle. Server-side pagination is used where lists can grow large (PR list, audit, reports).

### Pages
1. **Sign-in:** a "Sign in with Google" button, and a not-authorized page.
2. **Dashboard**, scoped to the user's office:
   - Summary cards: Incoming, On hand, Drafts, Completed this month.
   - **Incoming** table: PRs `in_transit`/`returned` to my office, with how long each has been waiting and a Receive action.
   - **On hand** table: PRs `received` at my office, sorted by days held, with stale ones highlighted (≥ `stuck_threshold_days`).
   - **My office's PRs** table: current location, status, and days there.
   - **Following:** recent activity on followed PRs.
3. **Purchase Requests list:** searchable/filterable data table (state, current office, origin, date range, amount).
4. **New / Edit PR:** the header fields plus the PR document upload (required on create; optional replacement on edit).
5. **PR detail:**
   - Header: RS No., PR No., location, state, processing status, and days here.
   - Action bar showing only permitted actions.
   - PR document card (View/Download; Replace when allowed). If missing, a prompt to upload it and a note that forwarding is blocked.
   - Tabs: Details, Timeline (audit trail incl. edit diffs), Remarks, Attachments, Private notes.
   - Print Routing Slip button.
6. **Track page** (`/track/[routingSlipNo]`): the QR target. Involved users are redirected to the full detail page; others see the read-only tracking view.
7. **Reports:** average days per office; stuck PRs.
8. **Admin:** Users, Offices (incl. permission flags), Default Route (drag-and-drop), Office Statuses, Settings.

### Confirmation modals
- **Every action button** opens a confirmation modal stating exactly what will happen. Example: "Forward RS-2026-10-00012 to Mayor's Office?"
- This applies to all workflow actions, remark/note/attachment submission, and admin changes.
- Reasons and remarks (override, return, cancel, recall) are entered inside the modal.
- The forward modal preselects the suggested step's office and purpose. When the user picks a different office, the modal shows a warning and requires a reason.
- The confirm button shows a loading state and is disabled while pending (no double submits).

## 13. Routing slip (print)

- Size: **1/4 of A4 (105 × 148.5 mm)**, printed on separate bond paper.
- A print-optimized route with `@page` CSS. It offers one slip per sheet, or **4-up: the routing slips of up to four different PRs on one A4 sheet** for cutting (selected from the PR list). The PR itself is never printed.
- Contents:
  - LGU name (from settings) and the title "PURCHASE REQUEST ROUTING SLIP".
  - **QR code** → `{APP_URL}/track/{routing_slip_no}`.
  - Routing Slip No. in large type.
  - PR No. (blank if unassigned), origin office, date, purpose (truncated), amount.
  - A signature table with columns **Office / Purpose | Received by (signature over printed name) | Date/Time | Remarks**. There is one row per route step (10 with the seed route, in step order, so repeated offices get separate rows), plus 2 blank rows for overrides.
  - Fitting ~12 rows on a 148.5 mm-tall slip means compact rows (~6.5 mm), small type (~7 pt) and a small QR code (~22 mm) beside the header. If the route grows too long for one side, the table continues on the back of the slip.

## 14. Reports

- **Average days per office** (date-range filter):
  - Per office: PRs handled, average / median / max days held.
  - Days held = time from a `received` event to the next `forwarded`/`returned`/`completed`/`cancelled` event from that office for the same PR.
  - Transit time (forwarded → received) is reported separately per destination office.
  - Admins can export it as CSV.
- **Stuck PRs:** PRs currently held or in transit for ≥ `stuck_threshold_days`.
- Implemented as SQL views/functions over `pr_events` to stay consistent with the audit trail.

## 15. Error handling

- Workflow functions raise descriptive errors, e.g. `PR is not at your office` or `Already received by Juan Dela Cruz (GSO) at 10:42 AM`. The UI surfaces them as toasts and refreshes the PR.
- Concurrency is handled by row locks plus state re-checks in every function.
- **Uploads:** client-side and storage-policy size/type checks. The metadata row is registered only after a successful upload. A failed registration leaves an orphan file that can be cleaned up later; it is never shown.
- **Auth:** unauthorized emails are signed out and shown the not-authorized page. Deactivated users lose access on their next request (RLS).
- Form validation uses zod on the client and in server actions. The database enforces constraints (amount > 0, required fields, PR document before forwarding).

## 16. Testing

- **Database:** pgTAP (or SQL test scripts) per workflow function covering:
  - allowed vs. blocked actions per role/office;
  - state transitions;
  - RLS visibility (involved vs. non-involved offices, private notes);
  - immutability of `pr_events`;
  - routing slip number generation;
  - PR document required before forwarding, and replacement rules.
- **App unit tests (Vitest):** days-held calculations, form schemas, permissions mirror, timeline/diff text.
- **End-to-end (Playwright):**
  - Main path: create (with PR document upload) → forward → receive → set status → assign PR No. → … → complete.
  - Return + edit + re-forward.
  - Override with reason.
  - Unauthorized login.
  - Routing slip print view renders a QR code.

## 17. Deployment & setup

- Migrations live in `supabase/migrations/`, all objects in schema `pr_tracker`.
- Seed: processing offices, default route, starter office statuses, app settings, and the super admin profile.
- **Manual steps (owner):**
  1. Add `pr_tracker` to Supabase *Exposed schemas*.
  2. Enable the Google auth provider (if not already) and add the Vercel URL(s) to the redirect URLs.
  3. Create the storage bucket (or let the migration create it).
  4. Set Vercel environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPER_ADMIN_EMAIL`, `NEXT_PUBLIC_APP_URL`.
- No service-role key is required by the app at runtime; all privileged logic runs in `SECURITY DEFINER` functions.
