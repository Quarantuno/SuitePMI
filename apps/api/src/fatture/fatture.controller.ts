import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  collegaNotaSchema,
  fatturaCreateSchema,
  importXmlSchema,
  pagamentoSchema,
  type CollegaNotaInput,
  type FatturaCreateInput,
  type ImportXmlInput,
  type PagamentoInput,
} from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { FattureService } from './fatture.service';
import { decodificaXml, estraiDaP7m, P7mError } from './p7m';

@Controller('fatture')
export class FattureController {
  constructor(private readonly service: FattureService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query('direzione') direzione?: string) {
    const dir = direzione === 'attiva' || direzione === 'passiva' ? direzione : undefined;
    return this.service.list(user.aziendaId, dir);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(fatturaCreateSchema)) body: FatturaCreateInput) {
    return this.service.create(user.aziendaId, body);
  }

  @Post('import-xml')
  importXml(@CurrentUser() user: SessionUser, @Body(new ZodPipe(importXmlSchema)) body: ImportXmlInput) {
    let xml = body.xml;
    if (body.p7mBase64) {
      try {
        xml = decodificaXml(estraiDaP7m(Buffer.from(body.p7mBase64, 'base64')));
      } catch (err) {
        if (err instanceof P7mError) throw new BadRequestException(err.message);
        throw err;
      }
    }
    return this.service.importXml(user.aziendaId, xml!);
  }

  /** Abbina una nota di credito alla fattura che rettifica. */
  @Post(':id/collega')
  @HttpCode(200)
  collega(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(collegaNotaSchema)) body: CollegaNotaInput,
  ) {
    return this.service.collegaNota(user.aziendaId, id, body.fatturaId);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user.aziendaId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.aziendaId, id);
  }
}

@Controller('scadenze')
export class ScadenzeController {
  constructor(private readonly service: FattureService) {}

  @Post(':id/pagamenti')
  registraPagamento(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(pagamentoSchema)) body: PagamentoInput,
  ) {
    return this.service.registraPagamento(user.aziendaId, id, body);
  }
}
