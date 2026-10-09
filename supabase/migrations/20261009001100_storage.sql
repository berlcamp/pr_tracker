insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pr-tracker-attachments', 'pr-tracker-attachments', false, 52428800, array[
  'application/pdf', 'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create or replace function pr_tracker.attachment_pr_id(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

create or replace function pr_tracker.can_upload_attachment(p_pr_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from pr_tracker.purchase_requests p
     where p.id = p_pr_id
       and pr_tracker.current_office_id() is not null
       and (pr_tracker._is_holder(p, pr_tracker.current_office_id())
            or p.origin_office_id = pr_tracker.current_office_id()))
$$;

grant execute on function pr_tracker.attachment_pr_id(text), pr_tracker.can_upload_attachment(uuid) to authenticated;

create policy pr_tracker_attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'pr-tracker-attachments' and pr_tracker.can_view_pr(pr_tracker.attachment_pr_id(name)));

create policy pr_tracker_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pr-tracker-attachments' and pr_tracker.can_upload_attachment(pr_tracker.attachment_pr_id(name)));
-- No update/delete policies: attachments are never overwritten or removed.
