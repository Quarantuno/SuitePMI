import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile } from '@nestjs/common';
import {
  assenzaSchema, calendarioAssenzeSchema, contrattoLavoroSchema, mesePersonaleSchema, pagheMeseSchema, personaSchema,
  presenzaSchema, prospettoPagheSchema, type AssenzaInput, type ContrattoLavoroInput, type PersonaInput,
  type PresenzaInput, type ProspettoPagheInput,
} from '@suite/shared';
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

  @Get('presenze')
  @Header('Cache-Control', 'private, no-store')
  registroPresenze(@CurrentUser() user: SessionUser, @Query(new ZodPipe(mesePersonaleSchema)) query: { mese: string }) {
    return this.service.registroPresenze(user, query.mese);
  }

  @Post('presenze')
  @Header('Cache-Control', 'private, no-store')
  registraPresenza(@CurrentUser() user: SessionUser, @Body(new ZodPipe(presenzaSchema)) input: PresenzaInput) {
    return this.service.salvaPresenza(user, input);
  }

  @Put('presenze/:id')
  @Header('Cache-Control', 'private, no-store')
  aggiornaPresenza(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(presenzaSchema)) input: PresenzaInput,
  ) {
    return this.service.salvaPresenza(user, input, id);
  }

  @Delete('presenze/:id')
  @HttpCode(204)
  rimuoviPresenza(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.rimuoviPresenza(user, id);
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

  @Get('paghe/riepilogo')
  @Header('Cache-Control', 'private, no-store')
  riepilogoPaghe(@CurrentUser() user: SessionUser, @Query(new ZodPipe(pagheMeseSchema)) query: { mese: string }) {
    return this.service.riepilogoPaghe(user, query.mese);
  }

  @Get('paghe/:id/pdf')
  @Header('Cache-Control', 'private, no-store')
  async pdfProspetto(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const pdf = await this.service.pdfProspetto(user, id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: 'attachment; filename="prospetto-interno-' + id + '.pdf"' });
  }

  @Get(':personaId/contratti')
  @Header('Cache-Control', 'private, no-store')
  contrattiLavoro(@CurrentUser() user: SessionUser, @Param('personaId', ParseUUIDPipe) personaId: string) {
    return this.service.contrattiLavoro(user, personaId);
  }

  @Post(':personaId/contratti')
  @Header('Cache-Control', 'private, no-store')
  creaContrattoLavoro(
    @CurrentUser() user: SessionUser,
    @Param('personaId', ParseUUIDPipe) personaId: string,
    @Body(new ZodPipe(contrattoLavoroSchema)) input: ContrattoLavoroInput,
  ) {
    return this.service.creaContrattoLavoro(user, personaId, input);
  }

  @Get(':personaId/contratti/:id')
  @Header('Cache-Control', 'private, no-store')
  leggiContrattoLavoro(
    @CurrentUser() user: SessionUser,
    @Param('personaId', ParseUUIDPipe) personaId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.leggiContrattoLavoro(user, personaId, id);
  }

  @Put(':personaId/contratti/:id')
  @Header('Cache-Control', 'private, no-store')
  aggiornaContrattoLavoro(
    @CurrentUser() user: SessionUser,
    @Param('personaId', ParseUUIDPipe) personaId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(contrattoLavoroSchema)) input: ContrattoLavoroInput,
  ) {
    return this.service.aggiornaContrattoLavoro(user, personaId, id, input);
  }

  @Delete(':personaId/contratti/:id')
  @HttpCode(204)
  rimuoviContrattoLavoro(
    @CurrentUser() user: SessionUser,
    @Param('personaId', ParseUUIDPipe) personaId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.rimuoviContrattoLavoro(user, personaId, id);
  }

  @Get(':personaId/contratti/:id/pdf')
  @Header('Cache-Control', 'private, no-store')
  async pdfContrattoLavoro(
    @CurrentUser() user: SessionUser,
    @Param('personaId', ParseUUIDPipe) personaId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const pdf = await this.service.pdfContrattoLavoro(user, personaId, id);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: 'attachment; filename="bozza-contratto-lavoro-' + id + '.pdf"' });
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
