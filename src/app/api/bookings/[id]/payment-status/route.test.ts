import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockVerifyIdToken,
  mockBookingGet,
  mockBookingUpdate,
  mockAdminGet,
  mockBizGet,
  mockSendBookingConfirmation,
  mockSendAdminBookingNotification,
} = vi.hoisted(() => ({
  mockVerifyIdToken:               vi.fn(),
  mockBookingGet:                  vi.fn(),
  mockBookingUpdate:               vi.fn(),
  mockAdminGet:                    vi.fn(),
  mockBizGet:                      vi.fn(),
  mockSendBookingConfirmation:     vi.fn(),
  mockSendAdminBookingNotification: vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (name: string) => ({
      doc: () => {
        if (name === 'bookings') return { get: mockBookingGet, update: mockBookingUpdate }
        if (name === 'admins')   return { get: mockAdminGet }
        if (name === 'businesses') return { get: mockBizGet }
        return {}
      },
    }),
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }) },
}))

vi.mock('@/lib/notifications/email', () => ({
  sendBookingConfirmation:      mockSendBookingConfirmation,
  sendAdminBookingNotification: mockSendAdminBookingNotification,
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

const params = Promise.resolve({ id: 'booking-1' })

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

import { PATCH } from './route'

describe('PATCH /api/bookings/[id]/payment-status', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['biz-slug'] }) })
    mockBizGet.mockResolvedValue({ exists: true, data: () => BIZ_DATA })
    mockBookingUpdate.mockResolvedValue(undefined)
    mockSendBookingConfirmation.mockResolvedValue(undefined)
    mockSendAdminBookingNotification.mockResolvedValue(undefined)
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

  test('returns 400 for unknown action', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })
    const res = await PATCH(makeReq({ action: 'fly_to_moon' }), { params })
    expect(res.status).toBe(400)
  })

  // ── approve ───────────────────────────────────────────────────────────────

  test('approve: transitions ai_review → paid + confirmed and fires emails', async () => {
    mockBookingGet.mockResolvedValue({ exists: true, data: () => P2P_BOOKING })

    const res = await PATCH(makeReq({ action: 'approve' }), { params })

    expect(res.status).toBe(200)
    expect(mockBookingUpdate).toHaveBeenCalledWith(expect.objectContaining({
      payment_status_v2: 'paid',
      status: 'confirmed',
    }))
    await vi.waitFor(() => expect(mockSendBookingConfirmation).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(mockSendAdminBookingNotification).toHaveBeenCalledOnce())
  })

  test('approve: returns 409 when booking is not in ai_review', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...P2P_BOOKING, payment_status_v2: 'paid' }),
    })
    const res = await PATCH(makeReq({ action: 'approve' }), { params })
    expect(res.status).toBe(409)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
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

  test('mark_paid: returns 409 when cash booking already paid', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...CASH_BOOKING, payment_status_v2: 'paid' }),
    })
    const res = await PATCH(makeReq({ action: 'mark_paid' }), { params })
    expect(res.status).toBe(409)
  })
})
