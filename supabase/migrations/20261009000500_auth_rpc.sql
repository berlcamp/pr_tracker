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
