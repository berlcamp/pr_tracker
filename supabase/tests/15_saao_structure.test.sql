begin;
select plan(45);

select tests.make_user('sviewer@saao.test', 'CSWD');
select tests.make_user('sencoder@saao.test', 'GSO');
select tests.make_user('sadmin@saao.test', 'BAC');
select tests.make_user('padmin@saao.test', 'BAC', 'admin');
select tests.make_user('snogrant@saao.test', 'BAC');
select tests.make_user('sinactive@saao.test', 'BAC', 'staff', false);
select tests.grant_saao('sviewer@saao.test', 'viewer');
select tests.grant_saao('sencoder@saao.test', 'encoder');
select tests.grant_saao('sadmin@saao.test', 'budget_admin');
select tests.grant_saao('sinactive@saao.test', 'budget_admin');

-- ---------- _saao_require through the RPCs ----------
select tests.authenticate_as('snogrant@saao.test');
select throws_ok($$select pr_tracker.saao_create_book(2091, (select id from pr_tracker.saao_funds where code = 'GF'), 'X', null, false)$$,
  'P0001', 'Budget access required', 'no grant: rejected');
select tests.clear_authentication();

select tests.authenticate_as('sinactive@saao.test');
select throws_ok($$select pr_tracker.saao_create_book(2091, (select id from pr_tracker.saao_funds where code = 'GF'), 'X', null, false)$$,
  'P0001', 'Budget access required', 'inactive profile with a grant: rejected');
select tests.clear_authentication();

select tests.authenticate_as('sviewer@saao.test');
select throws_ok($$select pr_tracker.saao_create_book(2091, (select id from pr_tracker.saao_funds where code = 'GF'), 'X', null, false)$$,
  'P0001', 'Your budget role does not allow this', 'viewer cannot create a book');
select tests.clear_authentication();

select tests.authenticate_as('sencoder@saao.test');
select throws_ok($$select pr_tracker.saao_create_book(2091, (select id from pr_tracker.saao_funds where code = 'GF'), 'X', null, false)$$,
  'P0001', 'Your budget role does not allow this', 'encoder cannot create a book');
select throws_ok($$select pr_tracker.saao_upsert_fund(null, 'XX', 'Nope', true)$$,
  'P0001', 'Your budget role does not allow this', 'encoder cannot edit funds');
select tests.clear_authentication();

-- ---------- budget admin: books ----------
select tests.authenticate_as('sadmin@saao.test');
select lives_ok($$select pr_tracker.saao_create_book(2091, (select id from pr_tracker.saao_funds where code = 'GF'), 'FY2091 GF', null, false)$$,
  'budget_admin creates FY2091 GF');
select is((select certifier_title || '|' || (header_lines ->> 2) from pr_tracker.saao_books where fiscal_year = 2091),
  'City Budget Officer|Ozamiz City', 'book header and certifier defaults');
select throws_ok($$select pr_tracker.saao_create_book(2091, (select id from pr_tracker.saao_funds where code = 'GF'), 'dup', null, false)$$,
  'P0001', 'A book for that fiscal year and fund already exists', 'duplicate book rejected');
select throws_ok($$select pr_tracker.saao_update_book((select id from pr_tracker.saao_books where fiscal_year = 2091), '{"bogus": 1}')$$,
  'P0001', 'Unknown book setting: bogus', 'unknown book setting rejected');
select lives_ok($$select pr_tracker.saao_update_book((select id from pr_tracker.saao_books where fiscal_year = 2091),
  '{"title": "Renamed", "certifier_name": "Juan"}')$$, 'book settings update');
select throws_ok($$select pr_tracker.saao_upsert_classification(null, 'bad code', 'X', 1, true)$$,
  'P0001', 'Classification code must be 2 to 12 letters, digits or underscores', 'classification code pattern');
select lives_ok($$select pr_tracker.saao_upsert_classification(null, 'tst_cls', 'Test class', 99, true)$$, 'classification upsert');
select tests.clear_authentication();

-- ---------- encoder: structure ----------
select tests.authenticate_as('sencoder@saao.test');
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2091), null, null, 'section', 'Sec A', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2091), null, null, 'section', 'Sec B', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2091),
  (select id from pr_tracker.saao_nodes where label = 'Sec A'), null, 'classification', 'PS',
  null, (select id from pr_tracker.saao_classifications where code = 'PS'));
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2091),
  (select id from pr_tracker.saao_nodes where label = 'PS'), null, 'line', 'L1', '5-01-01-010', null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2091),
  (select id from pr_tracker.saao_nodes where label = 'PS'), null, 'line', 'L2', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2091),
  (select id from pr_tracker.saao_nodes where label = 'PS'), (select id from pr_tracker.saao_nodes where label = 'L1'),
  'line', 'L3', null, null);

select is((select string_agg(label || ':' || sort_order, ',' order by sort_order) from pr_tracker.saao_nodes where parent_id is null and book_id = (select id from pr_tracker.saao_books where fiscal_year = 2091)),
  'Sec A:10,Sec B:20', 'sections ordered 10/20');
select is((select parent_id from pr_tracker.saao_nodes where label = 'PS'), (select id from pr_tracker.saao_nodes where label = 'Sec A'),
  'classification under section');
select is((select string_agg(label || ':' || sort_order, ',' order by sort_order) from pr_tracker.saao_nodes where parent_id = (select id from pr_tracker.saao_nodes where label = 'PS')),
  'L1:10,L3:20,L2:30', 'lines ordered, insert-after renumbers');

select throws_ok($$select pr_tracker.saao_move_node((select id from pr_tracker.saao_nodes where label = 'Sec A'), (select id from pr_tracker.saao_nodes where label = 'L1'), null)$$,
  'P0001', null, 'section under its own line rejected');
select throws_ok($$select pr_tracker.saao_move_node((select id from pr_tracker.saao_nodes where label = 'Sec A'), (select id from pr_tracker.saao_nodes where label = 'PS'), null)$$,
  'P0001', 'A row cannot be moved under itself', 'section under its descendant rejected');
select throws_ok($$select pr_tracker.saao_move_node((select id from pr_tracker.saao_nodes where label = 'Sec A'), (select id from pr_tracker.saao_nodes where label = 'Sec A'), null)$$,
  'P0001', 'A row cannot be moved under itself', 'section under itself rejected');
select lives_ok($$select pr_tracker.saao_move_node((select id from pr_tracker.saao_nodes where label = 'L2'), (select id from pr_tracker.saao_nodes where label = 'Sec B'), null)$$,
  'line moves to another parent');
select is((select string_agg(label || ':' || sort_order, ',' order by sort_order) from pr_tracker.saao_nodes where parent_id = (select id from pr_tracker.saao_nodes where label = 'PS')),
  'L1:10,L3:20', 'old parent siblings renumbered after move');

select throws_ok($$select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'L1'), '{"account_code": "5-2-3"}')$$,
  'P0001', 'Account code must look like 5-02-03-010', 'invalid account code');
select throws_ok($$select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'L1'), '{"kind": "note"}')$$,
  'P0001', 'Unknown row field: kind', 'kind is not patchable');
select throws_ok($$select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'L1'), '{"book_id": null}')$$,
  'P0001', 'Unknown row field: book_id', 'book_id is not patchable');
select lives_ok($$select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'L1'),
  '{"account_code": "5-02-03-010", "appropriation": 5000, "label": "L1 renamed"}')$$, 'valid update');
select throws_ok($$select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'L1 renamed'), '{"active": false}')$$,
  'P0001', 'This line has figures; remove them before deactivating', 'cannot deactivate a line with figures');

select throws_ok($$select pr_tracker.saao_delete_node((select id from pr_tracker.saao_nodes where label = 'L1 renamed'))$$,
  'P0001', 'This line has figures and cannot be deleted', 'line with appropriation cannot be deleted');
select throws_ok($$select pr_tracker.saao_delete_node((select id from pr_tracker.saao_nodes where label = 'PS'))$$,
  'P0001', 'Remove the rows under this heading first', 'non-empty heading cannot be deleted');
select lives_ok($$select pr_tracker.saao_delete_node((select id from pr_tracker.saao_nodes where label = 'L2'))$$,
  'zero line deletes');
select tests.clear_authentication();

-- cross-book move
select tests.authenticate_as('sadmin@saao.test');
select pr_tracker.saao_create_book(2092, (select id from pr_tracker.saao_funds where code = 'GF'), 'FY2092 GF',
  (select id from pr_tracker.saao_books where fiscal_year = 2091), false);
select tests.clear_authentication();

select is((select count(*)::int from pr_tracker.saao_nodes where book_id = (select id from pr_tracker.saao_books where fiscal_year = 2092)),
  (select count(*)::int from pr_tracker.saao_nodes where book_id = (select id from pr_tracker.saao_books where fiscal_year = 2091)),
  'copy has the same node count');
select is((select coalesce(sum(appropriation), 0) from pr_tracker.saao_nodes where book_id = (select id from pr_tracker.saao_books where fiscal_year = 2092)),
  0::numeric, 'copy has zero appropriation');
select is((select sum(appropriation) from pr_tracker.saao_nodes where book_id = (select id from pr_tracker.saao_books where fiscal_year = 2091)),
  5000::numeric, 'source keeps its appropriation');
select is((select string_agg(label || ':' || sort_order, ',' order by sort_order) from pr_tracker.saao_nodes
            where book_id = (select id from pr_tracker.saao_books where fiscal_year = 2092) and kind = 'line'),
  'L1 renamed:10,L3:20', 'copy keeps labels and order');

select tests.authenticate_as('sencoder@saao.test');
select throws_ok($$select pr_tracker.saao_move_node((select id from pr_tracker.saao_nodes where label = 'Sec B' and book_id = (select id from pr_tracker.saao_books where fiscal_year = 2091)),
  (select id from pr_tracker.saao_nodes where label = 'Sec A' and book_id = (select id from pr_tracker.saao_books where fiscal_year = 2092)), null)$$,
  'P0001', 'A row cannot move to another book', 'cross-book move rejected');
select tests.clear_authentication();

-- ---------- access ----------
select tests.authenticate_as('padmin@saao.test');
select lives_ok($$select pr_tracker.saao_set_access((select id from pr_tracker.profiles where email = 'snogrant@saao.test'), 'viewer')$$,
  'PR admin without a budget role can set access');
select is(pr_tracker.saao_role(), null, 'PR admin still has no budget role');
select tests.clear_authentication();
select is((select role from pr_tracker.saao_access where profile_id = (select id from pr_tracker.profiles where email = 'snogrant@saao.test')),
  'viewer', 'grant stored');
select tests.authenticate_as('sencoder@saao.test');
select throws_ok($$select pr_tracker.saao_set_access((select id from pr_tracker.profiles where email = 'snogrant@saao.test'), null)$$,
  'P0001', 'Your budget role does not allow this', 'encoder cannot set access');
select tests.clear_authentication();

-- ---------- audit: one row per mutation ----------
create temp table audit_n (c int);
grant all on audit_n to authenticated;
insert into audit_n select count(*)::int from pr_tracker.saao_audit;

select tests.authenticate_as('sadmin@saao.test');
select pr_tracker.saao_update_book((select id from pr_tracker.saao_books where fiscal_year = 2091), '{"title": "Again"}');
select tests.clear_authentication();
select is((select count(*)::int from pr_tracker.saao_audit) - (select c from audit_n), 1, 'update_book writes one audit row');

select tests.authenticate_as('sencoder@saao.test');
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2091), null, null, 'note', 'A note', null, null);
select tests.clear_authentication();
select is((select count(*)::int from pr_tracker.saao_audit) - (select c from audit_n), 2, 'add_node writes one audit row');

select tests.authenticate_as('sencoder@saao.test');
select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'L3' and book_id = (select id from pr_tracker.saao_books where fiscal_year = 2091)), '{"label": "L3b"}');
select tests.clear_authentication();
select is((select count(*)::int from pr_tracker.saao_audit) - (select c from audit_n), 3, 'update_node writes one audit row');

select tests.authenticate_as('sencoder@saao.test');
select pr_tracker.saao_move_node((select id from pr_tracker.saao_nodes where label = 'A note'), null, (select id from pr_tracker.saao_nodes where label = 'Sec A' and book_id = (select id from pr_tracker.saao_books where fiscal_year = 2091)));
select tests.clear_authentication();
select is((select count(*)::int from pr_tracker.saao_audit) - (select c from audit_n), 4, 'move_node writes one audit row');
select is((select string_agg(label, ',' order by sort_order) from pr_tracker.saao_nodes where parent_id is null and book_id = (select id from pr_tracker.saao_books where fiscal_year = 2091)),
  'Sec A,A note,Sec B', 'move after a sibling places it there');

select tests.authenticate_as('sencoder@saao.test');
select pr_tracker.saao_delete_node((select id from pr_tracker.saao_nodes where label = 'A note'));
select tests.clear_authentication();
select is((select count(*)::int from pr_tracker.saao_audit) - (select c from audit_n), 5, 'delete_node writes one audit row');

select tests.authenticate_as('sadmin@saao.test');
select pr_tracker.saao_set_access((select id from pr_tracker.profiles where email = 'snogrant@saao.test'), null);
select tests.clear_authentication();
select is((select count(*)::int from pr_tracker.saao_audit) - (select c from audit_n), 6, 'set_access writes one audit row');

select tests.authenticate_as('sadmin@saao.test');
select pr_tracker.saao_create_book(2093, (select id from pr_tracker.saao_funds where code = 'GF'), 'FY2093', null, false);
select tests.clear_authentication();
select is((select count(*)::int from pr_tracker.saao_audit) - (select c from audit_n), 7, 'create_book writes one audit row');

select * from finish();
rollback;
