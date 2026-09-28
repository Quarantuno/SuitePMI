import { Module } from '@nestjs/common';
import { ContropartiModule } from '../controparti/controparti.module';
import { FattureController, ScadenzeController } from './fatture.controller';
import { FattureService } from './fatture.service';

@Module({
  imports: [ContropartiModule],
  controllers: [FattureController, ScadenzeController],
  providers: [FattureService],
})
export class FattureModule {}
