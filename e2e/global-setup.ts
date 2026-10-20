import { execSync } from "node:child_process";

// Local DB only (supabase CLI default ports). SAAO test users: one profile per role under test.
// A user has a single SAAO role and budget_admin outranks finalizer, so the "finalizer" user is
// granted budget_admin (it creates the test book and finalizes).
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SAAO_USERS_SQL = `
do $$
declare r record;
begin
  for r in select * from (values
    ('budget.encoder@x.test',   'Elena Encoder',   'encoder'),
    ('budget.finalizer@x.test', 'Felix Finalizer', 'budget_admin'),
    ('mayor.viewer@x.test',     'Maya Viewer',     'viewer')
  ) as t(email, name, saao_role)
  loop
    insert into pr_tracker.profiles (auth_user_id, email, full_name, designation, office_id, role)
    values (tests.create_password_user(r.email, 'password123'), r.email, r.name, 'Staff',
            (select id from pr_tracker.offices where code = 'BUDGET'), 'staff');
    perform tests.grant_saao(r.email, r.saao_role);
  end loop;
end $$;`;

export default function globalSetup() {
  execSync("supabase db reset", { stdio: "inherit" });
  execSync(`psql "${LOCAL_DB}" -v ON_ERROR_STOP=1 -q`, { input: SAAO_USERS_SQL, stdio: ["pipe", "inherit", "inherit"] });
}
