import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const params = await searchParams;

  // Supabase may pass error info in query params
  const errorParam = params.error_description || params.error || null;

  return (
    <section className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6">
      <ResetPasswordForm errorParam={errorParam} />
    </section>
  );
}
