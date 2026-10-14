-- Final whole-branch review fixes (I2, I3, I4, M2). Apply after 20261009001100_storage.sql.

-- ---------- I2: register_attachment verifies size/type from Storage, not from the browser ----------
create or replace function pr_tracker.register_attachment(
  p_pr_id uuid, p_storage_path text, p_filename text, p_size_bytes bigint, p_mime_type text,
  p_is_pr_document boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_max_mb numeric;
  v_meta jsonb;
  v_size bigint;
  v_mime text;
  v_prev pr_tracker.pr_attachments;
  v_id uuid;
  v_event bigint;
begin
  if not (pr_tracker._is_holder(v_pr, v_actor.office_id) or v_pr.origin_office_id = v_actor.office_id) then
    raise exception 'Only the office holding this PR or the originating office can add attachments';
  end if;
  -- Early checks on the values the browser reports (friendly errors); the stored values are re-checked below.
  if p_mime_type is null or not (p_mime_type = any (pr_tracker._allowed_mime_types())) then
    raise exception 'File type not allowed';
  end if;
  select (value #>> '{}')::numeric into v_max_mb from pr_tracker.app_settings where key = 'max_upload_mb';
  v_max_mb := coalesce(v_max_mb, 20);
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > v_max_mb * 1024 * 1024 then
    raise exception 'File is larger than % MB', v_max_mb;
  end if;
  if p_storage_path is null or p_storage_path not like p_pr_id::text || '/%' then
    raise exception 'Invalid attachment path';
  end if;

  if p_is_pr_document then
    if v_pr.origin_office_id <> v_actor.office_id or not pr_tracker._can_origin_edit(v_pr) then
      raise exception 'Only the originating office can upload the PR document, while the PR is in Draft or returned to it';
    end if;
    if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
      raise exception 'The PR document must be a PDF, JPG or PNG file';
    end if;
  end if;

  -- Authoritative values: what Storage recorded for the finished upload.
  select o.metadata into v_meta from storage.objects o
   where o.bucket_id = 'pr-tracker-attachments' and o.name = p_storage_path;
  v_size := case when v_meta ->> 'size' ~ '^\d{1,18}$' then (v_meta ->> 'size')::bigint end;
  v_mime := lower(split_part(v_meta ->> 'mimetype', ';', 1));
  if v_meta is null or v_size is null or v_mime is null then
    raise exception 'Upload not found. Please upload the file again';
  end if;
  if not (v_mime = any (pr_tracker._allowed_mime_types())) then
    raise exception 'File type not allowed';
  end if;
  if p_is_pr_document and v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'The PR document must be a PDF, JPG or PNG file';
  end if;
  if v_size <= 0 or v_size > v_max_mb * 1024 * 1024 then
    raise exception 'File is larger than % MB', v_max_mb;
  end if;

  if p_is_pr_document then
    select * into v_prev from pr_tracker.pr_attachments
     where pr_id = p_pr_id and is_pr_document and superseded_at is null for update;
    if found then
      update pr_tracker.pr_attachments
         set superseded_at = now(), superseded_reason = 'Replaced by a new PR document'
       where id = v_prev.id;
    end if;
  end if;

  insert into pr_tracker.pr_attachments (pr_id, office_id, uploaded_by, storage_path, filename, size_bytes, mime_type, is_pr_document)
  values (p_pr_id, v_actor.office_id, v_actor.id, p_storage_path, trim(p_filename), v_size, v_mime, coalesce(p_is_pr_document, false))
  returning id into v_id;

  if p_is_pr_document then
    v_event := pr_tracker._log_event(p_pr_id, 'pr_document_uploaded', v_actor, jsonb_build_object('payload',
      jsonb_build_object('attachment_id', v_id, 'filename', trim(p_filename), 'replaced_filename', v_prev.filename)));
    perform pr_tracker._notify(v_event, p_pr_id, 'pr_document_uploaded', pr_tracker._followers(p_pr_id), v_actor.office_id);
  else
    v_event := pr_tracker._log_event(p_pr_id, 'attachment_added', v_actor,
      jsonb_build_object('payload', jsonb_build_object('attachment_id', v_id, 'filename', trim(p_filename))));
    perform pr_tracker._notify(v_event, p_pr_id, 'attachment_added', pr_tracker._followers(p_pr_id), v_actor.office_id);
  end if;
  return v_id;
end $$;

-- ---------- I3: notifications list consistent with the unread count ----------
-- The security_invoker view hid notifications for PRs the office can no longer read (e.g. a recalled
-- forward), while unread_notification_count counted them. Replace it with a definer function scoped to
-- the caller's own office that exposes only minimal PR fields and whether the PR is viewable.
drop view if exists pr_tracker.my_notifications;

create or replace function pr_tracker.list_my_notifications(p_limit int default 20)
returns table (id bigint, pr_id uuid, routing_slip_no text, purpose text, type pr_tracker.event_type,
               created_at timestamptz, actor_name text, actor_office_name text, to_office_name text,
               is_read boolean, can_view boolean)
language sql stable security definer set search_path = '' as $$
  select n.id, n.pr_id, p.routing_slip_no, p.purpose, n.type, n.created_at,
         a.full_name, ao.name, t.name,
         exists (select 1 from pr_tracker.notification_reads r
                  where r.notification_id = n.id and r.profile_id = pr_tracker.current_profile_id()),
         pr_tracker.can_view_pr(n.pr_id)
    from pr_tracker.notifications n
    join pr_tracker.purchase_requests p on p.id = n.pr_id
    join pr_tracker.pr_events e on e.id = n.event_id
    join pr_tracker.profiles a on a.id = e.actor_id
    left join pr_tracker.offices ao on ao.id = e.actor_office_id
    left join pr_tracker.offices t on t.id = e.to_office_id
   where n.recipient_office_id = pr_tracker.current_office_id()
   order by n.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- ---------- I4: integer-only numeric settings; stuck report tolerant of legacy values ----------
create or replace function pr_tracker.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pr_tracker._require_admin();
  case p_key
    when 'lgu_name' then
      if jsonb_typeof(p_value) <> 'string' or pr_tracker._clean(p_value #>> '{}') is null then
        raise exception 'LGU name is required'; end if;
    when 'stuck_threshold_days' then
      if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
         or (p_value #>> '{}')::numeric not between 1 and 365 then
        raise exception 'Stuck threshold must be a whole number of days between 1 and 365'; end if;
    when 'max_upload_mb' then
      if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
         or (p_value #>> '{}')::numeric not between 1 and 50 then
        raise exception 'Max upload size must be a whole number of MB between 1 and 50'; end if;
    else
      raise exception 'Unknown or protected setting: %', p_key;
  end case;
  insert into pr_tracker.app_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end $$;

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
     and p.current_since <= now() - interval '1 day' * coalesce(
           (select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end
              from pr_tracker.app_settings s where s.key = 'stuck_threshold_days'), 5)
   order by p.current_since
$$;

-- ---------- M2: explicit no-write posture for API roles (shared project) ----------
revoke insert, update, delete, truncate on all tables in schema pr_tracker from anon, authenticated;
alter default privileges in schema pr_tracker revoke insert, update, delete, truncate on tables from anon, authenticated;

-- ---------- grants (new/replaced functions; execute is revoked by default in this schema) ----------
revoke execute on function
  pr_tracker.register_attachment(uuid, text, text, bigint, text, boolean),
  pr_tracker.list_my_notifications(int),
  pr_tracker.admin_set_setting(text, jsonb),
  pr_tracker.report_stuck_prs()
from public, anon;
grant execute on function
  pr_tracker.register_attachment(uuid, text, text, bigint, text, boolean),
  pr_tracker.list_my_notifications(int),
  pr_tracker.admin_set_setting(text, jsonb),
  pr_tracker.report_stuck_prs()
to authenticated;
