import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { Pool } from 'pg';
import { riferimentiNotaStorica } from '../fatture/fatturapa.parser';
import { config } from '../config';

/** Applica le migrazioni con l'utente proprietario (DATABASE_ADMIN_URL). */
export async function runMigrations(url = config.databaseAdminUrl) {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: join(__dirname, '../../drizzle') });
    await migraRiferimentiNote(pool);
  } finally {
    await pool.end();
  }
}

/** Mantiene l’abbinamento automatico delle note importate prima dei riferimenti normalizzati. */
async function migraRiferimentiNote(pool: Pool): Promise<void> {
  while (true) {
    const { rows: [nota] } = await pool.query<{
      id: string; numero: string; data: string; xml_originale: string;
    }>(`
      SELECT id, numero, data_emissione::text AS data, xml_originale
      FROM fatture
      WHERE tipo_documento = 'TD04' AND riferimenti_nota IS NULL AND xml_originale IS NOT NULL
      ORDER BY id
      LIMIT 1
    `);
    if (!nota) return;

    let riferimenti: ReturnType<typeof riferimentiNotaStorica> = [];
    try {
      riferimenti = riferimentiNotaStorica(nota.xml_originale, nota.numero, nota.data);
    } catch {
      console.warn('Una nota di credito precedente richiede l’abbinamento manuale.');
    }
    await pool.query('UPDATE fatture SET riferimenti_nota = $1::jsonb WHERE id = $2 AND riferimenti_nota IS NULL',
      [JSON.stringify(riferimenti), nota.id]);
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
