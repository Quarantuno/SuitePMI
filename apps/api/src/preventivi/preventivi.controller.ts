import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, StreamableFile } from '@nestjs/common';
import { esitoPreventivoSchema, preventivoSchema, type EsitoPreventivoInput, type PreventivoInput } from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { PreventiviService } from './preventivi.service';

@Controller('preventivi')
export class PreventiviController {
  constructor(private readonly service: PreventiviService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.service.list(user.aziendaId);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user.aziendaId, id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(preventivoSchema)) input: PreventivoInput) {
    return this.service.create(user.aziendaId, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(preventivoSchema)) input: PreventivoInput,
  ) {
    return this.service.update(user.aziendaId, id, input);
  }

  @Patch(':id/stato')
  cambiaStato(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(esitoPreventivoSchema)) input: EsitoPreventivoInput,
  ) {
    return this.service.cambiaStato(user.aziendaId, id, input.stato);
  }

  @Get(':id/pdf')
  async pdf(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const pdf = await this.service.pdf(user.aziendaId, id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: 'attachment; filename="preventivo-' + id + '.pdf"' });
  }
}
