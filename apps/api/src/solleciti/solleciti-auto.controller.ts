import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, type SessionUser } from '../common/auth';
import { SollecitiAutoService } from './solleciti-auto.service';

@Controller('solleciti/automatici')
export class SollecitiAutoController {
  constructor(private readonly auto: SollecitiAutoService) {}

  /** Cosa partirebbe oggi, cliente per cliente. */
  @Get('piano')
  piano(@CurrentUser() user: SessionUser) {
    return this.auto.piano(user.aziendaId);
  }

  /** Esegue subito il giro di oggi (lo stesso che parte da solo ogni mattina). */
  @Post('esegui')
  @HttpCode(200)
  esegui(@CurrentUser() user: SessionUser) {
    return this.auto.esegui(user.aziendaId);
  }
}
