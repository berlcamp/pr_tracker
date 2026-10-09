begin;
select plan(7);

update pr_tracker.app_settings set value = '["google"]'::jsonb where key = 'allowed_auth_providers';

insert into pr_tracker.profiles (email, full_name, office_id)
  values ('newbie@x.test', 'Newbie', (select id from pr_tracker.offices where code = 'GSO'));
select tests.create_auth_user('newbie@x.test', 'google');

select tests.authenticate_as('newbie@x.test');
select is(pr_tracker.link_my_profile() ->> 'email', 'newbie@x.test', 'first Google sign-in links the profile');
select is(pr_tracker.get_my_profile() -> 'office' ->> 'code', 'GSO', 'profile includes office');
select tests.clear_authentication();
select isnt((select auth_user_id from pr_tracker.profiles where email = 'newbie@x.test'), null, 'auth_user_id stored');

-- unknown email
select tests.create_auth_user('stranger@x.test', 'google');
select tests.authenticate_as('stranger@x.test');
select is(pr_tracker.link_my_profile(), null, 'unknown email is declined');
select tests.clear_authentication();

-- allowlisted email but email/password provider (shared project attack)
insert into pr_tracker.profiles (email, full_name, office_id)
  values ('victim@x.test', 'Victim', (select id from pr_tracker.offices where code = 'GSO'));
select tests.create_auth_user('victim@x.test', 'email');
select tests.authenticate_as('victim@x.test');
select is(pr_tracker.link_my_profile(), null, 'non-allowed provider is declined');
select tests.clear_authentication();
select is((select auth_user_id from pr_tracker.profiles where email = 'victim@x.test'), null, 'profile stays unlinked');

-- profile already bound to a different auth user
insert into pr_tracker.profiles (email, full_name, office_id, auth_user_id)
  values ('bound@x.test', 'Bound', (select id from pr_tracker.offices where code = 'GSO'),
          tests.create_auth_user('someone-else@x.test'));
select tests.create_auth_user('bound@x.test', 'google');
select tests.authenticate_as('bound@x.test');
select is(pr_tracker.link_my_profile(), null, 'profile bound to another auth user is not re-bound');

select * from finish();
rollback;
