/**
 * Storage security rules — payment_proofs/{bookingId}/{fileName}
 *
 * Rules under test (storage.rules):
 *   match /payment_proofs/{bookingId}/{fileName} {
 *     allow read:  if request.auth != null;
 *     allow write: if request.auth != null
 *       && request.resource.size < 10 * 1024 * 1024
 *       && request.resource.contentType.matches('image/.*')
 *       && request.auth.uid == firestore.get(
 *            /databases/(default)/documents/bookings/$(bookingId)
 *          ).data.userId;
 *   }
 *
 * Requires the Firebase emulator suite to be running:
 *   firebase emulators:start   (Auth 9099, Firestore 8080, Storage 9199)
 */

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app'
import { getAuth, signOut, connectAuthEmulator } from 'firebase/auth'
import { getStorage, ref, uploadBytes, getBytes, connectStorageEmulator } from 'firebase/storage'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, beforeEach, afterEach, afterAll, describe, test } from 'vitest'

const STORAGE_RULES_PATH   = resolve(process.cwd(), 'storage.rules')
const FIRESTORE_RULES_PATH = resolve(process.cwd(), 'firestore.rules')
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'
const BUCKET     = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'bookme-821b4.firebasestorage.app'
const AUTH_REST      = 'http://localhost:9099'
const FIRESTORE_REST = 'http://localhost:8080'

// Minimal 1×1 PNG — the Storage emulator enforces contentType on write.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

let testEnv: RulesTestEnvironment
let firebaseApp: FirebaseApp

// UIDs assigned by the Auth emulator — populated once in beforeAll.
const uids: Record<string, string> = {}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a user in the Auth emulator and return their UID.
 * Handles EMAIL_EXISTS by signing in instead of re-registering.
 */
async function createTestUser(email: string, password: string): Promise<string> {
  const signUp = await fetch(
    `${AUTH_REST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }
  )
  const signUpBody = await signUp.json()
  if (!signUp.ok) {
    if (signUpBody?.error?.message !== 'EMAIL_EXISTS') {
      throw new Error(`createTestUser failed: ${JSON.stringify(signUpBody)}`)
    }
    const signIn = await fetch(
      `${AUTH_REST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    )
    const signInBody = await signIn.json()
    return signInBody.localId
  }
  return signUpBody.localId
}

/** Sign in as the given user so Storage rules evaluate with their real JWT. */
async function signInAs(email: string, password: string) {
  const auth = getAuth(firebaseApp)
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  await signInWithEmailAndPassword(auth, email, password)
}

/**
 * Seed a booking document in Firestore via the emulator REST API (admin bypass).
 * Storage's cross-service firestore.get() call resolves against this data.
 */
async function seedBooking(bookingId: string, userId: string) {
  const res = await fetch(
    `${FIRESTORE_REST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/bookings/${bookingId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({
        fields: {
          userId:            { stringValue: userId },
          checkout_type:     { stringValue: 'P2P_AI' },
          payment_status_v2: { stringValue: 'pending_proof' },
          status:            { stringValue: 'slot_held' },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`seedBooking failed: ${await res.text()}`)
}

/** Upload TINY_PNG as the currently authenticated user. */
function upload(path: string) {
  const storage = getStorage(firebaseApp)
  return uploadBytes(ref(storage, path), TINY_PNG, { contentType: 'image/png' })
}

/** Attempt to read a file as the currently authenticated (or unauthenticated) user. */
function read(path: string) {
  const storage = getStorage(firebaseApp)
  return getBytes(ref(storage, path))
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    hub: { host: 'localhost', port: 4400 },
    storage:   { rules: readFileSync(STORAGE_RULES_PATH, 'utf8') },
    firestore: { rules: readFileSync(FIRESTORE_RULES_PATH, 'utf8') },
  })

  firebaseApp = initializeApp(
    { projectId: PROJECT_ID, apiKey: 'fake-key', storageBucket: BUCKET },
    'storage-payment-proofs-test'
  )
  const auth    = getAuth(firebaseApp)
  const storage = getStorage(firebaseApp)
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectStorageEmulator(storage, 'localhost', 9199)

  // Create persistent test users; keep UIDs for Firestore booking seeding.
  uids.owner    = await createTestUser('pp-rules-owner@test.com',    'pass-1234!')
  uids.nonOwner = await createTestUser('pp-rules-nonowner@test.com', 'pass-1234!')
  uids.stranger = await createTestUser('pp-rules-stranger@test.com', 'pass-1234!')
})

afterEach(async () => {
  await signOut(getAuth(firebaseApp)).catch(() => {})
  await testEnv.clearStorage()
  await testEnv.clearFirestore()
})

afterAll(async () => {
  await testEnv.cleanup()
  await deleteApp(firebaseApp)
})

// ─── Write: allowed ───────────────────────────────────────────────────────────

describe('payment_proofs — write (allowed)', () => {
  test('booking owner can upload an image to their own proof path', async () => {
    await seedBooking('booking-1', uids.owner)
    await signInAs('pp-rules-owner@test.com', 'pass-1234!')
    await assertSucceeds(upload('payment_proofs/booking-1/receipt.png'))
  })

  test('booking owner can upload to a different file name within the same bookingId', async () => {
    await seedBooking('booking-2', uids.owner)
    await signInAs('pp-rules-owner@test.com', 'pass-1234!')
    await assertSucceeds(upload('payment_proofs/booking-2/screenshot-v2.png'))
  })
})

// ─── Write: denied ────────────────────────────────────────────────────────────

describe('payment_proofs — write (denied)', () => {
  test('unauthenticated user cannot upload a proof file', async () => {
    await seedBooking('booking-3', uids.owner)
    // No signIn — firebaseApp has no active user.
    await assertFails(upload('payment_proofs/booking-3/receipt.png'))
  })

  test('non-owner cannot upload to another user\'s booking path', async () => {
    await seedBooking('booking-4', uids.owner)
    await signInAs('pp-rules-nonowner@test.com', 'pass-1234!')
    await assertFails(upload('payment_proofs/booking-4/receipt.png'))
  })

  test('authenticated user with no matching booking cannot upload (uid mismatch)', async () => {
    await seedBooking('booking-5', uids.owner)
    await signInAs('pp-rules-stranger@test.com', 'pass-1234!')
    await assertFails(upload('payment_proofs/booking-5/receipt.png'))
  })
})

// ─── Read: allowed ────────────────────────────────────────────────────────────

describe('payment_proofs — read (allowed)', () => {
  beforeEach(async () => {
    // Pre-seed a proof file so reads have something to fetch.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const s = ctx.storage(`gs://${BUCKET}`)
      await s.ref('payment_proofs/booking-read-1/receipt.png').put(TINY_PNG, { contentType: 'image/png' })
    })
  })

  test('booking owner can read their own proof file', async () => {
    await seedBooking('booking-read-1', uids.owner)
    await signInAs('pp-rules-owner@test.com', 'pass-1234!')
    await assertSucceeds(read('payment_proofs/booking-read-1/receipt.png'))
  })

  test('authenticated non-owner can read any proof file (rule: any auth\'d user may read)', async () => {
    await signInAs('pp-rules-nonowner@test.com', 'pass-1234!')
    await assertSucceeds(read('payment_proofs/booking-read-1/receipt.png'))
  })

  test('authenticated stranger can read any proof file', async () => {
    await signInAs('pp-rules-stranger@test.com', 'pass-1234!')
    await assertSucceeds(read('payment_proofs/booking-read-1/receipt.png'))
  })
})

// ─── Read: denied ─────────────────────────────────────────────────────────────

describe('payment_proofs — read (denied)', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const s = ctx.storage(`gs://${BUCKET}`)
      await s.ref('payment_proofs/booking-read-2/receipt.png').put(TINY_PNG, { contentType: 'image/png' })
    })
  })

  test('unauthenticated user cannot read a proof file', async () => {
    // signOut() called in afterEach; no active user.
    await assertFails(read('payment_proofs/booking-read-2/receipt.png'))
  })
})
