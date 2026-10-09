import { notFound } from "next/navigation";
import { DevLoginForm } from "./dev-login-form";

export default function DevLoginPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true") notFound();
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border p-8">
        <h1 className="font-semibold">Developer sign-in (local only)</h1>
        <DevLoginForm />
      </div>
    </main>
  );
}
