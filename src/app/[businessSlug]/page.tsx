"use client";

import Image from "next/image";
import { notFound } from "next/navigation";
import { use, useState } from "react";
import { MapPin, LogOut, Clock } from "lucide-react";
import { getBusinessBySlug } from "@/lib/businesses";
import { useAuth } from "@/context/AuthContext";
import { Selection } from "./_components/AvailabilitySection";
import StarRating from "@/components/ui/StarRating";
import Sidebar from "@/components/business/Sidebar";
import HomeTab from "@/components/business/HomeTab";
import AuthModal from "@/components/auth/AuthModal";
import BookingConfirmModal from "@/components/booking/BookingConfirmModal";
import MyBookings from "@/components/booking/MyBookings";

const TABS = ["Home", "My Bookings"] as const;
type Tab = (typeof TABS)[number];

export default function BusinessPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = use(params);
  const business = getBusinessBySlug(businessSlug);
  const { user, loading, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [authOpen, setAuthOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSelection, setBookingSelection] = useState<Selection | null>(null);
  const [bookingDate, setBookingDate] = useState<Date>(new Date());

  if (!business) notFound();

  function handleBook(selection: Selection, date: Date) {
    if (!user) { setAuthOpen(true); return; }
    setBookingSelection(selection);
    setBookingDate(date);
    setBookingOpen(true);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
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
          fill priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 xl:hidden">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-black text-white drop-shadow">{business.name}</h1>
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

      {/* Mobile info strip — visible on mobile only, desktop gets the sidebar */}
      <div className="xl:hidden bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-7xl mx-auto space-y-2.5">
          {/* Open status + stats */}
          <div className="flex items-center gap-3 flex-wrap">
            {(() => {
              const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
              const todayHours = business.operatingHours.find((h) => h.day === today);
              return todayHours && !todayHours.closed ? (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: `${business.accentColor}15`, color: business.accentColor }}
                >
                  <Clock size={11} />
                  Open · closes {todayHours.close}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                  Closed today
                </span>
              );
            })()}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <StarRating rating={business.rating} />
                <span className="font-bold text-gray-700 ml-0.5">{business.rating}</span>
                <span className="text-gray-400">({business.reviewCount})</span>
              </span>
              <span className="text-gray-300">·</span>
              <span>{business.facilities.length} courts</span>
              <span className="text-gray-300">·</span>
              <span>{business.amenities.length} amenities</span>
            </div>
          </div>
          {/* Address */}
          <p className="text-xs text-gray-500 flex items-start gap-1.5">
            <MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" />
            {business.address}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex flex-col xl:grid xl:grid-cols-[300px_1fr] xl:gap-6 xl:items-start">

          <aside className="order-2 xl:order-1 mt-4 xl:mt-0 xl:sticky xl:top-[72px]">
            <Sidebar business={business} />
          </aside>

          <div className="order-1 xl:order-2 space-y-2 min-w-0">
            {/* Tabs */}
            <div className="flex bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3.5 text-sm font-bold transition-colors relative ${
                    activeTab === tab ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
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
              {activeTab === "Home" && (
                <HomeTab business={business} onBook={handleBook} />
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
