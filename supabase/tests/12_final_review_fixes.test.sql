begin;
select plan(19);

select tests.make_user('fc@x.test', 'CSWD');
select tests.make_user('fg@x.test', 'GSO');
select tests.make_user('fa@x.test', 'ACCTG', 'admin');

-- ---------- I2: register_attachment trusts Storage metadata, not the browser ----------
select tests.authenticate_as('fc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);
select tests.clear_authentication();
insert into storage.objects (bucket_id, name, metadata) values
  ('pr-tracker-attachments', current_setting('tests.pr') || '/big.pdf', '{"size": 31457280, "mimetype": "application/pdf"}'),
  ('pr-tracker-attachments', current_setting('tests.pr') || '/fake.pdf', '{"size": 1000, "mimetype": "text/html"}'),
  ('pr-tracker-attachments', current_setting('tests.pr') || '/sheet.pdf',
   '{"size": 1000, "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}'),
  ('pr-tracker-attachments', current_setting('tests.pr') || '/nometa.pdf', null),
  ('pr-tracker-attachments', current_setting('tests.pr') || '/ok.png', '{"size": 2048, "mimetype": "image/png"}');
select tests.authenticate_as('fc@x.test');
select throws_like(format('select pr_tracker.register_attachment(%L, %L, %L, 1000, %L)', current_setting('tests.pr'),
                          current_setting('tests.pr') || '/big.pdf', 'big.pdf', 'application/pdf'),
                   'File is larger than 20 MB', 'under-reported size rejected using the stored size');
select throws_like(format('select pr_tracker.register_attachment(%L, %L, %L, 1000, %L)', current_setting('tests.pr'),
                          current_setting('tests.pr') || '/fake.pdf', 'fake.pdf', 'application/pdf'),
                   'File type not allowed', 'mislabelled MIME rejected using the stored mimetype');
select throws_like(format('select pr_tracker.register_attachment(%L, %L, %L, 1000, %L, true)', current_setting('tests.pr'),
                          current_setting('tests.pr') || '/sheet.pdf', 'sheet.pdf', 'application/pdf'),
                   'The PR document must be a PDF, JPG or PNG file', 'PR document type checked against stored mimetype');
select throws_like(format('select pr_tracker.register_attachment(%L, %L, %L, 1000, %L)', current_setting('tests.pr'),
                          current_setting('tests.pr') || '/nometa.pdf', 'nometa.pdf', 'application/pdf'),
                   'Upload not found%', 'object without metadata is treated as not uploaded');
select lives_ok(format('select pr_tracker.register_attachment(%L, %L, %L, 1, %L)', current_setting('tests.pr'),
                       current_setting('tests.pr') || '/ok.png', 'ok.png', 'image/jpeg'),
                'valid upload registers');
select is((select size_bytes from pr_tracker.pr_attachments where storage_path = current_setting('tests.pr') || '/ok.png'),
          2048::bigint, 'verified size stored');
select is((select mime_type from pr_tracker.pr_attachments where storage_path = current_setting('tests.pr') || '/ok.png'),
          'image/png', 'verified mimetype stored');

-- ---------- I3: forward -> recall -> recipient still sees the notifications ----------
select tests.attach_pr_document(current_setting('tests.pr')::uuid);
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));
select pr_tracker.recall_pr(current_setting('tests.pr')::uuid, 'Wrong attachment');
select set_config('tests.rs', (select routing_slip_no from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), true);
select tests.clear_authentication(); select tests.authenticate_as('fg@x.test');
select is((select count(*)::int from pr_tracker.purchase_requests where id = current_setting('tests.pr')::uuid), 0,
          'GSO can no longer read the recalled PR');
select is((select count(*)::int from pr_tracker.list_my_notifications(20)), 2, 'GSO lists forwarded + recalled notifications');
select is(pr_tracker.unread_notification_count(), (select count(*)::int from pr_tracker.list_my_notifications(20) where not is_read),
          'unread badge matches the list');
select is((select routing_slip_no from pr_tracker.list_my_notifications(20) where type = 'recalled'),
          current_setting('tests.rs'),
          'recall notification carries the routing slip no.');
select is((select purpose from pr_tracker.list_my_notifications(20) where type = 'recalled'),
          'Office supplies for Q4', 'recall notification carries the purpose');
select ok(not (select can_view from pr_tracker.list_my_notifications(20) where type = 'recalled'),
          'notification says the PR is not viewable');
select tests.clear_authentication(); select tests.authenticate_as('fc@x.test');
select is((select count(*)::int from pr_tracker.list_my_notifications(20)), 0, 'other offices do not see GSO notifications');

-- ---------- I4: integer settings, robust stuck report ----------
select tests.clear_authentication(); select tests.authenticate_as('fa@x.test');
select throws_like($$select pr_tracker.admin_set_setting('stuck_threshold_days', '2.5')$$,
                   'Stuck threshold must be a whole number%', 'decimal threshold rejected');
select throws_like($$select pr_tracker.admin_set_setting('max_upload_mb', '10.5')$$,
                   'Max upload size must be a whole number%', 'decimal upload size rejected');
select tests.clear_authentication();
update pr_tracker.app_settings set value = '2.5'::jsonb where key = 'stuck_threshold_days';
update pr_tracker.purchase_requests set movement_state = 'in_transit', current_since = now() - interval '3 days'
 where id = current_setting('tests.pr')::uuid;
select tests.authenticate_as('fa@x.test');
select ok(exists (select 1 from pr_tracker.report_stuck_prs() where pr_id = current_setting('tests.pr')::uuid),
          'stuck report works with a legacy decimal threshold');

-- ---------- M2: no direct writes for API roles ----------
select tests.clear_authentication();
select is((select count(*)::int from information_schema.role_table_grants
            where table_schema = 'pr_tracker' and grantee in ('anon', 'authenticated')
              and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')), 0,
          'anon/authenticated have no write privileges on pr_tracker tables');
select ok(not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                       where d.defaclnamespace = 'pr_tracker'::regnamespace and d.defaclobjtype = 'r'
                         and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
                         and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
          'default privileges grant no writes to anon/authenticated');

select * from finish();
rollback;
