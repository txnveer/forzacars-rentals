"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { forgotPasswordSchema } from "@/lib/auth/validation";

interface FieldErrors {
  email?: string;
}

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!mounted) return;

    setErrors({});
    setGeneralError(null);

    // Validate with zod
    const result = forgotPasswordSchema.safeParse({ email });
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

      // Build the redirect URL for password reset
      const redirectUrl = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        result.data.email,
        {
          redirectTo: redirectUrl,
        }
      );

      if (error) {
        setGeneralError(error.message);
        setLoading(false);
        return;
      }

      // Success - show confirmation message
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      console.error("Password reset error:", err);
      setGeneralError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  if (!mounted) {
    return (
      <div className="w-full max-w-sm">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          We&apos;ve sent a password reset link to{" "}
          <span className="font-medium text-gray-900">{email}</span>
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Didn&apos;t receive the email? Check your spam folder or{" "}
          <button
            onClick={() => setSuccess(false)}
            className="font-medium text-primary hover:underline"
          >
            try again
          </button>
          .
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        Reset your password
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Enter your email address and we&apos;ll send you a link to reset your
        password.
      </p>

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
            className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 ${
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

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Remember your password?{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
