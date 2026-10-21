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
  - On machines without a bundled Playwright Chromium (e.g. macOS 13), use installed Chrome instead: `PW_CHANNEL=chrome pnpm e2e` (`playwright.config.ts` reads `PW_CHANNEL` as the browser channel).

## Budget / SAAO module
Status of Appropriation, Allotment and Obligation reports, with a budget dashboard, history, Excel export and print layout (`/budget`). Design and rules: `docs/superpowers/specs/2026-10-20-saao-design.md`.

- **Roles** (one per user, lowest to highest): `viewer` (finalized reports only), `encoder` (edits the live book, creates drafts), `finalizer` (finalizes and revises reports), `budget_admin` (also creates books and manages settings). PR `admin` / `super_admin` can manage access only.
- **Granting access:** Budget Settings → Access (`/budget/settings`), by a budget admin or a PR admin.
- **Migrations** (apply in this order, by hand; see Production setup): `20261020000100_saao_core`, `...0200_saao_structure_rpc`, `...0300_saao_entry_rpc`, `...0400_saao_compute`, `...0500_saao_reports`, `...0600_saao_seed_fy2026_gf`. The `0600` migration is the one-time FY2026 General Fund seed; it is idempotent, so re-running it changes nothing.
- **Production:** you apply these migrations to the shared project yourself. Never run `supabase db reset` or `seed.sql` against it.
- **PostgREST `max_rows`:** the hosted project must allow at least 1000 (Dashboard → Project Settings → API). The app reads in pages of 1000 rows.
- **Open questions** for the Budget Office (provisional rules R3, R5, R7, R9, R11, R12 and awaiting rules R13-R15): spec section 9.
- **E2E on a production build** (the dev server is flaky): `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true pnpm build`, then `PW_CHANNEL=chrome pnpm exec playwright test -c playwright.prod.config.ts` (serves on :3100). `e2e/global-setup.ts` creates the SAAO test users `budget.encoder@`, `budget.finalizer@` (budget_admin) and `mayor.viewer@x.test`.

## Production setup (shared Supabase project)
1. Apply `supabase/migrations/*.sql` **manually** (Dashboard SQL editor or `psql`), one file at a time in filename order.
   The project is shared: **never** run `supabase db push`, `supabase db reset`, or `seed.sql` against it.
2. Dashboard → Project Settings → API → **Exposed schemas**: add `pr_tracker`.
3. Dashboard → Authentication → Providers → **Google**: enabled (Client ID/secret from Google Cloud Console).
4. Authentication → URL Configuration → add `https://<vercel-domain>/auth/callback` to Redirect URLs.
5. Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL=https://<vercel-domain>`.
   `NEXT_PUBLIC_APP_URL` is **required**: the QR codes on printed routing slips link to it.
   **Do not** set `NEXT_PUBLIC_ENABLE_DEV_LOGIN`.
6. Sign in as the super admin (berlcamp@gmail.com), then add offices and users under Admin.

## Security notes
- Only emails listed in Admin → Users can sign in, and only through Google (`app_settings.allowed_auth_providers`).
- All writes go through `SECURITY DEFINER` functions; the audit table `pr_events` is append-only.
- No Supabase Auth hooks or Realtime are used (the project is shared).
