import { Module } from '@nestjs/common';
import { PersonaleController } from './personale.controller';
import { PersonaleService } from './personale.service';

@Module({ controllers: [PersonaleController], providers: [PersonaleService] })
export class PersonaleModule {}
