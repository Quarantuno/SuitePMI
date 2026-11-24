import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays, saldoPaghe, type Assenza, type AssenzaInput, type ContrattoLavoro, type ContrattoLavoroInput,
  type ContrattoLavoroSintesi, type Persona, type PersonaInput, type Presenza, type PresenzaInput, type ProspettoPaghe,
  type ProspettoPagheInput, type RiepilogoPaghe, type StatoPersona,
} from '@suite/shared';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { SessionUser } from '../common/auth';
import { generaProspettoPaghePdf } from './prospetto-paghe.pdf';
import { DbService, type Tx } from '../db/db.service';
import { assenze, aziende, contrattiLavoro, membri, personale, presenze, prospettiPaghe } from '../db/schema';
import { generaContrattoLavoroPdf } from './contratto-lavoro.pdf';

const campiPersona = {
  id: personale.id,
  nome: personale.nome,
  cognome: personale.cognome,
  emailLavoro: personale.emailLavoro,
  mansione: personale.mansione,
  dataIngresso: personale.dataIngresso,
  dataUscita: personale.dataUscita,
};

const sintesiContrattoLavoro = {
  id: contrattiLavoro.id,
  titolo: contrattiLavoro.titolo,
  decorrenza: contrattiLavoro.decorrenza,
};
const campiContrattoLavoro = { ...sintesiContrattoLavoro, testo: contrattiLavoro.testo };

function bozzaDellaPersona(personaId: string, id: string) {
  return and(eq(contrattiLavoro.personaId, personaId), eq(contrattiLavoro.id, id));
}

const calendarioItaliano = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', dateStyle: 'short' });

function conStato(persona: Omit<Persona, 'stato'>, oggi: string): Persona {
  let stato: StatoPersona = 'attivo';
  if (persona.dataIngresso > oggi) stato = 'in_arrivo';
  if (persona.dataUscita && persona.dataUscita < oggi) stato = 'cessato';
  return { ...persona, stato };
}

function limitiMese(mese: string) {
  const [anno, numeroMese] = mese.split('-').map(Number);
  const inizio = mese + '-01';
  const ultimoGiorno = new Date(Date.UTC(anno!, numeroMese!, 0)).getUTCDate();
  return { inizio, fine: addDays(inizio, ultimoGiorno - 1) };
}

@Injectable()
export class PersonaleService {
  constructor(private readonly db: DbService) {}

  list(user: SessionUser): Promise<Persona[]> {
    return this.perTitolari(user, async (tx) => {
      const rows = await tx.select(campiPersona).from(personale)
        .orderBy(asc(personale.cognome), asc(personale.nome), asc(personale.id));
      const oggi = calendarioItaliano.format(new Date());
      return rows.map((persona) => conStato(persona, oggi));
    });
  }

  create(user: SessionUser, input: PersonaInput): Promise<Persona> {
    return this.perTitolari(user, async (tx) => {
      const [persona] = await tx.insert(personale)
        .values({ ...input, aziendaId: user.aziendaId })
        .returning(campiPersona);
      return conStato(persona!, calendarioItaliano.format(new Date()));
    });
  }

  update(user: SessionUser, id: string, input: PersonaInput): Promise<Persona> {
    return this.perTitolari(user, async (tx) => {
      await this.bloccaPersona(tx, id);
      const [incompatibile] = await tx.select({ id: assenze.id }).from(assenze).where(and(
        eq(assenze.personaId, id),
        or(lt(assenze.dal, input.dataIngresso), input.dataUscita ? gt(assenze.al, input.dataUscita) : undefined),
      )).limit(1);
      if (incompatibile) throw new ConflictException('Le date lasciano fuori un’assenza già registrata');

      const [presenzaFuoriPeriodo] = await tx.select({ id: presenze.id }).from(presenze).where(and(
        eq(presenze.personaId, id),
        or(lt(presenze.giorno, input.dataIngresso), input.dataUscita ? gt(presenze.giorno, input.dataUscita) : undefined),
      )).limit(1);
      if (presenzaFuoriPeriodo) throw new ConflictException('Le date lasciano fuori una presenza già registrata');

      const [persona] = await tx.update(personale).set(input)
        .where(eq(personale.id, id)).returning(campiPersona);
      if (!persona) throw new NotFoundException('Persona non trovata');
      return conStato(persona, calendarioItaliano.format(new Date()));
    });
  }

  calendario(user: SessionUser, mese: string): Promise<Assenza[]> {
    const { inizio, fine } = limitiMese(mese);
    return this.perTitolari(user, (tx) => tx.select({
      id: assenze.id,
      personaId: assenze.personaId,
      tipo: assenze.tipo,
      dal: assenze.dal,
      al: assenze.al,
      persona: { nome: personale.nome, cognome: personale.cognome },
    }).from(assenze)
      .innerJoin(personale, eq(assenze.personaId, personale.id))
      .where(and(lte(assenze.dal, fine), gte(assenze.al, inizio)))
      .orderBy(asc(assenze.dal), asc(personale.cognome), asc(assenze.id)));
  }

  registraAssenza(user: SessionUser, input: AssenzaInput): Promise<Assenza> {
    return this.perTitolari(user, async (tx) => {
      const persona = await this.bloccaPersona(tx, input.personaId);
      if (input.dal < persona.dataIngresso || (persona.dataUscita && input.al > persona.dataUscita)) {
        throw new BadRequestException('L’assenza deve rientrare nelle date di ingresso e uscita');
      }
      const [sovrapposta] = await tx.select({ id: assenze.id }).from(assenze).where(and(
        eq(assenze.personaId, input.personaId),
        lte(assenze.dal, input.al),
        gte(assenze.al, input.dal),
      )).limit(1);
      if (sovrapposta) throw new ConflictException('La persona ha già un’assenza in questo periodo');

      const [presenza] = await tx.select({ id: presenze.id }).from(presenze).where(and(
        eq(presenze.personaId, input.personaId),
        gte(presenze.giorno, input.dal),
        lte(presenze.giorno, input.al),
      )).limit(1);
      if (presenza) throw new ConflictException('La persona ha già una presenza in questo periodo');

      const [creata] = await tx.insert(assenze).values({ ...input, aziendaId: user.aziendaId })
        .returning({ id: assenze.id });
      return { ...input, id: creata!.id, persona: { nome: persona.nome, cognome: persona.cognome } };
    });
  }

  rimuoviAssenza(user: SessionUser, id: string): Promise<void> {
    return this.perTitolari(user, async (tx) => {
      const [rimossa] = await tx.delete(assenze).where(eq(assenze.id, id)).returning({ id: assenze.id });
      if (!rimossa) throw new NotFoundException('Assenza non trovata');
    });
  }

  registroPresenze(user: SessionUser, mese: string): Promise<Presenza[]> {
    const { inizio, fine } = limitiMese(mese);
    return this.perTitolari(user, (tx) => tx.select({
      id: presenze.id,
      personaId: presenze.personaId,
      giorno: presenze.giorno,
      minutiOrdinari: presenze.minutiOrdinari,
      minutiStraordinari: presenze.minutiStraordinari,
      persona: { nome: personale.nome, cognome: personale.cognome },
    }).from(presenze)
      .innerJoin(personale, eq(presenze.personaId, personale.id))
      .where(and(gte(presenze.giorno, inizio), lte(presenze.giorno, fine)))
      .orderBy(asc(presenze.giorno), asc(personale.cognome), asc(personale.nome), asc(presenze.id)));
  }

  salvaPresenza(user: SessionUser, input: PresenzaInput, id?: string): Promise<Presenza> {
    return this.perTitolari(user, async (tx) => {
      const { personaId, giorno, ...durata } = input;
      const persona = await this.bloccaPersona(tx, personaId);
      if (giorno < persona.dataIngresso || (persona.dataUscita && giorno > persona.dataUscita)) {
        throw new BadRequestException('La presenza deve rientrare nelle date di ingresso e uscita');
      }

      const [assenza] = await tx.select({ id: assenze.id }).from(assenze).where(and(
        eq(assenze.personaId, personaId), lte(assenze.dal, giorno), gte(assenze.al, giorno),
      )).limit(1);
      if (assenza) throw new ConflictException('La persona ha già un’assenza per questa giornata');

      const [salvata] = id
        ? await tx.update(presenze).set(durata).where(and(
          eq(presenze.id, id), eq(presenze.personaId, personaId), eq(presenze.giorno, giorno),
        )).returning({ id: presenze.id })
        : await tx.insert(presenze).values({ ...input, aziendaId: user.aziendaId })
          .onConflictDoNothing({ target: [presenze.aziendaId, presenze.giorno, presenze.personaId] })
          .returning({ id: presenze.id });
      if (!salvata) {
        if (id) throw new NotFoundException('Presenza non trovata per la persona e la data indicate');
        throw new ConflictException('La persona ha già una presenza per questa giornata. Modificala dal registro.');
      }

      return { ...input, id: salvata.id, persona: { nome: persona.nome, cognome: persona.cognome } };
    });
  }

  rimuoviPresenza(user: SessionUser, id: string): Promise<void> {
    return this.perTitolari(user, async (tx) => {
      const [rimossa] = await tx.delete(presenze).where(eq(presenze.id, id)).returning({ id: presenze.id });
      if (!rimossa) throw new NotFoundException('Presenza non trovata');
    });
  }

  riepilogoPaghe(user: SessionUser, mese: string): Promise<RiepilogoPaghe[]> {
    const { inizio, fine } = limitiMese(mese);
    return this.perTitolari(user, (tx) => {
      const ore = tx.select({
        personaId: presenze.personaId,
        giorni: sql`count(*)`.as('giorni'),
        ordinari: sql`sum(${presenze.minutiOrdinari})`.as('ordinari'),
        straordinari: sql`sum(${presenze.minutiStraordinari})`.as('straordinari'),
      }).from(presenze)
        .where(and(gte(presenze.giorno, inizio), lte(presenze.giorno, fine)))
        .groupBy(presenze.personaId)
        .as('ore_mese');

      const giorniNelMese = sql`least(${assenze.al}, ${fine}::date) - greatest(${assenze.dal}, ${inizio}::date) + 1`;
      const assenzeMese = tx.select({
        personaId: assenze.personaId,
        ferie: sql`sum(${giorniNelMese}) filter (where ${assenze.tipo} = 'ferie')`.as('ferie'),
        permessi: sql`sum(${giorniNelMese}) filter (where ${assenze.tipo} = 'permesso')`.as('permessi'),
      }).from(assenze)
        .where(and(lte(assenze.dal, fine), gte(assenze.al, inizio)))
        .groupBy(assenze.personaId)
        .as('assenze_mese');

      return tx.select({
        personaId: personale.id,
        persona: {
          nome: personale.nome, cognome: personale.cognome, mansione: personale.mansione,
          dataIngresso: personale.dataIngresso, dataUscita: personale.dataUscita,
        },
        giorniConPresenza: sql`coalesce(${ore.giorni}, 0)`.mapWith(Number),
        minutiOrdinari: sql`coalesce(${ore.ordinari}, 0)`.mapWith(Number),
        minutiStraordinari: sql`coalesce(${ore.straordinari}, 0)`.mapWith(Number),
        giorniFerie: sql`coalesce(${assenzeMese.ferie}, 0)`.mapWith(Number),
        giorniPermesso: sql`coalesce(${assenzeMese.permessi}, 0)`.mapWith(Number),
      }).from(personale)
        .leftJoin(ore, eq(ore.personaId, personale.id))
        .leftJoin(assenzeMese, eq(assenzeMese.personaId, personale.id))
        .where(and(lte(personale.dataIngresso, fine), or(isNull(personale.dataUscita), gte(personale.dataUscita, inizio))))
        .orderBy(asc(personale.cognome), asc(personale.nome), asc(personale.id));
    });
  }

  prospetti(user: SessionUser, mese: string): Promise<ProspettoPaghe[]> {
    return this.perTitolari(user, async (tx) => {
      const righe = await tx.select({
        prospetto: prospettiPaghe,
        persona: { nome: personale.nome, cognome: personale.cognome, mansione: personale.mansione },
      }).from(prospettiPaghe)
        .innerJoin(personale, eq(prospettiPaghe.personaId, personale.id))
        .where(eq(prospettiPaghe.mese, mese))
        .orderBy(asc(personale.cognome), asc(personale.nome), asc(personale.id));
      return righe.map(({ prospetto: { aziendaId: _aziendaId, ...dati }, persona }) =>
        ({ ...dati, persona, saldoCents: saldoPaghe(dati) }));
    });
  }

  salvaProspetto(user: SessionUser, input: ProspettoPagheInput): Promise<ProspettoPaghe> {
    return this.perTitolari(user, async (tx) => {
      const persona = await tx.query.personale.findFirst({
        columns: { nome: true, cognome: true, mansione: true },
        where: eq(personale.id, input.personaId),
      });
      if (!persona) throw new NotFoundException('Persona non trovata');
      const { personaId, mese, ...movimenti } = input;
      const [prospetto] = await tx.insert(prospettiPaghe).values({ aziendaId: user.aziendaId, ...input })
        .onConflictDoUpdate({
          target: [prospettiPaghe.aziendaId, prospettiPaghe.mese, prospettiPaghe.personaId],
          set: movimenti,
        }).returning({ id: prospettiPaghe.id });
      return { ...input, id: prospetto!.id, persona, saldoCents: saldoPaghe(input) };
    });
  }

  async pdfProspetto(user: SessionUser, id: string): Promise<Buffer> {
    const dati = await this.perTitolari(user, async (tx) => {
      const [riga] = await tx.select({
        prospetto: prospettiPaghe,
        persona: { nome: personale.nome, cognome: personale.cognome, mansione: personale.mansione },
        azienda: { ragioneSociale: aziende.ragioneSociale },
      }).from(prospettiPaghe)
        .innerJoin(personale, eq(prospettiPaghe.personaId, personale.id))
        .innerJoin(aziende, eq(prospettiPaghe.aziendaId, aziende.id))
        .where(eq(prospettiPaghe.id, id));
      if (!riga) throw new NotFoundException('Prospetto non trovato');
      return riga;
    });
    return generaProspettoPaghePdf({ ...dati.prospetto, persona: dati.persona, saldoCents: saldoPaghe(dati.prospetto) },
      dati.azienda.ragioneSociale);
  }

  contrattiLavoro(user: SessionUser, personaId: string): Promise<ContrattoLavoroSintesi[]> {
    return this.perTitolari(user, async (tx) => {
      const persona = await tx.query.personale.findFirst({ where: eq(personale.id, personaId), columns: { id: true } });
      if (!persona) throw new NotFoundException('Persona non trovata');
      return tx.select(sintesiContrattoLavoro).from(contrattiLavoro)
        .where(eq(contrattiLavoro.personaId, personaId))
        .orderBy(desc(contrattiLavoro.decorrenza), asc(contrattiLavoro.titolo), asc(contrattiLavoro.id));
    });
  }

  creaContrattoLavoro(user: SessionUser, personaId: string, input: ContrattoLavoroInput): Promise<ContrattoLavoro> {
    return this.perTitolari(user, async (tx) => {
      await this.bloccaPersona(tx, personaId);
      const [bozza] = await tx.insert(contrattiLavoro)
        .values({ ...input, aziendaId: user.aziendaId, personaId }).returning(campiContrattoLavoro);
      return bozza!;
    });
  }

  leggiContrattoLavoro(user: SessionUser, personaId: string, id: string): Promise<ContrattoLavoro> {
    return this.perTitolari(user, async (tx) => {
      const [bozza] = await tx.select(campiContrattoLavoro).from(contrattiLavoro)
        .where(bozzaDellaPersona(personaId, id));
      if (!bozza) throw new NotFoundException('Bozza non trovata');
      return bozza;
    });
  }

  aggiornaContrattoLavoro(user: SessionUser, personaId: string, id: string, input: ContrattoLavoroInput): Promise<ContrattoLavoro> {
    return this.perTitolari(user, async (tx) => {
      const [bozza] = await tx.update(contrattiLavoro).set(input)
        .where(bozzaDellaPersona(personaId, id)).returning(campiContrattoLavoro);
      if (!bozza) throw new NotFoundException('Bozza non trovata');
      return bozza;
    });
  }

  rimuoviContrattoLavoro(user: SessionUser, personaId: string, id: string): Promise<void> {
    return this.perTitolari(user, async (tx) => {
      const [bozza] = await tx.delete(contrattiLavoro)
        .where(bozzaDellaPersona(personaId, id)).returning({ id: contrattiLavoro.id });
      if (!bozza) throw new NotFoundException('Bozza non trovata');
    });
  }

  async pdfContrattoLavoro(user: SessionUser, personaId: string, id: string): Promise<Buffer> {
    const dati = await this.perTitolari(user, async (tx) => {
      const [riga] = await tx.select({
        ...campiContrattoLavoro,
        persona: { nome: personale.nome, cognome: personale.cognome, mansione: personale.mansione },
        azienda: { ragioneSociale: aziende.ragioneSociale, partitaIva: aziende.partitaIva, indirizzo: aziende.indirizzo },
      }).from(contrattiLavoro)
        .innerJoin(personale, eq(contrattiLavoro.personaId, personale.id))
        .innerJoin(aziende, eq(contrattiLavoro.aziendaId, aziende.id))
        .where(bozzaDellaPersona(personaId, id));
      if (!riga) throw new NotFoundException('Bozza non trovata');
      return riga;
    });

    return generaContrattoLavoroPdf(dati);
  }

  private async bloccaPersona(tx: Tx, id: string) {
    const [persona] = await tx.select(campiPersona).from(personale).where(eq(personale.id, id)).for('update');
    if (!persona) throw new NotFoundException('Persona non trovata');
    return persona;
  }

  private perTitolari<T>(user: SessionUser, operazione: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.withTenant(user.aziendaId, async (tx) => {
      const [membro] = await tx.select({ ruolo: membri.ruolo }).from(membri)
        .where(and(
          eq(membri.aziendaId, user.aziendaId),
          eq(membri.utenteId, user.utenteId),
          inArray(membri.ruolo, ['titolare', 'admin']),
        ));
      if (!membro) throw new ForbiddenException('La gestione del personale è riservata agli amministratori');
      return operazione(tx);
    });
  }
}
