/**
 * Unit tests for GET /api/cron/cleanup-onboarding
 *
 * Tests CRON_SECRET auth, the no-stale-reservations fast path, deletion of stale
 * business docs + removal of slugs from admins, and multi-doc batching.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockQueryGet,
  mockBatchDelete,
  mockBatchUpdate,
  mockBatchSet,
  mockBatchCommit,
  mockTimestampFromMillis,
  mockArrayRemove,
} = vi.hoisted(() => ({
  mockQueryGet:            vi.fn(),
  mockBatchDelete:         vi.fn(),
  mockBatchUpdate:         vi.fn(),
  mockBatchSet:            vi.fn(),
  mockBatchCommit:         vi.fn(),
  mockTimestampFromMillis: vi.fn((ms: number) => ({ _ms: ms })),
  mockArrayRemove:         vi.fn((...args: unknown[]) => ({ _sentinel: 'arrayRemove', args })),
}))

const mockBatch = {
  delete: mockBatchDelete,
  update: mockBatchUpdate,
  set:    mockBatchSet,
  commit: mockBatchCommit,
}

// The query chain: collection('businesses').where(...).where(...).get()
// We also need collection('admins').doc(id) for the batch.update call.
const mockWhere2 = { get: mockQueryGet }
const mockWhere1 = { where: vi.fn(() => mockWhere2) }
const mockBusinessCollection = { where: vi.fn(() => mockWhere1) }
const mockAdminsCollection    = { doc: vi.fn((id: string) => ({ _collection: 'admins', _id: id })) }

vi.mock('@/lib/firebase/admin-app', () => ({
  adminDb: {
    collection: vi.fn((name: string) =>
      name === 'businesses' ? mockBusinessCollection : mockAdminsCollection
    ),
    batch: () => mockBatch,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayRemove: mockArrayRemove,
  },
  Timestamp: {
    fromMillis: mockTimestampFromMillis,
  },
}))

import { GET } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CRON_SECRET = 'test-cron-secret'

function makeReq(secret: string | null = CRON_SECRET): NextRequest {
  const headers = new Headers()
  if (secret !== null) headers.set('authorization', `Bearer ${secret}`)
  return new NextRequest('http://localhost/api/cron/cleanup-onboarding', {
    method: 'GET',
    headers,
  })
}

/** Build a fake Firestore document snapshot for a stale reservation. */
function makeStaleDoc(slug: string, reservedBy: string) {
  return {
    ref:  { _collection: 'businesses', _id: slug },
    data: () => ({ slug, reservedBy }),
  }
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe('GET /api/cron/cleanup-onboarding — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchDelete.mockReturnThis()
    mockBatchUpdate.mockReturnThis()
    mockBatchSet.mockReturnThis()
    mockBatchCommit.mockResolvedValue(undefined)
    mockWhere1.where.mockReturnValue(mockWhere2)
    mockBusinessCollection.where.mockReturnValue(mockWhere1)
    process.env.CRON_SECRET = CRON_SECRET
  })

  test('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeReq(null))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })

  test('returns 401 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeReq(CRON_SECRET))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })

  test('returns 401 when wrong secret is provided', async () => {
    const res = await GET(makeReq('wrong-secret'))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error', 'Unauthorized')
  })

  test('returns 401 when auth header uses wrong scheme (Basic instead of Bearer)', async () => {
    const headers = new Headers({ authorization: `Basic ${CRON_SECRET}` })
    const req = new NextRequest('http://localhost/api/cron/cleanup-onboarding', {
      method: 'GET',
      headers,
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

// ─── No stale reservations ────────────────────────────────────────────────────

describe('GET /api/cron/cleanup-onboarding — no stale reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchDelete.mockReturnThis()
    mockBatchUpdate.mockReturnThis()
    mockBatchSet.mockReturnThis()
    mockBatchCommit.mockResolvedValue(undefined)
    mockWhere1.where.mockReturnValue(mockWhere2)
    mockBusinessCollection.where.mockReturnValue(mockWhere1)
    process.env.CRON_SECRET = CRON_SECRET
  })

  test('returns { deleted: 0 } when no stale docs found', async () => {
    mockQueryGet.mockResolvedValue({ empty: true, docs: [] })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 0 })
  })

  test('does not call batch.commit when there are no stale docs', async () => {
    mockQueryGet.mockResolvedValue({ empty: true, docs: [] })

    await GET(makeReq())
    expect(mockBatchCommit).not.toHaveBeenCalled()
  })
})

// ─── Stale reservation deletion ───────────────────────────────────────────────

describe('GET /api/cron/cleanup-onboarding — stale reservation deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchDelete.mockReturnThis()
    mockBatchUpdate.mockReturnThis()
    mockBatchSet.mockReturnThis()
    mockBatchCommit.mockResolvedValue(undefined)
    mockWhere1.where.mockReturnValue(mockWhere2)
    mockBusinessCollection.where.mockReturnValue(mockWhere1)
    mockAdminsCollection.doc.mockImplementation((id: string) => ({ _collection: 'admins', _id: id }))
    process.env.CRON_SECRET = CRON_SECRET
  })

  test('deletes stale business doc and returns { deleted: 1 }', async () => {
    const staleDoc = makeStaleDoc('stale-biz', 'user-1')
    mockQueryGet.mockResolvedValue({ empty: false, docs: [staleDoc] })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 1 })

    expect(mockBatchDelete).toHaveBeenCalledOnce()
    expect(mockBatchDelete).toHaveBeenCalledWith(staleDoc.ref)
  })

  test('removes slug from admins/{reservedBy}.slugs via batch.set+merge (S8: was batch.update)', async () => {
    const staleDoc = makeStaleDoc('stale-biz', 'user-1')
    mockQueryGet.mockResolvedValue({ empty: false, docs: [staleDoc] })

    await GET(makeReq())

    expect(mockBatchSet).toHaveBeenCalledOnce()
    const [adminRef, setData, setOptions] = mockBatchSet.mock.calls[0]
    expect((adminRef as { _collection?: string })._collection).toBe('admins')
    expect((adminRef as { _id?: string })._id).toBe('user-1')
    // slugs field uses arrayRemove sentinel
    expect(mockArrayRemove).toHaveBeenCalledWith('stale-biz')
    expect((setData as { slugs: unknown }).slugs).toMatchObject({ _sentinel: 'arrayRemove' })
    expect(setOptions).toMatchObject({ merge: true })
  })

  test('commits the batch exactly once for a single stale doc', async () => {
    const staleDoc = makeStaleDoc('stale-biz', 'user-1')
    mockQueryGet.mockResolvedValue({ empty: false, docs: [staleDoc] })

    await GET(makeReq())
    expect(mockBatchCommit).toHaveBeenCalledOnce()
  })

  test('deletes multiple stale docs and returns the correct count', async () => {
    const docs = [
      makeStaleDoc('stale-a', 'user-1'),
      makeStaleDoc('stale-b', 'user-2'),
      makeStaleDoc('stale-c', 'user-3'),
    ]
    mockQueryGet.mockResolvedValue({ empty: false, docs })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 3 })

    expect(mockBatchDelete).toHaveBeenCalledTimes(3)
    // S8: one batch.set per distinct owner (3 owners → 3 set calls)
    expect(mockBatchSet).toHaveBeenCalledTimes(3)
  })

  test('commits once per batch chunk for multiple stale docs', async () => {
    const docs = [
      makeStaleDoc('stale-a', 'user-1'),
      makeStaleDoc('stale-b', 'user-2'),
    ]
    mockQueryGet.mockResolvedValue({ empty: false, docs })

    await GET(makeReq())
    // All docs fit in one chunk → one commit
    expect(mockBatchCommit).toHaveBeenCalledOnce()
  })

  test('uses Timestamp.fromMillis for the cutoff calculation', async () => {
    mockQueryGet.mockResolvedValue({ empty: true, docs: [] })

    await GET(makeReq())

    expect(mockTimestampFromMillis).toHaveBeenCalledOnce()
    // The cutoff should be ~24h ago — verify it's a plausible past timestamp
    const [ms] = mockTimestampFromMillis.mock.calls[0] as [number]
    const twentyFourHoursMs = 24 * 60 * 60 * 1000
    expect(ms).toBeGreaterThan(Date.now() - twentyFourHoursMs - 5000)
    expect(ms).toBeLessThan(Date.now() - twentyFourHoursMs + 5000)
  })

  test('queries Firestore with correct where clauses (status and reservedAt)', async () => {
    mockQueryGet.mockResolvedValue({ empty: true, docs: [] })

    await GET(makeReq())

    expect(mockBusinessCollection.where).toHaveBeenCalledWith('status', '==', 'onboarding_reserved')
    expect(mockWhere1.where).toHaveBeenCalledWith('reservedAt', '<', expect.anything())
  })
})

// ─── S8: per-uid slug aggregation + batch.set instead of batch.update ────────

describe('GET /api/cron/cleanup-onboarding — S8 batch dedup and set+merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchDelete.mockReturnThis()
    mockBatchUpdate.mockReturnThis()
    mockBatchSet.mockReturnThis()
    mockBatchCommit.mockResolvedValue(undefined)
    mockWhere1.where.mockReturnValue(mockWhere2)
    mockBusinessCollection.where.mockReturnValue(mockWhere1)
    mockAdminsCollection.doc.mockImplementation((id: string) => ({ _collection: 'admins', _id: id }))
    process.env.CRON_SECRET = CRON_SECRET
  })

  test('two expired reservations from the same uid → exactly ONE admin doc write (dedup)', async () => {
    const docs = [
      makeStaleDoc('slug-a', 'user-1'),
      makeStaleDoc('slug-b', 'user-1'),
    ]
    mockQueryGet.mockResolvedValue({ empty: false, docs })

    await GET(makeReq())

    // Two business docs deleted
    expect(mockBatchDelete).toHaveBeenCalledTimes(2)
    // Only ONE admin write for user-1 (not two separate writes)
    expect(mockBatchSet).toHaveBeenCalledOnce()
    const [adminRef, setData, setOptions] = mockBatchSet.mock.calls[0]
    expect((adminRef as { _id?: string })._id).toBe('user-1')
    expect(setOptions).toMatchObject({ merge: true })
    // arrayRemove is called once with both slugs
    expect(mockArrayRemove).toHaveBeenCalledWith('slug-a', 'slug-b')
    expect((setData as { slugs: unknown }).slugs).toMatchObject({ _sentinel: 'arrayRemove' })
  })

  test('two expired reservations from different uids → two separate admin doc writes', async () => {
    const docs = [
      makeStaleDoc('slug-a', 'user-1'),
      makeStaleDoc('slug-b', 'user-2'),
    ]
    mockQueryGet.mockResolvedValue({ empty: false, docs })

    await GET(makeReq())

    expect(mockBatchDelete).toHaveBeenCalledTimes(2)
    expect(mockBatchSet).toHaveBeenCalledTimes(2)

    const ownerIds = mockBatchSet.mock.calls.map(
      ([ref]) => (ref as { _id?: string })._id,
    )
    expect(ownerIds).toContain('user-1')
    expect(ownerIds).toContain('user-2')
  })

  test('doc missing reservedBy → doc is deleted but no admin write attempted', async () => {
    const docWithoutOwner = {
      ref:  { _collection: 'businesses', _id: 'orphan-slug' },
      data: () => ({ slug: 'orphan-slug' /* no reservedBy */ }),
    }
    mockQueryGet.mockResolvedValue({ empty: false, docs: [docWithoutOwner] })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 1 })

    expect(mockBatchDelete).toHaveBeenCalledOnce()
    expect(mockBatchSet).not.toHaveBeenCalled()
  })

  test('doc missing slug field → doc is deleted but no admin write attempted', async () => {
    const docWithoutSlug = {
      ref:  { _collection: 'businesses', _id: 'no-slug-doc' },
      data: () => ({ reservedBy: 'user-1' /* no slug */ }),
    }
    mockQueryGet.mockResolvedValue({ empty: false, docs: [docWithoutSlug] })

    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 1 })

    expect(mockBatchDelete).toHaveBeenCalledOnce()
    expect(mockBatchSet).not.toHaveBeenCalled()
  })
})
