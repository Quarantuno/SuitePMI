import { Module } from '@nestjs/common';
import { ContropartiController } from './controparti.controller';
import { ContropartiService } from './controparti.service';

@Module({
  controllers: [ContropartiController],
  providers: [ContropartiService],
  exports: [ContropartiService],
})
export class ContropartiModule {}
