begin;
select plan(18);

select tests.make_user('pc@x.test', 'CSWD');
select tests.make_user('pg@x.test', 'GSO');
select tests.make_user('pb@x.test', 'BUDGET');
select tests.make_user('pt@x.test', 'TREAS');
select tests.make_user('pa@x.test', 'GSO', 'admin');

select tests.authenticate_as('pc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);
select tests.attach_pr_document(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));

select tests.clear_authentication(); select tests.authenticate_as('pg@x.test');
select throws_like(format('select pr_tracker.set_status(%L, %L)', current_setting('tests.pr'),
                          (select s.id from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id
                            where o.code = 'GSO' limit 1)),
                   'This PR is not at your office', 'cannot set status before receiving');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select lives_ok(format('select pr_tracker.set_status(%L, %L, %L)', current_setting('tests.pr'),
                       (select s.id from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id
                         where o.code = 'GSO' and s.label = 'For review'), 'Reviewing specs'),
                'GSO sets own status');
select throws_like(format('select pr_tracker.set_status(%L, %L)', current_setting('tests.pr'),
                          (select s.id from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id
                            where o.code = 'MAYOR' limit 1)),
                   'That status does not belong to your office', 'cannot use another office status');
select lives_ok(format('select pr_tracker.add_private_note(%L, %L)', current_setting('tests.pr'), 'Supplier X is slow'),
                'private note added');
select throws_like(format('select pr_tracker.assign_pr_no(%L, %L)', current_setting('tests.pr'), '2026-10-001'),
                   'Your office is not allowed to assign PR numbers', 'GSO cannot assign PR No.');
select throws_like(format('select pr_tracker.complete_pr(%L)', current_setting('tests.pr')),
                   'Your office is not allowed to complete PRs', 'GSO cannot complete');
select throws_like(format('select pr_tracker.register_attachment(%L, %L, %L, %s, %L)', current_setting('tests.pr'),
                          current_setting('tests.pr') || '/x-file.exe', 'file.exe', 100, 'application/x-msdownload'),
                   'File type not allowed', 'bad mime rejected');

-- origin office adds a remark -> followers (origin) excluded as actor; GSO not a follower yet
select tests.clear_authentication(); select tests.authenticate_as('pc@x.test');
select lives_ok(format('select pr_tracker.add_remark(%L, %L)', current_setting('tests.pr'), 'Please prioritise'),
                'origin can remark while not holding');
select throws_like(format('select pr_tracker.cancel_pr(%L, %L)', current_setting('tests.pr'), 'No longer needed'),
                   'Only the originating office can cancel a PR, and only while it holds it',
                   'origin cannot cancel while PR is elsewhere');

-- GSO follows, then Budget path for PR No.
select tests.clear_authentication(); select tests.authenticate_as('pg@x.test');
select lives_ok(format('select pr_tracker.follow_pr(%L)', current_setting('tests.pr')), 'GSO follows');
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'BUDGET'), 'Mayor away');
select tests.clear_authentication(); select tests.authenticate_as('pb@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select lives_ok(format('select pr_tracker.assign_pr_no(%L, %L)', current_setting('tests.pr'), '2026-10-001'),
                'Budget assigns PR No.');
select is((select payload ->> 'new' from pr_tracker.pr_events where pr_id = current_setting('tests.pr')::uuid
            and event_type = 'pr_no_assigned'), '2026-10-001', 'PR No. change logged');

-- Treasurer path for completion
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'TREAS'), 'Fast track');
select tests.clear_authentication(); select tests.authenticate_as('pt@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select throws_like(format('select pr_tracker.complete_pr(%L)', current_setting('tests.pr')),
                   'Set the status to "Paid" before completing this PR', 'cannot complete before payment');
select pr_tracker.set_status(current_setting('tests.pr')::uuid,
  (select s.id from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id where o.code = 'TREAS' and s.label = 'Paid'));
select lives_ok(format('select pr_tracker.complete_pr(%L, %L)', current_setting('tests.pr'), 'Paid'), 'Treasurer completes');
select is((select movement_state::text from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid),
          'completed', 'state completed');
select throws_like(format('select pr_tracker.forward_pr(%L, %L, %L)', current_setting('tests.pr'),
                          (select id from pr_tracker.offices where code = 'GSO'), 'x'),
                   'This PR is not at your office', 'completed PR cannot move');

select tests.clear_authentication();
select ok(exists (select 1 from pr_tracker.notifications n join pr_tracker.offices o on o.id = n.recipient_office_id
                   where o.code = 'GSO' and n.type = 'completed' and n.pr_id = current_setting('tests.pr')::uuid),
          'follower GSO notified on completion');
select is((select count(*)::int from pr_tracker.pr_events where pr_id = current_setting('tests.pr')::uuid
            and event_type = 'private_note_added' and is_private and remark is null), 1,
          'private note event is private and has no body');

select * from finish();
rollback;
