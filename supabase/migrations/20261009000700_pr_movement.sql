create or replace function pr_tracker._next_route_step(p_route_step int, p_holder_office uuid)
returns pr_tracker.default_route_steps language sql stable security definer set search_path = '' as $$
  select s.* from pr_tracker.default_route_steps s
   where s.step_order > p_route_step and s.office_id is distinct from p_holder_office
   order by s.step_order limit 1
$$;

create or replace function pr_tracker.suggest_next_step(p_pr_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_pr pr_tracker.purchase_requests;
  v_next pr_tracker.default_route_steps;
  v_name text;
begin
  if not pr_tracker.can_view_pr(p_pr_id) then raise exception 'Purchase request not found'; end if;
  select * into v_pr from pr_tracker.purchase_requests where id = p_pr_id;
  v_next := pr_tracker._next_route_step(v_pr.route_step, v_pr.current_office_id);
  select name into v_name from pr_tracker.offices where id = v_next.office_id;
  return jsonb_build_object(
    'route_step', v_pr.route_step,
    'total_steps', (select count(*) from pr_tracker.default_route_steps),
    'next', case when v_next.id is null then null else jsonb_build_object(
      'step_order', v_next.step_order, 'office_id', v_next.office_id,
      'office_name', v_name, 'purpose', v_next.purpose) end);
end $$;

create or replace function pr_tracker.forward_pr(
  p_pr_id uuid, p_to_office_id uuid, p_override_reason text default null, p_remark text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_next pr_tracker.default_route_steps;
  v_later pr_tracker.default_route_steps;
  v_new_step int;
  v_purpose text;
  v_override boolean := false;
  v_event bigint;
begin
  perform pr_tracker._require_holder(v_pr, v_actor);
  if p_to_office_id = v_actor.office_id then
    raise exception 'You cannot forward a PR to your own office';
  end if;
  if not exists (select 1 from pr_tracker.offices where id = p_to_office_id and active) then
    raise exception 'Destination office not found or inactive';
  end if;

  if not exists (select 1 from pr_tracker.pr_attachments
                  where pr_id = p_pr_id and is_pr_document and superseded_at is null) then
    raise exception 'Upload the PR document before forwarding';
  end if;

  v_next := pr_tracker._next_route_step(v_pr.route_step, v_actor.office_id);
  if v_next.id is not null and v_next.office_id = p_to_office_id then
    v_new_step := v_next.step_order;
    v_purpose := v_next.purpose;
  else
    v_override := true;
    select * into v_later from pr_tracker.default_route_steps
     where step_order > v_pr.route_step and office_id = p_to_office_id
     order by step_order limit 1;
    if found then
      v_new_step := v_later.step_order;
      v_purpose := v_later.purpose;
    else
      v_new_step := v_pr.route_step;
      v_purpose := null;
    end if;
    if pr_tracker._clean(p_override_reason) is null then
      raise exception 'A reason is required when forwarding outside the default route';
    end if;
  end if;

  update pr_tracker.purchase_requests set
    movement_state = 'in_transit', current_office_id = p_to_office_id, current_status_id = null,
    current_since = now(), current_purpose = v_purpose, sent_by_office_id = v_actor.office_id,
    prev_route_step = v_pr.route_step, route_step = v_new_step,
    first_forwarded_at = coalesce(first_forwarded_at, now())
  where id = p_pr_id;

  v_event := pr_tracker._log_event(p_pr_id, 'forwarded', v_actor, jsonb_build_object(
    'from_office_id', v_actor.office_id, 'to_office_id', p_to_office_id,
    'from_route_step', v_pr.route_step, 'to_route_step', v_new_step, 'route_purpose', v_purpose,
    'override_reason', case when v_override then trim(p_override_reason) end,
    'remark', pr_tracker._clean(p_remark)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_remark);
  perform pr_tracker._notify(v_event, p_pr_id, 'forwarded', array[p_to_office_id], v_actor.office_id);
end $$;

create or replace function pr_tracker.receive_pr(p_pr_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_last record;
  v_event bigint;
begin
  if v_pr.movement_state = 'received' and v_pr.current_office_id = v_actor.office_id then
    select p.full_name, o.code, e.created_at into v_last
      from pr_tracker.pr_events e
      join pr_tracker.profiles p on p.id = e.actor_id
      join pr_tracker.offices o on o.id = e.actor_office_id
     where e.pr_id = p_pr_id and e.event_type = 'received' and e.actor_office_id = v_actor.office_id
     order by e.id desc limit 1;
    if found then
      raise exception 'Already received by % (%) at %', v_last.full_name, v_last.code,
        to_char(v_last.created_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM');
    end if;
    raise exception 'This PR is already at your office';
  end if;
  if v_pr.movement_state not in ('in_transit', 'returned') or v_pr.current_office_id <> v_actor.office_id then
    raise exception 'This PR is not addressed to your office';
  end if;

  update pr_tracker.purchase_requests set
    movement_state = 'received', current_since = now(), current_status_id = null,
    sent_by_office_id = null, prev_route_step = null
  where id = p_pr_id;
  insert into pr_tracker.pr_involved_offices (pr_id, office_id) values (p_pr_id, v_actor.office_id)
  on conflict do nothing;

  v_event := pr_tracker._log_event(p_pr_id, 'received', v_actor, jsonb_build_object(
    'from_office_id', v_pr.sent_by_office_id, 'to_office_id', v_actor.office_id,
    'to_route_step', v_pr.route_step, 'route_purpose', v_pr.current_purpose));
  perform pr_tracker._notify(v_event, p_pr_id, 'received',
    array[v_pr.sent_by_office_id] || pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.return_pr(p_pr_id uuid, p_to_office_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_step int;
  v_event bigint;
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if pr_tracker._clean(p_reason) is null then
    raise exception 'A reason is required to return a PR';
  end if;
  if p_to_office_id = v_actor.office_id
     or not exists (select 1 from pr_tracker.pr_involved_offices where pr_id = p_pr_id and office_id = p_to_office_id) then
    raise exception 'You can only return a PR to its origin or an office that previously held it';
  end if;

  select e.to_route_step into v_step from pr_tracker.pr_events e
   where e.pr_id = p_pr_id and e.event_type = 'received' and e.actor_office_id = p_to_office_id
   order by e.id desc limit 1;
  v_step := coalesce(v_step, 0);

  update pr_tracker.purchase_requests set
    movement_state = 'returned', current_office_id = p_to_office_id, current_status_id = null,
    current_since = now(), current_purpose = null, sent_by_office_id = v_actor.office_id,
    prev_route_step = v_pr.route_step, route_step = v_step
  where id = p_pr_id;

  v_event := pr_tracker._log_event(p_pr_id, 'returned', v_actor, jsonb_build_object(
    'from_office_id', v_actor.office_id, 'to_office_id', p_to_office_id,
    'from_route_step', v_pr.route_step, 'to_route_step', v_step, 'remark', trim(p_reason)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_reason);
  perform pr_tracker._notify(v_event, p_pr_id, 'returned', array[p_to_office_id], v_actor.office_id);
end $$;

create or replace function pr_tracker.recall_pr(p_pr_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_to_draft boolean;
  v_event bigint;
begin
  if v_pr.movement_state not in ('in_transit', 'returned') or v_pr.sent_by_office_id is distinct from v_actor.office_id then
    raise exception 'You can only recall a PR your office sent that has not been received yet';
  end if;
  v_to_draft := v_actor.office_id = v_pr.origin_office_id
    and not exists (select 1 from pr_tracker.pr_events where pr_id = p_pr_id and event_type = 'received');

  update pr_tracker.purchase_requests set
    movement_state = (case when v_to_draft then 'draft' else 'received' end)::pr_tracker.movement_state,
    current_office_id = v_actor.office_id, current_status_id = null, current_since = now(),
    current_purpose = null, route_step = coalesce(v_pr.prev_route_step, v_pr.route_step),
    sent_by_office_id = null, prev_route_step = null,
    first_forwarded_at = case when v_to_draft then null else first_forwarded_at end
  where id = p_pr_id;

  v_event := pr_tracker._log_event(p_pr_id, 'recalled', v_actor, jsonb_build_object(
    'from_office_id', v_pr.current_office_id, 'to_office_id', v_actor.office_id,
    'from_route_step', v_pr.route_step, 'to_route_step', coalesce(v_pr.prev_route_step, v_pr.route_step),
    'remark', pr_tracker._clean(p_reason)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_reason);
  perform pr_tracker._notify(v_event, p_pr_id, 'recalled', array[v_pr.current_office_id], v_actor.office_id);
end $$;

grant execute on function
  pr_tracker.suggest_next_step(uuid),
  pr_tracker.forward_pr(uuid, uuid, text, text),
  pr_tracker.receive_pr(uuid),
  pr_tracker.return_pr(uuid, uuid, text),
  pr_tracker.recall_pr(uuid, text)
to authenticated;
