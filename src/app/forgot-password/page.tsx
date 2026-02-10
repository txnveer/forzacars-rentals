import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  // Already authenticated → send to cars
  const profile = await getProfile();
  if (profile) {
    redirect("/cars");
  }

  return (
    <section className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6">
      <ForgotPasswordForm />
    </section>
  );
}
