"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, getAuthRedirectUrl } from "@/lib/auth/validation";

interface FieldErrors {
  email?: string;
  password?: string;
}

interface LoginFormProps {
  returnTo?: string | null;
  message?: string | null;
  errorParam?: string | null;
}

export default function LoginForm({ returnTo, message, errorParam }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(errorParam ?? null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before allowing interactions
  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!mounted) return;
    
    setErrors({});
    setGeneralError(null);

    // Validate with zod
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      });

      if (error) {
        setGeneralError(error.message);
        setLoading(false);
        return;
      }

      if (!data.session) {
        setGeneralError("Login failed. Please try again.");
        setLoading(false);
        return;
      }

      // Success - refresh first to update server components, then navigate
      const redirectUrl = getAuthRedirectUrl(returnTo);
      
      // Use window.location for a full page navigation to ensure cookies are read
      window.location.href = redirectUrl;
    } catch (err) {
      console.error("Login error:", err);
      setGeneralError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        Log in to ForzaCars
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Enter your email and password to continue.
      </p>

      {message && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {generalError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
              errors.email
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                : "border-gray-300 focus:border-primary focus:ring-primary/30"
            }`}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
              errors.password
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                : "border-gray-300 focus:border-primary focus:ring-primary/30"
            }`}
            placeholder="••••••••"
          />
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Logging in...
            </span>
          ) : (
            "Log in"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{" "}
        <Link
          href={returnTo ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : "/signup"}
          className="font-medium text-primary hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
