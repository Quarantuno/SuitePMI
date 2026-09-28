import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { config } from './config';

/** Configurazione comune all'avvio reale e ai test e2e. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  express.setGlobalPrefix('api');
  // Le fatture XML possono pesare qualche MB.
  express.useBodyParser('json', { limit: '6mb' });
  express.enableCors({ origin: config.webOrigin });
  express.enableShutdownHooks();
  return express;
}
