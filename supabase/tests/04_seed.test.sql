begin;
select plan(7);

select is((select count(*)::int from pr_tracker.default_route_steps), 10, 'route has 10 steps');
select results_eq(
  $$select o.code from pr_tracker.default_route_steps s join pr_tracker.offices o on o.id = s.office_id order by s.step_order$$,
  $$values ('GSO'),('MAYOR'),('BUDGET'),('MAYOR'),('BAC'),('MAYOR'),('BAC'),('GSO'),('ACCTG'),('TREAS')$$,
  'route order matches spec');
select ok((select can_assign_pr_no from pr_tracker.offices where code = 'BUDGET'), 'Budget assigns PR No.');
select ok((select can_set_mode_of_procurement from pr_tracker.offices where code = 'BAC'), 'BAC sets mode');
select ok((select can_complete from pr_tracker.offices where code = 'TREAS'), 'Treasurer completes');
select is((select role::text from pr_tracker.profiles where email = 'berlcamp@gmail.com'), 'super_admin', 'super admin seeded');
select ok((select count(*) from pr_tracker.office_statuses s join pr_tracker.offices o on o.id = s.office_id where o.code = 'MAYOR') >= 5,
          'Mayor statuses seeded');

select * from finish();
rollback;
