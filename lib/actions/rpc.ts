import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export async function rpcAction<T = null>(
  fn: string,
  args: Record<string, unknown>,
  revalidate: string[] = [],
): Promise<ActionResult<T>> {
  const supabase = await createClient();
  // Function names are checked by the DB; generated types are bypassed here to keep one generic helper.
  const { data, error } = await (supabase.rpc as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
  if (error) return { ok: false, error: error.message };
  revalidate.forEach((p) => revalidatePath(p));
  return { ok: true, data: (data ?? null) as T };
}
