"use client";

import { useState, useRef } from "react";
import { createBusiness } from "./actions";

export default function AddBusinessForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const res = await createBusiness(formData);
    if (!res.success) {
      setError(res.error ?? "Failed");
    } else {
      formRef.current?.reset();
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
      >
        + New Business
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-gray-900">Create a business</h3>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Name *
          <input
            name="name"
            required
            placeholder="Acme Rentals"
            className="h-9 w-48 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Slug *
          <input
            name="slug"
            required
            placeholder="acme-rentals"
            pattern="^[a-z0-9-]+$"
            className="h-9 w-40 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="h-9 rounded-lg border border-gray-300 px-4 text-sm text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}
