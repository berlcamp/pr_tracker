begin;
select plan(11);

select tests.make_user('sc@x.test', 'CSWD');
select tests.make_user('st2@x.test', 'TREAS');
select tests.make_user('sg@x.test', 'GSO');
select tests.authenticate_as('sc@x.test');
select set_config('tests.pr', pr_tracker.create_pr(tests.sample_header())::text, true);

-- storage.buckets has RLS with no policies for authenticated, so check it as postgres
select tests.clear_authentication();
select ok(exists (select 1 from storage.buckets where id = 'pr-tracker-attachments' and not public), 'private bucket exists');
select tests.authenticate_as('sc@x.test');
select is(pr_tracker.attachment_pr_id(current_setting('tests.pr') || '/abc-file.pdf'), current_setting('tests.pr')::uuid, 'parses pr id');
select is(pr_tracker.attachment_pr_id('not-a-uuid/file.pdf'), null, 'garbage path -> null');
select ok(pr_tracker.can_upload_attachment(current_setting('tests.pr')::uuid), 'origin may upload');
select tests.clear_authentication(); select tests.authenticate_as('st2@x.test');
select ok(not pr_tracker.can_upload_attachment(current_setting('tests.pr')::uuid), 'uninvolved may not upload');
select tests.clear_authentication();
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'pr_tracker_attachments_insert'), 'insert policy exists');

-- PR document rules. Storage objects are inserted directly as postgres to simulate finished uploads.
-- metadata mirrors what Storage writes after an upload (size + mimetype are verified by register_attachment).
insert into storage.objects (bucket_id, name, metadata) values
  ('pr-tracker-attachments', current_setting('tests.pr') || '/v1-pr.pdf', '{"size": 1000, "mimetype": "application/pdf"}'),
  ('pr-tracker-attachments', current_setting('tests.pr') || '/v2-pr.pdf', '{"size": 1000, "mimetype": "application/pdf"}'),
  ('pr-tracker-attachments', current_setting('tests.pr') || '/x-pr.docx',
   '{"size": 1000, "mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}');
select tests.authenticate_as('sc@x.test');
select lives_ok(format('select pr_tracker.register_attachment(%L, %L, %L, 1000, %L, true)', current_setting('tests.pr'),
                       current_setting('tests.pr') || '/v1-pr.pdf', 'pr.pdf', 'application/pdf'), 'origin uploads PR document');
select throws_like(format('select pr_tracker.register_attachment(%L, %L, %L, 1000, %L, true)', current_setting('tests.pr'),
                          current_setting('tests.pr') || '/x-pr.docx', 'pr.docx',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
                   'The PR document must be a PDF, JPG or PNG file', 'PR document must be PDF/JPG/PNG');
select pr_tracker.register_attachment(current_setting('tests.pr')::uuid, current_setting('tests.pr') || '/v2-pr.pdf',
                                      'pr-v2.pdf', 1000, 'application/pdf', true);
select is((select count(*)::int from pr_tracker.pr_attachments
            where pr_id = current_setting('tests.pr')::uuid and is_pr_document and superseded_at is null), 1,
          'replacement leaves exactly one current PR document');
select throws_like(format('select pr_tracker.supersede_attachment(%L, %L)',
                          (select id from pr_tracker.pr_attachments where pr_id = current_setting('tests.pr')::uuid
                              and is_pr_document and superseded_at is null), 'x'),
                   'Upload a replacement PR document instead', 'current PR document cannot be superseded alone');

-- once forwarded, nobody can replace it (GSO holds it; origin is locked)
select pr_tracker.forward_pr(current_setting('tests.pr')::uuid, (select id from pr_tracker.offices where code = 'GSO'));
select tests.clear_authentication(); select tests.authenticate_as('sg@x.test');
select pr_tracker.receive_pr(current_setting('tests.pr')::uuid);
select throws_like(format('select pr_tracker.register_attachment(%L, %L, %L, 1000, %L, true)', current_setting('tests.pr'),
                          current_setting('tests.pr') || '/v1-pr.pdf', 'hijack.pdf', 'application/pdf'),
                   'Only the originating office can upload the PR document%', 'holder cannot replace PR document');

select * from finish();
rollback;
