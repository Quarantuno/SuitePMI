import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { Pool } from 'pg';
import { config } from '../config';

/** Applica le migrazioni con l'utente proprietario (DATABASE_ADMIN_URL). */
export async function runMigrations(url = config.databaseAdminUrl) {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(__dirname, '../../drizzle') });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => console.log('Migrazioni applicate.'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
