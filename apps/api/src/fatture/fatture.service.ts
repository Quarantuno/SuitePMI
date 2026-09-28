import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  TERMINE_PAGAMENTO_DEFAULT_GIORNI,
  type Fattura,
  type FatturaCreateInput,
  type ImportXmlResponse,
  type PagamentoInput,
} from '@suite/shared';
import { desc, eq } from 'drizzle-orm';
import { pgErrorCode, UNIQUE_VIOLATION } from '../common/pg-errors';
import { ContropartiService } from '../controparti/controparti.service';
import { DbService, type Tx } from '../db/db.service';
import { aziende, controparti, fatture, pagamenti, scadenze } from '../db/schema';
import { FatturaPAError, parseFatturaPA, type SoggettoFattura } from './fatturapa.parser';

const conScadenze = {
  controparte: { columns: { id: true, denominazione: true } },
  scadenze: {
    orderBy: scadenze.dataScadenza,
    with: { pagamenti: { columns: { importoCents: true } } },
  },
} as const;

type FatturaConScadenze = typeof fatture.$inferSelect & {
  controparte: { id: string; denominazione: string };
  scadenze: (typeof scadenze.$inferSelect & { pagamenti: { importoCents: number }[] })[];
};

function toFattura(f: FatturaConScadenze): Fattura {
  return {
    id: f.id,
    direzione: f.direzione,
    numero: f.numero,
    dataEmissione: f.dataEmissione,
    totaleCents: f.totaleCents,
    origine: f.origine,
    controparte: f.controparte,
    scadenze: f.scadenze.map((s) => ({
      id: s.id,
      dataScadenza: s.dataScadenza,
      importoCents: s.importoCents,
      pagatoCents: s.pagamenti.reduce((sum, p) => sum + p.importoCents, 0),
    })),
  };
}

function duplicata(err: unknown): never {
  if (pgErrorCode(err) === UNIQUE_VIOLATION) {
    throw new ConflictException('Questa fattura e gia stata registrata');
  }
  throw err;
}

@Injectable()
export class FattureService {
  constructor(
    private readonly dbs: DbService,
    private readonly controparti: ContropartiService,
  ) {}

  list(aziendaId: string, direzione?: 'attiva' | 'passiva'): Promise<Fattura[]> {
    return this.dbs.withTenant(aziendaId, async (tx) => {
      const rows = await tx.query.fatture.findMany({
        where: direzione ? eq(fatture.direzione, direzione) : undefined,
        orderBy: [desc(fatture.dataEmissione), desc(fatture.createdAt)],
        with: conScadenze,
      });
      return rows.map(toFattura);
    });
  }

  get(aziendaId: string, id: string): Promise<Fattura> {
    return this.dbs.withTenant(aziendaId, (tx) => this.load(tx, id));
  }

  async create(aziendaId: string, input: FatturaCreateInput): Promise<Fattura> {
    const rate =
      input.scadenze.length > 0
        ? input.scadenze
        : [
            {
              dataScadenza: addDays(input.dataEmissione, TERMINE_PAGAMENTO_DEFAULT_GIORNI),
              importoCents: input.totaleCents,
            },
          ];
    try {
      return await this.dbs.withTenant(aziendaId, async (tx) => {
        await this.controparti.find(tx, input.controparteId);
        const [f] = await tx
          .insert(fatture)
          .values({
            aziendaId,
            controparteId: input.controparteId,
            direzione: input.direzione,
            numero: input.numero,
            dataEmissione: input.dataEmissione,
            totaleCents: input.totaleCents,
            origine: 'manuale',
          })
          .returning();
        await tx.insert(scadenze).values(rate.map((r) => ({ ...r, aziendaId, fatturaId: f!.id })));
        return this.load(tx, f!.id);
      });
    } catch (err) {
      duplicata(err);
    }
  }

  /**
   * Importa una FatturaPA. La direzione si deduce dalla partita IVA dell'azienda:
   * se siamo il cedente e una fattura attiva (da incassare), altrimenti passiva.
   */
  async importXml(aziendaId: string, xml: string): Promise<ImportXmlResponse> {
    let parsed;
    try {
      parsed = parseFatturaPA(xml);
    } catch (err) {
      if (err instanceof FatturaPAError) throw new BadRequestException(err.message);
      throw err;
    }

    const [azienda] = await this.dbs.db.select().from(aziende).where(eq(aziende.id, aziendaId));
    if (!azienda) throw new NotFoundException('Azienda non trovata');

    const siamoCedente = parsed.cedente.partitaIva === azienda.partitaIva;
    const siamoCessionario = parsed.cessionario.partitaIva === azienda.partitaIva;
    if (!siamoCedente && !siamoCessionario) {
      throw new BadRequestException(
        `La fattura non riguarda la tua azienda (P.IVA ${azienda.partitaIva} non presente come cedente o cessionario)`,
      );
    }
    const direzione = siamoCedente ? 'attiva' : 'passiva';
    const altro: SoggettoFattura = siamoCedente ? parsed.cessionario : parsed.cedente;

    try {
      return await this.dbs.withTenant(aziendaId, async (tx) => {
        const { id: controparteId, creata } = await this.trovaOCreaControparte(tx, aziendaId, altro, {
          tipo: direzione === 'attiva' ? 'cliente' : 'fornitore',
          pec: siamoCedente ? parsed.pecDestinatario : null,
        });
        const [f] = await tx
          .insert(fatture)
          .values({
            aziendaId,
            controparteId,
            direzione,
            numero: parsed.numero,
            dataEmissione: parsed.data,
            totaleCents: parsed.totaleCents,
            origine: 'xml',
            xmlOriginale: xml,
          })
          .returning();
        await tx.insert(scadenze).values(parsed.scadenze.map((r) => ({ ...r, aziendaId, fatturaId: f!.id })));
        return { fattura: await this.load(tx, f!.id), controparteCreata: creata, avvisi: parsed.avvisi };
      });
    } catch (err) {
      duplicata(err);
    }
  }

  async remove(aziendaId: string, id: string): Promise<void> {
    await this.dbs.withTenant(aziendaId, async (tx) => {
      const deleted = await tx.delete(fatture).where(eq(fatture.id, id)).returning({ id: fatture.id });
      if (deleted.length === 0) throw new NotFoundException('Fattura non trovata');
    });
  }

  async registraPagamento(aziendaId: string, scadenzaId: string, input: PagamentoInput): Promise<Fattura> {
    return this.dbs.withTenant(aziendaId, async (tx) => {
      const scadenza = await tx.query.scadenze.findFirst({
        where: eq(scadenze.id, scadenzaId),
        with: { pagamenti: { columns: { importoCents: true } } },
      });
      if (!scadenza) throw new NotFoundException('Scadenza non trovata');
      const pagato = scadenza.pagamenti.reduce((s, p) => s + p.importoCents, 0);
      if (pagato + input.importoCents > scadenza.importoCents) {
        throw new BadRequestException(
          `Il pagamento supera il residuo della rata (${(scadenza.importoCents - pagato) / 100} euro)`,
        );
      }
      await tx.insert(pagamenti).values({ ...input, aziendaId, scadenzaId });
      return this.load(tx, scadenza.fatturaId);
    });
  }

  private async load(tx: Tx, id: string): Promise<Fattura> {
    const f = await tx.query.fatture.findFirst({ where: eq(fatture.id, id), with: conScadenze });
    if (!f) throw new NotFoundException('Fattura non trovata');
    return toFattura(f as FatturaConScadenze);
  }

  private async trovaOCreaControparte(
    tx: Tx,
    aziendaId: string,
    s: SoggettoFattura,
    extra: { tipo: 'cliente' | 'fornitore'; pec: string | null },
  ): Promise<{ id: string; creata: boolean }> {
    const chiave = s.partitaIva
      ? eq(controparti.partitaIva, s.partitaIva)
      : s.codiceFiscale
        ? eq(controparti.codiceFiscale, s.codiceFiscale)
        : eq(controparti.denominazione, s.denominazione);
    const [esistente] = await tx.select().from(controparti).where(chiave);
    if (esistente) {
      // Chi era solo fornitore e ora riceve una nostra fattura diventa "entrambi".
      if (esistente.tipo !== 'entrambi' && esistente.tipo !== extra.tipo) {
        await tx.update(controparti).set({ tipo: 'entrambi' }).where(eq(controparti.id, esistente.id));
      }
      if (!esistente.pec && extra.pec) {
        await tx.update(controparti).set({ pec: extra.pec }).where(eq(controparti.id, esistente.id));
      }
      return { id: esistente.id, creata: false };
    }
    const [nuova] = await tx
      .insert(controparti)
      .values({
        aziendaId,
        tipo: extra.tipo,
        denominazione: s.denominazione,
        partitaIva: s.partitaIva,
        codiceFiscale: s.codiceFiscale,
        indirizzo: s.indirizzo,
        pec: extra.pec,
      })
      .returning({ id: controparti.id });
    return { id: nuova!.id, creata: true };
  }
}
