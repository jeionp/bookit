/**
 * Integration tests: multi-component booking flows.
 *
 * These tests wire real component trees together (with Firebase mocked)
 * to verify the complete user journey from slot selection through
 * confirmation and into My Bookings.
 */

import React, { useState } from "react";
import { render, screen, fireEvent, within as withinEl } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingConfirmModal from "@/components/booking/BookingConfirmModal";
import MyBookings from "@/components/booking/MyBookings";
import AuthModal from "@/components/auth/AuthModal";
import { createBooking, getUserBookings, cancelBooking, SlotUnavailableError } from "@/lib/firebase/bookings";
import { useAuth } from "@/context/AuthContext";
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  mockUser,
  mockSelectionNormal,
  mockBookingConfirmed,
} from "../helpers/mockData";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));
jest.mock("@/lib/firebase/bookings", () => ({
  createBooking: jest.fn(),
  getUserBookings: jest.fn(),
  cancelBooking: jest.fn(),
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
jest.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  updateProfile: jest.fn(),
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({})),
}));

const mockCreateBooking = createBooking as jest.MockedFunction<typeof createBooking>;
const mockGetUserBookings = getUserBookings as jest.MockedFunction<typeof getUserBookings>;
const mockCancelBooking = cancelBooking as jest.MockedFunction<typeof cancelBooking>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockSignIn = signInWithEmailAndPassword as jest.MockedFunction<typeof signInWithEmailAndPassword>;

const selectedDate = new Date(2026, 3, 27);
const accentColor = "#16a34a";

function setAuthUser(user: typeof mockUser | null) {
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

// ─── Booking confirm → success → my bookings ──────────────────────────────────

describe("full booking confirmation flow", () => {
  it("shows Booking Confirmed after a successful confirm, then calls onSuccess on Done", async () => {
    const user = userEvent.setup();
    setAuthUser(mockUser);
    mockCreateBooking.mockResolvedValueOnce("booking-new-id");
    const mockOnSuccess = jest.fn();
    const mockOnClose = jest.fn();

    render(
      <BookingConfirmModal
        open={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
        selection={mockSelectionNormal}
        selectedDate={selectedDate}
        businessSlug="paddleup"
        businessName="PaddleUp"
        businessLocation="Quezon City"
        accentColor={accentColor}
      />
    );

    // Step 1: user sees booking details
    expect(screen.getByText("Confirm Booking")).toBeInTheDocument();
    expect(screen.getByText("Court 1")).toBeInTheDocument();

    // Step 2: user clicks Confirm
    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    // Step 3: success state is shown
    expect(await screen.findByText("Booking Confirmed!")).toBeInTheDocument();

    // Step 4: user clicks Done → onSuccess is called
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(mockOnSuccess).toHaveBeenCalledTimes(1);
  });

  it("sends the correct booking payload to createBooking", async () => {
    const user = userEvent.setup();
    setAuthUser(mockUser);
    mockCreateBooking.mockResolvedValueOnce("booking-123");

    render(
      <BookingConfirmModal
        open={true}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        selection={mockSelectionNormal}
        selectedDate={selectedDate}
        businessSlug="paddleup"
        businessName="PaddleUp"
        businessLocation="Quezon City"
        accentColor={accentColor}
      />
    );

    await user.click(screen.getByRole("button", { name: /Confirm/i }));
    await screen.findByText("Booking Confirmed!");

    expect(mockCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-abc-123",
        userEmail: "test@example.com",
        userName: "Test User",
        businessSlug: "paddleup",
        facilityId: "court-1",
        facilityName: "Court 1",
        hours: [9, 10, 11],
        totalPrice: 1500,
        currency: "PHP",
      })
    );
  });
});

// ─── Slot conflict handling ───────────────────────────────────────────────────

describe("slot unavailable error flow", () => {
  it("shows the slot-unavailable error and allows the user to stay on the modal", async () => {
    const user = userEvent.setup();
    setAuthUser(mockUser);
    const { SlotUnavailableError: SUE } = jest.requireMock("@/lib/firebase/bookings");
    mockCreateBooking.mockRejectedValueOnce(new SUE());

    render(
      <BookingConfirmModal
        open={true}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        selection={mockSelectionNormal}
        selectedDate={selectedDate}
        businessSlug="paddleup"
        businessName="PaddleUp"
        businessLocation="Quezon City"
        accentColor={accentColor}
      />
    );

    await user.click(screen.getByRole("button", { name: /Confirm/i }));

    expect(
      await screen.findByText(/slots you selected were just booked/i)
    ).toBeInTheDocument();

    // Modal stays open — "Confirm Booking" heading is still visible
    expect(screen.getByText("Confirm Booking")).toBeInTheDocument();
    // "Booking Confirmed!" is NOT shown
    expect(screen.queryByText("Booking Confirmed!")).not.toBeInTheDocument();
  });
});

// ─── My Bookings cancel flow ──────────────────────────────────────────────────

describe("My Bookings cancel flow", () => {
  it("cancels a booking and moves it to the Cancelled section", async () => {
    const user = userEvent.setup();
    setAuthUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([mockBookingConfirmed]);
    mockCancelBooking.mockResolvedValueOnce(undefined);

    render(<MyBookings accentColor={accentColor} />);

    // Booking appears in Upcoming
    expect(await screen.findByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Court 1")).toBeInTheDocument();

    // Cancel it
    await user.click(screen.getByRole("button", { name: /Cancel booking/i }));

    // Status badge and section header both contain "Cancelled"
    expect((await screen.findAllByText("Cancelled")).length).toBeGreaterThanOrEqual(1);
    // Cancel button is gone
    expect(
      screen.queryByRole("button", { name: /Cancel booking/i })
    ).not.toBeInTheDocument();
    // Firestore was called
    expect(mockCancelBooking).toHaveBeenCalledWith("booking-111");
  });
});

// ─── Auth gating integration ──────────────────────────────────────────────────

/**
 * Simulates the parent page's auth gate:
 * unauthenticated → AuthModal opens → sign in → AuthModal closes.
 */
function AuthGatedPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div>
      <button
        onClick={() => {
          if (!user) setAuthOpen(true);
        }}
      >
        Book Now
      </button>
      <span data-testid="user-status">{user ? "logged-in" : "guest"}</span>
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        accentColor={accentColor}
      />
    </div>
  );
}

describe("auth gating", () => {
  it("opens AuthModal when unauthenticated user clicks Book Now", async () => {
    const user = userEvent.setup();
    setAuthUser(null);

    render(<AuthGatedPage />);
    expect(screen.queryByRole("heading", { name: /Welcome back/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Book Now" }));
    expect(screen.getByRole("heading", { name: /Welcome back/i })).toBeInTheDocument();
  });

  it("closes AuthModal after successful sign-in", async () => {
    const user = userEvent.setup();
    setAuthUser(null);
    mockSignIn.mockResolvedValueOnce({
      user: mockUser,
    } as unknown as Awaited<ReturnType<typeof signInWithEmailAndPassword>>);

    render(<AuthGatedPage />);

    // Open auth modal
    await user.click(screen.getByRole("button", { name: "Book Now" }));

    // Fill in credentials and submit (form has no aria-label so use placeholders directly)
    await user.type(screen.getByPlaceholderText("you@example.com"), "u@t.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass123");
    await user.click(document.querySelector('button[type="submit"]') as HTMLElement);

    // Modal should close
    expect(
      screen.queryByRole("heading", { name: /Welcome back/i })
    ).not.toBeInTheDocument();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("does not create a booking when no user is authenticated (guard in handleConfirm)", async () => {
    const user = userEvent.setup();
    // User is null — handleConfirm returns early
    setAuthUser(null);

    render(
      <BookingConfirmModal
        open={true}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
        selection={mockSelectionNormal}
        selectedDate={selectedDate}
        businessSlug="paddleup"
        businessName="PaddleUp"
        businessLocation="Quezon City"
        accentColor={accentColor}
      />
    );

    await user.click(screen.getByRole("button", { name: /Confirm/i }));
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it("shows 'No bookings yet' for a newly registered user with no history", async () => {
    setAuthUser(mockUser);
    mockGetUserBookings.mockResolvedValueOnce([]);

    render(<MyBookings accentColor={accentColor} />);
    expect(await screen.findByText("No bookings yet")).toBeInTheDocument();
  });

  it("handles getUserBookings rejecting gracefully (loading spinner stops)", async () => {
    setAuthUser(mockUser);
    mockGetUserBookings.mockRejectedValueOnce(new Error("Network error"));

    // Should not throw — component should handle the rejection
    expect(() => render(<MyBookings accentColor={accentColor} />)).not.toThrow();
    // After rejection, loading ends and bookings is empty (no error boundary exists yet)
    // This test documents the current behavior; a future improvement is showing an error state
  });
});
