import { Module } from '@nestjs/common';
import { AziendaModule } from '../azienda/azienda.module';
import { ContropartiModule } from '../controparti/controparti.module';
import { IncassiModule } from '../incassi/incassi.module';
import { Mailer, SmtpMailer } from './mailer';
import { SollecitiController } from './solleciti.controller';
import { SollecitiService } from './solleciti.service';

@Module({
  imports: [AziendaModule, ContropartiModule, IncassiModule],
  controllers: [SollecitiController],
  providers: [SollecitiService, { provide: Mailer, useClass: SmtpMailer }],
})
export class SollecitiModule {}
