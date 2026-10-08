import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  generaSollecito,
  SollecitoVuotoError,
  suggerisciLivello,
  todayIso,
  type AnteprimaSollecito,
  type LivelloSollecito,
  type Sollecito,
  type SollecitoAnteprimaInput,
  type SollecitoCreateInput,
  type SollecitoInviaInput,
  type TestoSollecito,
} from '@suite/shared';
import { and, desc, eq } from 'drizzle-orm';
import { AziendaService } from '../azienda/azienda.service';
import type { SessionUser } from '../common/auth';
import { ContropartiService } from '../controparti/controparti.service';
import { DbService, type Tx } from '../db/db.service';
import { controparti, solleciti, utenti } from '../db/schema';
import { IncassiService } from '../incassi/incassi.service';
import { lettera } from './lettera.pdf';
import { Mailer } from './mailer';

type Row = typeof solleciti.$inferSelect & { controparte: { id: string; denominazione: string } };

function toSollecito(r: Row): Sollecito {
  return {
    id: r.id,
    controparte: r.controparte,
    livello: r.livello,
    stato: r.stato,
    alla: r.alla,
    oggetto: r.oggetto,
    testo: r.testo,
    capitaleCents: r.capitaleCents,
    interessiCents: r.interessiCents,
    indennizziCents: r.indennizziCents,
    totaleCents: r.totaleCents,
    canale: r.canale,
    destinatario: r.destinatario,
    inviatoIl: r.inviatoIl,
    createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class SollecitiService {
  constructor(
    private readonly dbs: DbService,
    private readonly incassi: IncassiService,
    private readonly azienda: AziendaService,
    private readonly controparti: ContropartiService,
    private readonly mailer: Mailer,
  ) {}

  /** Genera il testo proposto senza salvarlo. */
  async anteprima(user: SessionUser, input: SollecitoAnteprimaInput): Promise<AnteprimaSollecito> {
    const alla = input.alla ?? todayIso();
    const ctx = await this.contesto(user, input.controparteId, alla);
    const suggerito = suggerisciLivello(ctx.storico, todayIso(), ctx.giorniRitardoMax);
    const livello = input.livello ?? suggerito.livello;
    const t = this.genera(ctx, livello, alla);

    const avvisi: string[] = [];
    if (!ctx.mittente.iban) avvisi.push("Manca l'IBAN della tua azienda: aggiungilo in Impostazioni per indicare dove pagare.");
    if (!ctx.mittente.pec && livello === 'diffida') avvisi.push('Manca la PEC della tua azienda nelle Impostazioni.');
    if (livello === 'diffida' && !ctx.controparte.pec) {
      avvisi.push('Il cliente non ha una PEC in anagrafica: la diffida ha valore probatorio se inviata via PEC o raccomandata A/R.');
    }
    if (!ctx.controparte.partitaIva) {
      avvisi.push('Controparte senza partita IVA: trattata come consumatore, senza interessi del d.lgs. 231/2002.');
    }

    return {
      controparte: {
        id: ctx.controparte.id,
        denominazione: ctx.controparte.denominazione,
        email: ctx.controparte.email,
        pec: ctx.controparte.pec,
      },
      livello,
      suggerito,
      alla,
      oggetto: t.oggetto,
      testo: t.testo,
      capitaleCents: t.capitaleCents,
      interessiCents: t.interessiCents,
      indennizziCents: t.indennizziCents,
      totaleCents: t.totaleCents,
      avvisi,
    };
  }

  /** Salva una bozza con il testo (eventualmente modificato) e la fotografia degli importi. */
  async create(user: SessionUser, input: SollecitoCreateInput): Promise<Sollecito> {
    const ctx = await this.contesto(user, input.controparteId, input.alla);
    const t = this.genera(ctx, input.livello, input.alla);
    return this.dbs.withTenant(user.aziendaId, async (tx) => {
      const [row] = await tx
        .insert(solleciti)
        .values({
          aziendaId: user.aziendaId,
          controparteId: input.controparteId,
          livello: input.livello,
          alla: input.alla,
          oggetto: input.oggetto,
          testo: input.testo,
          capitaleCents: t.capitaleCents,
          interessiCents: t.interessiCents,
          indennizziCents: t.indennizziCents,
          totaleCents: t.totaleCents,
          scadenzeIds: t.righe.map((r) => r.scadenzaId),
          creatoDa: user.utenteId,
        })
        .returning({ id: solleciti.id });
      return this.load(tx, row!.id);
    });
  }

  list(user: SessionUser, controparteId?: string): Promise<Sollecito[]> {
    return this.dbs.withTenant(user.aziendaId, async (tx) => {
      const rows = await tx.query.solleciti.findMany({
        where: controparteId ? eq(solleciti.controparteId, controparteId) : undefined,
        orderBy: [desc(solleciti.createdAt)],
        with: { controparte: { columns: { id: true, denominazione: true } } },
      });
      return rows.map(toSollecito);
    });
  }

  get(user: SessionUser, id: string): Promise<Sollecito> {
    return this.dbs.withTenant(user.aziendaId, (tx) => this.load(tx, id));
  }

  async remove(user: SessionUser, id: string): Promise<void> {
    await this.dbs.withTenant(user.aziendaId, async (tx) => {
      const s = await this.load(tx, id);
      if (s.stato !== 'bozza') throw new ConflictException('Un sollecito inviato non si può eliminare: resta nello storico');
      await tx.delete(solleciti).where(eq(solleciti.id, id));
    });
  }

  async pdf(user: SessionUser, id: string): Promise<{ filename: string; content: Buffer }> {
    const s = await this.get(user, id);
    return { filename: this.nomeFile(s), content: await this.renderPdf(user, s) };
  }

  /**
   * Invia via email o PEC (con la lettera in PDF allegata) oppure registra un invio
   * fatto fuori dall'app (raccomandata, PEC dal proprio gestore...).
   */
  async invia(user: SessionUser, id: string, input: SollecitoInviaInput): Promise<Sollecito> {
    const s = await this.get(user, id);
    if (s.stato === 'inviato') throw new ConflictException('Sollecito già inviato');

    let destinatario = input.destinatario ?? null;
    let inviatoIl = todayIso();

    if (input.canale === 'manuale') {
      inviatoIl = input.inviatoIl ?? inviatoIl;
    } else {
      if (input.canale === 'pec' && !this.mailer.pecDisponibile()) {
        throw new BadRequestException(
          'Invio PEC non configurato sul server: inviala dalla tua casella PEC e poi segna il sollecito come inviato.',
        );
      }
      const controparte = await this.dbs.withTenant(user.aziendaId, (tx) => this.controparti.find(tx, s.controparte.id));
      destinatario ??= input.canale === 'pec' ? controparte.pec : controparte.email;
      if (!destinatario) {
        throw new BadRequestException(
          `Il cliente non ha ${input.canale === 'pec' ? 'una PEC' : "un'email"} in anagrafica: indica il destinatario.`,
        );
      }
      const mittente = await this.azienda.get(user.aziendaId);
      const pdf = await this.renderPdf(user, s);
      await this.mailer.send({
        canale: input.canale,
        to: destinatario,
        replyTo: (input.canale === 'pec' ? mittente.pec : mittente.email) ?? mittente.email ?? undefined,
        subject: s.oggetto,
        text: s.testo,
        attachments: [{ filename: this.nomeFile(s), content: pdf, contentType: 'application/pdf' }],
      });
    }

    return this.dbs.withTenant(user.aziendaId, async (tx) => {
      await tx
        .update(solleciti)
        .set({ stato: 'inviato', canale: input.canale, destinatario, inviatoIl })
        .where(and(eq(solleciti.id, id), eq(solleciti.stato, 'bozza')));
      return this.load(tx, id);
    });
  }

  // --- interni ---------------------------------------------------------------

  private async contesto(user: SessionUser, controparteId: string, alla: string) {
    const [mittente, crediti, dati] = await Promise.all([
      this.azienda.get(user.aziendaId),
      this.incassi.creditiScaduti(user.aziendaId, alla, controparteId),
      this.dbs.withTenant(user.aziendaId, async (tx) => {
        const controparte = await this.controparti.find(tx, controparteId);
        const storico = await tx
          .select({ livello: solleciti.livello, inviatoIl: solleciti.inviatoIl })
          .from(solleciti)
          .where(and(eq(solleciti.controparteId, controparteId), eq(solleciti.stato, 'inviato')));
        const [utente] = await tx.select({ nome: utenti.nome }).from(utenti).where(eq(utenti.id, user.utenteId));
        return { controparte, storico, firmatario: utente?.nome ?? '' };
      }),
    ]);
    return {
      mittente,
      righe: crediti.righe,
      giorniRitardoMax: Math.max(0, ...crediti.righe.filter((r) => r.stato === 'scaduto').map((r) => r.giorniRitardo)),
      controparte: dati.controparte,
      storico: dati.storico.filter((s): s is { livello: LivelloSollecito; inviatoIl: string } => s.inviatoIl !== null),
      firmatario: dati.firmatario,
    };
  }

  private genera(ctx: Awaited<ReturnType<SollecitiService['contesto']>>, livello: LivelloSollecito, alla: string): TestoSollecito {
    try {
      return generaSollecito({
        livello,
        alla,
        mittente: ctx.mittente,
        destinatario: ctx.controparte,
        righe: ctx.righe,
        firmatario: ctx.firmatario,
        precedenti: ctx.storico.length,
      });
    } catch (err) {
      if (err instanceof SollecitoVuotoError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private async renderPdf(user: SessionUser, s: Sollecito): Promise<Buffer> {
    const mittente = await this.azienda.get(user.aziendaId);
    const controparte = await this.dbs.withTenant(user.aziendaId, (tx) =>
      tx.select().from(controparti).where(eq(controparti.id, s.controparte.id)).then((r) => r[0]),
    );
    if (!controparte) throw new NotFoundException('Controparte non trovata');
    return lettera({
      mittente,
      destinatario: controparte,
      data: s.inviatoIl ?? todayIso(),
      oggetto: s.oggetto,
      testo: s.testo,
      modalitaInvio: s.livello === 'diffida' ? (s.canale === 'manuale' ? undefined : 'A mezzo PEC') : undefined,
    });
  }

  private nomeFile(s: Sollecito): string {
    const nome = s.controparte.denominazione.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return `${s.livello}-${nome}-${s.alla}.pdf`;
  }

  private async load(tx: Tx, id: string): Promise<Sollecito> {
    const row = await tx.query.solleciti.findFirst({
      where: eq(solleciti.id, id),
      with: { controparte: { columns: { id: true, denominazione: true } } },
    });
    if (!row) throw new NotFoundException('Sollecito non trovato');
    return toSollecito(row);
  }
}
