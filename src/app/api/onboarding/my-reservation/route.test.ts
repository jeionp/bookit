/**
 * Unit tests for GET /api/onboarding/my-reservation
 *
 * Tests auth, returning the user's onboarding_reserved slug,
 * returning null when no reservation exists, and security (only own reservations).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockVerifyIdToken, mockAdminDocGet } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockAdminDocGet:   vi.fn(),
}))

// Tracks calls by collection+id so individual biz docs can return different data
const mockBizDocs: Record<string, { exists: boolean; data?: () => object }> = {}

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: name === 'admins'
          ? mockAdminDocGet
          : () => Promise.resolve(mockBizDocs[id] ?? { exists: false, data: () => ({}) }),
      }),
    }),
  },
}))

import { GET } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(token: string | null = 'valid-token'): NextRequest {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/onboarding/my-reservation', {
    method: 'GET',
    headers,
  })
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe('GET /api/onboarding/my-reservation — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })

  test('returns 401 when token is invalid (verifyIdToken throws)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token invalid'))
    const res = await GET(makeReq('bad-token'))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })
})

// ─── Happy path tests ─────────────────────────────────────────────────────────

describe('GET /api/onboarding/my-reservation — happy paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
    // Clear the biz docs tracker
    for (const key of Object.keys(mockBizDocs)) delete mockBizDocs[key]
  })

  test('returns { slug } when user has an onboarding_reserved slug', async () => {
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['my-biz'] }),
    })
    mockBizDocs['my-biz'] = {
      exists: true,
      data: () => ({ status: 'onboarding_reserved', reservedBy: 'user-1' }),
    }

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: 'my-biz' })
  })

  test('returns { slug: null } when user has no reservation (all slugs are active)', async () => {
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['active-biz'] }),
    })
    mockBizDocs['active-biz'] = {
      exists: true,
      data: () => ({ status: 'active', ownerId: 'user-1' }),
    }

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: null })
  })

  test('returns { slug: null } when user has no admin doc at all', async () => {
    mockAdminDocGet.mockResolvedValue({ exists: false, data: () => ({}) })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: null })
  })

  test('returns { slug: null } when user has an empty slugs array', async () => {
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: [] }),
    })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: null })
  })

  test('returns the reserved slug when user has multiple slugs, only one is reserved', async () => {
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['active-biz', 'reserved-biz'] }),
    })
    mockBizDocs['active-biz'] = {
      exists: true,
      data: () => ({ status: 'active', ownerId: 'user-1' }),
    }
    mockBizDocs['reserved-biz'] = {
      exists: true,
      data: () => ({ status: 'onboarding_reserved', reservedBy: 'user-1' }),
    }

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: 'reserved-biz' })
  })
})

// ─── Security tests ───────────────────────────────────────────────────────────

describe('GET /api/onboarding/my-reservation — security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
    for (const key of Object.keys(mockBizDocs)) delete mockBizDocs[key]
  })

  test('does NOT return a slug whose reservedBy is a different uid', async () => {
    // The admin doc contains a slug, but that slug was reserved by another user.
    // This can occur if slugs array is out of sync. The route must check reservedBy.
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['their-biz'] }),
    })
    mockBizDocs['their-biz'] = {
      exists: true,
      data: () => ({ status: 'onboarding_reserved', reservedBy: 'other-user' }),
    }

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: null })
  })

  test('only returns the slug owned by this user when mixed reservations exist', async () => {
    mockAdminDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ slugs: ['their-biz', 'my-biz'] }),
    })
    mockBizDocs['their-biz'] = {
      exists: true,
      data: () => ({ status: 'onboarding_reserved', reservedBy: 'other-user' }),
    }
    mockBizDocs['my-biz'] = {
      exists: true,
      data: () => ({ status: 'onboarding_reserved', reservedBy: 'user-1' }),
    }

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: 'my-biz' })
  })
})
