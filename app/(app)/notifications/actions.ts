"use server";
import { createClient } from "@/lib/supabase/server";
import { rpcAction } from "@/lib/actions/rpc";
import type { NotificationViewRow } from "@/lib/supabase/rows";

export async function getNotifications(): Promise<{ unread: number; items: NotificationViewRow[] }> {
  const supabase = await createClient();
  const [count, list] = await Promise.all([
    supabase.rpc("unread_notification_count"),
    supabase.from("my_notifications").select("*").order("id", { ascending: false }).limit(20),
  ]);
  return { unread: (count.data as number | null) ?? 0, items: list.data ?? [] };
}

export async function markNotificationsRead(ids: number[]) {
  return rpcAction("mark_notifications_read", { p_ids: ids });
}

export async function markAllNotificationsRead() {
  return rpcAction("mark_all_notifications_read", {});
}
