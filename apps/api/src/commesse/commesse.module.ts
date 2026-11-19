import { Module } from '@nestjs/common';
import { CommesseController } from './commesse.controller';
import { CommesseService } from './commesse.service';

@Module({ controllers: [CommesseController], providers: [CommesseService] })
export class CommesseModule {}
