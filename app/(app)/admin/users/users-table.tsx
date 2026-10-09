"use client";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { saveProfile, type ProfileInput } from "../actions";

export type UserRow = { id: string; email: string; full_name: string; designation: string | null; office_id: string | null;
  role: "super_admin" | "admin" | "staff"; active: boolean; auth_user_id: string | null; office: { name: string } | null };
type Office = { id: string; name: string };

function UserDialog({ user, offices, isSuperAdmin, trigger }: { user: UserRow | null; offices: Office[]; isSuperAdmin: boolean; trigger: React.ReactNode }) {
  const blank: ProfileInput = { id: null, email: "", full_name: "", designation: "", office_id: null, role: "staff", active: true };
  const fromUser = (u: UserRow): ProfileInput => ({ id: u.id, email: u.email, full_name: u.full_name, designation: u.designation ?? "",
    office_id: u.office_id, role: u.role === "admin" ? "admin" : "staff", active: u.active });
  const [v, setV] = useState<ProfileInput>(user ? fromUser(user) : blank);
  const set = <K extends keyof ProfileInput>(k: K, val: ProfileInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const valid = v.email.includes("@") && v.full_name.trim() && (v.role !== "staff" || v.office_id);

  return (
    <ConfirmActionDialog
      trigger={trigger}
      title={user ? `Save changes to ${user.full_name}?` : "Create user account?"}
      description={<p>{user ? "Changes take effect on the user's next page load." : "The user can then sign in with Google using this exact email."}{v.email && <> Email: <b>{v.email}</b>.</>}</p>}
      confirmLabel={user ? "Save user" : "Create user"} successMessage={user ? "User saved" : "User created"}
      canConfirm={!!valid}
      onOpenChange={(o) => o && setV(user ? fromUser(user) : blank)}
      onConfirm={() => saveProfile(v)}
    >
      <Label htmlFor="u-email">Google email</Label>
      <Input id="u-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
      <Label htmlFor="u-name">Full name</Label>
      <Input id="u-name" value={v.full_name} onChange={(e) => set("full_name", e.target.value)} />
      <Label htmlFor="u-desig">Designation</Label>
      <Input id="u-desig" value={v.designation} onChange={(e) => set("designation", e.target.value)} />
      <Label>Office</Label>
      <Select value={v.office_id ?? "none"} onValueChange={(x) => set("office_id", x === "none" ? null : x)}>
        <SelectTrigger aria-label="Office"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No office (admins only)</SelectItem>
          {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Label>Role</Label>
      <Select value={v.role} onValueChange={(x) => set("role", x as ProfileInput["role"])}>
        <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="staff">Office staff</SelectItem>
          {isSuperAdmin && <SelectItem value="admin">Administrator</SelectItem>}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.active} onCheckedChange={(c) => set("active", !!c)} />Active (can sign in)</label>
    </ConfirmActionDialog>
  );
}

export function UsersTable({ users, offices, isSuperAdmin }: { users: UserRow[]; offices: Office[]; isSuperAdmin: boolean }) {
  const columns: ColumnDef<UserRow>[] = [
    { accessorKey: "full_name", header: ({ column }) => <DataTableColumnHeader column={column} title="Name" /> },
    { accessorKey: "email", header: "Email" },
    { id: "office", header: "Office", accessorFn: (r) => r.office?.name ?? "—" },
    { accessorKey: "role", header: "Role", cell: ({ row }) => <Badge variant="secondary">{row.original.role.replace("_", " ")}</Badge> },
    { accessorKey: "active", header: "Active", cell: ({ row }) => (row.original.active ? "Yes" : "No") },
    { id: "linked", header: "Signed in", cell: ({ row }) => (row.original.auth_user_id ? "Yes" : "Not yet") },
    { id: "edit", header: "", enableHiding: false, cell: ({ row }) => {
      const u = row.original;
      const editable = u.role === "staff" || (u.role === "admin" && isSuperAdmin);
      return editable ? <UserDialog user={u} offices={offices} isSuperAdmin={isSuperAdmin}
        trigger={<Button variant="ghost" size="sm"><Pencil className="mr-1 size-4" />Edit</Button>} /> : null;
    } },
  ];
  return (
    <DataTable columns={columns} data={users} searchPlaceholder="Search users…"
      toolbar={<UserDialog user={null} offices={offices} isSuperAdmin={isSuperAdmin}
        trigger={<Button size="sm" className="h-9"><UserPlus className="mr-2 size-4" />Add user</Button>} />} />
  );
}
