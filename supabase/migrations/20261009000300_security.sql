-- ---------- public helpers (used by RLS and UI) ----------
create or replace function pr_tracker.current_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from pr_tracker.profiles p where p.auth_user_id = auth.uid() and p.active
$$;

create or replace function pr_tracker.current_office_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.office_id from pr_tracker.profiles p where p.auth_user_id = auth.uid() and p.active
$$;

create or replace function pr_tracker.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pr_tracker.profiles p where p.auth_user_id = auth.uid() and p.active)
$$;

create or replace function pr_tracker.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pr_tracker.profiles p
                  where p.auth_user_id = auth.uid() and p.active and p.role in ('admin', 'super_admin'))
$$;

create or replace function pr_tracker.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pr_tracker.profiles p
                  where p.auth_user_id = auth.uid() and p.active and p.role = 'super_admin')
$$;

-- Involved = office created/received it, OR it is currently addressed to/held by my office.
create or replace function pr_tracker.is_involved(p_pr_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pr_tracker.pr_involved_offices i
                  where i.pr_id = p_pr_id and i.office_id = pr_tracker.current_office_id())
      or exists (select 1 from pr_tracker.purchase_requests p
                  where p.id = p_pr_id and p.current_office_id = pr_tracker.current_office_id())
$$;

create or replace function pr_tracker.can_view_pr(p_pr_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select pr_tracker.is_admin() or pr_tracker.is_involved(p_pr_id)
$$;

grant execute on function pr_tracker.current_profile_id(), pr_tracker.current_office_id(),
  pr_tracker.is_active_user(), pr_tracker.is_admin(), pr_tracker.is_super_admin(),
  pr_tracker.is_involved(uuid), pr_tracker.can_view_pr(uuid) to authenticated;

-- ---------- internal helpers (NOT granted) ----------
create or replace function pr_tracker._clean(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(trim(p), '')
$$;

create or replace function pr_tracker._actor()
returns pr_tracker.profiles language plpgsql stable security definer set search_path = '' as $$
declare v pr_tracker.profiles;
begin
  select * into v from pr_tracker.profiles where auth_user_id = auth.uid() and active;
  if not found then raise exception 'Your account is not authorized'; end if;
  return v;
end $$;

create or replace function pr_tracker._actor_with_office()
returns pr_tracker.profiles language plpgsql stable security definer set search_path = '' as $$
declare v pr_tracker.profiles := pr_tracker._actor();
begin
  if v.office_id is null then raise exception 'Your account is not assigned to an office'; end if;
  return v;
end $$;

create or replace function pr_tracker._lock_pr(p_pr_id uuid)
returns pr_tracker.purchase_requests language plpgsql security definer set search_path = '' as $$
declare v pr_tracker.purchase_requests;
begin
  select * into v from pr_tracker.purchase_requests where id = p_pr_id for update;
  if not found then raise exception 'Purchase request not found'; end if;
  return v;
end $$;

create or replace function pr_tracker._is_holder(p_pr pr_tracker.purchase_requests, p_office_id uuid)
returns boolean language sql immutable set search_path = '' as $$
  select (p_pr.movement_state = 'received' and p_pr.current_office_id = p_office_id)
      or (p_pr.movement_state = 'draft' and p_pr.origin_office_id = p_office_id)
$$;

create or replace function pr_tracker._require_holder(p_pr pr_tracker.purchase_requests, p_actor pr_tracker.profiles)
returns void language plpgsql set search_path = '' as $$
begin
  if not pr_tracker._is_holder(p_pr, p_actor.office_id) then
    raise exception 'This PR is not at your office';
  end if;
end $$;

create or replace function pr_tracker._require_received_holder(p_pr pr_tracker.purchase_requests, p_actor pr_tracker.profiles)
returns void language plpgsql set search_path = '' as $$
begin
  if p_pr.movement_state <> 'received' or p_pr.current_office_id is distinct from p_actor.office_id then
    raise exception 'This PR is not at your office';
  end if;
end $$;

create or replace function pr_tracker._log_event(
  p_pr_id uuid, p_type pr_tracker.event_type, p_actor pr_tracker.profiles, p_fields jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into pr_tracker.pr_events (
    pr_id, event_type, actor_id, actor_office_id, from_office_id, to_office_id, status_id,
    override_reason, remark, from_route_step, to_route_step, route_purpose, is_private, payload)
  values (
    p_pr_id, p_type, p_actor.id, p_actor.office_id,
    (p_fields ->> 'from_office_id')::uuid, (p_fields ->> 'to_office_id')::uuid, (p_fields ->> 'status_id')::uuid,
    p_fields ->> 'override_reason', p_fields ->> 'remark',
    (p_fields ->> 'from_route_step')::int, (p_fields ->> 'to_route_step')::int, p_fields ->> 'route_purpose',
    coalesce((p_fields ->> 'is_private')::boolean, false),
    coalesce(p_fields -> 'payload', '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create or replace function pr_tracker._notify(
  p_event_id bigint, p_pr_id uuid, p_type pr_tracker.event_type, p_offices uuid[], p_exclude uuid)
returns void language sql security definer set search_path = '' as $$
  insert into pr_tracker.notifications (recipient_office_id, pr_id, event_id, type)
  select distinct o, p_pr_id, p_event_id, p_type
    from unnest(p_offices) as o
   where o is not null and o is distinct from p_exclude;
$$;

create or replace function pr_tracker._followers(p_pr_id uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(f.office_id), '{}'::uuid[]) from pr_tracker.pr_followers f where f.pr_id = p_pr_id
$$;

create or replace function pr_tracker._add_remark(p_pr_id uuid, p_actor pr_tracker.profiles, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pr_tracker._clean(p_body) is not null then
    insert into pr_tracker.pr_remarks (pr_id, office_id, author_id, body)
    values (p_pr_id, p_actor.office_id, p_actor.id, trim(p_body));
  end if;
end $$;

-- Functions default to EXECUTE for PUBLIC: close that, then re-grant only the public helpers.
revoke execute on all functions in schema pr_tracker from public, anon, authenticated;
alter default privileges in schema pr_tracker revoke execute on functions from public, anon, authenticated;
grant execute on function pr_tracker.current_profile_id(), pr_tracker.current_office_id(),
  pr_tracker.is_active_user(), pr_tracker.is_admin(), pr_tracker.is_super_admin(),
  pr_tracker.is_involved(uuid), pr_tracker.can_view_pr(uuid) to authenticated;

-- ---------- grants: read-only through RLS ----------
grant select on all tables in schema pr_tracker to authenticated;
revoke select on pr_tracker.routing_slip_counters from authenticated;

alter table pr_tracker.offices enable row level security;
alter table pr_tracker.profiles enable row level security;
alter table pr_tracker.app_settings enable row level security;
alter table pr_tracker.default_route_steps enable row level security;
alter table pr_tracker.office_statuses enable row level security;
alter table pr_tracker.routing_slip_counters enable row level security;
alter table pr_tracker.purchase_requests enable row level security;
alter table pr_tracker.pr_involved_offices enable row level security;
alter table pr_tracker.pr_events enable row level security;
alter table pr_tracker.pr_remarks enable row level security;
alter table pr_tracker.pr_private_notes enable row level security;
alter table pr_tracker.pr_attachments enable row level security;
alter table pr_tracker.pr_followers enable row level security;
alter table pr_tracker.notifications enable row level security;
alter table pr_tracker.notification_reads enable row level security;

create policy offices_read on pr_tracker.offices for select to authenticated
  using ((select pr_tracker.is_active_user()));
create policy profiles_read on pr_tracker.profiles for select to authenticated
  using ((select pr_tracker.is_active_user()));
create policy app_settings_read on pr_tracker.app_settings for select to authenticated
  using ((select pr_tracker.is_active_user()));
create policy route_read on pr_tracker.default_route_steps for select to authenticated
  using ((select pr_tracker.is_active_user()));
create policy statuses_read on pr_tracker.office_statuses for select to authenticated
  using ((select pr_tracker.is_active_user()));

create policy prs_read on pr_tracker.purchase_requests for select to authenticated
  using (pr_tracker.can_view_pr(id));
create policy involved_read on pr_tracker.pr_involved_offices for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy remarks_read on pr_tracker.pr_remarks for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy attachments_read on pr_tracker.pr_attachments for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy followers_read on pr_tracker.pr_followers for select to authenticated
  using (pr_tracker.can_view_pr(pr_id));
create policy events_read on pr_tracker.pr_events for select to authenticated
  using (pr_tracker.can_view_pr(pr_id)
         and (not is_private or actor_office_id = (select pr_tracker.current_office_id())));
create policy notes_read on pr_tracker.pr_private_notes for select to authenticated
  using (office_id = (select pr_tracker.current_office_id()));
create policy notifications_read on pr_tracker.notifications for select to authenticated
  using (recipient_office_id = (select pr_tracker.current_office_id()));
create policy notification_reads_read on pr_tracker.notification_reads for select to authenticated
  using (profile_id = (select pr_tracker.current_profile_id()));
-- routing_slip_counters: no policy, no grant.
