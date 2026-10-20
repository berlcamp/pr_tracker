-- SAAO reports: draft, finalize, revise, immutable snapshots (spec §4.8, §6, §7). Additive only.
-- Finalized and superseded reports are official LGU figures: their rows can never be updated or
-- deleted (no RPC, select-only grants, and guard triggers that also stop the table owner).

-- ---------- tables ----------
create table pr_tracker.saao_reports (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references pr_tracker.saao_books (id),
  cutoff_date date not null check (extract(day from cutoff_date + 1) = 1),  -- month end
  version int not null default 1 check (version >= 1),
  status text not null default 'draft' check (status in ('draft', 'finalized', 'superseded')),
  revision_of uuid references pr_tracker.saao_reports (id),
  revision_reason text,
  rules jsonb,
  header jsonb,
  movements jsonb,
  acknowledged_unapproved jsonb,
  created_by uuid references pr_tracker.profiles (id),
  created_at timestamptz not null default now(),
  finalized_by uuid references pr_tracker.profiles (id),
  finalized_at timestamptz,
  unique (book_id, cutoff_date, version)
);
create unique index saao_reports_one_draft on pr_tracker.saao_reports (book_id, cutoff_date) where status = 'draft';
create unique index saao_reports_one_finalized on pr_tracker.saao_reports (book_id, cutoff_date) where status = 'finalized';

create table pr_tracker.saao_report_rows (
  report_id uuid not null references pr_tracker.saao_reports (id),
  seq int not null,
  node_id uuid,  -- traceability only; no FK so later node deletes cannot break history
  parent_seq int,
  depth int not null,
  kind text not null,
  label text not null,
  account_code text,
  classification_code text,
  classification_name text,
  section_seq int not null,
  total_label text,
  show_total boolean not null,
  -- line amounts; non-line rows carry nulls (totals are re-derived by the rollup)
  appropriation numeric(18,2),
  nta numeric(18,2),
  sb jsonb,
  supplemental numeric(18,2),
  realignment numeric(18,2),
  total_changes numeric(18,2),
  adjusted numeric(18,2),
  allotment numeric(18,2),
  obligation numeric(18,2),
  months numeric(18,2)[],
  balance_appropriation numeric(18,2),
  balance_allotment numeric(18,2),
  cna_1 numeric(18,2),
  cna_2 numeric(18,2),
  cna_3 numeric(18,2),
  savings numeric(18,2),
  savings_half numeric(18,2),
  primary key (report_id, seq)
);

-- ---------- immutability guards ----------
create or replace function pr_tracker._saao_report_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'A finalized report cannot be changed'; end if;
    return old;
  end if;
  if old.status = 'draft' then return new; end if;
  -- the only change allowed after finalization: finalized -> superseded, nothing else
  if old.status = 'finalized' and new.status = 'superseded'
     and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
    return new;
  end if;
  raise exception 'A finalized report cannot be changed';
end $$;

create trigger saao_reports_guard before update or delete on pr_tracker.saao_reports
  for each row execute function pr_tracker._saao_report_guard();

create or replace function pr_tracker._saao_report_rows_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select status from pr_tracker.saao_reports where id = new.report_id) is distinct from 'draft' then
      raise exception 'Report snapshots cannot be changed';
    end if;
    return new;
  end if;
  raise exception 'Report snapshots cannot be changed';
end $$;

create trigger saao_report_rows_guard before insert or update or delete on pr_tracker.saao_report_rows
  for each row execute function pr_tracker._saao_report_rows_guard();

-- ---------- internal helpers (NOT granted) ----------
-- Every active node of the book in DFS pre-order; an inactive node and its whole subtree are
-- left out (they carry no figures: spec §4.3 and the deactivation guards in saao_update_node). Siblings: sort_order, created_at, id (ruling R-A; the
-- TS editor uses the same order). classification_* is the effective classification: a
-- classification node's own; a line's own or else the nearest classification ancestor; any other
-- node's nearest classification ancestor; null if none.
create or replace function pr_tracker._saao_tree_rows(p_book_id uuid)
returns table (
  seq int, node_id uuid, parent_seq int, depth int, kind text, label text, account_code text,
  classification_code text, classification_name text, section_seq int, total_label text, show_total boolean)
language sql stable security definer set search_path = '' as $$
  with recursive ranked as (
    select n.*, row_number() over (partition by n.parent_id order by n.sort_order, n.created_at, n.id) as rk
    from pr_tracker.saao_nodes n where n.book_id = p_book_id and n.active
  ),
  tree as (
    select r.id, r.parent_id, r.kind, r.label, r.account_code, r.classification_id, r.total_label,
      r.show_total, 0 as depth, array[r.rk] as path, r.id as root_id, null::uuid as inherited_cls
    from ranked r where r.parent_id is null
    union all
    select c.id, c.parent_id, c.kind, c.label, c.account_code, c.classification_id, c.total_label,
      c.show_total, t.depth + 1, t.path || c.rk, t.root_id,
      case when t.kind = 'classification' then t.classification_id else t.inherited_cls end
    from ranked c join tree t on c.parent_id = t.id
  ),
  numbered as (
    select t.*, (row_number() over (order by t.path))::int as n_seq from tree t
  )
  select n.n_seq, n.id, p.n_seq, n.depth, n.kind, n.label, n.account_code, cl.code, cl.name, s.n_seq,
    n.total_label, n.show_total
  from numbered n
  left join numbered p on p.id = n.parent_id
  join numbered s on s.id = n.root_id
  left join pr_tracker.saao_classifications cl on cl.id = case
      when n.kind = 'classification' then n.classification_id
      when n.kind = 'line' then coalesce(n.classification_id, n.inherited_cls)
      else n.inherited_cls end
  order by n.n_seq
$$;

-- Snapshot-shaped rows (one per active node, DFS order) computed live. Finalize inserts exactly these;
-- saao_live_rows returns them as jsonb, so both share keys and types by construction.
-- saao_compute_lines enforces the encoder role itself.
create or replace function pr_tracker._saao_build_rows(p_report_id uuid, p_book_id uuid, p_cutoff date)
returns setof pr_tracker.saao_report_rows
language sql stable security definer set search_path = '' as $$
  select p_report_id, t.seq, t.node_id, t.parent_seq, t.depth, t.kind, t.label, t.account_code,
    t.classification_code, t.classification_name, t.section_seq, t.total_label, t.show_total,
    c.appropriation, c.nta, c.sb, c.supplemental, c.realignment, c.total_changes, c.adjusted,
    c.allotment, c.obligation, c.months::numeric(18,2)[], c.balance_appropriation, c.balance_allotment,
    c.cna_1, c.cna_2, c.cna_3, c.savings, c.savings_half
  from pr_tracker._saao_tree_rows(p_book_id) t
  left join pr_tracker.saao_compute_lines(p_book_id, p_cutoff) c on c.node_id = t.node_id
  order by t.seq
$$;

-- Movements counted in a report as of the cutoff, with the sum of their lines.
-- Mirrors the filter in saao_compute_lines:
-- PROVISIONAL (R11): movement_rule decides which statuses count.
-- PROVISIONAL (R12): a movement counts when effective_date <= cutoff.
create or replace function pr_tracker._saao_counted_movements(p_book_id uuid, p_cutoff date)
returns table (
  id uuid, reference_no text, kind text, sb_number int, title text, effective_date date,
  status text, status_note text, total numeric)
language sql stable security definer set search_path = '' as $$
  select m.id, m.reference_no, m.kind, m.sb_number, m.title, m.effective_date, m.status, m.status_note,
    coalesce((select sum(ml.amount) from pr_tracker.saao_movement_lines ml where ml.movement_id = m.id), 0)
  from pr_tracker.saao_movements m
  join pr_tracker.saao_books b on b.id = m.book_id
  where m.book_id = p_book_id
    and m.effective_date <= p_cutoff
    and (b.movement_rule = 'all_entered' or m.status = 'approved')
  order by m.effective_date, m.reference_no, m.id
$$;

revoke all on function pr_tracker._saao_tree_rows(uuid), pr_tracker._saao_build_rows(uuid, uuid, date),
  pr_tracker._saao_counted_movements(uuid, date)
  from public, anon, authenticated;

-- ---------- public RPCs ----------
create or replace function pr_tracker.saao_create_draft(p_book_id uuid, p_cutoff date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder');
        v_cutoff date; v_id uuid; v_version int;
begin
  if p_cutoff is null then raise exception 'Cutoff date is required'; end if;
  v_cutoff := (date_trunc('month', p_cutoff::timestamp) + interval '1 month - 1 day')::date;
  -- serialise report creation per book
  perform 1 from pr_tracker.saao_books where id = p_book_id for update;
  if not found then raise exception 'Budget book not found'; end if;
  select id into v_id from pr_tracker.saao_reports
   where book_id = p_book_id and cutoff_date = v_cutoff and status = 'draft';
  if v_id is not null then return v_id; end if;
  if exists (select 1 from pr_tracker.saao_reports
              where book_id = p_book_id and cutoff_date = v_cutoff and status = 'finalized') then
    raise exception 'This month is already finalized; start a revision instead';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from pr_tracker.saao_reports
   where book_id = p_book_id and cutoff_date = v_cutoff;
  insert into pr_tracker.saao_reports (book_id, cutoff_date, version, status, created_by)
  values (p_book_id, v_cutoff, v_version, 'draft', v_actor.id)
  returning id into v_id;
  perform pr_tracker._saao_audit(p_book_id, v_actor.id, 'report', v_id, 'create_draft', null,
    (select to_jsonb(r) from pr_tracker.saao_reports r where r.id = v_id));
  return v_id;
end $$;

create or replace function pr_tracker.saao_delete_draft(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder'); v_old pr_tracker.saao_reports;
begin
  select * into v_old from pr_tracker.saao_reports where id = p_report_id for update;
  if v_old.id is null then raise exception 'Report not found'; end if;
  if v_old.status <> 'draft' then raise exception 'Only a draft can be deleted'; end if;
  delete from pr_tracker.saao_reports where id = p_report_id;  -- drafts never hold rows
  perform pr_tracker._saao_audit(v_old.book_id, v_actor.id, 'report', p_report_id, 'delete_draft',
    to_jsonb(v_old), null);
end $$;

-- Counted movements (R11/R12, see _saao_counted_movements) that are not approved.
create or replace function pr_tracker.saao_unapproved_movements(p_report_id uuid)
returns table (id uuid, reference_no text, title text, kind text, status text, status_note text, total numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_report pr_tracker.saao_reports;
begin
  perform pr_tracker._saao_require('encoder');
  select * into v_report from pr_tracker.saao_reports r where r.id = p_report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;
  return query
  select m.id, m.reference_no, m.title, m.kind, m.status, m.status_note, m.total
  from pr_tracker._saao_counted_movements(v_report.book_id, v_report.cutoff_date) m
  where m.status <> 'approved';
end $$;

-- Spec §7.2. Ruling: the classification and negative-adjusted validations of step 2 are
-- warnings shown by the UI before finalizing, not hard gates here. The only hard gate is R11.
create or replace function pr_tracker.saao_finalize(p_report_id uuid, p_acknowledged uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('finalizer');
        v_report pr_tracker.saao_reports; v_book pr_tracker.saao_books; v_fund pr_tracker.saao_funds;
        v_expected uuid[]; v_ack uuid[]; v_prev pr_tracker.saao_reports; v_rows int;
begin
  -- 1. lock the book FOR UPDATE first: every figure/structure writer takes it FOR SHARE
  --    (_saao_lock_book_shared), so the R11 check, the rows and the frozen movements below all
  --    see the same state. Then lock the report; it must be a draft.
  select * into v_report from pr_tracker.saao_reports where id = p_report_id;
  if v_report.id is null then raise exception 'Report not found'; end if;
  select * into v_book from pr_tracker.saao_books where id = v_report.book_id for update;
  select * into v_report from pr_tracker.saao_reports where id = p_report_id for update;
  if v_report.status <> 'draft' then raise exception 'Only a draft can be finalized'; end if;
  select * into v_fund from pr_tracker.saao_funds where id = v_book.fund_id;

  -- 3. PROVISIONAL (R11): the acknowledged set must equal the counted unapproved movements
  select coalesce(array_agg(u.id order by u.id), '{}') into v_expected
    from pr_tracker.saao_unapproved_movements(p_report_id) u;
  select coalesce(array_agg(distinct a order by a), '{}') into v_ack
    from unnest(coalesce(p_acknowledged, '{}'::uuid[])) a where a is not null;
  if v_expected <> v_ack then raise exception 'Review the unapproved movements before finalizing'; end if;

  -- 5 (part). supersede the current finalized version first (one finalized per book and cutoff)
  for v_prev in select * from pr_tracker.saao_reports
                 where book_id = v_report.book_id and cutoff_date = v_report.cutoff_date
                   and status = 'finalized' for update loop
    update pr_tracker.saao_reports set status = 'superseded' where id = v_prev.id;
    perform pr_tracker._saao_audit(v_report.book_id, v_actor.id, 'report', v_prev.id, 'supersede',
      jsonb_build_object('status', 'finalized'),
      jsonb_build_object('status', 'superseded', 'superseded_by', p_report_id));
  end loop;

  -- 4. snapshot every node (line amounts from saao_compute_lines) and freeze rules/header/movements
  insert into pr_tracker.saao_report_rows
  select * from pr_tracker._saao_build_rows(p_report_id, v_report.book_id, v_report.cutoff_date);
  get diagnostics v_rows = row_count;

  update pr_tracker.saao_reports set
    status = 'finalized', finalized_by = v_actor.id, finalized_at = now(),
    rules = jsonb_build_object(
      'allotment_mode', v_book.allotment_mode,
      'movement_rule', v_book.movement_rule,
      'extra_labels', v_book.extra_labels,
      -- copied from RULES in lib/saao/rules.ts; change both together
      'rule_classes', '{"R1":"C","R2":"C","R3":"P","R4":"C","R5":"P","R6":"C","R7":"P","R8":"C","R9":"C","R10":"C","R11":"P","R12":"P","R13":"A","R14":"A","R15":"A"}'::jsonb),
    header = jsonb_build_object(
      'header_lines', v_book.header_lines,
      'certifier_name', v_book.certifier_name,
      'certifier_title', v_book.certifier_title,
      'fund_code', v_fund.code,
      'fund_name', v_fund.name,
      'fiscal_year', v_book.fiscal_year,
      'cutoff', v_report.cutoff_date),
    movements = (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'reference_no', m.reference_no, 'kind', m.kind, 'sb_number', m.sb_number,
        'title', m.title, 'effective_date', m.effective_date, 'status', m.status,
        'status_note', m.status_note, 'total', m.total)
        order by m.effective_date, m.reference_no, m.id), '[]'::jsonb)
      from pr_tracker._saao_counted_movements(v_report.book_id, v_report.cutoff_date) m),
    acknowledged_unapproved = to_jsonb(v_ack)
  where id = p_report_id;

  -- 6. audit
  perform pr_tracker._saao_audit(v_report.book_id, v_actor.id, 'report', p_report_id, 'finalize',
    to_jsonb(v_report),
    (select to_jsonb(r) || jsonb_build_object('row_count', v_rows) from pr_tracker.saao_reports r where r.id = p_report_id));
end $$;

create or replace function pr_tracker.saao_start_revision(p_report_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('finalizer');
        v_reason text := pr_tracker._clean(p_reason); v_src pr_tracker.saao_reports; v_id uuid; v_version int;
begin
  select * into v_src from pr_tracker.saao_reports where id = p_report_id;
  if v_src.id is null then raise exception 'Report not found'; end if;
  if v_reason is null then raise exception 'A revision reason is required'; end if;
  perform 1 from pr_tracker.saao_books where id = v_src.book_id for update;
  select * into v_src from pr_tracker.saao_reports where id = p_report_id for update;
  if v_src.status <> 'finalized' then raise exception 'Only a finalized report can be revised'; end if;
  if exists (select 1 from pr_tracker.saao_reports
              where book_id = v_src.book_id and cutoff_date = v_src.cutoff_date and status = 'draft') then
    raise exception 'A revision of this month is already in progress';
  end if;
  select max(version) + 1 into v_version from pr_tracker.saao_reports
   where book_id = v_src.book_id and cutoff_date = v_src.cutoff_date;
  insert into pr_tracker.saao_reports (book_id, cutoff_date, version, status, revision_of, revision_reason, created_by)
  values (v_src.book_id, v_src.cutoff_date, v_version, 'draft', v_src.id, v_reason, v_actor.id)
  returning id into v_id;
  perform pr_tracker._saao_audit(v_src.book_id, v_actor.id, 'report', v_id, 'start_revision', null,
    (select to_jsonb(r) from pr_tracker.saao_reports r where r.id = v_id));
  return v_id;
end $$;

-- Same row shape as saao_report_rows (minus report_id), computed live. The cutoff is
-- normalised to month end, as saao_create_draft does.
create or replace function pr_tracker.saao_live_rows(p_book_id uuid, p_cutoff date)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cutoff date;
begin
  perform pr_tracker._saao_require('encoder');
  if p_cutoff is null then raise exception 'Cutoff date is required'; end if;
  v_cutoff := (date_trunc('month', p_cutoff::timestamp) + interval '1 month - 1 day')::date;
  return query
  select to_jsonb(r) - 'report_id' from pr_tracker._saao_build_rows(null, p_book_id, v_cutoff) r order by r.seq;
end $$;

revoke all on function
  pr_tracker.saao_create_draft(uuid, date),
  pr_tracker.saao_delete_draft(uuid),
  pr_tracker.saao_unapproved_movements(uuid),
  pr_tracker.saao_finalize(uuid, uuid[]),
  pr_tracker.saao_start_revision(uuid, text),
  pr_tracker.saao_live_rows(uuid, date)
  from public, anon;
grant execute on function
  pr_tracker.saao_create_draft(uuid, date),
  pr_tracker.saao_delete_draft(uuid),
  pr_tracker.saao_unapproved_movements(uuid),
  pr_tracker.saao_finalize(uuid, uuid[]),
  pr_tracker.saao_start_revision(uuid, text),
  pr_tracker.saao_live_rows(uuid, date)
  to authenticated;

-- ---------- RLS: select only ----------
alter table pr_tracker.saao_reports enable row level security;
alter table pr_tracker.saao_report_rows enable row level security;

-- viewers see finalized/superseded reports; draft reports are encoder and above (spec §6)
create policy saao_reports_select on pr_tracker.saao_reports for select to authenticated
  using ((status in ('finalized', 'superseded') and pr_tracker.saao_role() is not null)
         or pr_tracker._saao_rank(pr_tracker.saao_role()) >= 2);
create policy saao_report_rows_select on pr_tracker.saao_report_rows for select to authenticated
  using (exists (select 1 from pr_tracker.saao_reports r where r.id = report_id
                  and ((r.status in ('finalized', 'superseded') and pr_tracker.saao_role() is not null)
                       or pr_tracker._saao_rank(pr_tracker.saao_role()) >= 2)));

revoke all on pr_tracker.saao_reports, pr_tracker.saao_report_rows from anon, authenticated;
grant select on pr_tracker.saao_reports, pr_tracker.saao_report_rows to authenticated;
