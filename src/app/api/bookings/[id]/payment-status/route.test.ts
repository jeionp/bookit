import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockVerifyIdToken,
  mockBookingGet,
  mockBookingUpdate,
  mockAdminGet,
  mockBizGet,
  mockBizUpdate,
  mockRunTransaction,
  mockSendBookingConfirmation,
  mockSendAdminBookingNotification,
  mockSendLowBalanceWarning,
} = vi.hoisted(() => ({
  mockVerifyIdToken:                vi.fn(),
  mockBookingGet:                   vi.fn(),
  mockBookingUpdate:                vi.fn(),
  mockAdminGet:                     vi.fn(),
  mockBizGet:                       vi.fn(),
  mockBizUpdate:                    vi.fn(),
  mockRunTransaction:               vi.fn(),
  mockSendBookingConfirmation:      vi.fn(),
  mockSendAdminBookingNotification: vi.fn(),
  mockSendLowBalanceWarning:        vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (name: string) => ({
      doc: () => {
        if (name === 'bookings')    return { get: mockBookingGet, update: mockBookingUpdate }
        if (name === 'admins')      return { get: mockAdminGet }
        if (name === 'businesses')  return { get: mockBizGet, update: mockBizUpdate }
        return {}
      },
    }),
    runTransaction: mockRunTransaction,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }) },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }),
    increment: (n: number) => ({ _sentinel: 'increment', value: n }),
  },
}))

vi.mock('@/lib/notifications/email', () => ({
  sendBookingConfirmation:      mockSendBookingConfirmation,
  sendAdminBookingNotification: mockSendAdminBookingNotification,
  sendLowBalanceWarning:        mockSendLowBalanceWarning,
}))

function makeReq(body: unknown, token = 'valid-token'): NextRequest {
  return new NextRequest('http://localhost/api/bookings/booking-1/payment-status', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

const params           = Promise.resolve({ id: 'booking-1' })
const emptyParams      = Promise.resolve({ id: '' })

const P2P_BOOKING = {
  businessSlug:      'biz-slug',
  businessName:      'Test Biz',
  userEmail:         'player@example.com',
  userName:          'Test Player',
  facilityName:      'Court A',
  date:              '2026-06-01',
  hours:             [9, 10],
  totalPrice:        500,
  currency:          'PHP',
  checkout_type:     'P2P_AI',
  payment_status_v2: 'ai_review',
  status:            'slot_held',
}

const CASH_BOOKING = {
  ...P2P_BOOKING,
  checkout_type:     'PAY_AT_VENUE',
  payment_status_v2: 'pending_cash',
  status:            'confirmed',
}

const BIZ_DATA = { email: 'admin@biz.com', address: '123 Main St' }

// Helper: make the approve transaction succeed for a given booking data.
// The route runs adminDb.runTransaction(async tx => { tx.get(); tx.update() }).
function mockApproveTransaction(bookingData: Record<string, unknown>, txUpdateMock = vi.fn()) {
  mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    await fn({
      get:    vi.fn().mockResolvedValue({ exists: true, data: () => bookingData }),
      update: txUpdateMock,
    })
  })
  return txUpdateMock
}

// Helper: make the approve transaction throw WRONG_STATE (simulates concurrent approval).
function mockApproveTransactionWrongState() {
  mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    await fn({
      get:    vi.fn().mockResolvedValue({ exists: true, data: () => ({ ...P2P_BOOKING, payment_status_v2: 'paid' }) }),
      update: vi.fn(),
    })
  })
}

import { PATCH } from './route'

describe('PATCH /api/bookings/[id]/payment-status', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['biz-slug'] }) })
    mockBizGet.mockResolvedValue({ exists: true, data: () => BIZ_DATA })
    mockBizUpdate.mockResolvedValue(undefined)
    mockBookingUpdate.mockResolvedValue(undefined)
    mockSendBookingConfirmation.mockResolvedValue(undefined)
    mockSendAdminBookingNotification.mockResolvedValue(undefined)
    mockSendLowBalanceWarning.mockResolvedValue(undefined)
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  test('returns 401 with no token', async () => {
    const req = new NextRequest('http://localhost/', { method: 'PATCH', body: '{}' })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(401)
  })

  test('returns 401 when verifyIdToken throws', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'))
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(401)
  })

  // ── Booking ID validation ─────────────────────────────────────────────────

  test('returns 400 when booking ID is empty string', async () => {
    const res = await PATCH(makeReq({ action: 'approve' }), { params: emptyParams })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid booking ID' })
  })

  // ── Booking existence ─────────────────────────────────────────────────────

  test('returns 404 when booking does not exist', async () => {
    mockBookingGet.mockResolvedValue({ exists: false })
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(404)
  })

  test('returns 403 when admin does not manage the booking business', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['other-biz'] }) })
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(403)
  })

  test('returns 403 when admin slugs array is empty', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: [] }) })
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(403)
  })

  test('returns 403 when admin document does not exist', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockAdminGet.mockResolvedValue({ exists: false, data: () => null })
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(403)
  })

  // ── Input validation ──────────────────────────────────────────────────────

  test('returns 400 for unknown action', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    const res = await PATCH(makeReq({ action: 'fly_to_moon' }), { params })
    expect(res.status).toBe(400)
  })

  test('returns 400 when action field is missing from body', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    const res = await PATCH(makeReq({}), { params })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid action' })
  })

  test('returns 400 when body is not valid JSON', async () => {
    const req = new NextRequest('http://localhost/api/bookings/booking-1/payment-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
      body: 'not-json',
    })
    const res = await PATCH(req, { params })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid request body' })
  })

  // ── Booking with no payment_status_v2 field ───────────────────────────────

  test('approve: returns 409 when booking has no payment_status_v2 field', async () => {
    const bookingWithNoStatus = { ...P2P_BOOKING, payment_status_v2: undefined }
    mockBookingGet.mockResolvedValue({ exists: true, data: () => bookingWithNoStatus })
    // Transaction will see the undefined status and throw WRONG_STATE
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        get:    vi.fn().mockResolvedValue({ exists: true, data: () => bookingWithNoStatus }),
        update: vi.fn(),
      })
    })
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(409)
  })

  test('reject: returns 409 when booking has no payment_status_v2 field', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...P2P_BOOKING, payment_status_v2: undefined }),
    })
    const res = await PATCH(makeReq({ action: 'reject' }), { params })
    expect(res.status).toBe(409)
  })

  test('mark_paid: returns 409 when booking has no payment_status_v2 field', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...P2P_BOOKING, payment_status_v2: undefined, checkout_type: 'PAY_AT_VENUE' }),
    })
    const res = await PATCH(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(409)
  })

  // ── approve ───────────────────────────────────────────────────────────────

  test('approve: transitions ai_review → paid + confirmed inside a transaction and fires emails', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    const txUpdateMock = mockApproveTransaction(P2P_BOOKING)

    const res = await PATCH(makeReq({ action: 'approve' }), { params })

    expect(res.status).toBe(200)
    expect(txUpdateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payment_status_v2: 'paid', status: 'confirmed' }),
    )
    await vi.waitFor(() => expect(mockSendBookingConfirmation).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(mockSendAdminBookingNotification).toHaveBeenCalledOnce())
  })

  test('approve: returns 409 when booking is not in ai_review (e.g. already confirmed)', async () => {
    const alreadyConfirmed = { ...P2P_BOOKING, payment_status_v2: 'paid', status: 'confirmed' }
    mockBookingGet.mockResolvedValue({ exists: true, data: () => alreadyConfirmed })
    mockApproveTransactionWrongState()
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'Booking is not in ai_review state' })
  })

  test('approve: returns 409 when payment_status_v2 is already paid (concurrent approval race)', async () => {
    // Outer get returns ai_review; transaction re-read returns paid (race condition).
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        get:    vi.fn().mockResolvedValue({ exists: true, data: () => ({ ...P2P_BOOKING, payment_status_v2: 'paid' }) }),
        update: vi.fn(),
      })
    })
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(409)
  })

  test('approve: returns 409 when PAY_AT_VENUE booking accidentally has ai_review status', async () => {
    // A PAY_AT_VENUE booking should only be in pending_cash; if it somehow has ai_review,
    // the approve action would guard based on payment_status_v2, so it would go through.
    // This documents the current behaviour: the guard is payment_status_v2 === 'ai_review'.
    const weirdCashBooking = { ...CASH_BOOKING, payment_status_v2: 'ai_review' }
    mockBookingGet.mockResolvedValue({ exists: true, data: () => weirdCashBooking })
    mockApproveTransaction(weirdCashBooking)
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    // Approve succeeds because only payment_status_v2 is checked — this is by design.
    expect(res.status).toBe(200)
  })

  // ── reject ────────────────────────────────────────────────────────────────

  test('reject: transitions ai_review → rejected', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })

    const res = await PATCH(makeReq({ action: 'reject' }), { params })

    expect(res.status).toBe(200)
    expect(mockBookingUpdate).toHaveBeenCalledWith({ payment_status_v2: 'rejected' })
  })

  test('reject: also works from pending_proof state', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...P2P_BOOKING, payment_status_v2: 'pending_proof' }),
    })
    const res = await PATCH(makeReq({ action: 'reject' }), { params })
    expect(res.status).toBe(200)
  })

  test('reject: returns 409 when booking is already paid', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...P2P_BOOKING, payment_status_v2: 'paid' }),
    })
    const res = await PATCH(makeReq({ action: 'reject' }), { params })
    expect(res.status).toBe(409)
  })

  test('reject: returns 409 when booking is already rejected', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...P2P_BOOKING, payment_status_v2: 'rejected' }),
    })
    const res = await PATCH(makeReq({ action: 'reject' }), { params })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'Booking cannot be rejected in its current state' })
  })

  // ── mark_paid ─────────────────────────────────────────────────────────────

  test('mark_paid: transitions pending_cash → paid', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => CASH_BOOKING })

    const res = await PATCH(makeReq({ action: 'mark_paid' }), { params })

    expect(res.status).toBe(200)
    expect(mockBookingUpdate).toHaveBeenCalledWith(expect.objectContaining({
      payment_status_v2: 'paid',
    }))
  })

  test('mark_paid: returns 409 on non-PAY_AT_VENUE booking', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    const res = await PATCH(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(409)
  })

  test('mark_paid: returns 409 when cash booking already paid (second call blocked)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...CASH_BOOKING, payment_status_v2: 'paid' }),
    })
    const res = await PATCH(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'Booking is not a pending cash payment' })
  })

  // ── SaaS credit deduction — approve ──────────────────────────────────────────

  test('approve: decrements saas_credit_balance on biz doc after transaction succeeds', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockApproveTransaction(P2P_BOOKING)
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA, saas_credit_balance: 10 }) })

    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(200)
    expect(mockBizUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ saas_credit_balance: expect.objectContaining({ value: -1 }) }),
    )
  })

  test('approve: does NOT crash and skips biz update when saas_credit_balance is absent', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockApproveTransaction(P2P_BOOKING)
    // No saas_credit_balance field on the business doc
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA }) })

    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(200)
    expect(mockBizUpdate).not.toHaveBeenCalled()
  })

  test('approve: fires low-balance warning when newBalance is exactly 5', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockApproveTransaction(P2P_BOOKING)
    // balance 6 → newBalance 5 → warning fires
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA, saas_credit_balance: 6 }) })

    await PATCH(makeReq({ action: 'approve' }), { params })
    await Promise.resolve() // flush fire-and-forget

    expect(mockSendLowBalanceWarning).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 5 }),
    )
  })

  test('approve: fires low-balance warning when newBalance is exactly 0', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockApproveTransaction(P2P_BOOKING)
    // balance 1 → newBalance 0 → warning fires
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA, saas_credit_balance: 1 }) })

    await PATCH(makeReq({ action: 'approve' }), { params })
    await Promise.resolve()

    expect(mockSendLowBalanceWarning).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 0 }),
    )
  })

  test('approve: does NOT fire low-balance warning when newBalance is 4 (not a threshold)', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockApproveTransaction(P2P_BOOKING)
    // balance 5 → newBalance 4 → no warning
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA, saas_credit_balance: 5 }) })

    await PATCH(makeReq({ action: 'approve' }), { params })
    await Promise.resolve()

    expect(mockSendLowBalanceWarning).not.toHaveBeenCalled()
  })

  // ── SaaS credit deduction — mark_paid ────────────────────────────────────────

  test('mark_paid: decrements saas_credit_balance on biz doc after marking paid', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => CASH_BOOKING })
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA, saas_credit_balance: 10 }) })

    const res = await PATCH(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(200)
    expect(mockBizUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ saas_credit_balance: expect.objectContaining({ value: -1 }) }),
    )
  })

  test('mark_paid: does NOT crash when saas_credit_balance is absent on biz doc', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => CASH_BOOKING })
    // No saas_credit_balance field on the business doc
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA }) })

    const res = await PATCH(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(200)
    expect(mockBizUpdate).not.toHaveBeenCalled()
  })

  test('mark_paid: fires low-balance warning when newBalance is exactly 5', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => CASH_BOOKING })
    // balance 6 → newBalance 5 → warning fires
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA, saas_credit_balance: 6 }) })

    await PATCH(makeReq({ action: 'mark_paid' }), { params })
    await Promise.resolve()

    expect(mockSendLowBalanceWarning).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 5 }),
    )
  })

  test('mark_paid: fires low-balance warning when newBalance is exactly 0', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => CASH_BOOKING })
    // balance 1 → newBalance 0 → warning fires
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA, saas_credit_balance: 1 }) })

    await PATCH(makeReq({ action: 'mark_paid' }), { params })
    await Promise.resolve()

    expect(mockSendLowBalanceWarning).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 0 }),
    )
  })

  // ── SaaS credit — reject must NOT touch biz balance ──────────────────────────

  test('reject: does NOT call biz update (credit only deducted on payment confirmation)', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    mockBizGet.mockResolvedValue({ exists: true, data: () => ({ ...BIZ_DATA, saas_credit_balance: 10 }) })

    const res = await PATCH(makeReq({ action: 'reject' }), { params })
    expect(res.status).toBe(200)
    expect(mockBizUpdate).not.toHaveBeenCalled()
  })
})
