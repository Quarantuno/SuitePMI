import { Module } from '@nestjs/common';
import { CommesseModule } from '../commesse/commesse.module';
import { PreventiviController } from './preventivi.controller';
import { PreventiviService } from './preventivi.service';

@Module({ imports: [CommesseModule], controllers: [PreventiviController], providers: [PreventiviService] })
export class PreventiviModule {}
