import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, StreamableFile } from '@nestjs/common';
import { contrattoSchema, type ContrattoInput } from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { ContrattiService } from './contratti.service';

@Controller('commesse/:commessaId/contratti')
export class ContrattiController {
  constructor(private readonly service: ContrattiService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Param('commessaId', ParseUUIDPipe) commessa: string) {
    return this.service.list(user.aziendaId, commessa);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('commessaId', ParseUUIDPipe) commessa: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user.aziendaId, commessa, id);
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser, @Param('commessaId', ParseUUIDPipe) commessa: string,
    @Body(new ZodPipe(contrattoSchema)) input: ContrattoInput,
  ) {
    return this.service.create(user.aziendaId, commessa, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: SessionUser, @Param('commessaId', ParseUUIDPipe) commessa: string, @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(contrattoSchema)) input: ContrattoInput,
  ) {
    return this.service.update(user.aziendaId, commessa, id, input);
  }

  @Get(':id/pdf')
  async pdf(@CurrentUser() user: SessionUser, @Param('commessaId', ParseUUIDPipe) commessa: string, @Param('id', ParseUUIDPipe) id: string) {
    const pdf = await this.service.pdf(user.aziendaId, commessa, id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: 'attachment; filename="bozza-contratto-' + id + '.pdf"' });
  }
}
