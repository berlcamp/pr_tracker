"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";

export function GoogleButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  async function signIn() {
    setPending(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }
  return (
    <Button size="lg" className="w-full" onClick={signIn} disabled={pending}>
      {pending ? "Redirecting…" : "Sign in with Google"}
    </Button>
  );
}
