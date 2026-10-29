import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './app.factory';
import { AppModule } from './app.module';
import { config } from './config';
import { SollecitiScheduler } from './solleciti/solleciti.scheduler';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  await app.listen(config.port);
  if (config.sollecitiAutoScheduler) app.get(SollecitiScheduler).avvia();
  console.log(`API in ascolto su http://localhost:${config.port}/api`);
}

void bootstrap();
