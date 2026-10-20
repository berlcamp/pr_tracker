import Image from "next/image";
import { BellRing, QrCode, Route } from "lucide-react";
import { GoogleButton } from "./google-button";
import { LogoStrip, citySeal } from "@/components/brand-logos";
import { safeNext } from "@/lib/auth/safe-next";

const BENEFITS = [
  { icon: Route, title: "Follow every PR", text: "See which office holds each purchase request and how long it has been there." },
  { icon: QrCode, title: "Scan the routing slip", text: "The QR code on each slip opens the request's full history." },
  { icon: BellRing, title: "Get notified", text: "Know when a PR arrives at your office or moves forward." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel: desktop only; mobile shows a compact header above the sign-in card instead. */}
      <section className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-sidebar-primary/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-[24rem] rounded-full bg-sidebar-primary/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <Image src={citySeal} alt="" className="size-12 rounded-full bg-white p-0.5" sizes="48px" />
          <div>
            <p className="text-sm font-semibold text-sidebar-primary-foreground">City Government of Ozamiz</p>
            <p className="text-xs text-sidebar-foreground/70">Misamis Occidental</p>
          </div>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-sidebar-primary-foreground xl:text-5xl">
              Purchase Request Tracker
            </h1>
            <p className="text-lg leading-relaxed text-sidebar-foreground/80">
              Track every purchase request as it moves from office to office, from the time it is drafted until it is paid.
            </p>
          </div>
          <ul className="space-y-5">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <b.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-sidebar-primary-foreground">{b.title}</p>
                  <p className="text-sm leading-relaxed text-sidebar-foreground/75">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-sidebar-foreground/60">© {new Date().getFullYear()} City Government of Ozamiz</p>
      </section>

      <section className="flex flex-col items-center justify-center gap-10 bg-background px-4 py-10 sm:px-8">
        <LogoStrip size={56} className="flex-wrap justify-center gap-x-5 gap-y-3 sm:gap-x-7" />

        <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              <span className="lg:hidden">PR Tracker</span>
              <span className="hidden lg:inline">Welcome back</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              <span className="lg:hidden">Purchase Request document tracking for the City Government of Ozamiz. </span>
              Sign in with your registered Google account.
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Sign-in failed. Please try again.</p>
          )}
          <GoogleButton next={safeNext(next)} />
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Only accounts registered by an administrator can sign in. Contact your system administrator if you need access.
          </p>
        </div>
      </section>
    </main>
  );
}
