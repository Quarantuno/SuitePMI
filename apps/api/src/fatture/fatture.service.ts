import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  etichettaTipoDocumento,
  TIPI_SOLO_FISCALI,
  TERMINE_PAGAMENTO_DEFAULT_GIORNI,
  type Fattura,
  type FatturaCreateInput,
  type ImportXmlResponse,
  type PagamentoInput,
} from '@suite/shared';
import { and, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { pgErrorCode, UNIQUE_VIOLATION } from '../common/pg-errors';
import { ContropartiService } from '../controparti/controparti.service';
import { DbService, type Tx } from '../db/db.service';
import { aziende, controparti, fatture, pagamenti, scadenze } from '../db/schema';
import {
  FatturaPAError,
  parseFatturaPALotto,
  type FatturaPAParsed,
  type SoggettoFattura,
} from './fatturapa.parser';

const conScadenze = {
  controparte: { columns: { id: true, denominazione: true } },
  fatturaCollegata: { columns: { id: true, numero: true } },
  scadenze: {
    orderBy: scadenze.dataScadenza,
    with: { pagamenti: { columns: { importoCents: true, tipo: true } } },
  },
} as const;

type FatturaConScadenze = typeof fatture.$inferSelect & {
  controparte: { id: string; denominazione: string };
  fatturaCollegata: { id: string; numero: string } | null;
  scadenze: (typeof scadenze.$inferSelect & { pagamenti: { importoCents: number; tipo: 'incasso' | 'nota_credito' }[] })[];
};

const somma = (ps: { importoCents: number }[]) => ps.reduce((t, p) => t + p.importoCents, 0);

function toFattura(f: FatturaConScadenze, applicatoCents = 0): Fattura {
  return {
    id: f.id,
    direzione: f.direzione,
    numero: f.numero,
    dataEmissione: f.dataEmissione,
    totaleCents: f.totaleCents,
    origine: f.origine,
    tipoDocumento: f.tipoDocumento,
    notaDiCredito: f.tipoDocumento === 'TD04',
    fatturaCollegata: f.fatturaCollegata,
    applicatoCents,
    controparte: f.controparte,
    scadenze: f.scadenze.map((s) => ({
      id: s.id,
      dataScadenza: s.dataScadenza,
      importoCents: s.importoCents,
      pagatoCents: somma(s.pagamenti.filter((p) => p.tipo === 'incasso')),
      stornatoCents: somma(s.pagamenti.filter((p) => p.tipo === 'nota_credito')),
    })),
  };
}

function duplicata(err: unknown): never {
  if (pgErrorCode(err) === UNIQUE_VIOLATION) {
    throw new ConflictException('Questa fattura è già stata registrata');
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
      const applicato = await this.applicatoPerNota(tx);
      return rows.map((f) => toFattura(f as FatturaConScadenze, applicato.get(f.id)));
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
   * se siamo il cedente è una fattura attiva (da incassare), altrimenti passiva.
   */
  async importXml(aziendaId: string, xml: string): Promise<ImportXmlResponse> {
    let tutti: FatturaPAParsed[];
    try {
      tutti = parseFatturaPALotto(xml);
    } catch (err) {
      if (err instanceof FatturaPAError) throw new BadRequestException(err.message);
      throw err;
    }

    // Integrazioni e autofatture non sono crediti né debiti verso la controparte: le saltiamo.
    const ignorate = tutti
      .filter((d) => TIPI_SOLO_FISCALI.has(d.tipoDocumento))
      .map((d) => ({ numero: d.numero, tipoDocumento: d.tipoDocumento }));
    const avvisiIgnorate = ignorate.map(
      (d) =>
        `${d.numero}: ${etichettaTipoDocumento(d.tipoDocumento)} (${d.tipoDocumento}) — documento solo fiscale, non genera incassi né pagamenti.`,
    );
    const documenti = tutti.filter((d) => !TIPI_SOLO_FISCALI.has(d.tipoDocumento));
    if (documenti.length === 0) {
      return { fattura: null, fatture: [], duplicate: [], ignorate, controparteCreata: false, avvisi: avvisiIgnorate };
    }

    const [azienda] = await this.dbs.db.select().from(aziende).where(eq(aziende.id, aziendaId));
    if (!azienda) throw new NotFoundException('Azienda non trovata');

    // In un lotto l'header (cedente e cessionario) è unico per tutti i documenti.
    const primo = documenti[0]!;
    const siamoCedente = primo.cedente.partitaIva === azienda.partitaIva;
    const siamoCessionario = primo.cessionario.partitaIva === azienda.partitaIva;
    if (!siamoCedente && !siamoCessionario) {
      throw new BadRequestException(
        `La fattura non riguarda la tua azienda (P.IVA ${azienda.partitaIva} non presente come cedente o cessionario)`,
      );
    }
    const direzione = siamoCedente ? 'attiva' : 'passiva';
    const altro: SoggettoFattura = siamoCedente ? primo.cessionario : primo.cedente;

    try {
      return await this.dbs.withTenant(aziendaId, async (tx) => {
        const { id: controparteId, creata } = await this.trovaOCreaControparte(tx, aziendaId, altro, {
          tipo: direzione === 'attiva' ? 'cliente' : 'fornitore',
          pec: siamoCedente ? primo.pecDestinatario : null,
        });
        const lotto = documenti.length > 1;
        const avvisi: string[] = [...avvisiIgnorate];
        const importate: Fattura[] = [];
        const duplicate: string[] = [];
        // Prima le fatture, poi le note di credito: così una nota trova la fattura dello stesso lotto.
        const ordinati = [...documenti].sort(
          (x, y) => Number(x.tipoDocumento === 'TD04') - Number(y.tipoDocumento === 'TD04'),
        );
        for (const parsed of ordinati) {
          const pref = lotto ? `${parsed.numero}: ` : '';
          // Controllo esplicito: un errore di vincolo annullerebbe tutta la transazione del lotto.
          const [esiste] = await tx
            .select({ id: fatture.id })
            .from(fatture)
            .where(
              and(
                eq(fatture.controparteId, controparteId),
                eq(fatture.direzione, direzione),
                eq(fatture.numero, parsed.numero),
                eq(fatture.dataEmissione, parsed.data),
              ),
            );
          if (esiste) {
            duplicate.push(parsed.numero);
            continue;
          }
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
              tipoDocumento: parsed.tipoDocumento,
            })
            .returning();
          avvisi.push(...parsed.avvisi.map((a) => pref + a));
          if (parsed.tipoDocumento === 'TD04') {
            // Nota di credito: niente rate, riduce le rate aperte della fattura collegata
            const collegata = await this.trovaCollegata(tx, controparteId, direzione, parsed.collegate);
            if (collegata) {
              avvisi.push(...(await this.applicaNota(tx, aziendaId, f!, collegata)).map((a) => pref + a));
            } else if (parsed.collegate.length > 0) {
              avvisi.push(
                `${pref}Fattura ${parsed.collegate.map((c) => c.numero).join(', ')} non trovata: la nota verrà abbinata quando la importi.`,
              );
            }
          } else {
            await tx.insert(scadenze).values(parsed.scadenze.map((r) => ({ ...r, aziendaId, fatturaId: f!.id })));
            if (parsed.tipoDocumento === 'TD05' && parsed.collegate.length > 0) {
              // Nota di debito: è un importo in più da incassare, con rate sue; teniamo il riferimento.
              const integrata = await this.trovaCollegata(tx, controparteId, direzione, parsed.collegate);
              if (integrata) {
                await tx.update(fatture).set({ fatturaCollegataId: integrata.id }).where(eq(fatture.id, f!.id));
                avvisi.push(`${pref}Nota di debito collegata alla fattura ${integrata.numero}.`);
              }
            }
            avvisi.push(...(await this.abbinaNoteInAttesa(tx, aziendaId, f!)).map((a) => pref + a));
          }
          importate.push(await this.load(tx, f!.id));
        }
        if (importate.length === 0) throw new ConflictException(
          lotto ? 'Tutti i documenti del lotto sono già stati registrati' : 'Questa fattura è già stata registrata',
        );
        if (duplicate.length > 0) avvisi.push(`Già registrate, saltate: ${duplicate.join(', ')}.`);
        // Le note abbinate dopo il loro inserimento vanno ricaricate per mostrare la fattura collegata.
        const fattureFinali: Fattura[] = [];
        for (const f of importate) fattureFinali.push(await this.load(tx, f.id)); // una query alla volta sulla transazione
        return { fattura: fattureFinali[0]!, fatture: fattureFinali, duplicate, ignorate, controparteCreata: creata, avvisi };
      });
    } catch (err) {
      duplicata(err);
    }
  }

  /**
   * Una nota di credito importata prima della sua fattura resta "da abbinare":
   * quando arriva la fattura indicata nei suoi riferimenti, la abbiniamo in automatico.
   */
  private async abbinaNoteInAttesa(tx: Tx, aziendaId: string, fattura: typeof fatture.$inferSelect): Promise<string[]> {
    const note = await tx
      .select()
      .from(fatture)
      .where(
        and(
          eq(fatture.controparteId, fattura.controparteId),
          eq(fatture.direzione, fattura.direzione),
          eq(fatture.tipoDocumento, 'TD04'),
          isNull(fatture.fatturaCollegataId),
          isNotNull(fatture.xmlOriginale),
        ),
      );
    const avvisi: string[] = [];
    for (const nota of note) {
      let rif: FatturaPAParsed['collegate'] = [];
      try {
        rif =
          parseFatturaPALotto(nota.xmlOriginale!).find(
            (d) => d.numero === nota.numero && d.data === nota.dataEmissione,
          )?.collegate ?? [];
      } catch {
        continue; // XML salvato non più leggibile: resta da abbinare a mano
      }
      const corrisponde = rif.some(
        (c) => c.numero === fattura.numero && (!c.data || c.data === fattura.dataEmissione),
      );
      if (!corrisponde) continue;
      const esito = await this.applicaNota(tx, aziendaId, nota, fattura);
      avvisi.push(`Nota di credito ${nota.numero} abbinata automaticamente.`, ...esito.slice(1));
    }
    return avvisi;
  }

  async remove(aziendaId: string, id: string): Promise<void> {
    await this.dbs.withTenant(aziendaId, async (tx) => {
      const deleted = await tx.delete(fatture).where(eq(fatture.id, id)).returning({ id: fatture.id });
      if (deleted.length === 0) throw new NotFoundException('Fattura non trovata');
    });
  }

  /** Abbina a mano una nota di credito a una fattura (o la sposta su un'altra). */
  async collegaNota(aziendaId: string, notaId: string, fatturaId: string): Promise<{ fattura: Fattura; avvisi: string[] }> {
    return this.dbs.withTenant(aziendaId, async (tx) => {
      const [nota] = await tx.select().from(fatture).where(eq(fatture.id, notaId));
      if (!nota) throw new NotFoundException('Nota di credito non trovata');
      if (nota.tipoDocumento !== 'TD04') throw new BadRequestException('Il documento non è una nota di credito');
      const [target] = await tx.select().from(fatture).where(eq(fatture.id, fatturaId));
      if (!target) throw new NotFoundException('Fattura non trovata');
      if (target.tipoDocumento === 'TD04') throw new BadRequestException('Non puoi collegare una nota di credito a un\'altra nota');
      if (target.controparteId !== nota.controparteId || target.direzione !== nota.direzione) {
        throw new BadRequestException('La fattura deve avere la stessa controparte e la stessa direzione della nota');
      }
      await tx.delete(pagamenti).where(eq(pagamenti.notaCreditoId, nota.id));
      const avvisi = await this.applicaNota(tx, aziendaId, nota, target);
      return { fattura: await this.load(tx, nota.id), avvisi };
    });
  }

  async registraPagamento(aziendaId: string, scadenzaId: string, input: PagamentoInput): Promise<Fattura> {
    return this.dbs.withTenant(aziendaId, async (tx) => {
      // Blocca la rata: due pagamenti in contemporanea non possono superarne l'importo.
      const [scadenza] = await tx.select().from(scadenze).where(eq(scadenze.id, scadenzaId)).for('update');
      if (!scadenza) throw new NotFoundException('Scadenza non trovata');
      const pagato = somma(
        await tx.select({ importoCents: pagamenti.importoCents }).from(pagamenti).where(eq(pagamenti.scadenzaId, scadenzaId)),
      );
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
    const applicato = await this.applicatoPerNota(tx, id);
    return toFattura(f as FatturaConScadenze, applicato.get(id));
  }

  /** Importo scalato da ciascuna nota di credito (dai pagamenti di tipo nota_credito). */
  private async applicatoPerNota(tx: Tx, notaId?: string): Promise<Map<string, number>> {
    const rows = await tx
      .select({ notaId: pagamenti.notaCreditoId, totale: sql<string>`sum(${pagamenti.importoCents})` })
      .from(pagamenti)
      .where(notaId ? eq(pagamenti.notaCreditoId, notaId) : isNotNull(pagamenti.notaCreditoId))
      .groupBy(pagamenti.notaCreditoId);
    return new Map(rows.map((r) => [r.notaId!, Number(r.totale)]));
  }

  /** Cerca la fattura rettificata tra quelle della stessa controparte e direzione. */
  private async trovaCollegata(
    tx: Tx,
    controparteId: string,
    direzione: 'attiva' | 'passiva',
    collegate: { numero: string; data: string | null }[],
  ) {
    for (const c of collegate) {
      const candidate = await tx
        .select()
        .from(fatture)
        .where(
          and(
            eq(fatture.controparteId, controparteId),
            eq(fatture.direzione, direzione),
            eq(fatture.numero, c.numero),
            ne(fatture.tipoDocumento, 'TD04'),
          ),
        );
      const esatta = candidate.find((f) => f.dataEmissione === c.data) ?? (candidate.length === 1 ? candidate[0] : undefined);
      if (esatta) return esatta;
    }
    return undefined;
  }

  /**
   * Scala l'importo della nota dalle rate aperte, partendo dall'ultima.
   * La riduzione ha effetto dalla scadenza della rata: sulla parte stornata non
   * maturano interessi di mora, perché quella somma non era dovuta.
   */
  private async applicaNota(
    tx: Tx,
    aziendaId: string,
    nota: typeof fatture.$inferSelect,
    target: typeof fatture.$inferSelect,
  ): Promise<string[]> {
    await tx.update(fatture).set({ fatturaCollegataId: target.id }).where(eq(fatture.id, nota.id));
    // Blocca le rate della fattura prima di leggerne i residui (vedi registraPagamento).
    await tx.select({ id: scadenze.id }).from(scadenze).where(eq(scadenze.fatturaId, target.id)).for('update');
    const rate = await tx.query.scadenze.findMany({
      where: eq(scadenze.fatturaId, target.id),
      orderBy: desc(scadenze.dataScadenza),
      with: { pagamenti: { columns: { importoCents: true } } },
    });
    let resto = nota.totaleCents;
    for (const r of rate) {
      if (resto <= 0) break;
      const aperto = r.importoCents - somma(r.pagamenti);
      const quota = Math.min(aperto, resto);
      if (quota <= 0) continue;
      await tx.insert(pagamenti).values({
        aziendaId,
        scadenzaId: r.id,
        data: r.dataScadenza < nota.dataEmissione ? r.dataScadenza : nota.dataEmissione,
        importoCents: quota,
        tipo: 'nota_credito',
        notaCreditoId: nota.id,
        note: `Nota di credito ${nota.numero}`,
      });
      resto -= quota;
    }
    const avvisi = [`Nota di credito applicata alla fattura ${target.numero}.`];
    if (resto > 0) {
      avvisi.push(
        `La nota supera il residuo della fattura di ${(resto / 100).toFixed(2).replace('.', ',')} €: resta un credito ${
          target.direzione === 'attiva' ? 'del cliente' : 'verso il fornitore'
        } da regolare a parte.`,
      );
    }
    return avvisi;
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
