-- Reports: staff see only their own office; admins and super admins see every office.
-- Stuck PRs for staff = PRs currently at their office or originated by it.

create or replace function pr_tracker.report_office_days(p_from date, p_to date)
returns table (office_id uuid, office_code text, office_name text, prs_handled bigint,
               avg_days numeric, median_days numeric, max_days numeric, avg_transit_days numeric)
language sql stable security definer set search_path = '' as $$
  with ev as (
    select e.id, e.pr_id, e.event_type, e.actor_office_id, e.to_office_id, e.created_at
      from pr_tracker.pr_events e
     where e.event_type in ('received', 'recalled', 'forwarded', 'returned', 'completed', 'cancelled')
  ),
  holds as (
    select s.actor_office_id as office_id, s.pr_id,
           extract(epoch from (nx.created_at - s.created_at)) / 86400.0 as days, nx.created_at as ended_at
      from ev s
      join lateral (select n.created_at from ev n where n.pr_id = s.pr_id and n.id > s.id order by n.id limit 1) nx on true
     where s.event_type in ('received', 'recalled')
  ),
  transits as (
    select f.to_office_id as office_id,
           extract(epoch from (nx.created_at - f.created_at)) / 86400.0 as days, nx.created_at as ended_at
      from ev f
      join lateral (select n.event_type, n.created_at from ev n where n.pr_id = f.pr_id and n.id > f.id
                     order by n.id limit 1) nx on nx.event_type = 'received'
     where f.event_type in ('forwarded', 'returned')
  ),
  h as (
    select holds.office_id, count(distinct holds.pr_id) as prs, avg(days) as a,
           percentile_cont(0.5) within group (order by days) as m, max(days) as mx
      from holds where (ended_at at time zone 'Asia/Manila')::date between p_from and p_to
     group by holds.office_id
  ),
  t as (
    select transits.office_id, avg(days) as a from transits
     where (ended_at at time zone 'Asia/Manila')::date between p_from and p_to
     group by transits.office_id
  )
  select o.id, o.code, o.name, coalesce(h.prs, 0),
         round(h.a::numeric, 2), round(h.m::numeric, 2), round(h.mx::numeric, 2), round(t.a::numeric, 2)
    from pr_tracker.offices o
    left join h on h.office_id = o.id
    left join t on t.office_id = o.id
   where pr_tracker.is_active_user() and (h.office_id is not null or t.office_id is not null)
     and (pr_tracker.is_admin() or o.id = pr_tracker.current_office_id())
   order by h.a desc nulls last, o.name
$$;

create or replace function pr_tracker.report_stuck_prs()
returns table (pr_id uuid, routing_slip_no text, origin_office_name text, current_office_name text,
               movement_state text, days numeric, can_view boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.routing_slip_no, oo.name, co.name, p.movement_state::text,
         round((extract(epoch from (now() - p.current_since)) / 86400.0)::numeric, 1),
         pr_tracker.can_view_pr(p.id)
    from pr_tracker.purchase_requests p
    join pr_tracker.offices oo on oo.id = p.origin_office_id
    join pr_tracker.offices co on co.id = p.current_office_id
   where pr_tracker.is_active_user()
     and (pr_tracker.is_admin() or pr_tracker.current_office_id() in (p.current_office_id, p.origin_office_id))
     and p.movement_state in ('in_transit', 'returned', 'received')
     and p.current_since <= now() - interval '1 day' * coalesce(
           (select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end
              from pr_tracker.app_settings s where s.key = 'stuck_threshold_days'), 5)
   order by p.current_since
$$;
