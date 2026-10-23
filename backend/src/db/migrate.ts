import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_USER = 'postgres',
  DB_PASSWORD = 'admin',
  DB_NAME = 'chatbot_hub',
  DATABASE_URL,
} = process.env;

const connectionString = DATABASE_URL
  ?? `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

async function runMigrations() {
  // Fail instead of waiting behind a long-running transaction: a queued ALTER would block every
  // later query on that table until it gets its lock. Re-run db:migrate when the database is quieter.
  const migrationClient = postgres(connectionString, { max: 1, connection: { lock_timeout: 10_000 } });
  const db = drizzle(migrationClient);

  console.log('⏳ Running migrations...');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('✅ Migrations completed!');

  await migrationClient.end();
}

runMigrations().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
