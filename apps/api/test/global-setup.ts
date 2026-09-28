import { Client } from 'pg';
import { runMigrations } from '../src/db/migrate';

const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/suite_test';

/**
 * Prepara il database di test: crea "suite_test" se manca, applica le migrazioni
 * e svuota le tabelle. Richiede Postgres avviato (pnpm db:up).
 */
export default async function setup() {
  const url = new URL(ADMIN_URL);
  const dbName = url.pathname.slice(1);
  const serverUrl = new URL(ADMIN_URL);
  serverUrl.pathname = '/postgres';

  const server = new Client({ connectionString: serverUrl.toString() });
  await server.connect();
  const exists = await server.query('select 1 from pg_database where datname = $1', [dbName]);
  if (exists.rowCount === 0) await server.query(`create database "${dbName}"`);
  await server.end();

  await runMigrations(ADMIN_URL);

  const db = new Client({ connectionString: ADMIN_URL });
  await db.connect();
  await db.query('truncate pagamenti, scadenze, fatture, controparti, membri, utenti, aziende cascade');
  await db.end();
}
