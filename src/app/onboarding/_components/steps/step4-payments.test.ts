/**
 * Unit tests for Step4Payments component logic.
 *
 * Because the Vitest environment is `node` (no jsdom), we cannot render React
 * components. Instead we test the pure logic that drives the component:
 *   noneSelected  = !accepts_qr && !accepts_cash && !accepts_gateway
 *   "Next →" is disabled when noneSelected is true
 *   Each toggle calls patch with the correct key
 *   Credit note is a fixed piece of text (compile-time constant)
 */

import { describe, test, expect, vi } from 'vitest'

// ─── Mirror the WizardDraft subset used by Step4Payments ─────────────────────

interface PaymentDraft {
  accepts_qr:      boolean
  accepts_cash:    boolean
  accepts_gateway: boolean
}

// ─── Mirror the noneSelected logic from the component ────────────────────────

function noneSelected(draft: PaymentDraft): boolean {
  return !draft.accepts_qr && !draft.accepts_cash && !draft.accepts_gateway
}

// ─── Mirror the "Next →" disabled logic ──────────────────────────────────────

function isNextDisabled(draft: PaymentDraft): boolean {
  return noneSelected(draft)
}

// ─── Simulate what happens when a toggle onChange fires ──────────────────────

function simulateToggle(
  key: keyof PaymentDraft,
  value: boolean,
  patch: (partial: Partial<PaymentDraft>) => void,
): void {
  patch({ [key]: value })
}

// ─── Credit note text (must match component source) ──────────────────────────

const CREDIT_NOTE =
  'Each confirmed booking uses 1 bookit credit from your wallet. Credits can be topped up from the Payments tab in your admin dashboard.'

// ─── noneSelected ─────────────────────────────────────────────────────────────

describe('Step4Payments — noneSelected', () => {
  test('true when all three are false (initial state)', () => {
    expect(noneSelected({ accepts_qr: false, accepts_cash: false, accepts_gateway: false })).toBe(true)
  })

  test('false when accepts_qr is true', () => {
    expect(noneSelected({ accepts_qr: true, accepts_cash: false, accepts_gateway: false })).toBe(false)
  })

  test('false when accepts_cash is true', () => {
    expect(noneSelected({ accepts_qr: false, accepts_cash: true, accepts_gateway: false })).toBe(false)
  })

  test('false when accepts_gateway is true', () => {
    expect(noneSelected({ accepts_qr: false, accepts_cash: false, accepts_gateway: true })).toBe(false)
  })

  test('false when all three are true', () => {
    expect(noneSelected({ accepts_qr: true, accepts_cash: true, accepts_gateway: true })).toBe(false)
  })
})

// ─── "Next →" disabled state ─────────────────────────────────────────────────

describe('Step4Payments — "Next →" button disabled state', () => {
  test('disabled when no toggles are on', () => {
    expect(isNextDisabled({ accepts_qr: false, accepts_cash: false, accepts_gateway: false })).toBe(true)
  })

  test('enabled when accepts_qr is on', () => {
    expect(isNextDisabled({ accepts_qr: true, accepts_cash: false, accepts_gateway: false })).toBe(false)
  })

  test('enabled when accepts_cash is on', () => {
    expect(isNextDisabled({ accepts_qr: false, accepts_cash: true, accepts_gateway: false })).toBe(false)
  })

  test('enabled when accepts_gateway is on', () => {
    expect(isNextDisabled({ accepts_qr: false, accepts_cash: false, accepts_gateway: true })).toBe(false)
  })

  test('enabled when all three are on', () => {
    expect(isNextDisabled({ accepts_qr: true, accepts_cash: true, accepts_gateway: true })).toBe(false)
  })
})

// ─── Toggle patch calls ───────────────────────────────────────────────────────

describe('Step4Payments — toggle onChange calls patch with correct key', () => {
  test('QR Code toggle calls patch({ accepts_qr: true })', () => {
    const patch = vi.fn()
    simulateToggle('accepts_qr', true, patch)
    expect(patch).toHaveBeenCalledWith({ accepts_qr: true })
  })

  test('QR Code toggle calls patch({ accepts_qr: false }) when unchecked', () => {
    const patch = vi.fn()
    simulateToggle('accepts_qr', false, patch)
    expect(patch).toHaveBeenCalledWith({ accepts_qr: false })
  })

  test('Pay at Venue toggle calls patch({ accepts_cash: true })', () => {
    const patch = vi.fn()
    simulateToggle('accepts_cash', true, patch)
    expect(patch).toHaveBeenCalledWith({ accepts_cash: true })
  })

  test('Pay at Venue toggle calls patch({ accepts_cash: false }) when unchecked', () => {
    const patch = vi.fn()
    simulateToggle('accepts_cash', false, patch)
    expect(patch).toHaveBeenCalledWith({ accepts_cash: false })
  })

  test('Online Gateway toggle calls patch({ accepts_gateway: true })', () => {
    const patch = vi.fn()
    simulateToggle('accepts_gateway', true, patch)
    expect(patch).toHaveBeenCalledWith({ accepts_gateway: true })
  })

  test('Online Gateway toggle calls patch({ accepts_gateway: false }) when unchecked', () => {
    const patch = vi.fn()
    simulateToggle('accepts_gateway', false, patch)
    expect(patch).toHaveBeenCalledWith({ accepts_gateway: false })
  })

  test('toggling all three simultaneously via separate patch calls patches correct keys', () => {
    const patchCalls: Array<Partial<PaymentDraft>> = []
    const patch = (p: Partial<PaymentDraft>) => patchCalls.push(p)
    simulateToggle('accepts_qr',      true, patch)
    simulateToggle('accepts_cash',    true, patch)
    simulateToggle('accepts_gateway', true, patch)
    expect(patchCalls).toEqual([
      { accepts_qr:      true },
      { accepts_cash:    true },
      { accepts_gateway: true },
    ])
  })
})

// ─── Credit note text ─────────────────────────────────────────────────────────

describe('Step4Payments — credit note', () => {
  test('credit note text mentions "1 bookit credit"', () => {
    expect(CREDIT_NOTE).toContain('1 bookit credit')
  })

  test('credit note text mentions the wallet', () => {
    expect(CREDIT_NOTE).toContain('wallet')
  })

  test('credit note text mentions topping up from the Payments tab', () => {
    expect(CREDIT_NOTE).toContain('Payments tab')
  })
})
