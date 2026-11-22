import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { addDays, type Assenza, type AssenzaInput, type Persona, type PersonaInput, type StatoPersona } from '@suite/shared';
import { and, asc, eq, gt, gte, inArray, lt, lte, or } from 'drizzle-orm';
import type { SessionUser } from '../common/auth';
import { DbService, type Tx } from '../db/db.service';
import { assenze, membri, personale } from '../db/schema';

const campiPersona = {
  id: personale.id,
  nome: personale.nome,
  cognome: personale.cognome,
  emailLavoro: personale.emailLavoro,
  mansione: personale.mansione,
  dataIngresso: personale.dataIngresso,
  dataUscita: personale.dataUscita,
};

const calendarioItaliano = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', dateStyle: 'short' });

function conStato(persona: Omit<Persona, 'stato'>, oggi: string): Persona {
  let stato: StatoPersona = 'attivo';
  if (persona.dataIngresso > oggi) stato = 'in_arrivo';
  if (persona.dataUscita && persona.dataUscita < oggi) stato = 'cessato';
  return { ...persona, stato };
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

      const [persona] = await tx.update(personale).set(input)
        .where(eq(personale.id, id)).returning(campiPersona);
      if (!persona) throw new NotFoundException('Persona non trovata');
      return conStato(persona, calendarioItaliano.format(new Date()));
    });
  }

  calendario(user: SessionUser, mese: string): Promise<Assenza[]> {
    const [anno, numeroMese] = mese.split('-').map(Number);
    const inizio = mese + '-01';
    const ultimoGiorno = new Date(Date.UTC(anno!, numeroMese!, 0)).getUTCDate();
    const fine = addDays(inizio, ultimoGiorno - 1);
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
