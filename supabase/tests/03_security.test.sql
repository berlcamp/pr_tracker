begin;
select plan(10);

insert into pr_tracker.offices (code, name) values ('TSA', 'Test A');
select tests.make_user('active@x.test', 'TSA');
select tests.make_user('inactive@x.test', 'TSA', 'staff', false);
select tests.make_user('adm@x.test', 'TSA', 'admin');

select tests.authenticate_as('active@x.test');
select ok(pr_tracker.is_active_user(), 'active staff is active');
select is(pr_tracker.current_office_id(), (select id from pr_tracker.offices where code = 'TSA'), 'office resolved');
select ok(not pr_tracker.is_admin(), 'staff is not admin');
select throws_ok($$insert into pr_tracker.offices (code, name) values ('HACK', 'Hack')$$,
                 '42501', null, 'authenticated cannot insert offices directly');
select throws_ok($$select pr_tracker._actor()$$, '42501', null, 'internal helpers are not executable');
select is((select count(*)::int from pr_tracker.offices where code = 'TSA'), 1, 'active user reads offices');

select tests.clear_authentication();
select tests.authenticate_as('inactive@x.test');
select ok(not pr_tracker.is_active_user(), 'inactive user is not active');
select is((select count(*)::int from pr_tracker.offices), 0, 'inactive user reads nothing');

select tests.clear_authentication();
select tests.authenticate_as('adm@x.test');
select ok(pr_tracker.is_admin(), 'admin is admin');
select ok(not pr_tracker.is_super_admin(), 'admin is not super admin');

select * from finish();
rollback;
