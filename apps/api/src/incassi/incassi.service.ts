import { BadRequestException, Injectable } from '@nestjs/common';
import {
  calcolaInteressiMora,
  INDENNIZZO_FORFETTARIO_CENTS,
  todayIso,
  type CreditiScadutiResponse,
  type IsoDate,
  type RiepilogoCliente,
  type RigaCredito,
} from '@suite/shared';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { controparti, fatture, pagamenti, scadenze } from '../db/schema';

@Injectable()
export class IncassiService {
  constructor(private readonly dbs: DbService) {}

  /**
   * Crediti su fatture attive scadute alla data indicata:
   * - rate ancora da incassare (stato "scaduto");
   * - rate incassate in ritardo, su cui restano da chiedere gli interessi ("pagato_in_ritardo").
   */
  creditiScaduti(aziendaId: string, alla: IsoDate = todayIso()): Promise<CreditiScadutiResponse> {
    return this.dbs.withTenant(aziendaId, async (tx) => {
      const rows = await tx
        .select({ scadenza: scadenze, fattura: fatture, controparte: controparti })
        .from(scadenze)
        .innerJoin(fatture, eq(fatture.id, scadenze.fatturaId))
        .innerJoin(controparti, eq(controparti.id, fatture.controparteId))
        .where(and(eq(fatture.direzione, 'attiva'), lt(scadenze.dataScadenza, alla)));

      const ids = rows.map((r) => r.scadenza.id);
      const tuttiPagamenti = ids.length
        ? await tx.select().from(pagamenti).where(inArray(pagamenti.scadenzaId, ids))
        : [];
      const perScadenza = new Map<string, { data: IsoDate; importoCents: number }[]>();
      for (const p of tuttiPagamenti) {
        const list = perScadenza.get(p.scadenzaId) ?? [];
        list.push({ data: p.data, importoCents: p.importoCents });
        perScadenza.set(p.scadenzaId, list);
      }

      const righe: RigaCredito[] = [];
      for (const { scadenza, fattura, controparte } of rows) {
        let r;
        try {
          r = calcolaInteressiMora({
            importoCents: scadenza.importoCents,
            scadenza: scadenza.dataScadenza,
            pagamenti: perScadenza.get(scadenza.id) ?? [],
            alla,
          });
        } catch (err) {
          throw new BadRequestException((err as Error).message);
        }
        const applicaInteressi = controparte.partitaIva !== null;
        const interessiCents = applicaInteressi ? r.interessiCents : 0;
        const stato = r.residuoCents > 0 ? 'scaduto' : 'pagato_in_ritardo';
        if (stato === 'pagato_in_ritardo' && interessiCents === 0) continue;

        righe.push({
          scadenzaId: scadenza.id,
          fatturaId: fattura.id,
          numeroFattura: fattura.numero,
          dataEmissione: fattura.dataEmissione,
          controparte: {
            id: controparte.id,
            denominazione: controparte.denominazione,
            pec: controparte.pec,
            email: controparte.email,
          },
          dataScadenza: scadenza.dataScadenza,
          importoCents: scadenza.importoCents,
          residuoCents: r.residuoCents,
          stato,
          applicaInteressi,
          giorniRitardo: r.giorniRitardo,
          interessiCents,
          periodi: applicaInteressi ? r.periodi : [],
        });
      }
      righe.sort((a, b) => b.giorniRitardo - a.giorniRitardo);

      // Indennizzo forfettario di 40 euro: uno per fattura, solo tra imprese.
      const fattureConIndennizzo = new Set(righe.filter((r) => r.applicaInteressi).map((r) => r.fatturaId));

      const clienti = new Map<string, RiepilogoCliente & { _fatture: Set<string> }>();
      for (const r of righe) {
        const c = clienti.get(r.controparte.id) ?? {
          controparteId: r.controparte.id,
          denominazione: r.controparte.denominazione,
          fatture: 0,
          residuoCents: 0,
          interessiCents: 0,
          indennizziCents: 0,
          totaleCents: 0,
          _fatture: new Set<string>(),
        };
        c.residuoCents += r.residuoCents;
        c.interessiCents += r.interessiCents;
        if (!c._fatture.has(r.fatturaId)) {
          c._fatture.add(r.fatturaId);
          if (fattureConIndennizzo.has(r.fatturaId)) c.indennizziCents += INDENNIZZO_FORFETTARIO_CENTS;
        }
        clienti.set(r.controparte.id, c);
      }
      const perCliente: RiepilogoCliente[] = [...clienti.values()]
        .map(({ _fatture, ...c }) => ({
          ...c,
          fatture: _fatture.size,
          totaleCents: c.residuoCents + c.interessiCents + c.indennizziCents,
        }))
        .sort((a, b) => b.totaleCents - a.totaleCents);

      const totali = perCliente.reduce(
        (t, c) => ({
          residuoCents: t.residuoCents + c.residuoCents,
          interessiCents: t.interessiCents + c.interessiCents,
          indennizziCents: t.indennizziCents + c.indennizziCents,
          totaleCents: t.totaleCents + c.totaleCents,
        }),
        { residuoCents: 0, interessiCents: 0, indennizziCents: 0, totaleCents: 0 },
      );

      return { alla, righe, perCliente, totali };
    });
  }
}
