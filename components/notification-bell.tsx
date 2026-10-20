"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notificationText } from "@/lib/pr/timeline";
import { formatDateTime } from "@/lib/format";
import type { EventType } from "@/lib/types";
import type { NotificationViewRow } from "@/lib/supabase/rows";
import { getNotifications, markAllNotificationsRead, markNotificationsRead } from "@/app/(app)/notifications/actions";

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationViewRow[]>([]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const res = await getNotifications();
    setUnread(res.unread);
    setItems(res.items);
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  async function openItem(n: NotificationViewRow) {
    if (!n.is_read) await markNotificationsRead([n.id]);
    setOpen(false);
    // A recalled forward leaves the recipient unable to open the PR; show its public tracking page instead.
    router.push(n.can_view ? `/prs/${n.pr_id}` : `/track/${encodeURIComponent(n.routing_slip_no)}`);
    refresh();
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) refresh(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications (${unread} unread)`} className="relative">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="link" size="sm" disabled={unread === 0}
                  onClick={async () => { await markAllNotificationsRead(); refresh(); }}>Mark all as read</Button>
        </div>
        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">No notifications.</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)}
                        className={`w-full border-b px-4 py-3 text-left text-sm hover:bg-muted ${n.is_read ? "text-muted-foreground" : "bg-primary/5 font-medium"}`}>
                  <div>{notificationText({ type: n.type as EventType, actor_office_name: n.actor_office_name, routing_slip_no: n.routing_slip_no })}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground">{n.purpose}</div>
                  <div className="text-xs font-normal text-muted-foreground">{formatDateTime(n.created_at)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
