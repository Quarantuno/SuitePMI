import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResponse, Preventivo, PreventivoInput } from '@suite/shared';
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

it('salva una bozza, esporta il PDF e converte l’accettazione in una sola commessa', async () => {
  async function registrazione(nome: string) {
    const risposta = await http.post('/api/auth/register').send({
      email: nome + '@example.test', password: 'password-sicura-1', nome, ragioneSociale: nome, partitaIva: '12345678903',
    }).expect(201);
    return { Authorization: 'Bearer ' + (risposta.body as AuthResponse).token };
  }

  const a = await registrazione('preventivi');
  const b = await registrazione('preventivi-altra');
  const creaCliente = (auth: typeof a) => http.post('/api/controparti').set(auth)
    .send({ denominazione: 'Cliente di prova', tipo: 'cliente' }).expect(201).then((r) => r.body.id as string);
  const cliente = await creaCliente(a);
  const clienteEsterno = await creaCliente(b);
  const input: PreventivoInput = {
    clienteId: cliente, titolo: 'Portale aziendale', data: '2026-11-23', validoFino: '2026-12-31', note: null,
    voci: [
      { descrizione: 'Sviluppo', quantita: 2, prezzoCents: 10_001, ivaBps: 2200 },
      { descrizione: 'Supporto', quantita: 1, prezzoCents: 1005, ivaBps: 1000 },
    ],
  };

  const endpoint = '/api/preventivi';
  await http.get(endpoint).expect(401);
  await http.post(endpoint).set(a).send({ ...input, clienteId: clienteEsterno }).expect(404);
  await http.post(endpoint).set(a).send({ ...input, validoFino: '2026-11-22' }).expect(400);
  await http.post(endpoint).set(a).send({ ...input, voci: [] }).expect(400);
  const bozza: Preventivo = (await http.post(endpoint).set(a).send(input).expect(201)).body;
  expect(bozza).toMatchObject({ stato: 'bozza', totaleCents: 25_508, commessaId: null, voci: input.voci });
  const url = endpoint + '/' + bozza.id;
  const pdf = await http.get(url + '/pdf').set(a).expect(200);
  expect(pdf.headers['content-type']).toBe('application/pdf');
  expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  await http.get(url + '/pdf').set(b).expect(404);
  await http.get(endpoint).set(b).expect(200, []);

  const modifica = { ...input, titolo: 'Portale clienti' };
  await http.put(url).set(a).send(modifica).expect(200);
  await http.patch(url + '/stato').set(a).send({ stato: 'accettato' }).expect(409);
  await http.patch(url + '/stato').set(a).send({ stato: 'inviato' }).expect(200);
  await http.put(url).set(a).send(input).expect(409);
  await http.patch(url + '/stato').set(b).send({ stato: 'accettato' }).expect(404);

  const accetta = () => http.patch(url + '/stato').set(a).send({ stato: 'accettato' }).expect(200);
  const [prima, seconda] = await Promise.all([accetta(), accetta()]);
  expect(prima.body.commessaId).not.toBeNull();
  expect(seconda.body.commessaId).toBe(prima.body.commessaId);
  await http.patch(url + '/stato').set(a).send({ stato: 'rifiutato' }).expect(409);
  expect((await http.get('/api/commesse').set(a).expect(200)).body).toMatchObject([
    { id: prima.body.commessaId, nome: modifica.titolo, budgetCents: 25_508, ricavoNettoCents: 21_007, cliente: { id: cliente } },
  ]);
});
