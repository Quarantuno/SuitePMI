import { Injectable, NotFoundException } from '@nestjs/common';
import { todayIso, type Azienda, type AziendaUpdateInput } from '@suite/shared';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { aziende } from '../db/schema';

export function toAzienda(a: typeof aziende.$inferSelect): Azienda {
  return {
    id: a.id,
    ragioneSociale: a.ragioneSociale,
    partitaIva: a.partitaIva,
    indirizzo: a.indirizzo,
    email: a.email,
    pec: a.pec,
    iban: a.iban,
    saldoCassaCents: a.saldoCassaCents,
    saldoCassaAl: a.saldoCassaAl,
  };
}

/** Dati dell'azienda dell'utente (tabella globale: filtriamo sempre per id dal token). */
@Injectable()
export class AziendaService {
  constructor(private readonly dbs: DbService) {}

  async get(aziendaId: string): Promise<Azienda> {
    const [a] = await this.dbs.db.select().from(aziende).where(eq(aziende.id, aziendaId));
    if (!a) throw new NotFoundException('Azienda non trovata');
    return toAzienda(a);
  }

  async update(aziendaId: string, input: AziendaUpdateInput): Promise<Azienda> {
    const dati = { ...input };
    // Un saldo senza data si intende aggiornato a oggi.
    if (dati.saldoCassaCents !== undefined && !dati.saldoCassaAl) dati.saldoCassaAl = todayIso();
    const [a] = await this.dbs.db.update(aziende).set(dati).where(eq(aziende.id, aziendaId)).returning();
    if (!a) throw new NotFoundException('Azienda non trovata');
    return toAzienda(a);
  }
}
