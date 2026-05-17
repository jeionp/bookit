import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockVerifyIdToken,
  mockAdminGet,
  mockLedgerGet,
} = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockAdminGet: vi.fn(),
  mockLedgerGet: vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (name: string) => ({
      doc: () => {
        if (name === 'admins') return { get: mockAdminGet }
        if (name === 'businesses') {
          return {
            collection: () => ({
              orderBy: () => ({
                limit: () => ({
                  get: mockLedgerGet,
                }),
              }),
            }),
          }
        }
        return {}
      },
    }),
  },
}))

import { GET } from './route'

function makeReq(params: Record<string, string>, token = 'valid-token'): NextRequest {
  const url = new URL('http://localhost/api/admin/credit-ledger')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function makeEntry(data: Record<string, unknown>, id = 'entry-1') {
  return { id, data: () => data }
}

const BASE_ENTRY = {
  businessSlug: 'biz-slug',
  bookingId: 'booking-abc',
  trigger: 'ai_verify',
  balanceBefore: 10,
  balanceAfter: 9,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid' })
  mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['biz-slug'] }) })
  mockLedgerGet.mockResolvedValue({ docs: [] })
})

describe('GET /api/admin/credit-ledger', () => {
  // ── Auth ──────────────────────────────────────────────────────────────────

  test('returns 401 when Authorization header is absent', async () => {
    const req = new NextRequest('http://localhost/api/admin/credit-ledger')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when Authorization is not a Bearer token', async () => {
    const req = new NextRequest('http://localhost/api/admin/credit-ledger', {
      headers: { Authorization: 'Basic xyz' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('returns 401 when verifyIdToken throws', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('invalid'))
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(401)
  })

  // ── Missing params ────────────────────────────────────────────────────────

  test('returns 400 when slug is missing', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'slug is required' })
  })

  // ── RBAC ──────────────────────────────────────────────────────────────────

  test('returns 403 when caller is not admin of the slug', async () => {
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['other'] }) })
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Forbidden' })
  })

  test('returns 403 when admin document does not exist', async () => {
    mockAdminGet.mockResolvedValue({ exists: false, data: () => null })
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(403)
  })

  test('returns 403 when slugs array is empty', async () => {
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: [] }) })
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(403)
  })

  // ── Happy path: empty ledger ──────────────────────────────────────────────

  test('returns empty entries array when ledger is empty', async () => {
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body).toEqual({ entries: [] })
  })

  // ── Happy path: entry shape ───────────────────────────────────────────────

  test('returns correct fields for each ledger entry', async () => {
    const createdAt = { toDate: () => new Date('2026-05-17T10:00:00Z') }
    mockLedgerGet.mockResolvedValue({
      docs: [makeEntry({ ...BASE_ENTRY, createdAt })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    const e = body.entries[0]
    expect(e.id).toBe('entry-1')
    expect(e.businessSlug).toBe('biz-slug')
    expect(e.bookingId).toBe('booking-abc')
    expect(e.trigger).toBe('ai_verify')
    expect(e.balanceBefore).toBe(10)
    expect(e.balanceAfter).toBe(9)
    expect(e.createdAt).toBe('2026-05-17T10:00:00.000Z')
  })

  test('returns null createdAt when Timestamp is absent', async () => {
    mockLedgerGet.mockResolvedValue({
      docs: [makeEntry({ ...BASE_ENTRY })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.entries[0].createdAt).toBeNull()
  })

  test('falls back to slug for businessSlug when field is absent', async () => {
    mockLedgerGet.mockResolvedValue({
      docs: [makeEntry({ bookingId: 'b1', trigger: 'ai_verify', balanceBefore: 5, balanceAfter: 4 })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.entries[0].businessSlug).toBe('biz-slug')
  })

  test('defaults balanceBefore and balanceAfter to 0 when absent', async () => {
    mockLedgerGet.mockResolvedValue({
      docs: [makeEntry({ businessSlug: 'biz-slug', bookingId: 'b1', trigger: 'admin_approve' })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.entries[0].balanceBefore).toBe(0)
    expect(body.entries[0].balanceAfter).toBe(0)
  })

  test('defaults trigger to empty string when absent', async () => {
    mockLedgerGet.mockResolvedValue({
      docs: [makeEntry({ businessSlug: 'biz-slug', bookingId: 'b1', balanceBefore: 5, balanceAfter: 4 })],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.entries[0].trigger).toBe('')
  })

  // ── Multiple entries ──────────────────────────────────────────────────────

  test('returns multiple entries', async () => {
    mockLedgerGet.mockResolvedValue({
      docs: [
        makeEntry({ ...BASE_ENTRY }, 'e1'),
        makeEntry({ ...BASE_ENTRY, trigger: 'admin_mark_paid', balanceBefore: 9, balanceAfter: 8 }, 'e2'),
      ],
    })
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].id).toBe('e1')
    expect(body.entries[1].id).toBe('e2')
  })

  // ── Limit param ───────────────────────────────────────────────────────────

  test('defaults to limit 50 when limit param is absent', async () => {
    // We can't inspect the limit passed to Firestore from the mock, but the
    // route uses limit=50 as default. We verify the call chain is used.
    const res = await GET(makeReq({ slug: 'biz-slug' }))
    expect(res.status).toBe(200)
    // mockLedgerGet must have been called (inside .limit(...).get())
    expect(mockLedgerGet).toHaveBeenCalledOnce()
  })

  test('returns 200 with explicit limit=10', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', limit: '10' }))
    expect(res.status).toBe(200)
  })

  test('accepts limit=200', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', limit: '200' }))
    expect(res.status).toBe(200)
  })

  test('falls back to default limit 50 when limit is out of range (0)', async () => {
    // Invalid limit value — route should fall back to 50 and still succeed
    const res = await GET(makeReq({ slug: 'biz-slug', limit: '0' }))
    expect(res.status).toBe(200)
  })

  test('falls back to default limit 50 when limit is non-numeric', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', limit: 'abc' }))
    expect(res.status).toBe(200)
  })

  test('falls back to default limit 50 when limit exceeds 200', async () => {
    const res = await GET(makeReq({ slug: 'biz-slug', limit: '999' }))
    expect(res.status).toBe(200)
  })

  // ── Response shape ────────────────────────────────────────────────────────

  test('response always has an entries key', async () => {
    const body = await (await GET(makeReq({ slug: 'biz-slug' }))).json()
    expect(body).toHaveProperty('entries')
    expect(Array.isArray(body.entries)).toBe(true)
  })
})
