import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/profile";
import type { Profile } from "@/lib/types";
import type { SaaoRole } from "./types";

const RANK: Record<SaaoRole, number> = { viewer: 1, encoder: 2, finalizer: 3, budget_admin: 4 };

export function atLeast(role: SaaoRole | null, min: SaaoRole): boolean {
  return role !== null && RANK[role] >= RANK[min];
}

/** The signed-in user's budget role, or null when they have none. Cached per request. */
export const getSaaoRole = cache(async (): Promise<SaaoRole | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("saao_my_access");
  if (error || !data || !(data in RANK)) return null;
  return data as SaaoRole;
});

/** Redirects to `/` unless the user holds at least `min`. */
export async function requireSaao(min: SaaoRole): Promise<{ profile: Profile; role: SaaoRole }> {
  const profile = await requireProfile();
  const role = await getSaaoRole();
  if (!role || !atLeast(role, min)) redirect("/");
  return { profile, role };
}
