import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  decidiSollecitoAutomatico,
  todayIso,
  type EsitoSollecitiAuto,
  type IsoDate,
  type LivelloSollecito,
  type PianoSollecitiAuto,
} from '@suite/shared';
import { and, asc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { SessionUser } from '../common/auth';
import { DbService } from '../db/db.service';
import { aziende, controparti, membri, solleciti } from '../db/schema';
import { IncassiService } from '../incassi/incassi.service';
import { Mailer } from './mailer';
import { SollecitiService } from './solleciti.service';

/**
 * Giro giornaliero dei solleciti automatici. Le regole (attese, livello massimo,
 * diffida solo via PEC) sono in decidiSollecitoAutomatico di @suite/shared.
 */
@Injectable()
export class SollecitiAutoService {
  private readonly log = new Logger('SollecitiAuto');
  /** Aziende con un giro in corso in questo processo: evita doppi invii da "Esegui ora" + scheduler. */
  private readonly inCorso = new Set<string>();

  constructor(
    private readonly dbs: DbService,
    private readonly incassi: IncassiService,
    private readonly solleciti: SollecitiService,
    private readonly mailer: Mailer,
  ) {}

  /** Cosa farebbe il giro di oggi, cliente per cliente (senza inviare nulla). */
  async piano(aziendaId: string, oggi: IsoDate = todayIso()): Promise<PianoSollecitiAuto> {
    const [azienda] = await this.dbs.db.select().from(aziende).where(eq(aziende.id, aziendaId));
    if (!azienda) throw new NotFoundException('Azienda non trovata');

    const crediti = await this.incassi.creditiScaduti(aziendaId, oggi);
    const perCliente = new Map<string, { denominazione: string; scadutoCents: number; giorniRitardoMax: number }>();
    for (const r of crediti.righe) {
      if (r.stato !== 'scaduto') continue;
      const c = perCliente.get(r.controparte.id) ?? { denominazione: r.controparte.denominazione, scadutoCents: 0, giorniRitardoMax: 0 };
      c.scadutoCents += r.residuoCents;
      c.giorniRitardoMax = Math.max(c.giorniRitardoMax, r.giorniRitardo);
      perCliente.set(r.controparte.id, c);
    }
    const ids = [...perCliente.keys()];
    if (ids.length === 0) return { data: oggi, attivi: azienda.sollecitiAutoAttivi, righe: [] };

    const { anagrafiche, storico } = await this.dbs.withTenant(aziendaId, async (tx) => ({
      anagrafiche: await tx.select().from(controparti).where(inArray(controparti.id, ids)),
      storico: await tx
        .select({ controparteId: solleciti.controparteId, livello: solleciti.livello, inviatoIl: solleciti.inviatoIl })
        .from(solleciti)
        .where(and(inArray(solleciti.controparteId, ids), eq(solleciti.stato, 'inviato'))),
    }));
    const pecDisponibile = this.mailer.pecDisponibile();

    const righe = anagrafiche.map((c) => {
      const dati = perCliente.get(c.id)!;
      const base = { controparte: { id: c.id, denominazione: c.denominazione }, ...dati, escluso: !c.sollecitiAutomatici };
      if (!c.sollecitiAutomatici) {
        return { ...base, decisione: { azione: 'salta' as const, livello: null, motivo: 'Cliente escluso dai solleciti automatici.' } };
      }
      const decisione = decidiSollecitoAutomatico({
        storico: storico
          .filter((s) => s.controparteId === c.id && s.inviatoIl)
          .map((s) => ({ livello: s.livello as LivelloSollecito, inviatoIl: s.inviatoIl! })),
        oggi,
        giorniRitardoMax: dati.giorniRitardoMax,
        impostazioni: { giorniPrimoContatto: azienda.sollecitiAutoGiorni, livelloMassimo: azienda.sollecitiAutoLivelloMax },
        contatti: { email: c.email, pec: c.pec },
        pecDisponibile,
      });
      return { ...base, decisione };
    });
    righe.sort((a, b) => b.giorniRitardoMax - a.giorniRitardoMax);
    return { data: oggi, attivi: azienda.sollecitiAutoAttivi, righe };
  }

  /** Esegue il giro per un'azienda: prepara e invia i solleciti decisi dal piano. */
  async esegui(aziendaId: string, oggi: IsoDate = todayIso()): Promise<EsitoSollecitiAuto> {
    if (this.inCorso.has(aziendaId)) throw new ConflictException('Un giro di solleciti automatici è già in corso');
    this.inCorso.add(aziendaId);
    try {
      const piano = await this.piano(aziendaId, oggi);
      if (!piano.attivi) throw new BadRequestException('Attiva prima i solleciti automatici nelle Impostazioni');
      const user = await this.firmatario(aziendaId);
      const esito: EsitoSollecitiAuto = { data: oggi, inviati: [], errori: [] };

      for (const riga of piano.righe) {
        const d = riga.decisione;
        if (d.azione !== 'invia') continue;
        let bozzaId: string | null = null;
        try {
          const ant = await this.solleciti.anteprima(user, { controparteId: riga.controparte.id, livello: d.livello, alla: oggi });
          const bozza = await this.solleciti.create(
            user,
            { controparteId: riga.controparte.id, livello: d.livello, alla: oggi, oggetto: ant.oggetto, testo: ant.testo },
            { automatico: true },
          );
          bozzaId = bozza.id;
          esito.inviati.push(await this.solleciti.invia(user, bozza.id, { canale: d.canale, destinatario: d.destinatario }));
        } catch (err) {
          // Una bozza non inviata non deve restare a metà: la togliamo, il giro di domani riproverà.
          if (bozzaId) await this.solleciti.remove(user, bozzaId).catch(() => undefined);
          const msg = (err as Error).message;
          // Gli errori dell'API (es. dati mancanti) sono già leggibili; quelli del server di posta no.
          esito.errori.push({ controparte: riga.controparte, messaggio: err instanceof HttpException ? msg : `Invio non riuscito: ${msg}` });
        }
      }
      await this.dbs.db.update(aziende).set({ sollecitiAutoUltimaEsecuzione: oggi }).where(eq(aziende.id, aziendaId));
      return esito;
    } finally {
      this.inCorso.delete(aziendaId);
    }
  }

  /**
   * Giro di tutte le aziende con i solleciti automatici attivi e non ancora eseguiti oggi.
   * L'UPDATE ... RETURNING "prenota" il giorno: due istanze dell'API non eseguono la stessa azienda.
   */
  async eseguiTutte(oggi: IsoDate): Promise<number> {
    const prenotate = await this.dbs.db
      .update(aziende)
      .set({ sollecitiAutoUltimaEsecuzione: oggi })
      .where(
        and(
          eq(aziende.sollecitiAutoAttivi, true),
          or(isNull(aziende.sollecitiAutoUltimaEsecuzione), lt(aziende.sollecitiAutoUltimaEsecuzione, oggi)),
        ),
      )
      .returning({ id: aziende.id });
    for (const { id } of prenotate) {
      try {
        const esito = await this.esegui(id, oggi);
        this.log.log(`Azienda ${id}: ${esito.inviati.length} inviati, ${esito.errori.length} errori`);
      } catch (err) {
        this.log.error(`Azienda ${id}: ${(err as Error).message}`);
      }
    }
    return prenotate.length;
  }

  /** I solleciti automatici sono firmati dal titolare dell'azienda. */
  private async firmatario(aziendaId: string): Promise<SessionUser> {
    const membriAzienda = await this.dbs.db
      .select({ utenteId: membri.utenteId, ruolo: membri.ruolo })
      .from(membri)
      .where(eq(membri.aziendaId, aziendaId))
      .orderBy(asc(membri.createdAt));
    const m = membriAzienda.find((x) => x.ruolo === 'titolare') ?? membriAzienda[0];
    if (!m) throw new BadRequestException("L'azienda non ha utenti a cui intestare i solleciti");
    return { utenteId: m.utenteId, aziendaId };
  }
}
