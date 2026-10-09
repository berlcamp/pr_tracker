import { GoogleButton } from "./google-button";
import { safeNext } from "@/lib/auth/safe-next";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">PR Tracker</h1>
          <p className="text-sm text-muted-foreground">Purchase Request document tracking</p>
        </div>
        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Sign-in failed. Please try again.</p>}
        <GoogleButton next={safeNext(next)} />
        <p className="text-center text-xs text-muted-foreground">Only accounts registered by an administrator can sign in.</p>
      </div>
    </main>
  );
}
