insert into pr_tracker.offices (code, name, is_processing_office, can_assign_pr_no, can_set_mode_of_procurement, can_complete) values
  ('GSO',    'General Services Office',   true, false, false, false),
  ('MAYOR',  'Mayor''s Office',           true, false, false, false),
  ('BUDGET', 'City Budget Office',        true, true,  false, false),
  ('BAC',    'Bids and Awards Committee', true, false, true,  false),
  ('ACCTG',  'City Accounting Office',    true, false, false, false),
  ('TREAS',  'City Treasurer''s Office',  true, false, false, true)
on conflict (code) do nothing;

insert into pr_tracker.default_route_steps (step_order, office_id, purpose)
select v.step, o.id, v.purpose
from (values
  (1,  'GSO',    'For review'),
  (2,  'MAYOR',  'For approval'),
  (3,  'BUDGET', 'For certification of funds'),
  (4,  'MAYOR',  'For approval'),
  (5,  'BAC',    'For procurement'),
  (6,  'MAYOR',  'For signing of NOA / NTP'),
  (7,  'BAC',    'For processing'),
  (8,  'GSO',    'For processing'),
  (9,  'ACCTG',  'For processing'),
  (10, 'TREAS',  'For payment processing')
) as v(step, code, purpose)
join pr_tracker.offices o on o.code = v.code
on conflict (step_order) do nothing;

insert into pr_tracker.office_statuses (office_id, label, sort_order)
select o.id, v.label, v.ord
from (values
  ('BUDGET', 'For certification of funds', 1), ('BUDGET', 'Funds certified / earmarked', 2), ('BUDGET', 'Insufficient funds', 3),
  ('BAC', 'For mode determination', 1), ('BAC', 'For posting (PhilGEPS)', 2), ('BAC', 'For canvass', 3), ('BAC', 'Awarded', 4),
  ('GSO', 'For review', 1), ('GSO', 'For canvass', 2), ('GSO', 'For purchase', 3),
  ('MAYOR', 'For Mayor''s approval', 1), ('MAYOR', 'Approved', 2), ('MAYOR', 'Disapproved', 3),
  ('MAYOR', 'For signing of NOA/NTP', 4), ('MAYOR', 'NOA/NTP signed', 5),
  ('ACCTG', 'For obligation', 1), ('ACCTG', 'Obligated', 2),
  ('TREAS', 'For payment processing', 1), ('TREAS', 'Paid', 2)
) as v(code, label, ord)
join pr_tracker.offices o on o.code = v.code
on conflict (office_id, label) do nothing;

insert into pr_tracker.app_settings (key, value) values
  ('lgu_name', '"City Government"'::jsonb),
  ('stuck_threshold_days', '5'::jsonb),
  ('max_upload_mb', '20'::jsonb),
  ('allowed_auth_providers', '["google"]'::jsonb)
on conflict (key) do nothing;

insert into pr_tracker.profiles (email, full_name, designation, office_id, role)
values ('berlcamp@gmail.com', 'Super Administrator', 'System Administrator', null, 'super_admin')
on conflict (email) do nothing;
