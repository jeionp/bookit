"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface Props {
  slug: string;
  children: React.ReactNode;
}

export default function AdminGuard({ slug, children }: Props) {
  const { user, loading, isAdminOf } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || !isAdminOf(slug)) {
      router.replace(`/${slug}`);
    }
  }, [loading, user, isAdminOf, slug, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-gray-400 animate-spin" />
      </div>
    );
  }

  if (!user || !isAdminOf(slug)) {
    return null;
  }

  return <>{children}</>;
}
