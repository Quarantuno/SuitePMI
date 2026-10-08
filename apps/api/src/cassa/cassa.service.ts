import { BadRequestException, Injectable } from '@nestjs/common';
import {
  addDays,
  lunedi,
  previsioneCassa,
  todayIso,
  type MovimentoPrevisto,
  type PrevisioneCassaResponse,
  type PrevisioneQuery,
} from '@suite/shared';
import { lte } from 'drizzle-orm';
import { AziendaService } from '../azienda/azienda.service';
import { DbService } from '../db/db.service';
import { scadenze } from '../db/schema';

@Injectable()
export class CassaService {
  constructor(
    private readonly dbs: DbService,
    private readonly azienda: AziendaService,
  ) {}

  /** Previsione di cassa a settimane, partendo dal saldo dichiarato e dalle rate aperte. */
  async previsione(aziendaId: string, q: PrevisioneQuery): Promise<PrevisioneCassaResponse> {
    const da = q.da ?? todayIso();
    const fine = addDays(lunedi(da), 7 * q.settimane - 1);
    const [azienda, movimenti] = await Promise.all([this.azienda.get(aziendaId), this.rateAperte(aziendaId, fine)]);

    let p;
    try {
      p = previsioneCassa({
        da,
        settimane: q.settimane,
        saldoInizialeCents: azienda.saldoCassaCents ?? 0,
        movimenti,
        includiCreditiScaduti: q.includiCreditiScaduti,
      });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    return {
      da,
      saldo: { cents: azienda.saldoCassaCents ?? 0, al: azienda.saldoCassaAl },
      includiCreditiScaduti: q.includiCreditiScaduti,
      settimane: p.settimane,
      arretrati: p.arretrati,
      totali: p.totali,
      saldoMinimo: p.saldoMinimo,
      primaSettimanaNegativa: p.primaSettimanaNegativa,
      movimenti: movimenti
        .sort((a, b) => a.dataScadenza.localeCompare(b.dataScadenza))
        .map((m) => ({ ...m, scaduta: m.dataScadenza < da })),
    };
  }

  /** Rate con residuo > 0 che scadono entro `fine` (comprese quelle già scadute). */
  private rateAperte(aziendaId: string, fine: string): Promise<MovimentoPrevisto[]> {
    return this.dbs.withTenant(aziendaId, async (tx) => {
      const rows = await tx.query.scadenze.findMany({
        where: lte(scadenze.dataScadenza, fine),
        with: {
          pagamenti: { columns: { importoCents: true } },
          fattura: {
            columns: { id: true, numero: true, direzione: true },
            with: { controparte: { columns: { id: true, denominazione: true } } },
          },
        },
      });
      return rows
        .map((s) => ({
          scadenzaId: s.id,
          fatturaId: s.fattura.id,
          numeroFattura: s.fattura.numero,
          controparte: s.fattura.controparte,
          tipo: s.fattura.direzione === 'attiva' ? ('entrata' as const) : ('uscita' as const),
          dataScadenza: s.dataScadenza,
          residuoCents: s.importoCents - s.pagamenti.reduce((t, p) => t + p.importoCents, 0),
        }))
        .filter((m) => m.residuoCents > 0);
    });
  }
}
