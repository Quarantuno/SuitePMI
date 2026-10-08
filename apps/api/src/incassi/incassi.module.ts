import { Module } from '@nestjs/common';
import { IncassiController } from './incassi.controller';
import { IncassiService } from './incassi.service';

@Module({
  controllers: [IncassiController],
  providers: [IncassiService],
  exports: [IncassiService],
})
export class IncassiModule {}
