"use client";

import Image from "next/image";
import { notFound } from "next/navigation";
import { use, useState } from "react";
import {
  MapPin,
  Phone,
  Mail,
  Star,
  Clock,
  Car,
  Wifi,
  ShoppingBag,
  Coffee,
  Dumbbell,
  Users,
  Droplets,
  Package,
  LogOut,
} from "lucide-react";
import { getBusinessBySlug } from "@/lib/businesses";
import { Business } from "@/lib/types";
import AvailabilitySection, { Selection } from "./_components/AvailabilitySection";
import AuthModal from "@/components/auth/AuthModal";
import BookingConfirmModal from "@/components/booking/BookingConfirmModal";
import MyBookings from "@/components/booking/MyBookings";
import { useAuth } from "@/context/AuthContext";

// ─── constants ───────────────────────────────────────────────────────────────

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

const TABS = ["Home", "Book", "My Bookings"] as const;
type Tab = (typeof TABS)[number];

// ─── small components ────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          className={
            i <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "fill-gray-200 text-gray-200"
          }
        />
      ))}
    </span>
  );
}

// ─── sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ business }: { business: Business }) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todayHours = business.operatingHours.find((h) => h.day === today);

  return (
    <div className="space-y-4">
      {/* Identity card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 leading-tight">
            {business.name}
          </h1>
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
            style={{
              backgroundColor: `${business.accentColor}15`,
              color: business.accentColor,
            }}
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
              <span className="text-[11px] font-medium text-gray-700 leading-tight">
                {amenity}
              </span>
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
                className={`flex items-center justify-between px-5 py-2.5 ${
                  isToday ? "bg-green-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${
                      isToday ? "text-green-700" : "text-gray-700"
                    }`}
                  >
                    {hours.day.slice(0, 3)}
                  </span>
                  {isToday && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${business.accentColor}18`,
                        color: business.accentColor,
                      }}
                    >
                      TODAY
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs ${
                    isToday ? "font-semibold text-green-700" : "text-gray-500"
                  }`}
                >
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

// ─── home tab (main content) ─────────────────────────────────────────────────

function HomeTab({
  business,
  onBook,
}: {
  business: Business;
  onBook: (selection: Selection, date: Date) => void;
}) {
  return (
    <div className="space-y-10 pb-6">
      <AvailabilitySection business={business} onBook={onBook} />

      <div className="border-t border-gray-100" />

      {/* Courts */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            {business.type === "court"
              ? "Courts"
              : business.type === "appointment"
              ? "Services"
              : "Rooms"}
          </h2>
          <span className="text-xs text-gray-400 font-medium">
            {business.facilities.length} available
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {business.facilities.map((facility) => (
            <div
              key={facility.id}
              className="rounded-2xl overflow-hidden border border-gray-100 bg-white hover:shadow-md transition-shadow"
            >
              <div className="relative h-36 bg-gray-100">
                <Image
                  src={facility.image}
                  alt={facility.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
              </div>
              <div className="p-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">{facility.name}</h3>
                  <span
                    className="text-sm font-bold"
                    style={{ color: business.accentColor }}
                  >
                    ₱{facility.pricePerHour.toLocaleString()}
                    <span className="text-xs font-normal text-gray-400">/hr</span>
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {facility.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function BusinessPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = use(params);
  const business = getBusinessBySlug(businessSlug);
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [authOpen, setAuthOpen] = useState(false);
  const [bookingSelection, setBookingSelection] = useState<Selection | null>(null);
  const [bookingDate, setBookingDate] = useState<Date>(new Date());
  const [bookingOpen, setBookingOpen] = useState(false);
  const { user, loading, signOut } = useAuth();

  function handleBook(selection: Selection, date: Date) {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setBookingSelection(selection);
    setBookingDate(date);
    setBookingOpen(true);
  }

  if (!business) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 h-14">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <span className="text-base font-black tracking-tight text-gray-900">bookit</span>
          {!loading && (
            user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 hidden sm:block">
                  {user.displayName ?? user.email}
                </span>
                <button
                  onClick={signOut}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="text-sm font-semibold px-4 py-1.5 rounded-full border-2 border-gray-200 text-gray-700 hover:border-gray-400 transition-colors"
              >
                Sign in
              </button>
            )
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="relative h-52 sm:h-64 lg:h-72 overflow-hidden bg-gray-200">
        <Image
          src={business.coverImage}
          alt={business.name}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Hero overlay info — mobile only (sidebar shows this on desktop) */}
        <div className="absolute bottom-4 left-4 right-4 lg:hidden">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-black text-white drop-shadow">
              {business.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StarRating rating={business.rating} />
              <span className="text-sm font-bold text-white">{business.rating}</span>
              <span className="text-xs text-white/60">({business.reviewCount})</span>
              <span className="text-white/40">·</span>
              <span className="text-xs text-white/80 flex items-center gap-1">
                <MapPin size={11} />
                {business.location}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex flex-col lg:grid lg:grid-cols-[300px_1fr] lg:gap-6 lg:items-start">

          {/* Sidebar — below main on mobile, left column on desktop */}
          <aside className="order-2 lg:order-1 mt-4 lg:mt-0 lg:sticky lg:top-[72px]">
            <Sidebar business={business} />
          </aside>

          {/* Main content */}
          <div className="order-1 lg:order-2 space-y-2">
            {/* Tabs */}
            <div className="flex bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3.5 text-sm font-bold transition-colors relative ${
                    activeTab === tab
                      ? "text-gray-900"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                      style={{ backgroundColor: business.accentColor }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="bg-white rounded-2xl border border-gray-100 px-5 pt-6">
              {activeTab === "Home" && <HomeTab business={business} onBook={handleBook} />}
              {activeTab === "Book" && (
                <div className="py-16 text-center">
                  <p className="text-sm text-gray-400">Full booking calendar coming soon</p>
                </div>
              )}
              {activeTab === "My Bookings" && (
                <MyBookings accentColor={business.accentColor} />
              )}
            </div>
          </div>

        </div>
      </div>

      <div className="h-10" />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        accentColor={business.accentColor}
      />

      <BookingConfirmModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        onSuccess={() => setActiveTab("My Bookings")}
        selection={bookingSelection}
        selectedDate={bookingDate}
        businessSlug={business.slug}
        businessName={business.name}
        businessLocation={business.location}
        accentColor={business.accentColor}
      />
    </div>
  );
}
