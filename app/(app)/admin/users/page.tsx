import { requireAdmin } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { UsersTable, type UserRow } from "./users-table";

export default async function UsersPage() {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const [{ data: users }, { data: offices }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, designation, office_id, role, active, auth_user_id, office:offices(name)").order("full_name"),
    supabase.from("offices").select("id, name").eq("active", true).order("name"),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="text-sm text-muted-foreground">Only emails listed here can sign in. Each user acts on behalf of their office.</p>
      <UsersTable users={(users ?? []) as UserRow[]} offices={offices ?? []} isSuperAdmin={profile.role === "super_admin"} />
    </div>
  );
}
