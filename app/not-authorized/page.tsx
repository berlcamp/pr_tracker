import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-6">
      <div className="max-w-sm space-y-4 rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Account not authorized</h1>
        <p className="text-sm text-muted-foreground">Your account is not authorized. Please contact the administrator.</p>
        <Button asChild variant="outline"><Link href="/login">Back to sign in</Link></Button>
      </div>
    </main>
  );
}
