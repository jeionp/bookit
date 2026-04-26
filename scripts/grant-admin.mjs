/**
 * Grant or revoke admin access for a user in production Firestore.
 *
 * Usage:
 *   node scripts/grant-admin.mjs <email> <slug>           # grant
 *   node scripts/grant-admin.mjs <email> <slug> --revoke  # revoke
 *
 * Prerequisites:
 *   1. Download a service account key from Firebase Console:
 *      Project Settings → Service Accounts → Generate new private key
 *   2. Save it as service-account.json in the project root (it is gitignored).
 *      Or set the GOOGLE_APPLICATION_CREDENTIALS env var to its path.
 *
 * Example:
 *   node scripts/grant-admin.mjs paguio.ja@gmail.com paddleup
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const email  = args.find((a) => !a.startsWith('--'))
const slug   = args.filter((a) => !a.startsWith('--'))[1]
const revoke = args.includes('--revoke')

if (!email || !slug) {
  console.error('Usage: node scripts/grant-admin.mjs <email> <slug> [--revoke]')
  process.exit(1)
}

// ─── Init ────────────────────────────────────────────────────────────────────

const keyPath = resolve(
  process.env.GOOGLE_APPLICATION_CREDENTIALS ?? './service-account.json'
)

if (!existsSync(keyPath)) {
  console.error(`
Service account key not found at: ${keyPath}

To fix:
  1. Go to Firebase Console → Project Settings → Service Accounts
  2. Click "Generate new private key"
  3. Save the downloaded file as service-account.json in the project root
`)
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf-8'))) })

const auth = getAuth()
const db   = getFirestore()

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Resolve email → UID
  let uid
  try {
    const user = await auth.getUserByEmail(email)
    uid = user.uid
    console.log(`\nFound user: ${user.displayName ?? '(no display name)'} (${email})`)
    console.log(`UID: ${uid}`)
  } catch {
    console.error(`\nNo Firebase Auth user found for: ${email}`)
    console.error('Make sure the user has signed up before granting admin access.')
    process.exit(1)
  }

  const ref = db.doc(`admins/${uid}`)
  const snap = await ref.get()

  if (revoke) {
    if (!snap.exists || !(snap.data()?.slugs ?? []).includes(slug)) {
      console.log(`\n${email} is not an admin of "${slug}" — nothing to revoke.`)
      return
    }
    await ref.update({ slugs: FieldValue.arrayRemove(slug) })
    console.log(`\n✓ Revoked admin access for ${email} on "${slug}"`)
  } else {
    if (snap.exists && (snap.data()?.slugs ?? []).includes(slug)) {
      console.log(`\n${email} is already an admin of "${slug}" — no change needed.`)
      return
    }
    await ref.set({ slugs: FieldValue.arrayUnion(slug) }, { merge: true })
    console.log(`\n✓ Granted admin access for ${email} on "${slug}"`)
  }
}

main().catch((err) => {
  console.error('\n✗', err.message)
  process.exit(1)
})
