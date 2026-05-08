// API-only tests for the onboarding endpoints.
// No browser / page object is used — tests hit http://localhost:3000 directly
// using plain fetch(), following the same pattern as the existing test suite.
//
// Prerequisites:
//   firebase emulators:start   (Auth on 9099, Firestore on 8080)
//   npm run dev                (or let Playwright's webServer spin it up)

import { test, expect } from '@playwright/test'
import {
  clearFirestore,
  seedBusiness,
  createTestUser,
  signInUser,
} from './helpers'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE             = 'http://localhost:3000'
const CHECK_SLUG       = `${BASE}/api/onboarding/check-slug`
const ONBOARDING_POST  = `${BASE}/api/onboarding`

const PROJECT          = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'
const FIRESTORE        = 'http://localhost:8080'

// A stable test user whose idToken we can use in POST /api/onboarding tests.
const API_USER_EMAIL    = 'api-onboarding@bookit-test.internal'
const API_USER_PASSWORD = 'ApiPass1!'

// ─── Firestore helpers ────────────────────────────────────────────────────────

// Seed an arbitrary business document via the Firestore emulator REST API,
// using the admin-bypass "Bearer owner" token.
async function seedArbitraryBusiness(slug: string, name: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/businesses/${slug}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer owner',
      },
      body: JSON.stringify({
        fields: {
          name:        { stringValue: name },
          slug:        { stringValue: slug },
          type:        { stringValue: 'court' },
          tagline:     { stringValue: '' },
          description: { stringValue: '' },
          coverImage:  { stringValue: '' },
          location:    { stringValue: '' },
          address:     { stringValue: '' },
          phone:       { stringValue: '' },
          email:       { stringValue: '' },
          accentColor: { stringValue: '#3B82F6' },
          rating:      { doubleValue: 0 },
          reviewCount: { integerValue: '0' },
          facilities:  { arrayValue: { values: [] } },
          amenities:   { arrayValue: { values: [] } },
          operatingHours: { arrayValue: { values: [] } },
          ownerId:     { stringValue: 'seed-owner' },
          status:      { stringValue: 'active' },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`seedArbitraryBusiness(${slug}) failed: ${await res.text()}`)
}

// Read a Firestore document via the emulator REST API with the admin-bypass token.
// Returns null when the document does not exist.
async function getFirestoreDoc(collection: string, docId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${collection}/${docId}`,
    { headers: { 'Authorization': 'Bearer owner' } }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`getFirestoreDoc(${collection}/${docId}) failed: ${await res.text()}`)
  return res.json()
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  // Ensure the API test user exists in the Auth emulator before any test runs.
  await createTestUser(API_USER_EMAIL, API_USER_PASSWORD, 'API Test User')
})

test.beforeEach(async () => {
  await clearFirestore()
  await seedBusiness() // seeds businesses/paddleup
})

// ─── GET /api/onboarding/check-slug ──────────────────────────────────────────

test.describe('GET /api/onboarding/check-slug', () => {
  // A slug that has not been claimed must return { available: true }.
  test('valid available slug returns { available: true }', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=brand-new-slug`)
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body.available).toBe(true)
  })

  // The slug of the seeded paddleup business must be flagged as unavailable.
  test('slug of an existing business returns { available: false }', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=paddleup`)
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body.available).toBe(false)
  })

  // A single-character slug is too short (isValidSlug requires ≥ 3 chars) → 400.
  test('slug that is too short returns 400', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=a`)
    expect(res.status).toBe(400)
  })

  // Slugs with spaces are not valid — the API must reject them.
  test('slug with spaces returns 400', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=${encodeURIComponent('has spaces')}`)
    expect(res.status).toBe(400)
  })

  // Double hyphens are not allowed by isValidSlug.
  test('slug with double hyphens returns 400', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=bad--slug`)
    expect(res.status).toBe(400)
  })

  // Uppercase letters are not permitted in slugs.
  test('slug with uppercase letters returns 400', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=UpperCase`)
    expect(res.status).toBe(400)
  })

  // Omitting the slug query parameter entirely should return 400.
  test('missing slug param returns 400', async () => {
    const res = await fetch(CHECK_SLUG)
    expect(res.status).toBe(400)
  })

  // An empty string slug param must be rejected as invalid.
  test('empty slug param returns 400', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=`)
    expect(res.status).toBe(400)
  })

  // A slug starting with a hyphen is invalid per isValidSlug.
  test('slug starting with a hyphen returns 400', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=-leading-hyphen`)
    expect(res.status).toBe(400)
  })

  // A slug ending with a hyphen is invalid.
  test('slug ending with a hyphen returns 400', async () => {
    const res = await fetch(`${CHECK_SLUG}?slug=trailing-hyphen-`)
    expect(res.status).toBe(400)
  })

  // A freshly-seeded slug must be detected as taken without any caching.
  test('newly seeded slug is immediately detected as taken', async () => {
    await seedArbitraryBusiness('just-seeded', 'Just Seeded Business')
    const res = await fetch(`${CHECK_SLUG}?slug=just-seeded`)
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body.available).toBe(false)
  })
})

// ─── POST /api/onboarding ─────────────────────────────────────────────────────

test.describe('POST /api/onboarding', () => {
  // A request with no Authorization header must be rejected with 401.
  test('no Authorization header returns 401', async () => {
    const res = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new-venue', name: 'New Venue' }),
    })
    expect(res.status).toBe(401)
  })

  // A Bearer token that is not a valid Firebase ID token must be rejected.
  test('invalid Bearer token returns 401', async () => {
    const res = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer not-a-real-token',
      },
      body: JSON.stringify({ slug: 'new-venue', name: 'New Venue' }),
    })
    expect(res.status).toBe(401)
  })

  // A valid token but a slug that fails isValidSlug validation → 400.
  test('valid token with invalid slug returns 400', async () => {
    const { idToken } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const res = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ slug: 'AB', name: 'Bad Slug Venue' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/slug/i)
  })

  // A valid token but a missing/empty name field → 400.
  test('valid token with missing name returns 400', async () => {
    const { idToken } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const res = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ slug: 'no-name-slug' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  // When the target slug already exists in Firestore the API must return 409.
  test('valid token with a taken slug returns 409', async () => {
    const { idToken } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    // paddleup was seeded in beforeEach
    const res = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ slug: 'paddleup', name: 'Duplicate PaddleUp' }),
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/slug already taken/i)
  })

  // A valid token + valid payload targeting a free slug must succeed and write Firestore.
  test('valid token and payload creates business and admin docs', async () => {
    const { idToken, localId } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const slug = `api-created-${Date.now()}`
    const res = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        slug,
        name:        'API Created Venue',
        type:        'court',
        tagline:     'Test tagline',
        description: 'Test description',
        location:    'Manila',
        address:     '123 Test St',
        phone:       '+63 912 345 6789',
        email:       'test@venue.ph',
        accentColor: '#16a34a',
        facilities:  [],
        amenities:   [],
        operatingHours: [],
      }),
    })

    // Accept either 200 or 201 — the route uses NextResponse.json() without explicit status
    expect([200, 201]).toContain(res.status)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.slug).toBe(slug)

    // Verify the business document was written to Firestore
    const bizDoc = await getFirestoreDoc('businesses', slug)
    expect(bizDoc).not.toBeNull()
    const bizFields = (bizDoc as Record<string, unknown>).fields as Record<string, unknown>
    const nameField = bizFields.name as { stringValue: string }
    expect(nameField.stringValue).toBe('API Created Venue')
    const ownerField = bizFields.ownerId as { stringValue: string }
    expect(ownerField.stringValue).toBe(localId)

    // Verify the admin doc has the slug in its array
    const adminDoc = await getFirestoreDoc('admins', localId)
    expect(adminDoc).not.toBeNull()
    const adminFields = (adminDoc as Record<string, unknown>).fields as Record<string, unknown>
    const slugsField = adminFields.slugs as { arrayValue: { values: { stringValue: string }[] } }
    const slugValues = slugsField.arrayValue.values.map((v) => v.stringValue)
    expect(slugValues).toContain(slug)
  })

  // The route must set ownerId correctly on the business document.
  test('business document is written with correct ownerId', async () => {
    const { idToken, localId } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const slug = `owner-check-${Date.now()}`
    await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ slug, name: 'Owner Check Venue' }),
    })

    const bizDoc = await getFirestoreDoc('businesses', slug)
    expect(bizDoc).not.toBeNull()
    const fields = (bizDoc as Record<string, unknown>).fields as Record<string, unknown>
    const ownerField = fields.ownerId as { stringValue: string }
    expect(ownerField.stringValue).toBe(localId)
  })

  // The route must write a status field of "active" on the business document.
  test('business document is written with status "active"', async () => {
    const { idToken } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const slug = `status-check-${Date.now()}`
    await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ slug, name: 'Status Check Venue' }),
    })

    const bizDoc = await getFirestoreDoc('businesses', slug)
    expect(bizDoc).not.toBeNull()
    const fields = (bizDoc as Record<string, unknown>).fields as Record<string, unknown>
    const statusField = fields.status as { stringValue: string }
    expect(statusField.stringValue).toBe('active')
  })

  // A second POST with the same slug must be rejected with 409 (idempotency / conflict).
  test('second POST with the same slug returns 409 (idempotency)', async () => {
    const { idToken } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const slug = `idempotency-${Date.now()}`
    const payload = JSON.stringify({ slug, name: 'Idempotency Venue' })
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    }

    // First request must succeed
    const first = await fetch(ONBOARDING_POST, { method: 'POST', headers, body: payload })
    expect([200, 201]).toContain(first.status)

    // Second request with the same slug must return 409
    const second = await fetch(ONBOARDING_POST, { method: 'POST', headers, body: payload })
    expect(second.status).toBe(409)
    const secondBody = await second.json()
    expect(secondBody.error).toMatch(/slug already taken/i)
  })

  // The API must apply sensible defaults for optional fields when they are omitted.
  test('optional fields default correctly when omitted', async () => {
    const { idToken } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const slug = `defaults-${Date.now()}`
    const res = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      // Only supply the two required fields
      body: JSON.stringify({ slug, name: 'Minimal Venue' }),
    })

    expect([200, 201]).toContain(res.status)

    const bizDoc = await getFirestoreDoc('businesses', slug)
    expect(bizDoc).not.toBeNull()
    const fields = (bizDoc as Record<string, unknown>).fields as Record<string, unknown>

    // type defaults to "court"
    const typeField = fields.type as { stringValue: string }
    expect(typeField.stringValue).toBe('court')

    // accentColor defaults to "#3B82F6"
    const colorField = fields.accentColor as { stringValue: string }
    expect(colorField.stringValue).toBe('#3B82F6')

    // rating defaults to 0
    const ratingField = fields.rating as { doubleValue?: number; integerValue?: string }
    const ratingValue = ratingField.doubleValue ?? Number(ratingField.integerValue)
    expect(ratingValue).toBe(0)
  })

  // Facilities array is preserved as supplied in the payload.
  test('facilities are persisted from the payload', async () => {
    const { idToken } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const slug = `facilities-${Date.now()}`
    const facilities = [
      { id: 'f1', name: 'Court A', description: '', image: '', pricePerHour: 500, currency: 'PHP' },
    ]

    const res = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ slug, name: 'Facilities Venue', facilities }),
    })

    expect([200, 201]).toContain(res.status)

    const bizDoc = await getFirestoreDoc('businesses', slug)
    expect(bizDoc).not.toBeNull()
    const fields = (bizDoc as Record<string, unknown>).fields as Record<string, unknown>
    const facilitiesField = fields.facilities as { arrayValue: { values: unknown[] } }
    // Should have stored the one facility we passed
    expect(facilitiesField.arrayValue.values).toHaveLength(1)
  })

  // Two different users can each claim their own distinct slug independently.
  test('two different users can each claim their own slug', async () => {
    // Create a second distinct user for this test
    const secondEmail = `second-user-${Date.now()}@bookit-test.internal`
    await createTestUser(secondEmail, 'SecondPass1!', 'Second User')
    const { idToken: token2 } = await signInUser(secondEmail, 'SecondPass1!')
    const { idToken: token1 } = await signInUser(API_USER_EMAIL, API_USER_PASSWORD)

    const slug1 = `user1-venue-${Date.now()}`
    const slug2 = `user2-venue-${Date.now()}`

    const res1 = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ slug: slug1, name: 'User One Venue' }),
    })
    const res2 = await fetch(ONBOARDING_POST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
      body: JSON.stringify({ slug: slug2, name: 'User Two Venue' }),
    })

    expect([200, 201]).toContain(res1.status)
    expect([200, 201]).toContain(res2.status)

    // Both slugs must now exist in Firestore
    const doc1 = await getFirestoreDoc('businesses', slug1)
    const doc2 = await getFirestoreDoc('businesses', slug2)
    expect(doc1).not.toBeNull()
    expect(doc2).not.toBeNull()
  })
})
