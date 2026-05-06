# Bookit

A multi-tenant booking platform for courts, rooms, and appointment-based businesses. Each business gets a public page at `/<business-slug>` where customers can browse facilities, check real-time availability, and book time slots.

## Tech stack

- **Next.js 16** (App Router) — frontend and server components
- **Firebase** — Firestore for business config + bookings, Firebase Auth (email/password + Google)
- **Upstash Redis** — rate limiting on booking creation (`UPSTASH_REDIS_REST_URL` / `_TOKEN`)
- **Tailwind CSS** — styling
- **Playwright** — end-to-end tests
- **Vitest** — unit and security rule tests

## Prerequisites

- Node.js 24+
- Java 21+ (required by the Firebase emulator)
- Firebase CLI: `npm install -g firebase-tools`

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create your env file**

   Copy the example below into `.env.local` at the project root. The emulator values are safe to use locally — they're fake credentials that only work with the emulator.

   ```env
   NEXT_PUBLIC_USE_EMULATOR=true
   NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=bookme-821b4.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=bookme-821b4
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=bookme-821b4.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
   NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:demo

   # Server-side Admin SDK — points to the local emulators
   FIRESTORE_EMULATOR_HOST=localhost:8080
   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
   ```

   For **production**, add these Vercel environment variables instead (no emulator vars):
   ```env
   FIREBASE_PROJECT_ID=<your-project-id>
   FIREBASE_CLIENT_EMAIL=<service-account-email>
   FIREBASE_PRIVATE_KEY=<service-account-private-key>

   # Rate limiting (Upstash Redis — get from console.upstash.com)
   UPSTASH_REDIS_REST_URL=<your-upstash-rest-url>
   UPSTASH_REDIS_REST_TOKEN=<your-upstash-rest-token>
   ```

3. **Start the Firebase emulators** (Auth + Firestore)

   ```bash
   firebase emulators:start
   ```

   This uses the `bookme-821b4` project from `.firebaserc`. Do not pass `--project` — a mismatched project ID causes Admin SDK token verification to fail.

4. **Start the dev server** (in a second terminal)

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000/paddleup](http://localhost:3000/paddleup) to see the demo business.

## Admin access

The admin dashboard is at `/<business-slug>/admin` (e.g. `/paddleup/admin`). Only users with an entry in the `admins` Firestore collection can access it. Admins see an **Admin** link in the storefront nav after signing in.

### Granting access locally (emulator)

With the emulator running, create an admin account in one step:

```bash
npm run seed:admin -- <email> <password> <slug>

# Example — creates the account if it doesn't exist, then writes the admin doc:
npm run seed:admin -- admin@paddleup.test Admin1234! paddleup
```

Sign in at [http://localhost:3000/paddleup](http://localhost:3000/paddleup) with those credentials.

### Granting access in production

**One-time setup:**

1. Go to Firebase Console → **bookme-821b4** → Project Settings → Service Accounts
2. Click **Generate new private key** and save the file as `service-account.json` in the project root
3. `service-account.json` is gitignored — never commit it

**Grant admin access** (user must have signed up first):

```bash
npm run grant:admin -- <email> <slug>

# Example:
npm run grant:admin -- paguio.ja@gmail.com paddleup
```

**Revoke admin access:**

```bash
npm run revoke:admin -- <email> <slug>
```

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:security` | Firestore security rule tests (emulator required) |
| `npm run test:e2e` | Playwright end-to-end tests (emulator + dev server required) |
| `npm run seed:admin` | Create an admin account in the local emulator |
| `npm run grant:admin` | Grant production admin access by email |
| `npm run revoke:admin` | Revoke production admin access by email |
| `npm run seed:businesses` | Seed business config to production Firestore |
| `npm run seed:businesses:emulator` | Seed business config to the local emulator |

## Running tests

**Restart the emulator at the start of every session** — a long-running emulator accumulates gRPC threads and can hang:

```bash
lsof -ti :8080 | xargs kill -9 2>/dev/null; lsof -ti :9099 | xargs kill -9 2>/dev/null; true
firebase emulators:start
```

**Security rule tests** — requires the emulator running:

```bash
npm run test:security
```

**Unit tests** — no emulator required (all Firebase calls are mocked):

```bash
npm test
```

**E2E tests** — requires the emulator and dev server both running:

```bash
# terminal 1
firebase emulators:start

# terminal 2
npm run dev

# terminal 3
npm run test:e2e
```

## Contributing

All changes go through a feature branch → pull request workflow — never commit directly to `main`.

Branch naming: `feature/<short-description>`
