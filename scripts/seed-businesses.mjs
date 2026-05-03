/**
 * Seeds the businesses collection in Firestore.
 *
 * Usage:
 *   # Production (requires service-account.json)
 *   node scripts/seed-businesses.mjs
 *
 *   # Emulator
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-businesses.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Init ────────────────────────────────────────────────────────────────────

if (!getApps().length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-bookit' })
  } else {
    const keyPath = resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './service-account.json')
    if (!existsSync(keyPath)) {
      console.error(`Service account key not found at: ${keyPath}`)
      console.error('Run against the emulator with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080, or')
      console.error('download a key from Firebase Console → Project Settings → Service Accounts.')
      process.exit(1)
    }
    initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf-8'))) })
  }
}

const db = getFirestore()

// ─── Data ────────────────────────────────────────────────────────────────────

const businesses = [
  {
    slug: 'paddleup',
    name: 'PaddleUp',
    type: 'court',
    tagline: 'Where Pickleball Happens',
    description:
      "PaddleUp is Quezon City's premier pickleball facility, offering top-quality courts for players of all skill levels. Whether you're a beginner looking to learn the game or a seasoned competitor, our courts and community welcome you. Enjoy well-maintained surfaces, quality equipment rentals, and a vibrant community of fellow players.",
    coverImage: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1400&q=80',
    location: 'Quezon City, Metro Manila',
    address: '123 Katipunan Ave, Loyola Heights, Quezon City, 1108 Metro Manila',
    phone: '+63 917 123 4567',
    email: 'hello@paddleup.ph',
    accentColor: '#16a34a',
    rating: 4.8,
    reviewCount: 214,
    facilities: [
      { id: 'court-1', name: 'Court 1', description: 'Full-size outdoor pickleball court with premium surface and LED lighting for night play.', image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80', pricePerHour: 500, primePricePerHour: 600, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-2', name: 'Court 2', description: 'Full-size outdoor pickleball court with premium surface and LED lighting for night play.', image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80', pricePerHour: 500, primePricePerHour: 600, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-3', name: 'Court 3 (Indoor)', description: 'Climate-controlled indoor court perfect for year-round play regardless of weather.', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', pricePerHour: 700, primePricePerHour: 800, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-4', name: 'Court 4 (Indoor)', description: 'Climate-controlled indoor court perfect for year-round play regardless of weather.', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', pricePerHour: 700, primePricePerHour: 800, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-5', name: 'Court 5', description: 'Full-size outdoor pickleball court with premium surface and LED lighting for night play.', image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80', pricePerHour: 500, primePricePerHour: 600, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-6', name: 'Court 6', description: 'Full-size outdoor pickleball court with premium surface and LED lighting for night play.', image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80', pricePerHour: 500, primePricePerHour: 600, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-7', name: 'Court 7 (VIP)', description: 'Premium private court with dedicated staff, priority booking, and exclusive amenities.', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', pricePerHour: 900, primePricePerHour: 1100, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-8', name: 'Court 8 (VIP)', description: 'Premium private court with dedicated staff, priority booking, and exclusive amenities.', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', pricePerHour: 900, primePricePerHour: 1100, primeTimeStart: 17, currency: 'PHP' },
    ],
    amenities: ['Free Parking', 'Restrooms & Showers', 'Equipment Rental', 'Locker Room', 'Pro Shop', 'Snack Bar', 'Free Wi-Fi', 'Spectator Area'],
    operatingHours: [
      { day: 'Monday',    open: '6:00 AM', close: '10:00 PM' },
      { day: 'Tuesday',   open: '6:00 AM', close: '10:00 PM' },
      { day: 'Wednesday', open: '6:00 AM', close: '10:00 PM' },
      { day: 'Thursday',  open: '6:00 AM', close: '10:00 PM' },
      { day: 'Friday',    open: '6:00 AM', close: '11:00 PM' },
      { day: 'Saturday',  open: '5:00 AM', close: '11:00 PM' },
      { day: 'Sunday',    open: '5:00 AM', close: '10:00 PM' },
    ],
  },
]

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  for (const { slug, ...data } of businesses) {
    await db.collection('businesses').doc(slug).set(data, { merge: true })
    console.log(`✓ Seeded businesses/${slug}`)
  }
  console.log('\nDone. Run `firebase deploy --only firestore:rules` if you updated firestore.rules.')
}

main().catch((err) => {
  console.error('✗', err.message)
  process.exit(1)
})
