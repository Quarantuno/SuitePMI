import { Module } from '@nestjs/common';
import { ContrattiController } from './contratti.controller';
import { ContrattiService } from './contratti.service';
import { CommesseController } from './commesse.controller';
import { CommesseService } from './commesse.service';

@Module({ controllers: [CommesseController, ContrattiController], providers: [CommesseService, ContrattiService], exports: [CommesseService] })
export class CommesseModule {}
