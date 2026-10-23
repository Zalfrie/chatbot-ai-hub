# Contributing

Every bug fix and update reaches `main` through a pull request that CI has verified. Nothing is pushed to `main` directly.

## Workflow

1. **Open an issue** with the *Bug report* or *Feature / update* form and note its number (e.g. `#12`).
2. **Branch from `main`**: `fix/<short-name>` for bugs, `feat/<short-name>` for features and updates, `chore/`, `ci/`, `docs/`, `test/` for the rest.
3. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/) and reference the issue:

   ```
   fix(frontend): use api.del when deleting a tool

   Closes #12
   ```

4. **Open a PR** with a title in the same format (it becomes the squash-merge commit) and fill in the template.
5. **Merge when CI is green** (`CI passed`, `CodeQL`, `Dependency review`). Squash-merge and delete the branch.

Dependency updates arrive automatically as Dependabot PRs every Monday and go through the same checks.

## Running the CI checks locally

| Package | Commands |
|---|---|
| `backend/` | `npm ci && npm run typecheck && npm run test:coverage && npm run build` |
| `frontend/` | `npm ci && npm run typecheck && npm run build` |
| `widget/` | `npm ci && npm run typecheck && npm run build` |

Backend tests mock PostgreSQL, Redis, and the AI providers, so no services need to be running.

The migration tests are the exception. They apply `src/db/migrations` to throwaway databases on a real Postgres and are skipped unless `MIGRATION_TEST_DATABASE_URL` points at a server where that user may create databases:

```bash
MIGRATION_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:migrations
```

Schema changes go through `npm run db:generate`, never through hand-written journal entries. Drizzle only applies a migration whose `when` is newer than the last applied one.

To check that the compiled backend actually starts the way `npm start` runs it, point the `DB_*` and `REDIS_*` variables at a running Postgres and Redis and run `npm run build && npm run smoke` in `backend/`. Use an empty database for this, because the server restores the WhatsApp sessions it finds on startup.

## Pipelines

| Workflow | Runs on | What it checks |
|---|---|---|
| `.github/workflows/ci.yml` | every PR, push to `main` | Backend type-check, tests with coverage thresholds, build. Backend start: boots the compiled server against Postgres and Redis service containers and checks `/health`. Migrations: schema/migration drift check, migration tests and `db:migrate` against a Postgres service container. Frontend `nuxi typecheck` and build. Widget type-check, build, and zero-dependency guard. PR title format. `CI passed` aggregates all of them. |
| `.github/workflows/security.yml` | every PR, push to `main`, Mondays | CodeQL static analysis; dependency review blocks PRs that add a dependency with a high/critical advisory |
| `.github/dependabot.yml` | Mondays 07:00 WIB | Opens update PRs for npm (backend, frontend, widget) and GitHub Actions |
