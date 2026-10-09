-- LOCAL ONLY. Applied by `supabase db reset`; never pushed to the shared project.
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.create_auth_user(p_email text, p_provider text default 'google')
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          jsonb_build_object('provider', p_provider, 'providers', jsonb_build_array(p_provider)),
          '{}'::jsonb, now(), now(), '', '', '', '');
  return v_id;
end $$;

create or replace function tests.make_user(
  p_email text, p_office_code text,
  p_role pr_tracker.user_role default 'staff', p_active boolean default true)
returns uuid language plpgsql as $$
declare v_auth uuid := tests.create_auth_user(p_email); v_profile uuid;
begin
  insert into pr_tracker.profiles (auth_user_id, email, full_name, designation, office_id, role, active)
  values (v_auth, lower(p_email), 'Test ' || split_part(p_email, '@', 1), 'Tester',
          (select id from pr_tracker.offices where code = p_office_code), p_role, p_active)
  returning id into v_profile;
  return v_profile;
end $$;

create or replace function tests.authenticate_as(p_email text)
returns void language plpgsql as $$
declare v_uid uuid; v_provider text;
begin
  select id, coalesce(raw_app_meta_data ->> 'provider', 'google') into v_uid, v_provider
    from auth.users where email = p_email;
  if v_uid is null then raise exception 'test user % not found', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_uid, 'email', p_email, 'role', 'authenticated',
    'app_metadata', json_build_object('provider', v_provider))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.clear_authentication()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function tests.sample_header()
returns jsonb language sql as $$
  select jsonb_build_object(
    'pr_date', '2026-10-09', 'purpose', 'Office supplies for Q4', 'amount', 2695.00,
    'responsibility_center_code', '1011', 'fund_cluster', '01',
    'requested_by_name', 'Maria Santos', 'requested_by_designation', 'Social Welfare Officer');
$$;

-- Lets tests satisfy "PR document required before forwarding" without touching Storage.
create or replace function tests.attach_pr_document(p_pr_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into pr_tracker.pr_attachments (pr_id, office_id, uploaded_by, storage_path, filename, size_bytes, mime_type, is_pr_document)
  select p.id, p.origin_office_id, p.created_by, p.id || '/test-' || gen_random_uuid() || '.pdf', 'signed-pr.pdf', 1000,
         'application/pdf', true
    from pr_tracker.purchase_requests p where p.id = p_pr_id
  returning id into v_id;
  return v_id;
end $$;

grant execute on all functions in schema tests to authenticated, anon;
