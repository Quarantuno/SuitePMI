import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResponse, PersonaInput } from '@suite/shared';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';

let app: INestApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(module.createNestApplication({ bodyParser: false }));
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
});

it('registra assenze tra due mesi, impedisce sovrapposizioni e isola le aziende', async () => {
  async function utenza(nome: string) {
    const risposta = await http.post('/api/auth/register').send({
      email: nome + '@example.test', password: 'password-sicura-1', nome, ragioneSociale: nome, partitaIva: '12345678903',
    }).expect(201);
    return { Authorization: 'Bearer ' + (risposta.body as AuthResponse).token };
  }
  const a = await utenza('assenze');
  const b = await utenza('assenze-altra');
  const scheda: PersonaInput = {
    nome: 'Ada', cognome: 'Rossi', mansione: 'Sviluppo', emailLavoro: null,
    dataIngresso: '2026-01-01', dataUscita: '2026-12-31',
  };
  const persona = (await http.post('/api/personale').set(a).send(scheda).expect(201)).body;
  const endpoint = '/api/personale/assenze';
  const ferie = { personaId: persona.id, tipo: 'ferie', dal: '2026-07-30', al: '2026-08-03' };

  await http.get(endpoint + '?mese=2026-13').set(a).expect(400);
  await http.post(endpoint).set(a).send({ ...ferie, al: '2026-07-29' }).expect(400);
  await http.post(endpoint).set(a).send({ ...ferie, dal: '2025-12-31' }).expect(400);
  await http.post(endpoint).set(a).send({ ...ferie, al: '2027-01-01' }).expect(400);
  await http.post(endpoint).set(b).send(ferie).expect(404);

  const risposte = await Promise.all([
    http.post(endpoint).set(a).send(ferie),
    http.post(endpoint).set(a).send(ferie),
  ]);
  expect(risposte.map((r) => r.status).sort()).toEqual([201, 409]);
  const creata = risposte.find((r) => r.status === 201)!.body;
  expect(creata).toMatchObject({ ...ferie, persona: { nome: 'Ada', cognome: 'Rossi' } });
  await http.post(endpoint).set(a).send({ ...ferie, tipo: 'permesso', dal: ferie.al }).expect(409);
  const successiva = { ...ferie, tipo: 'permesso', dal: '2026-08-04', al: '2026-08-04' };
  await http.post(endpoint).set(a).send(successiva).expect(201);

  await http.get(endpoint + '?mese=2026-07').set(a).expect(200, [creata]);
  expect((await http.get(endpoint + '?mese=2026-08').set(a).expect(200)).body).toMatchObject([creata, successiva]);
  await http.get(endpoint + '?mese=2026-09').set(a).expect(200, []);
  await http.get(endpoint + '?mese=2026-08').set(b).expect(200, []);
  await http.put('/api/personale/' + persona.id).set(a).send({ ...scheda, dataIngresso: '2026-08-01' }).expect(409);
  await http.delete(endpoint + '/' + creata.id).set(b).expect(404);
  await http.delete(endpoint + '/' + creata.id).set(a).expect(204);
  await http.get(endpoint + '?mese=2026-07').set(a).expect(200, []);
});
