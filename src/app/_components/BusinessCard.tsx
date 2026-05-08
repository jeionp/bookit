import Link from "next/link";
import { MapPin } from "lucide-react";
import { Business } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  court: "Sports Court",
  appointment: "Appointment",
  room: "Room / Space",
};

export default function BusinessCard({ business }: { business: Business }) {
  const facilityCount = business.facilities?.length ?? 0;

  return (
    <Link
      href={`/${business.slug}`}
      className="group flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
    >
      {/* Cover image */}
      <div className="relative h-40 bg-gray-100 overflow-hidden">
        {business.coverImage ? (
          <img
            src={business.coverImage}
            alt={business.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-3xl font-black text-white"
            style={{ backgroundColor: business.accentColor ?? "#3B82F6" }}
          >
            {business.name.charAt(0)}
          </div>
        )}
        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/90 text-gray-700 backdrop-blur-sm border border-white/50">
          {TYPE_LABELS[business.type] ?? business.type}
        </span>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <h3 className="font-bold text-gray-900 text-sm leading-tight group-hover:text-blue-600 transition-colors">
          {business.name}
        </h3>
        {business.location && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin size={11} className="shrink-0" />
            {business.location}
          </div>
        )}
        {business.tagline && (
          <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{business.tagline}</p>
        )}
        <div className="mt-auto pt-2 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {facilityCount} {facilityCount === 1 ? "court" : "courts"}
          </span>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full text-white"
            style={{ backgroundColor: business.accentColor ?? "#3B82F6" }}
          >
            Book now →
          </span>
        </div>
      </div>
    </Link>
  );
}
