/**
 * E2E tests for the admin invite flow:
 *
 *  1. POST /api/invite — rejects unauthenticated requests
 *  2. POST /api/invite — rejects non-admins
 *  3. POST /api/invite — creates invite token (admin can call successfully)
 *  4. POST /api/accept-invite — rejects missing token
 *  5. POST /api/accept-invite — rejects invalid token
 *  6. POST /api/accept-invite — rejects unauthenticated
 *  7. POST /api/accept-invite — redeems a valid invite and grants admin access
 *  8. POST /api/accept-invite — rejects already-redeemed invite (409)
 *  9. GET /api/admin-team — rejects non-admins
 * 10. GET /api/admin-team — returns list of admins for the business
 * 11. Settings UI — Team Members section is visible (admin)
 * 12. Settings UI — invite form submits and shows success message
 *
 * Prerequisites:
 *   firebase emulators:start  (Auth 9099, Firestore 8080)
 *   npm run dev
 */

import { test, expect } from '@playwright/test'
import {
  clearFirestore,
  seedBusiness,
  createTestUser,
  signInUser,
  seedAdminDoc,
} from './helpers'

const ADMIN_EMAIL  = 'invite-admin@bookit-test.internal'
const ADMIN_PASS   = 'InviteAdmin1!'
const USER_EMAIL   = 'invite-user@bookit-test.internal'
const USER_PASS    = 'InviteUser1!'
const INVITEE_EMAIL = 'new-admin@bookit-test.internal'
const INVITEE_PASS  = 'NewAdmin1!'

const FIRESTORE = 'http://localhost:8080'
const PROJECT   = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'

let adminUserId  = ''
let regularUserId = ''

test.beforeAll(async () => {
  await createTestUser(ADMIN_EMAIL,  ADMIN_PASS,  'Invite Admin')
  await createTestUser(USER_EMAIL,   USER_PASS,   'Regular User')
  await createTestUser(INVITEE_EMAIL, INVITEE_PASS, 'New Admin')
  const a = await signInUser(ADMIN_EMAIL, ADMIN_PASS)
  const u = await signInUser(USER_EMAIL,  USER_PASS)
  adminUserId   = a.localId
  regularUserId = u.localId
})

test.beforeEach(async () => {
  await clearFirestore()
  await seedBusiness()
  await seedAdminDoc(adminUserId, ['paddleup'])
})

// ─── POST /api/invite ─────────────────────────────────────────────────────────

test.describe('POST /api/invite', () => {
  test('rejects unauthenticated request', async ({ request }) => {
    const res = await request.post('/api/invite', {
      data: { email: INVITEE_EMAIL, businessSlug: 'paddleup', businessName: 'PaddleUp Ortigas' },
    })
    expect(res.status()).toBe(401)
  })

  test('rejects non-admin user', async ({ request }) => {
    const { idToken } = await signInUser(USER_EMAIL, USER_PASS)
    const res = await request.post('/api/invite', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { email: INVITEE_EMAIL, businessSlug: 'paddleup', businessName: 'PaddleUp Ortigas' },
    })
    expect(res.status()).toBe(403)
  })

  test('admin can send an invite (returns 200 ok)', async ({ request }) => {
    const { idToken } = await signInUser(ADMIN_EMAIL, ADMIN_PASS)
    const res = await request.post('/api/invite', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { email: INVITEE_EMAIL, businessSlug: 'paddleup', businessName: 'PaddleUp Ortigas' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as { ok?: boolean }
    expect(body.ok).toBe(true)
  })

  test('rejects missing email', async ({ request }) => {
    const { idToken } = await signInUser(ADMIN_EMAIL, ADMIN_PASS)
    const res = await request.post('/api/invite', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { businessSlug: 'paddleup', businessName: 'PaddleUp Ortigas' },
    })
    expect(res.status()).toBe(400)
  })
})

// ─── POST /api/accept-invite ─────────────────────────────────────────────────

async function seedInviteToken(token: string, overrides: Record<string, unknown> = {}) {
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
  const body = {
    fields: {
      token:        { stringValue: token },
      email:        { stringValue: INVITEE_EMAIL },
      businessSlug: { stringValue: 'paddleup' },
      businessName: { stringValue: 'PaddleUp Ortigas' },
      invitedBy:    { stringValue: adminUserId },
      inviterName:  { stringValue: 'Invite Admin' },
      expiresAt:    { timestampValue: expiresAt.toISOString() },
      createdAt:    { timestampValue: new Date().toISOString() },
      ...overrides,
    },
  }
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/invites/${token}`,
    {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body:    JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error(`seedInviteToken failed: ${await res.text()}`)
}

test.describe('POST /api/accept-invite', () => {
  test('rejects unauthenticated request', async ({ request }) => {
    const res = await request.post('/api/accept-invite', {
      data: { token: 'some-token' },
    })
    expect(res.status()).toBe(401)
  })

  test('rejects missing token', async ({ request }) => {
    const { idToken } = await signInUser(INVITEE_EMAIL, INVITEE_PASS)
    const res = await request.post('/api/accept-invite', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: {},
    })
    expect(res.status()).toBe(400)
  })

  test('rejects nonexistent token', async ({ request }) => {
    const { idToken } = await signInUser(INVITEE_EMAIL, INVITEE_PASS)
    const res = await request.post('/api/accept-invite', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { token: 'does-not-exist' },
    })
    expect(res.status()).toBe(404)
  })

  test('grants admin access when token is valid', async ({ request }) => {
    const token = 'valid-test-token-abc123'
    await seedInviteToken(token)

    const { idToken, localId } = await signInUser(INVITEE_EMAIL, INVITEE_PASS)
    const res = await request.post('/api/accept-invite', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { token },
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as { ok?: boolean; businessSlug?: string }
    expect(body.ok).toBe(true)
    expect(body.businessSlug).toBe('paddleup')

    // Verify admin doc was written
    const adminRes = await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/admins/${localId}`,
      { headers: { Authorization: 'Bearer owner' } },
    )
    const adminData = await adminRes.json() as { fields?: { slugs?: { arrayValue?: { values?: Array<{ stringValue: string }> } } } }
    const slugs = adminData.fields?.slugs?.arrayValue?.values?.map((v) => v.stringValue) ?? []
    expect(slugs).toContain('paddleup')
  })

  test('rejects already-redeemed invite (409)', async ({ request }) => {
    const token = 'already-redeemed-token'
    await seedInviteToken(token, {
      redeemedAt: { timestampValue: new Date().toISOString() },
      redeemedBy: { stringValue: regularUserId },
    })

    const { idToken } = await signInUser(INVITEE_EMAIL, INVITEE_PASS)
    const res = await request.post('/api/accept-invite', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { token },
    })
    expect(res.status()).toBe(409)
  })

  test('rejects expired invite (410)', async ({ request }) => {
    const token = 'expired-token'
    const pastDate = new Date(Date.now() - 1000)
    await seedInviteToken(token, {
      expiresAt: { timestampValue: pastDate.toISOString() },
    })

    const { idToken } = await signInUser(INVITEE_EMAIL, INVITEE_PASS)
    const res = await request.post('/api/accept-invite', {
      headers: { Authorization: `Bearer ${idToken}` },
      data: { token },
    })
    expect(res.status()).toBe(410)
  })
})

// ─── GET /api/admin-team ─────────────────────────────────────────────────────

test.describe('GET /api/admin-team', () => {
  test('rejects unauthenticated', async ({ request }) => {
    const res = await request.get('/api/admin-team?slug=paddleup')
    expect(res.status()).toBe(401)
  })

  test('rejects non-admin', async ({ request }) => {
    const { idToken } = await signInUser(USER_EMAIL, USER_PASS)
    const res = await request.get('/api/admin-team?slug=paddleup', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    expect(res.status()).toBe(403)
  })

  test('returns admin list for valid admin', async ({ request }) => {
    const { idToken } = await signInUser(ADMIN_EMAIL, ADMIN_PASS)
    const res = await request.get('/api/admin-team?slug=paddleup', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as { members: Array<{ uid: string; email: string; displayName: string }> }
    expect(Array.isArray(body.members)).toBe(true)
    const member = body.members.find((m) => m.uid === adminUserId)
    expect(member).toBeDefined()
    expect(member?.email).toBe(ADMIN_EMAIL)
  })
})

// ─── Settings UI ─────────────────────────────────────────────────────────────

async function signInAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/paddleup')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 8_000 })
  await page.getByPlaceholder('you@example.com').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('••••••••').fill(ADMIN_PASS)
  await page.locator('form').getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText('Welcome back')).not.toBeAttached({ timeout: 8_000 })
}

test.describe('Settings UI — Team Members', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Team Members section is visible in Settings', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/paddleup')
    await page.getByRole('tab', { name: /settings/i }).click()
    await expect(page.getByText('Team Members')).toBeVisible({ timeout: 10_000 })
  })

  test('opening Team Members shows invite form', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/paddleup')
    await page.getByRole('tab', { name: /settings/i }).click()
    await page.getByText('Team Members').click()
    await expect(page.getByTestId('invite-email-input')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('invite-submit-btn')).toBeVisible()
  })

  test('invite form submits and shows success message', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/paddleup')
    await page.getByRole('tab', { name: /settings/i }).click()
    await page.getByText('Team Members').click()
    await page.getByTestId('invite-email-input').fill('brand-new@example.com')
    await page.getByTestId('invite-submit-btn').click()
    await expect(page.getByTestId('invite-success')).toBeVisible({ timeout: 10_000 })
  })
})
