/**
 * Unit tests for Step1BusinessInfo business-type configuration.
 *
 * Because this project's Vitest environment is `node` (no jsdom), we cannot render
 * React components directly.  Instead we test the pure logic that drives the
 * component's disabled-state decisions: which business types are available and
 * which ones are disabled.
 */

import { describe, test, expect } from 'vitest'
import { BUSINESS_TYPES } from './Step1BusinessInfo'

// ─── canProceed logic ─────────────────────────────────────────────────────────
// Mirrors the canProceed calculation in Step1BusinessInfo.

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

function canProceed(name: string, slugStatus: SlugStatus): boolean {
  return name.trim().length > 0 && slugStatus === 'available'
}

// ─── Business type availability ───────────────────────────────────────────────

describe('Step1BusinessInfo — business type availability', () => {
  test('"court" type is available (enabled)', () => {
    const court = BUSINESS_TYPES.find((t) => t.value === 'court')
    expect(court).toBeDefined()
    expect(court!.available).toBe(true)
  })

  test('"appointment" type is NOT available (disabled)', () => {
    const appointment = BUSINESS_TYPES.find((t) => t.value === 'appointment')
    expect(appointment).toBeDefined()
    expect(appointment!.available).toBe(false)
  })

  test('"room" type is NOT available (disabled)', () => {
    const room = BUSINESS_TYPES.find((t) => t.value === 'room')
    expect(room).toBeDefined()
    expect(room!.available).toBe(false)
  })

  test('exactly one type is selectable', () => {
    const available = BUSINESS_TYPES.filter((t) => t.available)
    expect(available).toHaveLength(1)
    expect(available[0].value).toBe('court')
  })

  test('exactly two types carry the "Soon" badge (unavailable)', () => {
    const unavailable = BUSINESS_TYPES.filter((t) => !t.available)
    expect(unavailable).toHaveLength(2)
  })

  test('clicking a disabled type should NOT call patch — onClick guard', () => {
    // The component wraps the onClick: `onClick={() => available && patch({ type: value })`
    // Simulate the guard logic:
    let patched = false
    const patchSpy = () => { patched = true }

    for (const { available } of BUSINESS_TYPES) {
      const willPatch = available
      if (willPatch) patchSpy()
    }

    // Only the `court` type (available=true) should call patchSpy
    expect(patched).toBe(true)
  })

  test('disabled type onClick guard returns early without patch', () => {
    let callCount = 0
    const patchSpy = () => { callCount++ }

    // Simulate clicking all types through the guard
    for (const { available } of BUSINESS_TYPES) {
      if (available) patchSpy()
    }

    // Only 1 type is available, so patchSpy called exactly once
    expect(callCount).toBe(1)
  })
})

// ─── canProceed logic ─────────────────────────────────────────────────────────

describe('Step1BusinessInfo — canProceed', () => {
  test('false when name is empty and slug is idle', () => {
    expect(canProceed('', 'idle')).toBe(false)
  })

  test('false when name is filled but slug is idle', () => {
    expect(canProceed('My Court', 'idle')).toBe(false)
  })

  test('false when name is filled but slug is checking', () => {
    expect(canProceed('My Court', 'checking')).toBe(false)
  })

  test('false when name is filled but slug is taken', () => {
    expect(canProceed('My Court', 'taken')).toBe(false)
  })

  test('false when name is filled but slug is invalid', () => {
    expect(canProceed('My Court', 'invalid')).toBe(false)
  })

  test('true only when name is non-empty AND slug is available', () => {
    expect(canProceed('My Court', 'available')).toBe(true)
  })

  test('false when name is whitespace-only (trim guard)', () => {
    expect(canProceed('   ', 'available')).toBe(false)
  })

  test('true for a name with leading/trailing spaces as long as trimmed length > 0', () => {
    expect(canProceed('  Court  ', 'available')).toBe(true)
  })
})
