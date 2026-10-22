begin;
select plan(9);

select tests.make_user('dc@x.test', 'CSWD');
select tests.make_user('dg@x.test', 'GSO');

select tests.authenticate_as('dc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);
select tests.attach_pr_document(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));

select is((select count(*)::int from pr_tracker.dashboard_weekly_activity(12)), 12, 'one row per week, empty weeks included');
select is((select sent::int from pr_tracker.dashboard_weekly_activity(12) order by week_start desc limit 1), 1,
          'CSWD forward counts as sent this week');
select is((select sum(received)::int from pr_tracker.dashboard_weekly_activity(12)), 0, 'CSWD received nothing');
select is((select to_office_name from pr_tracker.followed_activity
            where pr_id = current_setting('tests.pr')::uuid and event_type = 'forwarded'),
          'General Services Office', 'following feed names the forward destination');
select ok((select total_steps > 0 from pr_tracker.followed_activity where pr_id = current_setting('tests.pr')::uuid limit 1),
          'following feed carries total route steps');
select results_eq('select office_name, prs::int from pr_tracker.dashboard_open_pr_locations()',
                  $$values ('General Services Office'::text, 1)$$, 'open CSWD PR is at GSO');

select tests.clear_authentication(); select tests.authenticate_as('dg@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select is((select received::int from pr_tracker.dashboard_weekly_activity(12) order by week_start desc limit 1), 1,
          'GSO receive counts this week');
select is((select count(*)::int from pr_tracker.dashboard_open_pr_locations()), 0, 'GSO originated no PRs');
select is((select count(*)::int from pr_tracker.dashboard_weekly_activity(500)), 52, 'weeks clamped to 52');

select * from finish();
rollback;
