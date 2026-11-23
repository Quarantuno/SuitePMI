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

async function registra(nome: string): Promise<AuthResponse> {
  const res = await http.post('/api/auth/register').send({
    email: nome + '@test.it', password: 'password-sicura-1', nome, ragioneSociale: nome, partitaIva: '12345678903',
  }).expect(201);
  return res.body;
}

const auth = (sessione: AuthResponse) => ({ Authorization: 'Bearer ' + sessione.token });

it('gestisce il personale, valida le date e limita accesso e modifica al tenant autorizzato', async () => {
  const principale = await registra('personale');
  const altra = await registra('personale-altra');
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

  const paghe = endpoint + '/paghe';
  const voci = { personaId: ingresso.id, mese: '2020-12', lordoCents: 240_000, competenzeCents: 20_000,
    contributiCents: 18_000, ritenuteCents: 32_000, trattenuteCents: 1500 };
  await http.get(paghe + '?mese=2020-12').expect(401);
  await http.get(paghe + '?mese=2020-13').set(auth(principale)).expect(400);
  await http.put(paghe).set(auth(altra)).send(voci).expect(404);
  await http.put(paghe).set(auth(principale)).send({ ...voci, contributiCents: -10 }).expect(400);
  const prospetto = (await http.put(paghe).set(auth(principale)).send(voci).expect(200)).body;
  expect(prospetto).toMatchObject({ ...voci, saldoCents: 208_500 });
  expect(prospetto).not.toHaveProperty('aziendaId');
  const aggiornato = (await http.put(paghe).set(auth(principale)).send({ ...voci, trattenuteCents: 0 }).expect(200)).body;
  expect(aggiornato).toMatchObject({ id: prospetto.id, saldoCents: 210_000 });
  await http.get(paghe + '?mese=2020-11').set(auth(principale)).expect(200, []);
  await http.get(paghe + '?mese=2020-12').set(auth(altra)).expect(200, []);
  await http.get(paghe + '?mese=2020-12').set(auth(principale)).expect(200, [aggiornato]);

  const pdf = await http.get(paghe + '/' + prospetto.id + '/pdf').set(auth(principale)).expect(200);
  expect(pdf.headers['cache-control']).toContain('no-store');
  expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  await http.get(paghe + '/' + prospetto.id + '/pdf').set(auth(altra)).expect(404);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query("UPDATE membri SET ruolo = 'membro' WHERE utente_id = $1", [principale.utente.id]);
  } finally {
    await db.end();
  }
  await http.get(endpoint).set(auth(principale)).expect(403);
  await http.get(paghe + '?mese=2020-12').set(auth(principale)).expect(403);
  await http.get(endpoint + '/presenze?mese=2020-12').set(auth(principale)).expect(403);
  await http.put(paghe).set(auth(principale)).send(voci).expect(403);
  await http.get(paghe + '/' + prospetto.id + '/pdf').set(auth(principale)).expect(403);
  await http.post(endpoint).set(auth(principale)).send(bozza).expect(403);
  await http.put(endpoint + '/' + ingresso.id).set(auth(principale)).send(bozza).expect(403);
});

it('registra e corregge ore giornaliere, protegge assenze e date di lavoro e isola le aziende', async () => {
  const titolare = auth(await registra('presenze'));
  const altra = auth(await registra('presenze-altra'));
  const endpoint = '/api/personale/presenze';
  const scheda: PersonaInput = {
    nome: 'Luca', cognome: 'Verdi', mansione: 'Responsabile progetti', emailLavoro: null,
    dataIngresso: '2028-02-01', dataUscita: '2028-03-01',
  };
  const { id: personaId } = (await http.post('/api/personale').set(titolare).send(scheda).expect(201)).body;
  const presenza = { personaId, giorno: '2028-02-29', minutiOrdinari: 480, minutiStraordinari: 45 };

  await http.get(endpoint + '?mese=2028-02').expect(401);
  await http.get(endpoint + '?mese=2028-13').set(titolare).expect(400);
  await http.post(endpoint).set(titolare).send({ ...presenza, giorno: '2027-02-29' }).expect(400);
  await http.post(endpoint).set(titolare).send({ ...presenza, giorno: '2028-01-31' }).expect(400);
  await http.post(endpoint).set(titolare).send({ ...presenza, giorno: '2028-03-02' }).expect(400);
  await http.post(endpoint).set(titolare).send({ ...presenza, minutiOrdinari: 0, minutiStraordinari: 0 }).expect(400);
  await http.post(endpoint).set(titolare).send({ ...presenza, minutiOrdinari: 1400 }).expect(400);
  await http.post(endpoint).set(altra).send(presenza).expect(404);

  const contemporanee = await Promise.all([
    http.post(endpoint).set(titolare).send(presenza),
    http.post(endpoint).set(titolare).send(presenza),
  ]);
  expect(contemporanee.map((risposta) => risposta.status).sort()).toEqual([201, 409]);
  const creata = contemporanee.find((risposta) => risposta.status === 201)!.body;
  expect(creata).toMatchObject({ ...presenza, persona: { nome: 'Luca', cognome: 'Verdi' } });
  expect(creata).not.toHaveProperty('aziendaId');

  const durataCorretta = { ...presenza, minutiStraordinari: 60 };
  await http.put(endpoint + '/' + creata.id).set(altra).send(durataCorretta).expect(404);
  await http.put(endpoint + '/' + creata.id).set(titolare).send({ ...durataCorretta, giorno: '2028-03-01' }).expect(404);
  const corretta = (await http.put(endpoint + '/' + creata.id).set(titolare).send(durataCorretta).expect(200)).body;
  expect(corretta).toEqual({ ...creata, ...durataCorretta });
  await http.post(endpoint).set(titolare).send({ ...presenza, giorno: '2028-03-01' }).expect(201);
  await http.get(endpoint + '?mese=2028-02').set(titolare).expect(200, [corretta])
    .expect('Cache-Control', 'private, no-store');
  await http.get(endpoint + '?mese=2028-02').set(altra).expect(200, []);

  const assenza = { personaId, tipo: 'ferie', dal: '2028-02-28', al: '2028-02-29' };
  await http.post('/api/personale/assenze').set(titolare).send(assenza).expect(409);
  await http.post('/api/personale/assenze').set(titolare).send({ ...assenza, al: assenza.dal }).expect(201);
  await http.post(endpoint).set(titolare).send({ ...presenza, giorno: assenza.dal }).expect(409);
  await http.put('/api/personale/' + personaId).set(titolare).send({ ...scheda, dataUscita: '2028-02-28' }).expect(409);

  await http.delete(endpoint + '/' + creata.id).set(altra).expect(404);
  await http.delete(endpoint + '/' + creata.id).set(titolare).expect(204);
  await http.get(endpoint + '?mese=2028-02').set(titolare).expect(200, []);
});
