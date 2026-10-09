begin;
select plan(11);

select tests.make_user('c1@x.test', 'CSWD');
select tests.make_user('g1@x.test', 'GSO');

select tests.authenticate_as('c1@x.test');
select set_config('tests.pr1', pr_tracker.create_pr(tests.sample_header())::text, true);
select set_config('tests.pr2', pr_tracker.create_pr(tests.sample_header())::text, true);

select matches((select routing_slip_no from pr_tracker.purchase_requests where id = current_setting('tests.pr1')::uuid),
               '^RS-\d{4}-\d{2}-\d{5}$', 'routing slip format');
select is(
  (select right(b.routing_slip_no, 5)::int - right(a.routing_slip_no, 5)::int
     from pr_tracker.purchase_requests a, pr_tracker.purchase_requests b
    where a.id = current_setting('tests.pr1')::uuid and b.id = current_setting('tests.pr2')::uuid),
  1, 'sequence increments by one');
select is((select amount from pr_tracker.purchase_requests where id = current_setting('tests.pr1')::uuid),
          2695.00::numeric, 'amount stored');
select is((select movement_state::text from pr_tracker.purchase_requests where id = current_setting('tests.pr1')::uuid),
          'draft', 'new PR is draft');
select is((select count(*)::int from pr_tracker.pr_followers where pr_id = current_setting('tests.pr1')::uuid), 1,
          'origin auto-follows');
select is((select event_type::text from pr_tracker.pr_events where pr_id = current_setting('tests.pr1')::uuid), 'created',
          'created event logged');

select throws_like($$select pr_tracker.create_pr(tests.sample_header() || '{"amount": 0}')$$,
                   'Amount must be greater than zero', 'zero amount rejected');
select throws_like($$select pr_tracker.create_pr(tests.sample_header() - 'purpose')$$,
                   'Purpose is required', 'purpose required');

-- edit while draft: allowed
select lives_ok(format($$select pr_tracker.update_pr_content(%L, tests.sample_header() || '{"purpose":"Changed"}')$$,
                       current_setting('tests.pr1')), 'origin edits draft');

-- other office cannot edit
select tests.clear_authentication();
select tests.authenticate_as('g1@x.test');
select throws_like(format($$select pr_tracker.update_pr_content(%L, tests.sample_header())$$, current_setting('tests.pr1')),
                   'Only the originating office can edit this PR', 'non-origin cannot edit');

-- locked once forwarded (simulate as owner; forward_pr is Task 8)
select tests.clear_authentication();
update pr_tracker.purchase_requests set movement_state = 'in_transit', first_forwarded_at = now()
 where id = current_setting('tests.pr1')::uuid;
select tests.authenticate_as('c1@x.test');
select throws_like(format($$select pr_tracker.update_pr_content(%L, tests.sample_header())$$, current_setting('tests.pr1')),
                   'This PR is locked%', 'locked after forwarding');

select * from finish();
rollback;
