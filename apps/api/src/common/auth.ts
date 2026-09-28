import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface SessionUser {
  utenteId: string;
  aziendaId: string;
}

export interface JwtPayload {
  sub: string;
  aid: string;
}

const IS_PUBLIC = 'isPublic';
/** Rende una rotta accessibile senza token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Guard globale: ogni rotta richiede un JWT valido, salvo quelle marcate @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Accesso richiesto');

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = { utenteId: payload.sub, aziendaId: payload.aid };
      return true;
    } catch {
      throw new UnauthorizedException('Sessione scaduta o non valida');
    }
  }
}

/** Utente e azienda della richiesta corrente. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  const req = ctx.switchToHttp().getRequest<{ user: SessionUser }>();
  return req.user;
});
