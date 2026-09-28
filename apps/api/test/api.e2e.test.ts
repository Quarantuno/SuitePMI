import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResponse, CreditiScadutiResponse, Fattura, ImportXmlResponse } from '@suite/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';

const xml = readFileSync(join(__dirname, 'fixtures/fattura-attiva.xml'), 'utf8');

let app: INestApplication;
let http: ReturnType<typeof request>;
let a: AuthResponse; // Officina Demo, P.IVA 12345678903
let b: AuthResponse; // un'altra azienda, P.IVA 09876543217

const auth = (s: AuthResponse) => ({ Authorization: `Bearer ${s.token}` });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication({ bodyParser: false }));
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
});

describe('nucleo: autenticazione', () => {
  it('health e pubblico', async () => {
    await http.get('/api/health').expect(200, { ok: true });
  });

  it('registra due aziende', async () => {
    const resA = await http
      .post('/api/auth/register')
      .send({
        email: 'Titolare@Officina.it',
        password: 'password-sicura-1',
        nome: 'Lorenzo',
        ragioneSociale: 'Officina Demo S.r.l.',
        partitaIva: 'IT12345678903',
      })
      .expect(201);
    a = resA.body;
    expect(a.utente.email).toBe('titolare@officina.it');
    expect(a.azienda.partitaIva).toBe('12345678903');

    const resB = await http
      .post('/api/auth/register')
      .send({
        email: 'info@altra.it',
        password: 'password-sicura-2',
        nome: 'Giulia',
        ragioneSociale: 'Altra Azienda S.n.c.',
        partitaIva: '09876543217',
      })
      .expect(201);
    b = resB.body;
  });

  it('valida i dati e rifiuta i duplicati', async () => {
    const bad = await http
      .post('/api/auth/register')
      .send({ email: 'x@y.it', password: 'corta', nome: 'X', ragioneSociale: 'X', partitaIva: '12345678901' })
      .expect(400);
    expect(bad.body.errori.map((e: { campo: string }) => e.campo)).toEqual(['password', 'partitaIva']);

    await http
      .post('/api/auth/register')
      .send({
        email: 'titolare@officina.it',
        password: 'password-sicura-1',
        nome: 'Doppione',
        ragioneSociale: 'Doppione',
        partitaIva: '01234567897',
      })
      .expect(409);
  });

  it('login e /me', async () => {
    await http.post('/api/auth/login').send({ email: 'titolare@officina.it', password: 'sbagliata' }).expect(401);
    await http.post('/api/auth/login').send({ email: 'nessuno@officina.it', password: 'sbagliata' }).expect(401);
    const res = await http
      .post('/api/auth/login')
      .send({ email: 'titolare@officina.it', password: 'password-sicura-1' })
      .expect(200);
    const me = await http.get('/api/auth/me').set(auth(res.body)).expect(200);
    expect(me.body.azienda.ragioneSociale).toBe('Officina Demo S.r.l.');
  });

  it('le rotte protette richiedono il token', async () => {
    await http.get('/api/controparti').expect(401);
    await http.get('/api/controparti').set({ Authorization: 'Bearer non-valido' }).expect(401);
  });
});

describe('nucleo: isolamento tra aziende (RLS)', () => {
  let idConsumatore: string;

  it("un'azienda non vede le controparti dell'altra", async () => {
    const res = await http
      .post('/api/controparti')
      .set(auth(a))
      .send({ denominazione: 'Mario Rossi', email: 'mario@example.com' })
      .expect(201);
    idConsumatore = res.body.id;
    expect(res.body.tipo).toBe('cliente');

    const listaB = await http.get('/api/controparti').set(auth(b)).expect(200);
    expect(listaB.body).toEqual([]);
    await http.get(`/api/controparti/${idConsumatore}`).set(auth(b)).expect(404);
    await http.patch(`/api/controparti/${idConsumatore}`).set(auth(b)).send({ note: 'x' }).expect(404);
  });

  it('PATCH non cambia i campi non inviati', async () => {
    const res = await http
      .patch(`/api/controparti/${idConsumatore}`)
      .set(auth(a))
      .send({ telefono: '+39 333 0000000' })
      .expect(200);
    expect(res.body).toMatchObject({ tipo: 'cliente', denominazione: 'Mario Rossi', telefono: '+39 333 0000000' });
  });

  it('senza azienda impostata il database non restituisce righe', async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const { rows } = await db.query('select count(*)::int as n from controparti');
    await db.end();
    expect(rows[0].n).toBe(0);
  });
});

describe('modulo incassi', () => {
  let fattura: Fattura;

  it('importa una FatturaPA e crea il cliente', async () => {
    const res = await http.post('/api/fatture/import-xml').set(auth(a)).send({ xml }).expect(201);
    const body: ImportXmlResponse = res.body;
    fattura = body.fattura;
    expect(body.controparteCreata).toBe(true);
    expect(fattura).toMatchObject({ direzione: 'attiva', numero: '2026/0042', totaleCents: 244_000, origine: 'xml' });
    expect(fattura.controparte.denominazione).toBe('Cliente Demo S.p.A.');
    expect(fattura.scadenze.map((s) => s.dataScadenza)).toEqual(['2026-02-14', '2026-03-16']);

    const clienti = await http.get('/api/controparti?tipo=cliente').set(auth(a)).expect(200);
    const cliente = clienti.body.find((c: { partitaIva: string }) => c.partitaIva === '01234567897');
    expect(cliente.pec).toBe('amministrazione@pec.clientedemo.it');
  });

  it('non importa due volte la stessa fattura', async () => {
    await http.post('/api/fatture/import-xml').set(auth(a)).send({ xml }).expect(409);
  });

  it("rifiuta una fattura che non riguarda l'azienda", async () => {
    const res = await http.post('/api/fatture/import-xml').set(auth(b)).send({ xml }).expect(400);
    expect(res.body.message).toMatch(/non riguarda la tua azienda/);
  });

  it('registra un incasso in ritardo e blocca gli importi eccessivi', async () => {
    const rata1 = fattura.scadenze[0]!;
    await http
      .post(`/api/scadenze/${rata1.id}/pagamenti`)
      .set(auth(a))
      .send({ data: '2026-03-01', importoCents: 200_000 })
      .expect(400);
    const res = await http
      .post(`/api/scadenze/${rata1.id}/pagamenti`)
      .set(auth(a))
      .send({ data: '2026-03-01', importoCents: 122_000 })
      .expect(201);
    expect(res.body.scadenze[0].pagatoCents).toBe(122_000);
    await http.post(`/api/scadenze/${rata1.id}/pagamenti`).set(auth(b)).send({ data: '2026-03-01', importoCents: 1 }).expect(404);
  });

  it('crea una fattura manuale verso un consumatore (niente interessi)', async () => {
    const clienti = await http.get('/api/controparti?q=Rossi').set(auth(a)).expect(200);
    const res = await http
      .post('/api/fatture')
      .set(auth(a))
      .send({ controparteId: clienti.body[0].id, numero: '2026/0001', dataEmissione: '2026-01-01', totaleCents: 50_000 })
      .expect(201);
    expect(res.body.scadenze).toEqual([
      expect.objectContaining({ dataScadenza: '2026-01-31', importoCents: 50_000, pagatoCents: 0 }),
    ]);
  });

  it('calcola crediti scaduti, interessi di mora e indennizzi', async () => {
    const res = await http.get('/api/incassi/crediti-scaduti?alla=2026-04-15').set(auth(a)).expect(200);
    const c: CreditiScadutiResponse = res.body;

    const perFattura = Object.fromEntries(c.righe.map((r) => [`${r.numeroFattura}@${r.dataScadenza}`, r]));
    // Rata 1: 1.220 € pagati con 15 giorni di ritardo al 10,15% -> 5,09 €
    expect(perFattura['2026/0042@2026-02-14']).toMatchObject({
      stato: 'pagato_in_ritardo',
      residuoCents: 0,
      giorniRitardo: 15,
      interessiCents: 509,
    });
    // Rata 2: 1.220 € ancora aperti da 30 giorni -> 10,18 €
    expect(perFattura['2026/0042@2026-03-16']).toMatchObject({
      stato: 'scaduto',
      residuoCents: 122_000,
      giorniRitardo: 30,
      interessiCents: 1018,
    });
    // Consumatore: nessun interesse ex d.lgs. 231/2002
    expect(perFattura['2026/0001@2026-01-31']).toMatchObject({
      stato: 'scaduto',
      applicaInteressi: false,
      interessiCents: 0,
      giorniRitardo: 74,
    });

    expect(c.totali).toEqual({
      residuoCents: 172_000,
      interessiCents: 1527,
      indennizziCents: 4_000,
      totaleCents: 177_527,
    });
    expect(c.perCliente[0]).toMatchObject({ denominazione: 'Cliente Demo S.p.A.', fatture: 1, totaleCents: 127_527 });

    const vuoto = await http.get('/api/incassi/crediti-scaduti?alla=2026-04-15').set(auth(b)).expect(200);
    expect(vuoto.body.righe).toEqual([]);
  });

  it('rifiuta date non valide', async () => {
    await http.get('/api/incassi/crediti-scaduti?alla=2026-13-01').set(auth(a)).expect(400);
  });

  it('elimina una fattura con le sue scadenze', async () => {
    await http.delete(`/api/fatture/${fattura.id}`).set(auth(b)).expect(404);
    await http.delete(`/api/fatture/${fattura.id}`).set(auth(a)).expect(204);
    await http.get(`/api/fatture/${fattura.id}`).set(auth(a)).expect(404);
  });
});
