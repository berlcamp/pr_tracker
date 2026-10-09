create or replace function pr_tracker._allowed_mime_types()
returns text[] language sql immutable set search_path = '' as $$
  select array['application/pdf', 'image/jpeg', 'image/png',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
$$;

create or replace function pr_tracker.set_status(p_pr_id uuid, p_status_id uuid, p_remark text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_event bigint;
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not exists (select 1 from pr_tracker.office_statuses
                  where id = p_status_id and office_id = v_actor.office_id and active) then
    raise exception 'That status does not belong to your office';
  end if;
  update pr_tracker.purchase_requests set current_status_id = p_status_id where id = p_pr_id;
  v_event := pr_tracker._log_event(p_pr_id, 'status_changed', v_actor,
    jsonb_build_object('status_id', p_status_id, 'remark', pr_tracker._clean(p_remark)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_remark);
  perform pr_tracker._notify(v_event, p_pr_id, 'status_changed', pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.add_remark(p_pr_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_event bigint;
begin
  if not (pr_tracker._is_holder(v_pr, v_actor.office_id) or v_pr.origin_office_id = v_actor.office_id) then
    raise exception 'Only the office holding this PR or the originating office can add remarks';
  end if;
  if pr_tracker._clean(p_body) is null then raise exception 'Remark cannot be empty'; end if;
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_body);
  v_event := pr_tracker._log_event(p_pr_id, 'remark_added', v_actor, jsonb_build_object('remark', trim(p_body)));
  perform pr_tracker._notify(v_event, p_pr_id, 'remark_added', pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.add_private_note(p_pr_id uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
begin
  perform pr_tracker._require_holder(v_pr, v_actor);
  if pr_tracker._clean(p_body) is null then raise exception 'Note cannot be empty'; end if;
  insert into pr_tracker.pr_private_notes (pr_id, office_id, author_id, body)
  values (p_pr_id, v_actor.office_id, v_actor.id, trim(p_body));
  perform pr_tracker._log_event(p_pr_id, 'private_note_added', v_actor, jsonb_build_object('is_private', true));
end $$;

create or replace function pr_tracker.register_attachment(
  p_pr_id uuid, p_storage_path text, p_filename text, p_size_bytes bigint, p_mime_type text,
  p_is_pr_document boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_max_mb numeric;
  v_prev pr_tracker.pr_attachments;
  v_id uuid;
  v_event bigint;
begin
  if not (pr_tracker._is_holder(v_pr, v_actor.office_id) or v_pr.origin_office_id = v_actor.office_id) then
    raise exception 'Only the office holding this PR or the originating office can add attachments';
  end if;
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

  if not exists (select 1 from storage.objects where bucket_id = 'pr-tracker-attachments' and name = p_storage_path) then
    raise exception 'Upload not found. Please upload the file again';
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
  values (p_pr_id, v_actor.office_id, v_actor.id, p_storage_path, trim(p_filename), p_size_bytes, p_mime_type, coalesce(p_is_pr_document, false))
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

create or replace function pr_tracker.supersede_attachment(p_attachment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_att pr_tracker.pr_attachments;
begin
  select * into v_att from pr_tracker.pr_attachments where id = p_attachment_id for update;
  if not found then raise exception 'Attachment not found'; end if;
  perform pr_tracker._lock_pr(v_att.pr_id);
  if v_att.office_id <> v_actor.office_id then
    raise exception 'Only the office that uploaded this file can mark it superseded';
  end if;
  if v_att.superseded_at is not null then raise exception 'This attachment is already superseded'; end if;
  if v_att.is_pr_document then raise exception 'Upload a replacement PR document instead'; end if;
  if pr_tracker._clean(p_reason) is null then raise exception 'A reason is required'; end if;
  update pr_tracker.pr_attachments set superseded_at = now(), superseded_reason = trim(p_reason) where id = p_attachment_id;
  perform pr_tracker._log_event(v_att.pr_id, 'attachment_superseded', v_actor, jsonb_build_object(
    'remark', trim(p_reason), 'payload', jsonb_build_object('attachment_id', v_att.id, 'filename', v_att.filename)));
end $$;

create or replace function pr_tracker.assign_pr_no(p_pr_id uuid, p_pr_no text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_new text := pr_tracker._clean(p_pr_no);
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not (select can_assign_pr_no from pr_tracker.offices where id = v_actor.office_id) then
    raise exception 'Your office is not allowed to assign PR numbers';
  end if;
  if v_new is null then raise exception 'PR No. is required'; end if;
  if exists (select 1 from pr_tracker.purchase_requests where pr_no = v_new and id <> p_pr_id) then
    raise exception 'PR No. % is already used by another PR', v_new;
  end if;
  update pr_tracker.purchase_requests set pr_no = v_new where id = p_pr_id;
  perform pr_tracker._log_event(p_pr_id, 'pr_no_assigned', v_actor,
    jsonb_build_object('payload', jsonb_build_object('old', v_pr.pr_no, 'new', v_new)));
end $$;

create or replace function pr_tracker.set_mode_of_procurement(p_pr_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_new text := pr_tracker._clean(p_mode);
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not (select can_set_mode_of_procurement from pr_tracker.offices where id = v_actor.office_id) then
    raise exception 'Your office is not allowed to set the mode of procurement';
  end if;
  if v_new is null then raise exception 'Mode of procurement is required'; end if;
  update pr_tracker.purchase_requests set mode_of_procurement = v_new where id = p_pr_id;
  perform pr_tracker._log_event(p_pr_id, 'mode_set', v_actor,
    jsonb_build_object('payload', jsonb_build_object('old', v_pr.mode_of_procurement, 'new', v_new)));
end $$;

create or replace function pr_tracker.complete_pr(p_pr_id uuid, p_remark text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
  v_pr pr_tracker.purchase_requests := pr_tracker._lock_pr(p_pr_id);
  v_event bigint;
begin
  perform pr_tracker._require_received_holder(v_pr, v_actor);
  if not (select can_complete from pr_tracker.offices where id = v_actor.office_id) then
    raise exception 'Your office is not allowed to complete PRs';
  end if;
  update pr_tracker.purchase_requests set movement_state = 'completed', current_since = now() where id = p_pr_id;
  v_event := pr_tracker._log_event(p_pr_id, 'completed', v_actor, jsonb_build_object('remark', pr_tracker._clean(p_remark)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_remark);
  perform pr_tracker._notify(v_event, p_pr_id, 'completed', pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

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
  if not (pr_tracker.is_admin()
          or (v_actor.office_id = v_pr.origin_office_id
              and (v_pr.movement_state = 'draft'
                   or (v_pr.movement_state = 'received' and v_pr.current_office_id = v_pr.origin_office_id)))) then
    raise exception 'Only the originating office (while it holds the PR) or an administrator can cancel it';
  end if;
  if pr_tracker._clean(p_reason) is null then raise exception 'A reason is required to cancel a PR'; end if;
  update pr_tracker.purchase_requests set movement_state = 'cancelled', current_since = now() where id = p_pr_id;
  v_event := pr_tracker._log_event(p_pr_id, 'cancelled', v_actor, jsonb_build_object('remark', trim(p_reason)));
  perform pr_tracker._add_remark(p_pr_id, v_actor, p_reason);
  perform pr_tracker._notify(v_event, p_pr_id, 'cancelled',
    array[v_pr.current_office_id] || pr_tracker._followers(p_pr_id), v_actor.office_id);
end $$;

create or replace function pr_tracker.follow_pr(p_pr_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
begin
  if not pr_tracker.is_involved(p_pr_id) then
    raise exception 'Only offices involved in this PR can follow it';
  end if;
  insert into pr_tracker.pr_followers (pr_id, office_id) values (p_pr_id, v_actor.office_id) on conflict do nothing;
  if found then perform pr_tracker._log_event(p_pr_id, 'followed', v_actor, '{}'::jsonb); end if;
end $$;

create or replace function pr_tracker.unfollow_pr(p_pr_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor pr_tracker.profiles := pr_tracker._actor_with_office();
begin
  delete from pr_tracker.pr_followers where pr_id = p_pr_id and office_id = v_actor.office_id;
  if found then perform pr_tracker._log_event(p_pr_id, 'unfollowed', v_actor, '{}'::jsonb); end if;
end $$;

grant execute on function
  pr_tracker.set_status(uuid, uuid, text),
  pr_tracker.add_remark(uuid, text),
  pr_tracker.add_private_note(uuid, text),
  pr_tracker.register_attachment(uuid, text, text, bigint, text, boolean),
  pr_tracker.supersede_attachment(uuid, text),
  pr_tracker.assign_pr_no(uuid, text),
  pr_tracker.set_mode_of_procurement(uuid, text),
  pr_tracker.complete_pr(uuid, text),
  pr_tracker.cancel_pr(uuid, text),
  pr_tracker.follow_pr(uuid),
  pr_tracker.unfollow_pr(uuid)
to authenticated;
