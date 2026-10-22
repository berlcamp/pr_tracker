-- The dashboard's "Following" feed described events without their details ("Forwarded to null ...").
-- Expose the same event fields pr_timeline does (still gated by pr_events RLS via security_invoker),
-- plus total_steps for the "(step n of N)" text. New columns are appended, as create or replace view requires.
create or replace view pr_tracker.followed_activity with (security_invoker = true) as
select e.id, e.pr_id, p.routing_slip_no, p.purpose, e.event_type, e.created_at,
       a.full_name as actor_name, ao.name as actor_office_name,
       fo.name as from_office_name, t.name as to_office_name, s.label as status_label,
       e.override_reason, e.remark, e.to_route_step, e.route_purpose, e.payload,
       (select count(*) from pr_tracker.default_route_steps)::int as total_steps
from pr_tracker.pr_events e
join pr_tracker.pr_followers f on f.pr_id = e.pr_id and f.office_id = pr_tracker.current_office_id()
join pr_tracker.purchase_requests p on p.id = e.pr_id
join pr_tracker.profiles a on a.id = e.actor_id
left join pr_tracker.offices ao on ao.id = e.actor_office_id
left join pr_tracker.offices fo on fo.id = e.from_office_id
left join pr_tracker.offices t on t.id = e.to_office_id
left join pr_tracker.office_statuses s on s.id = e.status_id
where not e.is_private and e.event_type not in ('followed', 'unfollowed');
