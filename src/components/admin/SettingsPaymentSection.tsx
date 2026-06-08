"use client";

import { useState, useRef } from "react";
import { Upload, QrCode } from "lucide-react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { Business } from "@/lib/types";
import { SectionHeader } from "./SettingsShared";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import type { User } from "firebase/auth";

interface Props {
  draft: Business;
  setDraft: React.Dispatch<React.SetStateAction<Business>>;
  user: User | null;
  open: boolean;
  onToggle: () => void;
}

export default function SettingsPaymentSection({ draft, setDraft, user, open, onToggle }: Props) {
  const authedFetch = useAuthedFetch();
  const [qrUploading, setQrUploading] = useState(false);
  const [qrUploadError, setQrUploadError] = useState("");
  const qrFileInputRef = useRef<HTMLInputElement>(null);

  async function handleQrUpload(file: File) {
    if (!user) return;
    setQrUploading(true);
    setQrUploadError("");
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const storageRef = ref(storage, `businesses/${draft.slug}/qr_code.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await authedFetch(`/api/businesses/${draft.slug}`, {
        method: "PATCH",
        body: JSON.stringify({ static_qr_url: url }),
      });
      setDraft((d) => ({ ...d, static_qr_url: url }));
    } catch {
      setQrUploadError("Upload failed. Please try again.");
    } finally {
      setQrUploading(false);
    }
  }

  const bal = draft.saas_credit_balance;
  const balColor =
    bal === undefined || bal === null ? "text-gray-400"
    : bal >= 10 ? "text-green-600"
    : bal >= 5  ? "text-yellow-600"
    : bal >= 1  ? "text-orange-500"
    : "text-red-600";
  const balLabel =
    bal === undefined || bal === null ? "—"
    : bal >= 10 ? "Healthy"
    : bal >= 5  ? "Watch"
    : bal >= 1  ? "Low"
    : bal > -5  ? "Critical"
    : "Suspended";

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 space-y-4">
      <SectionHeader title="Payment" open={open} onToggle={onToggle} />
      {open && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500">Accepted Payment Methods</p>
            {[
              { key: "accepts_qr" as const,      label: "QR Code (P2P / AI verification)" },
              { key: "accepts_cash" as const,     label: "Pay at Venue (cash on the day)" },
              { key: "accepts_gateway" as const,  label: "Online Gateway (PayMongo / Xendit)" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded accent-gray-900"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>

          {draft.accepts_qr && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500">QR Code Image</p>
              {draft.static_qr_url && (
                <div className="flex justify-center">
                  <div className="border border-gray-200 rounded-xl p-2 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={draft.static_qr_url}
                      alt="QR code"
                      className="w-32 h-32 object-contain rounded-lg"
                    />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => qrFileInputRef.current?.click()}
                disabled={qrUploading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                {qrUploading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-gray-400 animate-spin" />
                ) : (
                  <><Upload size={14} /><QrCode size={14} /></>
                )}
                {qrUploading ? "Uploading…" : draft.static_qr_url ? "Replace QR image" : "Upload QR image"}
              </button>
              <input
                ref={qrFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleQrUpload(file);
                }}
              />
              {qrUploadError && (
                <p className="text-xs text-red-500 font-medium">{qrUploadError}</p>
              )}
            </div>
          )}

          {bal !== undefined && bal !== null && (
            <>
              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Wallet Balance</p>
                  <p className={`text-2xl font-black ${balColor}`}>
                    {bal}
                    <span className="text-xs font-semibold text-gray-400 ml-1.5">credits</span>
                  </p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  balLabel === "Healthy"    ? "bg-green-100 text-green-700"
                  : balLabel === "Watch"   ? "bg-yellow-100 text-yellow-700"
                  : balLabel === "Low"     ? "bg-orange-100 text-orange-700"
                  : balLabel === "Critical" || balLabel === "Suspended" ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-500"
                }`}>
                  {balLabel}
                </span>
              </div>
              {bal <= 0 && (
                <p className="text-xs text-red-500 font-semibold">
                  {bal <= -5
                    ? "Storefront suspended — online bookings are blocked. Top up your wallet to restore service."
                    : `Online bookings will be suspended in ${bal + 5} more booking(s). Please top up.`}
                </p>
              )}
            </>
          )}
          <p className="text-xs text-gray-400">
            Wallet balance is managed by the serbi platform. Contact support to top up.
          </p>
        </div>
      )}
    </div>
  );
}
