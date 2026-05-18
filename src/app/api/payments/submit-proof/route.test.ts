import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockVerifyIdToken,
  mockBookingGet,
  mockBookingUpdate,
  mockRunTransaction,
  mockVerifyPaymentProof,
} = vi.hoisted(() => ({
  mockVerifyIdToken:       vi.fn(),
  mockBookingGet:          vi.fn(),
  mockBookingUpdate:       vi.fn(),
  mockRunTransaction:      vi.fn(),
  mockVerifyPaymentProof:  vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: () => ({
      doc: () => ({
        get:    mockBookingGet,
        update: mockBookingUpdate,
      }),
    }),
    runTransaction: mockRunTransaction,
  },
}))

vi.mock('@/lib/payments/verify-proof', () => ({
  verifyPaymentProof: mockVerifyPaymentProof,
}))

function makeReq(body: unknown, token: string | null = 'valid-token'): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/payments/submit-proof', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function makeRawReq(rawBody: string, token: string | null = 'valid-token'): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/payments/submit-proof', {
    method: 'POST',
    headers,
    body: rawBody,
  })
}

const VALID_BOOKING = {
  userId:             'user-123',
  status:             'slot_held',
  checkout_type:      'P2P_AI',
  payment_status_v2:  'pending_proof',
}

// S5: proofUrl path must contain `payment_proofs/{bookingId}/`
const VALID_BODY = {
  bookingId: 'booking-abc',
  proofUrl: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/payment_proofs%2Fbooking-abc%2Fproof.jpg',
}

describe('POST /api/payments/submit-proof', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' })
    mockBookingGet.mockResolvedValue({ exists: true, data: () => ({ ...VALID_BOOKING }) })
    mockBookingUpdate.mockResolvedValue(undefined)
    mockVerifyPaymentProof.mockResolvedValue(undefined)
    mockRunTransaction.mockImplementation(async (fn: Parameters<typeof mockRunTransaction>[0]) => {
      await fn({ get: mockBookingGet, update: mockBookingUpdate })
    })
  })

  // ─── Happy path ───────────────────────────────────────────────────────────────

  test('updates payment_status_v2 to ai_review and stores proof_url', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    expect(mockBookingUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { payment_status_v2: 'ai_review', proof_url: VALID_BODY.proofUrl },
    )
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  // ─── Auth ─────────────────────────────────────────────────────────────────────

  test('returns 401 if no auth token', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY, null))
    expect(res.status).toBe(401)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 401 if token verification throws', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token expired'))
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(401)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  // ─── Input validation ─────────────────────────────────────────────────────────

  test('returns 400 if bookingId is missing from body', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ proofUrl: VALID_BODY.proofUrl }))
    expect(res.status).toBe(400)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 400 if proofUrl is missing from body', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ bookingId: VALID_BODY.bookingId }))
    expect(res.status).toBe(400)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 400 if bookingId is a number instead of a string', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ bookingId: 12345, proofUrl: VALID_BODY.proofUrl }))
    expect(res.status).toBe(400)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 400 if proofUrl is an empty string', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ bookingId: VALID_BODY.bookingId, proofUrl: '' }))
    expect(res.status).toBe(400)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 400 if request body is malformed JSON', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRawReq('not-valid-json{{{'))
    expect(res.status).toBe(400)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 400 if request body is an empty string', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRawReq(''))
    expect(res.status).toBe(400)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  // ─── SSRF guard ───────────────────────────────────────────────────────────────

  test('returns 400 for a non-Firebase Storage proof URL (SSRF guard)', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({
      bookingId: VALID_BODY.bookingId,
      proofUrl: 'http://169.254.169.254/latest/meta-data/',
    }))
    expect(res.status).toBe(400)
    expect(mockRunTransaction).not.toHaveBeenCalled()
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 400 if proofUrl is not a valid URL', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({ bookingId: VALID_BODY.bookingId, proofUrl: 'not-a-url' }))
    expect(res.status).toBe(400)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('accepts storage.googleapis.com as a valid proof URL domain', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({
      bookingId: VALID_BODY.bookingId,
      proofUrl: `https://storage.googleapis.com/bucket/payment_proofs/${VALID_BODY.bookingId}/proof.jpg`,
    }))
    expect(res.status).toBe(200)
  })

  // ─── Booking guards ───────────────────────────────────────────────────────────

  test('returns 404 if booking does not exist', async () => {
    mockBookingGet.mockResolvedValue({ exists: false, data: () => undefined })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(404)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 403 if user does not own the booking', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'other-user' })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(403)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 400 if checkout_type is not P2P_AI', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, checkout_type: 'GATEWAY_SPLIT' }),
    })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(400)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 409 if booking status is not slot_held (e.g. cancelled)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, status: 'cancelled' }),
    })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(409)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  // ─── Status edge cases ────────────────────────────────────────────────────────

  test('returns 409 if proof already submitted (payment_status_v2 === "ai_review")', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, payment_status_v2: 'ai_review' }),
    })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(409)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 409 if payment_status_v2 is "expired"', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, payment_status_v2: 'expired' }),
    })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(409)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  test('returns 409 if payment_status_v2 is "paid"', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, payment_status_v2: 'paid' }),
    })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(409)
    expect(mockBookingUpdate).not.toHaveBeenCalled()
  })

  // ─── Idempotency (TOCTOU fix) ─────────────────────────────────────────────────

  // The transaction ensures that once the first request commits payment_status_v2 to
  // "ai_review", any subsequent request re-reading the booking sees the updated state
  // and correctly returns 409. This prevents duplicate OCR jobs from double submissions.
  test('second sequential proof submission returns 409 (transaction enforces idempotency)', async () => {
    const { POST } = await import('./route')

    const res1 = await POST(makeReq(VALID_BODY))
    expect(res1.status).toBe(200)

    // Simulate the committed state — the booking is now at ai_review
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, payment_status_v2: 'ai_review' }),
    })

    const res2 = await POST(makeReq(VALID_BODY))
    expect(res2.status).toBe(409)
    expect(mockBookingUpdate).toHaveBeenCalledTimes(1)
  })

  // ─── Error handling ───────────────────────────────────────────────────────────

  test('returns 500 when bookingRef.update() throws unexpectedly', async () => {
    // tx.update() is synchronous in Firestore — throw synchronously so the error
    // propagates out of the transaction callback and is caught by the route's try/catch.
    mockBookingUpdate.mockImplementation(() => { throw new Error('Firestore unavailable') })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(500)
  })
})

// ─── S5: proof URL path validation ───────────────────────────────────────────

describe('POST /api/payments/submit-proof — proof URL path validation (S5)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' })
    mockBookingGet.mockResolvedValue({ exists: true, data: () => ({ ...VALID_BOOKING }) })
    mockBookingUpdate.mockResolvedValue(undefined)
    mockVerifyPaymentProof.mockResolvedValue(undefined)
    mockRunTransaction.mockImplementation(async (fn: Parameters<typeof mockRunTransaction>[0]) => {
      await fn({ get: mockBookingGet, update: mockBookingUpdate })
    })
  })

  test('valid Firebase Storage URL with correct payment_proofs/{bookingId}/ path → 200', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({
      bookingId: 'booking-abc',
      proofUrl: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/payment_proofs%2Fbooking-abc%2Fproof.jpg',
    }))
    expect(res.status).toBe(200)
  })

  test('valid hostname but path for a different bookingId → 400', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({
      bookingId: 'booking-abc',
      proofUrl: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/payment_proofs%2Fbooking-xyz%2Fproof.jpg',
    }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid proofUrl' })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test('valid hostname but path missing payment_proofs/ prefix → 400', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq({
      bookingId: 'booking-abc',
      proofUrl: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/uploads%2Fbooking-abc%2Fproof.jpg',
    }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid proofUrl' })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test('URL-encoded path with payment_proofs%2F{bookingId}%2F → passes decodeURIComponent check', async () => {
    const { POST } = await import('./route')
    const bookingId = 'booking-abc'
    // Doubly-encoded: %252F → decodes to %2F → but that's not right.
    // Single-encode: payment_proofs%2Fbooking-abc%2F → decodes to payment_proofs/booking-abc/
    const encodedPath = `payment_proofs%2F${bookingId}%2Freceipt.png`
    const res = await POST(makeReq({
      bookingId,
      proofUrl: `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodedPath}`,
    }))
    expect(res.status).toBe(200)
  })
})
