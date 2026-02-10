import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { getAuthRedirectUrl } from "@/lib/auth/validation";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; message?: string; error?: string }>;
}) {
  const params = await searchParams;
  
  // Already authenticated → send to returnTo or default
  const profile = await getProfile();
  if (profile) {
    redirect(getAuthRedirectUrl(params.returnTo));
  }

  return (
    <section className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6">
      <LoginForm
        returnTo={params.returnTo ?? null}
        message={params.message ?? null}
        errorParam={params.error ?? null}
      />
    </section>
  );
}
