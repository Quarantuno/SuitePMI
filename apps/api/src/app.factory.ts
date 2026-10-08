import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { config } from './config';

/** Configurazione comune all'avvio reale e ai test e2e. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  express.setGlobalPrefix('api');
  // Header di sicurezza HTTP (nosniff, frame-ancestors, HSTS in produzione...)
  express.use(helmet());
  // Dietro un proxy (Railway, Render, nginx) l'IP reale arriva in X-Forwarded-For
  if (process.env.TRUST_PROXY === 'true') express.set('trust proxy', 1);
  // Le fatture XML/p7m (in base64) possono pesare qualche MB.
  express.useBodyParser('json', { limit: '10mb' });
  express.enableCors({ origin: config.webOrigin });
  express.enableShutdownHooks();
  return express;
}
