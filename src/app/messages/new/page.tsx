import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import NewThreadForm from "./NewThreadForm";

export const metadata = {
  title: "New Message | ForzaCars Rentals",
};

export default async function NewMessagePage() {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Message</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <NewThreadForm />
      </div>
    </div>
  );
}
