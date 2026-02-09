import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import AddModelForm from "./AddModelForm";

export const metadata = {
  title: "Add Model to Fleet | ForzaCars Rentals",
};

export default async function AddModelToFleetPage() {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "BUSINESS") {
    redirect("/");
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900">Add Model to Fleet</h1>
      <p className="mt-1 text-sm text-gray-500">
        Search for a car model and add it to your business fleet.
      </p>

      <div className="mt-8">
        <AddModelForm />
      </div>
    </section>
  );
}
