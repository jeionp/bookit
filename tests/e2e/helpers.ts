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

// Write a confirmed booking document so the given hours appear as "Booked" in the UI.
export async function seedBooking(opts: {
  facilityId:   string
  facilityName: string
  date:         string
  hours:        number[]
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
      userId:     { stringValue: 'seed-user' },
      userEmail:  { stringValue: 'seed@example.com' },
      userName:   { stringValue: 'Seed User' },
      totalPrice: { integerValue: String(opts.hours.length * 500) },
      currency:   { stringValue: 'PHP' },
    },
  }

  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/bookings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
