begin;
select plan(23);

select tests.make_user('mc@x.test', 'CSWD');
select tests.make_user('mg@x.test', 'GSO');
select tests.make_user('mg2@x.test', 'GSO');
select tests.make_user('mm@x.test', 'MAYOR');
select tests.make_user('mb@x.test', 'BUDGET');
select tests.make_user('mbac@x.test', 'BAC');

create temp table ids as
select (select id from pr_tracker.offices where code = 'GSO') gso,
       (select id from pr_tracker.offices where code = 'MAYOR') mayor,
       (select id from pr_tracker.offices where code = 'BUDGET') budget,
       (select id from pr_tracker.offices where code = 'BAC') bac,
       (select id from pr_tracker.offices where code = 'CSWD') cswd;
grant select on ids to authenticated;

select tests.authenticate_as('mc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);

select throws_like(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select gso from ids)),
                   'Upload the PR document before forwarding', 'cannot forward without PR document');
select tests.attach_pr_document(current_setting('tests.pr')::uuid);

select is(pr_tracker.suggest_next_step(current_setting('tests.pr')::uuid) -> 'next' ->> 'office_name',
          'General Services Office', 'draft suggests step 1 GSO');
select throws_like(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select mayor from ids)),
                   'A reason is required when forwarding outside the default route', 'skipping ahead needs reason');
select lives_ok(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select gso from ids)),
                'forward to suggested GSO');
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 1, 'route_step 1');
select is((select current_purpose from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid),
          'For review', 'purpose carried');

-- GSO receives; second receive (double click / colleague) fails descriptively
select tests.clear_authentication();
select tests.authenticate_as('mg@x.test');
select lives_ok(format('select pr_tracker.receive_pr(%L)', current_setting('tests.pr')), 'GSO receives');
select tests.clear_authentication();
select tests.authenticate_as('mg2@x.test');
select throws_like(format('select pr_tracker.receive_pr(%L)', current_setting('tests.pr')),
                   'Already received by Test mg (GSO) at %', 'second receive fails with who/when');
select is((select count(*)::int from pr_tracker.pr_events
            where pr_id = current_setting('tests.pr')::uuid and event_type = 'received'), 1, 'exactly one received event');

-- GSO -> Mayor (step 2) -> Budget (step 3)
select lives_ok(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select mayor from ids)), 'to Mayor');
select tests.clear_authentication(); select tests.authenticate_as('mm@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select budget from ids));
select tests.clear_authentication(); select tests.authenticate_as('mb@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 3, 'at Budget step 3');

-- From Budget, Mayor is the suggested next stop and lands on step 4 (not 2, not 6)
select is((pr_tracker.suggest_next_step(current_setting('tests.pr')::uuid) -> 'next' ->> 'step_order')::int, 4, 'suggests step 4');
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select mayor from ids));
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 4, 'Mayor at step 4');

-- Recall before Mayor receives: back to Budget, step 3
select lives_ok(format('select pr_tracker.recall_pr(%L, %L)', current_setting('tests.pr'), 'Wrong attachment'), 'Budget recalls');
select is((select movement_state::text || ':' || route_step from pr_tracker.purchase_requests
            where id = current_setting('tests.pr')::uuid), 'received:3', 'recall restores holder + step');

-- Off-route forward (Budget -> BAC is step 5, i.e. skip ahead) requires reason and jumps to step 5
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select bac from ids), 'Mayor on leave, BAC pre-check');
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 5, 'skip-ahead jumps to step 5');
select is((select override_reason from pr_tracker.pr_events where pr_id = current_setting('tests.pr')::uuid
            order by id desc limit 1), 'Mayor on leave, BAC pre-check', 'override reason logged');

-- BAC receives, returns to GSO: route_step restored to GSO's last held step (1)
select tests.clear_authentication(); select tests.authenticate_as('mbac@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select throws_like(format('select pr_tracker.return_pr(%L, %L, %L)', current_setting('tests.pr'), (select gso from ids), ''),
                   'A reason is required to return a PR', 'return needs reason');
select pr_tracker.return_pr(current_setting('tests.pr')::uuid, (select gso from ids), 'Specs incomplete');
select is((select movement_state::text || ':' || route_step from pr_tracker.purchase_requests
            where id = current_setting('tests.pr')::uuid), 'returned:1', 'returned to GSO at step 1');

-- Off-route forward to an earlier office keeps the step
select tests.clear_authentication(); select tests.authenticate_as('mg@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select cswd from ids), 'Clarify specs with end-user');
select is((select route_step from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 1, 'off-route keeps step');

-- Return to an office that never held it is rejected
select tests.clear_authentication(); select tests.authenticate_as('mc@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select throws_like(format('select pr_tracker.return_pr(%L, %L, %L)', current_setting('tests.pr'),
                          (select id from pr_tracker.offices where code = 'TREAS'), 'x'),
                   'You can only return a PR to its origin or an office that previously held it', 'return target validated');

-- Notifications: GSO got one for the return addressed to it
select tests.clear_authentication();
select ok(exists (select 1 from pr_tracker.notifications n where n.recipient_office_id = (select gso from ids)
                   and n.type = 'returned' and n.pr_id = current_setting('tests.pr')::uuid), 'destination notified on return');

-- Non-holder cannot forward
select tests.authenticate_as('mm@x.test');
select throws_like(format('select pr_tracker.forward_pr(%L, %L)', current_setting('tests.pr'), (select gso from ids)),
                   'This PR is not at your office', 'non-holder cannot forward');

select * from finish();
rollback;
