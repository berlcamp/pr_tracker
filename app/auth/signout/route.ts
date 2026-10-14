import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

/** Sign-out is a POST (the user menu submits a form), so link prefetching can never sign anyone out. */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/login`, 303);
}

/**
 * GET only declines accounts that have no active profile (requireProfile redirects here, since server
 * components cannot clear cookies). For an authorized user it is a harmless redirect home.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  const { data: profile, error } = await supabase.rpc("get_my_profile");
  if (!error && profile) return NextResponse.redirect(`${origin}/`);
  await supabase.auth.signOut();
  const to = searchParams.get("to");
  return NextResponse.redirect(`${origin}${to ? safeNext(to) : "/login"}`);
}
