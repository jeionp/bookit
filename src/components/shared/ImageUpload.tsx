"use client";

import { useRef, useState } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/client";

export default function ImageUpload({
  label,
  value,
  onChange,
  path,
  hint,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  path: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputId = `img-${path.replace(/\//g, "-")}`;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onChange(url);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <div className="flex items-start gap-3">
        {value ? (
          <img
            src={value}
            alt=""
            className="w-16 h-16 object-cover rounded-xl border border-gray-200 shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
            <ImageIcon size={20} className="text-gray-300" />
          </div>
        )}
        <div className="flex-1 flex flex-col gap-1.5">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className="hidden"
          />
          <label
            htmlFor={inputId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors w-fit"
          >
            {uploading ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin inline-block" />
                Uploading…
              </>
            ) : (
              <>
                <Upload size={12} />
                {value ? "Replace image" : "Upload image"}
              </>
            )}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => { setUploadError(null); onChange(e.target.value); }}
            placeholder="Or paste a URL…"
            disabled={uploading}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors disabled:opacity-50"
          />
          {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
      </div>
      {uploadError && <p className="text-xs text-red-500 mt-0.5">{uploadError}</p>}
    </div>
  );
}
