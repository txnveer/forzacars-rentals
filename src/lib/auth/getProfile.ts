import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  role: "CUSTOMER" | "BUSINESS" | "ADMIN";
  business_id: string | null;
  display_name: string | null;
  phone: string | null;
  bio: string | null;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Fetch the current user's profile from Supabase.
 *
 * Wrapped with React `cache()` so multiple Server Components that call
 * this within the same request only trigger one DB round-trip.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (profile as Profile) ?? null;
});
