import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { addDays, todayIso, type AuthResponse, type EsitoSollecitiAuto, type PianoSollecitiAuto, type Sollecito } from '@suite/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { Mailer, type Messaggio } from '../src/solleciti/mailer';
import { oraItaliana, SollecitiScheduler } from '../src/solleciti/solleciti.scheduler';

class FakeMailer extends Mailer {
  inviati: Messaggio[] = [];
  pecDisponibile() {
    return true;
  }
  async send(m: Messaggio) {
    if (m.to.startsWith('rotto@')) throw new Error('Casella inesistente');
    this.inviati.push(m);
    return { messageId: `fake-${this.inviati.length}` };
  }
}

const mailer = new FakeMailer();
let app: INestApplication;
let http: ReturnType<typeof request>;
let az: AuthResponse;
const auth = () => ({ Authorization: `Bearer ${az.token}` });
const oggi = todayIso();
const ids: Record<string, string> = {};

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Mailer).useValue(mailer).compile();
  app = configureApp(moduleRef.createNestApplication({ bodyParser: false }));
  await app.init();
  http = request(app.getHttpServer());
  az = (
    await http
      .post('/api/auth/register')
      .send({ email: 'auto@test.it', password: 'password-sicura-1', nome: 'Lorenzo Rossi', ragioneSociale: 'Auto Demo S.r.l.', partitaIva: '55566677781' })
      .expect(201)
  ).body;
  await http.patch('/api/azienda').set(auth()).send({ email: 'amm@autodemo.it', iban: 'IT60X0542811101000000123456' }).expect(200);

  // Fattura con scadenza a 30 giorni: per un ritardo di N giorni la data è oggi - 30 - N.
  const cliente = async (nome: string, ritardo: number, extra: Record<string, unknown> = {}) => {
    const c = await http.post('/api/controparti').set(auth()).send({ denominazione: nome, partitaIva: undefined, ...extra }).expect(201);
    ids[nome] = c.body.id;
    await http
      .post('/api/fatture')
      .set(auth())
      .send({ controparteId: c.body.id, numero: `F-${nome}`, dataEmissione: addDays(oggi, -30 - ritardo), totaleCents: 50_000 })
      .expect(201);
  };
  await cliente('Vecchio', 90, { email: 'vecchio@cliente.it' });
  await cliente('Recente', 10, { email: 'recente@cliente.it' });
  await cliente('Senza contatti', 20);
  await cliente('Escluso', 20, { email: 'escluso@cliente.it', sollecitiAutomatici: false });
  await cliente('Appena scaduto', 3, { email: 'appena@cliente.it' });
  await cliente('Rotto', 20, { email: 'rotto@cliente.it' });
});

afterAll(async () => {
  await app?.close();
});

const piano = async (): Promise<PianoSollecitiAuto> => (await http.get('/api/solleciti/automatici/piano').set(auth()).expect(200)).body;
const decisione = (p: PianoSollecitiAuto, nome: string) => p.righe.find((r) => r.controparte.id === ids[nome])!.decisione;

describe('solleciti automatici', () => {
  it('sono spenti di default', async () => {
    expect((await http.get('/api/azienda').set(auth()).expect(200)).body).toMatchObject({
      sollecitiAutoAttivi: false,
      sollecitiAutoGiorni: 7,
      sollecitiAutoLivelloMax: 'sollecito',
    });
    expect((await piano()).attivi).toBe(false);
    await http.post('/api/solleciti/automatici/esegui').set(auth()).expect(400);
  });

  it('il piano spiega cosa partirebbe per ogni cliente', async () => {
    await http.patch('/api/azienda').set(auth()).send({ sollecitiAutoAttivi: true, sollecitiAutoGiorni: 7 }).expect(200);
    const p = await piano();
    expect(p).toMatchObject({ data: oggi, attivi: true });
    expect(p.righe.map((r) => r.controparte.denominazione)[0]).toBe('Vecchio'); // il ritardo più grave per primo
    expect(decisione(p, 'Vecchio')).toMatchObject({ azione: 'invia', livello: 'sollecito', canale: 'email', destinatario: 'vecchio@cliente.it' });
    expect(decisione(p, 'Recente')).toMatchObject({ azione: 'invia', livello: 'promemoria' });
    expect(decisione(p, 'Senza contatti')).toMatchObject({ azione: 'salta', motivo: expect.stringMatching(/né email né PEC/) });
    expect(decisione(p, 'Escluso')).toMatchObject({ azione: 'salta', motivo: expect.stringMatching(/escluso/) });
    expect(p.righe.find((r) => r.controparte.id === ids['Escluso'])!.escluso).toBe(true);
    expect(decisione(p, 'Appena scaduto')).toMatchObject({ azione: 'salta', motivo: expect.stringMatching(/dopo 7/) });
  });

  it('esegue il giro: invia, segna come automatici e scarta le bozze non inviate', async () => {
    const res = await http.post('/api/solleciti/automatici/esegui').set(auth()).expect(200);
    const esito: EsitoSollecitiAuto = res.body;
    expect(esito.inviati.map((s) => [s.controparte.denominazione, s.livello, s.automatico])).toEqual([
      ['Vecchio', 'sollecito', true],
      ['Recente', 'promemoria', true],
    ]);
    expect(esito.errori).toEqual([{ controparte: { id: ids['Rotto'], denominazione: 'Rotto' }, messaggio: 'Invio non riuscito: Casella inesistente' }]);
    expect(mailer.inviati.map((m) => m.to)).toEqual(['vecchio@cliente.it', 'recente@cliente.it']);
    expect(mailer.inviati[0]!.text).toContain('Lorenzo Rossi');

    const tutti: Sollecito[] = (await http.get('/api/solleciti').set(auth()).expect(200)).body;
    expect(tutti).toHaveLength(2); // la bozza per "Rotto" è stata tolta
    expect((await http.get('/api/azienda').set(auth()).expect(200)).body.sollecitiAutoUltimaEsecuzione).toBe(oggi);
  });

  it('un secondo giro nello stesso giorno non reinvia nulla', async () => {
    const esito: EsitoSollecitiAuto = (await http.post('/api/solleciti/automatici/esegui').set(auth()).expect(200)).body;
    expect(esito.inviati).toEqual([]);
    expect(decisione(await piano(), 'Vecchio')).toMatchObject({ azione: 'salta', motivo: expect.stringMatching(/inviato oggi/) });
    expect(mailer.inviati).toHaveLength(2);
  });

  it("lo scheduler parte dall'ora configurata e una sola volta al giorno", async () => {
    const scheduler = app.get(SollecitiScheduler);
    expect(oraItaliana(new Date('2026-07-01T06:30:00Z'))).toEqual({ data: '2026-07-01', ora: 8 });
    expect(oraItaliana(new Date('2026-12-31T23:30:00Z'))).toEqual({ data: '2027-01-01', ora: 0 });
    // Domani alle 8 ora italiana: troppo presto
    const domani = addDays(oggi, 1);
    expect(await scheduler.tick(new Date(`${domani}T06:00:00Z`))).toBe(0);
    // Domani alle 10: prende l'azienda una volta sola (e non invia: le attese non sono passate)
    expect(await scheduler.tick(new Date(`${domani}T08:00:00Z`))).toBe(1);
    expect(await scheduler.tick(new Date(`${domani}T09:00:00Z`))).toBe(0);
    expect(mailer.inviati).toHaveLength(2);
  });
});
