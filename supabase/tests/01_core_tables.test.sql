begin;
select plan(10);

select has_schema('pr_tracker');
select has_table('pr_tracker', 'offices', 'offices table exists');
select has_table('pr_tracker', 'profiles', 'profiles table exists');
select has_table('pr_tracker', 'app_settings', 'app_settings table exists');
select has_table('pr_tracker', 'default_route_steps', 'default_route_steps table exists');
select has_table('pr_tracker', 'office_statuses', 'office_statuses table exists');
select has_table('pr_tracker', 'routing_slip_counters', 'routing_slip_counters table exists');

select throws_ok(
  $$insert into pr_tracker.profiles (email, full_name, role) values ('nooffice@x.test', 'No Office', 'staff')$$,
  '23514', null, 'staff profile requires an office'
);

select throws_ok(
  $$insert into pr_tracker.profiles (email, full_name, role) values ('UPPER@x.test', 'Upper', 'admin')$$,
  '23514', null, 'emails must be stored lower-case'
);

select throws_ok(
  $$insert into pr_tracker.profiles (email, full_name, role) values ('second-super@x.test', 'Dup', 'super_admin'),
                                                               ('third-super@x.test', 'Dup2', 'super_admin')$$,
  '23505', null, 'only one super_admin allowed'
);

select * from finish();
rollback;
