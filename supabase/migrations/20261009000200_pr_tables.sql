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
  amount numeric(16,2) not null check (amount > 0),
  mode_of_procurement text,
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
  is_pr_document boolean not null default false,
  superseded_at timestamptz,
  superseded_reason text,
  created_at timestamptz not null default now()
);
create index pr_attachments_pr_idx on pr_tracker.pr_attachments (pr_id);
create unique index pr_attachments_one_current_pr_document on pr_tracker.pr_attachments (pr_id)
  where is_pr_document and superseded_at is null;

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
