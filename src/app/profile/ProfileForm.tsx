"use client";

import { useState, useRef } from "react";
import { updateProfile } from "./actions";
import type { Profile } from "@/lib/auth/getProfile";

interface ProfileFormProps {
  profile: Profile;
}

export default function ProfileForm({ profile }: ProfileFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    setSuccess(false);
    setPending(true);

    const result = await updateProfile(formData);
    setPending(false);

    if (!result.success) {
      setError(result.error ?? "An error occurred.");
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-6">
      {/* Email (read-only) */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          value={profile.email}
          disabled
          className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-500 shadow-sm"
        />
        <p className="mt-1 text-xs text-gray-500">Email cannot be changed.</p>
      </div>

      {/* Role (read-only) */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Role</label>
        <input
          type="text"
          value={profile.role}
          disabled
          className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-gray-500 shadow-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Role is assigned by administrators.
        </p>
      </div>

      {/* Display Name */}
      <div>
        <label
          htmlFor="display_name"
          className="block text-sm font-medium text-gray-700"
        >
          Display Name
        </label>
        <input
          type="text"
          id="display_name"
          name="display_name"
          defaultValue={profile.display_name ?? ""}
          maxLength={100}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {fieldErrors.display_name && (
          <p className="mt-1 text-sm text-red-600">
            {fieldErrors.display_name[0]}
          </p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-gray-700"
        >
          Phone
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          defaultValue={profile.phone ?? ""}
          maxLength={30}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {fieldErrors.phone && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors.phone[0]}</p>
        )}
      </div>

      {/* Bio */}
      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={profile.bio ?? ""}
          maxLength={500}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {fieldErrors.bio && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors.bio[0]}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">Max 500 characters.</p>
      </div>

      {/* Avatar placeholder */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Avatar</label>
        <div className="mt-1 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
            {profile.avatar_path ? (
              <span className="text-xs">IMG</span>
            ) : (
              <svg
                className="h-8 w-8"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" />
              </svg>
            )}
          </div>
          <span className="text-sm text-gray-500">
            Avatar upload coming soon.
          </span>
        </div>
      </div>

      {/* Error / Success messages */}
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3">
          <p className="text-sm text-green-700">Profile updated successfully!</p>
        </div>
      )}

      {/* Submit */}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
