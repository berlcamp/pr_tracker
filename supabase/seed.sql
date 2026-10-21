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

-- ---------- local demo data (E2E + manual testing) ----------
update pr_tracker.app_settings set value = '["google","email"]'::jsonb where key = 'allowed_auth_providers';

insert into pr_tracker.offices (code, name) values ('CSWD', 'City Social Welfare and Development Office')
on conflict (code) do nothing;

create or replace function tests.create_password_user(p_email text, p_password text)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
          '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), now(), now(), now());
  return v_id;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('cswd@test.local',   'CSWD',   'staff', 'Carla Cswd'),
    ('gso@test.local',    'GSO',    'staff', 'Gabriel Gso'),
    ('mayor@test.local',  'MAYOR',  'staff', 'Marites Mayor'),
    ('budget@test.local', 'BUDGET', 'staff', 'Benjie Budget'),
    ('bac@test.local',    'BAC',    'staff', 'Bea Bac'),
    ('acctg@test.local',  'ACCTG',  'staff', 'Andres Acctg'),
    ('treas@test.local',  'TREAS',  'staff', 'Tess Treas'),
    ('admin@test.local',  null,     'admin', 'Ada Admin')
  ) as t(email, code, role, name)
  loop
    insert into pr_tracker.profiles (auth_user_id, email, full_name, designation, office_id, role)
    values (tests.create_password_user(r.email, 'password123'), r.email, r.name, 'Staff',
            (select id from pr_tracker.offices where code = r.code), r.role::pr_tracker.user_role);
  end loop;
end $$;

grant execute on all functions in schema tests to authenticated, anon;

-- auth user with NO profile, for the unauthorized-login E2E test
select tests.create_password_user('nobody@test.local', 'password123');

-- SAAO: grant a budget role to an existing test profile (run as postgres, before authenticating)
create or replace function tests.grant_saao(p_email text, p_role text)
returns void language plpgsql as $$
begin
  insert into pr_tracker.saao_access (profile_id, role)
  values ((select id from pr_tracker.profiles where email = lower(p_email)), p_role)
  on conflict (profile_id) do update set role = excluded.role;
end $$;
grant execute on function tests.grant_saao(text, text) to authenticated, anon;
