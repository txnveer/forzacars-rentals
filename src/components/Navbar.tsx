import Link from "next/link";
import { getProfile } from "@/lib/auth/getProfile";
import { signOut } from "@/lib/auth/actions";

/**
 * Role-aware server-side navbar with 3-zone layout.
 *
 * Layout: [Brand] [Nav Links] [User Controls]
 * Uses CSS Grid for proper alignment across all user states.
 */
export default async function Navbar() {
  const profile = await getProfile();

  // Determine badge class based on role
  const getBadgeClass = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "badge-admin";
      case "BUSINESS":
        return "badge-business";
      default:
        return "badge-customer";
    }
  };

  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto grid h-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6">
        {/* ================================================================
            LEFT ZONE: Brand/Logo
            ================================================================ */}
        <Link
          href="/"
          className="font-display text-xl tracking-tight text-primary"
        >
          ForzaCars
        </Link>

        {/* ================================================================
            CENTER ZONE: Primary Navigation Links
            ================================================================ */}
        <div className="flex items-center justify-center gap-1">
          {/* Cars - visible to everyone */}
          <NavLink href="/cars">Cars</NavLink>

          {profile && (
            <>
              {/* CUSTOMER navigation */}
              {profile.role === "CUSTOMER" && (
                <>
                  <NavLink href="/bookings">Bookings</NavLink>
                  <NavLink href="/wallet">Wallet</NavLink>
                </>
              )}

              {/* BUSINESS navigation */}
              {profile.role === "BUSINESS" && (
                <>
                  <NavLink href="/biz/fleet">Fleet</NavLink>
                  <NavLink href="/biz/bookings">Bookings</NavLink>
                  <NavLink href="/biz/blackouts">Blackouts</NavLink>
                </>
              )}

              {/* ADMIN navigation */}
              {profile.role === "ADMIN" && (
                <>
                  <NavLink href="/admin/users">Users</NavLink>
                  <NavLink href="/admin/businesses">Businesses</NavLink>
                  <NavLink href="/admin/audit">Audit</NavLink>
                </>
              )}

              {/* Shared authenticated links */}
              <NavLink href="/messages">Messages</NavLink>
              <NavLink href="/profile">Profile</NavLink>
            </>
          )}
        </div>

        {/* ================================================================
            RIGHT ZONE: User Info + Auth Controls
            ================================================================ */}
        <div className="flex items-center gap-3">
          {profile ? (
            <>
              {/* User info: truncated email + role badge */}
              <div className="hidden items-center gap-2 sm:flex">
                <span className="max-w-[140px] truncate text-sm text-gray-600">
                  {profile.email}
                </span>
                <span className={getBadgeClass(profile.role)}>
                  {profile.role}
                </span>
              </div>

              {/* Mobile: just show badge */}
              <span className={`sm:hidden ${getBadgeClass(profile.role)}`}>
                {profile.role}
              </span>

              {/* Sign out button - compact secondary style */}
              <form action={signOut}>
                <button
                  type="submit"
                  className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Guest: Login + Sign up */}
              <Link
                href="/login"
                className="h-9 rounded-lg px-4 text-sm font-medium text-gray-600 transition-colors hover:text-primary flex items-center"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-600 flex items-center"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

/**
 * Navigation link component with consistent styling.
 */
function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="nav-link rounded-md hover:bg-sky-light/50"
    >
      {children}
    </Link>
  );
}
