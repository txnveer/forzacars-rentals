"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getDashboardPath } from "@/lib/auth/requireRole";
import type { Profile } from "@/lib/auth/getProfile";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // Determine where to send the user based on their profile role.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  const role = (profile?.role ?? "CUSTOMER") as Profile["role"];
  redirect(getDashboardPath(role));
}
