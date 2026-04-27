// Utilities for seeding and clearing the local Firebase emulator.
// The emulator must be running before calling any of these (see README or e2e.yml).

const FIRESTORE = 'http://localhost:8080'
const AUTH     = 'http://localhost:9099'
const PROJECT  = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-bookit'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayKey(): string {
  return localDateKey(new Date())
}

export function dateKeyDelta(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return localDateKey(d)
}

// ─── Firestore ────────────────────────────────────────────────────────────────

export async function clearFirestore(): Promise<void> {
  await fetch(
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' }
  )
}

const SEED_EMAIL    = 'seed@bookit-test.internal'
const SEED_PASSWORD = 'SeedPass1!'

// Write a confirmed booking document so the given hours appear as "Booked" in the UI.
// Authenticates as a dedicated seed user so the Firestore security rules are satisfied.
export async function seedBooking(opts: {
  facilityId:   string
  facilityName: string
  date:         string
  hours:        number[]
}): Promise<void> {
  // Ensure the seed user exists, then sign in to get a real idToken + UID.
  await createTestUser(SEED_EMAIL, SEED_PASSWORD, 'Seed User')
  const { idToken, localId } = await signInUser(SEED_EMAIL, SEED_PASSWORD)

  const body = {
    fields: {
      businessSlug:  { stringValue: 'paddleup' },
      businessName:  { stringValue: 'PaddleUp' },
      facilityId:    { stringValue: opts.facilityId },
      facilityName:  { stringValue: opts.facilityName },
      date:          { stringValue: opts.date },
      hours: {
        arrayValue: {
          values: opts.hours.map((h) => ({ integerValue: String(h) })),
        },
      },
      status:     { stringValue: 'confirmed' },
      userId:     { stringValue: localId },
      userEmail:  { stringValue: SEED_EMAIL },
      userName:   { stringValue: 'Seed User' },
      totalPrice: { integerValue: String(opts.hours.length * 500) },
      currency:   { stringValue: 'PHP' },
    },
  }

  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/bookings`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error(`seedBooking failed: ${await res.text()}`)
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Creates a user in the Auth emulator. Safe to call multiple times — EMAIL_EXISTS is ignored.
export async function createTestUser(
  email:       string,
  password:    string,
  displayName: string
): Promise<void> {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: false }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (body?.error?.message !== 'EMAIL_EXISTS') {
      throw new Error(`createTestUser failed: ${JSON.stringify(body)}`)
    }
  }
}

// Signs in via the Auth emulator and returns the idToken + localId (UID).
export async function signInUser(
  email:    string,
  password: string
): Promise<{ idToken: string; localId: string }> {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`signInUser failed: ${JSON.stringify(body)}`)
  return { idToken: body.idToken, localId: body.localId }
}

// Seeds a confirmed booking for a specific user using the emulator admin-bypass
// token so that My Bookings tests can control which user owns the booking.
export async function seedBookingForUser(opts: {
  facilityId:   string
  facilityName: string
  date:         string
  hours:        number[]
  userId:       string
  userEmail:    string
  userName:     string
}): Promise<void> {
  const body = {
    fields: {
      businessSlug:  { stringValue: 'paddleup' },
      businessName:  { stringValue: 'PaddleUp' },
      facilityId:    { stringValue: opts.facilityId },
      facilityName:  { stringValue: opts.facilityName },
      date:          { stringValue: opts.date },
      hours: {
        arrayValue: {
          values: opts.hours.map((h) => ({ integerValue: String(h) })),
        },
      },
      status:     { stringValue: 'confirmed' },
      userId:     { stringValue: opts.userId },
      userEmail:  { stringValue: opts.userEmail },
      userName:   { stringValue: opts.userName },
      totalPrice: { integerValue: String(opts.hours.length * 500) },
      currency:   { stringValue: 'PHP' },
      createdAt:  { timestampValue: new Date().toISOString() },
    },
  }

  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/bookings`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer owner',
      },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error(`seedBookingForUser failed: ${await res.text()}`)
}

// ─── Admin seeding ────────────────────────────────────────────────────────────

// Writes /admins/{uid} with the given slugs, bypassing Firestore security rules.
// "Bearer owner" is the Firebase emulator's admin-bypass token.
export async function seedAdminDoc(uid: string, slugs: string[]): Promise<void> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/admins/${uid}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer owner',
      },
      body: JSON.stringify({
        fields: {
          slugs: {
            arrayValue: { values: slugs.map((s) => ({ stringValue: s })) },
          },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`seedAdminDoc failed: ${await res.text()}`)
}
