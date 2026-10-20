// Pure decision for components/saao/use-unsaved-guard.ts: does this click on an anchor navigate the
// current tab to another in-app page (so pending edits would be lost)?

export const UNSAVED_MESSAGE = "Changes are still saving. Leave anyway?";

type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean };
type AnchorLike = { href: string; target: string | null; download: boolean };

export function isInAppNavigation(e: ClickLike, a: AnchorLike, currentHref: string): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.download || (a.target && a.target !== "_self") || !a.href) return false;
  let to: URL, from: URL;
  try {
    to = new URL(a.href, currentHref);
    from = new URL(currentHref);
  } catch {
    return false;
  }
  if (to.origin !== from.origin) return false;
  // a hash link on the same page does not leave it
  return !(to.hash && to.pathname === from.pathname && to.search === from.search);
}
