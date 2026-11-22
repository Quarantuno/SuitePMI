import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResponse, PersonaInput } from '@suite/shared';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
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

it('gestisce il personale, valida le date e limita accesso e modifica al tenant autorizzato', async () => {
  async function registra(nome: string): Promise<AuthResponse> {
    const res = await http.post('/api/auth/register').send({
      email: nome + '@test.it', password: 'password-sicura-1', nome, ragioneSociale: nome, partitaIva: '12345678903',
    }).expect(201);
    return res.body;
  }

  const principale = await registra('personale');
  const altra = await registra('personale-altra');
  const auth = (sessione: AuthResponse) => ({ Authorization: 'Bearer ' + sessione.token });
  const endpoint = '/api/personale';
  const bozza: PersonaInput = {
    nome: 'Anna', cognome: 'Verdi', mansione: 'Responsabile progetti',
    emailLavoro: 'anna@example.test', dataIngresso: '2099-01-01', dataUscita: null,
  };

  await http.get(endpoint).expect(401);
  await http.post(endpoint).set(auth(principale)).send({ ...bozza, dataUscita: '2098-12-31' }).expect(400);
  const ingresso = (await http.post(endpoint).set(auth(principale)).send(bozza).expect(201)).body;
  expect(ingresso).toMatchObject({ ...bozza, stato: 'in_arrivo' });
  expect(ingresso).not.toHaveProperty('aziendaId');

  await http.get(endpoint).set(auth(altra)).expect(200, []);
  await http.put(endpoint + '/' + ingresso.id).set(auth(altra)).send(bozza).expect(404);

  const attivo = { ...bozza, dataIngresso: '2020-01-01' };
  expect((await http.put(endpoint + '/' + ingresso.id).set(auth(principale)).send(attivo).expect(200)).body)
    .toMatchObject({ stato: 'attivo' });

  const cessato = { ...attivo, emailLavoro: null, dataUscita: '2020-12-31' };
  await http.put(endpoint + '/' + ingresso.id).set(auth(principale)).send(cessato).expect(200);
  expect((await http.get(endpoint).set(auth(principale)).expect(200)).body)
    .toMatchObject([{ id: ingresso.id, ...cessato, stato: 'cessato' }]);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query("UPDATE membri SET ruolo = 'membro' WHERE utente_id = $1", [principale.utente.id]);
  } finally {
    await db.end();
  }
  await http.get(endpoint).set(auth(principale)).expect(403);
  await http.post(endpoint).set(auth(principale)).send(bozza).expect(403);
  await http.put(endpoint + '/' + ingresso.id).set(auth(principale)).send(bozza).expect(403);
});
