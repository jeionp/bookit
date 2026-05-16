import { Resend } from "resend";
import { generateICS } from "./ics";

// Escapes HTML special characters so user-supplied strings cannot inject markup.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Strips CR/LF to prevent email header injection via subject line.
function sanitizeSubject(s: string): string {
  return s.replace(/[\r\n]/g, " ");
}

let resend: Resend | null = null;
function getResend(): Resend | null {
  if (resend) return resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resend = new Resend(key);
  return resend;
}

export interface BookingConfirmationData {
  customerEmail: string;
  customerName: string;
  bookingId: string;
  businessName: string;
  businessEmail: string;
  businessAddress: string;
  facilityName: string;
  date: string;       // YYYY-MM-DD
  hours: number[];
  totalPrice: number;
  currency: string;
  creditApplied?: number;
}

function formatHours(hours: number[]): string {
  const sorted = [...hours].sort((a, b) => a - b);
  const fmt = (h: number) => {
    const period = h < 12 ? "AM" : "PM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:00 ${period}`;
  };
  return `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1] + 1)}`;
}

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildHtml(data: BookingConfirmationData): string {
  const customerName    = escapeHtml(data.customerName);
  const businessName    = escapeHtml(data.businessName);
  const businessEmail   = escapeHtml(data.businessEmail);
  const businessAddress = escapeHtml(data.businessAddress);
  const facilityName    = escapeHtml(data.facilityName);
  const bookingId       = escapeHtml(data.bookingId);
  const timeRange = formatHours(data.hours);
  const formattedDate = formatDate(data.date);
  const priceStr = `${escapeHtml(data.currency)} ${data.totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const creditRow = data.creditApplied
    ? `<tr>
        <td style="padding:4px 0;color:#6b7280;font-size:14px;">Credits Applied</td>
        <td style="padding:4px 0;text-align:right;color:#16a34a;font-size:14px;">-${escapeHtml(data.currency)} ${data.creditApplied.toFixed(2)}</td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <tr>
          <td style="background:#111827;padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">${businessName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;">Booking Confirmed ✓</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${customerName}, your booking is confirmed. See you there!</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;margin-bottom:20px;">
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">What</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${facilityName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">When</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${formattedDate}</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#111827;">${timeRange}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Where</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${businessAddress}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:16px;margin-bottom:28px;">
              ${creditRow}
              <tr>
                <td style="padding-top:${data.creditApplied ? "12px" : "0"};font-size:15px;font-weight:600;color:#111827;${data.creditApplied ? "border-top:1px solid #e5e7eb;" : ""}">Total Paid</td>
                <td style="padding-top:${data.creditApplied ? "12px" : "0"};text-align:right;font-size:15px;font-weight:600;color:#111827;${data.creditApplied ? "border-top:1px solid #e5e7eb;" : ""}">${priceStr}</td>
              </tr>
            </table>

            <p style="margin:0 0 28px;font-size:12px;color:#9ca3af;">
              Booking ID: <span style="font-family:monospace;">${bookingId}</span>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              Questions? Email us at <a href="mailto:${businessEmail}" style="color:#6b7280;text-decoration:underline;">${businessEmail}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAdminHtml(data: BookingConfirmationData): string {
  const customerName  = escapeHtml(data.customerName);
  const customerEmail = escapeHtml(data.customerEmail);
  const businessName  = escapeHtml(data.businessName);
  const businessEmail = escapeHtml(data.businessEmail);
  const facilityName  = escapeHtml(data.facilityName);
  const bookingId     = escapeHtml(data.bookingId);
  const timeRange = formatHours(data.hours);
  const formattedDate = formatDate(data.date);
  const priceStr = `${escapeHtml(data.currency)} ${data.totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const creditRow = data.creditApplied
    ? `<tr>
        <td style="padding:4px 0;color:#6b7280;font-size:14px;">Credits Applied</td>
        <td style="padding:4px 0;text-align:right;color:#16a34a;font-size:14px;">-${escapeHtml(data.currency)} ${data.creditApplied.toFixed(2)}</td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <tr>
          <td style="background:#1e3a5f;padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:12px;color:#93c5fd;letter-spacing:0.08em;text-transform:uppercase;">${businessName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;">New Booking Received</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;margin-bottom:20px;">
              <tr>
                <td style="padding-bottom:16px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Customer</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${customerName}</p>
                  <p style="margin:2px 0 0;font-size:14px;color:#6b7280;">
                    <a href="mailto:${customerEmail}" style="color:#2563eb;text-decoration:none;">${customerEmail}</a>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:16px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Facility</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${facilityName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:16px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Date &amp; Time</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${formattedDate}</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#111827;">${timeRange}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:16px;margin-bottom:28px;">
              ${creditRow}
              <tr>
                <td style="padding-top:${data.creditApplied ? "12px" : "0"};font-size:15px;font-weight:600;color:#111827;${data.creditApplied ? "border-top:1px solid #e5e7eb;" : ""}">Total</td>
                <td style="padding-top:${data.creditApplied ? "12px" : "0"};text-align:right;font-size:15px;font-weight:600;color:#111827;${data.creditApplied ? "border-top:1px solid #e5e7eb;" : ""}">${priceStr}</td>
              </tr>
            </table>

            <p style="margin:0 0 28px;font-size:12px;color:#9ca3af;">
              Booking ID: <span style="font-family:monospace;">${bookingId}</span>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This notification was sent to <a href="mailto:${businessEmail}" style="color:#6b7280;text-decoration:underline;">${businessEmail}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface CancellationReceiptData {
  customerEmail: string;
  customerName: string;
  bookingId: string;
  businessName: string;
  businessEmail: string;
  facilityName: string;
  date: string;         // YYYY-MM-DD
  hours: number[];
  totalPrice: number;
  currency: string;
  tier: "free" | "prorated";
  creditAmount: number;
  choice: "credit" | "refund_pending";
  creditExpiresAt?: Date; // present when choice === "credit" && creditAmount > 0
}

function buildCancellationHtml(data: CancellationReceiptData): string {
  const customerName    = escapeHtml(data.customerName);
  const businessName    = escapeHtml(data.businessName);
  const businessEmail   = escapeHtml(data.businessEmail);
  const facilityName    = escapeHtml(data.facilityName);
  const bookingId       = escapeHtml(data.bookingId);
  const currency        = escapeHtml(data.currency);
  const timeRange = formatHours(data.hours);
  const formattedDate = formatDate(data.date);
  const totalStr = `${currency} ${data.totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  let outcomeHtml: string;
  if (data.creditAmount === 0) {
    outcomeHtml = `<p style="margin:0;font-size:15px;color:#374151;">No credit or refund applies for this cancellation.</p>`;
  } else if (data.choice === "credit") {
    const amountStr = `${currency} ${data.creditAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const expiryStr = data.creditExpiresAt
      ? data.creditExpiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "";
    const proratedNote = data.tier === "prorated"
      ? `<p style="margin:8px 0 0;font-size:13px;color:#9ca3af;">A partial credit was issued because the booking was cancelled within the late-cancel window.</p>`
      : "";
    outcomeHtml = `
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Credit Issued</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:#16a34a;">${amountStr}</p>
      ${expiryStr ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Valid until ${expiryStr}</p>` : ""}
      ${proratedNote}`;
  } else {
    const amountStr = `${currency} ${data.creditAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const proratedNote = data.tier === "prorated"
      ? `<p style="margin:8px 0 0;font-size:13px;color:#9ca3af;">A partial refund was applied because the booking was cancelled within the late-cancel window.</p>`
      : "";
    outcomeHtml = `
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Refund Pending</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:#2563eb;">${amountStr}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Your refund will be processed to your original payment method.</p>
      ${proratedNote}`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <tr>
          <td style="background:#374151;padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">${businessName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;">Booking Cancelled</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${customerName}, your booking has been cancelled.</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;margin-bottom:20px;">
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">What</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${facilityName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Was Scheduled For</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${formattedDate}</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#111827;">${timeRange}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Original Total</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${totalStr}</p>
                </td>
              </tr>
            </table>

            <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:28px;">
              ${outcomeHtml}
            </div>

            <p style="margin:0 0 28px;font-size:12px;color:#9ca3af;">
              Booking ID: <span style="font-family:monospace;">${bookingId}</span>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              Questions? Email us at <a href="mailto:${businessEmail}" style="color:#6b7280;text-decoration:underline;">${businessEmail}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendCancellationReceipt(data: CancellationReceiptData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping cancellation receipt email");
    return;
  }

  const from = process.env.RESEND_FROM_ADDRESS ?? "onboarding@resend.dev";

  try {
    await client.emails.send({
      from,
      to: data.customerEmail,
      subject: sanitizeSubject(`Booking Cancelled – ${data.facilityName} on ${formatDate(data.date)}`),
      html: buildCancellationHtml(data),
    });
  } catch (err) {
    console.error("[notifications] failed to send cancellation receipt:", err);
  }
}

function buildAdminCancellationHtml(data: CancellationReceiptData): string {
  const customerName  = escapeHtml(data.customerName);
  const customerEmail = escapeHtml(data.customerEmail);
  const businessName  = escapeHtml(data.businessName);
  const businessEmail = escapeHtml(data.businessEmail);
  const facilityName  = escapeHtml(data.facilityName);
  const bookingId     = escapeHtml(data.bookingId);
  const currency      = escapeHtml(data.currency);
  const timeRange = formatHours(data.hours);
  const formattedDate = formatDate(data.date);
  const totalStr = `${currency} ${data.totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  let outcomeHtml: string;
  if (data.creditAmount === 0) {
    outcomeHtml = `<p style="margin:0;font-size:14px;color:#374151;">No credit or refund issued.</p>`;
  } else if (data.choice === "credit") {
    const amountStr = `${currency} ${data.creditAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const expiryStr = data.creditExpiresAt
      ? data.creditExpiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "";
    outcomeHtml = `
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">${data.tier === "prorated" ? "Partial Credit Issued" : "Credit Issued"}</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#16a34a;">${amountStr}</p>
      ${expiryStr ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Valid until ${expiryStr}</p>` : ""}`;
  } else {
    const amountStr = `${currency} ${data.creditAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    outcomeHtml = `
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">${data.tier === "prorated" ? "Partial Refund Pending" : "Refund Pending"}</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#2563eb;">${amountStr}</p>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <tr>
          <td style="background:#7f1d1d;padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:12px;color:#fca5a5;letter-spacing:0.08em;text-transform:uppercase;">${businessName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;">Booking Cancelled</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;margin-bottom:20px;">
              <tr>
                <td style="padding-bottom:16px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Customer</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${customerName}</p>
                  <p style="margin:2px 0 0;font-size:14px;color:#6b7280;">
                    <a href="mailto:${customerEmail}" style="color:#2563eb;text-decoration:none;">${customerEmail}</a>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:16px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Facility</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${facilityName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:16px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Was Scheduled For</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${formattedDate}</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#111827;">${timeRange}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Original Total</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${totalStr}</p>
                </td>
              </tr>
            </table>

            <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:28px;">
              ${outcomeHtml}
            </div>

            <p style="margin:0 0 28px;font-size:12px;color:#9ca3af;">
              Booking ID: <span style="font-family:monospace;">${bookingId}</span>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              This notification was sent to <a href="mailto:${businessEmail}" style="color:#6b7280;text-decoration:underline;">${businessEmail}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendAdminCancellationNotification(data: CancellationReceiptData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping admin cancellation notification");
    return;
  }

  const from = process.env.RESEND_FROM_ADDRESS ?? "onboarding@resend.dev";

  try {
    await client.emails.send({
      from,
      to: data.businessEmail,
      subject: sanitizeSubject(`Booking Cancelled – ${data.facilityName} on ${formatDate(data.date)}`),
      html: buildAdminCancellationHtml(data),
    });
  } catch (err) {
    console.error("[notifications] failed to send admin cancellation notification:", err);
  }
}

export async function sendAdminBookingNotification(data: BookingConfirmationData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping admin notification email");
    return;
  }

  const from = process.env.RESEND_FROM_ADDRESS ?? "onboarding@resend.dev";

  try {
    await client.emails.send({
      from,
      to: data.businessEmail,
      subject: sanitizeSubject(`New Booking – ${data.facilityName} on ${formatDate(data.date)}`),
      html: buildAdminHtml(data),
    });
  } catch (err) {
    console.error("[notifications] failed to send admin notification email:", err);
  }
}

export interface ReminderData {
  customerEmail: string;
  customerName: string;
  bookingId: string;
  businessName: string;
  businessEmail: string;
  businessAddress: string;
  facilityName: string;
  date: string;   // YYYY-MM-DD
  hours: number[];
}

function buildReminderHtml(data: ReminderData): string {
  const customerName    = escapeHtml(data.customerName);
  const businessName    = escapeHtml(data.businessName);
  const businessEmail   = escapeHtml(data.businessEmail);
  const businessAddress = escapeHtml(data.businessAddress);
  const facilityName    = escapeHtml(data.facilityName);
  const bookingId       = escapeHtml(data.bookingId);
  const timeRange = formatHours(data.hours);
  const formattedDate = formatDate(data.date);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <tr>
          <td style="background:#0f766e;padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:12px;color:#99f6e4;letter-spacing:0.08em;text-transform:uppercase;">${businessName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;">Your booking is tomorrow</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${customerName}, just a reminder about your upcoming booking!</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;margin-bottom:28px;">
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">What</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${facilityName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">When</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${formattedDate}</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#111827;">${timeRange}</p>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">Where</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${businessAddress}</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 28px;font-size:12px;color:#9ca3af;">
              Booking ID: <span style="font-family:monospace;">${bookingId}</span>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              Questions? Email us at <a href="mailto:${businessEmail}" style="color:#6b7280;text-decoration:underline;">${businessEmail}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendBookingReminder(data: ReminderData): Promise<void> {
  if (!data.hours || data.hours.length === 0) {
    console.warn("[notifications] sendBookingReminder called with empty hours — skipping");
    return;
  }

  const client = getResend();
  if (!client) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping reminder email");
    return;
  }

  const from = process.env.RESEND_FROM_ADDRESS ?? "onboarding@resend.dev";

  try {
    await client.emails.send({
      from,
      to: data.customerEmail,
      subject: sanitizeSubject(`Reminder: ${data.facilityName} tomorrow at ${formatHours(data.hours)}`),
      html: buildReminderHtml(data),
    });
  } catch (err) {
    console.error("[notifications] failed to send reminder email:", err);
  }
}

export interface LowBalanceWarningData {
  businessEmail: string;
  businessName: string;
  businessSlug: string;
  balance: number; // new balance after the triggering booking
}

function buildLowBalanceHtml(data: LowBalanceWarningData): string {
  const businessName  = escapeHtml(data.businessName);
  const businessEmail = escapeHtml(data.businessEmail);
  const { balance } = data;

  const isCritical = balance <= 0;
  const headerBg  = isCritical ? "#991b1b" : "#92400e";
  const headerSub = isCritical ? "#fca5a5" : "#fde68a";
  const message   = isCritical
    ? `Your bookit wallet balance is now <strong>${balance}</strong>. Online bookings will be suspended when the balance reaches <strong>−5</strong>. Top up now to keep your storefront active.`
    : `Your bookit wallet balance is low at <strong>${balance}</strong>. Please top up before you run out.`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:${headerBg};padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:12px;color:${headerSub};letter-spacing:0.08em;text-transform:uppercase;">${businessName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;">⚠ Low Wallet Balance</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0 0 24px;font-size:15px;color:#374151;">${message}</p>
            <p style="margin:0 0 28px;font-size:14px;color:#6b7280;">Log in to your bookit admin dashboard to top up your wallet and avoid service interruption.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              Sent to <a href="mailto:${businessEmail}" style="color:#6b7280;text-decoration:underline;">${businessEmail}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendLowBalanceWarning(data: LowBalanceWarningData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping low balance warning");
    return;
  }

  const from = process.env.RESEND_FROM_ADDRESS ?? "onboarding@resend.dev";

  try {
    await client.emails.send({
      from,
      to: data.businessEmail,
      subject: sanitizeSubject(`Action required: low wallet balance for ${data.businessName}`),
      html: buildLowBalanceHtml(data),
    });
  } catch (err) {
    console.error("[notifications] failed to send low balance warning:", err);
  }
}

export interface PaymentRejectedData {
  customerEmail: string;
  customerName: string;
  bookingId: string;
  businessName: string;
  facilityName: string;
  date: string;
  hours: number[];
  totalPrice: number;
  currency: string;
  submittedAmount: number | null;
}

function buildPaymentRejectedHtml(data: PaymentRejectedData): string {
  const customerName  = escapeHtml(data.customerName);
  const businessName  = escapeHtml(data.businessName);
  const facilityName  = escapeHtml(data.facilityName);
  const bookingId     = escapeHtml(data.bookingId);
  const currency      = escapeHtml(data.currency);
  const timeRange     = formatHours(data.hours);
  const formattedDate = formatDate(data.date);
  const expectedStr   = `${currency} ${data.totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const submittedStr  = data.submittedAmount !== null
    ? `${currency} ${data.submittedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
    : "Not detected";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:#7f1d1d;padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:12px;color:#fca5a5;letter-spacing:0.08em;text-transform:uppercase;">${businessName}</p>
            <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;">Payment Proof Rejected</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${customerName}, unfortunately we could not verify your payment proof.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;margin-bottom:20px;">
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">What</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${facilityName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;">When</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${formattedDate}</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#111827;">${timeRange}</p>
                </td>
              </tr>
            </table>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin-bottom:28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:14px;color:#6b7280;">Amount Expected</td>
                  <td style="text-align:right;font-size:14px;font-weight:600;color:#111827;">${expectedStr}</td>
                </tr>
                <tr>
                  <td style="padding-top:8px;font-size:14px;color:#6b7280;">Amount Detected</td>
                  <td style="padding-top:8px;text-align:right;font-size:14px;font-weight:600;color:#dc2626;">${submittedStr}</td>
                </tr>
              </table>
            </div>
            <p style="margin:0 0 24px;font-size:14px;color:#374151;">Please resubmit a clear, complete screenshot of your GCash receipt showing the correct amount.</p>
            <p style="margin:0 0 28px;font-size:12px;color:#9ca3af;">Booking ID: <span style="font-family:monospace;">${bookingId}</span></p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Reply to this email if you need assistance.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendPaymentRejected(data: PaymentRejectedData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping payment rejected email");
    return;
  }

  const from = process.env.RESEND_FROM_ADDRESS ?? "onboarding@resend.dev";

  try {
    await client.emails.send({
      from,
      to: data.customerEmail,
      subject: sanitizeSubject(`Payment Proof Not Verified – ${data.facilityName}`),
      html: buildPaymentRejectedHtml(data),
    });
  } catch (err) {
    console.error("[notifications] failed to send payment rejected email:", err);
  }
}

export async function sendBookingConfirmation(data: BookingConfirmationData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping confirmation email");
    return;
  }

  const from = process.env.RESEND_FROM_ADDRESS ?? "onboarding@resend.dev";

  const icsContent = generateICS({
    bookingId: data.bookingId,
    date: data.date,
    hours: data.hours,
    summary: `${data.facilityName} at ${data.businessName}`,
    description: [
      `Booking ID: ${data.bookingId}`,
      `Date: ${formatDate(data.date)}`,
      `Time: ${formatHours(data.hours)}`,
      `Total: ${data.currency} ${data.totalPrice}`,
    ].join("\n"),
    location: data.businessAddress,
  });

  try {
    await client.emails.send({
      from,
      to: data.customerEmail,
      subject: sanitizeSubject(`Booking Confirmed – ${data.facilityName} on ${formatDate(data.date)}`),
      html: buildHtml(data),
      attachments: [
        {
          filename: "booking.ics",
          content: Buffer.from(icsContent).toString("base64"),
        },
      ],
    });
  } catch (err) {
    // Non-blocking — booking is already written; log and move on
    console.error("[notifications] failed to send confirmation email:", err);
  }
}
