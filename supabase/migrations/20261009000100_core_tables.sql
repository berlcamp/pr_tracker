create schema if not exists pr_tracker;
grant usage on schema pr_tracker to authenticated, service_role;

-- Functions are NOT executable by PUBLIC unless explicitly granted.
alter default privileges in schema pr_tracker revoke execute on functions from public;

create type pr_tracker.user_role as enum ('super_admin', 'admin', 'staff');
create type pr_tracker.movement_state as enum ('draft', 'in_transit', 'received', 'returned', 'completed', 'cancelled');
create type pr_tracker.event_type as enum (
  'created', 'edited', 'forwarded', 'recalled', 'received', 'returned', 'status_changed',
  'remark_added', 'private_note_added', 'attachment_added', 'attachment_superseded',
  'pr_document_uploaded', 'pr_no_assigned', 'mode_set', 'completed', 'cancelled', 'followed', 'unfollowed');

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
