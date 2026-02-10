import Link from "next/link";
import Image from "next/image";
import { getProfile } from "@/lib/auth/getProfile";
import { getDashboardPath } from "@/lib/auth/requireRole";

export default async function HomePage() {
  const profile = await getProfile();

  return (
    <section className="relative min-h-[calc(100vh-73px)] overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="/hero-bg.png"
          alt="Premium sports car on mountain road"
          fill
          priority
          className="object-cover object-center"
          quality={90}
        />
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
      </div>

      {/* Content container */}
      <div className="relative z-10 flex min-h-[calc(100vh-73px)] items-center">
        <div className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
          <div className="max-w-2xl">
            {/* Hero title - Forza Horizon style */}
            <h1 className="hero-title text-white drop-shadow-lg">
              ForzaCars Rentals
            </h1>

            {/* Tagline */}
            <p className="mt-6 text-lg leading-relaxed text-white/90 sm:text-xl">
              Browse our premium fleet and hit the road in style. Fast booking,
              transparent pricing, and cars you&apos;ll love to drive.
            </p>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/cars"
                className="rounded-lg bg-accent-sand px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-gray-900 shadow-lg transition-all hover:bg-accent-caramel hover:shadow-xl"
              >
                Browse Cars
              </Link>

              {profile ? (
                <Link
                  href={getDashboardPath(profile.role)}
                  className="rounded-lg border-2 border-white/30 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg border-2 border-white/30 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="text-sm font-medium text-white/80 underline-offset-4 hover:text-white hover:underline"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>

            {/* Subtitle for guests */}
            {!profile && (
              <p className="mt-8 text-sm text-white/60">
                No account needed to browse. Sign up when you&apos;re ready to book.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
