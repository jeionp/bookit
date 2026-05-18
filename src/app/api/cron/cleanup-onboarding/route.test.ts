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
  mockBatchCommit,
  mockTimestampFromMillis,
  mockArrayRemove,
} = vi.hoisted(() => ({
  mockQueryGet:            vi.fn(),
  mockBatchDelete:         vi.fn(),
  mockBatchUpdate:         vi.fn(),
  mockBatchCommit:         vi.fn(),
  mockTimestampFromMillis: vi.fn((ms: number) => ({ _ms: ms })),
  mockArrayRemove:         vi.fn((...args: unknown[]) => ({ _sentinel: 'arrayRemove', args })),
}))

const mockBatch = {
  delete: mockBatchDelete,
  update: mockBatchUpdate,
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

  test('removes slug from admins/{reservedBy}.slugs via batch.update', async () => {
    const staleDoc = makeStaleDoc('stale-biz', 'user-1')
    mockQueryGet.mockResolvedValue({ empty: false, docs: [staleDoc] })

    await GET(makeReq())

    expect(mockBatchUpdate).toHaveBeenCalledOnce()
    const [adminRef, updateData] = mockBatchUpdate.mock.calls[0]
    expect((adminRef as { _collection?: string })._collection).toBe('admins')
    expect((adminRef as { _id?: string })._id).toBe('user-1')
    // slugs field uses arrayRemove sentinel
    expect(mockArrayRemove).toHaveBeenCalledWith('stale-biz')
    expect((updateData as { slugs: unknown }).slugs).toMatchObject({ _sentinel: 'arrayRemove' })
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
    expect(mockBatchUpdate).toHaveBeenCalledTimes(3)
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
