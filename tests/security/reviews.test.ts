import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
} from 'firebase/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, afterEach, afterAll, describe, test } from 'vitest'

const RULES_PATH = resolve(process.cwd(), 'firestore.rules')
const PROJECT_ID = 'demo-bookit'

let testEnv: RulesTestEnvironment

function reviewDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId:       'alice',
    userName:     'Alice',
    businessSlug: 'paddleup',
    bookingId:    'booking-1',
    rating:       5,
    comment:      'Great court!',
    createdAt:    new Date(),
    ...overrides,
  }
}

async function seedReview(reviewId: string, data = reviewDoc()) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'businesses', 'paddleup', 'reviews', reviewId),
      data,
    )
  })
}

async function seedAdmin(uid: string, slug: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'admins', uid), { slugs: [slug] })
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host:  'localhost',
      port:  8080,
    },
  })
})

afterEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
})

// ─── Public reads ─────────────────────────────────────────────────────────────

describe('reviews — public reads', () => {
  test('unauthenticated user can read a review by ID', async () => {
    await seedReview('booking-1')
    const db = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(
      getDoc(doc(db, 'businesses', 'paddleup', 'reviews', 'booking-1')),
    )
  })

  test('unauthenticated user can list reviews for a business', async () => {
    await seedReview('booking-1')
    const db = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(
      getDocs(collection(db, 'businesses', 'paddleup', 'reviews')),
    )
  })

  test('authenticated user can read reviews', async () => {
    await seedReview('booking-1')
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      getDoc(doc(db, 'businesses', 'paddleup', 'reviews', 'booking-1')),
    )
  })
})

// ─── Client writes are denied ─────────────────────────────────────────────────

describe('reviews — client writes are denied', () => {
  test('authenticated user cannot create a review directly', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(
        doc(db, 'businesses', 'paddleup', 'reviews', 'booking-1'),
        reviewDoc(),
      ),
    )
  })

  test('admin cannot create a review directly', async () => {
    await seedAdmin('admin1', 'paddleup')
    const db = testEnv.authenticatedContext('admin1').firestore()
    await assertFails(
      setDoc(
        doc(db, 'businesses', 'paddleup', 'reviews', 'booking-1'),
        reviewDoc(),
      ),
    )
  })

  test('unauthenticated user cannot create a review', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(
        doc(db, 'businesses', 'paddleup', 'reviews', 'booking-1'),
        reviewDoc(),
      ),
    )
  })

  test('authenticated user cannot delete a review', async () => {
    await seedReview('booking-1')
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      deleteDoc(doc(db, 'businesses', 'paddleup', 'reviews', 'booking-1')),
    )
  })

  test('admin cannot delete a review directly (must go via API)', async () => {
    await seedAdmin('admin1', 'paddleup')
    await seedReview('booking-1')
    const db = testEnv.authenticatedContext('admin1').firestore()
    await assertFails(
      deleteDoc(doc(db, 'businesses', 'paddleup', 'reviews', 'booking-1')),
    )
  })

  test('unauthenticated user cannot delete a review', async () => {
    await seedReview('booking-1')
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      deleteDoc(doc(db, 'businesses', 'paddleup', 'reviews', 'booking-1')),
    )
  })
})
