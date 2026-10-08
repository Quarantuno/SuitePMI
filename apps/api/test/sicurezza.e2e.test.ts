import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';

let app: INestApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication({ bodyParser: false }));
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
});

describe('sicurezza', () => {
  it('invia gli header di sicurezza', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('blocca i tentativi di login ripetuti dallo stesso IP', async () => {
    const tenta = () => http.post('/api/auth/login').send({ email: 'forza@bruta.it', password: 'x' });
    for (let i = 0; i < 10; i++) expect((await tenta()).status).toBe(401);
    const bloccato = await tenta();
    expect(bloccato.status).toBe(429);
    expect(bloccato.body.message).toMatch(/Troppi tentativi/);
    // le altre rotte non sono limitate
    await http.get('/api/health').expect(200);
  });
});
