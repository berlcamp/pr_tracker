create or replace function pr_tracker._next_routing_slip_no()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Manila';
  v_seq int;
begin
  insert into pr_tracker.routing_slip_counters as c (year, last_value)
  values (extract(year from v_now)::int, 1)
  on conflict (year) do update set last_value = c.last_value + 1
  returning c.last_value into v_seq;
  return 'RS-' || to_char(v_now, 'YYYY-MM') || '-' || lpad(v_seq::text, 5, '0');
end $$;

create or replace function pr_tracker._validate_header(p_header jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if pr_tracker._clean(p_header ->> 'purpose') is null then raise exception 'Purpose is required'; end if;
  if pr_tracker._clean(p_header ->> 'requested_by_name') is null then raise exception 'Requested by is required'; end if;
  if (p_header ->> 'amount') is null or (p_header ->> 'amount')::numeric <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
end $$;

create or replace function pr_tracker._pr_snapshot(p_pr_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('header', jsonb_build_object(
    'pr_date', p.pr_date, 'purpose', p.purpose, 'amount', p.amount,
    'responsibility_center_code', p.responsibility_center_code, 'fund_cluster', p.fund_cluster,
    'requested_by_name', p.requested_by_name, 'requested_by_designation', p.requested_by_designation))
  from pr_tracker.purchase_requests p where p.id = p_pr_id
$$;

create or replace function pr_tracker.create_pr(p_header jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_id uuid;
begin
  perform pr_tracker._validate_header(p_header);

  insert into pr_tracker.purchase_requests (
    routing_slip_no, origin_office_id, responsibility_center_code, fund_cluster, pr_date, purpose, amount,
    requested_by_name, requested_by_designation, current_office_id, created_by)
  values (
    pr_tracker._next_routing_slip_no(), v_actor.office_id,
    pr_tracker._clean(p_header ->> 'responsibility_center_code'), pr_tracker._clean(p_header ->> 'fund_cluster'),
    coalesce((p_header ->> 'pr_date')::date, (now() at time zone 'Asia/Manila')::date),
    trim(p_header ->> 'purpose'), round((p_header ->> 'amount')::numeric, 2),
    trim(p_header ->> 'requested_by_name'), pr_tracker._clean(p_header ->> 'requested_by_designation'),
    v_actor.office_id, v_actor.id)
  returning id into v_id;

  insert into pr_tracker.pr_involved_offices (pr_id, office_id) values (v_id, v_actor.office_id);
  insert into pr_tracker.pr_followers (pr_id, office_id) values (v_id, v_actor.office_id);
  perform pr_tracker._log_event(v_id, 'created', v_actor,
    jsonb_build_object('to_office_id', v_actor.office_id, 'to_route_step', 0));
  return v_id;
end $$;

create or replace function pr_tracker._can_origin_edit(p_pr pr_tracker.purchase_requests)
returns boolean language sql immutable set search_path = '' as $$
  select p_pr.movement_state = 'draft'
      or (p_pr.movement_state = 'received' and p_pr.current_office_id = p_pr.origin_office_id)
$$;

create or replace function pr_tracker.update_pr_content(p_pr_id uuid, p_header jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_before jsonb;
begin
  if v_actor.office_id <> v_pr.origin_office_id then
    raise exception 'Only the originating office can edit this PR';
  end if;
  if not pr_tracker._can_origin_edit(v_pr) then
    raise exception 'This PR is locked. It can only be edited while in Draft or after it is returned to your office';
  end if;
  perform pr_tracker._validate_header(p_header);

  if v_pr.first_forwarded_at is not null then
    v_before := pr_tracker._pr_snapshot(p_pr_id);
  end if;

  update pr_tracker.purchase_requests set
    responsibility_center_code = pr_tracker._clean(p_header ->> 'responsibility_center_code'),
    fund_cluster = pr_tracker._clean(p_header ->> 'fund_cluster'),
    pr_date = coalesce((p_header ->> 'pr_date')::date, pr_date),
    purpose = trim(p_header ->> 'purpose'),
    amount = round((p_header ->> 'amount')::numeric, 2),
    requested_by_name = trim(p_header ->> 'requested_by_name'),
    requested_by_designation = pr_tracker._clean(p_header ->> 'requested_by_designation')
  where id = p_pr_id;

  perform pr_tracker._log_event(p_pr_id, 'edited', v_actor,
    case when v_before is null then '{}'::jsonb
         else jsonb_build_object('payload', jsonb_build_object('before', v_before, 'after', pr_tracker._pr_snapshot(p_pr_id)))
    end);
end $$;

grant execute on function pr_tracker.create_pr(jsonb), pr_tracker.update_pr_content(uuid, jsonb) to authenticated;
