import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockVerifyIdToken, mockBookingGet, mockBookingUpdate } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockBookingGet:    vi.fn(),
  mockBookingUpdate: vi.fn(),
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
  },
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
  checkout_type:      'P2P_AI',
  payment_status_v2:  'pending_proof',
}

const VALID_BODY = { bookingId: 'booking-abc', proofUrl: 'https://storage.example.com/proof.jpg' }

describe('POST /api/payments/submit-proof', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' })
    mockBookingGet.mockResolvedValue({ exists: true, data: () => ({ ...VALID_BOOKING }) })
    mockBookingUpdate.mockResolvedValue(undefined)
  })

  // ─── Happy path ───────────────────────────────────────────────────────────────

  test('updates payment_status_v2 to ai_review and stores proof_url', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      payment_status_v2: 'ai_review',
      proof_url: VALID_BODY.proofUrl,
    })
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

  // OPEN GAP: The route does not check booking.status, so a cancelled booking
  // with payment_status_v2 === "pending_proof" will have its proof accepted.
  // This test documents the current (permissive) behaviour. If cancelled bookings
  // should be blocked, add a `booking.status !== "cancelled"` guard in the route
  // and change the assertion below to expect(res.status).toBe(409) (or 400).
  test('accepts proof for a cancelled booking (open gap: status not checked)', async () => {
    mockBookingGet.mockResolvedValue({
      exists: true,
      data: () => ({ ...VALID_BOOKING, status: 'cancelled' }),
    })
    const { POST } = await import('./route')
    const res = await POST(makeReq(VALID_BODY))
    // Current behaviour: the route only guards on payment_status_v2, not status.
    // A follow-up task should decide whether cancelled bookings should be blocked.
    expect(res.status).toBe(200)
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      payment_status_v2: 'ai_review',
      proof_url: VALID_BODY.proofUrl,
    })
  })

  // ─── Security ─────────────────────────────────────────────────────────────────

  // SECURITY: SSRF pre-vector — Phase 4 will fetch proof_url for OCR.
  // The route currently stores any URL without validation, including internal
  // metadata endpoints. If Phase 4 issues a server-side fetch to proof_url, an
  // attacker who controls the URL could reach cloud provider metadata services
  // (e.g. http://169.254.169.254/latest/meta-data/ on AWS/GCP) or internal
  // network endpoints. Before Phase 4 is wired up, proof_url should be validated
  // to allow only known Firebase Storage hostnames (e.g. firebasestorage.googleapis.com).
  test('currently stores a malicious internal URL without validation (SSRF pre-vector)', async () => {
    const ssrfUrl = 'http://169.254.169.254/latest/meta-data/'
    const { POST } = await import('./route')
    const res = await POST(makeReq({ bookingId: VALID_BODY.bookingId, proofUrl: ssrfUrl }))
    // Current behaviour: the route accepts any non-empty string as proofUrl.
    expect(res.status).toBe(200)
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      payment_status_v2: 'ai_review',
      proof_url: ssrfUrl,
    })
  })

  // SECURITY: TOCTOU race condition — the route performs a read (get) followed by
  // a write (update) without wrapping them in a Firestore transaction. Two
  // concurrent requests that both observe payment_status_v2 === "pending_proof"
  // will both pass the guard and both succeed, writing ai_review twice.
  // Phase 4 should wrap the read + update in a Firestore transaction to prevent
  // double-submission, which could trigger duplicate OCR jobs or double charges.
  test('concurrent double-submission: second request also succeeds (TOCTOU open gap)', async () => {
    // Both mock calls see "pending_proof" — simulating two requests that read
    // before either write completes.
    mockBookingGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ ...VALID_BOOKING }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ ...VALID_BOOKING }) })
    mockBookingUpdate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    const { POST } = await import('./route')
    const [res1, res2] = await Promise.all([
      POST(makeReq(VALID_BODY)),
      POST(makeReq(VALID_BODY)),
    ])
    // Both succeed because there is no transaction preventing the second write.
    // A Firestore transaction would make the second request fail with 409.
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(mockBookingUpdate).toHaveBeenCalledTimes(2)
  })

  // ─── Error handling ───────────────────────────────────────────────────────────

  // The route currently has no try/catch around bookingRef.update(), so an
  // unexpected Firestore error propagates as an unhandled rejection rather than
  // returning a structured 500. This test documents that gap — the Next.js
  // framework would surface it as a 500 in production, but the route should
  // explicitly handle it and return { error: "Internal server error" } status 500.
  test('propagates unhandled error when bookingRef.update() throws (no 500 handler in route)', async () => {
    mockBookingUpdate.mockRejectedValue(new Error('Firestore unavailable'))
    const { POST } = await import('./route')
    await expect(POST(makeReq(VALID_BODY))).rejects.toThrow('Firestore unavailable')
  })
})
