import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Applies the real SQL migrations to throwaway databases on a real Postgres (npm run test:migrations)
function requiredAdminUrl(): string {
  const url = process.env['MIGRATION_TEST_DATABASE_URL'];
  if (!url) {
    throw new Error(
      'Set MIGRATION_TEST_DATABASE_URL to a Postgres URL whose user may CREATE DATABASE, '
      + 'e.g. postgres://postgres:postgres@localhost:5432/postgres',
    );
  }
  return url;
}

const ADMIN_URL = requiredAdminUrl();
const MIGRATIONS_DIR = fileURLToPath(new URL('../../src/db/migrations', import.meta.url));

interface JournalEntry {
  idx: number;
  tag: string;
}

const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as {
  entries: JournalEntry[];
};

const createdDatabases: string[] = [];
const tempDirs: string[] = [];

async function withClient<T>(url: string, fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function createDatabase(label: string): Promise<string> {
  const name = `chub_migtest_${label}_${process.pid}`;
  await withClient(ADMIN_URL, async (sql) => {
    await sql.unsafe(`DROP DATABASE IF EXISTS ${name}`);
    await sql.unsafe(`CREATE DATABASE ${name}`);
  });
  createdDatabases.push(name);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

// The migrations folder as it looked when only these journal entries existed
function migrationsFolderWith(indexes: number[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'chub-migrations-'));
  tempDirs.push(dir);
  mkdirSync(path.join(dir, 'meta'));
  const entries = journal.entries.filter((entry) => indexes.includes(entry.idx));
  for (const { tag } of entries) {
    copyFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), path.join(dir, `${tag}.sql`));
  }
  writeFileSync(path.join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
  return dir;
}

async function runMigrations(url: string, migrationsFolder = MIGRATIONS_DIR): Promise<void> {
  await withClient(url, (sql) => migrate(drizzle(sql), { migrationsFolder }));
}

async function describeSchema(url: string) {
  return withClient(url, async (sql) => {
    const toolsEnabled = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'chatbots' AND column_name = 'tools_enabled'`;
    const toolsIndex = await sql`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tools_client'`;
    const constraints = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = to_regclass('tenant_tools') AND contype IN ('p', 'u', 'c', 'f')`;
    const triggers = await sql<{ relname: string; tgname: string }[]>`
      SELECT c.relname, t.tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal`;
    return {
      toolsEnabled: toolsEnabled.length === 1,
      toolsIndex: toolsIndex.length === 1,
      tenantToolsConstraints: constraints.map((row) => row.conname).sort(),
      triggers: triggers.map((row) => `${row.relname}.${row.tgname}`).sort(),
    };
  });
}

// Every definition in the public schema, to compare an upgraded database with a new one
async function schemaFingerprint(url: string) {
  return withClient(url, async (sql) => {
    const columns = await sql<{ def: string }[]>`
      SELECT concat_ws(' ', table_name || '.' || column_name, udt_name, character_maximum_length,
                       'null=' || is_nullable, 'default=' || column_default) AS def
      FROM information_schema.columns WHERE table_schema = 'public'`;
    const constraints = await sql<{ def: string }[]>`
      SELECT conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype IN ('p', 'u', 'c', 'f')`;
    const indexes = await sql<{ def: string }[]>`SELECT indexdef AS def FROM pg_indexes WHERE schemaname = 'public'`;
    const triggers = await sql<{ def: string }[]>`
      SELECT pg_get_triggerdef(t.oid) AS def FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal`;
    const functions = await sql<{ def: string }[]>`
      SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE pronamespace = 'public'::regnamespace`;
    const enums = await sql<{ def: string }[]>`
      SELECT t.typname || ' ' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS def
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname`;
    const sorted = (rows: { def: string }[]) => rows.map((row) => row.def).sort();
    return {
      columns: sorted(columns),
      constraints: sorted(constraints),
      indexes: sorted(indexes),
      triggers: sorted(triggers),
      functions: sorted(functions),
      enums: sorted(enums),
    };
  });
}

let freshFingerprint: ReturnType<typeof schemaFingerprint> | undefined;

// What `db:migrate` builds on an empty database; created once and shared by the upgrade tests
function newDatabaseFingerprint() {
  freshFingerprint ??= createDatabase('reference').then(async (url) => {
    await runMigrations(url);
    return schemaFingerprint(url);
  });
  return freshFingerprint;
}

const FULL_SCHEMA = {
  toolsEnabled: true,
  toolsIndex: true,
  // The names declared in the Drizzle schema, so later generated migrations can refer to them
  tenantToolsConstraints: [
    'http_method_check',
    'tenant_tools_client_id_clients_id_fk',
    'tenant_tools_client_name_unique',
    'tenant_tools_pkey',
  ],
  triggers: [
    'chatbots.trg_chatbots_updated',
    'clients.trg_clients_updated',
    'knowledge_bases.trg_knowledge_updated',
    'tenant_tools.trg_tenant_tools_updated',
  ],
};

describe('database migrations (real Postgres)', () => {
  // Ctrl-C skips afterAll, and the next run has another pid. Don't run two migration test runs
  // against the same server at once.
  beforeAll(async () => {
    await withClient(ADMIN_URL, async (sql) => {
      const stale = await sql<{ datname: string }[]>`
        SELECT datname FROM pg_database WHERE datname LIKE 'chub\\_migtest\\_%'`;
      for (const { datname } of stale) {
        await sql.unsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
      }
    });
  });

  afterAll(async () => {
    const failures: string[] = [];
    await withClient(ADMIN_URL, async (sql) => {
      for (const name of createdDatabases) {
        try {
          await sql.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
        } catch (err) {
          failures.push(`${name}: ${(err as Error).message}`);
        }
      }
    });
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
    if (failures.length) throw new Error(`Could not drop test databases:\n${failures.join('\n')}`);
  });

  it('builds the full schema on an empty database, and a second run changes nothing', async () => {
    const url = await createDatabase('fresh');

    await runMigrations(url);
    expect(await describeSchema(url)).toEqual(FULL_SCHEMA);
    const afterFirstRun = await schemaFingerprint(url);

    await runMigrations(url);
    expect(await schemaFingerprint(url)).toEqual(afterFirstRun);
  });

  it('keeps updated_at current without running the seed', async () => {
    const url = await createDatabase('trigger');
    await runMigrations(url);

    const updatedAt = await withClient(url, async (sql) => {
      const [client] = await sql`
        INSERT INTO clients (name, slug, email, api_key, updated_at)
        VALUES ('Migration test', 'migration-test', 'migration-test@example.com', 'ck_migration_test', '2000-01-01T00:00:00Z')
        RETURNING id`;
      const [row] = await sql`UPDATE clients SET name = 'Migration test (renamed)' WHERE id = ${client!['id']} RETURNING updated_at`;
      return row!['updated_at'] as Date;
    });

    expect(updatedAt.getTime()).toBeGreaterThan(new Date('2000-01-02T00:00:00Z').getTime());
  });

  // 0003's journal timestamp is older than 0002's, so Drizzle skipped it on databases that were already at 0002
  it.each([
    ['migrated up to 0002', [0, 1, 2]],
    ['migrated up to 0002 plus 0004', [0, 1, 2, 4]],
  ])('brings a database %s to the same schema as a new one', async (_state, applied) => {
    const url = await createDatabase(`upgrade_${applied.join('')}`);

    await runMigrations(url, migrationsFolderWith(applied));
    await runMigrations(url);

    expect(await describeSchema(url)).toEqual(FULL_SCHEMA);
    expect(await schemaFingerprint(url)).toEqual(await newDatabaseFingerprint());
  });

  it('brings a database at 0002 where 0003 was applied by hand to the same schema as a new one', async () => {
    const url = await createDatabase('manual_0003');
    await runMigrations(url, migrationsFolderWith([0, 1, 2]));
    await withClient(url, (sql) => sql.unsafe(readFileSync(path.join(MIGRATIONS_DIR, '0003_tenant_tools.sql'), 'utf8')));

    await runMigrations(url);

    expect(await describeSchema(url)).toEqual(FULL_SCHEMA);
    expect(await schemaFingerprint(url)).toEqual(await newDatabaseFingerprint());
  });
});
