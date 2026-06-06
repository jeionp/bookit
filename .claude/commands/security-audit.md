Bookit-specific extension of the generic `/security-audit`. Run the generic command, then apply the additional checklist below.

---

## Bookit-specific audit checklist

**Auth & access control**
- [ ] Every API route: `requireUser` / `isAdminOf` present and correct?
- [ ] Admin routes: verify `admins/{uid}` document exists and `slugs` array includes the business slug?

**Input validation**
- [ ] Every POST/PATCH body: field allowlist enforced (no raw spread of request body into Firestore)?
- [ ] `totalPrice` and other monetary fields: computed server-side, never trusted from client?

**Rate limiting**
- [ ] Every public endpoint: Upstash Redis sliding window applied?
- [ ] Rate limit failures: fail-closed (deny request), not fail-open (allow through)?

**Data integrity**
- [ ] `cancelBookingWithRefund`: Firestore updated after refund API resolves, not before (TOCTOU)?
- [ ] `rescheduleBooking`: price recalculated server-side, not taken from client payload?

**Payments**
- [ ] PayMongo webhook: signature verified with constant-time compare?
- [ ] Webhook replay protection: timestamp window checked?

**Firestore rules**
- [ ] Any new collection added: rules written and tested?
- [ ] Overly broad rules (`allow read, write: if true`)? None should exist.

---

## Known open gaps (pre-PayMongo)

Track status in `memory/project_security_backlog.md`. Gaps are addressed before PayMongo goes live, not before every feature PR.
