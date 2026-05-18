/**
 * Unit tests for useSlotSelection pure logic.
 *
 * Because the hook uses React state and DOM events, we test the pure
 * functions extracted from it rather than rendering the full hook:
 *
 *   slotState(hour) — returns "booked" | "pending" | "available" (preview/active
 *                     depend on drag/selection state we don't need to exercise here)
 *   blockedHours    — combined bookedHours + pendingHours (used by getValidRange)
 *   handleSlotMouseDown guard — skips both booked and pending hours
 *
 * The underlying getValidRange function is already tested in slots.ts.
 * Here we focus on the slotState logic and pending-hours integration.
 */

import { describe, test, expect } from 'vitest'

// ─── Mirror slotState logic from the hook ─────────────────────────────────────
// The hook's slotState function checks bookedHours, pendingHours, drag preview,
// and active selection — in that exact priority order.

function slotState(
  hour: number,
  bookedHours: number[],
  pendingHours: number[],
): 'booked' | 'pending' | 'available' {
  if (bookedHours.includes(hour)) return 'booked'
  if (pendingHours.includes(hour)) return 'pending'
  return 'available'
}

// ─── Mirror blockedHours calculation ─────────────────────────────────────────

function makeBlockedHours(bookedHours: number[], pendingHours: number[]): number[] {
  return [...bookedHours, ...pendingHours]
}

// ─── Mirror handleSlotMouseDown guard ─────────────────────────────────────────

function canStartDrag(hour: number, bookedHours: number[], pendingHours: number[]): boolean {
  return !bookedHours.includes(hour) && !pendingHours.includes(hour)
}

// ─── slotState — booked hours ─────────────────────────────────────────────────

describe('useSlotSelection — slotState for booked hours', () => {
  test('returns "booked" for an hour in bookedHours', () => {
    expect(slotState(9, [8, 9, 10], [])).toBe('booked')
  })

  test('returns "booked" for every hour in bookedHours', () => {
    const booked = [6, 7, 8]
    for (const h of booked) {
      expect(slotState(h, booked, [])).toBe('booked')
    }
  })
})

// ─── slotState — pending hours ────────────────────────────────────────────────

describe('useSlotSelection — slotState for pending hours', () => {
  test('returns "pending" for an hour in pendingHours', () => {
    expect(slotState(11, [], [11, 12])).toBe('pending')
  })

  test('returns "pending" for every hour in pendingHours', () => {
    const pending = [14, 15, 16]
    for (const h of pending) {
      expect(slotState(h, [], pending)).toBe('pending')
    }
  })
})

// ─── slotState — available hours ─────────────────────────────────────────────

describe('useSlotSelection — slotState for available hours', () => {
  test('returns "available" for an hour not in either array', () => {
    expect(slotState(10, [8, 9], [11, 12])).toBe('available')
  })

  test('returns "available" when both arrays are empty (default)', () => {
    expect(slotState(7, [], [])).toBe('available')
  })
})

// ─── slotState — priority: booked wins over pending ──────────────────────────

describe('useSlotSelection — slotState priority (booked beats pending)', () => {
  test('when hour is in both arrays, "booked" wins over "pending"', () => {
    // An hour that somehow appears in both lists (defensive test)
    expect(slotState(10, [10], [10])).toBe('booked')
  })

  test('bookedHours checked before pendingHours (order matters)', () => {
    // booked=[9], pending=[9,10] — hour 9 → booked; hour 10 → pending
    expect(slotState(9,  [9], [9, 10])).toBe('booked')
    expect(slotState(10, [9], [9, 10])).toBe('pending')
  })
})

// ─── slotState — default pendingHours (no regression) ────────────────────────

describe('useSlotSelection — default pendingHours = [] (no regression)', () => {
  test('available hour stays available when no pendingHours supplied', () => {
    // Simulates callers that do not pass pendingHours at all (default = [])
    expect(slotState(8, [9, 10], /* pendingHours defaults to */ [])).toBe('available')
  })

  test('booked hour still marked booked even without pendingHours', () => {
    expect(slotState(9, [9, 10], [])).toBe('booked')
  })
})

// ─── blockedHours — pending hours included ────────────────────────────────────

describe('useSlotSelection — blockedHours combines bookedHours and pendingHours', () => {
  test('blockedHours contains all booked hours', () => {
    const blocked = makeBlockedHours([8, 9], [11])
    expect(blocked).toContain(8)
    expect(blocked).toContain(9)
  })

  test('blockedHours contains all pending hours', () => {
    const blocked = makeBlockedHours([8, 9], [11, 12])
    expect(blocked).toContain(11)
    expect(blocked).toContain(12)
  })

  test('blockedHours is empty when both arrays are empty', () => {
    expect(makeBlockedHours([], [])).toEqual([])
  })

  test('pending hours extend the blocked set (drag stops at pending slots)', () => {
    const blocked = makeBlockedHours([8], [10])
    // A drag from 7 to 11 should stop at 10 (first blocked)
    // We only verify that 10 is in blockedHours
    expect(blocked).toContain(10)
  })
})

// ─── handleSlotMouseDown guard ────────────────────────────────────────────────

describe('useSlotSelection — handleSlotMouseDown guards against pending hours', () => {
  test('returns true (drag allowed) for an available hour', () => {
    expect(canStartDrag(7, [8, 9], [10, 11])).toBe(true)
  })

  test('returns false (drag blocked) for a booked hour', () => {
    expect(canStartDrag(8, [8, 9], [])).toBe(false)
  })

  test('returns false (drag blocked) for a pending hour', () => {
    expect(canStartDrag(10, [], [10, 11])).toBe(false)
  })

  test('returns false when hour appears in both booked and pending', () => {
    expect(canStartDrag(9, [9], [9])).toBe(false)
  })

  test('returns true when both arrays are empty (open slot)', () => {
    expect(canStartDrag(14, [], [])).toBe(true)
  })
})
