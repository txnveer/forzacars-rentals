import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDashboardPath } from "@/lib/auth/requireRole";
import type { Profile } from "@/lib/auth/getProfile";

/**
 * GET /auth/callback
 *
 * Supabase redirects here after email confirmation or OAuth sign-in.
 * We exchange the `code` query-param for a session, then redirect the
 * user to their role-specific dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        const role = (profile?.role ?? "CUSTOMER") as Profile["role"];
        return NextResponse.redirect(`${origin}${getDashboardPath(role)}`);
      }
    }
  }

  // Fallback — something went wrong during the code exchange.
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Could not complete authentication. Please try again.")}`
  );
}
