"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Props {
  colors: string[];
}

/**
 * Client component that pushes ?color=<value> to the URL so the server
 * component can re-render with filtered units.
 */
export default function ColorFilter({ colors }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("color") ?? "";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("color", value);
    } else {
      params.delete("color");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  if (colors.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-400">Filter:</span>
      <button
        onClick={() => handleChange("")}
        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
          !current
            ? "bg-gray-900 text-white"
            : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        Any color
      </button>
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => handleChange(c)}
          className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
            current === c
              ? "bg-gray-900 text-white"
              : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
