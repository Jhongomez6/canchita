---
description: Keep SDD documentation in sync with code changes
---

# SDD Documentation Sync Rule

**Whenever code changes are made** to domain, API, or UI layers, you MUST check and update the relevant SDD documentation files in `docs/`.

## When to Update

Update SDD docs when any of the following change:

1. **Domain types** (`lib/domain/*.ts`) — interfaces, types, constants
2. **Business rules** — new rules, modified validation logic, new constraints
3. **API functions** (`lib/*.ts`) — new endpoints, changed signatures, new parameters
4. **UI behavior** (`app/**/page.tsx`, `components/*.tsx`) — new features, changed flows
5. **Architecture** — new files, moved responsibilities, deleted modules

## What to Update

For each affected feature SDD in `docs/`:

- **Rules table** — Add/modify business rules with their implementation references
- **Architecture section** — Update code examples if signatures changed
- **Traceability section** — Ensure spec → code mappings are current
- **Acceptance criteria** — Add criteria for new behaviors
- **Files table** — Add/remove files, update descriptions
- **Conclusion** — Update the summary checklist

## SDD Files

| Feature | File |
|---------|------|
| Guests | `docs/GUESTS_FEATURE_SDD.md` |
| Matches | `docs/MATCHES_FEATURE_SDD.md` |
| Users/Auth | `docs/USERS_AUTH_FEATURE_SDD.md` |
| Locations | `docs/LOCATIONS_FEATURE_SDD.md` |
| Team Balance | `docs/TEAM_BALANCE_FEATURE_SDD.md` |
| Player Stats | `docs/PLAYER_STATS_FEATURE_SDD.md` |
| Error Handling | `docs/ERROR_HANDLING_SDD.md` |
| Beta Feedback | `docs/BETA_FEEDBACK_FEATURE_SDD.md` |

## Checklist

Before finishing any code task, verify:

- [ ] Identified which SDD docs are affected by the code changes
- [ ] Updated business rules tables if new rules were added
- [ ] Updated code examples if function signatures or types changed
- [ ] Added new acceptance criteria if new behaviors were introduced
- [ ] Updated files tables if new files were created or old ones removed
