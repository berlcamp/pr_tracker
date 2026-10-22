-- Admins can no longer cancel PRs mid-route. Only the originating office may cancel, and only while it
-- holds the PR (draft, or received back at origin). An admin whose own office is the origin follows the same rule.
create or replace function pr_tracker.cancel_pr(p_pr_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_event bigint;
begin
  if v_pr.movement_state in ('completed', 'cancelled') then
    raise exception 'This PR is already %', v_pr.movement_state;
  end if;
  if not (v_actor.office_id = v_pr.origin_office_id
          and (v_pr.movement_state = 'draft'
               or (v_pr.movement_state = 'received' and v_pr.current_office_id = v_pr.origin_office_id))) then
    raise exception 'Only the originating office can cancel a PR, and only while it holds it';
  end if;
  if pr_tracker._clean(p_reason) is null then raise exception 'A reason is required to cancel a PR'; end if;
  update pr_tracker.purchase_requests set movement_state = 'cancelled', current_since = now() where id = p_pr_id;
  v_event := pr_tracker._log_event(p_pr_id, 'cancelled', v_actor, jsonb_build_object('remark', trim(p_reason)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_reason);
  perform pr_tracker._notify(v_event, p_pr_id, 'cancelled',
    array[v_pr.current_office_id] || pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;
