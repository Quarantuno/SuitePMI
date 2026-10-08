import { Module } from '@nestjs/common';
import { AziendaModule } from '../azienda/azienda.module';
import { CassaController } from './cassa.controller';
import { CassaService } from './cassa.service';

@Module({
  imports: [AziendaModule],
  controllers: [CassaController],
  providers: [CassaService],
})
export class CassaModule {}
