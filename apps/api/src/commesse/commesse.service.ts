import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AggiornaCommessaInput, Commessa, CommessaInput, CostoCommessa, CostoCommessaInput, FatturaCommessa } from '@suite/shared';
import { and, asc, desc, eq, isNull, ne, notInArray, or } from 'drizzle-orm';
import { DbService, type Tx } from '../db/db.service';
import { commesse, controparti, costiCommessa, fatture } from '../db/schema';

const datiCommessa = {
  id: commesse.id,
  nome: commesse.nome,
  budgetCents: commesse.budgetCents,
  stato: commesse.stato,
  scadenza: commesse.scadenza,
  cliente: { id: controparti.id, denominazione: controparti.denominazione },
};

const fatturaAttiva = and(eq(fatture.direzione, 'attiva'), notInArray(fatture.tipoDocumento, ['TD04', 'TD08']));

@Injectable()
export class CommesseService {
  constructor(private readonly db: DbService) {}

  list(aziendaId: string): Promise<Commessa[]> {
    return this.db.withTenant(aziendaId, (tx) =>
      tx.select(datiCommessa).from(commesse)
        .innerJoin(controparti, eq(commesse.clienteId, controparti.id))
        .orderBy(asc(commesse.nome), asc(commesse.id)),
    );
  }

  create(aziendaId: string, input: CommessaInput): Promise<Commessa> {
    return this.db.withTenant(aziendaId, (tx) => this.creaInTransazione(tx, aziendaId, input));
  }

  async creaInTransazione(tx: Tx, aziendaId: string, input: CommessaInput): Promise<Commessa> {
    const cliente = await tx.query.controparti.findFirst({
      columns: { id: true, denominazione: true },
      where: and(eq(controparti.id, input.clienteId), ne(controparti.tipo, 'fornitore')),
    });
    if (!cliente) throw new NotFoundException('Cliente non trovato');

    const [commessa] = await tx.insert(commesse).values({ aziendaId, ...input }).returning();
    const { id, nome, budgetCents, stato, scadenza } = commessa!;
    return { id, nome, budgetCents, stato, scadenza, cliente };
  }

  aggiorna(aziendaId: string, id: string, input: AggiornaCommessaInput): Promise<void> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const [aggiornata] = await tx.update(commesse).set(input)
        .where(eq(commesse.id, id)).returning({ id: commesse.id });
      if (!aggiornata) throw new NotFoundException('Commessa non trovata');
    });
  }

  documenti(aziendaId: string, id: string): Promise<{ collegate: FatturaCommessa[]; disponibili: FatturaCommessa[] }> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const commessa = await tx.query.commesse.findFirst({ where: eq(commesse.id, id) });
      if (!commessa) throw new NotFoundException('Commessa non trovata');

      const rows = await tx.query.fatture.findMany({
        columns: { id: true, numero: true, dataEmissione: true, totaleCents: true, commessaId: true },
        where: and(
          fatturaAttiva,
          eq(fatture.controparteId, commessa.clienteId),
          or(eq(fatture.commessaId, id), isNull(fatture.commessaId)),
        ),
        orderBy: [desc(fatture.dataEmissione), asc(fatture.id)],
        with: {
          scadenze: {
            columns: { importoCents: true },
            with: { pagamenti: { columns: { importoCents: true, tipo: true } } },
          },
        },
      });

      const collegate: FatturaCommessa[] = [];
      const disponibili: FatturaCommessa[] = [];
      for (const row of rows) {
        let incassatoCents = 0;
        let stornatoCents = 0;
        let totaleRateCents = 0;
        for (const scadenza of row.scadenze) {
          totaleRateCents += scadenza.importoCents;
          for (const pagamento of scadenza.pagamenti) {
            if (pagamento.tipo === 'nota_credito') stornatoCents += pagamento.importoCents;
            else incassatoCents += pagamento.importoCents;
          }
        }

        const elenco = row.commessaId === id ? collegate : disponibili;
        elenco.push({
          id: row.id,
          numero: row.numero,
          dataEmissione: row.dataEmissione,
          fatturatoCents: row.totaleCents,
          incassatoCents,
          stornatoCents,
          residuoCents: totaleRateCents - incassatoCents - stornatoCents,
        });
      }
      return { collegate, disponibili };
    });
  }

  costi(aziendaId: string, commessaId: string): Promise<CostoCommessa[]> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const commessa = await tx.query.commesse.findFirst({ where: eq(commesse.id, commessaId) });
      if (!commessa) throw new NotFoundException('Commessa non trovata');

      return tx.select({
        id: costiCommessa.id,
        tipo: costiCommessa.tipo,
        data: costiCommessa.data,
        descrizione: costiCommessa.descrizione,
        minuti: costiCommessa.minuti,
        costoCents: costiCommessa.costoCents,
      }).from(costiCommessa)
        .where(eq(costiCommessa.commessaId, commessaId))
        .orderBy(desc(costiCommessa.data), asc(costiCommessa.id));
    });
  }

  aggiungiCosto(aziendaId: string, commessaId: string, input: CostoCommessaInput): Promise<{ id: string }> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const commessa = await tx.query.commesse.findFirst({ where: eq(commesse.id, commessaId) });
      if (!commessa) throw new NotFoundException('Commessa non trovata');

      const [costo] = await tx.insert(costiCommessa)
        .values({ ...input, aziendaId, commessaId })
        .returning({ id: costiCommessa.id });
      return costo!;
    });
  }

  eliminaCosto(aziendaId: string, commessaId: string, id: string): Promise<void> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const [costo] = await tx.delete(costiCommessa)
        .where(and(eq(costiCommessa.commessaId, commessaId), eq(costiCommessa.id, id)))
        .returning({ id: costiCommessa.id });
      if (!costo) throw new NotFoundException('Voce di costo non trovata');
    });
  }

  collega(aziendaId: string, fatturaId: string, commessaId: string, collegata: boolean): Promise<void> {
    return this.db.withTenant(aziendaId, async (tx) => {
      const [fattura] = await tx.select().from(fatture)
        .where(and(eq(fatture.id, fatturaId), fatturaAttiva))
        .for('update');
      if (!fattura) throw new NotFoundException('Fattura attiva non trovata');
      if (collegata) {
        if (commessaId === fattura.commessaId) return;
        const commessa = await tx.query.commesse.findFirst({ where: eq(commesse.id, commessaId) });
        if (!commessa) throw new NotFoundException('Commessa non trovata');
        if (fattura.controparteId !== commessa.clienteId) {
          throw new BadRequestException('La fattura appartiene a un altro cliente');
        }
        if (fattura.commessaId) throw new ConflictException('La fattura è già collegata a una commessa');
      } else {
        if (!fattura.commessaId) return;
        if (fattura.commessaId !== commessaId) throw new ConflictException('La fattura è collegata a un’altra commessa');
      }

      await tx.update(fatture).set({ commessaId: collegata ? commessaId : null }).where(eq(fatture.id, fatturaId));
    });
  }
}
