import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Controparte, ControparteInput } from '@suite/shared';
import { and, asc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { FOREIGN_KEY_VIOLATION, pgErrorCode, UNIQUE_VIOLATION } from '../common/pg-errors';
import { DbService, type Tx } from '../db/db.service';
import { controparti } from '../db/schema';

type Row = typeof controparti.$inferSelect;

export function toControparte(r: Row): Controparte {
  return {
    id: r.id,
    tipo: r.tipo,
    denominazione: r.denominazione,
    partitaIva: r.partitaIva,
    codiceFiscale: r.codiceFiscale,
    email: r.email,
    pec: r.pec,
    telefono: r.telefono,
    indirizzo: r.indirizzo,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

function conflitto(err: unknown): never {
  if (pgErrorCode(err) === UNIQUE_VIOLATION) {
    throw new ConflictException('Esiste già una controparte con questa partita IVA');
  }
  throw err;
}

@Injectable()
export class ContropartiService {
  constructor(private readonly dbs: DbService) {}

  list(aziendaId: string, filtro: { q?: string; tipo?: string }): Promise<Controparte[]> {
    return this.dbs.withTenant(aziendaId, async (tx) => {
      const where: SQL[] = [];
      if (filtro.q) {
        const q = `%${filtro.q}%`;
        where.push(or(ilike(controparti.denominazione, q), ilike(controparti.partitaIva, q))!);
      }
      if (filtro.tipo === 'cliente' || filtro.tipo === 'fornitore') {
        where.push(or(eq(controparti.tipo, filtro.tipo), eq(controparti.tipo, 'entrambi'))!);
      }
      const rows = await tx
        .select()
        .from(controparti)
        .where(and(...where))
        .orderBy(asc(controparti.denominazione));
      return rows.map(toControparte);
    });
  }

  get(aziendaId: string, id: string): Promise<Controparte> {
    return this.dbs.withTenant(aziendaId, async (tx) => toControparte(await this.find(tx, id)));
  }

  async create(aziendaId: string, input: ControparteInput): Promise<Controparte> {
    try {
      return await this.dbs.withTenant(aziendaId, async (tx) => {
        const [row] = await tx
          .insert(controparti)
          .values({ ...input, aziendaId })
          .returning();
        return toControparte(row!);
      });
    } catch (err) {
      conflitto(err);
    }
  }

  async update(aziendaId: string, id: string, input: Partial<ControparteInput>): Promise<Controparte> {
    try {
      return await this.dbs.withTenant(aziendaId, async (tx) => {
        await this.find(tx, id);
        const [row] = await tx
          .update(controparti)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(controparti.id, id))
          .returning();
        return toControparte(row!);
      });
    } catch (err) {
      conflitto(err);
    }
  }

  async remove(aziendaId: string, id: string): Promise<void> {
    try {
      await this.dbs.withTenant(aziendaId, async (tx) => {
        await this.find(tx, id);
        await tx.delete(controparti).where(eq(controparti.id, id));
      });
    } catch (err) {
      if (pgErrorCode(err) === FOREIGN_KEY_VIOLATION) {
        throw new ConflictException('La controparte ha fatture collegate: eliminale prima');
      }
      throw err;
    }
  }

  /** Grazie alla RLS, una controparte di un'altra azienda risulta semplicemente inesistente. */
  async find(tx: Tx, id: string): Promise<Row> {
    const [row] = await tx.select().from(controparti).where(eq(controparti.id, id));
    if (!row) throw new NotFoundException('Controparte non trovata');
    return row;
  }
}
