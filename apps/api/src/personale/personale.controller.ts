import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { personaSchema, type PersonaInput } from '@suite/shared';
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

  @Put(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(personaSchema)) input: PersonaInput,
  ) {
    return this.service.update(user, id, input);
  }
}
