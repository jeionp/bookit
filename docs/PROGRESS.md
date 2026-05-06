# bookit — Technical Progress & Handoff

> Last updated: 2026-05-07. Covers everything merged to `main` through PR #31 plus open PR #32 (security hardening, pending CI).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Data Model](#4-data-model)
5. [Security Rules](#5-security-rules)
6. [Firestore Indexes](#6-firestore-indexes)
7. [Feature Progress](#7-feature-progress)
8. [Admin Dashboard Deep-Dive](#8-admin-dashboard-deep-dive)
9. [Test Suite](#9-test-suite)
10. [Development Setup](#10-development-setup)
11. [Known Gaps & Security Backlog](#11-known-gaps--security-backlog)
12. [Pending Work & Next Steps](#12-pending-work--next-steps)
13. [Production Deploy Checklist](#13-production-deploy-checklist)

---

## 1. Project Overview

**bookit** is a multi-tenant court/facility booking platform. Each business gets its own storefront at `/<businessSlug>` (e.g. `/paddleup`). Customers browse courts, check real-time availability, and book time slots. Business owners manage bookings through an admin dashboard at `/<businessSlug>/admin`.

Currently one business is configured (`paddleup` — a pickleball facility in Quezon City). Business config lives in Firestore (`businesses/{slug}`) and is editable through the admin Settings tab.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | Breaking changes from earlier versions — read `node_modules/next/dist/docs/` before touching routing |
| Styling | Tailwind CSS v4 | |
| Database | Firestore | Client SDK (browser) for booking reads/writes; Admin SDK (server-only) for API routes |
| Auth | Firebase Auth | Email/password + Google sign-in; emulator for local dev |
| Rate limiting | Upstash Redis | Sliding window on `POST /api/bookings`; skipped when env vars absent (emulator/test) |
| Payments | PayMongo | Philippine payment gateway; API routes stubbed, full integration deferred |
| Hosting | Vercel | Auto-deploys `main` on merge |
| Firebase project | `bookme-821b4` | Production project (migrated from `jidoka-pixels` in PR #31) |
| Testing | Playwright (E2E) + Vitest (unit + security rules) | |

---

## 3. Repository Structure

```
src/
  app/
    layout.tsx                    # Root layout — wraps AuthProvider
    page.tsx                      # Root redirect → /paddleup
    api/
      availability/route.ts       # GET — returns booked hours via Admin SDK (no PII)
      bookings/route.ts           # POST — create booking with rate limiting + conflict check
      businesses/[slug]/route.ts  # PATCH — update business config (auth-gated, field allowlist)
      refund/route.ts             # POST stub — will call PayMongo refund API (now auth-gated)
      invite/route.ts             # POST stub — will send signup invite email
      health/route.ts             # GET — health check used by Playwright webServer poll
    [businessSlug]/
      layout.tsx                  # Per-business layout
      page.tsx                    # Storefront (booking flow)
      _components/                # Storefront UI components
        AvailabilitySection.tsx   # Date picker + court selector + slot grid + booking bar
        FacilityCard.tsx
        BookingSection.tsx
        ...
      admin/
        page.tsx                  # Admin entry point — renders AdminGuard + AdminView
  components/
    admin/
      AdminGuard.tsx              # Client-side auth + role check; redirects non-admins
      AdminView.tsx               # Shell: header, Schedule/Analytics/Settings tab bar
      AdminScheduleView.tsx       # Daily grid view with search bar + "New booking" button
      AdminAnalyticsView.tsx      # Period selector + stat cards + charts
      AdminSettingsView.tsx       # Business info, per-court hours override, amenities editor
      ScheduleGrid.tsx            # Visual grid: courts as columns, hours as rows
      BookingDetailPanel.tsx      # Slide-in panel: booking info, cancel/refund, reschedule,
                                  # payment badge, customer history
      WalkInModal.tsx             # Modal for admin walk-in booking creation
    booking/
      MyBookings.tsx              # Customer booking history tab
      SlotGrid.tsx                # Hour-slot grid for customer booking
      BookingActionBar.tsx        # Sticky bar showing price + Book button
      BookingConfirmModal.tsx     # Confirmation dialog before final booking
  context/
    AuthContext.tsx               # onAuthStateChanged + admin slug loading (3× retry on errors)
  lib/
    types.ts                      # Business, Facility, OperatingHours interfaces
    slots.ts                      # Slot generation, grouping, validation helpers
    firebase/
      client.ts                   # Firebase client app init + emulator connection
      admin-app.ts                # Admin SDK init (lazy proxy, emulator-aware)
      admin.ts                    # getAdminSlugs — reads /admins/{uid} via client SDK
      bookings.ts                 # All Firestore booking reads/writes (client SDK)
      businesses.ts               # getBusinessBySlug — reads /businesses/{slug} via Admin SDK
    booking/
      useSlotSelection.ts         # Drag-to-select hook used by SlotGrid
firestore.rules                   # Firestore security rules
firestore.indexes.json            # Composite index definitions (deploy with firebase CLI)
tests/
  e2e/
    booking-flow.spec.ts          # 51 Playwright tests — full storefront flow
    admin.spec.ts                 # 88 Playwright tests — admin dashboard (Phases 1–6)
    helpers.ts                    # Seed/clear helpers for emulator
  security/
    firestore.rules.test.ts       # 45 Vitest tests — security rules unit tests
src/**/*.test.ts                  # 105 Vitest unit tests (api routes, firebase lib)
.github/workflows/
  ci.yml                          # Lint + type-check (no emulator)
  test.yml                        # Vitest unit tests (no emulator)
  e2e.yml                         # Security rules + E2E (spins up emulator)
```

---

## 4. Data Model

### `bookings` collection

```typescript
interface Booking {
  id: string;                                      // Firestore document ID
  userId: string;                                  // Firebase Auth UID, or "walk_in" for admin-created
  userEmail: string;                               // empty string for anonymous walk-ins
  userName: string;                                // "Walk-in" default for anonymous walk-ins
  userPhone?: string;                              // optional; collected for walk-in customers
  businessSlug: string;                            // e.g. "paddleup"
  businessName: string;
  facilityId: string;                              // e.g. "court-1"
  facilityName: string;                            // e.g. "Court 1"
  date: string;                                    // "YYYY-MM-DD" local date
  hours: number[];                                 // [9, 10] means 9 AM–11 AM (each entry = one hour slot)
  totalPrice: number;                              // whole PHP pesos; recalculated server-side in POST /api/bookings
  currency: string;                                // "PHP"
  status: "confirmed" | "cancelled";
  paymentStatus?: "unpaid" | "paid" | "refunded";  // absent = unpaid; "refunded" set by admin cancel flow
  source?: "online" | "walk_in";                  // absent = online; "walk_in" for admin-created bookings
  createdAt: Timestamp;
}
```

**No "completed" status in Firestore.** Past confirmed bookings are derived client-side in `MyBookings.tsx` using `isBookingPast()` — avoids background writes or Cloud Functions.

### `admins` collection

```
/admins/{uid}
  slugs: string[]   // e.g. ["paddleup"]
```

Written out-of-band (Firebase Console or `scripts/grant-admin.mjs`). No client writes allowed. Admin status is loaded once per auth state change in `AuthContext` and cached in `adminSlugs` state.

### `businesses` collection

```
/businesses/{slug}
  name: string
  tagline: string
  description: string
  coverImage: string
  location: string
  address: string
  phone: string
  email: string
  accentColor: string
  rating: number
  reviewCount: number
  type: "court" | "appointment" | "room"
  facilities: Facility[]        // includes per-facility operatingHours overrides
  amenities: string[]
  operatingHours: OperatingHours[]
```

Public read (no auth required). Writes go through `PATCH /api/businesses/[slug]` with admin auth + field allowlist. Seeded via `npm run seed:businesses` / `npm run seed:businesses:emulator`.

---

## 5. Security Rules

Full rules are in `firestore.rules`. Key decisions:

| Rule | Rationale |
|---|---|
| `admins` write: always false | Admin records are managed out-of-band only — no client can grant themselves admin |
| `bookings` list (public): removed | Availability reads now go through `GET /api/availability` (Admin SDK) — prevents PII exposure from full booking documents |
| `bookings` list: owner or admin only | Authenticated users see their own bookings; admins see all bookings for their business |
| `bookings` update (owner): only `status → "cancelled"` | Prevents users from changing price, date, or other fields |
| `bookings` update (admin): any field | Allows reschedule (date/facilityId/hours/totalPrice change), cancel, and payment status updates |
| `bookings` create (admin): userId can differ from auth.uid | Allows walk-in bookings on behalf of customers |
| `bookings` create: `totalPrice >= 0` | Relaxed from `> 0` to allow comp/free slots created by admins |
| `bookings` delete: always false | Soft-delete only — cancelled bookings are retained for audit |

The `isAdminOfSlug(slug)` helper function does a cross-document `get()` of `/admins/{uid}` — this counts toward Firestore read quotas on every rule evaluation that calls it.

---

## 6. Firestore Indexes

Composite indexes are defined in `firestore.indexes.json` and must be deployed separately:

```bash
firebase deploy --only firestore:indexes
```

| Collection | Fields | Used by |
|---|---|---|
| `bookings` | `businessSlug ASC`, `date ASC` | `getBookingsInRange` (analytics) |
| `bookings` | `businessSlug ASC`, `userEmail ASC`, `createdAt DESC` | `getCustomerHistory`, `lookupCustomerByEmail` |
| `bookings` | `userId ASC`, `createdAt DESC` | `getUserBookings` (My Bookings tab) |

---

## 7. Feature Progress

### Merged to `main`

| PR | Feature |
|---|---|
| #1–#7 | Initial booking flow: slot grid, drag selection, booking modal, Firebase integration, auth modal |
| #8 | Firestore security rules + security rule tests |
| #9 | README |
| #10 | Sidebar About card hidden on mobile |
| #11 | Admin dashboard Phase 1 (auth/access control) + Phase 2 (master schedule view) |
| #12 | Admin Phase 3 (booking management: cancel/reschedule/search) + Phase 4 (analytics dashboard) + My Bookings "Completed" state |
| #13 | `paymentStatus` field + Paid/Refunded badge in BookingDetailPanel |
| #14 | Refund/credit prompt on paid booking cancel; `/api/refund` + `/api/invite` stub routes |
| #15 | Customer booking history in detail panel; `getCustomerHistory` query; Firestore indexes |
| #16 | Walk-in booking modal with customer email lookup, optional phone, signup invite stub |
| #17–#28 | Admin Phase 5 polish + E2E expansion (walk-in past-slot hints, 3-step reschedule UX, guided flow) |
| #29 | Business config migrated from static `src/lib/businesses.ts` to Firestore `businesses/{slug}`; admin Settings tab reads/writes Firestore |
| #30 | Admin Phase 6 — Settings tab: Business Info, per-court hours override, pricing, amenities; `PATCH /api/businesses/[slug]` |
| #31 | Security: `GET /api/availability` (Admin SDK, no PII); rate limiting on `POST /api/bookings` (Upstash Redis, 10 req/60 s per IP); Firebase project migrated to `bookme-821b4`; Firestore public list rule removed |
| #32 | Security hardening: auth added to `POST /api/refund`; field allowlist on `PATCH /api/businesses/[slug]`; `hours` and `date` input validation on `POST /api/bookings`; 9 new unit tests |

---

## 8. Admin Dashboard Deep-Dive

### Access control flow

```
User visits /<slug>/admin
  → AdminGuard checks AuthContext.loading
      → loading: show spinner
      → done, !isAdminOf(slug): router.replace(/<slug>)
      → done, isAdminOf(slug): render AdminView
```

`AuthContext` loads admin slugs from Firestore on every `onAuthStateChanged` event. If Firestore is unreachable the call is retried up to 3 times (1 s apart); on final failure, loading resolves with empty slugs (user is redirected to storefront).

### AdminView shell

Tab bar with **Schedule**, **Analytics**, and **Settings** tabs. Header contains business name/badge, "Public view" link, and Sign out button.

### Schedule tab — `AdminScheduleView`

- Date navigation (prev/next day chevrons)
- **"New booking" button** — opens `WalkInModal` for admin-created walk-ins
- Search bar (filters by `userName` or `userEmail`, client-side)
- `ScheduleGrid`: courts as columns, hours as rows, booking blocks are buttons
- `BookingDetailPanel`: slides in on block click

### BookingDetailPanel — states

1. **Detail view** — facility, date/time range, customer name/email, total price, booking ID, payment status badge, customer booking history.
2. **Cancel flow (unpaid)** — "Cancel booking" → confirm dialog with Back / Yes cancel.
3. **Cancel flow (paid)** — "Cancel booking" → refund choice screen (Refund to payment method OR Issue store credit) → confirm dialog. Both options call `POST /api/refund` (stub) and set `paymentStatus: "refunded"`.
4. **Reschedule flow (3 steps)** — Step 1: court + date; Step 2: slot picker (excludes current booking's hours from conflict check); Step 3: price diff preview + confirm. Conflict-checked via Firestore transaction.

Key implementation details:
- Panel is `key={selectedBooking.id}` — forces full remount when switching between bookings, resetting all state.
- Slot loading uses `useRef` request counter to discard stale async responses.
- Customer history loads via `useEffect` on mount; shows last 5 bookings for the same `userEmail` at this business, excluding the current one. Fetches `limit(6)` to account for the excluded doc.
- Cancel step state: `"idle" → "refund_choice" (paid only) → "confirm"`. Back button on confirm step returns to `"refund_choice"` for paid bookings, `"idle"` for unpaid.

### WalkInModal

Opened by "New booking" button in the schedule view header. Features:

- Court selector, date picker, time slot grid (same availability logic as reschedule)
- Optional customer section: email field + lookup button (queries existing bookings to pre-fill name/userId), name field, phone field
- Signup invite checkbox — appears only when email is entered, lookup completed, and no existing customer found; calls `POST /api/invite` (stub)
- Walk-in bookings stored with `source: "walk_in"`, `userId: "walk_in"` (or linked userId if customer found)
- On successful booking, schedule grid auto-refreshes

### Settings tab — `AdminSettingsView`

Three collapsible sections:

1. **Business Info** — name, tagline, description, cover image URL, location, address, phone, email, accent color
2. **Courts** — add/remove courts; per-court operating hours override (falls back to business hours when absent); toggle individual days closed
3. **Amenities** — add/remove free-text amenity tags

A single "Save changes" bar appears when edits are pending. Saving calls `PATCH /api/businesses/[slug]` with the admin user's ID token.

### Analytics tab — `AdminAnalyticsView`

Period selector: Today / This Week / This Month / Year to Date. All date ranges are computed in local time.

Stat cards:
- Revenue — sum of `totalPrice` for confirmed bookings
- Bookings — count of confirmed bookings
- Hours — total hours booked (sum of `hours.length`)
- Cancellation rate — `cancelled / total`; shown in red when > 15%

Additional sections (only rendered when `bookingCount > 0`):
- Court utilization — horizontal bars, width = `(courtHours / maxCourtHours) * 100%`
- Peak hours heatmap — horizontal bars per hour with booking count

### API routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/availability` | None | Returns `{ bookedHours: number[] }` for a facility/date; uses Admin SDK so no booking PII is exposed |
| `POST /api/bookings` | Firebase ID token | Creates a booking; rate-limited (10/60 s per IP); price recalculated server-side; conflict-checked in Firestore transaction |
| `PATCH /api/businesses/[slug]` | Firebase ID token + admin slug check | Updates business config; fields filtered through explicit allowlist |
| `POST /api/refund` | Firebase ID token + admin slug check | Stub; will call PayMongo refund or write credit ledger |
| `POST /api/invite` | None | Stub; will send signup invite email via Resend/SendGrid |
| `GET /api/health` | None | Returns `{ ok: true }`; used by Playwright `webServer` poll |

### Firestore functions (bookings.ts)

| Function | SDK | Purpose |
|---|---|---|
| `getAllBookingsForDay(slug, date)` | Client | Schedule grid — confirmed only |
| `getBookingsForDate(slug, facilityId, date)` | Client | Slot availability check (admin reschedule/walk-in) |
| `getBookedHours(slug, facilityId, date)` | Client | Returns booked hour numbers |
| `getBookedHoursExcluding(slug, facilityId, date, excludeId)` | Client | Reschedule slot picker |
| `createBooking(data)` | Client | Transaction with conflict check — online bookings (note: prefer `POST /api/bookings` which also validates + rate-limits) |
| `createWalkInBooking(data)` | Client | Transaction with conflict check — admin walk-in bookings |
| `cancelBooking(bookingId)` | Client | Sets `status → "cancelled"` |
| `cancelBookingWithRefund(bookingId, method)` | Client | Sets `status → "cancelled"` + `paymentStatus → "refunded"`, calls `/api/refund` stub (TOCTOU — see §11) |
| `rescheduleBooking(bookingId, ...)` | Client | Transaction with conflict check (excludes current booking's hours) |
| `getBookingsInRange(slug, start, end)` | Client | Analytics date-range query |
| `getUserBookings(userId)` | Client | My Bookings tab |
| `getCustomerHistory(slug, email, excludeId)` | Client | Last 5 bookings for customer in detail panel |
| `lookupCustomerByEmail(slug, email)` | Client | Walk-in form email lookup |

---

## 9. Test Suite

### Counts (as of PR #32)

| Suite | Runner | Count |
|---|---|---|
| `tests/e2e/admin.spec.ts` | Playwright | 88 tests (Phases 1–6) |
| `tests/e2e/booking-flow.spec.ts` | Playwright | 51 tests |
| `tests/security/firestore.rules.test.ts` | Vitest | 45 tests |
| `src/**/*.test.ts` (unit) | Vitest | 105 tests |
| **Total** | | **289 tests** |

### Running locally

```bash
# Kill any lingering emulator processes first (do this at the start of every session)
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
firebase emulators:start

# In separate terminals
npm run test:security   # Vitest — Firestore rules (no browser needed)
npm test                # Vitest — unit tests (no emulator needed)
npm run test:e2e        # Playwright — full app (needs dev server + emulators)
```

The Firestore emulator accumulates JVM gRPC threads over time. After a long-running session it can exhaust the OS thread limit, causing test hangs. **Always kill and restart the emulator before a test run.**

**Do not pass `--project` to the emulator** — a mismatched project ID causes `adminAuth.verifyIdToken` to fail in E2E tests that call admin-authenticated API routes.

### E2E test helpers (`tests/e2e/helpers.ts`)

| Helper | What it does |
|---|---|
| `clearFirestore()` | DELETE all documents via emulator REST API (8 s AbortController timeout) |
| `seedBusiness(page)` | Writes `businesses/paddleup` to the emulator before each test |
| `seedBooking(opts)` | Creates a confirmed booking; authenticates as seed user for rule compliance |
| `seedBookingForUser(opts)` | Creates a booking for a specific user using `Bearer owner` admin bypass; includes `createdAt` and optional `paymentStatus` |
| `seedAdminDoc(uid, slugs)` | Writes `/admins/{uid}` using `Bearer owner` bypass |
| `createTestUser(email, password, displayName)` | Creates auth emulator user; safe to call multiple times |
| `signInUser(email, password)` | Returns `{ idToken, localId }` |
| `todayKey()` / `dateKeyDelta(n)` | Local-time date strings |

### Test patterns to know

**E2E slot tests:**
- Call `selectTomorrow(page)` before `waitForSlots(page)` — today's past hours are filtered in headless Chromium using UTC, making tests timezone-dependent. Tomorrow always shows all slots.
- `waitForSlots` first waits for "Loading availability…" to appear (2 s timeout, swallowed), then waits for it to disappear — handles the race where loading finishes before the assertion runs.
- Slot button locators use `exact: true` — "2 PM" would otherwise match "12 PM".

**Cancel flow:**
- The dismiss button on the cancel confirm step is labelled **"Back"** (not "No"). For unpaid bookings "Back" returns to idle; for paid bookings it returns to the refund choice screen.

**Walk-in bookings:**
- `seedBookingForUser` accepts an optional `paymentStatus` field for seeding paid/refunded bookings in tests.
- `undefined` field values must never be passed to Firestore writes — use conditional assignment.

**Unit tests:**
- `vi.hoisted` + `vi.mock` for module-level mocks (hoisted mocks used across all tests in the file).
- `vi.doMock` + `vi.resetModules` + dynamic `import('./route')` to reset module-level singletons (e.g. the rate limiter lazy singleton) between tests.

---

## 10. Development Setup

See `README.md` for the full setup guide. Quick reference:

```bash
# Install deps
npm install

# Copy env and fill in Firebase config values
cp .env.local.example .env.local  # or create manually — see README for full template

# Start emulators (Auth + Firestore) — uses bookme-821b4 from .firebaserc
firebase emulators:start

# Dev server (separate terminal)
npm run dev

# Seed business config and admin user for local testing
npm run seed:businesses:emulator
npm run seed:admin -- admin@paddleup.test Admin1234! paddleup
```

### Granting admin access

**Emulator:** `npm run seed:admin -- <email> <password> <slug>` — creates the Auth account and admin doc in one step.

**Production:** `npm run grant:admin -- <email> <slug>` — uses `firebase-admin` with a service account. Requires `service-account.json` (gitignored) in the project root, downloaded from Firebase Console → Project Settings → Service Accounts.

---

## 11. Known Gaps & Security Backlog

### Fixed (PRs #31–#32)

| Gap | Fix |
|---|---|
| Client-side `totalPrice` (bookings) | `POST /api/bookings` recalculates price server-side from Firestore before writing |
| PII exposure via public Firestore list query | Public list rule removed; availability reads go through `GET /api/availability` (Admin SDK) |
| No rate limiting on booking creation | Upstash Redis sliding window (10 req/60 s per IP) on `POST /api/bookings`; fail-open on Redis errors |
| `/api/refund` had zero auth | Bearer token verification + admin slug check added |
| `PATCH /api/businesses/[slug]` accepted arbitrary body | Field allowlist strips `slug`, `type`, `rating`, `reviewCount`, and any unknown keys |
| `hours` array unbounded in `POST /api/bookings` | Max 24 entries, integer range [0, 23], deduplicated before write |
| `date` unvalidated in `POST /api/bookings` | YYYY-MM-DD regex enforced |

### Still open

**TOCTOU in `cancelBookingWithRefund`:**
Firestore status is updated to `"cancelled"` / `paymentStatus: "refunded"` before the `/api/refund` API call resolves. If the refund API call fails, the booking appears refunded in the UI but the actual payment refund was never issued. Acceptable until PayMongo is wired up; address with an idempotent retry or atomic server-side transaction before go-live.

**`rescheduleBooking` writes client-supplied `totalPrice`:**
The price passed from `BookingDetailPanel` is calculated client-side from the facility config. A malicious admin could manipulate this. Move reschedule to a server API route (like bookings creation) before PayMongo goes live.

**PayMongo webhook signature verification:**
No webhook handler exists yet. When added, it must verify the `X-Paymongo-Signature` header using PayMongo's HMAC-SHA256 scheme before trusting the event.

**Per-business PayMongo credential onboarding:**
Each business needs its own PayMongo account. The onboarding flow for storing per-business keys is not yet designed. See §12.

---

## 12. Pending Work & Next Steps

### Phase 7 — Firebase Storage for court images

Replace Unsplash URL fields in `coverImage` and per-facility `image` with uploaded images stored in Firebase Storage:

- Add Firebase Storage SDK to the client (`firebase/storage`)
- Add file upload inputs to the Admin Settings tab (replacing the URL text fields)
- On upload, write the download URL back to the `businesses/{slug}` Firestore doc via the existing `PATCH` route
- Update `HomeTab` facility cards and the storefront cover to display Storage URLs

### Phase 7 — Landing page + business onboarding flow

A public landing page (at `/`) for the platform itself, separate from any business storefront. Use the `alen-chakma/bookit` GitHub repo as design reference.

### PayMongo integration (deferred)

Explicitly deferred until per-business credential onboarding is designed. The key questions are:

- Where to store per-business PayMongo secret keys (Firestore `/businessSecrets/{slug}` with `allow read, write: if false`, or GCP Secret Manager)
- What the onboarding UI looks like for a business owner to input their PayMongo keys

Once that's resolved, the integration path is:

1. Wire up `POST /api/refund` to call PayMongo `/v1/refunds`
2. Add `POST /api/checkout` to create a PayMongo payment intent
3. Add `POST /api/[businessSlug]/webhook` to handle PayMongo events (with signature verification)
4. Move `rescheduleBooking` to a server API route so price is validated server-side

### Admin management UI (deferred)

Currently admin access is granted via CLI scripts only. Two deferred options:

- **Option B:** In-app UI for super-admins to grant/revoke access without touching the terminal
- **Option C:** Firebase custom claims for RBAC (avoids cross-document `get()` in Firestore rules, reducing read quota usage)

---

## 13. Production Deploy Checklist

Run through this whenever deploying to a new environment or after infrastructure changes.

### Vercel environment variables

Set all of these under **Project Settings → Environment Variables** for the **Production** scope:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → bookme-821b4 → Project Settings → Your apps → Web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | same |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | same |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | same |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | same |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | same |
| `FIREBASE_PROJECT_ID` | Firebase Console → Project Settings → Service Accounts → Generate new private key |
| `FIREBASE_CLIENT_EMAIL` | same JSON file (`client_email`) |
| `FIREBASE_PRIVATE_KEY` | same JSON file (`private_key`) — paste the full string including `-----BEGIN/END PRIVATE KEY-----` |
| `UPSTASH_REDIS_REST_URL` | Upstash Console → your database → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | same |

`NEXT_PUBLIC_*` vars are embedded at build time; `FIREBASE_*` and `UPSTASH_*` vars are server-only (used by API routes only).

### Firebase CLI deploys

These are **not** handled by Vercel and must be run manually after changes to the respective files:

```bash
# After any change to firestore.rules
firebase deploy --only firestore:rules

# After any change to firestore.indexes.json
firebase deploy --only firestore:indexes
```

Firestore indexes take a few minutes to build after deployment — queries that depend on a new index will fail until the build completes.

### Seeding business data

After deploying to a new project or resetting Firestore:

```bash
# Download service-account.json from Firebase Console → Project Settings → Service Accounts
npm run seed:businesses
```

### Granting admin access

The user must have signed up first (Firebase Auth account must exist), then:

```bash
# Download service-account.json from Firebase Console → Project Settings → Service Accounts
npm run grant:admin -- <email> <businessSlug>

# To revoke
npm run revoke:admin -- <email> <businessSlug>
```
