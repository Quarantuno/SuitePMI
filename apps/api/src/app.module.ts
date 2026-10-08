import { Controller, Get, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AziendaModule } from './azienda/azienda.module';
import { Public } from './common/auth';
import { ContropartiModule } from './controparti/controparti.module';
import { DbModule } from './db/db.module';
import { FattureModule } from './fatture/fatture.module';
import { IncassiModule } from './incassi/incassi.module';
import { SollecitiModule } from './solleciti/solleciti.module';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true };
  }
}

/**
 * Monolite modulare: ogni modulo di business (controparti, fatture, incassi, ...)
 * vive nella sua cartella e dipende solo dal nucleo (db, auth) e da @suite/shared.
 */
@Module({
  imports: [DbModule, AuthModule, AziendaModule, ContropartiModule, FattureModule, IncassiModule, SollecitiModule],
  controllers: [HealthController],
})
export class AppModule {}
