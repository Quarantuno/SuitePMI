import { Module } from '@nestjs/common';
import { CommesseController } from './commesse.controller';
import { CommesseService } from './commesse.service';

@Module({ controllers: [CommesseController], providers: [CommesseService], exports: [CommesseService] })
export class CommesseModule {}
