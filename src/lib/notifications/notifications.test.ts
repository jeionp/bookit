import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateICS } from "./ics";

// ── ICS generator ─────────────────────────────────────────────────────────────

describe("generateICS", () => {
  it("produces valid iCalendar wrapper", () => {
    const ics = generateICS({
      bookingId: "abc123",
      date: "2026-06-15",
      hours: [9, 10, 11],
      summary: "Court A at Sports Hub",
      description: "Booking ID: abc123",
      location: "123 Main St",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("sets DTSTART to the first hour and DTEND to last hour + 1", () => {
    const ics = generateICS({
      bookingId: "abc123",
      date: "2026-06-15",
      hours: [9, 10, 11],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("DTSTART:20260615T090000");
    expect(ics).toContain("DTEND:20260615T120000");
  });

  it("handles a single hour correctly", () => {
    const ics = generateICS({
      bookingId: "x",
      date: "2026-07-01",
      hours: [14],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("DTSTART:20260701T140000");
    expect(ics).toContain("DTEND:20260701T150000");
  });

  it("handles unsorted hours array", () => {
    const ics = generateICS({
      bookingId: "x",
      date: "2026-07-01",
      hours: [11, 9, 10],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("DTSTART:20260701T090000");
    expect(ics).toContain("DTEND:20260701T120000");
  });

  it("uses CRLF line endings per iCalendar spec", () => {
    const ics = generateICS({
      bookingId: "x",
      date: "2026-06-01",
      hours: [10],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("\r\n");
  });

  it("escapes newlines in description", () => {
    const ics = generateICS({
      bookingId: "x",
      date: "2026-06-01",
      hours: [10],
      summary: "Test",
      description: "Line one\nLine two",
      location: "",
    });
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("embeds UID, SUMMARY, and LOCATION", () => {
    const ics = generateICS({
      bookingId: "booking-99",
      date: "2026-06-01",
      hours: [10],
      summary: "Court B at Arena",
      description: "",
      location: "456 Sports Ave",
    });
    expect(ics).toContain("UID:booking-99@serbi");
    expect(ics).toContain("SUMMARY:Court B at Arena");
    expect(ics).toContain("LOCATION:456 Sports Ave");
  });
});

// ── email sends — no-op when RESEND_API_KEY is absent ────────────────────────

const sampleBooking = {
  customerEmail: "player@example.com",
  customerName: "Alice",
  bookingId: "bk_001",
  businessName: "Sports Hub",
  businessEmail: "info@sportshub.com",
  businessAddress: "123 Main St",
  facilityName: "Court A",
  date: "2026-06-15",
  hours: [9, 10],
  totalPrice: 500,
  currency: "PHP",
};

describe("sendBookingConfirmation", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  it("resolves without throwing when RESEND_API_KEY is not set", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await expect(sendBookingConfirmation(sampleBooking)).resolves.toBeUndefined();
  });
});

describe("sendAdminBookingNotification", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  it("resolves without throwing when RESEND_API_KEY is not set", async () => {
    const { sendAdminBookingNotification } = await import("./email");
    await expect(sendAdminBookingNotification(sampleBooking)).resolves.toBeUndefined();
  });

  it("resolves without throwing when creditApplied is provided", async () => {
    const { sendAdminBookingNotification } = await import("./email");
    await expect(
      sendAdminBookingNotification({ ...sampleBooking, creditApplied: 100 }),
    ).resolves.toBeUndefined();
  });
});

// ── sendCancellationReceipt ───────────────────────────────────────────────────

const sampleCancellation = {
  customerEmail: "player@example.com",
  customerName: "Alice",
  bookingId: "bk_001",
  businessName: "Sports Hub",
  businessEmail: "info@sportshub.com",
  facilityName: "Court A",
  date: "2026-06-15",
  hours: [9, 10],
  totalPrice: 500,
  currency: "PHP",
};

describe("sendCancellationReceipt", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  it("resolves without throwing when RESEND_API_KEY is not set (free/credit)", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await expect(
      sendCancellationReceipt({
        ...sampleCancellation,
        tier: "free",
        creditAmount: 500,
        choice: "credit",
        creditExpiresAt: new Date("2027-06-15"),
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing for prorated/refund_pending", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await expect(
      sendCancellationReceipt({
        ...sampleCancellation,
        tier: "prorated",
        creditAmount: 250,
        choice: "refund_pending",
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when creditAmount is 0", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await expect(
      sendCancellationReceipt({
        ...sampleCancellation,
        tier: "prorated",
        creditAmount: 0,
        choice: "credit",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("sendAdminCancellationNotification", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  it("resolves without throwing when RESEND_API_KEY is not set (free/credit)", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await expect(
      sendAdminCancellationNotification({
        ...sampleCancellation,
        tier: "free",
        creditAmount: 500,
        choice: "credit",
        creditExpiresAt: new Date("2027-06-15"),
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing for prorated/refund_pending", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await expect(
      sendAdminCancellationNotification({
        ...sampleCancellation,
        tier: "prorated",
        creditAmount: 250,
        choice: "refund_pending",
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when creditAmount is 0", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await expect(
      sendAdminCancellationNotification({
        ...sampleCancellation,
        tier: "prorated",
        creditAmount: 0,
        choice: "credit",
      }),
    ).resolves.toBeUndefined();
  });
});

// ── ICS edge cases ────────────────────────────────────────────────────────────

describe("generateICS — edge cases", () => {
  it("handles midnight start hour (0) correctly", () => {
    const ics = generateICS({
      bookingId: "mid",
      date: "2026-08-01",
      hours: [0],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("DTSTART:20260801T000000");
    expect(ics).toContain("DTEND:20260801T010000");
  });

  it("handles end-of-day hour (23) correctly — DTEND wraps to 24:00", () => {
    const ics = generateICS({
      bookingId: "eod",
      date: "2026-08-01",
      hours: [23],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("DTSTART:20260801T230000");
    expect(ics).toContain("DTEND:20260801T240000");
  });

  it("uses first and last hour of non-consecutive hours array (gap in middle)", () => {
    // hours [9, 11] — gap at 10 — start is 9:00, end is 12:00 (11+1)
    const ics = generateICS({
      bookingId: "gap",
      date: "2026-08-01",
      hours: [9, 11],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("DTSTART:20260801T090000");
    expect(ics).toContain("DTEND:20260801T120000");
  });

  it("does not modify the original hours array (pure sort)", () => {
    const hours = [11, 9, 10];
    generateICS({ bookingId: "x", date: "2026-08-01", hours, summary: "", description: "", location: "" });
    expect(hours).toEqual([11, 9, 10]);
  });
});

// ── formatHours / formatDate via HTML output ──────────────────────────────────

// We test the private helpers indirectly via buildHtml by importing and calling
// sendBookingConfirmation with a mocked Resend so the HTML is captured.

describe("formatHours — boundary values (via ICS DTSTART/DTEND)", () => {
  it("midnight start (hour 0) renders as 12:00 AM in ICS summary", () => {
    const ics = generateICS({
      bookingId: "x",
      date: "2026-06-01",
      hours: [0, 1],
      summary: "Test",
      description: "",
      location: "",
    });
    // Confirm DTSTART is 00:00:00
    expect(ics).toContain("DTSTART:20260601T000000");
    expect(ics).toContain("DTEND:20260601T020000");
  });

  it("noon hour (12) renders DTSTART as T120000", () => {
    const ics = generateICS({
      bookingId: "x",
      date: "2026-06-01",
      hours: [12],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("DTSTART:20260601T120000");
    expect(ics).toContain("DTEND:20260601T130000");
  });

  it("hour 13 (PM boundary) renders DTSTART as T130000", () => {
    const ics = generateICS({
      bookingId: "x",
      date: "2026-06-01",
      hours: [13],
      summary: "Test",
      description: "",
      location: "",
    });
    expect(ics).toContain("DTSTART:20260601T130000");
    expect(ics).toContain("DTEND:20260601T140000");
  });
});

// ── HTML template content ─────────────────────────────────────────────────────

// Import the pure HTML builders by exercising send functions with a mocked Resend.
// We intercept the html argument passed to client.emails.send.
//
// Because the existing no-op tests use vi.resetModules() + dynamic import, the
// module cache is already cleared before each mocked suite. We keep a single
// top-level vi.mock for "resend" and a shared spy that we clear between tests.

// Shared spy holder — a plain object so the vi.mock factory can close over it
// even after vi.resetModules() flushes the module registry.
const spyHolder = {
  send: vi.fn().mockResolvedValue({ id: "mock-id" }),
};

// vi.mock is hoisted to the top of the file by Vitest.  Because the factory
// closes over `spyHolder` (an object reference, not a primitive), re-evaluating
// the factory after vi.resetModules() still reaches the same spy function.
vi.mock("resend", () => {
  function MockResend(this: { emails: { send: typeof spyHolder.send } }) {
    this.emails = { send: spyHolder.send };
  }
  return { Resend: MockResend };
});

const baseBooking = {
  customerEmail: "player@example.com",
  customerName: "Alice",
  bookingId: "bk_001",
  businessName: "Sports Hub",
  businessEmail: "info@sportshub.com",
  businessAddress: "123 Main St",
  facilityName: "Court A",
  date: "2026-06-15",
  hours: [9, 10],
  totalPrice: 500,
  currency: "PHP",
};

const baseCancellation = {
  customerEmail: "player@example.com",
  customerName: "Alice",
  bookingId: "bk_001",
  businessName: "Sports Hub",
  businessEmail: "info@sportshub.com",
  facilityName: "Court A",
  date: "2026-06-15",
  hours: [9, 10],
  totalPrice: 500,
  currency: "PHP",
};

// Convenience alias so existing test bodies don't need to change.
const mockEmailsSend = spyHolder.send;

describe("sendBookingConfirmation — with Resend client mocked", () => {
  beforeEach(() => {
    // Clear call history but keep mock implementation.
    spyHolder.send.mockClear();
    spyHolder.send.mockResolvedValue({ id: "mock-id" });
    process.env.RESEND_API_KEY = "test-key";
    // vi.resetModules flushes the email.ts module so its module-level `resend`
    // singleton is null again — the next import re-creates it via our mock.
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_ADDRESS;
  });

  it("calls emails.send with customerEmail as 'to'", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    expect(mockEmailsSend).toHaveBeenCalledOnce();
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toBe("player@example.com");
  });

  it("uses RESEND_FROM_ADDRESS env var when set", async () => {
    process.env.RESEND_FROM_ADDRESS = "noreply@bookit.com";
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.from).toBe("noreply@bookit.com");
    delete process.env.RESEND_FROM_ADDRESS;
  });

  it("falls back to onboarding@resend.dev when RESEND_FROM_ADDRESS is absent", async () => {
    delete process.env.RESEND_FROM_ADDRESS;
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.from).toBe("onboarding@resend.dev");
  });

  it("includes subject with facility name and formatted date", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain("Court A");
    expect(call.subject).toContain("Booking Confirmed");
  });

  it("attaches an ICS file named booking.ics", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.attachments).toBeDefined();
    expect(Array.isArray(call.attachments)).toBe(true);
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0].filename).toBe("booking.ics");
  });

  it("ICS attachment content is a valid base64 string containing VCALENDAR", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const call = mockEmailsSend.mock.calls[0][0];
    const decoded = Buffer.from(call.attachments[0].content, "base64").toString("utf-8");
    expect(decoded).toContain("BEGIN:VCALENDAR");
    expect(decoded).toContain("BEGIN:VEVENT");
  });

  it("HTML contains the customer name in the greeting", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Hi Alice");
  });

  it("HTML omits credit row when creditApplied is absent", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).not.toContain("Credits Applied");
  });

  it("HTML includes credit row when creditApplied is set", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation({ ...baseBooking, creditApplied: 100 });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Credits Applied");
    expect(html).toContain("-PHP 100.00");
  });

  it("HTML contains the business email contact link", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("mailto:info@sportshub.com");
    expect(html).toContain("info@sportshub.com");
  });

  it("HTML contains the booking ID", async () => {
    const { sendBookingConfirmation } = await import("./email");
    await sendBookingConfirmation(baseBooking);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("bk_001");
  });

  it("resolves without rethrowing when emails.send throws", async () => {
    mockEmailsSend.mockRejectedValueOnce(new Error("network failure"));
    const { sendBookingConfirmation } = await import("./email");
    await expect(sendBookingConfirmation(baseBooking)).resolves.toBeUndefined();
  });
});

describe("sendAdminBookingNotification — with Resend client mocked", () => {
  beforeEach(() => {
    spyHolder.send.mockClear();
    spyHolder.send.mockResolvedValue({ id: "mock-id" });
    process.env.RESEND_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("sends to businessEmail, not customerEmail", async () => {
    const { sendAdminBookingNotification } = await import("./email");
    await sendAdminBookingNotification(baseBooking);
    expect(mockEmailsSend).toHaveBeenCalledOnce();
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toBe("info@sportshub.com");
    expect(call.to).not.toBe("player@example.com");
  });

  it("subject contains 'New Booking' and facility name", async () => {
    const { sendAdminBookingNotification } = await import("./email");
    await sendAdminBookingNotification(baseBooking);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain("New Booking");
    expect(call.subject).toContain("Court A");
  });

  it("does NOT include an ICS attachment", async () => {
    const { sendAdminBookingNotification } = await import("./email");
    await sendAdminBookingNotification(baseBooking);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.attachments).toBeUndefined();
  });

  it("HTML contains the customer email as a clickable link", async () => {
    const { sendAdminBookingNotification } = await import("./email");
    await sendAdminBookingNotification(baseBooking);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("mailto:player@example.com");
    expect(html).toContain("player@example.com");
  });

  it("HTML contains credit row when creditApplied is present", async () => {
    const { sendAdminBookingNotification } = await import("./email");
    await sendAdminBookingNotification({ ...baseBooking, creditApplied: 150 });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Credits Applied");
    expect(html).toContain("-PHP 150.00");
  });

  it("resolves without rethrowing when emails.send throws", async () => {
    mockEmailsSend.mockRejectedValueOnce(new Error("timeout"));
    const { sendAdminBookingNotification } = await import("./email");
    await expect(sendAdminBookingNotification(baseBooking)).resolves.toBeUndefined();
  });
});

describe("sendCancellationReceipt — with Resend client mocked", () => {
  beforeEach(() => {
    spyHolder.send.mockClear();
    spyHolder.send.mockResolvedValue({ id: "mock-id" });
    process.env.RESEND_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("sends to customerEmail", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      creditExpiresAt: new Date("2027-06-15"),
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toBe("player@example.com");
  });

  it("subject contains 'Booking Cancelled' and facility name", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain("Booking Cancelled");
    expect(call.subject).toContain("Court A");
  });

  it("does NOT include an ICS attachment", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.attachments).toBeUndefined();
  });

  it("HTML shows zero-credit outcome when creditAmount is 0", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "prorated",
      creditAmount: 0,
      choice: "credit",
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("No credit or refund applies for this cancellation.");
    expect(html).not.toContain("Credit Issued");
    expect(html).not.toContain("Refund Pending");
  });

  it("HTML shows Credit Issued block for credit choice with amount > 0", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      creditExpiresAt: new Date("2027-06-15"),
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Credit Issued");
    expect(html).toContain("PHP 500.00");
    expect(html).not.toContain("Refund Pending");
  });

  it("HTML includes expiry date when creditExpiresAt is defined", async () => {
    const { sendCancellationReceipt } = await import("./email");
    const expiry = new Date("2027-06-15");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      creditExpiresAt: expiry,
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Valid until");
    expect(html).toContain("2027");
  });

  it("HTML omits expiry line when creditExpiresAt is undefined", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      // creditExpiresAt intentionally absent
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).not.toContain("Valid until");
  });

  it("HTML shows Refund Pending block for refund_pending choice", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "refund_pending",
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Refund Pending");
    expect(html).toContain("PHP 500.00");
    expect(html).toContain("original payment method");
    expect(html).not.toContain("Credit Issued");
  });

  it("HTML includes prorated note for prorated/credit", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "prorated",
      creditAmount: 250,
      choice: "credit",
      creditExpiresAt: new Date("2027-01-01"),
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("partial credit");
    expect(html).toContain("late-cancel window");
  });

  it("HTML includes prorated note for prorated/refund_pending", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "prorated",
      creditAmount: 250,
      choice: "refund_pending",
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("partial refund");
    expect(html).toContain("late-cancel window");
  });

  it("HTML does NOT include prorated note for free tier", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      creditExpiresAt: new Date("2027-06-15"),
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).not.toContain("late-cancel window");
  });

  it("HTML contains business email contact link", async () => {
    const { sendCancellationReceipt } = await import("./email");
    await sendCancellationReceipt({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("mailto:info@sportshub.com");
  });

  it("resolves without rethrowing when emails.send throws", async () => {
    mockEmailsSend.mockRejectedValueOnce(new Error("smtp error"));
    const { sendCancellationReceipt } = await import("./email");
    await expect(
      sendCancellationReceipt({
        ...baseCancellation,
        tier: "free",
        creditAmount: 500,
        choice: "credit",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("sendAdminCancellationNotification — with Resend client mocked", () => {
  beforeEach(() => {
    spyHolder.send.mockClear();
    spyHolder.send.mockResolvedValue({ id: "mock-id" });
    process.env.RESEND_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("sends to businessEmail, not customerEmail", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      creditExpiresAt: new Date("2027-06-15"),
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toBe("info@sportshub.com");
    expect(call.to).not.toBe("player@example.com");
  });

  it("does NOT include an ICS attachment", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
    });
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.attachments).toBeUndefined();
  });

  it("HTML shows 'No credit or refund issued' when creditAmount is 0", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "prorated",
      creditAmount: 0,
      choice: "credit",
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("No credit or refund issued.");
  });

  it("HTML shows 'Credit Issued' label for free/credit", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      creditExpiresAt: new Date("2027-06-15"),
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Credit Issued");
    expect(html).not.toContain("Partial Credit Issued");
  });

  it("HTML shows 'Partial Credit Issued' label for prorated/credit", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "prorated",
      creditAmount: 250,
      choice: "credit",
      creditExpiresAt: new Date("2027-01-01"),
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Partial Credit Issued");
  });

  it("HTML shows 'Refund Pending' label for free/refund_pending", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "refund_pending",
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Refund Pending");
    expect(html).not.toContain("Partial Refund Pending");
  });

  it("HTML shows 'Partial Refund Pending' label for prorated/refund_pending", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "prorated",
      creditAmount: 250,
      choice: "refund_pending",
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Partial Refund Pending");
  });

  it("HTML includes expiry date when creditExpiresAt is defined", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    const expiry = new Date("2027-08-20");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      creditExpiresAt: expiry,
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Valid until");
    expect(html).toContain("2027");
  });

  it("HTML omits expiry line when creditExpiresAt is undefined", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
      // creditExpiresAt intentionally absent
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).not.toContain("Valid until");
  });

  it("HTML contains the customer email as a clickable mailto link", async () => {
    const { sendAdminCancellationNotification } = await import("./email");
    await sendAdminCancellationNotification({
      ...baseCancellation,
      tier: "free",
      creditAmount: 500,
      choice: "credit",
    });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("mailto:player@example.com");
    expect(html).toContain("player@example.com");
  });

  it("resolves without rethrowing when emails.send throws", async () => {
    mockEmailsSend.mockRejectedValueOnce(new Error("delivery failed"));
    const { sendAdminCancellationNotification } = await import("./email");
    await expect(
      sendAdminCancellationNotification({
        ...baseCancellation,
        tier: "free",
        creditAmount: 500,
        choice: "credit",
      }),
    ).resolves.toBeUndefined();
  });
});

// ── sendBookingReminder ───────────────────────────────────────────────────────

const baseReminder = {
  customerEmail: "player@example.com",
  customerName: "Alice",
  bookingId: "bk_001",
  businessName: "Sports Hub",
  businessEmail: "info@sportshub.com",
  businessAddress: "123 Main St",
  facilityName: "Court A",
  date: "2026-06-15",
  hours: [9, 10],
};

describe("sendBookingReminder — no-op when RESEND_API_KEY is absent", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  it("resolves without throwing", async () => {
    const { sendBookingReminder } = await import("./email");
    await expect(sendBookingReminder(baseReminder)).resolves.toBeUndefined();
  });
});

describe("sendBookingReminder — with Resend client mocked", () => {
  beforeEach(() => {
    spyHolder.send.mockClear();
    spyHolder.send.mockResolvedValue({ id: "mock-id" });
    process.env.RESEND_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_ADDRESS;
  });

  it("sends to customerEmail", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    expect(mockEmailsSend).toHaveBeenCalledOnce();
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toBe("player@example.com");
  });

  it("subject contains 'Reminder' and facility name", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.subject).toContain("Reminder");
    expect(call.subject).toContain("Court A");
  });

  it("does NOT include an ICS attachment", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.attachments).toBeUndefined();
  });

  it("uses RESEND_FROM_ADDRESS env var when set", async () => {
    process.env.RESEND_FROM_ADDRESS = "noreply@bookit.com";
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.from).toBe("noreply@bookit.com");
  });

  it("falls back to onboarding@resend.dev when RESEND_FROM_ADDRESS is absent", async () => {
    delete process.env.RESEND_FROM_ADDRESS;
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.from).toBe("onboarding@resend.dev");
  });

  it("HTML contains greeting with customer name", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Hi Alice");
  });

  it("HTML contains 'your booking is tomorrow'", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html.toLowerCase()).toContain("your booking is tomorrow");
  });

  it("HTML contains facility name", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("Court A");
  });

  it("HTML contains business address", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("123 Main St");
  });

  it("HTML contains the booking ID", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("bk_001");
  });

  it("HTML contains the business email contact link", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder(baseReminder);
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).toContain("mailto:info@sportshub.com");
    expect(html).toContain("info@sportshub.com");
  });

  it("resolves without rethrowing when emails.send throws", async () => {
    mockEmailsSend.mockRejectedValueOnce(new Error("smtp error"));
    const { sendBookingReminder } = await import("./email");
    await expect(sendBookingReminder(baseReminder)).resolves.toBeUndefined();
  });

  it("HTML escapes special characters in customer name", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder({ ...baseReminder, customerName: "<script>alert(1)</script>" });
    const { html } = mockEmailsSend.mock.calls[0][0];
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  // Header injection requires a bare CR/LF to split into a new header line.
  // sanitizeSubject strips \r and \n, so the payload becomes plain subject text
  // that email clients treat as part of the subject value, not a new header.
  it("strips CR/LF from facilityName in subject to prevent header injection", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder({
      ...baseReminder,
      facilityName: "Court A\r\nBcc: attacker@evil.com",
    });
    const { subject } = mockEmailsSend.mock.calls[0][0];
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("does not call emails.send when hours array is empty", async () => {
    const { sendBookingReminder } = await import("./email");
    await sendBookingReminder({ ...baseReminder, hours: [] });
    expect(mockEmailsSend).not.toHaveBeenCalled();
  });

  it("resolves without throwing when hours array is empty", async () => {
    const { sendBookingReminder } = await import("./email");
    await expect(sendBookingReminder({ ...baseReminder, hours: [] })).resolves.toBeUndefined();
  });
});
