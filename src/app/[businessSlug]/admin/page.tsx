import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/firebase/businesses";
import AdminGuard from "@/components/admin/AdminGuard";
import AdminView from "@/components/admin/AdminView";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const business = await getBusinessBySlug(businessSlug);
  if (!business) notFound();

  return (
    <AdminGuard slug={businessSlug}>
      <AdminView business={business} />
    </AdminGuard>
  );
}
