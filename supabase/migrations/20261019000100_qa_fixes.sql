-- QA round 1: completion gated on a final status, deletable unused statuses.

-- ---------- Completion requires a final status (e.g. Treasurer's "Paid") ----------
alter table pr_tracker.office_statuses add column allows_completion boolean not null default false;

update pr_tracker.office_statuses s set allows_completion = true
  from pr_tracker.offices o
 where o.id = s.office_id and o.code = 'TREAS' and s.label = 'Paid';

create or replace function pr_tracker.complete_pr(p_pr_id uuid, p_remark text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_final text;
  v_event bigint;
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not (select can_complete from pr_tracker.offices where id = v_actor.office_id) then
    raise exception 'Your office is not allowed to complete PRs';
  end if;
  -- Offices that define final statuses may only complete once the PR is at one of them.
  select string_agg('"' || label || '"', ' or ' order by sort_order) into v_final
    from pr_tracker.office_statuses where office_id = v_actor.office_id and active and allows_completion;
  if v_final is not null and not exists (
       select 1 from pr_tracker.office_statuses
        where id = v_pr.current_status_id and office_id = v_actor.office_id and active and allows_completion) then
    raise exception 'Set the status to % before completing this PR', v_final;
  end if;
  update pr_tracker.purchase_requests set movement_state = 'completed', current_since = now() where id = p_pr_id;
  v_event := pr_tracker._log_event(p_pr_id, 'completed', v_actor, jsonb_build_object('remark', pr_tracker._clean(p_remark)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_remark);
  perform pr_tracker._notify(v_event, p_pr_id, 'completed', pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

drop function pr_tracker.admin_upsert_status(uuid, uuid, text, int, boolean);

create or replace function pr_tracker.admin_upsert_status(
  p_id uuid, p_office_id uuid, p_label text, p_sort_order int, p_active boolean, p_allows_completion boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id;
begin
  perform pr_tracker._require_admin();
  if pr_tracker._clean(p_label) is null then raise exception 'Status label is required'; end if;
  if exists (select 1 from pr_tracker.office_statuses
              where office_id = p_office_id and label = trim(p_label) and id is distinct from p_id) then
    raise exception 'This office already has a status named %', trim(p_label);
  end if;
  if p_id is null then
    insert into pr_tracker.office_statuses (office_id, label, sort_order, active, allows_completion)
    values (p_office_id, trim(p_label), coalesce(p_sort_order, 0), coalesce(p_active, true), coalesce(p_allows_completion, false))
    returning id into v_id;
  else
    update pr_tracker.office_statuses set label = trim(p_label), sort_order = coalesce(p_sort_order, 0),
      active = coalesce(p_active, true), allows_completion = coalesce(p_allows_completion, false)
    where id = p_id;
    if not found then raise exception 'Status not found'; end if;
  end if;
  return v_id;
end $$;

-- ---------- Unused statuses can be deleted; used ones must be deactivated ----------
create or replace function pr_tracker.admin_delete_status(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pr_tracker._require_admin();
  perform 1 from pr_tracker.office_statuses where id = p_id for update;
  if not found then raise exception 'Status not found'; end if;
  if exists (select 1 from pr_tracker.pr_events where status_id = p_id)
     or exists (select 1 from pr_tracker.purchase_requests where current_status_id = p_id) then
    raise exception 'This status has already been used on a PR, so it cannot be deleted. Deactivate it instead';
  end if;
  delete from pr_tracker.office_statuses where id = p_id;
end $$;

grant execute on function
  pr_tracker.admin_upsert_status(uuid, uuid, text, int, boolean, boolean),
  pr_tracker.admin_delete_status(uuid)
to authenticated;
