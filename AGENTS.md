<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development skills

These slash commands encode the repeatable workflows used on this project. Invoke them at any point in a session:

| Command | When to use |
|---|---|
| `/dev-cycle` | Starting any feature or fix — runs the full branch → implement → verify → PR → CI → merge loop |
| `/security-audit` | Before any major feature ships — parallel audit agents, severity tiers, phased PRs |
| `/refactor-wave` | When duplication piles up or a file exceeds size targets — centralize, delete dead code, verify |
| `/write-tests` | After implementing a feature, before pushing — unit → security rules → E2E, with all mock patterns |

## Pre-PR gate (always applies)

Before pushing any branch, all of the following must be green:
1. `npm run lint` — zero errors
2. `npx tsc --noEmit` — zero errors
3. `npm test` — all unit tests pass
4. `npm run test:security` — if Firestore rules or new collections changed
5. `npm run test:e2e` — if any user-facing flow changed
