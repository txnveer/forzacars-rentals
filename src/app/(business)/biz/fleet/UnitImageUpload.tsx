"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface UnitImageUploadProps {
  unitId: string;
  hasImage: boolean;
}

export default function UnitImageUpload({ unitId, hasImage }: UnitImageUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Use PNG, JPEG, or WEBP.");
      return;
    }

    // Validate file size (5 MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum 5 MB.");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/biz/units/${unitId}/image`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        // Refresh the page to show new image
        router.refresh();
      }
    } catch (err) {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        disabled={uploading}
      />
      
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={`rounded px-2 py-1 text-xs font-medium ${
          hasImage
            ? "border border-gray-300 text-gray-600 hover:bg-gray-100"
            : "bg-indigo-600 text-white hover:bg-indigo-700"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {uploading ? "Uploading..." : hasImage ? "Replace" : "Upload Image"}
      </button>

      {error && (
        <p className="text-xs text-red-600 max-w-[120px] truncate" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
