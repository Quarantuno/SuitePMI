import { Controller, Get, Query } from '@nestjs/common';
import { creditiQuerySchema } from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { IncassiService } from './incassi.service';

@Controller('incassi')
export class IncassiController {
  constructor(private readonly service: IncassiService) {}

  /** GET /api/incassi/crediti-scaduti?alla=2026-09-27 */
  @Get('crediti-scaduti')
  creditiScaduti(
    @CurrentUser() user: SessionUser,
    @Query(new ZodPipe(creditiQuerySchema)) query: { alla?: string },
  ) {
    return this.service.creditiScaduti(user.aziendaId, query.alla);
  }
}
