/**
 * Unit tests for Step5Review Payments section logic.
 *
 * The Vitest environment is `node` (no jsdom).  We test the pure conditional
 * logic that determines which payment-method badges are rendered:
 *   draft.accepts_qr      → "QR Code" badge
 *   draft.accepts_cash    → "Pay at Venue" badge
 *   draft.accepts_gateway → "Online Gateway" badge
 */

import { describe, test, expect } from 'vitest'

// ─── Mirror the payment badge visibility logic from Step5Review ───────────────

interface PaymentDraft {
  accepts_qr:      boolean
  accepts_cash:    boolean
  accepts_gateway: boolean
}

/** Returns the list of payment badge labels that should be visible for a draft. */
function visiblePaymentBadges(draft: PaymentDraft): string[] {
  const badges: string[] = []
  if (draft.accepts_qr)      badges.push('QR Code')
  if (draft.accepts_cash)    badges.push('Pay at Venue')
  if (draft.accepts_gateway) badges.push('Online Gateway')
  return badges
}

// ─── QR Code badge ────────────────────────────────────────────────────────────

describe('Step5Review — Payments section — QR Code badge', () => {
  test('shows "QR Code" badge when accepts_qr is true', () => {
    const badges = visiblePaymentBadges({ accepts_qr: true, accepts_cash: false, accepts_gateway: false })
    expect(badges).toContain('QR Code')
  })

  test('does NOT show "QR Code" badge when accepts_qr is false', () => {
    const badges = visiblePaymentBadges({ accepts_qr: false, accepts_cash: true, accepts_gateway: true })
    expect(badges).not.toContain('QR Code')
  })
})

// ─── Pay at Venue badge ───────────────────────────────────────────────────────

describe('Step5Review — Payments section — Pay at Venue badge', () => {
  test('shows "Pay at Venue" badge when accepts_cash is true', () => {
    const badges = visiblePaymentBadges({ accepts_qr: false, accepts_cash: true, accepts_gateway: false })
    expect(badges).toContain('Pay at Venue')
  })

  test('does NOT show "Pay at Venue" badge when accepts_cash is false', () => {
    const badges = visiblePaymentBadges({ accepts_qr: true, accepts_cash: false, accepts_gateway: true })
    expect(badges).not.toContain('Pay at Venue')
  })
})

// ─── Online Gateway badge ─────────────────────────────────────────────────────

describe('Step5Review — Payments section — Online Gateway badge', () => {
  test('shows "Online Gateway" badge when accepts_gateway is true', () => {
    const badges = visiblePaymentBadges({ accepts_qr: false, accepts_cash: false, accepts_gateway: true })
    expect(badges).toContain('Online Gateway')
  })

  test('does NOT show "Online Gateway" badge when accepts_gateway is false', () => {
    const badges = visiblePaymentBadges({ accepts_qr: true, accepts_cash: true, accepts_gateway: false })
    expect(badges).not.toContain('Online Gateway')
  })
})

// ─── No badges when all false ─────────────────────────────────────────────────

describe('Step5Review — Payments section — no badges when all false', () => {
  test('returns empty badge list when all payment flags are false', () => {
    const badges = visiblePaymentBadges({ accepts_qr: false, accepts_cash: false, accepts_gateway: false })
    expect(badges).toHaveLength(0)
  })
})

// ─── All three badges ─────────────────────────────────────────────────────────

describe('Step5Review — Payments section — all three badges', () => {
  test('shows all three badges when all payment flags are true', () => {
    const badges = visiblePaymentBadges({ accepts_qr: true, accepts_cash: true, accepts_gateway: true })
    expect(badges).toHaveLength(3)
    expect(badges).toContain('QR Code')
    expect(badges).toContain('Pay at Venue')
    expect(badges).toContain('Online Gateway')
  })

  test('badges appear in order: QR Code → Pay at Venue → Online Gateway', () => {
    const badges = visiblePaymentBadges({ accepts_qr: true, accepts_cash: true, accepts_gateway: true })
    expect(badges[0]).toBe('QR Code')
    expect(badges[1]).toBe('Pay at Venue')
    expect(badges[2]).toBe('Online Gateway')
  })
})
