import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  generateTimeSlots,
  isPastSlot,
  isWithinBookingWindow,
  calculateBookingPrice,
  isSlotAvailable,
  isSelectionContiguous,
  getUpdatedSelection,
  selectSlotRange,
  isBusinessOpen,
  detectBookingConflict,
  shouldResetSelection,
} from '@/lib/booking/utils'
import type { PriceConfig, WeeklySchedule, ExistingBooking } from '@/lib/booking/utils'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Frozen at 10:00 AM Philippine time (UTC+8) on April 24 2026
const FIXED_NOW = new Date('2026-04-24T02:00:00.000Z') // 10:00 PHT

const PRICE_CONFIG: PriceConfig = {
  standardRate: 500,       // PHP 500/hr before prime time
  primeTimeRate: 800,      // PHP 800/hr at or after prime time
  primeTimeStartHour: 17,  // Prime time kicks in at 5 PM
}

const WEEKLY_SCHEDULE: WeeklySchedule[] = [
  { dayOfWeek: 0, openHour: 8, closeHour: 22, isClosed: false }, // Sunday
  { dayOfWeek: 1, openHour: 8, closeHour: 22, isClosed: false }, // Monday
  { dayOfWeek: 2, openHour: 8, closeHour: 22, isClosed: false }, // Tuesday
  { dayOfWeek: 3, openHour: 8, closeHour: 22, isClosed: false }, // Wednesday
  { dayOfWeek: 4, openHour: 8, closeHour: 22, isClosed: false }, // Thursday
  { dayOfWeek: 5, openHour: 8, closeHour: 22, isClosed: false }, // Friday
  { dayOfWeek: 6, openHour: 8, closeHour: 22, isClosed: true  }, // Saturday — closed
]

// ─── Rule: Slot Generation from Operating Hours ───────────────────────────────
// "dynamically generate available slots based solely on that specific day's
//  opening and closing hours"

describe('generateTimeSlots', () => {
  it('returns one slot per bookable hour between open and close', () => {
    // 8 AM open, 10 PM close → 14 hourly slots (8–21 inclusive)
    expect(generateTimeSlots(8, 22)).toHaveLength(14)
  })

  it('first slot equals the opening hour', () => {
    const slots = generateTimeSlots(8, 22)
    expect(slots[0]).toBe(8)
  })

  it('last slot is one hour before the closing hour', () => {
    // Closing at 22:00 means the 21:00–22:00 block is the final bookable slot
    const slots = generateTimeSlots(8, 22)
    expect(slots.at(-1)).toBe(21)
  })

  it('generates a correct sequential list of hours', () => {
    expect(generateTimeSlots(9, 13)).toEqual([9, 10, 11, 12])
  })

  it('handles a single-hour operating window', () => {
    expect(generateTimeSlots(14, 15)).toEqual([14])
  })

  it('returns an empty array when open and close hours are equal', () => {
    expect(generateTimeSlots(10, 10)).toEqual([])
  })

  it('returns an empty array when close hour is before open hour (invalid config)', () => {
    // Guards against misconfigured business hours crashing the UI
    expect(generateTimeSlots(22, 8)).toEqual([])
  })
})

// ─── Rule: Past Booking Prevention ───────────────────────────────────────────
// "The system must prevent users from booking times in the past"

describe('isPastSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for a slot on a future date', () => {
    expect(isPastSlot(new Date('2026-05-01'), 10)).toBe(false)
  })

  it('returns false for a slot later today', () => {
    expect(isPastSlot(new Date('2026-04-24'), 15)).toBe(false)
  })

  it('returns false for the current hour (still bookable at the start of the hour)', () => {
    // The 10:00–11:00 block is not past while the clock reads 10:00
    expect(isPastSlot(new Date('2026-04-24'), 10)).toBe(false)
  })

  it('returns true for an hour that has already finished today', () => {
    // The 9:00–10:00 block ended exactly when the clock hit 10:00
    expect(isPastSlot(new Date('2026-04-24'), 9)).toBe(true)
  })

  it('returns true for any slot on yesterday', () => {
    expect(isPastSlot(new Date('2026-04-23'), 23)).toBe(true)
  })

  it('returns true for a slot in a previous year', () => {
    expect(isPastSlot(new Date('2025-01-01'), 8)).toBe(true)
  })
})

// ─── Rule: 30-Day Booking Window ─────────────────────────────────────────────
// "Users must be able to browse a calendar up to 30 days in advance"

describe('isWithinBookingWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows booking today', () => {
    expect(isWithinBookingWindow(new Date('2026-04-24'))).toBe(true)
  })

  it('allows booking midway through the window', () => {
    expect(isWithinBookingWindow(new Date('2026-05-09'))).toBe(true) // +15 days
  })

  it('allows booking on the 30th day (boundary is inclusive)', () => {
    expect(isWithinBookingWindow(new Date('2026-05-24'))).toBe(true) // exactly +30
  })

  it('rejects a date 31 days from today', () => {
    expect(isWithinBookingWindow(new Date('2026-05-25'))).toBe(false)
  })

  it('rejects a date far in the future', () => {
    expect(isWithinBookingWindow(new Date('2027-04-24'))).toBe(false)
  })

  it('rejects yesterday', () => {
    expect(isWithinBookingWindow(new Date('2026-04-23'))).toBe(false)
  })

  it('rejects a date in a prior year', () => {
    expect(isWithinBookingWindow(new Date('2025-04-24'))).toBe(false)
  })
})

// ─── Rule: Dynamic Pricing (Standard + Prime-Time) ───────────────────────────
// "a standard hourly rate, as well as a prime-time hourly rate that
//  automatically triggers after a specific hour of the day"
// "explicitly itemizing if any of the hours fall under prime-time pricing"

describe('calculateBookingPrice', () => {
  it('calculates total correctly for all standard-rate hours', () => {
    // Hours 8, 9, 10 are all before 5 PM
    const result = calculateBookingPrice([8, 9, 10], PRICE_CONFIG)
    expect(result.total).toBe(1500)        // 3 × PHP 500
    expect(result.standardHours).toBe(3)
    expect(result.primeTimeHours).toBe(0)
  })

  it('calculates total correctly for all prime-time hours', () => {
    const result = calculateBookingPrice([17, 18, 19], PRICE_CONFIG)
    expect(result.total).toBe(2400)        // 3 × PHP 800
    expect(result.standardHours).toBe(0)
    expect(result.primeTimeHours).toBe(3)
  })

  it('calculates total correctly for a block that spans both rate tiers', () => {
    // Hours 15, 16 at PHP 500 each; 17, 18 at PHP 800 each
    const result = calculateBookingPrice([15, 16, 17, 18], PRICE_CONFIG)
    expect(result.total).toBe(2600)        // (2 × 500) + (2 × 800)
    expect(result.standardHours).toBe(2)
    expect(result.primeTimeHours).toBe(2)
  })

  it('applies prime-time rate to the exact boundary hour', () => {
    const result = calculateBookingPrice([17], PRICE_CONFIG)
    expect(result.total).toBe(800)
    expect(result.primeTimeHours).toBe(1)
  })

  it('applies standard rate to the hour immediately before prime time', () => {
    const result = calculateBookingPrice([16], PRICE_CONFIG)
    expect(result.total).toBe(500)
    expect(result.standardHours).toBe(1)
  })

  it('returns zeros for an empty selection', () => {
    const result = calculateBookingPrice([], PRICE_CONFIG)
    expect(result.total).toBe(0)
    expect(result.standardHours).toBe(0)
    expect(result.primeTimeHours).toBe(0)
    expect(result.breakdown).toHaveLength(0)
  })

  it('returns a per-slot breakdown for UI itemisation', () => {
    const result = calculateBookingPrice([16, 17], PRICE_CONFIG)
    expect(result.breakdown).toHaveLength(2)
    expect(result.breakdown[0]).toMatchObject({ hour: 16, rate: 500, isPrimeTime: false })
    expect(result.breakdown[1]).toMatchObject({ hour: 17, rate: 800, isPrimeTime: true })
  })

  it('handles a single-hour selection', () => {
    const result = calculateBookingPrice([10], PRICE_CONFIG)
    expect(result.total).toBe(500)
    expect(result.breakdown).toHaveLength(1)
  })
})

// ─── Rule: Slot Availability ─────────────────────────────────────────────────
// "see exactly which hourly slots are available, booked, or closed"

describe('isSlotAvailable', () => {
  it('returns true when no hours are booked', () => {
    expect(isSlotAvailable(10, [])).toBe(true)
  })

  it('returns false when the hour is in the booked list', () => {
    expect(isSlotAvailable(10, [8, 9, 10, 11])).toBe(false)
  })

  it('returns true for an hour adjacent to—but not in—the booked list', () => {
    expect(isSlotAvailable(12, [8, 9, 10, 11])).toBe(true)
  })

  it('returns false when the booked list contains only that single hour', () => {
    expect(isSlotAvailable(8, [8])).toBe(false)
  })
})

// ─── Rule: Contiguous Slot Selection (click) ──────────────────────────────────
// "clicking individual hours … to book contiguous hours"

describe('isSelectionContiguous', () => {
  it('returns true for a single slot', () => {
    expect(isSelectionContiguous([10])).toBe(true)
  })

  it('returns true for multiple consecutive hours', () => {
    expect(isSelectionContiguous([8, 9, 10, 11])).toBe(true)
  })

  it('returns false when there is a gap between two hours', () => {
    expect(isSelectionContiguous([8, 10])).toBe(false)
  })

  it('returns false for two non-adjacent hours regardless of distance', () => {
    expect(isSelectionContiguous([8, 15])).toBe(false)
  })

  it('returns true for an empty selection (no invariant to violate)', () => {
    expect(isSelectionContiguous([])).toBe(true)
  })

  it('evaluates contiguity on the sorted order, not insertion order', () => {
    // [10, 8, 9] sorted is [8, 9, 10] — contiguous
    expect(isSelectionContiguous([10, 8, 9])).toBe(true)
  })

  it('returns false for out-of-order non-contiguous input', () => {
    expect(isSelectionContiguous([10, 8])).toBe(false)
  })
})

describe('getUpdatedSelection (click-to-select)', () => {
  it('adds a slot to an empty selection', () => {
    expect(getUpdatedSelection([], 10)).toEqual([10])
  })

  it('extends the selection by clicking a slot adjacent to the end', () => {
    expect(getUpdatedSelection([8, 9], 10)).toEqual([8, 9, 10])
  })

  it('extends the selection by clicking a slot adjacent to the start', () => {
    expect(getUpdatedSelection([9, 10], 8)).toEqual([8, 9, 10])
  })

  it('clears the selection when clicking an already-selected slot', () => {
    // Clicking a selected slot resets so the user can start a new selection
    expect(getUpdatedSelection([8, 9, 10], 8)).toEqual([])
  })

  it('rejects a non-contiguous slot and leaves selection unchanged', () => {
    // [8, 9] + hour 12 would leave a gap at 10 and 11
    expect(getUpdatedSelection([8, 9], 12)).toEqual([8, 9])
  })
})

// ─── Rule: Drag-to-Select ─────────────────────────────────────────────────────
// "clicking and dragging across multiple slots to book contiguous hours"

describe('selectSlotRange (drag-to-select)', () => {
  it('returns all hours between fromHour and toHour inclusive', () => {
    expect(selectSlotRange(10, 13)).toEqual([10, 11, 12, 13])
  })

  it('returns a single-element array when from and to are the same', () => {
    expect(selectSlotRange(10, 10)).toEqual([10])
  })

  it('handles a drag in reverse direction (to < from)', () => {
    // User drags upward — still produces an ordered range
    expect(selectSlotRange(13, 10)).toEqual([10, 11, 12, 13])
  })

  it('returns a two-slot range for adjacent hours', () => {
    expect(selectSlotRange(15, 16)).toEqual([15, 16])
  })

  it('produces a range that is always contiguous', () => {
    const range = selectSlotRange(8, 12)
    expect(isSelectionContiguous(range)).toBe(true)
  })
})

// ─── Rule: Business Operating Hours ──────────────────────────────────────────
// "define their weekly operating hours … designate specific days as closed"

describe('isBusinessOpen', () => {
  it('returns true for a day that is open', () => {
    expect(isBusinessOpen(1, WEEKLY_SCHEDULE)).toBe(true) // Monday
  })

  it('returns false for a day explicitly marked as closed', () => {
    expect(isBusinessOpen(6, WEEKLY_SCHEDULE)).toBe(false) // Saturday
  })

  it('returns true for Sunday when Sunday is configured as open', () => {
    expect(isBusinessOpen(0, WEEKLY_SCHEDULE)).toBe(true)
  })

  it('returns false when a day has no schedule entry (treated as closed by default)', () => {
    const partialSchedule: WeeklySchedule[] = [
      { dayOfWeek: 1, openHour: 8, closeHour: 22, isClosed: false },
    ]
    expect(isBusinessOpen(3, partialSchedule)).toBe(false) // Wednesday not listed
  })

  it('returns false when every day is marked closed', () => {
    const allClosed = WEEKLY_SCHEDULE.map(d => ({ ...d, isClosed: true }))
    expect(isBusinessOpen(1, allClosed)).toBe(false)
  })
})

// ─── Rule: Double-Booking Prevention ─────────────────────────────────────────
// "If two users try to book the exact same slot … grant it to the first user
//  and safely block the second user with an error message."

describe('detectBookingConflict', () => {
  const existing: ExistingBooking[] = [
    { courtId: 'court-1', date: '2026-04-24', hours: [10, 11, 12] },
    { courtId: 'court-2', date: '2026-04-24', hours: [10, 11] },
  ]

  it('returns false when there are no existing bookings', () => {
    expect(detectBookingConflict('court-1', '2026-04-24', [10, 11], [])).toBe(false)
  })

  it('returns false when the requested hours are free on that court and date', () => {
    expect(detectBookingConflict('court-1', '2026-04-24', [14, 15], existing)).toBe(false)
  })

  it('returns true when every requested hour overlaps an existing booking', () => {
    expect(detectBookingConflict('court-1', '2026-04-24', [10, 11], existing)).toBe(true)
  })

  it('returns true when even one requested hour overlaps (partial conflict)', () => {
    // Hours 12 and 13 — only 12 is booked, but that is enough to block
    expect(detectBookingConflict('court-1', '2026-04-24', [12, 13], existing)).toBe(true)
  })

  it('returns false for a conflicting hour on a different court', () => {
    // Hour 10 on court-1 is taken, but court-3 is clear
    expect(detectBookingConflict('court-3', '2026-04-24', [10, 11], existing)).toBe(false)
  })

  it('returns false for a conflicting hour on a different date', () => {
    expect(detectBookingConflict('court-1', '2026-04-25', [10, 11], existing)).toBe(false)
  })

  it('returns false when the booked range is adjacent but not overlapping', () => {
    // court-1 has 10–12; requesting 13–14 should be clear
    expect(detectBookingConflict('court-1', '2026-04-24', [13, 14], existing)).toBe(false)
  })
})

// ─── Rule: Selection Reset on Court Switch ────────────────────────────────────
// "If a user highlights a block of time but switches to view a different
//  court/facility, the system must reset their selection"

describe('shouldResetSelection', () => {
  it('returns true when the user navigates to a different court', () => {
    expect(shouldResetSelection('court-1', 'court-2')).toBe(true)
  })

  it('returns false when the court has not changed', () => {
    expect(shouldResetSelection('court-1', 'court-1')).toBe(false)
  })

  it('returns true when switching from an initial empty state to any court', () => {
    expect(shouldResetSelection('', 'court-1')).toBe(true)
  })

  it('returns true regardless of how many courts exist', () => {
    expect(shouldResetSelection('indoor-court-2', 'outdoor-court-1')).toBe(true)
  })
})
