import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

  /** Accesso senza tenant: solo per le tabelle globali (aziende, utenti, membri). */
  readonly db: Db = drizzle(this.pool, { schema });

  /**
   * Esegue `fn` in una transazione legata a un'azienda: la Row-Level Security
   * di Postgres rende visibili solo le righe di quell'azienda.
   */
  withTenant<T>(aziendaId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.azienda_id', ${aziendaId}, true)`);
      return fn(tx);
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
