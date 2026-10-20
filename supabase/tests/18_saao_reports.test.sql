begin;
select plan(63);

select tests.make_user('rviewer@saao.test', 'CSWD');
select tests.make_user('rencoder@saao.test', 'GSO');
select tests.make_user('rfinalizer@saao.test', 'BAC');
select tests.make_user('radmin@saao.test', 'BAC');
select tests.grant_saao('rviewer@saao.test', 'viewer');
select tests.grant_saao('rencoder@saao.test', 'encoder');
select tests.grant_saao('rfinalizer@saao.test', 'finalizer');
select tests.grant_saao('radmin@saao.test', 'budget_admin');

-- ---------- fixture: FY2095 book ----------
-- R-Sec (section)
--   R-PS (classification PS)
--     R-L1 (line, inherits PS)          appropriation 1000, pending movement +500, obligation Feb 100
--   R-Grp (group, no classification)
--     R-L2 (line, own MOOE)             appropriation 2000, approved movement +300
--     R-Note (note)
--     R-Gone (line, inactive)           excluded from rows
-- R-L3 (top-level line, unclassified)
-- R-OldGrp (group, inactive)            excluded with its subtree
--   R-OldLine (line, active)
select tests.authenticate_as('radmin@saao.test');
select pr_tracker.saao_create_book(2095, (select id from pr_tracker.saao_funds where code = 'GF'), 'FY2095', null, false);
select pr_tracker.saao_update_book((select id from pr_tracker.saao_books where fiscal_year = 2095),
  '{"header_lines": ["Republic of the Philippines"], "certifier_name": "R Certifier", "certifier_title": "Budget Officer"}');
select tests.clear_authentication();

select tests.authenticate_as('rencoder@saao.test');
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), null, null, 'section', 'R-Sec', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), (select id from pr_tracker.saao_nodes where label = 'R-Sec'), null,
  'classification', 'R-PS', null, (select id from pr_tracker.saao_classifications where code = 'PS'));
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), (select id from pr_tracker.saao_nodes where label = 'R-PS'), null, 'line', 'R-L1', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), (select id from pr_tracker.saao_nodes where label = 'R-Sec'),
  (select id from pr_tracker.saao_nodes where label = 'R-PS'), 'group', 'R-Grp', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), (select id from pr_tracker.saao_nodes where label = 'R-Grp'), null,
  'line', 'R-L2', null, (select id from pr_tracker.saao_classifications where code = 'MOOE'));
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), (select id from pr_tracker.saao_nodes where label = 'R-Grp'),
  (select id from pr_tracker.saao_nodes where label = 'R-L2'), 'note', 'R-Note', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), null,
  (select id from pr_tracker.saao_nodes where label = 'R-Sec'), 'line', 'R-L3', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), (select id from pr_tracker.saao_nodes where label = 'R-Grp'),
  (select id from pr_tracker.saao_nodes where label = 'R-Note'), 'line', 'R-Gone', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), null, (select id from pr_tracker.saao_nodes where label = 'R-L3'), 'group', 'R-OldGrp', null, null);
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2095), (select id from pr_tracker.saao_nodes where label = 'R-OldGrp'), null, 'line', 'R-OldLine', null, null);
select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'R-Gone'), '{"active": false}');
select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'R-OldGrp'), '{"active": false}');
select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'R-L1'), '{"appropriation": 1000}');
select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'R-L2'), '{"appropriation": 2000}');
select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2095), 'augmentation', null,
  'R-PEND', 'Pending augmentation', '2095-03-15', 'pending', 'for resolution', null);
select pr_tracker.saao_set_movement_line((select id from pr_tracker.saao_movements where reference_no = 'R-PEND'),
  (select id from pr_tracker.saao_nodes where label = 'R-L1'), 500);
select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2095), 'realignment', null,
  'R-APPR', 'Approved realignment', '2095-02-01', 'approved', null, null);
select pr_tracker.saao_set_movement_line((select id from pr_tracker.saao_movements where reference_no = 'R-APPR'),
  (select id from pr_tracker.saao_nodes where label = 'R-L2'), 300);
-- after the cutoff: not counted, not frozen
select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2095), 'other', null,
  'R-LATE', 'Late pending', '2095-05-01', 'pending', null, null);
select pr_tracker.saao_set_obligation((select id from pr_tracker.saao_nodes where label = 'R-L1'), 2, 100, null);

-- ---------- book-level locking (finalize sees one consistent state) ----------
select is((select array_agg(f order by f) from unnest(array[
    'saao_add_node', 'saao_update_node', 'saao_move_node', 'saao_delete_node',
    'saao_upsert_movement', 'saao_delete_movement', 'saao_set_movement_line', 'saao_set_obligation',
    'saao_upsert_allotment', 'saao_delete_allotment', 'saao_set_extra', 'saao_apply_batch']) f
  where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'pr_tracker' and p.proname = f
                       and pg_get_functiondef(p.oid) like '%%pr_tracker._saao_lock_book_shared(%%')),
  null, 'every figure/structure writer takes the book share lock');
select ok((select position('saao_books where id = v_report.book_id for update' in d) > 0
              and position('saao_books where id = v_report.book_id for update' in d)
                < position('saao_reports where id = p_report_id for update' in d)
           from (select pg_get_functiondef('pr_tracker.saao_finalize(uuid, uuid[])'::regprocedure) d) x),
  'finalize locks the book FOR UPDATE before the report');
select throws_ok($$select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'R-Grp'), '{"active": false}')$$,
  'P0001', 'Lines under this heading have figures; remove them before deactivating', 'heading over figures cannot be deactivated');

-- ---------- draft ----------
select isnt(pr_tracker.saao_create_draft((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-10'),
  null, 'encoder creates a draft');
select is((select cutoff_date::text || '|' || version || '|' || status from pr_tracker.saao_reports),
  '2095-03-31|1|draft', 'cutoff normalised to month end, v1 draft');
select is(pr_tracker.saao_create_draft((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-31'),
  (select id from pr_tracker.saao_reports), 'creating again returns the same draft');
select is((select count(*)::int from pr_tracker.saao_reports), 1, 'still one report');
select throws_ok($$select pr_tracker.saao_finalize((select id from pr_tracker.saao_reports), '{}')$$,
  'P0001', 'Your budget role does not allow this', 'encoder cannot finalize');
select throws_ok($$select pr_tracker.saao_start_revision((select id from pr_tracker.saao_reports), 'x')$$,
  'P0001', 'Your budget role does not allow this', 'encoder cannot start a revision');
select is((select count(*)::int from jsonb_array_elements(
  (select jsonb_agg(r) from pr_tracker.saao_live_rows((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-31') r))),
  7, 'live rows: one per active node');
select is((select array_agg(k order by k) from jsonb_object_keys(
  (select r from pr_tracker.saao_live_rows((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-31') r limit 1)) k),
  (select array_agg(column_name::text order by column_name::text) from information_schema.columns
    where table_schema = 'pr_tracker' and table_name = 'saao_report_rows' and column_name <> 'report_id'),
  'live row keys equal saao_report_rows columns');
select is((select string_agg(r ->> 'label', ',' order by (r ->> 'seq')::int)
  from pr_tracker.saao_live_rows((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-31') r),
  'R-Sec,R-PS,R-L1,R-Grp,R-L2,R-Note,R-L3', 'live rows in DFS order, inactive subtrees left out');
select is((select (r ->> 'adjusted')::numeric from pr_tracker.saao_live_rows((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-01') r
  where r ->> 'label' = 'R-L1'), 1500.00, 'live rows normalise the cutoff to month end');
select is((select (r ->> 'adjusted')::numeric from pr_tracker.saao_live_rows((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-31') r
  where r ->> 'label' = 'R-L1'), 1500.00, 'live line amount');
select ok((select r ->> 'adjusted' is null from pr_tracker.saao_live_rows((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-31') r
  where r ->> 'label' = 'R-Grp'), 'live non-line amount is null');
select tests.clear_authentication();

select tests.authenticate_as('rviewer@saao.test');
select is((select count(*)::int from pr_tracker.saao_reports), 0, 'viewer cannot see the draft');
select throws_ok($$select pr_tracker.saao_live_rows((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-31')$$,
  'P0001', 'Your budget role does not allow this', 'viewer cannot read live rows');
select throws_ok($$select pr_tracker.saao_create_draft((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-04-30')$$,
  'P0001', 'Your budget role does not allow this', 'viewer cannot create a draft');
select tests.clear_authentication();

-- ---------- finalize ----------
select tests.authenticate_as('rfinalizer@saao.test');
select is((select string_agg(reference_no || ':' || status || ':' || total, ',')
  from pr_tracker.saao_unapproved_movements((select id from pr_tracker.saao_reports))),
  'R-PEND:pending:500.00', 'unapproved movements: counted, unapproved, within cutoff');
select throws_ok($$select pr_tracker.saao_start_revision((select id from pr_tracker.saao_reports), 'why')$$,
  'P0001', 'Only a finalized report can be revised', 'a draft cannot be revised');
select throws_ok($$select pr_tracker.saao_finalize((select id from pr_tracker.saao_reports), '{}')$$,
  'P0001', 'Review the unapproved movements before finalizing', 'finalize without acknowledgement fails');
select throws_ok($$select pr_tracker.saao_finalize((select id from pr_tracker.saao_reports),
  array[(select id from pr_tracker.saao_movements where reference_no = 'R-PEND'), (select id from pr_tracker.saao_movements where reference_no = 'R-LATE')])$$,
  'P0001', 'Review the unapproved movements before finalizing', 'finalize with an extra acknowledgement fails');
select lives_ok($$select pr_tracker.saao_finalize((select id from pr_tracker.saao_reports),
  array[(select id from pr_tracker.saao_movements where reference_no = 'R-PEND')])$$, 'finalize with acknowledgement');
select is((select status || '|' || (finalized_by = (select id from pr_tracker.profiles where email = 'rfinalizer@saao.test'))::text
  || '|' || (finalized_at is not null)::text from pr_tracker.saao_reports), 'finalized|true|true', 'report finalized');
select is((select count(*)::int from pr_tracker.saao_report_rows),
  (select count(*)::int from pr_tracker.saao_nodes where book_id = (select id from pr_tracker.saao_books where fiscal_year = 2095)
      and label not in ('R-Gone', 'R-OldGrp', 'R-OldLine')),
  'snapshot row count equals active node count');
select is((select count(*)::int from pr_tracker.saao_report_rows where label in ('R-Gone', 'R-OldGrp', 'R-OldLine')), 0,
  'inactive line and inactive subtree absent from the snapshot');
select is((select string_agg(seq || ':' || label, ',' order by seq) from pr_tracker.saao_report_rows),
  '1:R-Sec,2:R-PS,3:R-L1,4:R-Grp,5:R-L2,6:R-Note,7:R-L3', 'snapshot rows in DFS order');
select is((select string_agg(label || ':' || coalesce(parent_seq::text, '-') || ':' || depth || ':' || section_seq, ',' order by seq)
  from pr_tracker.saao_report_rows),
  'R-Sec:-:0:1,R-PS:1:1:1,R-L1:2:2:1,R-Grp:1:1:1,R-L2:4:2:1,R-Note:4:2:1,R-L3:-:0:7', 'parent_seq, depth, section_seq');
select is((select string_agg(label || ':' || coalesce(classification_code, '-'), ',' order by seq) from pr_tracker.saao_report_rows),
  'R-Sec:-,R-PS:PS,R-L1:PS,R-Grp:-,R-L2:MOOE,R-Note:-,R-L3:-', 'effective classification');
select is((select classification_name from pr_tracker.saao_report_rows where label = 'R-L1'), 'Personal Services', 'classification name');
select is((select count(*)::int from pr_tracker.saao_report_rows where kind <> 'line'
  and (appropriation is not null or adjusted is not null or months is not null or sb is not null)), 0, 'non-line rows carry null amounts');
select is((select adjusted || '|' || obligation || '|' || months[2] from pr_tracker.saao_report_rows where label = 'R-L1'),
  '1500.00|100.00|100.00', 'line amounts from saao_compute_lines');
select is((select rules ->> 'movement_rule' || '|' || (rules ->> 'allotment_mode') || '|' || (rules -> 'rule_classes' ->> 'R1')
  || (rules -> 'rule_classes' ->> 'R11') || (rules -> 'rule_classes' ->> 'R15') || '|' || (rules -> 'extra_labels' ->> 'savings')
  from pr_tracker.saao_reports), 'all_entered|equals_adjusted|CPA|Savings', 'rules frozen');
select is((select header ->> 'fund_code' || '|' || (header ->> 'fund_name') || '|' || (header ->> 'fiscal_year') || '|'
  || (header ->> 'cutoff') || '|' || (header ->> 'certifier_name') || '|' || (header ->> 'certifier_title') || '|' || (header -> 'header_lines' ->> 0)
  from pr_tracker.saao_reports), 'GF|General Fund|2095|2095-03-31|R Certifier|Budget Officer|Republic of the Philippines', 'header frozen');
select is((select string_agg(m ->> 'reference_no' || ':' || (m ->> 'status') || ':' || (m ->> 'total'), ',' order by m ->> 'reference_no')
  from pr_tracker.saao_reports r, jsonb_array_elements(r.movements) m), 'R-APPR:approved:300.00,R-PEND:pending:500.00', 'counted movements frozen with totals');
select is((select acknowledged_unapproved from pr_tracker.saao_reports),
  jsonb_build_array((select id from pr_tracker.saao_movements where reference_no = 'R-PEND')), 'acknowledged ids stored');
select throws_ok($$select pr_tracker.saao_finalize((select id from pr_tracker.saao_reports), '{}')$$,
  'P0001', 'Only a draft can be finalized', 'cannot finalize twice');
select throws_ok($$update pr_tracker.saao_report_rows set adjusted = 0$$, '42501', null, 'authenticated cannot update saao_report_rows');
select throws_ok($$delete from pr_tracker.saao_report_rows$$, '42501', null, 'authenticated cannot delete saao_report_rows');
select throws_ok($$update pr_tracker.saao_reports set status = 'draft'$$, '42501', null, 'authenticated cannot update saao_reports');
select tests.clear_authentication();

-- even the table owner cannot rewrite a snapshot
select throws_ok($$update pr_tracker.saao_report_rows set adjusted = 0$$, 'P0001', 'Report snapshots cannot be changed', 'snapshot rows are immutable');
select throws_ok($$update pr_tracker.saao_reports set header = '{}'$$, 'P0001', 'A finalized report cannot be changed', 'finalized report is immutable');

select tests.authenticate_as('rviewer@saao.test');
select is((select count(*)::int from pr_tracker.saao_reports), 1, 'viewer sees the finalized report');
select is((select count(*)::int from pr_tracker.saao_report_rows), 7, 'viewer sees its rows');
select tests.clear_authentication();

-- ---------- finalized snapshot unchanged after edits ----------
select tests.authenticate_as('rencoder@saao.test');
select pr_tracker.saao_update_node((select id from pr_tracker.saao_nodes where label = 'R-L1'), '{"appropriation": 9999}');
select pr_tracker.saao_set_obligation((select id from pr_tracker.saao_nodes where label = 'R-L2'), 3, 777, null);
select is((select sum(adjusted)::text || '|' || sum(obligation)::text from pr_tracker.saao_report_rows),
  '3800.00|100.00', 'finalized snapshot unchanged after edits');
select is((select sum((r ->> 'adjusted')::numeric)::text || '|' || sum((r ->> 'obligation')::numeric)::text
  from pr_tracker.saao_live_rows((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-31') r),
  '12799.00|877.00', 'live rows reflect the edits');
select throws_ok($$select pr_tracker.saao_create_draft((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-03-15')$$,
  'P0001', 'This month is already finalized; start a revision instead', 'cannot draft a finalized month');
select throws_ok($$select pr_tracker.saao_delete_draft((select id from pr_tracker.saao_reports))$$,
  'P0001', 'Only a draft can be deleted', 'cannot delete a finalized report');
-- a draft for another month can be deleted
select lives_ok($$select pr_tracker.saao_delete_draft(pr_tracker.saao_create_draft((select id from pr_tracker.saao_books where fiscal_year = 2095), '2095-04-01'))$$,
  'draft deleted');
select is((select count(*)::int from pr_tracker.saao_reports), 1, 'deleted draft is gone');
select tests.clear_authentication();

-- ---------- revision ----------
select tests.authenticate_as('rfinalizer@saao.test');
select throws_ok($$select pr_tracker.saao_start_revision((select id from pr_tracker.saao_reports), '  ')$$,
  'P0001', 'A revision reason is required', 'revision needs a reason');
select lives_ok($$select pr_tracker.saao_start_revision((select id from pr_tracker.saao_reports), 'Corrected appropriation')$$, 'revision started');
select throws_ok($$select pr_tracker.saao_start_revision((select id from pr_tracker.saao_reports where version = 1), 'again')$$,
  'P0001', 'A revision of this month is already in progress', 'only one revision at a time');
select is((select version || '|' || status || '|' || (revision_of = (select id from pr_tracker.saao_reports where version = 1))::text || '|' || revision_reason
  from pr_tracker.saao_reports where version = 2), '2|draft|true|Corrected appropriation', 'v2 draft created');
select lives_ok($$select pr_tracker.saao_finalize((select id from pr_tracker.saao_reports where version = 2),
  array[(select id from pr_tracker.saao_movements where reference_no = 'R-PEND')])$$, 'v2 finalized');
select is((select string_agg(version || ':' || status, ',' order by version) from pr_tracker.saao_reports),
  '1:superseded,2:finalized', 'v1 superseded by v2');
select throws_ok($$select pr_tracker.saao_start_revision((select id from pr_tracker.saao_reports where version = 1), 'old')$$,
  'P0001', 'Only a finalized report can be revised', 'a superseded report cannot be revised');
select is((select string_agg(action, ',' order by id) from pr_tracker.saao_audit where entity = 'report'),
  'create_draft,finalize,create_draft,delete_draft,start_revision,supersede,finalize', 'every report state change audited');
select tests.clear_authentication();

select tests.authenticate_as('rviewer@saao.test');
select is((select string_agg(version || ':' || status, ',' order by version) from pr_tracker.saao_reports),
  '1:superseded,2:finalized', 'viewer sees both versions');
select is((select sum(adjusted)::text from pr_tracker.saao_report_rows r join pr_tracker.saao_reports p on p.id = r.report_id where p.version = 1)
  || '|' || (select sum(adjusted)::text from pr_tracker.saao_report_rows r join pr_tracker.saao_reports p on p.id = r.report_id where p.version = 2),
  '3800.00|12799.00', 'viewer reads both snapshots');
select tests.clear_authentication();

-- ---------- approved_only: unapproved movements do not count, nothing to acknowledge ----------
select tests.authenticate_as('radmin@saao.test');
select pr_tracker.saao_create_book(2096, (select id from pr_tracker.saao_funds where code = 'GF'), 'FY2096', null, false);
select pr_tracker.saao_update_book((select id from pr_tracker.saao_books where fiscal_year = 2096), '{"movement_rule": "approved_only"}');
select tests.clear_authentication();
select tests.authenticate_as('rencoder@saao.test');
select pr_tracker.saao_add_node((select id from pr_tracker.saao_books where fiscal_year = 2096), null, null, 'line', 'S-L1', null, null);
select pr_tracker.saao_upsert_movement(null, (select id from pr_tracker.saao_books where fiscal_year = 2096), 'other', null,
  'S-PEND', 'Pending', '2096-01-10', 'pending', null, null);
select pr_tracker.saao_set_movement_line((select id from pr_tracker.saao_movements where reference_no = 'S-PEND'),
  (select id from pr_tracker.saao_nodes where label = 'S-L1'), 50);
select pr_tracker.saao_create_draft((select id from pr_tracker.saao_books where fiscal_year = 2096), '2096-06-30');
select tests.clear_authentication();
select tests.authenticate_as('rfinalizer@saao.test');
select is((select count(*)::int from pr_tracker.saao_unapproved_movements(
  (select r.id from pr_tracker.saao_reports r join pr_tracker.saao_books b on b.id = r.book_id where b.fiscal_year = 2096))),
  0, 'approved_only: no unapproved movements to review');
select lives_ok($$select pr_tracker.saao_finalize((select r.id from pr_tracker.saao_reports r join pr_tracker.saao_books b on b.id = r.book_id
  where b.fiscal_year = 2096), '{}')$$, 'approved_only: finalize with an empty acknowledgement');
select is((select r.status || '|' || jsonb_array_length(r.movements) || '|' || (r.rules ->> 'movement_rule')
  || '|' || (select adjusted from pr_tracker.saao_report_rows x where x.report_id = r.id and x.label = 'S-L1')
  from pr_tracker.saao_reports r join pr_tracker.saao_books b on b.id = r.book_id where b.fiscal_year = 2096),
  'finalized|0|approved_only|0.00', 'approved_only: pending movement neither frozen nor counted');
select tests.clear_authentication();

select * from finish();
rollback;
