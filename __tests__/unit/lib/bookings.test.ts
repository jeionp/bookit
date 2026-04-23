import {
  SlotUnavailableError,
  createBooking,
  getUserBookings,
  cancelBooking,
  getBookingsForDate,
  type NewBooking,
} from "@/lib/firebase/bookings";
import {
  getDocs,
  runTransaction,
  updateDoc,
  doc,
  collection,
  query,
  where,
  orderBy,
} from "firebase/firestore";

jest.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn().mockReturnValue({}),
  query: jest.fn().mockReturnValue({}),
  where: jest.fn().mockReturnValue({}),
  orderBy: jest.fn().mockReturnValue({}),
  getDocs: jest.fn(),
  updateDoc: jest.fn().mockResolvedValue(undefined),
  doc: jest.fn().mockReturnValue({ id: "new-booking-id" }),
  Timestamp: {
    now: jest.fn().mockReturnValue({ seconds: 1714000000, nanoseconds: 0 }),
  },
  runTransaction: jest.fn(),
}));

const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
const mockRunTransaction = runTransaction as jest.MockedFunction<
  typeof runTransaction
>;
const mockUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>;
const mockWhere = where as jest.MockedFunction<typeof where>;
const mockOrderBy = orderBy as jest.MockedFunction<typeof orderBy>;

const baseNewBooking: NewBooking = {
  userId: "user-1",
  userEmail: "user@example.com",
  userName: "User One",
  businessSlug: "paddleup",
  businessName: "PaddleUp",
  facilityId: "court-1",
  facilityName: "Court 1",
  date: "2026-04-27",
  hours: [9, 10, 11],
  totalPrice: 1500,
  currency: "PHP",
};

// Helpers to build the mock transaction environment
function makeTx() {
  return { set: jest.fn() };
}

function setupTransactionWithExistingHours(takenHours: number[]) {
  mockGetDocs.mockResolvedValueOnce({
    docs: [
      {
        id: "existing-booking",
        data: () => ({ hours: takenHours }),
      },
    ],
  } as unknown as Awaited<ReturnType<typeof getDocs>>);

  mockRunTransaction.mockImplementationOnce(async (_db, callback) => {
    const tx = makeTx();
    await callback(tx);
    return tx;
  });
}

function setupTransactionWithNoConflicts() {
  mockGetDocs.mockResolvedValueOnce({
    docs: [],
  } as unknown as Awaited<ReturnType<typeof getDocs>>);

  mockRunTransaction.mockImplementationOnce(async (_db, callback) => {
    const tx = makeTx();
    await callback(tx);
    return tx;
  });
}

// ─── SlotUnavailableError ────────────────────────────────────────────────────

describe("SlotUnavailableError", () => {
  it("is an instance of Error", () => {
    expect(new SlotUnavailableError()).toBeInstanceOf(Error);
  });

  it('has name "SlotUnavailableError"', () => {
    expect(new SlotUnavailableError().name).toBe("SlotUnavailableError");
  });

  it("message mentions that slots were already booked", () => {
    expect(new SlotUnavailableError().message).toMatch(/booked/i);
  });
});

// ─── createBooking ────────────────────────────────────────────────────────────

describe("createBooking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the new document ID on success", async () => {
    setupTransactionWithNoConflicts();
    const id = await createBooking(baseNewBooking);
    expect(id).toBe("new-booking-id");
  });

  it("calls runTransaction once", async () => {
    setupTransactionWithNoConflicts();
    await createBooking(baseNewBooking);
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });

  it("writes the booking with status=confirmed via tx.set", async () => {
    let capturedTx: ReturnType<typeof makeTx> | null = null;
    mockGetDocs.mockResolvedValueOnce({
      docs: [],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);
    mockRunTransaction.mockImplementationOnce(async (_db, callback) => {
      const tx = makeTx();
      capturedTx = tx;
      await callback(tx);
    });

    await createBooking(baseNewBooking);

    expect(capturedTx!.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "confirmed" })
    );
  });

  it("throws SlotUnavailableError when a requested hour is already taken", async () => {
    // Existing booking holds hours [9, 10] — our request also includes [9]
    setupTransactionWithExistingHours([9, 10]);
    await expect(createBooking(baseNewBooking)).rejects.toBeInstanceOf(
      SlotUnavailableError
    );
  });

  it("throws SlotUnavailableError even when only one hour overlaps", async () => {
    // Existing booking has [11], our request includes [9, 10, 11]
    setupTransactionWithExistingHours([11]);
    await expect(createBooking(baseNewBooking)).rejects.toBeInstanceOf(
      SlotUnavailableError
    );
  });

  it("does NOT throw when the conflicting booking is on a different date", async () => {
    // The query filters by date already, so getDocs returns no conflicting docs
    setupTransactionWithNoConflicts();
    await expect(
      createBooking({ ...baseNewBooking, date: "2026-04-28" })
    ).resolves.toBeDefined();
  });

  it("does NOT throw when no existing bookings exist", async () => {
    setupTransactionWithNoConflicts();
    await expect(createBooking(baseNewBooking)).resolves.toBeDefined();
  });

  it("queries by businessSlug, facilityId, date, and status=confirmed", async () => {
    setupTransactionWithNoConflicts();
    await createBooking(baseNewBooking);
    expect(mockWhere).toHaveBeenCalledWith("businessSlug", "==", "paddleup");
    expect(mockWhere).toHaveBeenCalledWith("facilityId", "==", "court-1");
    expect(mockWhere).toHaveBeenCalledWith("date", "==", "2026-04-27");
    expect(mockWhere).toHaveBeenCalledWith("status", "==", "confirmed");
  });

  it("does not query cancelled bookings (does not check conflicts against them)", async () => {
    // Only "confirmed" status is queried — cancelled bookings are ignored
    // This is verified by the where("status","==","confirmed") call above
    setupTransactionWithNoConflicts();
    await createBooking(baseNewBooking);
    expect(mockWhere).not.toHaveBeenCalledWith("status", "==", "cancelled");
  });
});

// ─── getUserBookings ──────────────────────────────────────────────────────────

describe("getUserBookings", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty array when there are no bookings", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);
    const result = await getUserBookings("user-1");
    expect(result).toEqual([]);
  });

  it("maps each Firestore doc to a Booking with its id", async () => {
    const docData = {
      userId: "user-1",
      facilityName: "Court 1",
      status: "confirmed",
    };
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: "booking-xyz", data: () => docData }],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    const result = await getUserBookings("user-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("booking-xyz");
    expect(result[0].facilityName).toBe("Court 1");
  });

  it("queries by userId", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);
    await getUserBookings("user-abc");
    expect(mockWhere).toHaveBeenCalledWith("userId", "==", "user-abc");
  });

  it("orders results by createdAt descending", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);
    await getUserBookings("user-1");
    expect(mockOrderBy).toHaveBeenCalledWith("createdAt", "desc");
  });
});

// ─── cancelBooking ────────────────────────────────────────────────────────────

describe("cancelBooking", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls updateDoc with status=cancelled", async () => {
    await cancelBooking("booking-123");
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      { status: "cancelled" }
    );
  });

  it("targets the correct document", async () => {
    await cancelBooking("booking-abc");
    expect(doc).toHaveBeenCalledWith(expect.anything(), "bookings", "booking-abc");
  });
});

// ─── getBookingsForDate ───────────────────────────────────────────────────────

describe("getBookingsForDate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queries by businessSlug, facilityId, date, and status=confirmed", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    await getBookingsForDate("paddleup", "court-1", "2026-04-27");

    expect(mockWhere).toHaveBeenCalledWith("businessSlug", "==", "paddleup");
    expect(mockWhere).toHaveBeenCalledWith("facilityId", "==", "court-1");
    expect(mockWhere).toHaveBeenCalledWith("date", "==", "2026-04-27");
    expect(mockWhere).toHaveBeenCalledWith("status", "==", "confirmed");
  });

  it("returns mapped bookings with id", async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: "bk-1", data: () => ({ hours: [9, 10] }) }],
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    const result = await getBookingsForDate("paddleup", "court-1", "2026-04-27");
    expect(result[0].id).toBe("bk-1");
  });

  // KNOWN GAP: getBookingsForDate is defined but never called in the UI.
  // AvailabilitySection uses a fake hash function instead of real Firestore data.
  // Real slot availability is NOT reflected in the booking grid.
  it("is defined but currently unused by AvailabilitySection (real availability not shown)", () => {
    expect(getBookingsForDate).toBeDefined();
    expect(typeof getBookingsForDate).toBe("function");
  });
});
