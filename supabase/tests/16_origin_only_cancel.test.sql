begin;
select plan(3);

select tests.make_user('oc@x.test', 'CSWD');
select tests.make_user('oa@x.test', 'ACCTG', 'admin');

select tests.authenticate_as('oc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);
select tests.attach_pr_document(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));

select tests.clear_authentication(); select tests.authenticate_as('oa@x.test');
select throws_like(format('select pr_tracker.cancel_pr(%L, %L)', current_setting('tests.pr'), 'Not needed'),
                   'Only the originating office can cancel%', 'admin cannot cancel a PR in route');

select tests.clear_authentication(); select tests.authenticate_as('oc@x.test');
select set_config('tests.draft', pr_tracker.create_pr(tests.sample_header())::text, true);
select tests.clear_authentication(); select tests.authenticate_as('oa@x.test');
select throws_like(format('select pr_tracker.cancel_pr(%L, %L)', current_setting('tests.draft'), 'Not needed'),
                   'Only the originating office can cancel%', 'admin cannot cancel another office''s draft');

select tests.clear_authentication(); select tests.authenticate_as('oc@x.test');
select lives_ok(format('select pr_tracker.cancel_pr(%L, %L)', current_setting('tests.draft'), 'Not needed'),
                'origin can still cancel its own draft');

select * from finish();
rollback;
