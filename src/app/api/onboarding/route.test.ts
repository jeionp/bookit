/**
 * Unit tests for POST /api/onboarding
 *
 * Tests auth, validation, slug-uniqueness, and the boolean coercion of
 * accepts_qr / accepts_cash / accepts_gateway (only `=== true` passes).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockVerifyIdToken, mockDocGet, mockBatchSet, mockBatchCommit } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockDocGet:        vi.fn(),
  mockBatchSet:      vi.fn(),
  mockBatchCommit:   vi.fn(),
}))

// The route calls adminDb.collection().doc().get() to check slug availability,
// then adminDb.batch().set(...).set(...).commit() to write.
const fakeBatch = {
  set:    mockBatchSet.mockReturnThis(),
  commit: mockBatchCommit,
}

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: () => ({
      doc: () => ({ get: mockDocGet }),
    }),
    batch: () => fakeBatch,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...args: unknown[]) => ({ _sentinel: 'arrayUnion', args }),
  },
}))

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: object, token: string | null = 'valid-token'): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/onboarding', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  slug:        'test-biz',
  name:        'Test Business',
  type:        'court',
  accepts_qr:  false,
  accepts_cash: false,
  accepts_gateway: false,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/onboarding — auth', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset()
    mockDocGet.mockReset()
    mockBatchSet.mockReset().mockReturnThis()
    mockBatchCommit.mockReset().mockResolvedValue(undefined)
  })

  test('returns 401 when Authorization header is missing', async () => {
    const res = await POST(makeReq(VALID_BODY, null))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Unauthorized')
  })

  test('returns 401 when token is invalid (verifyIdToken throws)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token invalid'))
    const res = await POST(makeReq(VALID_BODY, 'bad-token'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Unauthorized')
  })
})

describe('POST /api/onboarding — validation', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset().mockResolvedValue({ uid: 'user-1' })
    mockDocGet.mockReset()
    mockBatchSet.mockReset().mockReturnThis()
    mockBatchCommit.mockReset().mockResolvedValue(undefined)
  })

  test('returns 400 when slug is missing', async () => {
    const res = await POST(makeReq({ name: 'Test' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid slug')
  })

  test('returns 400 when slug is invalid (contains uppercase)', async () => {
    const res = await POST(makeReq({ slug: 'MyBiz', name: 'Test' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid slug')
  })

  test('returns 400 when slug is invalid (contains spaces)', async () => {
    const res = await POST(makeReq({ slug: 'my biz', name: 'Test' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid slug')
  })

  test('returns 400 when name is missing', async () => {
    mockDocGet.mockResolvedValue({ exists: false })
    const res = await POST(makeReq({ slug: 'test-biz' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'name is required')
  })

  test('returns 409 when slug is already taken', async () => {
    mockDocGet.mockResolvedValue({ exists: true })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(409)
    expect(await res.json()).toHaveProperty('error', 'Slug already taken')
  })
})

describe('POST /api/onboarding — boolean coercion for accepts_* fields', () => {
  let capturedData: Record<string, unknown> = {}

  beforeEach(() => {
    mockVerifyIdToken.mockReset().mockResolvedValue({ uid: 'user-1' })
    mockDocGet.mockReset().mockResolvedValue({ exists: false })
    mockBatchCommit.mockReset().mockResolvedValue(undefined)
    capturedData = {}

    // Capture what gets passed to batch.set() for the businesses doc
    mockBatchSet.mockReset().mockImplementation((_ref: unknown, data: unknown) => {
      // First call is the business doc, capture it
      if (Object.keys(capturedData).length === 0) {
        capturedData = data as Record<string, unknown>
      }
      return fakeBatch
    })
  })

  test('true boolean accepts_qr is saved as true', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_qr: true }))
    expect(capturedData.accepts_qr).toBe(true)
  })

  test('true boolean accepts_cash is saved as true', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_cash: true }))
    expect(capturedData.accepts_cash).toBe(true)
  })

  test('true boolean accepts_gateway is saved as true', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_gateway: true }))
    expect(capturedData.accepts_gateway).toBe(true)
  })

  test('all three true → all three saved as true', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_qr: true, accepts_cash: true, accepts_gateway: true }))
    expect(capturedData.accepts_qr).toBe(true)
    expect(capturedData.accepts_cash).toBe(true)
    expect(capturedData.accepts_gateway).toBe(true)
  })

  test('all three false → all three saved as false', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_qr: false, accepts_cash: false, accepts_gateway: false }))
    expect(capturedData.accepts_qr).toBe(false)
    expect(capturedData.accepts_cash).toBe(false)
    expect(capturedData.accepts_gateway).toBe(false)
  })

  test('accepts_qr: "yes" (string) is coerced to false (=== true guard)', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_qr: 'yes' }))
    expect(capturedData.accepts_qr).toBe(false)
  })

  test('accepts_qr: "true" (string) is coerced to false', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_qr: 'true' }))
    expect(capturedData.accepts_qr).toBe(false)
  })

  test('accepts_qr: 1 (number) is coerced to false', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_qr: 1 }))
    expect(capturedData.accepts_qr).toBe(false)
  })

  test('accepts_cash: 1 (number) is coerced to false', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_cash: 1 }))
    expect(capturedData.accepts_cash).toBe(false)
  })

  test('accepts_gateway: "true" (string) is coerced to false', async () => {
    await POST(makeReq({ ...VALID_BODY, accepts_gateway: 'true' }))
    expect(capturedData.accepts_gateway).toBe(false)
  })

  test('all three absent (undefined) are coerced to false', async () => {
    const { accepts_qr, accepts_cash, accepts_gateway, ...bodyWithout } = VALID_BODY
    void accepts_qr; void accepts_cash; void accepts_gateway
    await POST(makeReq(bodyWithout))
    expect(capturedData.accepts_qr).toBe(false)
    expect(capturedData.accepts_cash).toBe(false)
    expect(capturedData.accepts_gateway).toBe(false)
  })
})

describe('POST /api/onboarding — success', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset().mockResolvedValue({ uid: 'user-1' })
    mockDocGet.mockReset().mockResolvedValue({ exists: false })
    mockBatchSet.mockReset().mockReturnThis()
    mockBatchCommit.mockReset().mockResolvedValue(undefined)
  })

  test('returns 200 with { ok: true, slug } on valid request', async () => {
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, slug: 'test-biz' })
  })

  test('calls batch.commit() exactly once', async () => {
    await POST(makeReq(VALID_BODY))
    expect(mockBatchCommit).toHaveBeenCalledOnce()
  })

  test('calls batch.set() twice (businesses doc + admins doc)', async () => {
    await POST(makeReq(VALID_BODY))
    expect(mockBatchSet).toHaveBeenCalledTimes(2)
  })
})
