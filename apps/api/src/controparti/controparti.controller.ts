import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { controparteSchema, controparteUpdateSchema, type ControparteInput } from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { ContropartiService } from './controparti.service';

@Controller('controparti')
export class ContropartiController {
  constructor(private readonly service: ContropartiService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query('q') q?: string, @Query('tipo') tipo?: string) {
    return this.service.list(user.aziendaId, { q, tipo });
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user.aziendaId, id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(controparteSchema)) body: ControparteInput) {
    return this.service.create(user.aziendaId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(controparteUpdateSchema)) body: Partial<ControparteInput>,
  ) {
    return this.service.update(user.aziendaId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.aziendaId, id);
  }
}
