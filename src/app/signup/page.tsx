import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { getAuthRedirectUrl } from "@/lib/auth/validation";
import SignupForm from "./SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  
  // Already authenticated → send to returnTo or default
  const profile = await getProfile();
  if (profile) {
    redirect(getAuthRedirectUrl(params.returnTo));
  }

  return (
    <section className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6">
      <SignupForm returnTo={params.returnTo ?? null} />
    </section>
  );
}
