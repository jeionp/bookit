import Link from "next/link";
import { CalendarCheck, BarChart3, Clock, Users, Search, BookOpen, Zap } from "lucide-react";
import { listBusinesses } from "@/lib/firebase/businesses";
import LandingNav from "./_components/LandingNav";
import SearchForm from "./_components/SearchForm";
import BusinessCard from "./_components/BusinessCard";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const businesses = await listBusinesses(q).catch(() => []);

  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* ── Nav ── */}
      <LandingNav />

      {/* ── Hero ── */}
      <section className="relative bg-gradient-to-br from-indigo-700 via-indigo-800 to-[#1e1b6e] text-white overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-white/5" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 flex flex-col items-center text-center gap-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-semibold backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Courts available now
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight tracking-tight max-w-2xl">
            Every court.<br />
            <span className="text-indigo-200">One tap away.</span>
          </h1>

          <p className="text-indigo-100 text-base sm:text-lg max-w-xl leading-relaxed">
            ready to serve — book racket sport courts and sports facilities from businesses across the Philippines.
          </p>

          <SearchForm defaultValue={q} />
        </div>
      </section>

      {/* ── Business listings ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 w-full">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {q ? `Results for "${q}"` : "Listed businesses"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {businesses.length === 0
                ? "No businesses found"
                : `${businesses.length} ${businesses.length === 1 ? "business" : "businesses"}`}
            </p>
          </div>
          {q && (
            <Link href="/" className="text-sm text-indigo-700 font-semibold hover:text-indigo-800 transition-colors">
              Clear search
            </Link>
          )}
        </div>

        {businesses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {businesses.map((b) => (
              <BusinessCard key={b.slug} business={b} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <Search size={22} className="text-gray-400" />
            </div>
            <p className="text-gray-700 font-semibold">No businesses found</p>
            <p className="text-sm text-gray-400 max-w-xs">
              {q
                ? `We couldn't find anything matching "${q}". Try a different search.`
                : "No businesses are listed yet. Be the first to get listed!"}
            </p>
            {q && (
              <Link href="/" className="mt-1 text-sm text-indigo-700 font-semibold hover:underline">
                View all businesses
              </Link>
            )}
          </div>
        )}
      </section>

      {/* ── How it works ── */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900">
              How <span className="text-indigo-700">serbi</span> works
            </h2>
            <p className="text-gray-500 mt-2 text-sm">On the court in three simple steps</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: <Search size={20} />,
                step: "01",
                title: "Search",
                desc: "Find courts, rooms, and spaces near you. Filter by city or business name.",
              },
              {
                icon: <BookOpen size={20} />,
                step: "02",
                title: "Book",
                desc: "Pick your time slot, confirm your booking, and pay securely. Takes under a minute.",
              },
              {
                icon: <Zap size={20} />,
                step: "03",
                title: "Palo na.",
                desc: "Show up and play. Your booking confirmation is all you need.",
              },
            ].map(({ icon, step, title, desc }) => (
              <div key={step} className="relative bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                    {icon}
                  </div>
                  <span className="text-4xl font-black text-gray-100 leading-none">{step}</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For business owners ── */}
      <section className="bg-indigo-950 text-white py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Left: copy */}
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-3">For business owners</p>
                <h2 className="text-3xl sm:text-4xl font-black leading-tight">
                  Own a court or space?<br />
                  <span className="text-indigo-300">Get listed for free.</span>
                </h2>
                <p className="text-indigo-200 mt-4 text-sm leading-relaxed max-w-md">
                  Start accepting bookings in minutes. No setup fees, no monthly charges for the basics —
                  upgrade only when you need more.
                </p>
              </div>

              <ul className="flex flex-col gap-3">
                {[
                  { icon: <Clock size={15} />, text: "Accept bookings 24/7, even while you sleep" },
                  { icon: <CalendarCheck size={15} />, text: "Manage your schedule and court availability" },
                  { icon: <BarChart3 size={15} />, text: "Track revenue and booking analytics" },
                  { icon: <Users size={15} />, text: "Build a customer history and repeat business" },
                ].map(({ icon, text }) => (
                  <li key={text} className="flex items-center gap-3 text-sm text-indigo-100">
                    <span className="w-6 h-6 rounded-full bg-indigo-800 text-indigo-300 flex items-center justify-center shrink-0">
                      {icon}
                    </span>
                    {text}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  href="/onboarding"
                  className="px-6 py-3 rounded-xl bg-amber-400 text-gray-900 text-sm font-bold hover:bg-amber-500 transition-colors"
                >
                  Start for free →
                </Link>
                <Link
                  href="mailto:hello@serbi.app"
                  className="px-6 py-3 rounded-xl border border-indigo-700 text-white text-sm font-semibold hover:bg-indigo-900 transition-colors"
                >
                  Contact us
                </Link>
              </div>
            </div>

            {/* Right: feature tiers */}
            <div className="flex flex-col gap-3">
              {/* Free tier */}
              <div className="bg-indigo-900/50 border border-indigo-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-white">Free</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/20 text-green-300 font-semibold border border-green-500/30">
                    Get started
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {["Business listing page", "Online bookings", "Court / space management", "Basic analytics"].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-indigo-200">
                      <span className="text-green-400">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pro tier */}
              <div className="bg-indigo-900/30 border border-indigo-800/50 rounded-2xl p-5 opacity-75">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-white">Pro</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                    Coming soon
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {["Everything in Free", "Online payments via PayMongo", "Walk-in & refund management", "Priority listing & support"].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-indigo-300">
                      <span className="text-indigo-400">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <span className="text-base font-black tracking-tight">
            <span className="text-indigo-700">ser</span><span className="text-gray-900">bi</span>
          </span>
          <span>© {new Date().getFullYear()} serbi. All rights reserved.</span>
          <Link href="/onboarding" className="text-indigo-700 font-semibold hover:underline">
            List your business
          </Link>
        </div>
      </footer>

    </div>
  );
}
