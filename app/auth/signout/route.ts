import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut();
  const to = searchParams.get("to");
  return NextResponse.redirect(`${origin}${to ? safeNext(to) : "/login"}`);
}
