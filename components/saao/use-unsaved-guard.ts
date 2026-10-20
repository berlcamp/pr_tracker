"use client";
// While `pending` is true, warn before the page is left: the browser's standard prompt on reload/close,
// and a confirm on in-app link clicks (sidebar and other <a>/Link navigations). Both are removed once
// nothing is pending.
import { useEffect } from "react";
import { UNSAVED_MESSAGE, isInAppNavigation } from "@/lib/saao/unsaved-guard";

export function useUnsavedGuard(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // older browsers need returnValue set to show the prompt
    };
    // capture phase on document runs before Next's <Link> handler, so a cancelled click never navigates
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      if (!a) return;
      const anchor = { href: a.href, target: a.getAttribute("target"), download: a.hasAttribute("download") };
      if (!isInAppNavigation(e, anchor, window.location.href)) return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [pending]);
}
