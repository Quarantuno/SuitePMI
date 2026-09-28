import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type { AuthResponse, LoginInput, RegisterInput } from '@suite/shared';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { JwtPayload, SessionUser } from '../common/auth';
import { pgErrorCode, UNIQUE_VIOLATION } from '../common/pg-errors';
import { DbService } from '../db/db.service';
import { aziende, membri, utenti } from '../db/schema';

@Injectable()
export class AuthService {
  /** Hash di una password casuale: serve solo a uniformare i tempi del login. */
  private readonly dummyHash = hash(randomUUID());

  constructor(
    private readonly dbs: DbService,
    private readonly jwt: JwtService,
  ) {}

  /** Crea utente e azienda insieme: chi si registra diventa titolare. */
  async register(input: RegisterInput): Promise<AuthResponse> {
    const passwordHash = await hash(input.password);
    try {
      const { utente, azienda } = await this.dbs.db.transaction(async (tx) => {
        const [utente] = await tx
          .insert(utenti)
          .values({ email: input.email, passwordHash, nome: input.nome })
          .returning();
        const [azienda] = await tx
          .insert(aziende)
          .values({ ragioneSociale: input.ragioneSociale, partitaIva: input.partitaIva })
          .returning();
        await tx.insert(membri).values({ aziendaId: azienda!.id, utenteId: utente!.id, ruolo: 'titolare' });
        return { utente: utente!, azienda: azienda! };
      });
      return this.session(utente, azienda);
    } catch (err) {
      if (pgErrorCode(err) === UNIQUE_VIOLATION) {
        throw new ConflictException('Email o partita IVA gia registrate');
      }
      throw err;
    }
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const [utente] = await this.dbs.db.select().from(utenti).where(eq(utenti.email, input.email));
    // Verifichiamo sempre un hash per non rivelare, dai tempi di risposta, se l'email esiste.
    const ok = utente
      ? await verify(utente.passwordHash, input.password)
      : await verify(await this.dummyHash, input.password).then(() => false);
    if (!utente || !ok) throw new UnauthorizedException('Email o password errate');

    const [membro] = await this.dbs.db
      .select({ azienda: aziende })
      .from(membri)
      .innerJoin(aziende, eq(aziende.id, membri.aziendaId))
      .where(eq(membri.utenteId, utente.id))
      .orderBy(asc(membri.createdAt))
      .limit(1);
    if (!membro) throw new UnauthorizedException("L'utente non appartiene a nessuna azienda");

    return this.session(utente, membro.azienda);
  }

  async me(user: SessionUser): Promise<Omit<AuthResponse, 'token'>> {
    const [row] = await this.dbs.db
      .select({ utente: utenti, azienda: aziende })
      .from(membri)
      .innerJoin(utenti, eq(utenti.id, membri.utenteId))
      .innerJoin(aziende, eq(aziende.id, membri.aziendaId))
      .where(and(eq(membri.utenteId, user.utenteId), eq(membri.aziendaId, user.aziendaId)));
    if (!row) throw new NotFoundException();
    return {
      utente: { id: row.utente.id, email: row.utente.email, nome: row.utente.nome },
      azienda: { id: row.azienda.id, ragioneSociale: row.azienda.ragioneSociale, partitaIva: row.azienda.partitaIva },
    };
  }

  private async session(
    utente: typeof utenti.$inferSelect,
    azienda: typeof aziende.$inferSelect,
  ): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: utente.id, aid: azienda.id };
    return {
      token: await this.jwt.signAsync(payload),
      utente: { id: utente.id, email: utente.email, nome: utente.nome },
      azienda: { id: azienda.id, ragioneSociale: azienda.ragioneSociale, partitaIva: azienda.partitaIva },
    };
  }
}
