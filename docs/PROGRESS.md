# bookit — Technical Progress & Handoff

> Last updated: 2026-04-29. Covers everything merged to `main` through PR #12 plus open PRs #13–#16 (Phase 5).

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

---

## 1. Project Overview

**bookit** is a multi-tenant court/facility booking platform. Each business gets its own storefront at `/<businessSlug>` (e.g. `/paddleup`). Customers browse courts, pick time slots, and pay. Business owners manage bookings through an admin dashboard at `/<businessSlug>/admin`.

Currently one business is configured (`paddleup` — a pickleball facility in Quezon City). The platform is designed for multi-tenant operation, but business config is still static (see §12).

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | Breaking changes from earlier versions — read `node_modules/next/dist/docs/` before touching routing |
| Styling | Tailwind CSS v4 | |
| Database | Firebase Firestore | Client SDK (browser), emulator for local dev |
| Auth | Firebase Auth | Email/password only; emulator for local dev |
| Payments | PayMongo | Philippine payment gateway; API routes stubbed, full integration pending |
| Hosting | Vercel | Auto-deploys `main` on merge |
| Testing | Playwright (E2E) + Vitest (unit + security rules) | |

---

## 3. Repository Structure

```
src/
  app/
    layout.tsx                  # Root layout — wraps AuthProvider
    page.tsx                    # Root redirect → /paddleup
    api/
      refund/route.ts           # POST stub — will call PayMongo refund API
      invite/route.ts           # POST stub — will send signup invite email
    [businessSlug]/
      layout.tsx                # Per-business layout
      page.tsx                  # Storefront (booking flow)
      _components/              # Storefront UI components
        AvailabilitySection.tsx # Date picker + court selector + slot grid + booking bar
        FacilityCard.tsx
        BookingSection.tsx
        ...
      admin/
        page.tsx                # Admin entry point — renders AdminGuard + AdminView
  components/
    admin/
      AdminGuard.tsx            # Client-side auth + role check; redirects non-admins
      AdminView.tsx             # Shell: header, Schedule/Analytics tab bar
      AdminScheduleView.tsx     # Daily grid view with search bar + "New booking" button
      AdminAnalyticsView.tsx    # Period selector + stat cards + charts
      ScheduleGrid.tsx          # Visual grid: courts as columns, hours as rows
      BookingDetailPanel.tsx    # Slide-in panel: booking info, cancel/refund, reschedule,
                                # payment badge, customer history
      WalkInModal.tsx           # Modal for admin walk-in booking creation
    booking/
      MyBookings.tsx            # Customer booking history tab
      SlotGrid.tsx              # Hour-slot grid for customer booking
      BookingActionBar.tsx      # Sticky bar showing price + Book button
      BookingConfirmModal.tsx   # Confirmation dialog before final booking
  context/
    AuthContext.tsx             # onAuthStateChanged + admin slug loading
  lib/
    types.ts                    # Business, Facility, OperatingHours interfaces
    businesses.ts               # Static business/facility config (source of truth)
    slots.ts                    # Slot generation, grouping, validation helpers
    firebase/
      client.ts                 # Firebase app init + emulator connection
      bookings.ts               # All Firestore booking reads/writes
      admin.ts                  # getAdminSlugs (reads /admins/{uid})
    booking/
      useSlotSelection.ts       # Drag-to-select hook used by SlotGrid
firestore.rules                 # Firestore security rules
firestore.indexes.json          # Composite index definitions (deploy with firebase CLI)
tests/
  e2e/
    booking-flow.spec.ts        # 51 Playwright tests — full storefront flow
    admin.spec.ts               # 57 Playwright tests — admin dashboard (Phases 1–5)
    helpers.ts                  # Seed/clear helpers for emulator
  security/
    firestore.rules.test.ts     # 32 Vitest tests — security rules unit tests
.github/workflows/
  ci.yml                        # Lint + type-check (no emulator)
  test.yml                      # Vitest unit tests (no emulator)
  e2e.yml                       # Security rules + E2E (spins up emulator)
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
  totalPrice: number;                              // whole PHP pesos
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

### Business config

Businesses and facilities live in `src/lib/businesses.ts` as a static array — **not in Firestore**. Slug, court names, prices, operating hours, and prime-time windows are all defined there. To add a new business, add an entry to that array and re-deploy. **This will need to migrate to Firestore before onboarding a second business** — see §12.

---

## 5. Security Rules

Full rules are in `firestore.rules`. Key decisions:

| Rule | Rationale |
|---|---|
| `admins` write: always false | Admin records are managed out-of-band only — no client can grant themselves admin |
| `bookings` list: `status == "confirmed"` publicly readable | Required for the availability display (shows which slots are taken). Trade-off: full booking documents including `userId`/`userEmail` are visible. See gap #2 in §11. |
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

> **Action required:** These indexes were added in PR #15 but have not yet been deployed to the production project (`jidoka-pixels`). Run `firebase deploy --only firestore:indexes` after PR #15 merges to `main`.

---

## 7. Feature Progress

### Merged to `main`

| PR | Feature |
|---|---|
| #1–#7 | Initial booking flow: slot grid, drag selection, booking modal, Firebase integration, auth modal |
| #8 | Firestore security rules + 32 rule unit tests |
| #9 | README |
| #10 | Sidebar About card hidden on mobile |
| #11 | Admin dashboard Phase 1 (auth/access control) + Phase 2 (master schedule view) |
| #12 | Admin Phase 3 (booking management: cancel/reschedule/search) + Phase 4 (analytics dashboard) + My Bookings "Completed" state + E2E suite expansion |

### Open PRs — Phase 5 (merge in order)

These are stacked — each branch targets the previous one. Merge #13 first, then #14, #15, #16.

| PR | Branch | Feature |
|---|---|---|
| #13 | `feature/phase-5b-payment-status` | `paymentStatus` field + Paid/Refunded badge in `BookingDetailPanel` |
| #14 | `feature/phase-5c-refund-prompt` | Refund/credit prompt on paid booking cancel; `/api/refund` + `/api/invite` stub routes |
| #15 | `feature/phase-5a-customer-history` | Customer booking history list in detail panel; `getCustomerHistory` query; new Firestore indexes |
| #16 | `feature/phase-5d-walkin-form` | Walk-in booking modal with customer email lookup, optional phone, signup invite stub |

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

`AuthContext` loads admin slugs from Firestore on every `onAuthStateChanged` event. If Firestore is unreachable the call is caught and loading resolves with empty slugs (user is redirected to storefront).

### AdminView shell

Tab bar with **Schedule** and **Analytics** tabs. Header contains business name/badge, "Public view" link, and Sign out button.

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
4. **Reschedule form** — court dropdown, date input, live slot picker (fetches availability excluding the current booking via `getBookedHoursExcluding`), price preview. Conflict-checked via Firestore transaction on confirm.

Key implementation details:
- Panel is `key={selectedBooking.id}` — forces full remount when switching between bookings, resetting all state.
- Slot loading uses `useRef` request counter to discard stale async responses.
- Customer history loads via `useEffect` on mount; shows last 5 bookings for the same `userEmail` at this business, excluding the current one.
- Cancel step state: `"idle" → "refund_choice" (paid only) → "confirm"`. Back button on confirm step returns to `"refund_choice"` for paid bookings, `"idle"` for unpaid.

### WalkInModal

Opened by "New booking" button in the schedule view header. Features:

- Court selector, date picker, time slot grid (same availability logic as reschedule)
- Optional customer section: email field + lookup button (queries existing bookings to pre-fill name/userId), name field, phone field
- Signup invite checkbox — appears only when email is entered, lookup completed, and no existing customer found; calls `POST /api/invite` (stub)
- Walk-in bookings stored with `source: "walk_in"`, `userId: "walk_in"` (or linked userId if customer found)
- On successful booking, schedule grid auto-refreshes

### Analytics tab — `AdminAnalyticsView`

Period selector: Today / This Week / This Month / Year to Date. All date ranges are computed in local time.

Stat cards:
- `stat-revenue` — sum of `totalPrice` for confirmed bookings
- `stat-bookings` — count of confirmed bookings
- `stat-hours` — total hours booked (sum of `hours.length`)
- `stat-cancellation-rate` — `cancelled / total`; shown in red when > 15%

Additional sections (only rendered when `bookingCount > 0`):
- Court utilization — horizontal bars, width = `(courtHours / maxCourtHours) * 100%`
- Peak hours heatmap — horizontal bars per hour with booking count

### Firestore functions (bookings.ts)

| Function | Purpose |
|---|---|
| `getAllBookingsForDay(slug, date)` | Schedule grid — confirmed only |
| `getBookingsForDate(slug, facilityId, date)` | Slot availability check |
| `getBookedHours(slug, facilityId, date)` | Returns booked hour numbers |
| `getBookedHoursExcluding(slug, facilityId, date, excludeId)` | Reschedule slot picker |
| `createBooking(data)` | Transaction with conflict check — online bookings |
| `createWalkInBooking(data)` | Transaction with conflict check — admin walk-in bookings |
| `cancelBooking(bookingId)` | Sets `status → "cancelled"` |
| `cancelBookingWithRefund(bookingId, method)` | Sets `status → "cancelled"`, `paymentStatus → "refunded"`, calls `/api/refund` |
| `rescheduleBooking(bookingId, ...)` | Transaction with conflict check |
| `getBookingsInRange(slug, start, end)` | Analytics date-range query |
| `getUserBookings(userId)` | My Bookings tab |
| `getCustomerHistory(slug, email, excludeId)` | Last 5 bookings for customer in detail panel |
| `lookupCustomerByEmail(slug, email)` | Walk-in form email lookup |

---

## 9. Test Suite

### Counts (as of 2026-04-29, PRs #13–#16 branch)

| Suite | Runner | Count |
|---|---|---|
| `tests/e2e/admin.spec.ts` | Playwright | 57 tests (Phases 1–5) |
| `tests/e2e/booking-flow.spec.ts` | Playwright | 51 tests |
| `tests/security/firestore.rules.test.ts` | Vitest | 32 tests |

### Running locally

```bash
# Kill any lingering emulator processes first (do this at the start of every session)
lsof -ti :8080 | xargs kill -9 2>/dev/null
lsof -ti :9099 | xargs kill -9 2>/dev/null
firebase emulators:start

# In a separate terminal
npm run test:security   # Vitest — Firestore rules (no browser needed)
npm run test:e2e        # Playwright — full app (needs dev server + emulators)
```

The Firestore emulator accumulates JVM gRPC threads over time. After a long-running session it can exhaust the OS thread limit, causing test hangs. **Always kill and restart the emulator before a test run.**

### E2E test helpers (`tests/e2e/helpers.ts`)

| Helper | What it does |
|---|---|
| `clearFirestore()` | DELETE all documents via emulator REST API (8s AbortController timeout) |
| `seedBooking(opts)` | Creates a confirmed booking; authenticates as seed user for rule compliance |
| `seedBookingForUser(opts)` | Creates a booking for a specific user using `Bearer owner` admin bypass; includes `createdAt` and optional `paymentStatus` |
| `seedAdminDoc(uid, slugs)` | Writes `/admins/{uid}` using `Bearer owner` bypass |
| `createTestUser(email, password, displayName)` | Creates auth emulator user; safe to call multiple times |
| `signInUser(email, password)` | Returns `{ idToken, localId }` |
| `todayKey()` / `dateKeyDelta(n)` | Local-time date strings |

### Test patterns to know

**E2E slot tests:**
- Call `selectTomorrow(page)` before `waitForSlots(page)` — today's past hours are filtered in headless Chromium using UTC, making tests timezone-dependent. Tomorrow always shows all slots.
- `waitForSlots` first waits for "Loading availability…" to appear (2s timeout, swallowed), then waits for it to disappear — handles the race where loading finishes before the assertion runs.
- Slot button locators use `exact: true` — "2 PM" would otherwise match "12 PM".

**Cancel flow (post Phase 5c):**
- The dismiss button on the cancel confirm step is labelled **"Back"** (not "No"). For unpaid bookings "Back" returns to idle; for paid bookings it returns to the refund choice screen.

**Walk-in bookings:**
- `seedBookingForUser` accepts an optional `paymentStatus` field for seeding paid/refunded bookings in tests.
- `undefined` field values must never be passed to Firestore writes — use conditional assignment (`if (value) obj.field = value`) rather than `field: value || undefined`.

---

## 10. Development Setup

See `README.md` for the full setup guide. Quick reference:

```bash
# Install deps
npm install

# Copy env
cp .env.example .env.local  # fill in Firebase config

# Start emulators (Auth + Firestore)
firebase emulators:start

# Dev server (separate terminal)
npm run dev

# Seed an admin user for local testing
node scripts/seed-admin-emulator.mjs
```

### Granting admin access

**Emulator:** `node scripts/seed-admin-emulator.mjs` — writes `/admins/{uid}` directly via the emulator REST API.

**Production:** `node scripts/grant-admin.mjs <email> <slug>` — uses `firebase-admin` with a service account. Requires `service-account.json` (gitignored) in the project root.

---

## 11. Known Gaps & Security Backlog

These were identified during a security review and intentionally deferred. Address before production launch, especially before PayMongo goes live.

### Gap 1 — Client-side price calculation (critical before payments)

`totalPrice` is calculated in `useSlotSelection.ts` (browser) and written directly to Firestore. The security rule only checks `totalPrice >= 0`, not that the amount is correct. A malicious user calling the Firebase SDK directly could write `totalPrice: 1`.

**Fix:** Route booking creation through a Next.js Server Action or API Route that recalculates `totalPrice` from `src/lib/businesses.ts` before writing to Firestore.

### Gap 2 — PII exposure via public availability query

The `bookings` list rule allows anyone to query `where("status", "==", "confirmed")`. This returns full booking documents including `userId`, `userEmail`, and `userName`.

**Fix:** Create a Cloud Function `getAvailability(businessSlug, facilityId, date)` that returns only the `hours` array. Lock down the `list` rule to remove the public `status == "confirmed"` branch.

### Gap 3 — PayMongo webhook signature verification (not yet built)

No webhook handler exists yet. When added, it must verify the `X-Paymongo-Signature` header using PayMongo's HMAC-SHA256 scheme before trusting the event.

### Gap 4 — No rate limiting on booking creation

A malicious user can flood `createBooking`, blocking all slots for a facility. Fix with Firebase App Check + Cloud Function wrapper, or Upstash Redis rate limiting in a Next.js API route.

---

## 12. Pending Work & Next Steps

### Immediate (before merging Phase 5 PRs)

- [ ] **Deploy Firestore indexes** — run `firebase deploy --only firestore:indexes` after PR #15 merges. Two new indexes are required: `businessSlug + date` (analytics) and `businessSlug + userEmail + createdAt DESC` (customer history, walk-in lookup). The emulator works without them; production will throw until they're deployed.
- [ ] **Merge PRs in order** — #13 → #14 → #15 → #16. Each branch targets the previous one.

### Phase 6 — Payment integration

PayMongo has a **test mode** (test API keys, test cards) — no local emulator, but the sandbox is free. All API routes are already stubbed with the correct shape.

**6a — Wire up `/api/refund`:**
- Read the per-business PayMongo secret key from Firestore `/businessSecrets/{slug}` (Admin SDK, never client)
- POST to PayMongo `/v1/refunds` with the payment intent ID
- Use `PAYMONGO_SECRET_KEY_TEST` in `.env.local`, `PAYMONGO_SECRET_KEY` in production env

**6b — Wire up PayMongo checkout:**
- `POST /api/checkout` creates a PayMongo payment intent from the server
- On payment success, PayMongo webhook (`POST /api/[businessSlug]/webhook`) verifies the `X-Paymongo-Signature` HMAC-SHA256 header and sets `paymentStatus: "paid"` on the booking
- `totalPrice` must be re-verified server-side here (see Gap 1)

**6c — Wire up `/api/invite`:**
- Replace the `console.log` stub with a real email send (Resend, SendGrid, or Firebase Extensions — Trigger Email)
- Invite link should point to `/<businessSlug>` with email pre-filled

**6d — Store credit ledger:**
- `cancelBookingWithRefund("credit")` currently only sets `paymentStatus: "refunded"` on the booking
- Full implementation: write to `/customers/{userEmail}/credits` via Admin SDK in the API route
- At checkout, read credit balance and deduct before charging PayMongo
- Credits are non-transferable, non-encashable (same business only) to reduce BSP e-money compliance risk

### Phase 7 — Multi-tenant business onboarding

The platform currently supports only `paddleup` via static config in `src/lib/businesses.ts`. To onboard real businesses:

**7a — Migrate business config to Firestore:**
- `/businesses/{slug}` — public config (name, facilities, hours, accentColor)
- `/businessSecrets/{slug}` — private config (PayMongo secret key, webhook secret); `allow read, write: if false` (Admin SDK only)
- Migrate `src/lib/businesses.ts` reads to Firestore queries

**7b — Per-business PayMongo keys:**
- Each business brings their own PayMongo account (platform never touches money flow)
- Store keys in `/businessSecrets/{slug}` or GCP Secret Manager (`projects/{project}/secrets/paymongo_{slug}`)
- API routes read the key for the relevant `businessSlug` before any PayMongo call
- Prefer GCP Secret Manager for production — built-in rotation, audit log, and access controls

**7c — Admin onboarding UI (Option B):**
- Currently admin access is granted via CLI scripts only (Option A)
- Option B: in-app UI for super-admins to grant/revoke admin access without touching the terminal
- Option C: Firebase custom claims for RBAC without cross-document reads (reduces Firestore read quota usage)

### Phase 8 — Walk-in UX polish

- **Grid distinction** — walk-in bookings (`source: "walk_in"`) should render differently on the schedule grid (e.g. different colour tint or a "Walk-in" label on the block) to distinguish them from online bookings
- **Multi-business email lookup** — `lookupCustomerByEmail` currently scopes to `businessSlug`; for a returning customer across businesses, a cross-business lookup would be useful (requires a `customers` collection)
- **Partial refund** — the current refund flow refunds the full `totalPrice`; partial refunds (e.g. if only some hours were cancelled) are not yet handled

### Address security backlog before launch

See §11 for the four deferred security gaps. Gap 1 (client-side price) and Gap 3 (webhook verification) are blockers before PayMongo goes live.
