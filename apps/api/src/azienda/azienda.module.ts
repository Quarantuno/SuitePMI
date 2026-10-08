import { Module } from '@nestjs/common';
import { AziendaController } from './azienda.controller';
import { AziendaService } from './azienda.service';

@Module({
  controllers: [AziendaController],
  providers: [AziendaService],
  exports: [AziendaService],
})
export class AziendaModule {}
