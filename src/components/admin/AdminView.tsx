"use client";

import { useState } from "react";
import { LogOut, ExternalLink, CalendarDays, BarChart2 } from "lucide-react";
import Link from "next/link";
import { Business } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import AdminScheduleView from "./AdminScheduleView";
import AdminAnalyticsView from "./AdminAnalyticsView";

type Tab = "schedule" | "analytics";

export default function AdminView({ business }: { business: Business }) {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("schedule");

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shrink-0 h-14 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-black tracking-tight text-gray-900">bookit</span>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-600">{business.name}</span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${business.accentColor}15`, color: business.accentColor }}
          >
            Admin
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${business.slug}`}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ExternalLink size={13} />
            Public view
          </Link>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-100 shrink-0 px-4 flex gap-1">
        <TabButton
          active={tab === "schedule"}
          onClick={() => setTab("schedule")}
          icon={<CalendarDays size={14} />}
          label="Schedule"
          accent={business.accentColor}
        />
        <TabButton
          active={tab === "analytics"}
          onClick={() => setTab("analytics")}
          icon={<BarChart2 size={14} />}
          label="Analytics"
          accent={business.accentColor}
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {tab === "schedule" ? (
          <AdminScheduleView business={business} />
        ) : (
          <AdminAnalyticsView business={business} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-bold px-3 py-3 border-b-2 transition-colors"
      style={
        active
          ? { borderColor: accent, color: accent }
          : { borderColor: "transparent", color: "#9ca3af" }
      }
    >
      {icon}
      {label}
    </button>
  );
}
