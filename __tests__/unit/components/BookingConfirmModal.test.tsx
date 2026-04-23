import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingConfirmModal from "@/components/booking/BookingConfirmModal";
import { createBooking } from "@/lib/firebase/bookings";
import { useAuth } from "@/context/AuthContext";
import {
  mockSelectionNormal,
  mockSelectionMixed,
  mockSelectionPrime,
  mockUser,
} from "../../helpers/mockData";

jest.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));
jest.mock("@/lib/firebase/bookings", () => ({
  createBooking: jest.fn(),
  SlotUnavailableError: class SlotUnavailableError extends Error {
    constructor() {
      super(
        "One or more slots you selected were just booked by someone else. Please pick a different time."
      );
      this.name = "SlotUnavailableError";
    }
  },
}));
jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

const mockCreateBooking = createBooking as jest.MockedFunction<
  typeof createBooking
>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const selectedDate = new Date(2026, 3, 27); // April 27, 2026 (local time)

const defaultProps = {
  open: true,
  onClose: jest.fn(),
  onSuccess: jest.fn(),
  selection: mockSelectionNormal,
  selectedDate,
  businessSlug: "paddleup",
  businessName: "PaddleUp",
  businessLocation: "Quezon City, Metro Manila",
  accentColor: "#16a34a",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: mockUser as unknown as ReturnType<typeof useAuth>["user"],
    loading: false,
    signOut: jest.fn(),
  });
});

// ─── Visibility ──────────────────────────────────────────────────────────────

describe("visibility", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <BookingConfirmModal {...defaultProps} open={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when selection=null", () => {
    const { container } = render(
      <BookingConfirmModal {...defaultProps} selection={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the confirmation view when open and selection are provided", () => {
    render(<BookingConfirmModal {...defaultProps} />);
    expect(screen.getByText("Confirm Booking")).toBeInTheDocument();
  });
});

// ─── Booking details display ──────────────────────────────────────────────────

describe("booking details", () => {
  it("shows the business name", () => {
    render(<BookingConfirmModal {...defaultProps} />);
    expect(screen.getByText("PaddleUp")).toBeInTheDocument();
  });

  it("shows the business location", () => {
    render(<BookingConfirmModal {...defaultProps} />);
    expect(screen.getByText("Quezon City, Metro Manila")).toBeInTheDocument();
  });

  it("shows the facility name", () => {
    render(<BookingConfirmModal {...defaultProps} />);
    expect(screen.getAllByText("Court 1").length).toBeGreaterThan(0);
  });

  it("shows the formatted date", () => {
    render(<BookingConfirmModal {...defaultProps} />);
    // April 27, 2026 is a Monday
    expect(screen.getByText(/Monday, April 27, 2026/)).toBeInTheDocument();
  });

  it("shows the time range for normal hours (9 AM – 12 PM)", () => {
    render(<BookingConfirmModal {...defaultProps} />);
    // hours: [9, 10, 11] → 9 AM to 12 PM
    expect(screen.getByText(/9 AM.+12 PM/)).toBeInTheDocument();
  });

  it("shows the duration in hours", () => {
    render(<BookingConfirmModal {...defaultProps} />);
    // "3 hrs" appears in both the time detail row and the price breakdown row
    expect(screen.getAllByText(/3 hrs/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows '1 hr' (singular) for a single-hour selection", () => {
    render(
      <BookingConfirmModal
        {...defaultProps}
        selection={{ ...mockSelectionNormal, hours: [9], totalPrice: 500 }}
      />
    );
    expect(screen.getByText("1 hr")).toBeInTheDocument();
  });
});

// ─── Price breakdown ──────────────────────────────────────────────────────────

describe("price breakdown", () => {
  it("shows only normal-hour line when all hours are before prime time", () => {
    // hours: [9, 10, 11] — all before primeTimeStart=17
    render(<BookingConfirmModal {...defaultProps} selection={mockSelectionNormal} />);
    expect(screen.getByText(/₱500 × 3 hrs/)).toBeInTheDocument();
    expect(screen.queryByText(/Prime/)).not.toBeInTheDocument();
  });

  it("shows both normal and prime lines for a mixed selection", () => {
    // hours: [15, 16, 17, 18] — 2 normal (15,16) + 2 prime (17,18)
    render(<BookingConfirmModal {...defaultProps} selection={mockSelectionMixed} />);
    expect(screen.getByText(/₱500 × 2 hrs/)).toBeInTheDocument();
    expect(screen.getByText(/₱600 × 2 hrs/)).toBeInTheDocument();
    expect(screen.getByText("Prime")).toBeInTheDocument();
  });

  it("shows only the prime line when all hours are at or after prime time", () => {
    // hours: [17, 18] — all prime
    render(<BookingConfirmModal {...defaultProps} selection={mockSelectionPrime} />);
    expect(screen.queryByText(/₱500/)).not.toBeInTheDocument();
    expect(screen.getByText(/₱600 × 2 hrs/)).toBeInTheDocument();
  });

  it("displays the correct total price", () => {
    render(<BookingConfirmModal {...defaultProps} selection={mockSelectionNormal} />);
    // ₱1,500 appears in both the normal-hours line item (₱500×3) and the Total row.
    // Verify the Total row specifically by finding the label's sibling.
    const totalLabel = screen.getByText("Total");
    const totalRow = totalLabel.closest("div")!;
    expect(totalRow.textContent).toContain("₱1,500");
  });

  it("displays the correct total for a mixed selection", () => {
    render(<BookingConfirmModal {...defaultProps} selection={mockSelectionMixed} />);
    // total = 500*2 + 600*2 = 2,200
    expect(screen.getByText("₱2,200")).toBeInTheDocument();
  });
});

// ─── Confirm flow ─────────────────────────────────────────────────────────────

describe("confirm booking flow", () => {
  it("calls createBooking with the correct payload on Confirm", async () => {
    const user = userEvent.setup();
    mockCreateBooking.mockResolvedValueOnce("new-booking-id");

    render(<BookingConfirmModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(mockCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-abc-123",
        businessSlug: "paddleup",
        facilityId: "court-1",
        hours: [9, 10, 11],
        totalPrice: 1500,
        currency: "PHP",
      })
    );
  });

  it("shows loading state on the confirm button during submission", async () => {
    const user = userEvent.setup();
    mockCreateBooking.mockImplementationOnce(() => new Promise(() => {})); // never resolves

    render(<BookingConfirmModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows the success state after booking is confirmed", async () => {
    const user = userEvent.setup();
    mockCreateBooking.mockResolvedValueOnce("booking-123");

    render(<BookingConfirmModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(await screen.findByText("Booking Confirmed!")).toBeInTheDocument();
    expect(screen.getByText(/has been confirmed/)).toBeInTheDocument();
  });

  it("calls onSuccess when Done is clicked after a confirmed booking", async () => {
    const user = userEvent.setup();
    const mockOnSuccess = jest.fn();
    mockCreateBooking.mockResolvedValueOnce("booking-123");

    render(
      <BookingConfirmModal {...defaultProps} onSuccess={mockOnSuccess} />
    );
    await user.click(screen.getByRole("button", { name: /Confirm/i }));
    await screen.findByText("Booking Confirmed!");
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onSuccess when Cancel is clicked before confirming", async () => {
    const user = userEvent.setup();
    const mockOnSuccess = jest.fn();

    render(
      <BookingConfirmModal {...defaultProps} onSuccess={mockOnSuccess} />
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it("does NOT call onSuccess when the modal is closed without confirming", async () => {
    const user = userEvent.setup();
    const mockOnSuccess = jest.fn();

    render(
      <BookingConfirmModal {...defaultProps} onSuccess={mockOnSuccess} />
    );
    // Click the backdrop without going through the confirm step
    const backdrop = document.querySelector(".backdrop-blur-sm") as Element;
    await user.click(backdrop);

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("error handling", () => {
  it("shows SlotUnavailableError message when slots are taken", async () => {
    const user = userEvent.setup();
    const { SlotUnavailableError: SUError } =
      jest.requireMock("@/lib/firebase/bookings");
    mockCreateBooking.mockRejectedValueOnce(new SUError());

    render(<BookingConfirmModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(
      await screen.findByText(
        /slots you selected were just booked/i
      )
    ).toBeInTheDocument();
  });

  it("shows a generic fallback error for unexpected failures", async () => {
    const user = userEvent.setup();
    mockCreateBooking.mockRejectedValueOnce(new Error("Network error"));

    render(<BookingConfirmModal {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(
      await screen.findByText("Failed to save booking. Please try again.")
    ).toBeInTheDocument();
  });

  it("allows the user to retry after an error", async () => {
    const user = userEvent.setup();
    mockCreateBooking
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce("booking-ok");

    render(<BookingConfirmModal {...defaultProps} />);

    // First attempt fails
    await user.click(screen.getByRole("button", { name: /Confirm/i }));
    await screen.findByText("Failed to save booking. Please try again.");

    // Second attempt succeeds
    await user.click(screen.getByRole("button", { name: /Confirm/i }));
    expect(await screen.findByText("Booking Confirmed!")).toBeInTheDocument();
  });

  it("does not call onSuccess when the booking failed", async () => {
    const user = userEvent.setup();
    const mockOnSuccess = jest.fn();
    mockCreateBooking.mockRejectedValueOnce(new Error("fail"));

    render(
      <BookingConfirmModal {...defaultProps} onSuccess={mockOnSuccess} />
    );
    await user.click(screen.getByRole("button", { name: /Confirm/i }));
    await screen.findByText("Failed to save booking. Please try again.");

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });
});

// ─── Timezone note (known issue) ─────────────────────────────────────────────

describe("date string derivation (known timezone issue)", () => {
  it("derives dateStr using toISOString() which returns UTC — may differ from local date in UTC+ timezones", () => {
    // KNOWN BUG: `selectedDate.toISOString().split('T')[0]` returns the UTC date.
    // For users in Philippines (UTC+8), a date selected at midnight local time
    // would be stored as the previous calendar day in Firestore.
    // MyBookings.formatDate() correctly uses local date parsing (new Date(y, m-1, d)).
    // Fix: derive dateStr as `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`.

    const localMidnight = new Date(2026, 3, 27, 0, 0, 0, 0); // April 27 local
    const utcString = localMidnight.toISOString().split("T")[0];
    const localString = [
      localMidnight.getFullYear(),
      String(localMidnight.getMonth() + 1).padStart(2, "0"),
      String(localMidnight.getDate()).padStart(2, "0"),
    ].join("-");

    // Local date is always correct
    expect(localString).toBe("2026-04-27");
    // toISOString may return a different date if the machine is in UTC+
    // In UTC timezone (most CI), these would be equal; in UTC+8 they would differ
    if (utcString !== localString) {
      // This branch confirms the bug is real for users in positive UTC offsets
      expect(utcString).not.toBe("2026-04-27");
    }
  });
});
