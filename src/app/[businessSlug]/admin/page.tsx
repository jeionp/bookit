"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/businesses";
import AdminGuard from "@/components/admin/AdminGuard";
import AdminView from "@/components/admin/AdminView";

export default function AdminPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = use(params);
  const business = getBusinessBySlug(businessSlug);
  if (!business) notFound();

  return (
    <AdminGuard slug={businessSlug}>
      <AdminView business={business} />
    </AdminGuard>
  );
}
