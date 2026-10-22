-- Dashboard charts, aggregated in SQL so PostgREST's max_rows cap can never truncate the counts.
-- Both are scoped to the caller's own office.

-- PRs received vs sent out (forwarded or returned) by the caller's office, per Manila week (Mon start),
-- oldest first, with empty weeks filled in as zero.
create or replace function pr_tracker.dashboard_weekly_activity(p_weeks int default 12)
returns table (week_start date, received bigint, sent bigint)
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select date_trunc('week', now() at time zone 'Asia/Manila')::date as this_week,
           greatest(1, least(coalesce(p_weeks, 12), 52)) as n
  ),
  weeks as (
    select (b.this_week - 7 * g)::date as wk from bounds b, generate_series(b.n - 1, 0, -1) g
  ),
  ev as (
    select date_trunc('week', e.created_at at time zone 'Asia/Manila')::date as wk, e.event_type
      from pr_tracker.pr_events e, bounds b
     where e.actor_office_id = pr_tracker.current_office_id()
       and e.event_type in ('received', 'forwarded', 'returned')
       and e.created_at >= ((b.this_week - 7 * (b.n - 1))::timestamp at time zone 'Asia/Manila')
  )
  select w.wk,
         count(ev.wk) filter (where ev.event_type = 'received'),
         count(ev.wk) filter (where ev.event_type in ('forwarded', 'returned'))
    from weeks w
    left join ev on ev.wk = w.wk
   where pr_tracker.is_active_user()
   group by w.wk
   order by w.wk
$$;

-- Where the caller's office's open PRs (originated there, not completed/cancelled) currently are.
create or replace function pr_tracker.dashboard_open_pr_locations()
returns table (office_name text, prs bigint)
language sql stable security definer set search_path = '' as $$
  select o.name, count(*)
    from pr_tracker.purchase_requests p
    join pr_tracker.offices o on o.id = p.current_office_id
   where pr_tracker.is_active_user()
     and p.origin_office_id = pr_tracker.current_office_id()
     and p.movement_state not in ('completed', 'cancelled')
   group by o.name
   order by count(*) desc, o.name
$$;

grant execute on function
  pr_tracker.dashboard_weekly_activity(int),
  pr_tracker.dashboard_open_pr_locations()
to authenticated;
