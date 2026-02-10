import { z } from "zod";

/**
 * Validation schema for login form
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Validation schema for signup form
 */
export const signupSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string()
      .min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Validation schema for forgot password form
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Validation schema for reset password form
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string()
      .min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Validate a returnTo URL to prevent open redirect attacks.
 * Only allows relative paths starting with / (not //).
 */
export function isValidReturnTo(returnTo: string | null | undefined): returnTo is string {
  if (!returnTo) return false;
  // Must start with / but not // (which could be protocol-relative URL)
  return returnTo.startsWith("/") && !returnTo.startsWith("//");
}

/**
 * Get the redirect URL after successful auth.
 * Uses returnTo if valid, otherwise defaults to /cars.
 */
export function getAuthRedirectUrl(returnTo: string | null | undefined): string {
  if (isValidReturnTo(returnTo)) {
    return returnTo;
  }
  return "/cars";
}
