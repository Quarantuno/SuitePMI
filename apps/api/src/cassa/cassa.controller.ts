import { Controller, Get, Query } from '@nestjs/common';
import { previsioneQuerySchema, type PrevisioneQuery } from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { CassaService } from './cassa.service';

@Controller('cassa')
export class CassaController {
  constructor(private readonly service: CassaService) {}

  /** GET /api/cassa/previsione?settimane=13&includiCreditiScaduti=false */
  @Get('previsione')
  previsione(@CurrentUser() user: SessionUser, @Query(new ZodPipe(previsioneQuerySchema)) q: PrevisioneQuery) {
    return this.service.previsione(user.aziendaId, q);
  }
}
