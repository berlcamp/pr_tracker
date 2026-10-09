begin;
select plan(9);

select has_table('pr_tracker', 'purchase_requests', 'purchase_requests exists');
select has_table('pr_tracker', 'pr_attachments', 'pr_attachments exists');
select has_table('pr_tracker', 'pr_events', 'pr_events exists');
select has_table('pr_tracker', 'notifications', 'notifications exists');
select has_column('pr_tracker', 'purchase_requests', 'route_step', 'route_step column');

-- Fixture rows inserted directly as postgres (owner) to exercise constraints/triggers.
insert into pr_tracker.offices (id, code, name) values ('00000000-0000-0000-0000-0000000000a1', 'TST', 'Test Office');
insert into pr_tracker.profiles (id, email, full_name, office_id)
  values ('00000000-0000-0000-0000-0000000000b1', 'fixture@x.test', 'Fixture', '00000000-0000-0000-0000-0000000000a1');
insert into pr_tracker.purchase_requests (id, routing_slip_no, origin_office_id, purpose, amount, requested_by_name, current_office_id, created_by)
  values ('00000000-0000-0000-0000-0000000000c1', 'RS-TEST', '00000000-0000-0000-0000-0000000000a1', 'Fixture', 1500, 'Someone',
          '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');

select throws_ok(
  $$insert into pr_tracker.purchase_requests (routing_slip_no, origin_office_id, purpose, amount, requested_by_name, current_office_id, created_by)
    values ('RS-ZERO', '00000000-0000-0000-0000-0000000000a1', 'Zero', 0, 'Someone',
            '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1')$$,
  '23514', null, 'amount must be > 0');

insert into pr_tracker.pr_events (pr_id, event_type, actor_id)
  values ('00000000-0000-0000-0000-0000000000c1', 'created', '00000000-0000-0000-0000-0000000000b1');

select throws_like($$update pr_tracker.pr_events set remark = 'x'$$, '%append-only%', 'events cannot be updated');
select throws_like($$delete from pr_tracker.pr_events$$, '%append-only%', 'events cannot be deleted');
insert into pr_tracker.pr_attachments (pr_id, office_id, uploaded_by, storage_path, filename, size_bytes, mime_type, is_pr_document)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
          'c1/a.pdf', 'a.pdf', 10, 'application/pdf', true);
select throws_ok(
  $$insert into pr_tracker.pr_attachments (pr_id, office_id, uploaded_by, storage_path, filename, size_bytes, mime_type, is_pr_document)
    values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
            'c1/b.pdf', 'b.pdf', 10, 'application/pdf', true)$$,
  '23505', null, 'only one current PR document per PR');

select * from finish();
rollback;
