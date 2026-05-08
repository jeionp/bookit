import { test, expect } from '@playwright/test'
import {
  clearFirestore,
  seedBusiness,
  createTestUser,
  signInUser,
  seedAdminDoc,
} from './helpers'

const BASE        = 'http://localhost:3000'
const CANCEL_URL  = `${BASE}/api/cancel`
const BOOKINGS_URL = `${BASE}/api/bookings`
const VOID_CREDIT_URL = `${BASE}/api/admin/void-credit`

// Each booking request gets a unique IP so tests never share a rate-limit bucket.
let _ipSeq = 0
function freshIp(): string {
  _ipSeq++
  return `10.${Math.floor(_ipSeq / 254)}.${_ipSeq % 254}.1`
}

const PROJECT  = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'
const FIRESTORE = 'http://localhost:8080'
const AUTH      = 'http://localhost:9099'

const PLAYER_EMAIL    = 'player-cancel@bookit-test.internal'
const PLAYER_PASSWORD = 'PlayerPass1!'
const ADMIN_EMAIL     = 'admin-cancel@bookit-test.internal'
const ADMIN_PASSWORD  = 'AdminPass1!'
const OTHER_EMAIL     = 'other-cancel@bookit-test.internal'
const OTHER_PASSWORD  = 'OtherPass1!'

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function getFirestoreDoc(
  col: string,
  docId: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${col}/${docId}`,
    { headers: { Authorization: 'Bearer owner' } },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`getFirestoreDoc(${col}/${docId}) failed: ${await res.text()}`)
  return res.json()
}

async function queryFirestoreCollection(
  col: string,
  filters: Record<string, string>,
): Promise<unknown[]> {
  const params = new URLSearchParams(
    Object.entries(filters).map(([k, v]) => [`filter.${k}`, v]),
  )
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${col}?${params}`,
    { headers: { Authorization: 'Bearer owner' } },
  )
  if (!res.ok) return []
  const body = await res.json()
  return (body.documents as unknown[]) ?? []
}

async function seedBookingViaAdmin(opts: {
  userId:      string
  businessSlug: string
  facilityId:  string
  date:        string
  hours:       number[]
  totalPrice:  number
  status?:     string
}): Promise<string> {
  const fields: Record<string, unknown> = {
    userId:       { stringValue: opts.userId },
    userEmail:    { stringValue: 'test@test.com' },
    userName:     { stringValue: 'Test User' },
    businessSlug: { stringValue: opts.businessSlug },
    businessName: { stringValue: 'PaddleUp' },
    facilityId:   { stringValue: opts.facilityId },
    facilityName: { stringValue: 'Court 1' },
    date:         { stringValue: opts.date },
    hours:        { arrayValue: { values: opts.hours.map((h) => ({ integerValue: String(h) })) } },
    totalPrice:   { integerValue: String(opts.totalPrice) },
    currency:     { stringValue: 'PHP' },
    status:       { stringValue: opts.status ?? 'confirmed' },
    createdAt:    { timestampValue: new Date().toISOString() },
  }
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/bookings`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body:    JSON.stringify({ fields }),
    },
  )
  if (!res.ok) throw new Error(`seedBookingViaAdmin failed: ${await res.text()}`)
  const body = await res.json()
  const name = body.name as string
  return name.split('/').pop()!
}

async function seedCreditViaAdmin(opts: {
  userId:      string
  businessSlug: string
  amount:      number
  type:        'issued' | 'redeemed'
  expiresAtMs: number
}): Promise<string> {
  const fields: Record<string, unknown> = {
    userId:          { stringValue: opts.userId },
    businessSlug:    { stringValue: opts.businessSlug },
    businessName:    { stringValue: 'PaddleUp' },
    amount:          { integerValue: String(opts.amount) },
    currency:        { stringValue: 'PHP' },
    type:            { stringValue: opts.type },
    reason:          { stringValue: 'cancellation' },
    sourceBookingId: { stringValue: 'bk-seed' },
    expiresAt:       { timestampValue: new Date(opts.expiresAtMs).toISOString() },
    createdAt:       { timestampValue: new Date().toISOString() },
  }
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/credits`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body:    JSON.stringify({ fields }),
    },
  )
  if (!res.ok) throw new Error(`seedCreditViaAdmin failed: ${await res.text()}`)
  const body = await res.json()
  const name = body.name as string
  return name.split('/').pop()!
}

function futureDateString(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function strVal(doc: Record<string, unknown>, field: string): string {
  const fields = doc.fields as Record<string, { stringValue?: string }>
  return fields[field]?.stringValue ?? ''
}

function intVal(doc: Record<string, unknown>, field: string): number {
  const fields = doc.fields as Record<string, { integerValue?: string; doubleValue?: number }>
  const f = fields[field]
  if (f?.doubleValue !== undefined) return f.doubleValue
  return Number(f?.integerValue ?? 0)
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await createTestUser(PLAYER_EMAIL, PLAYER_PASSWORD, 'Cancel Player')
  await createTestUser(ADMIN_EMAIL,  ADMIN_PASSWORD,  'Cancel Admin')
  await createTestUser(OTHER_EMAIL,  OTHER_PASSWORD,  'Other Player')
})

test.beforeEach(async () => {
  await clearFirestore()
  await seedBusiness()
  const { localId: adminUid } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  await seedAdminDoc(adminUid, ['paddleup'])
})

// ─── POST /api/cancel — auth checks ──────────────────────────────────────────

test.describe('POST /api/cancel — authentication', () => {
  test('no auth header returns 401', async () => {
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingId: 'any', choice: 'credit' }),
    })
    expect(res.status).toBe(401)
  })

  test('invalid/expired token returns 401', async () => {
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-real-token' },
      body:    JSON.stringify({ bookingId: 'any', choice: 'credit' }),
    })
    expect(res.status).toBe(401)
  })
})

// ─── POST /api/cancel — input validation ─────────────────────────────────────

test.describe('POST /api/cancel — input validation', () => {
  test('missing bookingId returns 400', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ choice: 'credit' }),
    })
    expect(res.status).toBe(400)
  })

  test('invalid choice value returns 400', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId: 'any', choice: 'refunded' }),
    })
    expect(res.status).toBe(400)
  })

  test('choice of "void" (not a valid enum member) returns 400', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId: 'any', choice: 'void' }),
    })
    expect(res.status).toBe(400)
  })

  test('unexpected choice string returns 400', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId: 'any', choice: 'freebie' }),
    })
    expect(res.status).toBe(400)
  })
})

// ─── POST /api/cancel — not found / ownership checks ─────────────────────────

test.describe('POST /api/cancel — not found and ownership', () => {
  test('bookingId that does not exist returns 404', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId: 'nonexistent-id', choice: 'credit' }),
    })
    expect(res.status).toBe(404)
  })

  test('booking belonging to a different user returns 403', async () => {
    const { localId: playerId } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const { idToken: otherToken } = await signInUser(OTHER_EMAIL, OTHER_PASSWORD)
    const bookingId = await seedBookingViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      facilityId:  'court-1',
      date:        futureDateString(5),
      hours:       [10],
      totalPrice:  500,
    })
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherToken}` },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    expect(res.status).toBe(403)
  })

  test("player cancels another user's booking by guessing the ID returns 403", async () => {
    const { localId: otherId } = await signInUser(OTHER_EMAIL, OTHER_PASSWORD)
    const { idToken: playerToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const bookingId = await seedBookingViaAdmin({
      userId:      otherId,
      businessSlug: 'paddleup',
      facilityId:  'court-1',
      date:        futureDateString(5),
      hours:       [11],
      totalPrice:  500,
    })
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerToken}` },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    expect(res.status).toBe(403)
  })

  test('already-cancelled booking returns 409', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const bookingId = await seedBookingViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      facilityId:  'court-1',
      date:        futureDateString(5),
      hours:       [12],
      totalPrice:  500,
      status:      'cancelled',
    })
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    expect(res.status).toBe(409)
  })
})

// ─── POST /api/cancel — blocked window ───────────────────────────────────────

test.describe('POST /api/cancel — blocked window', () => {
  test('booking within no-cancel window (< 2h away) returns 422 CANCEL_BLOCKED', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const now       = new Date()
    const bookingDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const firstHour = now.getHours()
    const bookingId = await seedBookingViaAdmin({
      userId:       playerId,
      businessSlug: 'paddleup',
      facilityId:   'court-1',
      date:         bookingDate,
      hours:        [firstHour],
      totalPrice:   500,
    })
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('CANCEL_BLOCKED')
  })
})

// ─── POST /api/cancel — happy paths ──────────────────────────────────────────

test.describe('POST /api/cancel — happy paths', () => {
  test('free cancel (booking >24h away) returns tier=free, refundRatio=1', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const bookingId = await seedBookingViaAdmin({
      userId:       playerId,
      businessSlug: 'paddleup',
      facilityId:   'court-1',
      date:         futureDateString(5),
      hours:        [9],
      totalPrice:   500,
    })
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tier).toBe('free')
    expect(body.refundRatio).toBe(1)
    expect(body.creditAmount).toBe(500)
    expect(body.currency).toBe('PHP')
  })

  test('free cancel with choice "credit" — booking cancelled and credit doc created', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const bookingId = await seedBookingViaAdmin({
      userId:       playerId,
      businessSlug: 'paddleup',
      facilityId:   'court-1',
      date:         futureDateString(5),
      hours:        [9],
      totalPrice:   500,
    })
    await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    const bookingDoc = await getFirestoreDoc('bookings', bookingId)
    expect(bookingDoc).not.toBeNull()
    expect(strVal(bookingDoc!, 'status')).toBe('cancelled')
    expect(strVal(bookingDoc!, 'paymentStatus')).toBe('credited')

    const credits = await queryFirestoreCollection('credits', {})
    expect(credits.length).toBeGreaterThan(0)
    const credit = credits.find((c) => {
      const doc = c as Record<string, unknown>
      const f = doc.fields as Record<string, { stringValue?: string }>
      return f.userId?.stringValue === playerId && f.type?.stringValue === 'issued'
    })
    expect(credit).toBeDefined()
    const creditDoc = credit as Record<string, unknown>
    const fields = creditDoc.fields as Record<string, { integerValue?: string; stringValue?: string; timestampValue?: string }>
    expect(Number(fields.amount?.integerValue)).toBe(500)
    const expiresAt = new Date(fields.expiresAt?.timestampValue ?? 0)
    const oneYearFromNow = new Date(Date.now() + 364 * 86_400_000)
    expect(expiresAt.getTime()).toBeGreaterThan(oneYearFromNow.getTime())
  })

  test('free cancel with choice "refund_pending" — booking gets refund_pending, NO credit doc', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const bookingId = await seedBookingViaAdmin({
      userId:       playerId,
      businessSlug: 'paddleup',
      facilityId:   'court-1',
      date:         futureDateString(5),
      hours:        [10],
      totalPrice:   500,
    })
    await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId, choice: 'refund_pending' }),
    })
    const bookingDoc = await getFirestoreDoc('bookings', bookingId)
    expect(strVal(bookingDoc!, 'status')).toBe('cancelled')
    expect(strVal(bookingDoc!, 'paymentStatus')).toBe('refund_pending')

    const credits = await queryFirestoreCollection('credits', {})
    const issuedForPlayer = credits.filter((c) => {
      const doc = c as Record<string, unknown>
      const f = doc.fields as Record<string, { stringValue?: string }>
      return f.userId?.stringValue === playerId && f.type?.stringValue === 'issued'
    })
    expect(issuedForPlayer).toHaveLength(0)
  })

  test('cancel booking with totalPrice 0 — no credit doc created', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const bookingId = await seedBookingViaAdmin({
      userId:       playerId,
      businessSlug: 'paddleup',
      facilityId:   'court-1',
      date:         futureDateString(5),
      hours:        [9],
      totalPrice:   0,
    })
    const res = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.creditAmount).toBe(0)

    const credits = await queryFirestoreCollection('credits', {})
    const issuedForPlayer = credits.filter((c) => {
      const doc = c as Record<string, unknown>
      const f = doc.fields as Record<string, { stringValue?: string }>
      return f.userId?.stringValue === playerId && f.type?.stringValue === 'issued'
    })
    expect(issuedForPlayer).toHaveLength(0)
  })
})

// ─── POST /api/cancel — race conditions ──────────────────────────────────────

test.describe('POST /api/cancel — race / double-cancel', () => {
  test('cancelling the same booking twice: second request returns 409', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const bookingId = await seedBookingViaAdmin({
      userId:       playerId,
      businessSlug: 'paddleup',
      facilityId:   'court-1',
      date:         futureDateString(5),
      hours:        [9],
      totalPrice:   500,
    })
    const first = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    expect(first.status).toBe(200)

    const second = await fetch(CANCEL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({ bookingId, choice: 'credit' }),
    })
    expect(second.status).toBe(409)
  })
})

// ─── POST /api/bookings with creditAmount ─────────────────────────────────────

test.describe('POST /api/bookings — creditAmount happy paths', () => {
  test('creditAmount: 0 → booking created normally, no redemption doc', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [9],
        businessSlug: 'paddleup',
        creditAmount: 0,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.creditApplied).toBeUndefined()
  })

  test('creditAmount equal to full balance → booking confirmed, redemption doc created', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      500,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [9],
        businessSlug: 'paddleup',
        creditAmount: 500,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.creditApplied).toBe(500)

    const bookingDoc = await getFirestoreDoc('bookings', body.bookingId)
    expect(bookingDoc).not.toBeNull()
    const fields = (bookingDoc!.fields as Record<string, { integerValue?: string }>)
    expect(Number(fields.creditApplied?.integerValue ?? fields.creditApplied)).toBe(500)
  })

  test('creditAmount less than full balance → partial credit, booking confirmed', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      1000,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [10],
        businessSlug: 'paddleup',
        creditAmount: 200,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.creditApplied).toBe(200)
  })

  test('creditAmount equal to totalPrice → amountDue is 0, booking confirmed', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      500,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [11],
        businessSlug: 'paddleup',
        creditAmount: 500,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.creditApplied).toBe(500)
  })

  test('creditAmount > totalPrice → server clamps to totalPrice (no error)', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      2000,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [12],
        businessSlug: 'paddleup',
        creditAmount: 9999,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.creditApplied).toBe(500)
  })
})

// ─── POST /api/bookings — creditAmount error/exploitation ─────────────────────

test.describe('POST /api/bookings — creditAmount error and exploitation', () => {
  test('creditAmount > available balance returns 422 INSUFFICIENT_CREDITS', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      100,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [9],
        businessSlug: 'paddleup',
        creditAmount: 500,
      }),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('INSUFFICIENT_CREDITS')
  })

  test('negative creditAmount returns 400', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [9],
        businessSlug: 'paddleup',
        creditAmount: -100,
      }),
    })
    expect(res.status).toBe(400)
  })

  test('creditAmount as a string returns 400 (type check)', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [9],
        businessSlug: 'paddleup',
        creditAmount: '500',
      }),
    })
    expect(res.status).toBe(400)
  })

  test('player fabricates high creditAmount with no credits at that business → 422', async () => {
    const { idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [9],
        businessSlug: 'paddleup',
        creditAmount: 500,
      }),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('INSUFFICIENT_CREDITS')
  })

  test('player sends creditAmount for wrong businessSlug (credits at different biz) → 422', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'rival-courts',
      amount:      1000,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(BOOKINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
      body:    JSON.stringify({
        facilityId:   'court-1',
        date:         futureDateString(7),
        hours:        [9],
        businessSlug: 'paddleup',
        creditAmount: 500,
      }),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('INSUFFICIENT_CREDITS')
  })

  test('concurrent bookings with same creditAmount: one succeeds, one gets INSUFFICIENT_CREDITS or slot error', async () => {
    const { localId: playerId, idToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      500,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const sharedDate = futureDateString(8)
    const [res1, res2] = await Promise.all([
      fetch(BOOKINGS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
        body:    JSON.stringify({
          facilityId:   'court-1',
          date:         sharedDate,
          hours:        [9],
          businessSlug: 'paddleup',
          creditAmount: 500,
        }),
      }),
      fetch(BOOKINGS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'x-real-ip': freshIp() },
        body:    JSON.stringify({
          facilityId:   'court-1',
          date:         sharedDate,
          hours:        [9],
          businessSlug: 'paddleup',
          creditAmount: 500,
        }),
      }),
    ])
    const statuses = [res1.status, res2.status]
    expect(statuses).toContain(201)
    const failStatus = statuses.find((s) => s !== 201)
    expect([409, 422]).toContain(failStatus)
  })
})

// ─── POST /api/admin/void-credit — happy paths ───────────────────────────────

test.describe('POST /api/admin/void-credit — happy paths', () => {
  test('admin of the business can void a credit → doc gets voided: true', async () => {
    const { localId: playerId } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const { localId: adminId, idToken: adminToken } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await seedAdminDoc(adminId, ['paddleup'])
    const creditId = await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      500,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(VOID_CREDIT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body:    JSON.stringify({ creditId }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const creditDoc = await getFirestoreDoc('credits', creditId)
    const fields = creditDoc!.fields as Record<string, { booleanValue?: boolean }>
    expect(fields.voided?.booleanValue).toBe(true)
  })
})

// ─── POST /api/admin/void-credit — error and exploitation ────────────────────

test.describe('POST /api/admin/void-credit — error and exploitation', () => {
  test('no auth header returns 401', async () => {
    const res = await fetch(VOID_CREDIT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ creditId: 'any' }),
    })
    expect(res.status).toBe(401)
  })

  test('non-admin user tries to void a credit → 403', async () => {
    const { localId: playerId, idToken: playerToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const creditId = await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      500,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(VOID_CREDIT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerToken}` },
      body:    JSON.stringify({ creditId }),
    })
    expect(res.status).toBe(403)
  })

  test('admin of business A cannot void a credit issued by business B → 403', async () => {
    const { localId: adminId, idToken: adminToken } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await seedAdminDoc(adminId, ['paddleup'])
    const { localId: otherId } = await signInUser(OTHER_EMAIL, OTHER_PASSWORD)
    const creditId = await seedCreditViaAdmin({
      userId:      otherId,
      businessSlug: 'rival-courts',
      amount:      300,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(VOID_CREDIT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body:    JSON.stringify({ creditId }),
    })
    expect(res.status).toBe(403)
  })

  test('creditId that does not exist returns 404', async () => {
    const { localId: adminId, idToken: adminToken } = await signInUser(ADMIN_EMAIL, ADMIN_PASSWORD)
    await seedAdminDoc(adminId, ['paddleup'])
    const res = await fetch(VOID_CREDIT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body:    JSON.stringify({ creditId: 'does-not-exist' }),
    })
    expect(res.status).toBe(404)
  })

  test('player (non-admin) tries to void their own credit → 403', async () => {
    const { localId: playerId, idToken: playerToken } = await signInUser(PLAYER_EMAIL, PLAYER_PASSWORD)
    const creditId = await seedCreditViaAdmin({
      userId:      playerId,
      businessSlug: 'paddleup',
      amount:      500,
      type:        'issued',
      expiresAtMs: Date.now() + 365 * 86_400_000,
    })
    const res = await fetch(VOID_CREDIT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerToken}` },
      body:    JSON.stringify({ creditId }),
    })
    expect(res.status).toBe(403)
  })

  test('invalid Bearer token returns 401', async () => {
    const res = await fetch(VOID_CREDIT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer garbage-token' },
      body:    JSON.stringify({ creditId: 'any' }),
    })
    expect(res.status).toBe(401)
  })
})
