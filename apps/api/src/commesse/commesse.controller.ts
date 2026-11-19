import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  collegamentoCommessaSchema,
  commessaSchema,
  costoCommessaSchema,
  type CollegamentoCommessaInput,
  type CommessaInput,
  type CostoCommessaInput,
} from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { CommesseService } from './commesse.service';

@Controller('commesse')
export class CommesseController {
  constructor(private readonly service: CommesseService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.service.list(user.aziendaId);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(commessaSchema)) input: CommessaInput) {
    return this.service.create(user.aziendaId, input);
  }

  @Get(':id/fatture')
  fatture(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.documenti(user.aziendaId, id);
  }

  @Get(':id/costi')
  costi(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.costi(user.aziendaId, id);
  }

  @Post(':id/costi')
  aggiungiCosto(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(costoCommessaSchema)) input: CostoCommessaInput,
  ) {
    return this.service.aggiungiCosto(user.aziendaId, id, input);
  }

  @Delete(':id/costi/:costoId')
  @HttpCode(204)
  eliminaCosto(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('costoId', ParseUUIDPipe) costoId: string,
  ) {
    return this.service.eliminaCosto(user.aziendaId, id, costoId);
  }

  @Patch(':commessaId/fatture/:id')
  @HttpCode(204)
  collega(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commessaId', ParseUUIDPipe) commessaId: string,
    @Body(new ZodPipe(collegamentoCommessaSchema)) input: CollegamentoCommessaInput,
  ) {
    return this.service.collega(user.aziendaId, id, commessaId, input.collegata);
  }
}
