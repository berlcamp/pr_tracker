import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/rpc";

/**
 * Opens a file whose signed URL is fetched asynchronously. The tab is opened synchronously in the
 * click handler (Safari blocks window.open after an await), then pointed at the URL once it resolves.
 */
export async function openSignedUrl(getUrl: () => Promise<ActionResult<string>>) {
  const win = window.open("about:blank", "_blank");
  if (win) win.opener = null;
  let res: ActionResult<string>;
  try {
    res = await getUrl();
  } catch {
    res = { ok: false, error: "Could not open the file. Please try again." };
  }
  if (!res.ok) {
    win?.close();
    toast.error(res.error);
    return;
  }
  if (win) win.location.href = res.data;
  else window.open(res.data, "_blank", "noopener");
}

/** Saves a file whose signed URL forces a download. Same-window navigation needs no popup and leaves no blank tab. */
export async function downloadSignedUrl(getUrl: () => Promise<ActionResult<string>>) {
  let res: ActionResult<string>;
  try {
    res = await getUrl();
  } catch {
    res = { ok: false, error: "Could not download the file. Please try again." };
  }
  if (!res.ok) {
    toast.error(res.error);
    return;
  }
  window.location.assign(res.data);
}
