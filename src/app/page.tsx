import Link from "next/link";
import { getProfile } from "@/lib/auth/getProfile";
import { getDashboardPath } from "@/lib/auth/requireRole";

export default async function HomePage() {
  const profile = await getProfile();

  return (
    <section className="flex min-h-[calc(100vh-73px)] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
        ForzaCars Rentals
      </h1>
      <p className="mt-4 max-w-xl text-lg text-gray-600">
        Browse our premium fleet and hit the road in style. Fast booking,
        transparent pricing, and cars you&apos;ll love to drive.
      </p>

      <div className="mt-8 flex gap-4">
        {profile ? (
          <Link
            href={getDashboardPath(profile.role)}
            className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700"
          >
            Go to Dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/signup"
              className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
