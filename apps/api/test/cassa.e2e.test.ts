import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResponse, Fattura, PrevisioneCassaResponse } from '@suite/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';

let app: INestApplication;
let http: ReturnType<typeof request>;
let a: AuthResponse;
const auth = () => ({ Authorization: `Bearer ${a.token}` });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication({ bodyParser: false }));
  await app.init();
  http = request(app.getHttpServer());
  a = (
    await http
      .post('/api/auth/register')
      .send({ email: 'cassa@test.it', password: 'password-sicura-1', nome: 'Lorenzo', ragioneSociale: 'Cassa Demo', partitaIva: '33344455564' })
      .expect(201)
  ).body;
});

afterAll(async () => {
  await app?.close();
});

describe('previsione di cassa', () => {
  it('salva il saldo di cassa, datato a oggi se manca la data', async () => {
    const res = await http.patch('/api/azienda').set(auth()).send({ saldoCassaCents: 100_000 }).expect(200);
    expect(res.body.saldoCassaCents).toBe(100_000);
    expect(res.body.saldoCassaAl).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('costruisce settimane, saldo progressivo e scadenzario', async () => {
    const cliente = (await http.post('/api/controparti').set(auth()).send({ denominazione: 'Cliente', tipo: 'cliente' }).expect(201)).body.id;
    const fornitore = (await http.post('/api/controparti').set(auth()).send({ denominazione: 'Fornitore', tipo: 'fornitore' }).expect(201)).body.id;
    const fattura = (body: object) => http.post('/api/fatture').set(auth()).send(body).expect(201).then((r) => r.body as Fattura);

    const a1 = await fattura({ controparteId: cliente, numero: 'A1', dataEmissione: '2026-09-10', totaleCents: 100_000 });
    await fattura({ controparteId: cliente, numero: 'A2', dataEmissione: '2026-08-01', totaleCents: 50_000 });
    await fattura({ controparteId: fornitore, direzione: 'passiva', numero: 'P1', dataEmissione: '2026-09-20', totaleCents: 200_000 });
    await http.post(`/api/scadenze/${a1.scadenze[0]!.id}/pagamenti`).set(auth()).send({ data: '2026-09-15', importoCents: 40_000 }).expect(201);

    const p: PrevisioneCassaResponse = (
      await http.get('/api/cassa/previsione?da=2026-10-08&settimane=13').set(auth()).expect(200)
    ).body;

    expect(p.saldo.cents).toBe(100_000);
    expect(p.settimane).toHaveLength(13);
    expect(p.settimane[0]).toMatchObject({ dal: '2026-10-08', entrateCents: 60_000, saldoCents: 160_000 });
    expect(p.settimane[2]).toMatchObject({ dal: '2026-10-19', usciteCents: 200_000, saldoCents: -40_000 });
    expect(p.primaSettimanaNegativa).toBe('2026-10-19');
    expect(p.arretrati).toEqual({ entrateCents: 50_000, usciteCents: 0 });
    expect(p.movimenti.map((m) => [m.numeroFattura, m.tipo, m.residuoCents, m.scaduta])).toEqual([
      ['A2', 'entrata', 50_000, true],
      ['A1', 'entrata', 60_000, false],
      ['P1', 'uscita', 200_000, false],
    ]);

    const ottimista: PrevisioneCassaResponse = (
      await http.get('/api/cassa/previsione?da=2026-10-08&settimane=4&includiCreditiScaduti=true').set(auth()).expect(200)
    ).body;
    expect(ottimista.settimane[0]!.entrateCents).toBe(110_000);
    expect(ottimista.primaSettimanaNegativa).toBeNull();
  });

  it('valida i parametri', async () => {
    await http.get('/api/cassa/previsione?settimane=100').set(auth()).expect(400);
    await http.get('/api/cassa/previsione?da=ieri').set(auth()).expect(400);
  });
});
