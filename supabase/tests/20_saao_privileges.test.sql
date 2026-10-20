begin;
select plan(5);

-- Every SAAO function must be classified. Only the public RPCs and the helpers RLS policies call
-- as the signed-in user may be executable by authenticated; anon may execute none of them.
-- A newly added function fails here until it is revoked (internal) or added to this allowlist.
create temp table saao_allow (fn text primary key) on commit drop;
insert into saao_allow values
  ('pr_tracker._saao_rank(text)'),
  ('pr_tracker.saao_role()'),
  ('pr_tracker.saao_my_access()'),
  ('pr_tracker.saao_set_access(uuid,text)'),
  ('pr_tracker.saao_upsert_fund(uuid,text,text,boolean)'),
  ('pr_tracker.saao_upsert_classification(uuid,text,text,integer,boolean)'),
  ('pr_tracker.saao_create_book(integer,uuid,text,uuid,boolean)'),
  ('pr_tracker.saao_update_book(uuid,jsonb)'),
  ('pr_tracker.saao_add_node(uuid,uuid,uuid,text,text,text,uuid)'),
  ('pr_tracker.saao_update_node(uuid,jsonb)'),
  ('pr_tracker.saao_move_node(uuid,uuid,uuid)'),
  ('pr_tracker.saao_delete_node(uuid)'),
  ('pr_tracker.saao_upsert_movement(uuid,uuid,text,integer,text,text,date,text,text,text)'),
  ('pr_tracker.saao_delete_movement(uuid)'),
  ('pr_tracker.saao_set_movement_line(uuid,uuid,numeric)'),
  ('pr_tracker.saao_set_obligation(uuid,integer,numeric,text)'),
  ('pr_tracker.saao_upsert_allotment(uuid,uuid,numeric,text,date,text,text)'),
  ('pr_tracker.saao_delete_allotment(uuid)'),
  ('pr_tracker.saao_set_extra(uuid,text,text,numeric)'),
  ('pr_tracker.saao_apply_batch(uuid,jsonb)'),
  ('pr_tracker.saao_compute_lines(uuid,date)'),
  ('pr_tracker.saao_create_draft(uuid,date)'),
  ('pr_tracker.saao_delete_draft(uuid)'),
  ('pr_tracker.saao_unapproved_movements(uuid)'),
  ('pr_tracker.saao_finalize(uuid,uuid[])'),
  ('pr_tracker.saao_start_revision(uuid,text)'),
  ('pr_tracker.saao_live_rows(uuid,date)');

create temp view saao_fns as
  select p.oid, p.oid::regprocedure::text as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'pr_tracker' and p.proname like '%saao%';

select set_eq(
  $$select fn from saao_fns where has_function_privilege('authenticated', oid, 'execute')$$,
  $$select fn from saao_allow$$,
  'authenticated can execute exactly the allowlisted SAAO functions');

select is_empty(
  $$select fn from saao_fns where has_function_privilege('anon', oid, 'execute')$$,
  'anon can execute no SAAO function');

select is_empty(
  $$select f.fn from saao_fns f join pg_proc p on p.oid = f.oid where p.proacl is null$$,
  'no SAAO function relies on the PUBLIC default ACL');

-- behaviour: a signed-in user with no budget role cannot reach the internal helpers
select tests.make_user('nobody@saao-priv.test', 'BAC');
select tests.authenticate_as('nobody@saao-priv.test');
select throws_ok(
  $$select pr_tracker._saao_place_node(gen_random_uuid(), null, null)$$,
  '42501', null, 'authenticated cannot call _saao_place_node');
select throws_ok(
  $$select pr_tracker._saao_audit(null, null, 'x', gen_random_uuid(), 'forged', null, null)$$,
  '42501', null, 'authenticated cannot call _saao_audit');
select tests.clear_authentication();

select * from finish();
rollback;
