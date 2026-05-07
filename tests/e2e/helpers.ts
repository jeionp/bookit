// Utilities for seeding and clearing the local Firebase emulator.
// The emulator must be running before calling any of these (see README or e2e.yml).

const FIRESTORE = 'http://localhost:8080'
const AUTH     = 'http://localhost:9099'
const PROJECT  = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'bookme-821b4'

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

const OUTDOOR_IMG = 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80'
const INDOOR_IMG  = 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80'

function courtField(id: string, name: string, desc: string, img: string, price: number, prime: number) {
  return {
    mapValue: {
      fields: {
        id:                { stringValue: id },
        name:              { stringValue: name },
        description:       { stringValue: desc },
        image:             { stringValue: img },
        pricePerHour:      { integerValue: String(price) },
        primePricePerHour: { integerValue: String(prime) },
        primeTimeStart:    { integerValue: '17' },
        currency:          { stringValue: 'PHP' },
      },
    },
  }
}

export async function seedBusiness(): Promise<void> {
  const body = {
    fields: {
      name:        { stringValue: 'PaddleUp' },
      type:        { stringValue: 'court' },
      tagline:     { stringValue: 'Where Pickleball Happens' },
      description: { stringValue: "PaddleUp is Quezon City's premier pickleball facility." },
      coverImage:  { stringValue: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1400&q=80' },
      location:    { stringValue: 'Quezon City, Metro Manila' },
      address:     { stringValue: '123 Katipunan Ave, Loyola Heights, Quezon City, 1108 Metro Manila' },
      phone:       { stringValue: '+63 917 123 4567' },
      email:       { stringValue: 'hello@paddleup.ph' },
      accentColor: { stringValue: '#16a34a' },
      rating:      { doubleValue: 4.8 },
      reviewCount: { integerValue: '214' },
      facilities: {
        arrayValue: {
          values: [
            courtField('court-1', 'Court 1',          'Full-size outdoor pickleball court.', OUTDOOR_IMG, 500, 600),
            courtField('court-2', 'Court 2',          'Full-size outdoor pickleball court.', OUTDOOR_IMG, 500, 600),
            courtField('court-3', 'Court 3 (Indoor)', 'Climate-controlled indoor court.',    INDOOR_IMG,  700, 800),
            courtField('court-4', 'Court 4 (Indoor)', 'Climate-controlled indoor court.',    INDOOR_IMG,  700, 800),
            courtField('court-5', 'Court 5',          'Full-size outdoor pickleball court.', OUTDOOR_IMG, 500, 600),
            courtField('court-6', 'Court 6',          'Full-size outdoor pickleball court.', OUTDOOR_IMG, 500, 600),
            courtField('court-7', 'Court 7 (VIP)',    'Premium private court.',              INDOOR_IMG,  900, 1100),
            courtField('court-8', 'Court 8 (VIP)',    'Premium private court.',              INDOOR_IMG,  900, 1100),
          ],
        },
      },
      amenities: {
        arrayValue: {
          values: ['Free Parking', 'Restrooms & Showers', 'Equipment Rental', 'Locker Room',
                   'Pro Shop', 'Snack Bar', 'Free Wi-Fi', 'Spectator Area']
            .map((a) => ({ stringValue: a })),
        },
      },
      operatingHours: {
        arrayValue: {
          values: [
            { day: 'Monday',    open: '6:00 AM', close: '10:00 PM' },
            { day: 'Tuesday',   open: '6:00 AM', close: '10:00 PM' },
            { day: 'Wednesday', open: '6:00 AM', close: '10:00 PM' },
            { day: 'Thursday',  open: '6:00 AM', close: '10:00 PM' },
            { day: 'Friday',    open: '6:00 AM', close: '11:00 PM' },
            { day: 'Saturday',  open: '5:00 AM', close: '11:00 PM' },
            { day: 'Sunday',    open: '5:00 AM', close: '10:00 PM' },
          ].map((h) => ({
            mapValue: {
              fields: {
                day:   { stringValue: h.day },
                open:  { stringValue: h.open },
                close: { stringValue: h.close },
              },
            },
          })),
        },
      },
    },
  }

  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/businesses/paddleup`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) throw new Error(`seedBusiness failed: ${await res.text()}`)
}

export async function clearFirestore(): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    await fetch(
      `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
      { method: 'DELETE', signal: controller.signal }
    )
  } catch {
    // Emulator slow or unavailable — continue so the test can still run
  } finally {
    clearTimeout(timer)
  }
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

// Seeds a booking for a specific user using the emulator admin-bypass token.
// Pass status: 'cancelled' to seed a cancelled booking (defaults to 'confirmed').
export async function seedBookingForUser(opts: {
  facilityId:     string
  facilityName:   string
  date:           string
  hours:          number[]
  userId:         string
  userEmail:      string
  userName:       string
  status?:        string
  paymentStatus?: 'unpaid' | 'paid' | 'refunded'
}): Promise<void> {
  const fields: Record<string, unknown> = {
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
    status:     { stringValue: opts.status ?? 'confirmed' },
    userId:     { stringValue: opts.userId },
    userEmail:  { stringValue: opts.userEmail },
    userName:   { stringValue: opts.userName },
    totalPrice: { integerValue: String(opts.hours.length * 500) },
    currency:   { stringValue: 'PHP' },
    createdAt:  { timestampValue: new Date().toISOString() },
  }
  if (opts.paymentStatus) {
    fields.paymentStatus = { stringValue: opts.paymentStatus }
  }
  const body = { fields }

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
