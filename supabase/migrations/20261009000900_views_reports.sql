create view pr_tracker.pr_overview with (security_invoker = true) as
select p.*,
       oo.code as origin_office_code, oo.name as origin_office_name,
       co.code as current_office_code, co.name as current_office_name,
       s.label as current_status_label,
       so.name as sent_by_office_name,
       (select count(*) from pr_tracker.default_route_steps)::int as total_steps,
       exists (select 1 from pr_tracker.pr_attachments a
                where a.pr_id = p.id and a.is_pr_document and a.superseded_at is null) as has_pr_document,
       round((extract(epoch from (now() - p.current_since)) / 86400.0)::numeric, 1) as days_here
from pr_tracker.purchase_requests p
join pr_tracker.offices oo on oo.id = p.origin_office_id
join pr_tracker.offices co on co.id = p.current_office_id
left join pr_tracker.office_statuses s on s.id = p.current_status_id
left join pr_tracker.offices so on so.id = p.sent_by_office_id;

create view pr_tracker.pr_timeline with (security_invoker = true) as
select e.id, e.pr_id, e.event_type, e.created_at,
       a.full_name as actor_name, ao.name as actor_office_name,
       fo.name as from_office_name, t.name as to_office_name,
       s.label as status_label, e.override_reason, e.remark,
       e.from_route_step, e.to_route_step, e.route_purpose, e.is_private, e.payload
from pr_tracker.pr_events e
join pr_tracker.profiles a on a.id = e.actor_id
left join pr_tracker.offices ao on ao.id = e.actor_office_id
left join pr_tracker.offices fo on fo.id = e.from_office_id
left join pr_tracker.offices t on t.id = e.to_office_id
left join pr_tracker.office_statuses s on s.id = e.status_id;

create view pr_tracker.followed_activity with (security_invoker = true) as
select e.id, e.pr_id, p.routing_slip_no, p.purpose, e.event_type, e.created_at,
       a.full_name as actor_name, ao.name as actor_office_name
from pr_tracker.pr_events e
join pr_tracker.pr_followers f on f.pr_id = e.pr_id and f.office_id = pr_tracker.current_office_id()
join pr_tracker.purchase_requests p on p.id = e.pr_id
join pr_tracker.profiles a on a.id = e.actor_id
left join pr_tracker.offices ao on ao.id = e.actor_office_id
where not e.is_private and e.event_type not in ('followed', 'unfollowed');

create view pr_tracker.my_notifications with (security_invoker = true) as
select n.id, n.pr_id, p.routing_slip_no, p.purpose, n.type, n.created_at,
       a.full_name as actor_name, ao.name as actor_office_name, t.name as to_office_name,
       exists (select 1 from pr_tracker.notification_reads r
                where r.notification_id = n.id and r.profile_id = pr_tracker.current_profile_id()) as is_read
from pr_tracker.notifications n
join pr_tracker.purchase_requests p on p.id = n.pr_id
join pr_tracker.pr_events e on e.id = n.event_id
join pr_tracker.profiles a on a.id = e.actor_id
left join pr_tracker.offices ao on ao.id = e.actor_office_id
left join pr_tracker.offices t on t.id = e.to_office_id;

grant select on pr_tracker.pr_overview, pr_tracker.pr_timeline, pr_tracker.followed_activity,
  pr_tracker.my_notifications to authenticated;

create or replace function pr_tracker.tracking_lookup(p_routing_slip_no text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pr pr_tracker.purchase_requests; v_can boolean;
begin
  if not pr_tracker.is_active_user() then raise exception 'Your account is not authorized'; end if;
  select * into v_pr from pr_tracker.purchase_requests where routing_slip_no = upper(trim(p_routing_slip_no));
  if not found then return null; end if;
  v_can := pr_tracker.can_view_pr(v_pr.id);
  return jsonb_build_object(
    'pr_id', case when v_can then v_pr.id end,
    'can_view', v_can,
    'routing_slip_no', v_pr.routing_slip_no,
    'pr_no', v_pr.pr_no,
    'origin_office_name', (select name from pr_tracker.offices where id = v_pr.origin_office_id),
    'current_office_name', (select name from pr_tracker.offices where id = v_pr.current_office_id),
    'movement_state', v_pr.movement_state,
    'current_status_label', (select label from pr_tracker.office_statuses where id = v_pr.current_status_id),
    'current_purpose', v_pr.current_purpose,
    'current_since', v_pr.current_since,
    'route_step', v_pr.route_step,
    'total_steps', (select count(*) from pr_tracker.default_route_steps),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('event_type', e.event_type, 'from_office_name', fo.name,
                                          'to_office_name', t.name, 'created_at', e.created_at) order by e.id)
        from pr_tracker.pr_events e
        left join pr_tracker.offices fo on fo.id = e.from_office_id
        left join pr_tracker.offices t on t.id = e.to_office_id
       where e.pr_id = v_pr.id
         and e.event_type in ('created', 'forwarded', 'received', 'returned', 'recalled', 'completed', 'cancelled')),
      '[]'::jsonb));
end $$;

create or replace function pr_tracker.unread_notification_count()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from pr_tracker.notifications n
   where n.recipient_office_id = pr_tracker.current_office_id()
     and not exists (select 1 from pr_tracker.notification_reads r
                      where r.notification_id = n.id and r.profile_id = pr_tracker.current_profile_id())
$$;

create or replace function pr_tracker.mark_notifications_read(p_ids bigint[])
returns void language sql security definer set search_path = '' as $$
  insert into pr_tracker.notification_reads (notification_id, profile_id)
  select n.id, pr_tracker.current_profile_id() from pr_tracker.notifications n
   where n.id = any (p_ids) and n.recipient_office_id = pr_tracker.current_office_id()
     and pr_tracker.current_profile_id() is not null
  on conflict do nothing
$$;

create or replace function pr_tracker.mark_all_notifications_read()
returns void language sql security definer set search_path = '' as $$
  insert into pr_tracker.notification_reads (notification_id, profile_id)
  select n.id, pr_tracker.current_profile_id() from pr_tracker.notifications n
   where n.recipient_office_id = pr_tracker.current_office_id()
     and pr_tracker.current_profile_id() is not null
  on conflict do nothing
$$;

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
     and p.movement_state in ('in_transit', 'returned', 'received')
     and p.current_since <= now() - make_interval(days => coalesce(
           (select (value #>> '{}')::int from pr_tracker.app_settings where key = 'stuck_threshold_days'), 5))
   order by p.current_since
$$;

grant execute on function
  pr_tracker.tracking_lookup(text),
  pr_tracker.unread_notification_count(),
  pr_tracker.mark_notifications_read(bigint[]),
  pr_tracker.mark_all_notifications_read(),
  pr_tracker.report_office_days(date, date),
  pr_tracker.report_stuck_prs()
to authenticated;
