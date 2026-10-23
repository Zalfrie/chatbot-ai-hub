## Summary

<!-- What does this PR change, and why? -->

Closes #

## Type of change

- [ ] Bug fix (`fix:`)
- [ ] Feature / update (`feat:`)
- [ ] Refactor / chore / docs / CI
- [ ] Security
- [ ] Breaking change (needs a migration, new env var, or config change)

## Affected area

- [ ] Backend API
- [ ] Dashboard (frontend)
- [ ] Embed widget
- [ ] Database migration (`backend/src/db/migrations`)
- [ ] CI / tooling

## How was this tested?

<!-- Commands run, manual steps, screenshots for UI changes -->

## Checklist

- [ ] PR title follows Conventional Commits (`fix(frontend): …`, `feat(backend): …`) — it becomes the squash commit
- [ ] Tests added or updated for bug fixes and new logic
- [ ] New or changed DB queries filter by `client_id` (tenant isolation)
- [ ] No secrets, `.env` files, or real customer data (phone numbers, chats) committed
- [ ] New env vars added to `.env.example`
