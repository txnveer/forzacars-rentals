import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import ProfileForm from "./ProfileForm";

export const metadata = {
  title: "Your Profile | ForzaCars Rentals",
};

export default async function ProfilePage() {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Your Profile</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <ProfileForm profile={profile} />
      </div>
      <p className="mt-4 text-xs text-gray-500">
        Last updated: {new Date(profile.updated_at).toLocaleString()}
      </p>
    </div>
  );
}
