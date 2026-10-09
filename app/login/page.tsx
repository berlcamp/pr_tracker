import { Suspense } from "react";
import { GoogleButton } from "./google-button";
import { safeNext } from "@/lib/auth/safe-next";

type LoginSearchParams = Promise<{ next?: string; error?: string }>;

// With cacheComponents, reading searchParams must happen inside <Suspense>;
// the static shell (card, heading) is prerendered and this part streams in.
async function LoginActions({ searchParams }: { searchParams: LoginSearchParams }) {
  const { next, error } = await searchParams;
  return (
    <>
      {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Sign-in failed. Please try again.</p>}
      <GoogleButton next={safeNext(next)} />
    </>
  );
}

export default function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">PR Tracker</h1>
          <p className="text-sm text-muted-foreground">Purchase Request document tracking</p>
        </div>
        <Suspense fallback={<div className="h-11 w-full animate-pulse rounded-md bg-muted" />}>
          <LoginActions searchParams={searchParams} />
        </Suspense>
        <p className="text-center text-xs text-muted-foreground">Only accounts registered by an administrator can sign in.</p>
      </div>
    </main>
  );
}
