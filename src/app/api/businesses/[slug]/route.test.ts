import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockVerifyIdToken, mockAdminGet, mockBusinessSet } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockAdminGet: vi.fn(),
  mockBusinessSet: vi.fn(),
}))

vi.mock('@/lib/firebase/admin-app', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: (col: string) => ({
      doc: () => ({
        get: col === 'admins' ? mockAdminGet : vi.fn(),
        set: col === 'businesses' ? mockBusinessSet : vi.fn(),
      }),
    }),
  },
}))

import { PATCH } from './route'

function makeReq(body: object, token: string | null = null): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return new NextRequest('http://localhost/api/businesses/paddleup', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ slug: 'paddleup' })

describe('PATCH /api/businesses/[slug]', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset()
    mockAdminGet.mockReset()
    mockBusinessSet.mockReset()
  })

  test('returns 401 when Authorization header is absent', async () => {
    const res = await PATCH(makeReq({}), { params })
    expect(res.status).toBe(401)
  })

  test('returns 401 when the token fails verification', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('invalid-token'))
    const res = await PATCH(makeReq({}, 'bad-token'), { params })
    expect(res.status).toBe(401)
  })

  test('returns 403 when the caller has no admin document', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'alice' })
    mockAdminGet.mockResolvedValue({ exists: false, data: () => undefined })
    const res = await PATCH(makeReq({}, 'valid-token'), { params })
    expect(res.status).toBe(403)
  })

  test('returns 403 when the caller is not admin of the requested slug', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'alice' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['other-slug'] }) })
    const res = await PATCH(makeReq({}, 'valid-token'), { params })
    expect(res.status).toBe(403)
  })

  test('returns 200 with { ok: true } when caller is admin of the slug', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'alice' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['paddleup'] }) })
    mockBusinessSet.mockResolvedValue(undefined)
    const res = await PATCH(makeReq({ name: 'Updated' }, 'valid-token'), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('writes only allowed fields to Firestore', async () => {
    const body = { name: 'Updated Name', tagline: 'New Tagline' }
    mockVerifyIdToken.mockResolvedValue({ uid: 'alice' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['paddleup'] }) })
    mockBusinessSet.mockResolvedValue(undefined)
    await PATCH(makeReq(body, 'valid-token'), { params })
    expect(mockBusinessSet).toHaveBeenCalledWith(body, { merge: true })
  })

  test('strips disallowed fields before writing to Firestore', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'alice' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['paddleup'] }) })
    mockBusinessSet.mockResolvedValue(undefined)
    const body = { name: 'Legit', slug: 'injected', rating: 9999, reviewCount: 0 }
    const res = await PATCH(makeReq(body, 'valid-token'), { params })
    expect(res.status).toBe(200)
    expect(mockBusinessSet).toHaveBeenCalledWith({ name: 'Legit' }, { merge: true })
  })

  test('returns 400 when body contains only disallowed fields', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'alice' })
    mockAdminGet.mockResolvedValue({ exists: true, data: () => ({ slugs: ['paddleup'] }) })
    const res = await PATCH(makeReq({ slug: 'hack', rating: 5 }, 'valid-token'), { params })
    expect(res.status).toBe(400)
    expect(mockBusinessSet).not.toHaveBeenCalled()
  })
})
