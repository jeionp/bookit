/**
 * Unit tests for POST /api/onboarding/reserve-slug
 *
 * Tests auth, slug validation, slug availability checks (active vs reserved),
 * idempotent re-reservation, and the old-slug release logic.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockVerifyIdToken,
  mockRunTransaction,
  mockTransactionGet,
  mockTransactionSet,
  mockTransactionDelete,
  mockRatelimitLimit,
} = vi.hoisted(() => ({
  mockVerifyIdToken:     vi.fn(),
  mockRunTransaction:    vi.fn(),
  mockTransactionGet:    vi.fn(),
  mockTransactionSet:    vi.fn(),
  mockTransactionDelete: vi.fn(),
  mockRatelimitLimit:    vi.fn(),
}))

// Shared transaction object — methods are mocked individually
const mockTransaction = {
  get:    mockTransactionGet,
  set:    mockTransactionSet,
  delete: mockTransactionDelete,
}

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    function MockRatelimit() { return { limit: mockRatelimitLimit }; },
    { slidingWindow: vi.fn() },
  ),
}))

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn() },
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ _collection: name, _id: id }),
    }),
    runTransaction: mockRunTransaction,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _sentinel: 'serverTimestamp' }),
    arrayUnion:      (...args: unknown[]) => ({ _sentinel: 'arrayUnion', args }),
    arrayRemove:     (...args: unknown[]) => ({ _sentinel: 'arrayRemove', args }),
  },
}))

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: object, token: string | null = 'valid-token'): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/onboarding/reserve-slug', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

/**
 * Sets up `mockRunTransaction` to execute its callback synchronously with
 * `mockTransaction`. The `docs` map drives what `t.get(ref)` resolves to,
 * keyed as "<collection>/<id>".
 *
 * NOTE: this function must be called BEFORE any per-test overrides of
 * mockTransactionSet / mockTransactionDelete so those overrides are active
 * when the fn runs.
 */
function setupTransaction(docs: Record<string, { exists: boolean; data?: () => object }>) {
  // Configure t.get to return the right snapshot for each ref
  mockTransactionGet.mockImplementation((ref: { _collection: string; _id: string }) => {
    const key = `${ref._collection}/${ref._id}`
    const snap = docs[key] ?? { exists: false }
    return Promise.resolve({ data: () => ({}), ...snap })
  })

  // runTransaction invokes the user's fn with the shared mock transaction
  mockRunTransaction.mockImplementation(async (fn: (t: typeof mockTransaction) => Promise<void>) => {
    await fn(mockTransaction)
  })
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe('POST /api/onboarding/reserve-slug — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns 401 when Authorization header is missing', async () => {
    const res = await POST(makeReq({ slug: 'my-biz' }, null))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })

  test('returns 401 when token is invalid (verifyIdToken throws)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token invalid'))
    const res = await POST(makeReq({ slug: 'my-biz' }, 'bad-token'))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })
})

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('POST /api/onboarding/reserve-slug — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
  })

  test('returns 400 when slug is missing', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid slug')
  })

  test('returns 400 when slug contains uppercase letters', async () => {
    const res = await POST(makeReq({ slug: 'MyBiz' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid slug')
  })

  test('returns 400 when slug contains spaces', async () => {
    const res = await POST(makeReq({ slug: 'my biz' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid slug')
  })

  test('returns 400 when slug is a single character (too short)', async () => {
    const res = await POST(makeReq({ slug: 'a' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error', 'Invalid slug')
  })
})

// ─── Slug availability (conflict) tests ───────────────────────────────────────

describe('POST /api/onboarding/reserve-slug — slug conflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
  })

  test('returns 409 when slug is taken by an active business', async () => {
    setupTransaction({
      'businesses/my-biz': {
        exists: true,
        data: () => ({ status: 'active', ownerId: 'other-user' }),
      },
      'admins/user-1': { exists: false },
    })

    const res = await POST(makeReq({ slug: 'my-biz' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toHaveProperty('error', 'Slug already taken')
  })

  test('returns 409 when slug is reserved by another user', async () => {
    setupTransaction({
      'businesses/my-biz': {
        exists: true,
        data: () => ({ status: 'onboarding_reserved', reservedBy: 'other-user' }),
      },
      'admins/user-1': { exists: false },
    })

    const res = await POST(makeReq({ slug: 'my-biz' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toHaveProperty('error', 'Slug already taken')
  })
})

// ─── Happy path tests ─────────────────────────────────────────────────────────

describe('POST /api/onboarding/reserve-slug — success', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
    mockTransactionSet.mockReturnValue(undefined)
    mockTransactionDelete.mockReturnValue(undefined)
  })

  test('reserves a new slug and returns 200', async () => {
    setupTransaction({
      'businesses/my-biz': { exists: false },
      'admins/user-1':     { exists: false },
    })

    const res = await POST(makeReq({ slug: 'my-biz' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty('ok', true)
  })

  test('calls transaction.set for the business doc with status onboarding_reserved', async () => {
    setupTransaction({
      'businesses/new-slug': { exists: false },
      'admins/user-1':       { exists: false },
    })

    await POST(makeReq({ slug: 'new-slug' }))

    // Find the set call for the businesses collection
    const bizSetCall = mockTransactionSet.mock.calls.find(
      ([ref]) => (ref as { _collection?: string })._collection === 'businesses'
    )
    expect(bizSetCall).toBeDefined()
    const [, bizData] = bizSetCall!
    expect((bizData as Record<string, unknown>).status).toBe('onboarding_reserved')
    expect((bizData as Record<string, unknown>).reservedBy).toBe('user-1')
  })

  test('idempotent re-reserve — succeeds when slug is already reserved by own uid', async () => {
    setupTransaction({
      'businesses/my-biz': {
        exists: true,
        data: () => ({ status: 'onboarding_reserved', reservedBy: 'user-1' }),
      },
      'admins/user-1': {
        exists: true,
        data: () => ({ slugs: ['my-biz'] }),
      },
    })

    const res = await POST(makeReq({ slug: 'my-biz' }))
    expect(res.status).toBe(200)
  })

  test('includes the new slug in the admin slugs array', async () => {
    setupTransaction({
      'businesses/new-slug': { exists: false },
      'admins/user-1':       { exists: true, data: () => ({ slugs: ['old-slug'] }) },
    })

    await POST(makeReq({ slug: 'new-slug' }))

    const adminSetCall = mockTransactionSet.mock.calls.find(
      ([ref]) => (ref as { _collection?: string })._collection === 'admins'
    )
    expect(adminSetCall).toBeDefined()
    const [, adminData] = adminSetCall!
    expect((adminData as { slugs: string[] }).slugs).toContain('new-slug')
    // also preserves the pre-existing slug
    expect((adminData as { slugs: string[] }).slugs).toContain('old-slug')
  })
})

// ─── releaseSlug tests ────────────────────────────────────────────────────────

describe('POST /api/onboarding/reserve-slug — releaseSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
    mockTransactionSet.mockReturnValue(undefined)
    mockTransactionDelete.mockReturnValue(undefined)
  })

  test('deletes old reservation doc and removes old slug when switching slugs', async () => {
    setupTransaction({
      'businesses/new-slug': { exists: false },
      'businesses/old-slug': {
        exists: true,
        data: () => ({ status: 'onboarding_reserved', reservedBy: 'user-1' }),
      },
      'admins/user-1': {
        exists: true,
        data: () => ({ slugs: ['old-slug'] }),
      },
    })

    await POST(makeReq({ slug: 'new-slug', releaseSlug: 'old-slug' }))

    expect(mockTransactionDelete).toHaveBeenCalledOnce()

    // Verify the admin doc no longer contains the old slug
    const adminSetCall = mockTransactionSet.mock.calls.find(
      ([ref]) => (ref as { _collection?: string })._collection === 'admins'
    )
    expect(adminSetCall).toBeDefined()
    const [, adminData] = adminSetCall!
    expect((adminData as { slugs: string[] }).slugs).not.toContain('old-slug')
    expect((adminData as { slugs: string[] }).slugs).toContain('new-slug')
  })

  test('does NOT release if releaseSlug equals slug (same slug)', async () => {
    setupTransaction({
      'businesses/my-biz': { exists: false },
      'admins/user-1':     { exists: false },
    })

    await POST(makeReq({ slug: 'my-biz', releaseSlug: 'my-biz' }))

    // No delete should be called since releaseSlug === slug
    expect(mockTransactionDelete).not.toHaveBeenCalled()
  })

  test('does NOT delete old slug if it belongs to another user (security)', async () => {
    setupTransaction({
      'businesses/new-slug':   { exists: false },
      'businesses/their-slug': {
        exists: true,
        data: () => ({ status: 'onboarding_reserved', reservedBy: 'other-user' }),
      },
      'admins/user-1': { exists: false },
    })

    // User attempts to release another user's reserved slug via releaseSlug
    await POST(makeReq({ slug: 'new-slug', releaseSlug: 'their-slug' }))

    // The route checks reservedBy === uid before deleting — should NOT delete
    expect(mockTransactionDelete).not.toHaveBeenCalled()
  })

  test('does NOT delete old slug if it is an active business (not onboarding_reserved)', async () => {
    setupTransaction({
      'businesses/new-slug': { exists: false },
      'businesses/old-biz':  {
        exists: true,
        data: () => ({ status: 'active', ownerId: 'user-1' }),
      },
      'admins/user-1': { exists: true, data: () => ({ slugs: ['old-biz'] }) },
    })

    await POST(makeReq({ slug: 'new-slug', releaseSlug: 'old-biz' }))

    // Release guard requires status === 'onboarding_reserved' — must not delete
    expect(mockTransactionDelete).not.toHaveBeenCalled()
  })
})

// ─── S4b: rate limiting ───────────────────────────────────────────────────────

describe('POST /api/onboarding/reserve-slug — rate limiting (S4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
    mockTransactionSet.mockReturnValue(undefined)
    mockTransactionDelete.mockReturnValue(undefined)
    process.env.UPSTASH_REDIS_REST_URL   = 'https://fake.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
  })

  test('returns 429 when per-uid rate limit is exceeded', async () => {
    mockRatelimitLimit.mockResolvedValue({ success: false })
    const res = await POST(makeReq({ slug: 'my-biz' }))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'Too many requests' })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })
})

// ─── S4b: reservation cap ─────────────────────────────────────────────────────

describe('POST /api/onboarding/reserve-slug — reservation cap (S4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
    mockTransactionSet.mockReturnValue(undefined)
    mockTransactionDelete.mockReturnValue(undefined)
    // Ensure any cached rate-limiter singleton passes through (success: true)
    mockRatelimitLimit.mockResolvedValue({ success: true })
    // Rate limiter inactive — no env vars (module singleton may already be cached)
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  test('returns 429 "Too many active reservations" when user has 3 reservations and tries to add a 4th (different slug)', async () => {
    setupTransaction({
      'businesses/fourth-slug': { exists: false },
      'admins/user-1': {
        exists: true,
        data: () => ({ slugs: ['slug-a', 'slug-b', 'slug-c'] }),
      },
    })

    const res = await POST(makeReq({ slug: 'fourth-slug' }))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'Too many active reservations' })
  })

  test('allows re-reserving an already-owned slug when user has 3 total (idempotent)', async () => {
    // user already owns 'slug-a', 'slug-b', 'slug-c'; re-reserving 'slug-a' is idempotent
    setupTransaction({
      'businesses/slug-a': {
        exists: true,
        data: () => ({ status: 'onboarding_reserved', reservedBy: 'user-1' }),
      },
      'admins/user-1': {
        exists: true,
        data: () => ({ slugs: ['slug-a', 'slug-b', 'slug-c'] }),
      },
    })

    const res = await POST(makeReq({ slug: 'slug-a' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  test('allows reserving a new slug when releasing one of the existing 3', async () => {
    // user has 3 slugs but releases 'slug-a' while reserving 'new-slug'
    setupTransaction({
      'businesses/new-slug': { exists: false },
      'businesses/slug-a':   {
        exists: true,
        data: () => ({ status: 'onboarding_reserved', reservedBy: 'user-1' }),
      },
      'admins/user-1': {
        exists: true,
        data: () => ({ slugs: ['slug-a', 'slug-b', 'slug-c'] }),
      },
    })

    const res = await POST(makeReq({ slug: 'new-slug', releaseSlug: 'slug-a' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})
