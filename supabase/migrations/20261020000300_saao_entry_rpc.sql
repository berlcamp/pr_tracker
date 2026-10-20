-- SAAO financial data-entry RPCs and batch apply. Additive only.
-- All public RPCs are security definer, role-checked via _saao_require('encoder'), and write saao_audit.

-- ---------- internal helper (NOT granted) ----------
-- Returns the book of an account line; raises a friendly error when the node is missing or not a line.
-- When p_book_id is not null the line must belong to that book.
create or replace function pr_tracker._saao_line_book(p_node_id uuid, p_book_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v pr_tracker.saao_nodes;
begin
  select * into v from pr_tracker.saao_nodes where id = p_node_id;
  if v.id is null then raise exception 'Row not found'; end if;
  if v.kind <> 'line' then raise exception 'Figures can only be entered on account lines'; end if;
  if p_book_id is not null and v.book_id <> p_book_id then
    raise exception 'That line belongs to a different book';
  end if;
  return v.book_id;
end $$;

-- ---------- movements ----------
create or replace function pr_tracker.saao_upsert_movement(
  p_id uuid, p_book_id uuid, p_kind text, p_sb_number int, p_reference_no text, p_title text,
  p_effective_date date, p_status text, p_status_note text, p_remarks text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder');
        v_status text := coalesce(nullif(p_status, ''), 'approved'); v_id uuid := p_id; v_before jsonb;
        v_old pr_tracker.saao_movements;
begin
  if p_kind is null or p_kind not in ('supplemental', 'realignment', 'augmentation', 'reversion', 'nta_reduction', 'other') then
    raise exception 'Unknown movement kind: %', coalesce(p_kind, '(none)');
  end if;
  if v_status not in ('pending', 'approved', 'cancelled') then raise exception 'Unknown status: %', v_status; end if;
  if p_effective_date is null then raise exception 'An effective date is required'; end if;
  if p_kind = 'supplemental' and p_sb_number is null then raise exception 'A supplemental budget needs an SB number'; end if;
  if p_kind <> 'supplemental' and p_sb_number is not null then
    raise exception 'Only a supplemental budget has an SB number';
  end if;
  if p_id is null then
    if not exists (select 1 from pr_tracker.saao_books where id = p_book_id) then raise exception 'Book not found'; end if;
  else
    select * into v_old from pr_tracker.saao_movements where id = p_id for update;
    if v_old.id is null then raise exception 'Movement not found'; end if;
    if p_book_id is distinct from v_old.book_id then raise exception 'A movement cannot move to another book'; end if;
  end if;
  if p_sb_number is not null and exists (
       select 1 from pr_tracker.saao_movements
        where book_id = p_book_id and sb_number = p_sb_number and id is distinct from p_id) then
    raise exception 'SB number % is already used in this book', p_sb_number;
  end if;
  if p_id is null then
    insert into pr_tracker.saao_movements (book_id, kind, sb_number, reference_no, title, effective_date,
        status, status_note, remarks, created_by)
    values (p_book_id, p_kind, p_sb_number, pr_tracker._clean(p_reference_no), pr_tracker._clean(p_title),
        p_effective_date, v_status, pr_tracker._clean(p_status_note), pr_tracker._clean(p_remarks), v_actor.id)
    returning id into v_id;
  else
    v_before := to_jsonb(v_old);
    update pr_tracker.saao_movements set kind = p_kind, sb_number = p_sb_number,
        reference_no = pr_tracker._clean(p_reference_no), title = pr_tracker._clean(p_title),
        effective_date = p_effective_date, status = v_status, status_note = pr_tracker._clean(p_status_note),
        remarks = pr_tracker._clean(p_remarks)
     where id = p_id;
  end if;
  perform pr_tracker._saao_audit(p_book_id, v_actor.id, 'movement', v_id,
    case when p_id is null then 'create' else 'update' end, v_before,
    (select to_jsonb(m) from pr_tracker.saao_movements m where m.id = v_id));
  return v_id;
end $$;

create or replace function pr_tracker.saao_delete_movement(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder'); v_old pr_tracker.saao_movements;
begin
  select * into v_old from pr_tracker.saao_movements where id = p_id for update;
  if v_old.id is null then raise exception 'Movement not found'; end if;
  if exists (select 1 from pr_tracker.saao_movement_lines where movement_id = p_id) then
    raise exception 'Remove the movement lines first';
  end if;
  delete from pr_tracker.saao_movements where id = p_id;
  perform pr_tracker._saao_audit(v_old.book_id, v_actor.id, 'movement', p_id, 'delete', to_jsonb(v_old), null);
end $$;

create or replace function pr_tracker.saao_set_movement_line(p_movement_id uuid, p_node_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder');
        v_mov pr_tracker.saao_movements; v_old pr_tracker.saao_movement_lines; v_new pr_tracker.saao_movement_lines;
begin
  select * into v_mov from pr_tracker.saao_movements where id = p_movement_id for update;
  if v_mov.id is null then raise exception 'Movement not found'; end if;
  perform pr_tracker._saao_line_book(p_node_id, v_mov.book_id);
  if p_amount is null then raise exception 'An amount is required'; end if;
  select * into v_old from pr_tracker.saao_movement_lines where movement_id = p_movement_id and node_id = p_node_id;
  if p_amount = 0 then
    delete from pr_tracker.saao_movement_lines where movement_id = p_movement_id and node_id = p_node_id;
    if v_old.id is not null then
      perform pr_tracker._saao_audit(v_mov.book_id, v_actor.id, 'movement_line', v_old.id, 'delete', to_jsonb(v_old), null);
    end if;
    return;
  end if;
  insert into pr_tracker.saao_movement_lines (movement_id, node_id, amount)
  values (p_movement_id, p_node_id, p_amount)
  on conflict (movement_id, node_id) do update set amount = excluded.amount
  returning * into v_new;
  perform pr_tracker._saao_audit(v_mov.book_id, v_actor.id, 'movement_line', v_new.id,
    case when v_old.id is null then 'create' else 'update' end,
    case when v_old.id is null then null else to_jsonb(v_old) end, to_jsonb(v_new));
end $$;

-- ---------- obligations ----------
create or replace function pr_tracker.saao_set_obligation(p_node_id uuid, p_month int, p_amount numeric, p_entry text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder'); v_book uuid;
        v_entry text := pr_tracker._clean(p_entry); v_old pr_tracker.saao_obligations; v_new pr_tracker.saao_obligations;
begin
  v_book := pr_tracker._saao_line_book(p_node_id, null);
  if p_month is null or p_month < 1 or p_month > 12 then raise exception 'Month must be between 1 and 12'; end if;
  if p_amount is null then raise exception 'An amount is required'; end if;
  select * into v_old from pr_tracker.saao_obligations where node_id = p_node_id and month = p_month for update;
  if p_amount = 0 and v_entry is null then
    delete from pr_tracker.saao_obligations where node_id = p_node_id and month = p_month;
    if v_old.node_id is not null then
      perform pr_tracker._saao_audit(v_book, v_actor.id, 'obligation', p_node_id, 'delete', to_jsonb(v_old), null);
    end if;
    return;
  end if;
  insert into pr_tracker.saao_obligations (node_id, month, amount, entry, updated_by)
  values (p_node_id, p_month, p_amount, v_entry, v_actor.id)
  on conflict (node_id, month) do update
    set amount = excluded.amount, entry = excluded.entry, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;
  perform pr_tracker._saao_audit(v_book, v_actor.id, 'obligation', p_node_id,
    case when v_old.node_id is null then 'create' else 'update' end,
    case when v_old.node_id is null then null else to_jsonb(v_old) end, to_jsonb(v_new));
end $$;

-- ---------- allotments ----------
create or replace function pr_tracker.saao_upsert_allotment(
  p_id uuid, p_node_id uuid, p_amount numeric, p_reference_no text, p_allotment_date date,
  p_status text, p_remarks text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder'); v_book uuid;
        v_status text := coalesce(nullif(p_status, ''), 'approved'); v_id uuid := p_id;
        v_old pr_tracker.saao_allotments;
begin
  v_book := pr_tracker._saao_line_book(p_node_id, null);
  if v_status not in ('pending', 'approved', 'cancelled') then raise exception 'Unknown status: %', v_status; end if;
  if p_amount is null then raise exception 'An amount is required'; end if;
  if p_id is null then
    insert into pr_tracker.saao_allotments (node_id, amount, reference_no, allotment_date, status, remarks, created_by)
    values (p_node_id, p_amount, pr_tracker._clean(p_reference_no), p_allotment_date, v_status,
            pr_tracker._clean(p_remarks), v_actor.id)
    returning id into v_id;
  else
    select * into v_old from pr_tracker.saao_allotments where id = p_id for update;
    if v_old.id is null then raise exception 'Allotment not found'; end if;
    if pr_tracker._saao_line_book(v_old.node_id, null) <> v_book then
      raise exception 'An allotment cannot move to another book';
    end if;
    update pr_tracker.saao_allotments set node_id = p_node_id, amount = p_amount,
        reference_no = pr_tracker._clean(p_reference_no), allotment_date = p_allotment_date,
        status = v_status, remarks = pr_tracker._clean(p_remarks)
     where id = p_id;
  end if;
  perform pr_tracker._saao_audit(v_book, v_actor.id, 'allotment', v_id,
    case when p_id is null then 'create' else 'update' end, case when p_id is null then null else to_jsonb(v_old) end,
    (select to_jsonb(a) from pr_tracker.saao_allotments a where a.id = v_id));
  return v_id;
end $$;

create or replace function pr_tracker.saao_delete_allotment(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder'); v_old pr_tracker.saao_allotments;
begin
  select * into v_old from pr_tracker.saao_allotments where id = p_id for update;
  if v_old.id is null then raise exception 'Allotment not found'; end if;
  delete from pr_tracker.saao_allotments where id = p_id;
  perform pr_tracker._saao_audit(pr_tracker._saao_line_book(v_old.node_id, null), v_actor.id,
    'allotment', p_id, 'delete', to_jsonb(v_old), null);
end $$;

-- ---------- extras ----------
create or replace function pr_tracker.saao_set_extra(p_node_id uuid, p_field text, p_mode text, p_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder'); v_book uuid;
        v_old pr_tracker.saao_line_extras; v_new pr_tracker.saao_line_extras;
begin
  v_book := pr_tracker._saao_line_book(p_node_id, null);
  if p_field is null or p_field not in ('cna_1', 'cna_2', 'cna_3', 'savings') then
    raise exception 'Unknown extra column: %', coalesce(p_field, '(none)');
  end if;
  if p_mode is not null and p_mode not in ('balance', 'amount') then
    raise exception 'Unknown extra mode: %', p_mode;
  end if;
  if p_mode = 'amount' and p_amount is null then raise exception 'An amount is required'; end if;
  select * into v_old from pr_tracker.saao_line_extras where node_id = p_node_id and field = p_field for update;
  if p_mode is null then
    delete from pr_tracker.saao_line_extras where node_id = p_node_id and field = p_field;
    if v_old.node_id is not null then
      perform pr_tracker._saao_audit(v_book, v_actor.id, 'extra', p_node_id, 'delete', to_jsonb(v_old), null);
    end if;
    return;
  end if;
  insert into pr_tracker.saao_line_extras (node_id, field, mode, amount)
  values (p_node_id, p_field, p_mode, case when p_mode = 'amount' then p_amount else null end)
  on conflict (node_id, field) do update set mode = excluded.mode, amount = excluded.amount
  returning * into v_new;
  perform pr_tracker._saao_audit(v_book, v_actor.id, 'extra', p_node_id,
    case when v_old.node_id is null then 'create' else 'update' end,
    case when v_old.node_id is null then null else to_jsonb(v_old) end, to_jsonb(v_new));
end $$;

-- ---------- batch ----------
create or replace function pr_tracker.saao_apply_batch(p_book_id uuid, p_ops jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._saao_require('encoder');
        v_op jsonb; v_i int := 0; v_node uuid; v_mov_book uuid;
begin
  if not exists (select 1 from pr_tracker.saao_books where id = p_book_id) then raise exception 'Book not found'; end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then raise exception 'Nothing to apply'; end if;
  if jsonb_array_length(p_ops) > 2000 then raise exception 'A batch can have at most 2000 rows'; end if;
  begin
    for v_op in select value from jsonb_array_elements(p_ops) loop
      v_i := v_i + 1;
      case v_op ->> 'op'
        when 'update_node' then
          v_node := (v_op ->> 'id')::uuid;
          if not exists (select 1 from pr_tracker.saao_nodes where id = v_node and book_id = p_book_id) then
            raise exception 'That row belongs to a different book or does not exist';
          end if;
          perform pr_tracker.saao_update_node(v_node, v_op -> 'patch');
        when 'add_node' then
          if (v_op ->> 'parent_id') is not null and not exists (
               select 1 from pr_tracker.saao_nodes where id = (v_op ->> 'parent_id')::uuid and book_id = p_book_id) then
            raise exception 'That row belongs to a different book or does not exist';
          end if;
          if (v_op ->> 'after_id') is not null and not exists (
               select 1 from pr_tracker.saao_nodes where id = (v_op ->> 'after_id')::uuid and book_id = p_book_id) then
            raise exception 'That row belongs to a different book or does not exist';
          end if;
          perform pr_tracker.saao_add_node(p_book_id, (v_op ->> 'parent_id')::uuid, (v_op ->> 'after_id')::uuid,
            v_op ->> 'kind', v_op ->> 'label', v_op ->> 'account_code', (v_op ->> 'classification_id')::uuid);
        when 'movement_line' then
          select book_id into v_mov_book from pr_tracker.saao_movements where id = (v_op ->> 'movement_id')::uuid;
          if v_mov_book is distinct from p_book_id then
            raise exception 'That movement belongs to a different book or does not exist';
          end if;
          perform pr_tracker.saao_set_movement_line((v_op ->> 'movement_id')::uuid, (v_op ->> 'node_id')::uuid,
            (v_op ->> 'amount')::numeric);
        when 'obligation' then
          perform pr_tracker._saao_line_book((v_op ->> 'node_id')::uuid, p_book_id);
          perform pr_tracker.saao_set_obligation((v_op ->> 'node_id')::uuid, (v_op ->> 'month')::int,
            (v_op ->> 'amount')::numeric, v_op ->> 'entry');
        when 'extra' then
          perform pr_tracker._saao_line_book((v_op ->> 'node_id')::uuid, p_book_id);
          perform pr_tracker.saao_set_extra((v_op ->> 'node_id')::uuid, v_op ->> 'field', v_op ->> 'mode',
            (v_op ->> 'amount')::numeric);
        else
          raise exception 'Unknown operation: %', coalesce(v_op ->> 'op', '(none)');
      end case;
    end loop;
  exception when others then
    -- the failed statement's work is rolled back with the block; re-raise with the 1-based op index
    raise exception 'Row %: %', v_i, sqlerrm;
  end;
  perform pr_tracker._saao_audit(p_book_id, v_actor.id, 'batch', null, 'apply', null,
    jsonb_build_object('ops', v_i));
  return v_i;
end $$;

grant execute on function
  pr_tracker.saao_upsert_movement(uuid, uuid, text, int, text, text, date, text, text, text),
  pr_tracker.saao_delete_movement(uuid),
  pr_tracker.saao_set_movement_line(uuid, uuid, numeric),
  pr_tracker.saao_set_obligation(uuid, int, numeric, text),
  pr_tracker.saao_upsert_allotment(uuid, uuid, numeric, text, date, text, text),
  pr_tracker.saao_delete_allotment(uuid),
  pr_tracker.saao_set_extra(uuid, text, text, numeric),
  pr_tracker.saao_apply_batch(uuid, jsonb)
  to authenticated;
