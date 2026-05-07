import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut, connectAuthEmulator } from 'firebase/auth'
import { getStorage, ref, uploadBytes, getBytes, connectStorageEmulator } from 'firebase/storage'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeAll, beforeEach, afterEach, afterAll, describe, test } from 'vitest'

const STORAGE_RULES_PATH   = resolve(process.cwd(), 'storage.rules')
const FIRESTORE_RULES_PATH = resolve(process.cwd(), 'firestore.rules')
// Must match the project the emulators were started with so that Storage's
// cross-service firestore.get() call resolves in the correct Firestore namespace.
const PROJECT_ID = 'bookme-821b4'
const BUCKET     = 'bookme-821b4.firebasestorage.app'
const AUTH_REST      = 'http://localhost:9099'
const FIRESTORE_REST = 'http://localhost:8080'

// Minimal 1×1 PNG so the Storage emulator accepts the upload.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

let testEnv: RulesTestEnvironment
let firebaseApp: FirebaseApp

// UIDs assigned by the Auth emulator — populated once in beforeAll.
const uids: Record<string, string> = {}

// ─── Auth / seeding helpers ───────────────────────────────────────────────────

/**
 * Create a user in the Auth emulator and return their UID.
 * Safe to call multiple times — EMAIL_EXISTS is handled by signing in instead.
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
    // User already exists — sign in to retrieve their UID.
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

/** Sign in as the given user, making their real JWT the active auth token. */
async function signInAs(email: string, password: string) {
  const auth = getAuth(firebaseApp)
  await signInWithEmailAndPassword(auth, email, password)
}

/**
 * Seed /admins/{uid} in the Firestore emulator using the admin-bypass token.
 * Storage's firestore.get() call then sees this document during rules evaluation.
 */
async function seedAdmin(uid: string, slugs: string[]) {
  const res = await fetch(
    `${FIRESTORE_REST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/admins/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
      body: JSON.stringify({
        fields: {
          slugs: { arrayValue: { values: slugs.map((s) => ({ stringValue: s })) } },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`seedAdmin failed: ${await res.text()}`)
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
  // initializeTestEnvironment is used only for clearStorage() / clearFirestore()
  // and for seeding files in the public-read tests.
  // The hub config enables cross-service rules discovery.
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    hub: { host: 'localhost', port: 4400 },
    storage: { rules: readFileSync(STORAGE_RULES_PATH, 'utf8') },
    firestore: { rules: readFileSync(FIRESTORE_RULES_PATH, 'utf8') },
  })

  // Real Firebase app — authenticated operations carry real JWTs so that
  // Storage rules can cross-call firestore.get() with proper auth context.
  firebaseApp = initializeApp(
    { projectId: PROJECT_ID, apiKey: 'fake-key', storageBucket: BUCKET },
    'storage-rules-test'
  )
  const auth    = getAuth(firebaseApp)
  const storage = getStorage(firebaseApp)
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectStorageEmulator(storage, 'localhost', 9199)

  // Create persistent test users; keep their UIDs for admin-doc seeding.
  uids.paddleup   = await createTestUser('st-rules-paddleup@test.com',  'pass-1234!')
  uids.multiAdmin = await createTestUser('st-rules-multi@test.com',     'pass-1234!')
  uids.rivalAdmin = await createTestUser('st-rules-rival@test.com',     'pass-1234!')
  uids.noAdmin    = await createTestUser('st-rules-noadmin@test.com',   'pass-1234!')
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

// ─── Read: public access ──────────────────────────────────────────────────────

describe('storage — read (public)', () => {
  beforeEach(async () => {
    // Pre-seed files so reads have something to fetch.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const s = ctx.storage(`gs://${BUCKET}`)
      await s.ref('businesses/paddleup/cover').put(TINY_PNG, { contentType: 'image/png' })
      await s.ref('businesses/paddleup/courts/court-1').put(TINY_PNG, { contentType: 'image/png' })
    })
  })

  test('unauthenticated user can read businesses/paddleup/cover', async () => {
    // signOut() already called in afterEach; firebaseApp has no active user here.
    await assertSucceeds(read('businesses/paddleup/cover'))
  })

  test('unauthenticated user can read businesses/paddleup/courts/court-1', async () => {
    await assertSucceeds(read('businesses/paddleup/courts/court-1'))
  })

  test('authenticated non-admin can read businesses/paddleup/cover', async () => {
    await signInAs('st-rules-noadmin@test.com', 'pass-1234!')
    await assertSucceeds(read('businesses/paddleup/cover'))
  })
})

// ─── Write: success cases ─────────────────────────────────────────────────────

describe('storage — write (allowed)', () => {
  test('admin of paddleup can upload businesses/paddleup/cover', async () => {
    await seedAdmin(uids.paddleup, ['paddleup'])
    await signInAs('st-rules-paddleup@test.com', 'pass-1234!')
    await assertSucceeds(upload('businesses/paddleup/cover'))
  })

  test('admin of paddleup can upload businesses/paddleup/courts/court-1', async () => {
    await seedAdmin(uids.paddleup, ['paddleup'])
    await signInAs('st-rules-paddleup@test.com', 'pass-1234!')
    await assertSucceeds(upload('businesses/paddleup/courts/court-1'))
  })

  test('admin with multiple slugs can write to each of their allowed slugs', async () => {
    await seedAdmin(uids.multiAdmin, ['paddleup', 'rival-courts'])
    await signInAs('st-rules-multi@test.com', 'pass-1234!')
    await assertSucceeds(upload('businesses/paddleup/cover'))
    await assertSucceeds(upload('businesses/rival-courts/cover'))
  })
})

// ─── Write: failure cases ─────────────────────────────────────────────────────

describe('storage — write (denied)', () => {
  test('unauthenticated user cannot write to businesses/paddleup/cover', async () => {
    // No signIn — firebaseApp has no active user.
    await assertFails(upload('businesses/paddleup/cover'))
  })

  test('authenticated user with no admin document cannot write', async () => {
    await signInAs('st-rules-noadmin@test.com', 'pass-1234!')
    await assertFails(upload('businesses/paddleup/cover'))
  })

  test('admin of other-slug cannot write to businesses/paddleup/cover', async () => {
    await seedAdmin(uids.rivalAdmin, ['other-slug'])
    await signInAs('st-rules-rival@test.com', 'pass-1234!')
    await assertFails(upload('businesses/paddleup/cover'))
  })

  test('admin of paddleup cannot write to businesses/other-slug/cover', async () => {
    await seedAdmin(uids.paddleup, ['paddleup'])
    await signInAs('st-rules-paddleup@test.com', 'pass-1234!')
    await assertFails(upload('businesses/other-slug/cover'))
  })
})

// ─── Corner cases ─────────────────────────────────────────────────────────────

describe('storage — corner cases', () => {
  test('write to path outside businesses/ is denied', async () => {
    await seedAdmin(uids.paddleup, ['paddleup'])
    await signInAs('st-rules-paddleup@test.com', 'pass-1234!')
    await assertFails(upload('private/data'))
  })

  test('deeply nested path within a valid slug is allowed for an admin write', async () => {
    await seedAdmin(uids.paddleup, ['paddleup'])
    await signInAs('st-rules-paddleup@test.com', 'pass-1234!')
    await assertSucceeds(upload('businesses/paddleup/courts/court-1/extra/deep'))
  })
})
