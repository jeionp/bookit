import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Car,
  Wifi,
  ShoppingBag,
  Coffee,
  Dumbbell,
  Users,
  Droplets,
  Package,
} from "lucide-react";
import { Business } from "@/lib/types";
import StarRating from "@/components/ui/StarRating";

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  "Free Parking": <Car size={15} />,
  "Free Wi-Fi": <Wifi size={15} />,
  "Pro Shop": <ShoppingBag size={15} />,
  "Snack Bar": <Coffee size={15} />,
  "Locker Room": <Package size={15} />,
  "Equipment Rental": <Dumbbell size={15} />,
  "Spectator Area": <Users size={15} />,
  "Restrooms & Showers": <Droplets size={15} />,
};

export default function Sidebar({ business }: { business: Business }) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todayHours = business.operatingHours.find((h) => h.day === today);

  return (
    <div className="space-y-4">
      {/* Identity card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-tight">{business.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{business.tagline}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <StarRating rating={business.rating} />
          <span className="text-sm font-bold text-gray-800">{business.rating}</span>
          <span className="text-xs text-gray-400">({business.reviewCount} reviews)</span>
        </div>

        {todayHours && !todayHours.closed && (
          <div
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${business.accentColor}15`, color: business.accentColor }}
          >
            <Clock size={11} />
            Open today · closes {todayHours.close}
          </div>
        )}

        <div className="space-y-2 pt-1 border-t border-gray-100">
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <span>{business.address}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Phone size={13} className="text-gray-400 shrink-0" />
            <span>{business.phone}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Mail size={13} className="text-gray-400 shrink-0" />
            <span>{business.email}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 grid grid-cols-4 divide-x divide-gray-100">
        {[
          { value: business.facilities.length, label: "Courts" },
          { value: business.rating, label: "Rating" },
          { value: business.reviewCount, label: "Reviews" },
          { value: business.amenities.length, label: "Amenities" },
        ].map(({ value, label }) => (
          <div key={label} className="flex flex-col items-center px-2">
            <span className="text-base font-black text-gray-900">{value}</span>
            <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium leading-tight text-center">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* About */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-2">About</h2>
        <p className="text-xs text-gray-500 leading-relaxed">{business.description}</p>
      </div>

      {/* Amenities */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Amenities</h2>
        <div className="grid grid-cols-2 gap-2">
          {business.amenities.map((amenity) => (
            <div
              key={amenity}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-gray-50 border border-gray-100"
            >
              <span className="text-gray-400 shrink-0">
                {AMENITY_ICONS[amenity] ?? <Package size={15} />}
              </span>
              <span className="text-[11px] font-medium text-gray-700 leading-tight">{amenity}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hours */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Hours</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {business.operatingHours.map((hours) => {
            const isToday = hours.day === today;
            return (
              <div
                key={hours.day}
                className={`flex items-center justify-between px-5 py-2.5 ${isToday ? "bg-green-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${isToday ? "text-green-700" : "text-gray-700"}`}>
                    {hours.day.slice(0, 3)}
                  </span>
                  {isToday && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${business.accentColor}18`, color: business.accentColor }}
                    >
                      TODAY
                    </span>
                  )}
                </div>
                <span className={`text-xs ${isToday ? "font-semibold text-green-700" : "text-gray-500"}`}>
                  {hours.closed ? "Closed" : `${hours.open} – ${hours.close}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Location */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Location</h2>
        </div>
        <div className="h-36 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <div className="text-center space-y-1.5">
            <MapPin size={22} className="mx-auto text-gray-400" />
            <p className="text-xs font-medium text-gray-500 px-4">{business.address}</p>
            <p className="text-[10px] text-gray-400">Map coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
