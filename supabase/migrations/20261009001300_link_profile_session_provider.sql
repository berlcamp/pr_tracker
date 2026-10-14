-- On a shared project, app_metadata.provider is the provider the account was FIRST created
-- with (e.g. 'email' from another app), not how this session signed in. Decide by the
-- session's sign-in method (amr) instead: an OAuth session counts when the account has an
-- allowed non-email identity; a password/OTP session counts only when 'email' is allowed.
create or replace function pr_tracker.link_my_profile()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_app_meta jsonb := auth.jwt() -> 'app_metadata';
  v_methods text[];
  v_allowed jsonb;
  v_ok boolean;
  v_profile pr_tracker.profiles;
begin
  if v_uid is null or v_email is null then return null; end if;

  select coalesce(value, '["google"]'::jsonb) into v_allowed
    from pr_tracker.app_settings where key = 'allowed_auth_providers';
  v_allowed := coalesce(v_allowed, '["google"]'::jsonb);

  select array_agg(m ->> 'method') into v_methods
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m;

  if v_methods is null then
    -- no amr claim: fall back to the account's primary provider
    v_ok := (v_app_meta ->> 'provider') is not null and v_allowed ? (v_app_meta ->> 'provider');
  elsif 'oauth' = any(v_methods) then
    select exists (
      select 1 from jsonb_array_elements_text(
        coalesce(v_app_meta -> 'providers', jsonb_build_array(v_app_meta ->> 'provider'))) p
      where p <> 'email' and v_allowed ? p) into v_ok;
  else
    v_ok := v_allowed ? 'email';
  end if;
  if not coalesce(v_ok, false) then return null; end if;

  select * into v_profile from pr_tracker.profiles where email = v_email for update;
  if not found or not v_profile.active then return null; end if;

  if v_profile.auth_user_id is null then
    update pr_tracker.profiles set auth_user_id = v_uid where id = v_profile.id;
  elsif v_profile.auth_user_id <> v_uid then
    return null;
  end if;

  return pr_tracker.get_my_profile();
end $$;

revoke execute on function pr_tracker.link_my_profile() from public, anon;
grant execute on function pr_tracker.link_my_profile() to authenticated;
