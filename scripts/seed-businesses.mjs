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

// ─── Slugs to remove (old test businesses) ───────────────────────────────────

const SLUGS_TO_DELETE = ['paddle-down', 'tennis-test', 'paddle-test', 'baddieminton']

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
  {
    slug: 'smashpoint',
    name: 'SmashPoint Badminton',
    type: 'court',
    tagline: 'Rally, Smash, Repeat',
    description:
      "SmashPoint is BGC's go-to badminton facility, featuring eight professional-grade courts with premium wooden flooring and competition-standard net systems. Ideal for casual rallies, league matches, and corporate tournaments. Shuttles and rackets available for rent at the counter.",
    coverImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1400&q=80',
    location: 'Bonifacio Global City, Taguig',
    address: '5th Ave corner 26th St, Bonifacio Global City, Taguig, 1634 Metro Manila',
    phone: '+63 917 234 5678',
    email: 'hello@smashpoint.ph',
    accentColor: '#2563eb',
    rating: 4.7,
    reviewCount: 189,
    accepts_cash: true,
    saas_credit_balance: 20,
    facilities: [
      { id: 'court-1', name: 'Court 1', description: 'Full-size badminton court with wooden flooring and professional lighting.', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', pricePerHour: 280, primePricePerHour: 400, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-2', name: 'Court 2', description: 'Full-size badminton court with wooden flooring and professional lighting.', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', pricePerHour: 280, primePricePerHour: 400, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-3', name: 'Court 3', description: 'Full-size badminton court with wooden flooring and professional lighting.', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', pricePerHour: 280, primePricePerHour: 400, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-4', name: 'Court 4', description: 'Full-size badminton court with wooden flooring and professional lighting.', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', pricePerHour: 280, primePricePerHour: 400, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-5', name: 'Court 5', description: 'Full-size badminton court with wooden flooring and professional lighting.', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', pricePerHour: 280, primePricePerHour: 400, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-6', name: 'Court 6', description: 'Full-size badminton court with wooden flooring and professional lighting.', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', pricePerHour: 280, primePricePerHour: 400, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-7', name: 'Court 7 (Pro)', description: 'Tournament-spec court with scoreboards, elevated spectator seating, and video review system.', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', pricePerHour: 450, primePricePerHour: 550, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-8', name: 'Court 8 (Pro)', description: 'Tournament-spec court with scoreboards, elevated spectator seating, and video review system.', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', pricePerHour: 450, primePricePerHour: 550, primeTimeStart: 17, currency: 'PHP' },
    ],
    amenities: ['Free Parking', 'Restrooms & Showers', 'Shuttle Sales', 'Racket Rental', 'Locker Room', 'Sports Café', 'Free Wi-Fi', 'Spectator Area'],
    operatingHours: [
      { day: 'Monday',    open: '6:00 AM', close: '11:00 PM' },
      { day: 'Tuesday',   open: '6:00 AM', close: '11:00 PM' },
      { day: 'Wednesday', open: '6:00 AM', close: '11:00 PM' },
      { day: 'Thursday',  open: '6:00 AM', close: '11:00 PM' },
      { day: 'Friday',    open: '6:00 AM', close: '12:00 AM' },
      { day: 'Saturday',  open: '5:00 AM', close: '12:00 AM' },
      { day: 'Sunday',    open: '5:00 AM', close: '11:00 PM' },
    ],
  },
  {
    slug: 'padel-arena',
    name: 'Padel Arena Manila',
    type: 'court',
    tagline: 'The Fastest-Growing Racket Sport, Right Here',
    description:
      "Padel Arena Manila brings world-class padel to the heart of Makati. Our four enclosed glass courts meet international federation standards, featuring panoramic walls, AstroTurf surfaces, and stadium lighting for evening sessions. Whether you're discovering the sport for the first time or training for a tournament, our certified coaches and welcoming community have you covered.",
    coverImage: 'https://images.unsplash.com/photo-1614107325695-55b7ce28efa4?w=1400&q=80',
    location: 'Makati, Metro Manila',
    address: '8 Legazpi St, Legazpi Village, Makati, 1229 Metro Manila',
    phone: '+63 917 345 6789',
    email: 'book@padelarena.ph',
    accentColor: '#ea580c',
    rating: 4.9,
    reviewCount: 97,
    accepts_cash: true,
    saas_credit_balance: 20,
    facilities: [
      { id: 'court-a', name: 'Court A', description: 'Enclosed glass padel court with AstroTurf surface and full panoramic walls.', image: 'https://images.unsplash.com/photo-1614107325695-55b7ce28efa4?w=800&q=80', pricePerHour: 950, primePricePerHour: 1100, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-b', name: 'Court B', description: 'Enclosed glass padel court with AstroTurf surface and full panoramic walls.', image: 'https://images.unsplash.com/photo-1614107325695-55b7ce28efa4?w=800&q=80', pricePerHour: 950, primePricePerHour: 1100, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-c', name: 'Court C', description: 'Enclosed glass padel court with AstroTurf surface and full panoramic walls.', image: 'https://images.unsplash.com/photo-1614107325695-55b7ce28efa4?w=800&q=80', pricePerHour: 950, primePricePerHour: 1100, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-d', name: 'Court D (VIP)', description: 'Premium private padel court with courtside service, exclusive lounge access, and high-speed cameras for video analysis.', image: 'https://images.unsplash.com/photo-1614107325695-55b7ce28efa4?w=800&q=80', pricePerHour: 1400, primePricePerHour: 1600, primeTimeStart: 17, currency: 'PHP' },
    ],
    amenities: ['Valet Parking', 'Restrooms & Showers', 'Racket & Ball Rental', 'Locker Room', 'Pro Shop', 'Juice Bar', 'Free Wi-Fi', 'Coaching Available'],
    operatingHours: [
      { day: 'Monday',    open: '7:00 AM', close: '10:00 PM' },
      { day: 'Tuesday',   open: '7:00 AM', close: '10:00 PM' },
      { day: 'Wednesday', open: '7:00 AM', close: '10:00 PM' },
      { day: 'Thursday',  open: '7:00 AM', close: '10:00 PM' },
      { day: 'Friday',    open: '7:00 AM', close: '11:00 PM' },
      { day: 'Saturday',  open: '6:00 AM', close: '11:00 PM' },
      { day: 'Sunday',    open: '6:00 AM', close: '10:00 PM' },
    ],
  },
  {
    slug: 'pickle-club',
    name: 'The Pickle Club',
    type: 'court',
    tagline: 'Dink. Drive. Dominate.',
    description:
      "The Pickle Club is Pasig's dedicated pickleball hub — a social, high-energy space built around the fastest-growing sport in the country. Six well-maintained courts, open play every morning, and competitive leagues on weekends. All skill levels welcome; our coaches are on hand to get beginners rally-ready in a single session.",
    coverImage: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=1400&q=80',
    location: 'Pasig, Metro Manila',
    address: '32 Ortigas Ave Extension, Rosario, Pasig, 1609 Metro Manila',
    phone: '+63 917 456 7890',
    email: 'play@pickleclub.ph',
    accentColor: '#0891b2',
    rating: 4.6,
    reviewCount: 143,
    accepts_cash: true,
    saas_credit_balance: 20,
    facilities: [
      { id: 'court-1', name: 'Court 1', description: 'Outdoor pickleball court with cushioned hard surface and LED floodlights for evening play.', image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80', pricePerHour: 450, primePricePerHour: 550, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-2', name: 'Court 2', description: 'Outdoor pickleball court with cushioned hard surface and LED floodlights for evening play.', image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80', pricePerHour: 450, primePricePerHour: 550, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-3', name: 'Court 3', description: 'Outdoor pickleball court with cushioned hard surface and LED floodlights for evening play.', image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80', pricePerHour: 450, primePricePerHour: 550, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-4', name: 'Court 4', description: 'Outdoor pickleball court with cushioned hard surface and LED floodlights for evening play.', image: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80', pricePerHour: 450, primePricePerHour: 550, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-5', name: 'Court 5 (Indoor)', description: 'Climate-controlled indoor court, ideal for midday sessions and tournament play.', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', pricePerHour: 600, primePricePerHour: 700, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-6', name: 'Court 6 (Indoor)', description: 'Climate-controlled indoor court, ideal for midday sessions and tournament play.', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', pricePerHour: 600, primePricePerHour: 700, primeTimeStart: 17, currency: 'PHP' },
    ],
    amenities: ['Free Parking', 'Restrooms & Showers', 'Paddle & Ball Rental', 'Locker Room', 'Snack Bar', 'Open Play Sessions', 'Free Wi-Fi', 'Coaching Available'],
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
  {
    slug: 'ace-courts',
    name: 'Ace Courts Tennis',
    type: 'court',
    tagline: 'Serve Up Something Great',
    description:
      "Ace Courts is Mandaluyong's premier tennis destination, featuring four full-size courts across two surfaces — hard court and clay — maintained to ITF standards. Open to members and walk-ins alike, the facility hosts weekly social leagues, junior development programs, and private coaching sessions with certified instructors.",
    coverImage: 'https://images.unsplash.com/photo-1542144612-1b63b4a00596?w=1400&q=80',
    location: 'Mandaluyong, Metro Manila',
    address: '15 Shaw Blvd, Wack-Wack, Mandaluyong, 1552 Metro Manila',
    phone: '+63 917 567 8901',
    email: 'book@acecourts.ph',
    accentColor: '#b45309',
    rating: 4.7,
    reviewCount: 162,
    accepts_cash: true,
    saas_credit_balance: 20,
    facilities: [
      { id: 'court-1', name: 'Court 1 (Hard)', description: 'Full-size hard court with DecoTurf surface — fast play, low bounce, ideal for aggressive baseliners.', image: 'https://images.unsplash.com/photo-1542144612-1b63b4a00596?w=800&q=80', pricePerHour: 700, primePricePerHour: 900, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-2', name: 'Court 2 (Hard)', description: 'Full-size hard court with DecoTurf surface — fast play, low bounce, ideal for aggressive baseliners.', image: 'https://images.unsplash.com/photo-1542144612-1b63b4a00596?w=800&q=80', pricePerHour: 700, primePricePerHour: 900, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-3', name: 'Court 3 (Clay)', description: 'Red clay court with slower pace and higher bounce — perfect for training footwork and consistent groundstrokes.', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', pricePerHour: 800, primePricePerHour: 1000, primeTimeStart: 17, currency: 'PHP' },
      { id: 'court-4', name: 'Court 4 (Clay)', description: 'Red clay court with slower pace and higher bounce — perfect for training footwork and consistent groundstrokes.', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', pricePerHour: 800, primePricePerHour: 1000, primeTimeStart: 17, currency: 'PHP' },
    ],
    amenities: ['Free Parking', 'Restrooms & Showers', 'Racket Stringing', 'Ball Machine Rental', 'Locker Room', 'Clubhouse & Café', 'Free Wi-Fi', 'Coaching Available'],
    operatingHours: [
      { day: 'Monday',    open: '6:00 AM', close: '10:00 PM' },
      { day: 'Tuesday',   open: '6:00 AM', close: '10:00 PM' },
      { day: 'Wednesday', open: '6:00 AM', close: '10:00 PM' },
      { day: 'Thursday',  open: '6:00 AM', close: '10:00 PM' },
      { day: 'Friday',    open: '6:00 AM', close: '10:00 PM' },
      { day: 'Saturday',  open: '6:00 AM', close: '10:00 PM' },
      { day: 'Sunday',    open: '6:00 AM', close: '9:00 PM' },
    ],
  },
]

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  // Remove old test businesses
  for (const slug of SLUGS_TO_DELETE) {
    const ref = db.collection('businesses').doc(slug)
    const snap = await ref.get()
    if (snap.exists) {
      await ref.delete()
      console.log(`✗ Deleted businesses/${slug}`)
    } else {
      console.log(`  businesses/${slug} not found — skipping delete`)
    }
  }

  // Upsert canonical businesses (merge so payment flags set via admin/onboarding are preserved)
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
