-- SAAO settings, access, books and structure RPCs. Additive only.
-- All public RPCs are security definer, role-checked via _saao_require, and write saao_audit.

-- ---------- internal helpers (NOT granted) ----------
create or replace function pr_tracker._saao_line_has_figures(p_node_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select n.appropriation <> 0 from pr_tracker.saao_nodes n where n.id = p_node_id), false)
      or exists (select 1 from pr_tracker.saao_movement_lines where node_id = p_node_id)
      or exists (select 1 from pr_tracker.saao_obligations where node_id = p_node_id)
      or exists (select 1 from pr_tracker.saao_allotments where node_id = p_node_id)
      or exists (select 1 from pr_tracker.saao_line_extras where node_id = p_node_id)
$$;
revoke execute on function pr_tracker._saao_line_has_figures(uuid) from public, anon, authenticated;

-- Places p_node under p_parent after sibling p_after (last when null) and renumbers siblings 10, 20, 30...
-- Tree order is sort_order, created_at, id (R-A).
create or replace function pr_tracker._saao_place_node(p_node_id uuid, p_parent_id uuid, p_after_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_book uuid; v_pos int; v_count int;
begin
  select book_id into v_book from pr_tracker.saao_nodes where id = p_node_id;
  create temp table if not exists pg_temp.saao_sibs (id uuid, rn int) on commit drop;
  truncate pg_temp.saao_sibs;
  insert into pg_temp.saao_sibs
    select n.id, (row_number() over (order by n.sort_order, n.created_at, n.id))::int
      from pr_tracker.saao_nodes n
     where n.book_id = v_book and n.parent_id is not distinct from p_parent_id and n.id <> p_node_id;
  select count(*) into v_count from pg_temp.saao_sibs;
  if p_after_id is null then
    v_pos := v_count;
  else
    select rn into v_pos from pg_temp.saao_sibs where id = p_after_id;
    if v_pos is null then raise exception 'The sibling to insert after is not under that parent'; end if;
  end if;
  update pr_tracker.saao_nodes n
     set parent_id = p_parent_id,
         sort_order = case when n.id = p_node_id then (v_pos + 1) * 10
                           when s.rn <= v_pos then s.rn * 10 else (s.rn + 1) * 10 end
    from (select p_node_id as id, 0 as rn union all select id, rn from pg_temp.saao_sibs) s
   where n.id = s.id;
  drop table pg_temp.saao_sibs;
end $$;
revoke execute on function pr_tracker._saao_place_node(uuid, uuid, uuid) from public, anon, authenticated;

-- Every RPC that writes figures or structure of a book takes this share lock first, so
-- saao_finalize (which takes the book row FOR UPDATE) sees one consistent state of the book.
-- No-op when the book does not exist; callers raise their own friendly errors.
create or replace function pr_tracker._saao_lock_book_shared(p_book_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from pr_tracker.saao_books where id = p_book_id for share;
end $$;
revoke all on function pr_tracker._saao_lock_book_shared(uuid) from public, anon, authenticated;

-- True when the node and all its ancestors are active (true for null or a missing node).
-- Reports leave out inactive subtrees, so figures may only be written to live rows, and no row
-- may be added or moved under an inactive heading. Reactivating a heading stays allowed.
create or replace function pr_tracker._saao_node_is_live(p_node_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select n.id, n.parent_id, n.active from pr_tracker.saao_nodes n where n.id = p_node_id
    union all
    select n.id, n.parent_id, n.active from pr_tracker.saao_nodes n join up on n.id = up.parent_id
  )
  select coalesce(bool_and(up.active), true) from up
$$;

create or replace function pr_tracker._saao_require_live(p_node_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not pr_tracker._saao_node_is_live(p_node_id) then
    raise exception 'This row is under an inactive heading; reactivate it first';
  end if;
end $$;
revoke all on function pr_tracker._saao_node_is_live(uuid), pr_tracker._saao_require_live(uuid)
  from public, anon, authenticated;

create or replace function pr_tracker._saao_valid_account_code(p text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p is not null and p !~ '^\d-\d{2}-\d{2}-\d{3}$' then
    raise exception 'Account code must look like 5-02-03-010';
  end if;
end $$;
revoke execute on function pr_tracker._saao_valid_account_code(text) from public, anon, authenticated;

-- ---------- access ----------
create or replace function pr_tracker.saao_set_access(p_profile_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles; v_before text;
begin
  if pr_tracker.is_admin() then
    v_actor := (select p from pr_tracker.profiles p where p.auth_user_id = auth.uid() and p.active);
  else
    v_actor := pr_tracker._saao_require('budget_admin');
  end if;
  if p_role is not null and pr_tracker._saao_rank(p_role) = 0 then
    raise exception 'Unknown budget role: %', p_role;
  end if;
  if not exists (select 1 from pr_tracker.profiles where id = p_profile_id) then
    raise exception 'User not found';
  end if;
  select role into v_before from pr_tracker.saao_access where profile_id = p_profile_id;
  if p_role is null then
    delete from pr_tracker.saao_access where profile_id = p_profile_id;
  else
    insert into pr_tracker.saao_access (profile_id, role, granted_by)
    values (p_profile_id, p_role, v_actor.id)
    on conflict (profile_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  end if;
  perform pr_tracker._saao_audit(null, v_actor.id, 'access', p_profile_id, 'set_access',
    jsonb_build_object('role', v_before), jsonb_build_object('role', p_role));
end $$;

-- ---------- reference data ----------
create or replace function pr_tracker.saao_upsert_fund(p_id uuid, p_code text, p_name text, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('budget_admin');
        v_code text := upper(pr_tracker._clean(p_code)); v_name text := pr_tracker._clean(p_name);
        v_id uuid := p_id; v_before jsonb;
begin
  if v_code is null or v_name is null then raise exception 'Fund code and name are required'; end if;
  if p_id is null then
    insert into pr_tracker.saao_funds (code, name, active) values (v_code, v_name, coalesce(p_active, true))
    returning id into v_id;
  else
    select to_jsonb(f) into v_before from pr_tracker.saao_funds f where id = p_id;
    if v_before is null then raise exception 'Fund not found'; end if;
    update pr_tracker.saao_funds set code = v_code, name = v_name, active = coalesce(p_active, active)
     where id = p_id;
  end if;
  perform pr_tracker._saao_audit(null, v_actor.id, 'fund', v_id, case when p_id is null then 'create' else 'update' end,
    v_before, (select to_jsonb(f) from pr_tracker.saao_funds f where id = v_id));
  return v_id;
end $$;

create or replace function pr_tracker.saao_upsert_classification(
  p_id uuid, p_code text, p_name text, p_sort_order int, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('budget_admin');
        v_code text := upper(pr_tracker._clean(p_code)); v_name text := pr_tracker._clean(p_name);
        v_id uuid := p_id; v_before jsonb;
begin
  if v_name is null then raise exception 'Classification name is required'; end if;
  if v_code is null or v_code !~ '^[A-Z0-9_]{2,12}$' then
    raise exception 'Classification code must be 2 to 12 letters, digits or underscores';
  end if;
  if p_id is null then
    insert into pr_tracker.saao_classifications (code, name, sort_order, active)
    values (v_code, v_name, coalesce(p_sort_order, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    select to_jsonb(c) into v_before from pr_tracker.saao_classifications c where id = p_id;
    if v_before is null then raise exception 'Classification not found'; end if;
    update pr_tracker.saao_classifications
       set code = v_code, name = v_name, sort_order = coalesce(p_sort_order, sort_order), active = coalesce(p_active, active)
     where id = p_id;
  end if;
  perform pr_tracker._saao_audit(null, v_actor.id, 'classification', v_id, case when p_id is null then 'create' else 'update' end,
    v_before, (select to_jsonb(c) from pr_tracker.saao_classifications c where id = v_id));
  return v_id;
end $$;

-- ---------- books ----------
create or replace function pr_tracker.saao_create_book(
  p_fiscal_year int, p_fund_id uuid, p_title text, p_copy_from uuid, p_copy_appropriations boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('budget_admin');
        v_title text := pr_tracker._clean(p_title); v_id uuid; v_map jsonb := '{}'::jsonb; v_new uuid; r record;
begin
  if p_fiscal_year is null or p_fiscal_year < 2000 or p_fiscal_year > 2200 then
    raise exception 'Enter a valid fiscal year';
  end if;
  if v_title is null then raise exception 'A book title is required'; end if;
  if not exists (select 1 from pr_tracker.saao_funds where id = p_fund_id) then raise exception 'Fund not found'; end if;
  if p_copy_from is not null and not exists (select 1 from pr_tracker.saao_books where id = p_copy_from) then
    raise exception 'The book to copy was not found';
  end if;
  if exists (select 1 from pr_tracker.saao_books where fiscal_year = p_fiscal_year and fund_id = p_fund_id) then
    raise exception 'A book for that fiscal year and fund already exists';
  end if;

  insert into pr_tracker.saao_books (fiscal_year, fund_id, title, header_lines, certifier_title, created_by)
  values (p_fiscal_year, p_fund_id, v_title,
          '["Republic of the Philippines","PROVINCE OF MISAMIS OCCIDENTAL","Ozamiz City"]'::jsonb,
          'City Budget Officer', v_actor.id)
  returning id into v_id;

  if p_copy_from is not null then
    -- parents first (by depth), so the node guard always finds the parent
    for r in
      with recursive t as (
        select n.*, 0 as depth from pr_tracker.saao_nodes n where n.book_id = p_copy_from and n.parent_id is null
        union all
        select c.*, t.depth + 1 from pr_tracker.saao_nodes c join t on c.parent_id = t.id
      )
      select * from t order by depth, sort_order, created_at, id
    loop
      v_new := gen_random_uuid();
      v_map := v_map || jsonb_build_object(r.id::text, v_new);
      insert into pr_tracker.saao_nodes (id, book_id, parent_id, sort_order, kind, label, account_code,
          classification_id, office_id, total_label, show_total, appropriation, appropriation_ref, active)
      values (v_new, v_id, (v_map ->> r.parent_id::text)::uuid, r.sort_order, r.kind, r.label, r.account_code,
          r.classification_id, r.office_id, r.total_label, r.show_total,
          case when coalesce(p_copy_appropriations, false) then r.appropriation else 0 end,
          case when coalesce(p_copy_appropriations, false) then r.appropriation_ref else null end,
          r.active);
    end loop;
  end if;

  perform pr_tracker._saao_audit(v_id, v_actor.id, 'book', v_id, 'create', null,
    jsonb_build_object('fiscal_year', p_fiscal_year, 'fund_id', p_fund_id, 'title', v_title,
                       'copy_from', p_copy_from, 'copy_appropriations', coalesce(p_copy_appropriations, false)));
  return v_id;
end $$;

create or replace function pr_tracker.saao_update_book(p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('budget_admin');
        v_old pr_tracker.saao_books; v_new pr_tracker.saao_books; k text;
begin
  select * into v_old from pr_tracker.saao_books where id = p_id;
  if v_old.id is null then raise exception 'Book not found'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Nothing to update'; end if;
  v_new := v_old;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('title', 'allotment_mode', 'movement_rule', 'extra_labels', 'header_lines', 'certifier_name', 'certifier_title') then
      raise exception 'Unknown book setting: %', k;
    end if;
  end loop;
  if p_patch ? 'title' then
    v_new.title := pr_tracker._clean(p_patch ->> 'title');
    if v_new.title is null then raise exception 'A book title is required'; end if;
  end if;
  if p_patch ? 'allotment_mode' then v_new.allotment_mode := p_patch ->> 'allotment_mode'; end if;
  if p_patch ? 'movement_rule' then v_new.movement_rule := p_patch ->> 'movement_rule'; end if;
  if p_patch ? 'extra_labels' then
    if jsonb_typeof(p_patch -> 'extra_labels') <> 'object' then raise exception 'Extra labels must be an object'; end if;
    v_new.extra_labels := p_patch -> 'extra_labels';
  end if;
  if p_patch ? 'header_lines' then
    if jsonb_typeof(p_patch -> 'header_lines') <> 'array' then raise exception 'Header lines must be a list'; end if;
    v_new.header_lines := p_patch -> 'header_lines';
  end if;
  if p_patch ? 'certifier_name' then v_new.certifier_name := pr_tracker._clean(p_patch ->> 'certifier_name'); end if;
  if p_patch ? 'certifier_title' then v_new.certifier_title := pr_tracker._clean(p_patch ->> 'certifier_title'); end if;

  update pr_tracker.saao_books set title = v_new.title, allotment_mode = v_new.allotment_mode,
      movement_rule = v_new.movement_rule, extra_labels = v_new.extra_labels, header_lines = v_new.header_lines,
      certifier_name = v_new.certifier_name, certifier_title = v_new.certifier_title
   where id = p_id;
  perform pr_tracker._saao_audit(p_id, v_actor.id, 'book', p_id, 'update', to_jsonb(v_old), to_jsonb(v_new));
end $$;

-- ---------- structure ----------
create or replace function pr_tracker.saao_add_node(
  p_book_id uuid, p_parent_id uuid, p_after_id uuid, p_kind text, p_label text,
  p_account_code text, p_classification_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder');
        v_label text := pr_tracker._clean(p_label); v_code text := pr_tracker._clean(p_account_code); v_id uuid;
begin
  if not exists (select 1 from pr_tracker.saao_books where id = p_book_id) then raise exception 'Book not found'; end if;
  perform pr_tracker._saao_lock_book_shared(p_book_id);
  if v_label is null then raise exception 'A label is required'; end if;
  perform pr_tracker._saao_valid_account_code(v_code);
  perform pr_tracker._saao_require_live(p_parent_id);
  -- the node guard validates parent book/kind, classification headings and the kind check constraint
  insert into pr_tracker.saao_nodes (book_id, parent_id, sort_order, kind, label, account_code, classification_id)
  values (p_book_id, p_parent_id, 2147483647, p_kind, v_label, v_code, p_classification_id)
  returning id into v_id;
  perform pr_tracker._saao_place_node(v_id, p_parent_id, p_after_id);
  perform pr_tracker._saao_audit(p_book_id, v_actor.id, 'node', v_id, 'create', null,
    (select to_jsonb(n) from pr_tracker.saao_nodes n where n.id = v_id));
  return v_id;
end $$;

create or replace function pr_tracker.saao_update_node(p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder');
        v_old pr_tracker.saao_nodes; v_new pr_tracker.saao_nodes; k text;
begin
  select * into v_old from pr_tracker.saao_nodes where id = p_id for update;
  if v_old.id is null then raise exception 'Row not found'; end if;
  perform pr_tracker._saao_lock_book_shared(v_old.book_id);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Nothing to update'; end if;
  -- kind and book_id are deliberately not patchable: they would break the tree
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('label', 'account_code', 'classification_id', 'office_id', 'total_label', 'show_total',
                 'appropriation', 'appropriation_ref', 'active') then
      raise exception 'Unknown row field: %', k;
    end if;
  end loop;
  v_new := v_old;
  if p_patch ? 'label' then
    v_new.label := pr_tracker._clean(p_patch ->> 'label');
    if v_new.label is null then raise exception 'A label is required'; end if;
  end if;
  if p_patch ? 'account_code' then
    v_new.account_code := pr_tracker._clean(p_patch ->> 'account_code');
    perform pr_tracker._saao_valid_account_code(v_new.account_code);
  end if;
  if p_patch ? 'classification_id' then v_new.classification_id := (p_patch ->> 'classification_id')::uuid; end if;
  if p_patch ? 'office_id' then v_new.office_id := (p_patch ->> 'office_id')::uuid; end if;
  if p_patch ? 'total_label' then v_new.total_label := pr_tracker._clean(p_patch ->> 'total_label'); end if;
  if p_patch ? 'show_total' then v_new.show_total := coalesce((p_patch ->> 'show_total')::boolean, true); end if;
  if p_patch ? 'appropriation' then v_new.appropriation := coalesce((p_patch ->> 'appropriation')::numeric, 0); end if;
  if p_patch ? 'appropriation_ref' then v_new.appropriation_ref := pr_tracker._clean(p_patch ->> 'appropriation_ref'); end if;
  if p_patch ? 'active' then v_new.active := coalesce((p_patch ->> 'active')::boolean, true); end if;
  if v_old.kind = 'line' and v_old.active and not v_new.active
     and (v_new.appropriation <> 0 or pr_tracker._saao_line_has_figures(p_id)) then
    raise exception 'This line has figures; remove them before deactivating';
  end if;
  if v_new.appropriation <> 0 and v_new.appropriation is distinct from v_old.appropriation
     and (not v_new.active or not pr_tracker._saao_node_is_live(v_old.parent_id)) then
    raise exception 'This row is under an inactive heading; reactivate it first';
  end if;
  -- inactive headings hide their whole subtree from reports, so no line under them may carry figures
  if v_old.kind <> 'line' and v_old.active and not v_new.active and exists (
    with recursive d as (
      select id, kind from pr_tracker.saao_nodes where parent_id = p_id
      union all
      select c.id, c.kind from pr_tracker.saao_nodes c join d on c.parent_id = d.id)
    select 1 from d where d.kind = 'line' and pr_tracker._saao_line_has_figures(d.id)) then
    raise exception 'Lines under this heading have figures; remove them before deactivating';
  end if;

  update pr_tracker.saao_nodes set label = v_new.label, account_code = v_new.account_code,
      classification_id = v_new.classification_id, office_id = v_new.office_id, total_label = v_new.total_label,
      show_total = v_new.show_total, appropriation = v_new.appropriation,
      appropriation_ref = v_new.appropriation_ref, active = v_new.active
   where id = p_id;
  perform pr_tracker._saao_audit(v_old.book_id, v_actor.id, 'node', p_id, 'update', to_jsonb(v_old),
    (select to_jsonb(n) from pr_tracker.saao_nodes n where n.id = p_id));
end $$;

create or replace function pr_tracker.saao_move_node(p_id uuid, p_new_parent_id uuid, p_after_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder');
        v_old pr_tracker.saao_nodes; v_parent pr_tracker.saao_nodes;
begin
  select * into v_old from pr_tracker.saao_nodes where id = p_id;
  if v_old.id is null then raise exception 'Row not found'; end if;
  perform pr_tracker._saao_lock_book_shared(v_old.book_id);
  if p_new_parent_id is not null then
    select * into v_parent from pr_tracker.saao_nodes where id = p_new_parent_id;
    if v_parent.id is null then raise exception 'Target row not found'; end if;
    if v_parent.book_id <> v_old.book_id then raise exception 'A row cannot move to another book'; end if;
    if v_parent.kind in ('line', 'note') then raise exception 'A line or note cannot have children'; end if;
    if p_new_parent_id = p_id or exists (
      with recursive d as (
        select id from pr_tracker.saao_nodes where parent_id = p_id
        union all
        select c.id from pr_tracker.saao_nodes c join d on c.parent_id = d.id)
      select 1 from d where id = p_new_parent_id) then
      raise exception 'A row cannot be moved under itself';
    end if;
  end if;
  if p_after_id = p_id then raise exception 'A row cannot be placed after itself'; end if;
  perform pr_tracker._saao_require_live(p_new_parent_id);

  perform pr_tracker._saao_place_node(p_id, p_new_parent_id, p_after_id);
  -- close the gap left behind when the parent changed
  if v_old.parent_id is distinct from p_new_parent_id then
    update pr_tracker.saao_nodes n set sort_order = s.rn * 10
      from (select id, (row_number() over (order by sort_order, created_at, id))::int rn
              from pr_tracker.saao_nodes
             where book_id = v_old.book_id and parent_id is not distinct from v_old.parent_id) s
     where n.id = s.id and n.sort_order <> s.rn * 10;
  end if;
  perform pr_tracker._saao_audit(v_old.book_id, v_actor.id, 'node', p_id, 'move', to_jsonb(v_old),
    (select to_jsonb(n) from pr_tracker.saao_nodes n where n.id = p_id));
end $$;

create or replace function pr_tracker.saao_delete_node(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder'); v_old pr_tracker.saao_nodes;
begin
  select * into v_old from pr_tracker.saao_nodes where id = p_id for update;
  if v_old.id is null then raise exception 'Row not found'; end if;
  perform pr_tracker._saao_lock_book_shared(v_old.book_id);
  if v_old.kind = 'line' and pr_tracker._saao_line_has_figures(p_id) then
    raise exception 'This line has figures and cannot be deleted';
  end if;
  if exists (select 1 from pr_tracker.saao_nodes where parent_id = p_id) then
    raise exception 'Remove the rows under this heading first';
  end if;
  delete from pr_tracker.saao_nodes where id = p_id;
  perform pr_tracker._saao_audit(v_old.book_id, v_actor.id, 'node', p_id, 'delete', to_jsonb(v_old), null);
end $$;

revoke execute on function
  pr_tracker.saao_set_access(uuid, text),
  pr_tracker.saao_upsert_fund(uuid, text, text, boolean),
  pr_tracker.saao_upsert_classification(uuid, text, text, int, boolean),
  pr_tracker.saao_create_book(int, uuid, text, uuid, boolean),
  pr_tracker.saao_update_book(uuid, jsonb),
  pr_tracker.saao_add_node(uuid, uuid, uuid, text, text, text, uuid),
  pr_tracker.saao_update_node(uuid, jsonb),
  pr_tracker.saao_move_node(uuid, uuid, uuid),
  pr_tracker.saao_delete_node(uuid)
  from public, anon;
grant execute on function
  pr_tracker.saao_set_access(uuid, text),
  pr_tracker.saao_upsert_fund(uuid, text, text, boolean),
  pr_tracker.saao_upsert_classification(uuid, text, text, int, boolean),
  pr_tracker.saao_create_book(int, uuid, text, uuid, boolean),
  pr_tracker.saao_update_book(uuid, jsonb),
  pr_tracker.saao_add_node(uuid, uuid, uuid, text, text, text, uuid),
  pr_tracker.saao_update_node(uuid, jsonb),
  pr_tracker.saao_move_node(uuid, uuid, uuid),
  pr_tracker.saao_delete_node(uuid)
  to authenticated;
