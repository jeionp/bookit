"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function SearchForm({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = inputRef.current?.value.trim();
    if (q) {
      router.push(`/?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl flex gap-2">
      <div className="flex-1 flex items-center gap-2 bg-white rounded-2xl border border-gray-200 px-4 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
        <Search size={18} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search by business name or city…"
          className="flex-1 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
        />
      </div>
      <button
        type="submit"
        className="px-5 py-3 rounded-2xl bg-amber-400 text-gray-900 text-sm font-semibold hover:bg-amber-500 transition-colors shadow-sm whitespace-nowrap"
      >
        Search →
      </button>
    </form>
  );
}
