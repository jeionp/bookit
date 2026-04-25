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
  deleteDoc,
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

function booking(userId: string, status: 'confirmed' | 'cancelled' = 'confirmed') {
  return {
    userId,
    userEmail: `${userId}@test.com`,
    userName: 'Test User',
    businessSlug: 'paddleup',
    businessName: 'PaddleUp',
    facilityId: 'court-1',
    facilityName: 'Court 1',
    date: '2026-05-01',
    hours: [9, 10],
    totalPrice: 1000,
    currency: 'PHP',
    status,
  }
}

async function seedDoc(id: string, data: object) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'bookings', id), data)
  })
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  })
})

afterEach(async () => {
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
})

// ─── Create ───────────────────────────────────────────────────────────────────

describe('bookings — create', () => {
  test('authenticated user can create a booking for themselves', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(db, 'bookings', 'b1'), booking('alice')))
  })

  test('unauthenticated user cannot create a booking', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(setDoc(doc(db, 'bookings', 'b1'), booking('alice')))
  })

  test('user cannot create a booking with a different userId', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'bookings', 'b1'), booking('bob')))
  })

  test('cannot create a booking with totalPrice of 0', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(db, 'bookings', 'b1'), { ...booking('alice'), totalPrice: 0 })
    )
  })

  test('cannot create a booking with a negative totalPrice', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(db, 'bookings', 'b1'), { ...booking('alice'), totalPrice: -100 })
    )
  })

  test('cannot create a booking with status other than "confirmed"', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(db, 'bookings', 'b1'), { ...booking('alice'), status: 'pending' })
    )
  })
})

// ─── Cancel (update) ──────────────────────────────────────────────────────────

describe('bookings — cancel', () => {
  beforeEach(async () => {
    await seedDoc('b1', booking('alice'))
  })

  test('owner can cancel their own booking', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(updateDoc(doc(db, 'bookings', 'b1'), { status: 'cancelled' }))
  })

  test('non-owner cannot cancel another user\'s booking', async () => {
    const db = testEnv.authenticatedContext('bob').firestore()
    await assertFails(updateDoc(doc(db, 'bookings', 'b1'), { status: 'cancelled' }))
  })

  test('unauthenticated user cannot cancel any booking', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(updateDoc(doc(db, 'bookings', 'b1'), { status: 'cancelled' }))
  })

  test('owner cannot set status to an arbitrary value', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(db, 'bookings', 'b1'), { status: 'refunded' }))
  })

  test('owner cannot modify fields other than status', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(db, 'bookings', 'b1'), { status: 'cancelled', totalPrice: 0 })
    )
  })
})

// ─── Read ─────────────────────────────────────────────────────────────────────

describe('bookings — read', () => {
  beforeEach(async () => {
    await seedDoc('alice-b1', booking('alice', 'confirmed'))
    await seedDoc('alice-b2', booking('alice', 'cancelled'))
    await seedDoc('bob-b1', booking('bob', 'confirmed'))
  })

  test('owner can query their own bookings', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      getDocs(query(collection(db, 'bookings'), where('userId', '==', 'alice')))
    )
  })

  test('anyone can query confirmed bookings for availability', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'bookings'),
          where('businessSlug', '==', 'paddleup'),
          where('facilityId', '==', 'court-1'),
          where('date', '==', '2026-05-01'),
          where('status', '==', 'confirmed'),
        )
      )
    )
  })

  test('unauthenticated user cannot query cancelled bookings', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      getDocs(query(collection(db, 'bookings'), where('status', '==', 'cancelled')))
    )
  })

  test('unauthenticated user cannot read the entire collection', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDocs(collection(db, 'bookings')))
  })

  test('owner can fetch their own booking by document ID', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(db, 'bookings', 'alice-b1')))
  })

  test('non-owner cannot fetch another user\'s booking by document ID', async () => {
    const db = testEnv.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(db, 'bookings', 'alice-b1')))
  })

  test('unauthenticated user cannot fetch a booking by document ID', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'bookings', 'alice-b1')))
  })
})

// ─── Delete ───────────────────────────────────────────────────────────────────

describe('bookings — delete', () => {
  beforeEach(async () => {
    await seedDoc('b1', booking('alice'))
  })

  test('owner cannot delete their own booking', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(deleteDoc(doc(db, 'bookings', 'b1')))
  })

  test('non-owner cannot delete a booking', async () => {
    const db = testEnv.authenticatedContext('bob').firestore()
    await assertFails(deleteDoc(doc(db, 'bookings', 'b1')))
  })
})
