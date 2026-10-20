-- SAAO core: reference data, books, hierarchy, movements, obligations, allotments, extras, access, audit.
-- Additive only. All writes go through security definer RPCs (later migrations); tables are read-only via RLS.

-- ---------- reference data ----------
create table pr_tracker.saao_funds (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true
);

create table pr_tracker.saao_classifications (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

insert into pr_tracker.saao_funds (code, name) values ('GF', 'General Fund') on conflict do nothing;
insert into pr_tracker.saao_classifications (code, name, sort_order) values
  ('PS', 'Personal Services', 10),
  ('MOOE', 'Maintenance and Other Operating Expenses', 20),
  ('CO', 'Capital Outlay', 30)
on conflict do nothing;

-- ---------- access (created early: the role helper reads it) ----------
create table pr_tracker.saao_access (
  profile_id uuid primary key references pr_tracker.profiles (id),
  role text not null check (role in ('viewer', 'encoder', 'finalizer', 'budget_admin')),
  granted_by uuid references pr_tracker.profiles (id),
  granted_at timestamptz not null default now()
);

-- ---------- books ----------
create table pr_tracker.saao_books (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null,
  fund_id uuid not null references pr_tracker.saao_funds (id),
  title text not null,
  allotment_mode text not null default 'equals_adjusted' check (allotment_mode in ('equals_adjusted', 'recorded')),
  movement_rule text not null default 'all_entered' check (movement_rule in ('all_entered', 'approved_only')),
  extra_labels jsonb not null default '{"cna_1":"C N A","cna_2":"C N A","cna_3":"C N A","savings":"Savings"}'::jsonb,
  header_lines jsonb not null default '[]'::jsonb,
  certifier_name text,
  certifier_title text,
  created_by uuid references pr_tracker.profiles (id),
  created_at timestamptz not null default now(),
  unique (fiscal_year, fund_id)
);

-- ---------- hierarchy ----------
create table pr_tracker.saao_nodes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references pr_tracker.saao_books (id),
  parent_id uuid references pr_tracker.saao_nodes (id),
  sort_order int not null default 0,
  kind text not null check (kind in ('section', 'group', 'classification', 'line', 'note')),
  label text not null,
  account_code text,
  classification_id uuid references pr_tracker.saao_classifications (id),
  office_id uuid references pr_tracker.offices (id),
  total_label text,
  show_total boolean not null default true,
  appropriation numeric(18,2) not null default 0,
  appropriation_ref text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saao_nodes_tree_idx on pr_tracker.saao_nodes (book_id, parent_id, sort_order);

create or replace function pr_tracker._saao_nodes_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_parent record;
begin
  if new.parent_id is not null then
    select book_id, kind into v_parent from pr_tracker.saao_nodes where id = new.parent_id;
    if v_parent.book_id is distinct from new.book_id then
      raise exception 'A node must be in the same book as its parent';
    end if;
    if v_parent.kind in ('line', 'note') then
      raise exception 'A line or note cannot have children';
    end if;
  end if;
  if new.kind <> 'line' and new.appropriation <> 0 then
    raise exception 'Only a line can carry an appropriation';
  end if;
  if new.kind = 'classification' and new.classification_id is null then
    raise exception 'A classification heading needs a classification';
  end if;
  return new;
end $$;

create trigger saao_nodes_guard before insert or update on pr_tracker.saao_nodes
  for each row execute function pr_tracker._saao_nodes_guard();
create trigger saao_nodes_touch before update on pr_tracker.saao_nodes
  for each row execute function pr_tracker.touch_updated_at();

-- ---------- movements ----------
create table pr_tracker.saao_movements (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references pr_tracker.saao_books (id),
  kind text not null check (kind in ('supplemental', 'realignment', 'augmentation', 'reversion', 'nta_reduction', 'other')),
  sb_number int,
  reference_no text,
  title text,
  effective_date date not null,
  status text not null default 'approved' check (status in ('pending', 'approved', 'cancelled')),
  status_note text,
  remarks text,
  created_by uuid references pr_tracker.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'supplemental') = (sb_number is not null))
);
create unique index saao_movements_sb_uq on pr_tracker.saao_movements (book_id, sb_number) where sb_number is not null;
create trigger saao_movements_touch before update on pr_tracker.saao_movements
  for each row execute function pr_tracker.touch_updated_at();

create table pr_tracker.saao_movement_lines (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references pr_tracker.saao_movements (id) on delete cascade,
  node_id uuid not null references pr_tracker.saao_nodes (id),
  amount numeric(18,2) not null check (amount <> 0),
  unique (movement_id, node_id)
);
create index saao_movement_lines_node_idx on pr_tracker.saao_movement_lines (node_id);

-- ---------- obligations, allotments, extras ----------
create table pr_tracker.saao_obligations (
  node_id uuid not null references pr_tracker.saao_nodes (id),
  month smallint not null check (month between 1 and 12),
  amount numeric(18,2) not null,
  entry text,
  updated_by uuid references pr_tracker.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (node_id, month)
);

create table pr_tracker.saao_allotments (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references pr_tracker.saao_nodes (id),
  amount numeric(18,2) not null,
  reference_no text,
  allotment_date date,
  status text not null default 'approved' check (status in ('pending', 'approved', 'cancelled')),
  remarks text,
  created_by uuid references pr_tracker.profiles (id),
  created_at timestamptz not null default now()
);
create index saao_allotments_node_idx on pr_tracker.saao_allotments (node_id);

create table pr_tracker.saao_line_extras (
  node_id uuid not null references pr_tracker.saao_nodes (id),
  field text not null check (field in ('cna_1', 'cna_2', 'cna_3', 'savings')),
  mode text not null check (mode in ('balance', 'amount')),
  amount numeric(18,2),
  primary key (node_id, field),
  check ((mode = 'amount') = (amount is not null))
);

-- ---------- audit ----------
create table pr_tracker.saao_audit (
  id bigserial primary key,
  book_id uuid references pr_tracker.saao_books (id),
  actor_id uuid references pr_tracker.profiles (id),
  at timestamptz not null default now(),
  entity text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb
);

-- ---------- helpers ----------
create or replace function pr_tracker._saao_rank(p_role text)
returns int language sql immutable set search_path = '' as $$
  select case p_role when 'viewer' then 1 when 'encoder' then 2 when 'finalizer' then 3
                     when 'budget_admin' then 4 else 0 end
$$;

create or replace function pr_tracker.saao_role()
returns text language sql stable security definer set search_path = '' as $$
  select a.role from pr_tracker.saao_access a
    join pr_tracker.profiles p on p.id = a.profile_id
   where p.auth_user_id = auth.uid() and p.active
$$;

create or replace function pr_tracker.saao_my_access()
returns text language sql stable security definer set search_path = '' as $$
  select pr_tracker.saao_role()
$$;

create or replace function pr_tracker._saao_require(p_min text)
returns pr_tracker.profiles language plpgsql stable security definer set search_path = '' as $$
declare v_role text := pr_tracker.saao_role(); v_profile pr_tracker.profiles;
begin
  if v_role is null then raise exception 'Budget access required'; end if;
  if pr_tracker._saao_rank(v_role) < pr_tracker._saao_rank(p_min) then
    raise exception 'Your budget role does not allow this';
  end if;
  select * into v_profile from pr_tracker.profiles where auth_user_id = auth.uid() and active;
  return v_profile;
end $$;

create or replace function pr_tracker._saao_audit(
  p_book_id uuid, p_actor_id uuid, p_entity text, p_entity_id uuid, p_action text,
  p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into pr_tracker.saao_audit (book_id, actor_id, entity, entity_id, action, before, after)
  values (p_book_id, p_actor_id, p_entity, p_entity_id, p_action, p_before, p_after)
$$;

-- RLS policies call these as the signed-in user; _saao_require and _saao_audit stay internal.
grant execute on function pr_tracker.saao_role(), pr_tracker._saao_rank(text), pr_tracker.saao_my_access()
  to authenticated;

-- ---------- RLS: read-only ----------
alter table pr_tracker.saao_funds enable row level security;
alter table pr_tracker.saao_classifications enable row level security;
alter table pr_tracker.saao_books enable row level security;
alter table pr_tracker.saao_nodes enable row level security;
alter table pr_tracker.saao_movements enable row level security;
alter table pr_tracker.saao_movement_lines enable row level security;
alter table pr_tracker.saao_obligations enable row level security;
alter table pr_tracker.saao_allotments enable row level security;
alter table pr_tracker.saao_line_extras enable row level security;
alter table pr_tracker.saao_access enable row level security;
alter table pr_tracker.saao_audit enable row level security;

create policy saao_funds_select on pr_tracker.saao_funds for select to authenticated
  using (pr_tracker.saao_role() is not null);
create policy saao_classifications_select on pr_tracker.saao_classifications for select to authenticated
  using (pr_tracker.saao_role() is not null);
create policy saao_books_select on pr_tracker.saao_books for select to authenticated
  using (pr_tracker.saao_role() is not null);

create policy saao_nodes_select on pr_tracker.saao_nodes for select to authenticated
  using (pr_tracker._saao_rank(pr_tracker.saao_role()) >= 2);
create policy saao_movements_select on pr_tracker.saao_movements for select to authenticated
  using (pr_tracker._saao_rank(pr_tracker.saao_role()) >= 2);
create policy saao_movement_lines_select on pr_tracker.saao_movement_lines for select to authenticated
  using (pr_tracker._saao_rank(pr_tracker.saao_role()) >= 2);
create policy saao_obligations_select on pr_tracker.saao_obligations for select to authenticated
  using (pr_tracker._saao_rank(pr_tracker.saao_role()) >= 2);
create policy saao_allotments_select on pr_tracker.saao_allotments for select to authenticated
  using (pr_tracker._saao_rank(pr_tracker.saao_role()) >= 2);
create policy saao_line_extras_select on pr_tracker.saao_line_extras for select to authenticated
  using (pr_tracker._saao_rank(pr_tracker.saao_role()) >= 2);

create policy saao_access_select on pr_tracker.saao_access for select to authenticated
  using (pr_tracker._saao_rank(pr_tracker.saao_role()) >= 4
         or pr_tracker.is_admin() or profile_id = pr_tracker.current_profile_id());
create policy saao_audit_select on pr_tracker.saao_audit for select to authenticated
  using (pr_tracker._saao_rank(pr_tracker.saao_role()) >= 3);

grant select on pr_tracker.saao_funds, pr_tracker.saao_classifications, pr_tracker.saao_books,
  pr_tracker.saao_nodes, pr_tracker.saao_movements, pr_tracker.saao_movement_lines,
  pr_tracker.saao_obligations, pr_tracker.saao_allotments, pr_tracker.saao_line_extras,
  pr_tracker.saao_access, pr_tracker.saao_audit to authenticated;
