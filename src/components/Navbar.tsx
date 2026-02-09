import Link from "next/link";
import { getProfile } from "@/lib/auth/getProfile";
import { signOut } from "@/lib/auth/actions";

/**
 * Role-aware server-side navbar.
 *
 * Fetches the current user's profile (cached per-request via React
 * `cache()`).  Shows public links for guests and role-specific links
 * for authenticated users.
 */
export default async function Navbar() {
  const profile = await getProfile();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* ---- Brand ---- */}
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-gray-900"
        >
          ForzaCars Rentals
        </Link>

        {/* ---- Right-side links ---- */}
        <div className="flex items-center gap-6">
          {/* Public link — visible to everyone */}
          <Link
            href="/cars"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Cars
          </Link>

          {profile ? (
            <>
              {/* CUSTOMER links */}
              {profile.role === "CUSTOMER" && (
                <>
                  <Link
                    href="/bookings"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Bookings
                  </Link>
                  <Link
                    href="/wallet"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Wallet
                  </Link>
                </>
              )}

              {/* BUSINESS links */}
              {profile.role === "BUSINESS" && (
                <>
                  <Link
                    href="/biz/inventory"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Inventory
                  </Link>
                  <Link
                    href="/biz/cars"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    My Cars
                  </Link>
                  <Link
                    href="/biz/blackouts"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Blackouts
                  </Link>
                  <Link
                    href="/biz/bookings"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Bookings
                  </Link>
                </>
              )}

              {/* ADMIN links */}
              {profile.role === "ADMIN" && (
                <>
                  <Link
                    href="/admin/users"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Users
                  </Link>
                  <Link
                    href="/admin/businesses"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Businesses
                  </Link>
                  <Link
                    href="/admin/audit"
                    className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                  >
                    Audit Log
                  </Link>
                </>
              )}

              {/* Role badge + email */}
              <span className="hidden text-xs text-gray-400 sm:inline">
                {profile.email}
                <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {profile.role}
                </span>
              </span>

              {/* Sign out */}
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Guest links */}
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
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
