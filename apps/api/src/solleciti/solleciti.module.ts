import { Module } from '@nestjs/common';
import { AziendaModule } from '../azienda/azienda.module';
import { ContropartiModule } from '../controparti/controparti.module';
import { IncassiModule } from '../incassi/incassi.module';
import { Mailer, SmtpMailer } from './mailer';
import { SollecitiAutoController } from './solleciti-auto.controller';
import { SollecitiAutoService } from './solleciti-auto.service';
import { SollecitiController } from './solleciti.controller';
import { SollecitiScheduler } from './solleciti.scheduler';
import { SollecitiService } from './solleciti.service';

@Module({
  imports: [AziendaModule, ContropartiModule, IncassiModule],
  // Il controller dei solleciti automatici va prima: le sue rotte sono più specifiche di /solleciti/:id.
  controllers: [SollecitiAutoController, SollecitiController],
  providers: [SollecitiService, SollecitiAutoService, SollecitiScheduler, { provide: Mailer, useClass: SmtpMailer }],
})
export class SollecitiModule {}
