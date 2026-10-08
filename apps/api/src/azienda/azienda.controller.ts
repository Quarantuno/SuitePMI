import { Body, Controller, Get, Patch } from '@nestjs/common';
import { aziendaUpdateSchema, type AziendaUpdateInput } from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { AziendaService } from './azienda.service';

@Controller('azienda')
export class AziendaController {
  constructor(private readonly service: AziendaService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.service.get(user.aziendaId);
  }

  @Patch()
  update(@CurrentUser() user: SessionUser, @Body(new ZodPipe(aziendaUpdateSchema)) body: AziendaUpdateInput) {
    return this.service.update(user.aziendaId, body);
  }
}
