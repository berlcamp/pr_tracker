begin;
select plan(8);

select tests.make_user('rc@x.test', 'CSWD');
select tests.make_user('rg@x.test', 'GSO');
select tests.make_user('rt@x.test', 'TREAS');
select tests.make_user('ra@x.test', 'ACCTG', 'admin');

-- CSWD creates a PR and forwards it to GSO, which holds it for 2 days then forwards it on.
select tests.authenticate_as('rc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);
select tests.attach_pr_document(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));
select tests.clear_authentication();
insert into pr_tracker.pr_events (pr_id, event_type, actor_id, actor_office_id, to_office_id, created_at)
select current_setting('tests.pr')::uuid, 'received', p.id, p.office_id, p.office_id, now() + interval '1 day'
  from pr_tracker.profiles p where p.email = 'rg@x.test';
insert into pr_tracker.pr_events (pr_id, event_type, actor_id, actor_office_id, from_office_id, created_at)
select current_setting('tests.pr')::uuid, 'forwarded', p.id, p.office_id, p.office_id, now() + interval '3 days'
  from pr_tracker.profiles p where p.email = 'rg@x.test';
-- Make the PR stuck at GSO.
update pr_tracker.purchase_requests
   set movement_state = 'received', current_office_id = (select id from pr_tracker.offices where code = 'GSO'),
       current_since = now() - interval '30 days'
 where id = current_setting('tests.pr')::uuid;

-- ---------- average days per office ----------
select tests.authenticate_as('rg@x.test');
select is((select array_agg(office_code)::text from pr_tracker.report_office_days(current_date - 1, current_date + 10)),
          '{GSO}', 'staff sees only their own office in office days');
select tests.clear_authentication(); select tests.authenticate_as('rt@x.test');
select is((select count(*)::int from pr_tracker.report_office_days(current_date - 1, current_date + 10)), 0,
          'staff of an office with no movement sees no rows');
select tests.clear_authentication(); select tests.authenticate_as('ra@x.test');
select ok((select count(*) from pr_tracker.report_office_days(current_date - 1, current_date + 10) where office_code = 'GSO') = 1,
          'admin sees other offices in office days');

-- ---------- stuck PRs ----------
select tests.clear_authentication(); select tests.authenticate_as('rg@x.test');
select ok(exists (select 1 from pr_tracker.report_stuck_prs() where pr_id = current_setting('tests.pr')::uuid),
          'holding office sees its stuck PR');
select ok(not exists (select 1 from pr_tracker.report_stuck_prs() p
                       where p.current_office_name <> 'General Services Office'
                         and p.origin_office_name <> 'General Services Office'),
          'staff sees only stuck PRs at or from their office');
select tests.clear_authentication(); select tests.authenticate_as('rc@x.test');
select ok(exists (select 1 from pr_tracker.report_stuck_prs() where pr_id = current_setting('tests.pr')::uuid),
          'originating office sees its PR stuck elsewhere');
select tests.clear_authentication(); select tests.authenticate_as('rt@x.test');
select ok(not exists (select 1 from pr_tracker.report_stuck_prs() where pr_id = current_setting('tests.pr')::uuid),
          'uninvolved office does not see the stuck PR');
select tests.clear_authentication(); select tests.authenticate_as('ra@x.test');
select ok(exists (select 1 from pr_tracker.report_stuck_prs() where pr_id = current_setting('tests.pr')::uuid),
          'admin sees every stuck PR');

select * from finish();
rollback;
