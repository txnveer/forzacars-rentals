import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthRedirectUrl } from "@/lib/auth/validation";

/**
 * GET /auth/callback
 *
 * Supabase redirects here after email confirmation or OAuth sign-in.
 * We exchange the `code` query-param for a session, then redirect the
 * user to their intended destination or /cars.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // Support both 'next' (Supabase default) and 'returnTo' (our custom param)
  const next = searchParams.get("next") || searchParams.get("returnTo");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Redirect to the intended destination or default
        const redirectUrl = getAuthRedirectUrl(next);
        return NextResponse.redirect(`${origin}${redirectUrl}`);
      }
    }
  }

  // Fallback — something went wrong during the code exchange.
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Could not complete authentication. Please try again.")}`
  );
}
