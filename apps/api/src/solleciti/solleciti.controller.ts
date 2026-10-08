import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  sollecitoAnteprimaSchema,
  sollecitoCreateSchema,
  sollecitoInviaSchema,
  type SollecitoAnteprimaInput,
  type SollecitoCreateInput,
  type SollecitoInviaInput,
} from '@suite/shared';
import { CurrentUser, type SessionUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { SollecitiService } from './solleciti.service';

@Controller('solleciti')
export class SollecitiController {
  constructor(private readonly service: SollecitiService) {}

  @Post('anteprima')
  @HttpCode(200)
  anteprima(@CurrentUser() user: SessionUser, @Body(new ZodPipe(sollecitoAnteprimaSchema)) body: SollecitoAnteprimaInput) {
    return this.service.anteprima(user, body);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(sollecitoCreateSchema)) body: SollecitoCreateInput) {
    return this.service.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: SessionUser, @Query('controparteId') controparteId?: string) {
    const id = controparteId && /^[0-9a-f-]{36}$/i.test(controparteId) ? controparteId : undefined;
    return this.service.list(user, id);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user, id);
  }

  @Get(':id/pdf')
  async pdf(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const { filename, content } = await this.service.pdf(user, id);
    return new StreamableFile(content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post(':id/invia')
  @HttpCode(200)
  invia(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(sollecitoInviaSchema)) body: SollecitoInviaInput,
  ) {
    return this.service.invia(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user, id);
  }
}
