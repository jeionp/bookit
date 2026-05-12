export interface ICSEventData {
  bookingId: string;
  date: string;       // YYYY-MM-DD
  hours: number[];    // array of hour integers, e.g. [9, 10, 11]
  summary: string;
  description: string;
  location: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// Floating-time format (no Z, no TZID) — calendar apps display in the user's local time,
// which is correct for a physical venue booking.
function toICSDateTime(date: string, hour: number): string {
  return `${date.replace(/-/g, "")}T${pad(hour)}0000`;
}

// Strip CR and LF so a user-supplied value cannot inject new ICS properties
// (CRLF is the ICS line separator per RFC 5545).
function sanitizeICSLine(s: string): string {
  return s.replace(/[\r\n]/g, " ");
}

export function generateICS(event: ICSEventData): string {
  const sorted = [...event.hours].sort((a, b) => a - b);
  const startHour = sorted[0];
  const endHour = sorted[sorted.length - 1] + 1;
  const dtstamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

  // Strip \r from description separately — \n is kept so the existing \n→\\n
  // replacement works correctly.
  const safeDescription = event.description.replace(/\r/g, "").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//bookit//bookit//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.bookingId}@bookit`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toICSDateTime(event.date, startHour)}`,
    `DTEND:${toICSDateTime(event.date, endHour)}`,
    `SUMMARY:${sanitizeICSLine(event.summary)}`,
    `DESCRIPTION:${safeDescription}`,
    `LOCATION:${sanitizeICSLine(event.location)}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // iCalendar spec requires CRLF line endings
  return lines.join("\r\n");
}
