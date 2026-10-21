-- SAAO official line computation (spec §3, R1-R14). lib/saao/calc.ts mirrors this
-- function; both are tested against lib/saao/fixtures/basic.json (generated pgTAP
-- test supabase/tests/17_saao_compute.test.sql). Amounts are pesos (numeric).

create or replace function pr_tracker.saao_compute_lines(p_book_id uuid, p_cutoff date)
returns table (
  node_id uuid, appropriation numeric, nta numeric, sb jsonb, supplemental numeric,
  realignment numeric, total_changes numeric, adjusted numeric, allotment numeric,
  obligation numeric, months numeric[], balance_appropriation numeric,
  balance_allotment numeric, cna_1 numeric, cna_2 numeric, cna_3 numeric,
  savings numeric, savings_half numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_book pr_tracker.saao_books;
  v_month int;
begin
  perform pr_tracker._saao_require('encoder');
  if p_cutoff is null then raise exception 'Cutoff date is required'; end if;
  select * into v_book from pr_tracker.saao_books b where b.id = p_book_id;
  if not found then raise exception 'Budget book not found'; end if;
  v_month := extract(month from p_cutoff)::int;

  return query
  with lines as (
    select n.id, n.appropriation from pr_tracker.saao_nodes n
    where n.book_id = p_book_id and n.kind = 'line'
  ),
  -- R11 (PROVISIONAL): movement_rule decides which statuses count.
  -- R12 (PROVISIONAL): a movement counts when effective_date <= cutoff.
  mv as (
    select ml.node_id, m.kind, m.sb_number, ml.amount
    from pr_tracker.saao_movement_lines ml
    join pr_tracker.saao_movements m on m.id = ml.movement_id
    where m.book_id = p_book_id
      and m.effective_date <= p_cutoff
      and (v_book.movement_rule = 'all_entered' or m.status = 'approved')
  ),
  mv_sum as (
    select mv.node_id,
      coalesce(sum(mv.amount) filter (where mv.kind = 'nta_reduction'), 0) as nta,
      coalesce(sum(mv.amount) filter (where mv.kind = 'supplemental'), 0) as supplemental,  -- R1
      coalesce(sum(mv.amount) filter (where mv.kind not in ('nta_reduction', 'supplemental')), 0) as realignment  -- R2
    from mv group by mv.node_id
  ),
  sb_sum as (
    select s.node_id, jsonb_object_agg(s.sb_number::text, s.amt) as sb
    from (select mv.node_id, mv.sb_number, sum(mv.amount) as amt
          from mv where mv.kind = 'supplemental' group by mv.node_id, mv.sb_number) s
    group by s.node_id
  ),
  -- R6: months up to the cutoff month; later months are 0.
  ob as (
    select o.node_id, o.month, sum(o.amount) as amt
    from pr_tracker.saao_obligations o
    where o.node_id in (select l.id from lines l) and o.month <= v_month
    group by o.node_id, o.month
  ),
  ob_months as (
    select l.id as node_id,
      array(select coalesce((select ob.amt from ob where ob.node_id = l.id and ob.month = g), 0)
            from generate_series(1, 12) g order by g) as months
    from lines l
  ),
  al as (
    select a.node_id, sum(a.amount) as amt
    from pr_tracker.saao_allotments a
    where a.node_id in (select l.id from lines l)
      and a.status = 'approved' and a.allotment_date <= p_cutoff
    group by a.node_id
  ),
  base as (
    select l.id, l.appropriation,
      coalesce(s.nta, 0) as nta, coalesce(s.supplemental, 0) as supplemental,
      coalesce(s.realignment, 0) as realignment, coalesce(sb.sb, '{}'::jsonb) as sb,
      om.months,
      (select coalesce(sum(x), 0) from unnest(om.months) x) as obligation,
      coalesce(al.amt, 0) as recorded_allotment
    from lines l
    left join mv_sum s on s.node_id = l.id
    left join sb_sum sb on sb.node_id = l.id
    join ob_months om on om.node_id = l.id
    left join al on al.node_id = l.id
  ),
  calc as (
    select b.*,
      b.nta + b.supplemental + b.realignment as total_changes,  -- PROVISIONAL (R3): NTA inclusion mirrors NTA_IN_TOTAL_CHANGES in lib/saao/rules.ts; both must change together
      b.appropriation + b.nta + b.supplemental + b.realignment as adjusted  -- R4
    from base b
  ),
  fin as (
    select c.*,
      case when v_book.allotment_mode = 'equals_adjusted' then c.adjusted  -- PROVISIONAL (R5)
           else c.recorded_allotment end as allotment_v
    from calc c
  ),
  bal as (
    select f.*, f.allotment_v - f.obligation as balance_allotment  -- R8; R7 below
    from fin f
  ),
  -- AWAITING BUDGET OFFICE (R13): blank (0), "= Balance of Allotment", or a typed amount.
  ex as (
    select b.id,
      coalesce(max(case when e.mode = 'balance' then b.balance_allotment else e.amount end) filter (where e.field = 'cna_1'), 0) as cna_1,
      coalesce(max(case when e.mode = 'balance' then b.balance_allotment else e.amount end) filter (where e.field = 'cna_2'), 0) as cna_2,
      coalesce(max(case when e.mode = 'balance' then b.balance_allotment else e.amount end) filter (where e.field = 'cna_3'), 0) as cna_3,
      coalesce(max(case when e.mode = 'balance' then b.balance_allotment else e.amount end) filter (where e.field = 'savings'), 0) as savings
    from bal b
    left join pr_tracker.saao_line_extras e on e.node_id = b.id
    group by b.id
  )
  select b.id, b.appropriation, b.nta, b.sb, b.supplemental, b.realignment, b.total_changes,
    b.adjusted, b.allotment_v, b.obligation, b.months::numeric[],
    b.allotment_v - b.obligation,  -- PROVISIONAL (R7): Allotment - Obligation
    b.balance_allotment, x.cna_1, x.cna_2, x.cna_3, x.savings,
    round(x.savings / 2, 2)  -- AWAITING BUDGET OFFICE (R14), half away from zero
  from bal b join ex x on x.id = b.id;
end $$;

revoke all on function pr_tracker.saao_compute_lines(uuid, date) from public, anon;
grant execute on function pr_tracker.saao_compute_lines(uuid, date) to authenticated;
