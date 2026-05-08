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
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, beforeEach, afterEach, afterAll, describe, test } from 'vitest'

const RULES_PATH = resolve(process.cwd(), 'firestore.rules')
const PROJECT_ID = 'demo-bookit'

let testEnv: RulesTestEnvironment

function creditDoc(userId: string, businessSlug: string) {
  return {
    userId,
    businessSlug,
    businessName:    'PaddleUp',
    amount:          500,
    currency:        'PHP',
    type:            'issued',
    reason:          'cancellation',
    sourceBookingId: 'bk-1',
    expiresAt:       new Date(Date.now() + 365 * 86_400_000),
    createdAt:       new Date(),
  }
}

async function seedCredit(id: string, data: object) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'credits', id), data)
  })
}

async function seedAdmin(uid: string, slugs: string[]) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'admins', uid), { slugs })
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

// ─── Unauthenticated reads ────────────────────────────────────────────────────

describe('credits — unauthenticated reads', () => {
  beforeEach(async () => {
    await seedCredit('c1', creditDoc('alice', 'paddleup'))
  })

  test('unauthenticated user cannot get a credit doc by ID', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'credits', 'c1')))
  })

  test('unauthenticated user cannot list the credits collection', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDocs(collection(db, 'credits')))
  })

  test('unauthenticated user cannot query credits by userId', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      getDocs(query(collection(db, 'credits'), where('userId', '==', 'alice')))
    )
  })
})

// ─── Owner reads ──────────────────────────────────────────────────────────────

describe('credits — owner reads', () => {
  beforeEach(async () => {
    await seedCredit('c1', creditDoc('alice', 'paddleup'))
    await seedCredit('c2', creditDoc('bob',   'paddleup'))
  })

  test('owner can get their own credit by document ID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(db, 'credits', 'c1')))
  })

  test('owner can list their own credits by userId query', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      getDocs(query(collection(db, 'credits'), where('userId', '==', 'alice')))
    )
  })

  test("non-owner cannot get another user's credit by document ID", async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(getDoc(doc(db, 'credits', 'c2')))
  })

  test("non-owner cannot query another user's credits", async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      getDocs(query(collection(db, 'credits'), where('userId', '==', 'bob')))
    )
  })
})

// ─── Admin reads ──────────────────────────────────────────────────────────────

describe('credits — admin reads', () => {
  beforeEach(async () => {
    await seedAdmin('paddleup-admin', ['paddleup'])
    await seedAdmin('rival-admin',    ['rival-courts'])
    await seedCredit('c1', creditDoc('alice', 'paddleup'))
    await seedCredit('c2', creditDoc('bob',   'rival-courts'))
  })

  test('admin of the same business can get a credit by document ID', async () => {
    const db = testEnv.authenticatedContext('paddleup-admin').firestore()
    await assertSucceeds(getDoc(doc(db, 'credits', 'c1')))
  })

  test('admin of the same business can query credits by businessSlug', async () => {
    const db = testEnv.authenticatedContext('paddleup-admin').firestore()
    await assertSucceeds(
      getDocs(query(collection(db, 'credits'), where('businessSlug', '==', 'paddleup')))
    )
  })

  test('admin of a DIFFERENT business cannot get a credit by document ID', async () => {
    const db = testEnv.authenticatedContext('rival-admin').firestore()
    await assertFails(getDoc(doc(db, 'credits', 'c1')))
  })

  test('admin of a DIFFERENT business cannot query credits for another business', async () => {
    const db = testEnv.authenticatedContext('rival-admin').firestore()
    await assertFails(
      getDocs(query(collection(db, 'credits'), where('businessSlug', '==', 'paddleup')))
    )
  })
})

// ─── Client writes (must all be denied — writes go through Admin SDK) ─────────

describe('credits — client writes are denied', () => {
  beforeEach(async () => {
    await seedAdmin('paddleup-admin', ['paddleup'])
    await seedCredit('c1', creditDoc('alice', 'paddleup'))
  })

  test('owner cannot create a credit doc', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'credits', 'new-credit'), creditDoc('alice', 'paddleup')))
  })

  test('owner cannot update their own credit (e.g. self-void)', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(db, 'credits', 'c1'), { voided: true }))
  })

  test('admin cannot create a credit doc', async () => {
    const db = testEnv.authenticatedContext('paddleup-admin').firestore()
    await assertFails(setDoc(doc(db, 'credits', 'admin-credit'), creditDoc('alice', 'paddleup')))
  })

  test('admin cannot update (void) a credit directly', async () => {
    const db = testEnv.authenticatedContext('paddleup-admin').firestore()
    await assertFails(updateDoc(doc(db, 'credits', 'c1'), { voided: true }))
  })

  test('unauthenticated user cannot create a credit doc', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(setDoc(doc(db, 'credits', 'unauth-credit'), creditDoc('alice', 'paddleup')))
  })
})

// ─── Booking update rule regression ──────────────────────────────────────────
// Ensures the cancellation rule changes didn't regress the booking update rules.

describe('bookings — update rule regression after credits feature', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bookings', 'bk1'), {
        userId:        'alice',
        userEmail:     'alice@test.com',
        userName:      'Alice',
        businessSlug:  'paddleup',
        businessName:  'PaddleUp',
        facilityId:    'court-1',
        facilityName:  'Court 1',
        date:          '2026-09-01',
        hours:         [10],
        totalPrice:    500,
        currency:      'PHP',
        status:        'confirmed',
      })
    })
  })

  test('owner can still flip status to "cancelled" (only that field)', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(updateDoc(doc(db, 'bookings', 'bk1'), { status: 'cancelled' }))
  })

  test('owner cannot set paymentStatus directly (e.g. to "credited")', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(db, 'bookings', 'bk1'), { paymentStatus: 'credited' }))
  })

  test('owner cannot set paymentStatus to "refund_pending" directly', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(db, 'bookings', 'bk1'), { paymentStatus: 'refund_pending' })
    )
  })

  test('owner cannot set both status and paymentStatus in the same update', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(db, 'bookings', 'bk1'), { status: 'cancelled', paymentStatus: 'credited' })
    )
  })
})
