begin;
select plan(24);

select has_table('pr_tracker', t, 'table ' || t)
  from unnest(array['saao_funds','saao_classifications','saao_books','saao_nodes','saao_movements',
                    'saao_movement_lines','saao_obligations','saao_allotments','saao_line_extras',
                    'saao_access','saao_audit']) as t;

select tests.make_user('viewer@saao.test', 'CSWD');
select tests.make_user('encoder@saao.test', 'GSO');
select tests.make_user('plain@saao.test', 'BAC');

insert into pr_tracker.saao_books (id, fiscal_year, fund_id, title)
  values ('00000000-0000-0000-0000-0000000000b1', 2090, (select id from pr_tracker.saao_funds where code = 'GF'), 'T90'),
         ('00000000-0000-0000-0000-0000000000b2', 2091, (select id from pr_tracker.saao_funds where code = 'GF'), 'T91');
insert into pr_tracker.saao_nodes (id, book_id, kind, label)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'section', 'Sec'),
         ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2', 'section', 'Other');
insert into pr_tracker.saao_nodes (id, book_id, parent_id, kind, label)
  values ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a1', 'line', 'Line');

select tests.grant_saao('viewer@saao.test', 'viewer');
select tests.grant_saao('encoder@saao.test', 'encoder');

select tests.authenticate_as('plain@saao.test');
select is(pr_tracker.saao_role(), null, 'no grant: role is null');
select is((select count(*) from pr_tracker.saao_funds)::int, 0, 'no-role user sees no funds');
select tests.clear_authentication();

select tests.authenticate_as('viewer@saao.test');
select is(pr_tracker.saao_role(), 'viewer', 'granted viewer');
select is((select count(*) from pr_tracker.saao_funds)::int, 1, 'viewer sees the fund');
select is((select count(*) from pr_tracker.saao_nodes)::int, 0, 'viewer sees no nodes');
select tests.clear_authentication();

select tests.authenticate_as('encoder@saao.test');
select is((select count(*) from pr_tracker.saao_nodes where id = '00000000-0000-0000-0000-0000000000a1')::int, 1, 'encoder sees nodes');
select throws_ok($$insert into pr_tracker.saao_audit (entity, entity_id, action) values ('x', gen_random_uuid(), 'x')$$,
  '42501', null, 'authenticated cannot insert into saao_audit');
select tests.clear_authentication();

select throws_ok($$insert into pr_tracker.saao_nodes (book_id, parent_id, kind, label)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a3', 'line', 'Child')$$,
  null, null, 'cannot add a child under a line');
select throws_ok($$insert into pr_tracker.saao_nodes (book_id, parent_id, kind, label)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'group', 'Cross')$$,
  null, null, 'parent must belong to the same book');
select throws_ok($$insert into pr_tracker.saao_movements (book_id, kind, effective_date)
  values ('00000000-0000-0000-0000-0000000000b1', 'supplemental', '2090-01-31')$$,
  '23514', null, 'supplemental needs sb_number');
insert into pr_tracker.saao_movements (book_id, kind, sb_number, effective_date)
  values ('00000000-0000-0000-0000-0000000000b1', 'supplemental', 1, '2090-01-31');
select throws_ok($$insert into pr_tracker.saao_movements (book_id, kind, sb_number, effective_date)
  values ('00000000-0000-0000-0000-0000000000b1', 'supplemental', 1, '2090-02-28')$$,
  '23505', null, 'duplicate sb_number per book');
select throws_ok($$insert into pr_tracker.saao_nodes (book_id, kind, label, appropriation)
  values ('00000000-0000-0000-0000-0000000000b1', 'group', 'G', 100)$$,
  null, null, 'appropriation only on lines');
select throws_ok($$insert into pr_tracker.saao_nodes (book_id, kind, label)
  values ('00000000-0000-0000-0000-0000000000b1', 'classification', 'PS')$$,
  null, null, 'classification node needs classification_id');

select * from finish();
rollback;
