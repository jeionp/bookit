"use client";

import Image from "next/image";
import { useState } from "react";
import { MapPin, LogOut, Clock, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Selection } from "./AvailabilitySection";
import StarRating from "@/components/ui/StarRating";
import Sidebar from "@/components/business/Sidebar";
import HomeTab from "@/components/business/HomeTab";
import AuthModal from "@/components/auth/AuthModal";
import BookingConfirmModal from "@/components/booking/BookingConfirmModal";
import MyBookings from "@/components/booking/MyBookings";
import type { Business } from "@/lib/types";

const TABS = ["Home", "My Bookings", "Info"] as const;
type Tab = (typeof TABS)[number];

export default function BusinessPageClient({ business }: { business: Business }) {
  const { user, loading, signOut, isAdminOf } = useAuth();
  const { slug: businessSlug } = business;

  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [authOpen, setAuthOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSelection, setBookingSelection] = useState<Selection | null>(null);
  const [bookingDate, setBookingDate] = useState<Date>(new Date());

  const isStorefrontSuspended =
    (business.accepts_qr || business.accepts_cash || business.accepts_gateway) &&
    business.saas_credit_balance != null &&
    business.saas_credit_balance <= -5;

  function handleBook(selection: Selection, date: Date) {
    if (isStorefrontSuspended) return;
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
          <Link href="/" className="text-base font-black tracking-tight hover:opacity-80 transition-opacity">
            <span className="text-indigo-700">ser</span><span className="text-gray-900">bi</span>
          </Link>
          {!loading && (
            user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/account"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-indigo-700 text-white text-xs flex items-center justify-center font-bold shrink-0">
                    {(user.displayName ?? user.email ?? "U").charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:block max-w-[120px] truncate">
                    {user.displayName ?? user.email}
                  </span>
                </Link>
                {isAdminOf(businessSlug) && (
                  <Link
                    href={`/${businessSlug}/admin`}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
                    style={{
                      backgroundColor: `${business.accentColor}15`,
                      color: business.accentColor,
                    }}
                  >
                    <LayoutDashboard size={13} />
                    Admin
                  </Link>
                )}
                <button
                  onClick={signOut}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <LogOut size={15} />
                  <span className="hidden sm:inline">Sign out</span>
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

      {/* Degraded storefront banner */}
      {isStorefrontSuspended && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <p className="max-w-7xl mx-auto text-sm font-semibold text-amber-800 text-center">
            Online bookings are temporarily unavailable. Please contact the venue directly to reserve a slot.
          </p>
        </div>
      )}

      {/* Hero */}
      <div className="relative h-52 sm:h-64 lg:h-72 overflow-hidden bg-gray-200">
        <Image
          src={business.coverImage || "/placeholder-cover.svg"}
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

      {/* Mobile info strip */}
      <div className="xl:hidden bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            {(() => {
              const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
              const todayHours = business.operatingHours.find((h) => h.day === today);
              return todayHours && !todayHours.closed ? (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ backgroundColor: `${business.accentColor}15`, color: business.accentColor }}
                >
                  <Clock size={11} />
                  Open · closes {todayHours.close}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 shrink-0">
                  Closed today
                </span>
              );
            })()}
            <span className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
              <MapPin size={11} className="text-gray-400 shrink-0" />
              <span className="truncate">{business.address}</span>
            </span>
          </div>
          <button
            className="shrink-0 px-4 py-2 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: business.accentColor }}
            onClick={() => {
              setActiveTab("Home");
              setTimeout(() => {
                document
                  .querySelector('[data-testid="availability-section"]')
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
            }}
          >
            Book a slot →
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex flex-col xl:grid xl:grid-cols-[300px_1fr] xl:gap-6 xl:items-start">

          <aside className="hidden xl:block xl:order-1 xl:sticky xl:top-[72px]">
            <Sidebar business={business} />
          </aside>

          <div className="order-1 xl:order-2 space-y-2 min-w-0">
            <div className="flex bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3.5 text-sm font-bold transition-colors relative ${
                    activeTab === tab ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
                  } ${tab === "Info" ? "xl:hidden" : ""}`}
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

            {activeTab !== "Info" && (
              <div className="bg-white rounded-2xl border border-gray-100 px-5 pt-6">
                {activeTab === "Home" && (
                  <HomeTab business={business} onBook={handleBook} />
                )}
                {activeTab === "My Bookings" && (
                  <MyBookings accentColor={business.accentColor} />
                )}
              </div>
            )}
            {activeTab === "Info" && (
              <div className="xl:hidden">
                <Sidebar business={business} />
              </div>
            )}
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
        acceptsQr={business.accepts_qr}
        acceptsCash={business.accepts_cash}
        acceptsGateway={business.accepts_gateway}
        staticQrUrl={business.static_qr_url}
      />
    </div>
  );
}
