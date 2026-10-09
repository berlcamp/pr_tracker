begin;
select plan(14);

select tests.make_user('vc@x.test', 'CSWD');
select tests.make_user('vg@x.test', 'GSO');
select tests.make_user('vt@x.test', 'TREAS');
select tests.make_user('va@x.test', 'ACCTG', 'admin');

select tests.authenticate_as('vc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);
select tests.attach_pr_document(current_setting('tests.pr')::uuid);
select pr_tracker.add_private_note(current_setting('tests.pr')::uuid, 'CSWD-only note');
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));

-- destination can see before receiving
select tests.clear_authentication(); select tests.authenticate_as('vg@x.test');
select is((select count(*)::int from pr_tracker.pr_overview where id = current_setting('tests.pr')::uuid), 1,
          'in-transit destination sees PR');
select is((select count(*)::int from pr_tracker.pr_private_notes where pr_id = current_setting('tests.pr')::uuid), 0,
          'GSO cannot read CSWD private note');
select is((select count(*)::int from pr_tracker.pr_timeline where pr_id = current_setting('tests.pr')::uuid and is_private), 0,
          'GSO cannot see CSWD private-note event');
select is(pr_tracker.unread_notification_count(), 1, 'GSO has one unread notification');
select pr_tracker.mark_all_notifications_read();
select is(pr_tracker.unread_notification_count(), 0, 'mark all read');

-- uninvolved office sees nothing via REST tables, but tracking lookup works without pr_id
select tests.clear_authentication(); select tests.authenticate_as('vt@x.test');
select is((select count(*)::int from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 0, 'TREAS cannot read PR');
select is((select count(*)::int from pr_tracker.pr_attachments where pr_id = current_setting('tests.pr')::uuid), 0, 'TREAS cannot read attachments');
select is((select count(*)::int from pr_tracker.pr_events where pr_id = current_setting('tests.pr')::uuid), 0, 'TREAS cannot read events');
select is(pr_tracker.tracking_lookup('RS-1999-01-00000'), null, 'unknown RS returns null');
select tests.clear_authentication();
select set_config('tests.rs', (select routing_slip_no from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), true);
select tests.authenticate_as('vt@x.test');
select is(pr_tracker.tracking_lookup(lower(current_setting('tests.rs'))) ->> 'current_office_name', 'General Services Office',
          'tracking lookup works for uninvolved, case-insensitive');
select is(pr_tracker.tracking_lookup(current_setting('tests.rs')) ->> 'pr_id', null, 'tracking hides pr_id from uninvolved');

-- admin sees PR but not private notes
select tests.clear_authentication(); select tests.authenticate_as('va@x.test');
select is((select count(*)::int from pr_tracker.pr_overview where id = current_setting('tests.pr')::uuid), 1, 'admin sees PR');
select is((select count(*)::int from pr_tracker.pr_private_notes where pr_id = current_setting('tests.pr')::uuid), 0,
          'admin cannot read private notes');

-- report: synthetic hold of exactly 2 days at GSO
select tests.clear_authentication();
insert into pr_tracker.pr_events (pr_id, event_type, actor_id, actor_office_id, to_office_id, created_at)
select current_setting('tests.pr')::uuid, 'received', p.id, p.office_id, p.office_id, now() + interval '1 day'
  from pr_tracker.profiles p where p.email = 'vg@x.test';
insert into pr_tracker.pr_events (pr_id, event_type, actor_id, actor_office_id, from_office_id, created_at)
select current_setting('tests.pr')::uuid, 'forwarded', p.id, p.office_id, p.office_id, now() + interval '3 days'
  from pr_tracker.profiles p where p.email = 'vg@x.test';
select tests.authenticate_as('vg@x.test');
select is((select avg_days from pr_tracker.report_office_days(current_date - 1, current_date + 10) where office_code = 'GSO'),
          2.00::numeric, 'GSO average hold is 2 days');

select * from finish();
rollback;
