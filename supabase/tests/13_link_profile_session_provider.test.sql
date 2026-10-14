begin;
select plan(5);

update pr_tracker.app_settings set value = '["google"]'::jsonb where key = 'allowed_auth_providers';

-- Shared project: the account was first created by another app with email/password,
-- and Google was linked later, so app_metadata.provider stays 'email'.
insert into pr_tracker.profiles (email, full_name, office_id)
  values ('shared@x.test', 'Shared', (select id from pr_tracker.offices where code = 'GSO'));
select tests.create_auth_user('shared@x.test', 'email');

create function pg_temp.sign_in(p_email text, p_method text, p_providers jsonb)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', (select id from auth.users where email = p_email), 'email', p_email, 'role', 'authenticated',
    'app_metadata', json_build_object('provider', 'email', 'providers', p_providers),
    'amr', json_build_array(json_build_object('method', p_method, 'timestamp', 1)))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- email/password session on that account is still declined
select pg_temp.sign_in('shared@x.test', 'password', '["email","google"]');
select is(pr_tracker.link_my_profile(), null, 'password session on an email-first account is declined');
select tests.clear_authentication();
select is((select auth_user_id from pr_tracker.profiles where email = 'shared@x.test'), null, 'profile stays unlinked');

-- OAuth session without a Google identity is declined
select pg_temp.sign_in('shared@x.test', 'oauth', '["email","github"]');
select is(pr_tracker.link_my_profile(), null, 'oauth session without an allowed identity is declined');
select tests.clear_authentication();

-- Google (OAuth) session on the same account links the profile
select pg_temp.sign_in('shared@x.test', 'oauth', '["email","google"]');
select is(pr_tracker.link_my_profile() ->> 'email', 'shared@x.test', 'Google session on an email-first account links the profile');
select tests.clear_authentication();
select is((select auth_user_id from pr_tracker.profiles where email = 'shared@x.test'),
          (select id from auth.users where email = 'shared@x.test'), 'auth_user_id stored');

select * from finish();
rollback;
