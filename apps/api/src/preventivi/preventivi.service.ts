import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { totaliPreventivo, type EsitoPreventivoInput, type Preventivo, type PreventivoInput, type PreventivoSintesi } from '@suite/shared';
import { and, desc, eq, ne } from 'drizzle-orm';
import { CommesseService } from '../commesse/commesse.service';
import { DbService, type Tx } from '../db/db.service';
import { aziende, controparti, preventivi } from '../db/schema';
import { generaPreventivoPdf } from './preventivo.pdf';

const sintesi = {
  id: preventivi.id,
  clienteId: preventivi.clienteId,
  titolo: preventivi.titolo,
  data: preventivi.data,
  validoFino: preventivi.validoFino,
  stato: preventivi.stato,
  commessaId: preventivi.commessaId,
  totaleCents: preventivi.totaleCents,
  cliente: { id: controparti.id, denominazione: controparti.denominazione },
};

@Injectable()
export class PreventiviService {
  constructor(private readonly db: DbService, private readonly commesse: CommesseService) {}

  list(aziendaId: string): Promise<PreventivoSintesi[]> {
    return this.db.withTenant(aziendaId, (tx) => tx.select(sintesi).from(preventivi)
      .innerJoin(controparti, eq(preventivi.clienteId, controparti.id))
      .orderBy(desc(preventivi.data), desc(preventivi.id)));
  }

  get(aziendaId: string, id: string): Promise<Preventivo> {
    return this.db.withTenant(aziendaId, (tx) => this.dettaglio(tx, id));
  }

  create(aziendaId: string, input: PreventivoInput): Promise<Preventivo> {
    return this.db.withTenant(aziendaId, async (tx) => {
      await this.verificaCliente(tx, input.clienteId);
      const [riga] = await tx.insert(preventivi)
        .values({ aziendaId, ...input, totaleCents: totaliPreventivo(input.voci).totaleCents })
        .returning({ id: preventivi.id });
      return this.dettaglio(tx, riga!.id);
    });
  }

  update(aziendaId: string, id: string, input: PreventivoInput): Promise<Preventivo> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const attuale = await this.blocca(tx, id);
      if (attuale.stato !== 'bozza') throw new ConflictException('Puoi modificare solo i preventivi in bozza');
      await this.verificaCliente(tx, input.clienteId);
      await tx.update(preventivi).set({ ...input, totaleCents: totaliPreventivo(input.voci).totaleCents })
        .where(eq(preventivi.id, id));
      return this.dettaglio(tx, id);
    });
  }

  cambiaStato(aziendaId: string, id: string, stato: EsitoPreventivoInput['stato']): Promise<Preventivo> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const attuale = await this.blocca(tx, id);
      if (attuale.stato === stato) return this.dettaglio(tx, id);
      const precedente = stato === 'inviato' ? 'bozza' : 'inviato';
      if (attuale.stato !== precedente) throw new ConflictException('Il preventivo non può passare allo stato richiesto');

      let commessaId: string | undefined;
      if (stato === 'accettato') {
        const commessa = await this.commesse.creaInTransazione(tx, aziendaId, {
          clienteId: attuale.clienteId,
          nome: attuale.titolo,
          budgetCents: attuale.totaleCents,
        });
        commessaId = commessa.id;
      }

      await tx.update(preventivi).set({ stato, commessaId }).where(eq(preventivi.id, id));
      return this.dettaglio(tx, id);
    });
  }

  async pdf(aziendaId: string, id: string): Promise<Buffer> {
    const dati = await this.db.withTenant(aziendaId, async (tx) => {
      const preventivo = await this.dettaglio(tx, id);
      const [azienda] = await tx.select({
        ragioneSociale: aziende.ragioneSociale, partitaIva: aziende.partitaIva,
      }).from(aziende).where(eq(aziende.id, aziendaId));
      if (!azienda) throw new NotFoundException('Azienda non trovata');
      return { preventivo, azienda };
    });
    return generaPreventivoPdf(dati.preventivo, dati.azienda);
  }

  private async verificaCliente(tx: Tx, id: string): Promise<void> {
    const [cliente] = await tx.select({ id: controparti.id }).from(controparti)
      .where(and(eq(controparti.id, id), ne(controparti.tipo, 'fornitore'))).limit(1);
    if (!cliente) throw new NotFoundException('Cliente non trovato');
  }

  private async blocca(tx: Tx, id: string) {
    const [record] = await tx.select().from(preventivi).where(eq(preventivi.id, id)).for('update');
    if (!record) throw new NotFoundException('Preventivo non trovato');
    return record;
  }

  private async dettaglio(tx: Tx, id: string): Promise<Preventivo> {
    const [record] = await tx.select({ ...sintesi, voci: preventivi.voci, note: preventivi.note })
      .from(preventivi).innerJoin(controparti, eq(preventivi.clienteId, controparti.id))
      .where(eq(preventivi.id, id));
    if (!record) throw new NotFoundException('Preventivo non trovato');
    return record;
  }
}
