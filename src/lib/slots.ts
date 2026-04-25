import { Sunrise, Sun, Moon } from "lucide-react";

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseHour(timeStr: string): number {
  const [time, period] = timeStr.split(" ");
  let hour = parseInt(time.split(":")[0]);
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour;
}

export function generateSlots(open: string, close: string): number[] {
  const slots: number[] = [];
  for (let h = parseHour(open); h < parseHour(close); h++) slots.push(h);
  return slots;
}

export function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export function formatRange(hours: number[]): string {
  if (hours.length === 0) return "";
  return `${formatHour(hours[0])} – ${formatHour(hours[hours.length - 1] + 1)}`;
}

export function getValidRange(
  startHour: number,
  endHour: number,
  bookedHours: number[]
): number[] {
  const step = startHour <= endHour ? 1 : -1;
  const hours: number[] = [];
  for (let h = startHour; step > 0 ? h <= endHour : h >= endHour; h += step) {
    if (bookedHours.includes(h)) break;
    hours.push(h);
  }
  return step > 0 ? hours : hours.reverse();
}

export const PERIODS = [
  { key: "morning",   label: "Morning",   icon: Sunrise, range: (h: number) => h < 12 },
  { key: "afternoon", label: "Afternoon", icon: Sun,     range: (h: number) => h >= 12 && h < 17 },
  { key: "evening",   label: "Evening",   icon: Moon,    range: (h: number) => h >= 17 },
] as const;

export function groupByPeriod(slots: number[]) {
  return PERIODS.map((p) => ({ ...p, slots: slots.filter(p.range) })).filter(
    (p) => p.slots.length > 0
  );
}

export type SlotState = "active" | "preview" | "available" | "booked";

export interface Selection {
  facilityId: string;
  facilityName: string;
  hours: number[];
  pricePerHour: number;
  primePricePerHour?: number;
  primeTimeStart?: number;
  totalPrice: number;
}

export interface DragState {
  facilityId: string;
  facilityName: string;
  startHour: number;
  currentHour: number;
  pricePerHour: number;
  primePricePerHour?: number;
  primeTimeStart?: number;
}
