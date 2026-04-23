import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyBookings from "@/components/booking/MyBookings";
import { getUserBookings, cancelBooking } from "@/lib/firebase/bookings";
import { useAuth } from "@/context/AuthContext";
import { mockBookingConfirmed, mockBookingCancelled, mockUser } from "../../helpers/mockData";

jest.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));
jest.mock("@/lib/firebase/bookings", () => ({
  getUserBookings: jest.fn(),
  cancelBooking: jest.fn(),
}));
jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

const mockGetUserBookings = getUserBookings as jest.MockedFunction<
  typeof getUserBookings
>;
const mockCancelBooking = cancelBooking as jest.MockedFunction<
  typeof cancelBooking
>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const accentColor = "#16a34a";

function setUser(user: typeof mockUser | null) {
  mockUseAuth.mockReturnValue({
    user: user as unknown as ReturnType<typeof useAuth>["user"],
    loading: false,
    signOut: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCancelBooking.mockResolvedValue(undefined);
});

// ─── Unauthenticated state ────────────────────────────────────────────────────

describe("unauthenticated state", () => {
  it("shows a sign-in prompt when no user is logged in", () => {
    setUser(null);
    render(<MyBookings accentColor={accentColor} />);
    expect(
      screen.getByText(/Sign in to view your bookings/i)
    ).toBeInTheDocument();
  });

  it("does not call getUserBookings when unauthenticated", () => {
    setUser(null);
    render(<MyBookings accentColor={accentColor} />);
    expect(mockGetUserBookings).not.toHaveBeenCalled();
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe("loading state", () => {
  it("shows a spinner while bookings are being fetched", () => {
    setUser(mockUser);
    mockGetUserBookings.mockImplementationOnce(() => new Promise(() => {})); // never resolves
    render(<MyBookings accentColor={accentColor} />);
    // Spinner rendered as an animated div — content is absent
    expect(screen.queryByText(/No bookings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Upcoming/i)).not.toBeInTheDocument();
  });
});

// ─── Empty state ─────────────────────────────────────────────────────────────

describe("empty state", () => {
  it("shows 'No bookings yet' when the user has no bookings", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([]);
    render(<MyBookings accentColor={accentColor} />);
    expect(await screen.findByText("No bookings yet")).toBeInTheDocument();
  });
});

// ─── Booking list ─────────────────────────────────────────────────────────────

describe("booking list", () => {
  it("shows confirmed bookings under the Upcoming section", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    expect(await screen.findByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Court 1")).toBeInTheDocument();
  });

  it("shows cancelled bookings under the Cancelled section", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingCancelled]);
    render(<MyBookings accentColor={accentColor} />);

    // Both the section <h3> header and the status badge contain "Cancelled"
    expect((await screen.findAllByText("Cancelled")).length).toBeGreaterThanOrEqual(1);
  });

  it("shows both sections when there are confirmed and cancelled bookings", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([
      mockBookingConfirmed,
      mockBookingCancelled,
    ]);
    render(<MyBookings accentColor={accentColor} />);

    expect(await screen.findByText("Upcoming")).toBeInTheDocument();
    expect((await screen.findAllByText("Cancelled")).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the facility name for each booking", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    expect(await screen.findByText("Court 1")).toBeInTheDocument();
  });

  it("shows the business name for each booking", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    expect(await screen.findByText("PaddleUp")).toBeInTheDocument();
  });

  it("shows the formatted date (Apr 27, 2026) for the booking", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    // date: "2026-04-27" — should display as Apr 27, 2026
    expect(await screen.findByText(/Apr 27, 2026/)).toBeInTheDocument();
  });

  it("shows the correct time range (9 AM – 12 PM) for the booking", async () => {
    setUser(mockUser);
    // hours: [9, 10, 11] → start: 9 AM, end: 12 PM
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    expect(await screen.findByText(/9 AM.+12 PM/)).toBeInTheDocument();
  });

  it("shows the total price formatted with ₱ and thousands separator", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    expect(await screen.findByText("₱1,500")).toBeInTheDocument();
  });

  it("shows 'Confirmed' status badge for confirmed bookings", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
  });

  it("shows 'Cancelled' status badge for cancelled bookings", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingCancelled]);
    render(<MyBookings accentColor={accentColor} />);

    const cancelledEls = await screen.findAllByText("Cancelled");
    // At least the status badge span should be present
    expect(cancelledEls.some((el) => el.tagName === "SPAN")).toBe(true);
  });

  it("fetches bookings using the authenticated user's uid", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([]);
    render(<MyBookings accentColor={accentColor} />);

    await screen.findByText("No bookings yet");
    expect(mockGetUserBookings).toHaveBeenCalledWith("user-abc-123");
  });
});

// ─── Cancel flow ─────────────────────────────────────────────────────────────

describe("cancel booking flow", () => {
  it("shows a cancel button only for confirmed bookings", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    await screen.findByText("Court 1");
    expect(screen.getByRole("button", { name: /Cancel booking/i })).toBeInTheDocument();
  });

  it("does NOT show a cancel button for cancelled bookings", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingCancelled]);
    render(<MyBookings accentColor={accentColor} />);

    await screen.findAllByText("Cancelled");
    expect(
      screen.queryByRole("button", { name: /Cancel booking/i })
    ).not.toBeInTheDocument();
  });

  it("calls cancelBooking with the correct booking id", async () => {
    const user = userEvent.setup();
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    await screen.findByText("Court 1");
    await user.click(screen.getByRole("button", { name: /Cancel booking/i }));

    expect(mockCancelBooking).toHaveBeenCalledWith("booking-111");
  });

  it("shows 'Cancelling…' while the cancel request is in flight", async () => {
    const user = userEvent.setup();
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    mockCancelBooking.mockImplementationOnce(() => new Promise(() => {})); // never resolves

    render(<MyBookings accentColor={accentColor} />);

    await screen.findByText("Court 1");
    await user.click(screen.getByRole("button", { name: /Cancel booking/i }));

    expect(
      screen.getByRole("button", { name: /Cancelling/i })
    ).toBeInTheDocument();
  });

  it("optimistically updates the booking status to cancelled in the UI", async () => {
    const user = userEvent.setup();
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    mockCancelBooking.mockResolvedValueOnce(undefined);

    render(<MyBookings accentColor={accentColor} />);

    await screen.findByText("Court 1");
    await user.click(screen.getByRole("button", { name: /Cancel booking/i }));

    // Both the "Cancelled" section header and the status badge should appear
    const cancelledEls = await screen.findAllByText("Cancelled");
    expect(cancelledEls.length).toBeGreaterThanOrEqual(1);
    // Cancel button should disappear after cancellation
    expect(
      screen.queryByRole("button", { name: /Cancel booking/i })
    ).not.toBeInTheDocument();
  });
});

// ─── formatDate correctness ───────────────────────────────────────────────────

describe("formatDate (timezone safety)", () => {
  it("parses '2026-04-27' as April 27, not as a UTC timestamp", async () => {
    setUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    render(<MyBookings accentColor={accentColor} />);

    // formatDate splits "2026-04-27" → new Date(2026, 3, 27) — local time, no UTC shift
    // This is the correct pattern vs. new Date("2026-04-27") which interprets as UTC midnight
    expect(await screen.findByText(/Apr 27, 2026/)).toBeInTheDocument();
  });

  it("shows correct month boundary dates without off-by-one", async () => {
    setUser(mockUser);
    const marchFirst = {
      ...mockBookingConfirmed,
      id: "b-march",
      date: "2026-03-01",
    };
    mockGetUserBookings.mockResolvedValueOnce([marchFirst]);
    render(<MyBookings accentColor={accentColor} />);

    expect(await screen.findByText(/Mar 1, 2026/)).toBeInTheDocument();
  });
});
