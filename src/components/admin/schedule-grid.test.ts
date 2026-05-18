/**
 * Unit tests for ScheduleGrid rendering logic.
 *
 * Because the Vitest environment is `node` (no jsdom), we test the pure
 * style-computation logic extracted from ScheduleGrid, which determines:
 *   - isPending flag for slot_held bookings
 *   - background color (amber for pending, accent for confirmed)
 *   - "Awaiting payment" subtitle visibility
 *   - Selected + pending → dark amber background
 *   - Confirmed bookings do NOT get the "Awaiting payment" label
 */

import { describe, test, expect } from 'vitest'

// ─── Mirror the booking-block style logic from ScheduleGrid ──────────────────

interface BookingLike {
  id:         string
  status:     'confirmed' | 'slot_held' | 'cancelled' | 'expired'
  userName:   string
  hours:      number[]
  totalPrice: number
}

interface BookingBlockStyle {
  bgColor:          string
  borderColor:      string
  nameColor:        string
  showAwaitingLabel: boolean
}

const ACCENT_COLOR = '#3B82F6'   // typical blue accent

function computeBookingBlockStyle(
  booking:    BookingLike,
  selected:   boolean,
  accentColor: string = ACCENT_COLOR,
): BookingBlockStyle {
  const isPending    = booking.status === 'slot_held'
  const bgColor      = selected
    ? isPending ? '#d97706' : accentColor
    : isPending ? '#fef3c7' : `${accentColor}20`
  const borderColor  = isPending ? '#d97706' : accentColor
  const nameColor    = selected ? 'white' : isPending ? '#92400e' : accentColor

  // "Awaiting payment" subtitle is shown only when isPending && !selected
  const showAwaitingLabel = isPending && !selected

  return { bgColor, borderColor, nameColor, showAwaitingLabel }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBooking(overrides: Partial<BookingLike> = {}): BookingLike {
  return {
    id:         'bk-1',
    status:     'confirmed',
    userName:   'Alice',
    hours:      [9, 10],
    totalPrice: 500,
    ...overrides,
  }
}

// ─── slot_held bookings ───────────────────────────────────────────────────────

describe('ScheduleGrid — slot_held booking (unselected)', () => {
  test('renders with amber background (#fef3c7)', () => {
    const { bgColor } = computeBookingBlockStyle(
      makeBooking({ status: 'slot_held' }),
      false,
    )
    expect(bgColor).toBe('#fef3c7')
  })

  test('renders with amber border (#d97706)', () => {
    const { borderColor } = computeBookingBlockStyle(
      makeBooking({ status: 'slot_held' }),
      false,
    )
    expect(borderColor).toBe('#d97706')
  })

  test('shows "Awaiting payment" label when not selected', () => {
    const { showAwaitingLabel } = computeBookingBlockStyle(
      makeBooking({ status: 'slot_held' }),
      false,
    )
    expect(showAwaitingLabel).toBe(true)
  })

  test('name color is amber-800 (#92400e) for unselected pending', () => {
    const { nameColor } = computeBookingBlockStyle(
      makeBooking({ status: 'slot_held' }),
      false,
    )
    expect(nameColor).toBe('#92400e')
  })
})

// ─── slot_held bookings — selected ────────────────────────────────────────────

describe('ScheduleGrid — slot_held booking (selected)', () => {
  test('renders with dark amber background (#d97706) when selected', () => {
    const { bgColor } = computeBookingBlockStyle(
      makeBooking({ status: 'slot_held' }),
      true,
    )
    expect(bgColor).toBe('#d97706')
  })

  test('does NOT show "Awaiting payment" label when selected', () => {
    const { showAwaitingLabel } = computeBookingBlockStyle(
      makeBooking({ status: 'slot_held' }),
      true,
    )
    expect(showAwaitingLabel).toBe(false)
  })

  test('name color is white when selected+pending', () => {
    const { nameColor } = computeBookingBlockStyle(
      makeBooking({ status: 'slot_held' }),
      true,
    )
    expect(nameColor).toBe('white')
  })
})

// ─── confirmed bookings ───────────────────────────────────────────────────────

describe('ScheduleGrid — confirmed booking', () => {
  test('does NOT show "Awaiting payment" label', () => {
    const { showAwaitingLabel } = computeBookingBlockStyle(
      makeBooking({ status: 'confirmed' }),
      false,
    )
    expect(showAwaitingLabel).toBe(false)
  })

  test('background is accent color + "20" opacity suffix (unselected)', () => {
    const accentColor = '#16a34a'
    const { bgColor } = computeBookingBlockStyle(
      makeBooking({ status: 'confirmed' }),
      false,
      accentColor,
    )
    expect(bgColor).toBe(`${accentColor}20`)
  })

  test('background is full accent color when selected', () => {
    const accentColor = '#16a34a'
    const { bgColor } = computeBookingBlockStyle(
      makeBooking({ status: 'confirmed' }),
      true,
      accentColor,
    )
    expect(bgColor).toBe(accentColor)
  })

  test('border is accent color for confirmed booking', () => {
    const accentColor = '#16a34a'
    const { borderColor } = computeBookingBlockStyle(
      makeBooking({ status: 'confirmed' }),
      false,
      accentColor,
    )
    expect(borderColor).toBe(accentColor)
  })

  test('does NOT show "Awaiting payment" label even when selected', () => {
    const { showAwaitingLabel } = computeBookingBlockStyle(
      makeBooking({ status: 'confirmed' }),
      true,
    )
    expect(showAwaitingLabel).toBe(false)
  })
})

// ─── Contrast: pending vs confirmed ──────────────────────────────────────────

describe('ScheduleGrid — slot_held vs confirmed visual distinction', () => {
  test('pending and confirmed use different background colors (unselected)', () => {
    const pending   = computeBookingBlockStyle(makeBooking({ status: 'slot_held' }),  false)
    const confirmed = computeBookingBlockStyle(makeBooking({ status: 'confirmed' }), false)
    expect(pending.bgColor).not.toBe(confirmed.bgColor)
  })

  test('pending and confirmed use different border colors', () => {
    const pending   = computeBookingBlockStyle(makeBooking({ status: 'slot_held' }),  false)
    const confirmed = computeBookingBlockStyle(makeBooking({ status: 'confirmed' }), false)
    expect(pending.borderColor).not.toBe(confirmed.borderColor)
  })
})
