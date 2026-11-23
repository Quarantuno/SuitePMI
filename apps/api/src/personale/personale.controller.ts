import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { assenzaSchema, calendarioAssenzeSchema, pagheMeseSchema, personaSchema, prospettoPagheSchema, type AssenzaInput, type PersonaInput, type ProspettoPagheInput } from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { PersonaleService } from './personale.service';

@Controller('personale')
export class PersonaleController {
  constructor(private readonly service: PersonaleService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.service.list(user);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(personaSchema)) input: PersonaInput) {
    return this.service.create(user, input);
  }

  @Get('assenze')
  calendario(
    @CurrentUser() user: SessionUser,
    @Query(new ZodPipe(calendarioAssenzeSchema)) query: { mese: string },
  ) {
    return this.service.calendario(user, query.mese);
  }

  @Post('assenze')
  registraAssenza(@CurrentUser() user: SessionUser, @Body(new ZodPipe(assenzaSchema)) input: AssenzaInput) {
    return this.service.registraAssenza(user, input);
  }

  @Delete('assenze/:id')
  @HttpCode(204)
  rimuoviAssenza(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.rimuoviAssenza(user, id);
  }

  @Get('paghe')
  @Header('Cache-Control', 'private, no-store')
  paghe(@CurrentUser() user: SessionUser, @Query(new ZodPipe(pagheMeseSchema)) query: { mese: string }) {
    return this.service.prospetti(user, query.mese);
  }

  @Put('paghe')
  @Header('Cache-Control', 'private, no-store')
  salvaProspetto(@CurrentUser() user: SessionUser, @Body(new ZodPipe(prospettoPagheSchema)) input: ProspettoPagheInput) {
    return this.service.salvaProspetto(user, input);
  }

  @Get('paghe/:id/pdf')
  @Header('Cache-Control', 'private, no-store')
  async pdfProspetto(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const pdf = await this.service.pdfProspetto(user, id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: 'attachment; filename="prospetto-interno-' + id + '.pdf"' });
  }

  @Put(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(personaSchema)) input: PersonaInput,
  ) {
    return this.service.update(user, id, input);
  }
}
