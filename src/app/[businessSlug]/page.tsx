import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/firebase/businesses";
import BusinessPageClient from "./_components/BusinessPageClient";

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const business = await getBusinessBySlug(businessSlug);
  if (!business) notFound();
  return <BusinessPageClient business={business} />;
}
