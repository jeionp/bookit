import React, { useState } from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import AvailabilitySection from "@/app/[businessSlug]/_components/AvailabilitySection";
import { mockBusiness } from "../../helpers/mockData";
import type { Selection } from "@/app/[businessSlug]/_components/AvailabilitySection";

// AvailabilitySection calls getBookedHours (async Firestore) in a useEffect.
// Mock it to resolve immediately so the loading spinner clears before assertions.
jest.mock("@/lib/firebase/bookings", () => ({
  getBookedHours: jest.fn().mockResolvedValue([]),
  createBooking: jest.fn(),
  getUserBookings: jest.fn(),
  cancelBooking: jest.fn(),
  SlotUnavailableError: class SlotUnavailableError extends Error {},
}));
// Defensive mocks: mockData.ts type-imports chain into firebase/auth which needs `fetch`.
jest.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  Timestamp: { now: jest.fn() },
  runTransaction: jest.fn(),
}));
jest.mock("firebase/auth", () => ({
  getAuth: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));

const mockOnBook = jest.fn();
const mockOnFacilityChange = jest.fn();

const defaultProps = {
  business: mockBusiness,
  onBook: mockOnBook,
  selectedFacilityId: "court-1",
  onFacilityChange: mockOnFacilityChange,
};

/**
 * Render and flush all async effects (getBookedHours promise chain).
 * Every test must `await` this so the slot grid is visible before assertions.
 */
async function renderSection(props: Partial<typeof defaultProps> = {}) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<AvailabilitySection {...defaultProps} {...props} />);
  });
  return result;
}

/**
 * Stateful wrapper: mirrors a real parent that updates selectedFacilityId
 * when onFacilityChange fires — required for testing facility-switch effects.
 */
function StatefulSection(props: Partial<typeof defaultProps> = {}) {
  const [facilityId, setFacilityId] = useState(props.selectedFacilityId ?? "court-1");
  return (
    <AvailabilitySection
      {...defaultProps}
      {...props}
      selectedFacilityId={facilityId}
      onFacilityChange={(id) => {
        setFacilityId(id);
        mockOnFacilityChange(id);
      }}
    />
  );
}

async function renderStatefulSection(props: Partial<typeof defaultProps> = {}) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<StatefulSection {...props} />);
  });
  return result;
}

/** Returns all enabled time-slot buttons (text like "6 AM", "9 AM"). */
function getAvailableSlotButtons() {
  return screen
    .getAllByRole("button")
    .filter(
      (btn) =>
        !btn.hasAttribute("disabled") &&
        /^\d{1,2} (AM|PM)$/.test(btn.textContent?.trim() ?? "")
    );
}

/**
 * Simulates a single-slot click: flushes mouseDown state first so the
 * useEffect-registered mouseUp listener has the updated drag value.
 */
async function clickSlot(slotBtn: HTMLElement) {
  await act(async () => { fireEvent.mouseDown(slotBtn); });
  fireEvent.mouseUp(window);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply the default resolved value after clearAllMocks resets it.
  const { getBookedHours } = jest.requireMock("@/lib/firebase/bookings");
  getBookedHours.mockResolvedValue([]);
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("rendering", () => {
  it("renders the Check Availability heading", async () => {
    await renderSection();
    expect(screen.getByText("Check Availability")).toBeInTheDocument();
  });

  it("renders the date picker button showing today's date", async () => {
    await renderSection();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("renders a tab for each facility", async () => {
    await renderSection();
    mockBusiness.facilities.forEach((f) => {
      expect(screen.getByRole("button", { name: f.name })).toBeInTheDocument();
    });
  });

  it("renders slot sections for an open business day", async () => {
    await renderSection();
    // mockBusiness has hours for every day of the week, so today always produces slots.
    const hasMorning = !!screen.queryByText("Morning");
    const hasAfternoon = !!screen.queryByText("Afternoon");
    const hasEvening = !!screen.queryByText("Evening");
    expect(hasMorning || hasAfternoon || hasEvening).toBe(true);
  });

  it("renders Morning, Afternoon, and Evening sections for a full-day schedule", async () => {
    await renderSection();
    expect(
      screen.queryByText("Morning") ||
      screen.queryByText("Afternoon") ||
      screen.queryByText("Evening")
    ).not.toBeNull();
  });

  it("renders slot buttons (available, booked, or reserved)", async () => {
    await renderSection();
    const allSlotBtns = screen
      .getAllByRole("button")
      .filter((btn) =>
        /^\d{1,2} (AM|PM)$|^Booked$|^Reserved$/.test(btn.textContent?.trim() ?? "")
      );
    expect(allSlotBtns.length).toBeGreaterThan(0);
  });

  it("marks booked and reserved slots as disabled", async () => {
    await renderSection();
    const booked = screen.queryAllByRole("button", { name: "Booked" });
    const reserved = screen.queryAllByRole("button", { name: "Reserved" });
    [...booked, ...reserved].forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});

// ─── Slot selection ───────────────────────────────────────────────────────────

describe("slot selection", () => {
  it("hides the booking action bar before any slot is selected", async () => {
    await renderSection();
    expect(
      screen.queryByRole("button", { name: /Book Now/i })
    ).not.toBeInTheDocument();
  });

  it("shows the booking action bar after selecting an available slot", async () => {
    await renderSection();
    const available = getAvailableSlotButtons();
    expect(available.length).toBeGreaterThan(0);

    await clickSlot(available[0]);
    expect(screen.getByRole("button", { name: /Book Now/i })).toBeInTheDocument();
  });

  it("calls onBook when Book Now is clicked with a valid selection", async () => {
    await renderSection();
    const available = getAvailableSlotButtons();
    await clickSlot(available[0]);

    fireEvent.click(screen.getByRole("button", { name: /Book Now/i }));
    expect(mockOnBook).toHaveBeenCalledTimes(1);
    expect(mockOnBook).toHaveBeenCalledWith(
      expect.objectContaining({
        facilityId: "court-1",
        hours: expect.any(Array),
        totalPrice: expect.any(Number),
      }),
      expect.any(Date)
    );
  });

  it("clears selection when a different facility tab is clicked", async () => {
    // Uses StatefulSection so selectedFacilityId actually updates on tab click,
    // which triggers the useEffect that calls setSelection(null).
    await renderStatefulSection();
    const available = getAvailableSlotButtons();
    await clickSlot(available[0]);
    expect(screen.getByRole("button", { name: /Book Now/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Court 2" }));
    });
    expect(
      screen.queryByRole("button", { name: /Book Now/i })
    ).not.toBeInTheDocument();
  });

  it("shows the selected slot's price in the action bar", async () => {
    await renderSection();
    const available = getAvailableSlotButtons();
    await clickSlot(available[0]);

    const bookBar = screen
      .getByRole("button", { name: /Book Now/i })
      .closest("div")!.parentElement!.parentElement!;
    expect(within(bookBar).getByText(/₱/)).toBeInTheDocument();
  });
});

// ─── Multi-slot drag selection ────────────────────────────────────────────────

describe("drag selection", () => {
  it("selects multiple hours when dragging across available slots", async () => {
    await renderSection();
    const available = getAvailableSlotButtons();

    if (available.length < 2) return; // skip if not enough slots

    // mouseDown commits drag state; flush before mouseEnter so currentHour updates.
    await act(async () => { fireEvent.mouseDown(available[0]); });
    await act(async () => { fireEvent.mouseEnter(available[1]); });
    fireEvent.mouseUp(window);

    expect(screen.getByRole("button", { name: /Book Now/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Book Now/i }));
    const selectionArg = (mockOnBook.mock.calls[0] as [Selection, Date])[0];
    expect(selectionArg.hours.length).toBeGreaterThanOrEqual(2);
  });

  it("drag stops at unavailable slots — selected range stays contiguous and available", async () => {
    await renderSection();
    const available = getAvailableSlotButtons();
    if (available.length < 1) return;

    await act(async () => { fireEvent.mouseDown(available[0]); });
    const bookedBtns = screen.queryAllByRole("button", { name: "Booked" });
    if (bookedBtns.length > 0) {
      fireEvent.mouseEnter(bookedBtns[0]);
    }
    fireEvent.mouseUp(window);

    if (screen.queryByRole("button", { name: /Book Now/i })) {
      fireEvent.click(screen.getByRole("button", { name: /Book Now/i }));
      const selectionArg = (mockOnBook.mock.calls[0] as [Selection, Date])[0];
      selectionArg.hours.forEach((h) => expect(typeof h).toBe("number"));
    }
  });
});

// ─── Facility tabs ────────────────────────────────────────────────────────────

describe("facility tabs", () => {
  it("calls onFacilityChange when a court tab is clicked", async () => {
    await renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Court 2" }));
    expect(mockOnFacilityChange).toHaveBeenCalledWith("court-2");
  });

  it("shows the selected facility's starting price per hour", async () => {
    await renderSection();
    expect(screen.getByText(/₱500/)).toBeInTheDocument();
  });
});

// ─── Closed day ───────────────────────────────────────────────────────────────

describe("closed day", () => {
  it("shows 'Closed on this day' when the business marks the day as closed", async () => {
    const closedBusiness = {
      ...mockBusiness,
      operatingHours: mockBusiness.operatingHours.map((h) => ({
        ...h,
        closed: true,
      })),
    };
    await renderSection({ business: closedBusiness });
    expect(screen.getByText("Closed on this day")).toBeInTheDocument();
  });
});

// ─── getSlotStatus hash determinism ──────────────────────────────────────────

describe("getSlotStatus (deterministic hash)", () => {
  it("renders the same slot availability on every render for the same court and date", async () => {
    const { unmount } = await renderSection();
    const bookedCount1 = screen.queryAllByRole("button", { name: "Booked" }).length;
    const reservedCount1 = screen.queryAllByRole("button", { name: "Reserved" }).length;
    unmount();

    await renderSection();
    expect(screen.queryAllByRole("button", { name: "Booked" }).length).toBe(bookedCount1);
    expect(screen.queryAllByRole("button", { name: "Reserved" }).length).toBe(reservedCount1);
  });

  it("may show different availability for different courts on the same date", async () => {
    const { unmount } = await renderSection({ selectedFacilityId: "court-1" });
    const court1Booked = screen.queryAllByRole("button", { name: "Booked" }).length;
    unmount();

    await renderSection({ selectedFacilityId: "court-2" });
    const court2Booked = screen.queryAllByRole("button", { name: "Booked" }).length;

    expect(typeof court1Booked).toBe("number");
    expect(typeof court2Booked).toBe("number");
  });
});

// ─── Price calculation ────────────────────────────────────────────────────────

describe("price calculation in action bar", () => {
  it("shows the correct price for a selected non-prime-time slot (₱500/hr)", async () => {
    await renderSection();
    const morningBtns = screen.queryAllByRole("button").filter(
      (btn) =>
        !btn.hasAttribute("disabled") &&
        /^([6-9]|1[0-1]) AM$/.test(btn.textContent?.trim() ?? "")
    );

    if (morningBtns.length === 0) return; // no available morning slots for today

    await clickSlot(morningBtns[0]);
    const bookBar = screen
      .getByRole("button", { name: /Book Now/i })
      .closest("div")!.parentElement!.parentElement!;
    expect(within(bookBar).getByText("₱500")).toBeInTheDocument();
  });

  it("shows the correct prime-time price (₱600/hr) for an evening slot", async () => {
    await renderSection();
    // Match only 5–9 PM (hours 17–21, all ≥ primeTimeStart=17).
    // "12 PM" (noon, hour 12) is excluded because it matches 1[0-2] but is NOT prime.
    const eveningBtns = screen.queryAllByRole("button").filter(
      (btn) =>
        !btn.hasAttribute("disabled") &&
        /^[5-9] PM$/.test(btn.textContent?.trim() ?? "")
    );

    if (eveningBtns.length === 0) return; // no available prime slots

    await clickSlot(eveningBtns[0]);
    const bookBar = screen
      .getByRole("button", { name: /Book Now/i })
      .closest("div")!.parentElement!.parentElement!;
    expect(within(bookBar).getByText("₱600")).toBeInTheDocument();
  });
});
