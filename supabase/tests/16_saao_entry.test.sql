begin;
select plan(64);

select tests.make_user('eviewer@saao.test', 'CSWD');
select tests.make_user('eencoder@saao.test', 'GSO');
select tests.make_user('eadmin@saao.test', 'BAC');
select tests.grant_saao('eviewer@saao.test', 'viewer');
select tests.grant_saao('eencoder@saao.test', 'encoder');
select tests.grant_saao('eadmin@saao.test', 'budget_admin');

-- fixtures: two books (FY2093, FY2094) with a heading and lines
select tests.authenticate_as('eadmin@saao.test');
select pr_tracker.saao_create_book(2093, (select id from pr_tracker.saao_funds where code = 'GF'), 'FY2093', null, false);
select pr_tracker.saao_create_book(2094, (select id from pr_tracker.saao_funds where code = 'GF'), 'FY2094', null, false);
select pr_tracker.saao_update_book((select id from pr_tracker.saao_books where fiscal_year = 2093), '{"allotment_mode": "recorded"}');
select tests.clear_authentication();

select tests.authenticate_as('eencoder@saao.test');
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2093), null, null, 'section', 'E-Sec', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2093), (select id from pr_tracker.saao_nodes where label = 'E-Sec'), null, 'line', 'E-L1', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2093), (select id from pr_tracker.saao_nodes where label = 'E-Sec'), null, 'line', 'E-L2', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2093), (select id from pr_tracker.saao_nodes where label = 'E-Sec'), null, 'line', 'E-L3', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2093), (select id from pr_tracker.saao_nodes where label = 'E-Sec'), null, 'line', 'E-L4', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2094), null, null, 'section', 'F-Sec', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2094), (select id from pr_tracker.saao_nodes where label = 'F-Sec'), null, 'line', 'F-L1', null, null);
select tests.clear_authentication();

-- ---------- viewer fails every RPC ----------
select tests.authenticate_as('eviewer@saao.test');
select throws_ok($$select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2093), 'other', null, null, 'T', '2093-01-01', null, null, null)$$,
  'P0001', 'Your budget role does not allow this', 'viewer: upsert_movement');
select throws_ok($$select pr_tracker.saao_delete_movement(gen_random_uuid())$$, 'P0001', 'Your budget role does not allow this', 'viewer: delete_movement');
select throws_ok($$select pr_tracker.saao_set_movement_line(gen_random_uuid(), gen_random_uuid(), 1)$$, 'P0001', 'Your budget role does not allow this', 'viewer: set_movement_line');
select throws_ok($$select pr_tracker.saao_set_obligation(gen_random_uuid(), 1, 1, null)$$, 'P0001', 'Your budget role does not allow this', 'viewer: set_obligation');
select throws_ok($$select pr_tracker.saao_upsert_allotment(null, gen_random_uuid(), 1, null, null, null, null)$$, 'P0001', 'Your budget role does not allow this', 'viewer: upsert_allotment');
select throws_ok($$select pr_tracker.saao_delete_allotment(gen_random_uuid())$$, 'P0001', 'Your budget role does not allow this', 'viewer: delete_allotment');
select throws_ok($$select pr_tracker.saao_set_extra(gen_random_uuid(), 'cna_1', 'balance', null)$$, 'P0001', 'Your budget role does not allow this', 'viewer: set_extra');
select throws_ok($$select pr_tracker.saao_apply_batch((select id from pr_tracker.saao_books where fiscal_year = 2093), '[]')$$, 'P0001', 'Your budget role does not allow this', 'viewer: apply_batch');
select tests.clear_authentication();

-- ---------- encoder ----------
select tests.authenticate_as('eencoder@saao.test');

-- movements
select throws_ok($$select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2093), 'bogus', null, null, 'T', '2093-01-01', null, null, null)$$,
  'P0001', 'Unknown movement kind: bogus', 'bad movement kind friendly');
select throws_ok($$select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2093), 'other', null, null, 'T', '2093-01-01', 'weird', null, null)$$,
  'P0001', 'Unknown status: weird', 'bad movement status friendly');
select throws_ok($$select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2093), 'supplemental', null, null, 'T', '2093-01-01', null, null, null)$$,
  'P0001', 'A supplemental budget needs an SB number', 'supplemental needs SB number');
select lives_ok($$select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2093), 'supplemental', 1, 'SB-1', 'First', '2093-02-01', null, null, null)$$,
  'supplemental movement created (status defaults to approved)');
select throws_ok($$select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2093), 'supplemental', 1, 'SB-1b', 'Dup', '2093-02-01', null, null, null)$$,
  'P0001', 'SB number 1 is already used in this book', 'duplicate SB number friendly');
select lives_ok($$select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2094), 'other', null, null, 'Other book', '2094-02-01', 'pending', null, null)$$,
  'movement in other book');
select is((select status from pr_tracker.saao_movements where reference_no = 'SB-1'), 'approved', 'default status approved');
select lives_ok($$select pr_tracker.saao_upsert_movement((select id from pr_tracker.saao_movements where reference_no = 'SB-1'),
  (select id from pr_tracker.saao_books where fiscal_year = 2093), 'supplemental', 1, 'SB-1', 'First renamed', '2093-02-01', 'pending', 'wait', null)$$,
  'movement updated');
select is((select title || '|' || status from pr_tracker.saao_movements where reference_no = 'SB-1'), 'First renamed|pending', 'update persisted');

-- movement lines
select throws_ok($$select pr_tracker.saao_set_movement_line((select id from pr_tracker.saao_movements where reference_no = 'SB-1'),
  (select id from pr_tracker.saao_nodes where label = 'F-L1'), 100)$$,
  'P0001', 'That line belongs to a different book', 'movement line on another book rejected');
select throws_ok($$select pr_tracker.saao_set_movement_line((select id from pr_tracker.saao_movements where reference_no = 'SB-1'),
  (select id from pr_tracker.saao_nodes where label = 'E-Sec'), 100)$$,
  'P0001', 'Figures can only be entered on account lines', 'movement line on a heading rejected');
select lives_ok($$select pr_tracker.saao_set_movement_line((select id from pr_tracker.saao_movements where reference_no = 'SB-1'),
  (select id from pr_tracker.saao_nodes where label = 'E-L1'), 100)$$, 'movement line set');
select throws_ok($$select pr_tracker.saao_delete_movement((select id from pr_tracker.saao_movements where reference_no = 'SB-1'))$$,
  'P0001', 'Remove the movement lines first', 'movement with lines cannot be deleted');
select lives_ok($$select pr_tracker.saao_set_movement_line((select id from pr_tracker.saao_movements where reference_no = 'SB-1'),
  (select id from pr_tracker.saao_nodes where label = 'E-L1'), 0)$$, 'zero amount accepted');
select is((select count(*)::int from pr_tracker.saao_movement_lines), 0, 'zero removes the movement line row');
select lives_ok($$select pr_tracker.saao_delete_movement((select id from pr_tracker.saao_movements where title = 'Other book'))$$, 'empty movement deletes');

-- obligations
select throws_ok($$select pr_tracker.saao_set_obligation((select id from pr_tracker.saao_nodes where label = 'E-L1'), 13, 5, null)$$,
  'P0001', 'Month must be between 1 and 12', 'month 13 rejected');
select throws_ok($$select pr_tracker.saao_set_obligation((select id from pr_tracker.saao_nodes where label = 'E-Sec'), 1, 5, null)$$,
  'P0001', 'Figures can only be entered on account lines', 'obligation on a heading rejected');
select lives_ok($$select pr_tracker.saao_set_obligation((select id from pr_tracker.saao_nodes where label = 'E-L1'), 1, 500, 'ORS-1')$$, 'obligation set');
select lives_ok($$select pr_tracker.saao_set_obligation((select id from pr_tracker.saao_nodes where label = 'E-L1'), 1, 0, null)$$, 'obligation zeroed');
select is((select count(*)::int from pr_tracker.saao_obligations), 0, 'zero obligation with no entry deletes the row');

-- allotments (allotment_mode = recorded on 2093; equals_adjusted books accept them too, mode only affects reports)
select throws_ok($$select pr_tracker.saao_upsert_allotment(null, (select id from pr_tracker.saao_nodes where label = 'E-L1'), 10, null, null, 'weird', null)$$,
  'P0001', 'Unknown status: weird', 'bad allotment status friendly');
select throws_ok($$select pr_tracker.saao_upsert_allotment(null, (select id from pr_tracker.saao_nodes where label = 'E-Sec'), 10, null, null, null, null)$$,
  'P0001', 'Figures can only be entered on account lines', 'allotment on a heading rejected');
select lives_ok($$select pr_tracker.saao_upsert_allotment(null, (select id from pr_tracker.saao_nodes where label = 'E-L1'), 250, 'ALOB-1', '2093-03-01', null, null)$$, 'allotment created');
select lives_ok($$select pr_tracker.saao_upsert_allotment((select id from pr_tracker.saao_allotments where reference_no = 'ALOB-1'),
  (select id from pr_tracker.saao_nodes where label = 'E-L1'), 300, 'ALOB-1', '2093-03-01', 'approved', null)$$, 'allotment updated');
select is((select amount from pr_tracker.saao_allotments where reference_no = 'ALOB-1'), 300::numeric, 'allotment update persisted');
select lives_ok($$select pr_tracker.saao_delete_allotment((select id from pr_tracker.saao_allotments where reference_no = 'ALOB-1'))$$, 'allotment deleted');
select is((select count(*)::int from pr_tracker.saao_allotments), 0, 'allotment row gone');

-- extras
select throws_ok($$select pr_tracker.saao_set_extra((select id from pr_tracker.saao_nodes where label = 'E-L1'), 'cna_9', 'balance', null)$$,
  'P0001', 'Unknown extra column: cna_9', 'bad extra field friendly');
select throws_ok($$select pr_tracker.saao_set_extra((select id from pr_tracker.saao_nodes where label = 'E-L1'), 'cna_1', 'weird', null)$$,
  'P0001', 'Unknown extra mode: weird', 'bad extra mode friendly');
select throws_ok($$select pr_tracker.saao_set_extra((select id from pr_tracker.saao_nodes where label = 'E-L1'), 'cna_1', 'amount', null)$$,
  'P0001', 'An amount is required', 'amount mode needs an amount');
select lives_ok($$select pr_tracker.saao_set_extra((select id from pr_tracker.saao_nodes where label = 'E-L1'), 'cna_1', 'amount', 75)$$, 'extra amount set');
select lives_ok($$select pr_tracker.saao_set_extra((select id from pr_tracker.saao_nodes where label = 'E-L1'), 'cna_1', 'balance', 75)$$, 'extra switched to balance');
select is((select amount is null from pr_tracker.saao_line_extras), true, 'balance mode stores no amount');
select lives_ok($$select pr_tracker.saao_set_extra((select id from pr_tracker.saao_nodes where label = 'E-L1'), 'cna_1', null, null)$$, 'null mode deletes');
select is((select count(*)::int from pr_tracker.saao_line_extras), 0, 'extra row gone');

-- _saao_line_has_figures through each source, observed via saao_delete_node
select lives_ok($$select pr_tracker.saao_set_movement_line((select id from pr_tracker.saao_movements where reference_no = 'SB-1'), (select id from pr_tracker.saao_nodes where label = 'E-L2'), 5)$$, 'figure via movement line');
select throws_ok($$select pr_tracker.saao_delete_node((select id from pr_tracker.saao_nodes where label = 'E-L2'))$$,
  'P0001', 'This line has figures and cannot be deleted', 'movement line counts as figures');
select lives_ok($$select pr_tracker.saao_set_obligation((select id from pr_tracker.saao_nodes where label = 'E-L3'), 2, 5, null)$$, 'figure via obligation');
select throws_ok($$select pr_tracker.saao_delete_node((select id from pr_tracker.saao_nodes where label = 'E-L3'))$$,
  'P0001', 'This line has figures and cannot be deleted', 'obligation counts as figures');
select lives_ok($$select pr_tracker.saao_upsert_allotment(null, (select id from pr_tracker.saao_nodes where label = 'E-L4'), 5, null, null, null, null)$$, 'figure via allotment');
select throws_ok($$select pr_tracker.saao_delete_node((select id from pr_tracker.saao_nodes where label = 'E-L4'))$$,
  'P0001', 'This line has figures and cannot be deleted', 'allotment counts as figures');
select lives_ok($$select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2093), (select id from pr_tracker.saao_nodes where label = 'E-Sec'), null, 'line', 'E-L5', null, null)$$, 'extra-line added');
select lives_ok($$select pr_tracker.saao_set_extra((select id from pr_tracker.saao_nodes where label = 'E-L5'), 'savings', 'balance', null)$$, 'figure via extra');
select throws_ok($$select pr_tracker.saao_delete_node((select id from pr_tracker.saao_nodes where label = 'E-L5'))$$,
  'P0001', 'This line has figures and cannot be deleted', 'extra counts as figures');

-- ---------- batch ----------
select is((select count(*)::int from pr_tracker.saao_obligations), 1, 'baseline: one obligation (E-L3)');
select throws_ok($$select pr_tracker.saao_apply_batch((select id from pr_tracker.saao_books where fiscal_year = 2093), jsonb_build_array(
  jsonb_build_object('op', 'obligation', 'node_id', (select id from pr_tracker.saao_nodes where label = 'E-L1'), 'month', 3, 'amount', 10),
  jsonb_build_object('op', 'obligation', 'node_id', (select id from pr_tracker.saao_nodes where label = 'E-L1'), 'month', 4, 'amount', 20),
  jsonb_build_object('op', 'update_node', 'id', (select id from pr_tracker.saao_nodes where label = 'E-L1'), 'patch', jsonb_build_object('appropriation', 999)),
  jsonb_build_object('op', 'obligation', 'node_id', (select id from pr_tracker.saao_nodes where label = 'E-L1'), 'month', 13, 'amount', 30)))$$,
  'P0001', 'Row 4: Month must be between 1 and 12', 'invalid 4th op raises Row 4');
select is((select count(*)::int from pr_tracker.saao_obligations), 1, 'failed batch leaves none of the 3 valid ops applied (obligations)');
select is((select appropriation from pr_tracker.saao_nodes where label = 'E-L1'), 0::numeric, 'failed batch leaves node patch unapplied');
select throws_ok($$select pr_tracker.saao_apply_batch((select id from pr_tracker.saao_books where fiscal_year = 2093), jsonb_build_array(
  jsonb_build_object('op', 'obligation', 'node_id', (select id from pr_tracker.saao_nodes where label = 'F-L1'), 'month', 1, 'amount', 10)))$$,
  'P0001', 'Row 1: That line belongs to a different book', 'batch node from another book rejected');
select throws_ok($$select pr_tracker.saao_apply_batch((select id from pr_tracker.saao_books where fiscal_year = 2093), jsonb_build_array(
  jsonb_build_object('op', 'bogus')))$$, 'P0001', 'Row 1: Unknown operation: bogus', 'unknown op rejected');
select throws_ok($$select pr_tracker.saao_apply_batch((select id from pr_tracker.saao_books where fiscal_year = 2093),
  (select jsonb_agg(jsonb_build_object('op', 'bogus')) from generate_series(1, 2001)))$$,
  'P0001', 'A batch can have at most 2000 rows', 'more than 2000 ops rejected');
select is(pr_tracker.saao_apply_batch((select id from pr_tracker.saao_books where fiscal_year = 2093), jsonb_build_array(
  jsonb_build_object('op', 'add_node', 'parent_id', (select id from pr_tracker.saao_nodes where label = 'E-Sec'), 'kind', 'line', 'label', 'E-B1'),
  jsonb_build_object('op', 'movement_line', 'movement_id', (select id from pr_tracker.saao_movements where reference_no = 'SB-1'),
    'node_id', (select id from pr_tracker.saao_nodes where label = 'E-L1'), 'amount', 40),
  jsonb_build_object('op', 'obligation', 'node_id', (select id from pr_tracker.saao_nodes where label = 'E-L1'), 'month', 3, 'amount', 10, 'entry', 'ORS-3'),
  jsonb_build_object('op', 'extra', 'node_id', (select id from pr_tracker.saao_nodes where label = 'E-L1'), 'field', 'cna_2', 'mode', 'amount', 'amount', 12),
  jsonb_build_object('op', 'update_node', 'id', (select id from pr_tracker.saao_nodes where label = 'E-L1'), 'patch', jsonb_build_object('appropriation', 1000)))),
  5, 'valid batch returns the op count');
select is((select count(*)::int from pr_tracker.saao_nodes where label = 'E-B1')
  + (select count(*)::int from pr_tracker.saao_obligations where month = 3)
  + (select appropriation::int from pr_tracker.saao_nodes where label = 'E-L1'), 1002, 'valid batch applied');
select tests.clear_authentication();

-- audit is not readable by encoders; check as the superuser
select is((select count(*)::int from pr_tracker.saao_audit where entity = 'movement_line' and action = 'create'), 3, 'movement line audited');
select is((select count(*)::int from pr_tracker.saao_audit where entity = 'batch'), 1, 'only the successful batch is audited');

select * from finish();
rollback;
