import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResponse, Fattura } from '@suite/shared';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { notaDiCredito } from './note-credito';

let app: INestApplication;
let http: ReturnType<typeof request>;
const auth = (sessione: AuthResponse) => ({ Authorization: 'Bearer ' + sessione.token });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication({ bodyParser: false }));
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
});

it('collega fatture, distingue incassi e storni e registra i costi della commessa', async () => {
  async function registra(nome: string, partitaIva: string): Promise<AuthResponse> {
    const res = await http.post('/api/auth/register')
      .send({ email: nome + '@test.it', password: 'password-sicura-1', nome, ragioneSociale: nome, partitaIva })
      .expect(201);
    return res.body;
  }

  const partitaIva = '56789012343';
  const a = auth(await registra('commesse', partitaIva));
  const b = auth(await registra('commesse-esterne', '67890123457'));
  const xml = readFileSync(join(__dirname, 'fixtures/fattura-attiva.xml'), 'utf8').replaceAll('12345678903', partitaIva);
  const importa = (documento: string) => http.post('/api/fatture/import-xml').set(a).send({ xml: documento }).expect(201);
  const fattura: Fattura = (await importa(xml)).body.fattura;
  const altroCliente = (await http.post('/api/controparti').set(a)
    .send({ tipo: 'cliente', denominazione: 'Altro cliente' }).expect(201)).body.id;
  async function crea(clienteId: string) {
    return (await http.post('/api/commesse').set(a)
      .send({ clienteId, nome: 'Sito web', budgetCents: 250_000 }).expect(201)).body.id as string;
  }

  const commessa = await crea(fattura.controparte.id);
  const altraCommessa = await crea(altroCliente);
  const stessaControparte = await crea(fattura.controparte.id);
  const rotta = '/api/commesse/' + commessa + '/fatture';
  const collega = (id: string, collegata: boolean) => http.patch('/api/commesse/' + id + '/fatture/' + fattura.id)
    .set(a).send({ collegata });

  const elenco = () => http.get('/api/commesse').set(a).expect(200);
  const aggiorna = (body: object) => http.patch('/api/commesse/' + commessa).set(a).send(body);
  const nuovo = { nome: 'Sito web aggiornato', budgetCents: 270_000, stato: 'in_corso', scadenza: '2026-03-31' };
  expect((await elenco()).body).toContainEqual(expect.objectContaining({ id: commessa, stato: 'da_avviare', scadenza: null }));
  await aggiorna({ ...nuovo, scadenza: '2026-02-30' }).expect(400);
  await http.patch('/api/commesse/' + commessa).set(b).send(nuovo).expect(404);
  await aggiorna(nuovo).expect(204);
  expect((await elenco()).body).toContainEqual(expect.objectContaining({ id: commessa, ...nuovo }));
  await aggiorna({ nome: nuovo.nome, budgetCents: nuovo.budgetCents, scadenza: null }).expect(204);
  expect((await elenco()).body).toContainEqual(expect.objectContaining({ id: commessa, ...nuovo, scadenza: null }));

  const iniziale = await http.get(rotta).set(a).expect(200);
  expect(iniziale.body.disponibili).toMatchObject([{ id: fattura.id }]);
  await collega(altraCommessa, true).expect(400);
  await collega(commessa, true).expect(204);
  await collega(commessa, true).expect(204);
  await collega(stessaControparte, true).expect(409);
  await collega(stessaControparte, false).expect(409);

  await http.post('/api/scadenze/' + fattura.scadenze[0]!.id + '/pagamenti')
    .set(a).send({ data: '2026-02-01', importoCents: 40_000 }).expect(201);
  await importa(notaDiCredito(xml, { numero: 'NC-C1', data: '2026-02-20', importo: '500.00', rif: fattura.numero }));

  const dopo = await http.get(rotta).set(a).expect(200);
  expect(dopo.body.collegate).toMatchObject([{
    id: fattura.id,
    fatturatoCents: 244_000,
    incassatoCents: 40_000,
    stornatoCents: 50_000,
    residuoCents: 154_000,
  }]);
  expect(dopo.body.disponibili).toEqual([]);
  expect((await http.get('/api/commesse').set(b).expect(200)).body).toEqual([]);
  await http.get(rotta).set(b).expect(404);

  const costi = '/api/commesse/' + commessa + '/costi';
  const datiLavoro = { tipo: 'lavoro', data: '2026-02-01', descrizione: 'Sviluppo', minuti: 90, costoCents: 6000 };
  await http.post(costi).set(a).send({ ...datiLavoro, minuti: 0 }).expect(400);
  const lavoro = (await http.post(costi).set(a).send(datiLavoro).expect(201)).body;
  const spesa = { tipo: 'spesa', data: '2026-02-02', descrizione: 'Materiali', costoCents: 2500 };
  await http.post(costi).set(a).send(spesa).expect(201);
  expect((await http.get(costi).set(a).expect(200)).body).toMatchObject([
    { ...spesa, minuti: 0 },
    { ...datiLavoro, id: lavoro.id },
  ]);
  await http.get(costi).set(b).expect(404);
  await http.post(costi).set(b).send(datiLavoro).expect(404);
  await http.delete(costi + '/' + lavoro.id).set(b).expect(404);
  await http.delete('/api/commesse/' + altraCommessa + '/costi/' + lavoro.id).set(a).expect(404);
  await http.delete(costi + '/' + lavoro.id).set(a).expect(204);
  expect((await http.get(costi).set(a).expect(200)).body).toMatchObject([spesa]);

  const orario = { tipo: 'lavoro', operatore: 'Ada', data: '2026-02-03', descrizione: 'Verifica', minuti: 90, tariffaOrariaCents: 4001 };
  await http.post(costi).set(a).send({ ...orario, costoCents: 20 }).expect(400);
  const tempo = (await http.post(costi).set(a).send(orario).expect(201)).body;
  expect((await http.get(costi).set(a).expect(200)).body).toContainEqual(
    expect.objectContaining({ id: tempo.id, ...orario, costoCents: 6002 }),
  );

  const contratti = '/api/commesse/' + commessa + '/contratti';
  const bozza = { titolo: 'Accordo di progetto', data: '2026-02-03', testo: 'Consegna del progetto secondo la proposta concordata.' };
  const creata = (await http.post(contratti).set(a).send(bozza).expect(201)).body;
  expect((await http.get(contratti).set(a).expect(200)).body)
    .toEqual([{ id: creata.id, titolo: bozza.titolo, data: bozza.data }]);
  await http.get(contratti).set(b).expect(404);
  const url = contratti + '/' + creata.id;
  await http.get('/api/commesse/' + altraCommessa + '/contratti/' + creata.id).set(a).expect(404);
  await http.put(url).set(b).send(bozza).expect(404);
  const nuova = { ...bozza, testo: 'Condizioni concordate per il nuovo periodo.' };
  expect((await http.put(url).set(a).send(nuova).expect(200)).body).toMatchObject(nuova);
  await http.get(url + '/pdf').set(b).expect(404);
  const pdf = await http.get(url + '/pdf').set(a).expect(200);
  expect(pdf.headers['content-type']).toBe('application/pdf');
  expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

  await collega(commessa, false).expect(204);
  expect((await http.get(rotta).set(a).expect(200)).body.collegate).toEqual([]);
});
