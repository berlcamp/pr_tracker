begin;
select plan(14);

select tests.make_user('ad@x.test', 'GSO', 'admin');
select tests.make_user('st@x.test', 'GSO');
-- link the seeded super admin to a test auth user
update pr_tracker.profiles set auth_user_id = tests.create_auth_user('berlcamp@gmail.com') where email = 'berlcamp@gmail.com';

select tests.authenticate_as('st@x.test');
select throws_like($$select pr_tracker.admin_set_setting('lgu_name', '"X"')$$, 'Administrator access required', 'staff blocked');

select tests.clear_authentication(); select tests.authenticate_as('ad@x.test');
select isnt(pr_tracker.admin_upsert_profile(null, ' New.User@LGU.gov.ph ', 'New User', 'Clerk',
            (select id from pr_tracker.offices where code = 'BAC'), 'staff', true), null, 'admin creates staff');
select is((select email from pr_tracker.profiles where full_name = 'New User'), 'new.user@lgu.gov.ph', 'email normalised');
select throws_like($$select pr_tracker.admin_upsert_profile(null, 'x2@x.test', 'X2', null, null, 'admin', true)$$,
                   'Only the super admin can grant the admin role', 'admin cannot create admins');
select throws_like(format($$select pr_tracker.admin_upsert_profile(%L, 'berlcamp@gmail.com', 'Hacked', null, null, 'staff', false)$$,
                          (select id from pr_tracker.profiles where email = 'berlcamp@gmail.com')),
                   'The super admin account cannot be modified here', 'super admin protected');
select throws_like($$select pr_tracker.admin_set_setting('allowed_auth_providers', '["email"]')$$,
                   'Unknown or protected setting%', 'provider allowlist not editable from app');
select lives_ok($$select pr_tracker.admin_set_setting('stuck_threshold_days', '7')$$, 'threshold updated');
select lives_ok(format($$select pr_tracker.admin_set_route(jsonb_build_array(
                   jsonb_build_object('office_id', %L, 'purpose', 'For review'),
                   jsonb_build_object('office_id', %L, 'purpose', 'For approval')))$$,
                 (select id from pr_tracker.offices where code = 'GSO'), (select id from pr_tracker.offices where code = 'MAYOR')),
                'route replaced');
select is((select count(*)::int from pr_tracker.default_route_steps), 2, 'route has 2 steps');
select set_config('tests.status', pr_tracker.admin_upsert_status(null, (select id from pr_tracker.offices where code = 'GSO'),
                  'Temporary', 9, true)::text, true);
select lives_ok(format('select pr_tracker.admin_delete_status(%L)', current_setting('tests.status')), 'unused status deleted');
select ok(not exists (select 1 from pr_tracker.office_statuses where id = current_setting('tests.status')::uuid), 'status gone');

-- a status a PR currently carries cannot be deleted
select tests.clear_authentication(); select tests.authenticate_as('st@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);
select tests.clear_authentication();
update pr_tracker.purchase_requests set current_status_id = (select s.id from pr_tracker.office_statuses s
  join pr_tracker.offices o on o.id = s.office_id where o.code = 'GSO' and s.label = 'For review')
 where id = current_setting('tests.pr')::uuid;
select tests.authenticate_as('ad@x.test');
select throws_like(format('select pr_tracker.admin_delete_status(%L)', (select s.id from pr_tracker.office_statuses s
                     join pr_tracker.offices o on o.id = s.office_id where o.code = 'GSO' and s.label = 'For review')),
                   'This status has already been used on a PR%', 'used status cannot be deleted');
select tests.clear_authentication(); select tests.authenticate_as('st@x.test');
select throws_like(format('select pr_tracker.admin_delete_status(%L)', (select id from pr_tracker.office_statuses limit 1)),
                   'Administrator access required', 'staff cannot delete statuses');

select tests.clear_authentication(); select tests.authenticate_as('berlcamp@gmail.com');
select isnt(pr_tracker.admin_upsert_profile(null, 'admin2@x.test', 'Admin Two', null, null, 'admin', true), null,
            'super admin can create admins');

select * from finish();
rollback;
