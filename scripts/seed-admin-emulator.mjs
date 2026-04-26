/**
 * Creates an admin user + /admins/{uid} document in the local Firebase emulator.
 *
 * Usage:
 *   node scripts/seed-admin-emulator.mjs [email] [password] [slug]
 *
 * Defaults:
 *   email    = admin@paddleup.test
 *   password = Admin1234!
 *   slug     = paddleup
 *
 * The emulator must be running:
 *   firebase emulators:start --only auth,firestore
 */

const AUTH_URL = 'http://localhost:9099'
const FS_URL   = 'http://localhost:8080'
const PROJECT  = 'demo-bookit'

const email    = process.argv[2] ?? 'admin@paddleup.test'
const password = process.argv[3] ?? 'Admin1234!'
const slug     = process.argv[4] ?? 'paddleup'

async function createOrSignIn() {
  // Attempt sign-up; if account already exists, fall through to sign-in.
  const signUpRes = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  )
  const signUpBody = await signUpRes.json()
  if (signUpRes.ok) {
    console.log(`✓ Created user  ${email}  (uid: ${signUpBody.localId})`)
    return signUpBody.localId
  }
  if (signUpBody?.error?.message !== 'EMAIL_EXISTS') {
    throw new Error(`Sign-up failed: ${JSON.stringify(signUpBody)}`)
  }

  const signInRes = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  )
  const signInBody = await signInRes.json()
  if (!signInRes.ok) throw new Error(`Sign-in failed: ${JSON.stringify(signInBody)}`)
  console.log(`✓ Signed in as  ${email}  (uid: ${signInBody.localId})`)
  return signInBody.localId
}

async function writeAdminDoc(uid) {
  const res = await fetch(
    `${FS_URL}/v1/projects/${PROJECT}/databases/(default)/documents/admins/${uid}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        // "Bearer owner" is the emulator's admin-bypass token — skips security rules
        'Authorization': 'Bearer owner',
      },
      body: JSON.stringify({
        fields: {
          slugs: {
            arrayValue: { values: [{ stringValue: slug }] },
          },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`Firestore write failed: ${await res.text()}`)
  console.log(`✓ Wrote /admins/${uid}  slugs: ["${slug}"]`)
}

async function main() {
  console.log(`\nSeeding admin  (project: ${PROJECT})\n`)
  const uid = await createOrSignIn()
  await writeAdminDoc(uid)
  console.log(`
Done. Sign in at http://localhost:3000/paddleup with:
  Email:    ${email}
  Password: ${password}
Then visit http://localhost:3000/paddleup/admin
`)
}

main().catch(err => {
  console.error('\n✗', err.message)
  process.exit(1)
})
