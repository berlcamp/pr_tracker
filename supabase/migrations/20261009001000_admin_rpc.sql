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
