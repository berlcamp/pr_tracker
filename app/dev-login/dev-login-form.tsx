"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/client";

export function DevLoginForm() {
  const [email, setEmail] = useState("cswd@test.local");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
    if (error) return setError(error.message);
    // Full navigation on purpose: /auth/callback is a route handler, not a page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/auth/callback";
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Label htmlFor="email">Email</Label>
      <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Label htmlFor="password">Password</Label>
      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">Dev sign in</Button>
    </form>
  );
}
