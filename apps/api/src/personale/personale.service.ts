import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Persona, PersonaInput, StatoPersona } from '@suite/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { SessionUser } from '../common/auth';
import { DbService, type Tx } from '../db/db.service';
import { membri, personale } from '../db/schema';

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
      const [persona] = await tx.update(personale).set(input)
        .where(eq(personale.id, id)).returning(campiPersona);
      if (!persona) throw new NotFoundException('Persona non trovata');
      return conStato(persona, calendarioItaliano.format(new Date()));
    });
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
