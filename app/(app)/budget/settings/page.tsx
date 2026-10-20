import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/profile";
import { atLeast, getSaaoRole } from "@/lib/saao/access";
import { getSelectedBookId } from "@/lib/saao/book-cookie";
import { listBooks } from "@/lib/saao/queries";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessTab, type AccessRow } from "./access-tab";
import { BooksTab } from "./books-tab";
import { ClassificationsTab } from "./classifications-tab";
import { FundsTab } from "./funds-tab";
import { LabelsTab } from "./labels-tab";
import { RulesTab } from "./rules-tab";

export default async function BudgetSettingsPage() {
  const profile = await requireProfile();
  const role = await getSaaoRole();
  const isBudgetAdmin = atLeast(role, "budget_admin");
  const isPrAdmin = profile.role === "admin" || profile.role === "super_admin";
  if (!isBudgetAdmin && !isPrAdmin) redirect("/");

  const supabase = await createClient();
  const [{ data: profiles }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, office:offices(name)").eq("active", true).order("full_name"),
    supabase.from("saao_access").select("profile_id, role"),
  ]);
  const roleOf = new Map((access ?? []).map((a) => [a.profile_id, a.role]));
  const accessRows: AccessRow[] = (profiles ?? []).map((p) => ({
    profileId: p.id, name: p.full_name, email: p.email, office: p.office?.name ?? "—",
    role: (roleOf.get(p.id) ?? null) as AccessRow["role"],
  }));

  let admin: React.ReactNode = null;
  if (isBudgetAdmin) {
    const [books, funds, classifications] = await Promise.all([
      listBooks(),
      supabase.from("saao_funds").select("*").order("code"),
      supabase.from("saao_classifications").select("*").order("sort_order"),
    ]);
    const selectedId = await getSelectedBookId(books);
    const selected = books.find((b) => b.id === selectedId) ?? null;
    admin = (
      <>
        <TabsContent value="books"><BooksTab books={books} funds={funds.data ?? []} /></TabsContent>
        <TabsContent value="rules"><RulesTab book={selected} /></TabsContent>
        <TabsContent value="labels"><LabelsTab book={selected} /></TabsContent>
        <TabsContent value="funds"><FundsTab funds={funds.data ?? []} /></TabsContent>
        <TabsContent value="classifications"><ClassificationsTab classifications={classifications.data ?? []} /></TabsContent>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Budget Settings</h1>
      <Tabs defaultValue="access">
        <TabsList className="flex-wrap">
          <TabsTrigger value="access">Access</TabsTrigger>
          {isBudgetAdmin && (
            <>
              <TabsTrigger value="books">Books</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="labels">Labels &amp; header</TabsTrigger>
              <TabsTrigger value="funds">Funds</TabsTrigger>
              <TabsTrigger value="classifications">Classifications</TabsTrigger>
            </>
          )}
        </TabsList>
        <TabsContent value="access"><AccessTab rows={accessRows} /></TabsContent>
        {admin}
      </Tabs>
    </div>
  );
}
