"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resetPasswordSchema } from "@/lib/auth/validation";

interface FieldErrors {
  password?: string;
  confirmPassword?: string;
}

interface ResetPasswordFormProps {
  errorParam?: string | null;
}

export default function ResetPasswordForm({ errorParam }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(errorParam || null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    setMounted(true);

    // Check for recovery session from the URL hash
    // Supabase includes the access token in the URL fragment
    async function checkSession() {
      const supabase = createClient();

      // This will automatically pick up the token from the URL hash
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setGeneralError("Invalid or expired reset link. Please request a new one.");
        setCheckingSession(false);
        return;
      }

      if (data.session) {
        setSessionReady(true);
      } else {
        // No session - might be an invalid/expired link
        setGeneralError("Invalid or expired reset link. Please request a new one.");
      }

      setCheckingSession(false);
    }

    checkSession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!mounted) return;

    setErrors({});
    setGeneralError(null);

    // Validate with zod
    const result = resetPasswordSchema.safeParse({ password, confirmPassword });
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

      const { error } = await supabase.auth.updateUser({
        password: result.data.password,
      });

      if (error) {
        setGeneralError(error.message);
        setLoading(false);
        return;
      }

      // Success
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      console.error("Password update error:", err);
      setGeneralError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  if (!mounted || checkingSession) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
        <p className="mt-4 text-sm text-gray-500">Verifying reset link...</p>
      </div>
    );
  }

  // No valid session - show error with link to request new reset
  if (!sessionReady && generalError) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Link expired
        </h1>
        <p className="mt-2 text-sm text-gray-500">{generalError}</p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
        >
          Request new link
        </Link>
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
          Password updated
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Your password has been successfully reset. You can now log in with
          your new password.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        Set new password
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Enter your new password below.
      </p>

      {generalError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 ${
              errors.password
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                : "border-gray-300 focus:border-primary focus:ring-primary/30"
            }`}
            placeholder="••••••••"
          />
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Must be at least 8 characters
          </p>
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700"
          >
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50 ${
              errors.confirmPassword
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                : "border-gray-300 focus:border-primary focus:ring-primary/30"
            }`}
            placeholder="••••••••"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Back to login
        </Link>
      </p>
    </div>
  );
}
