import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AnteprimaSollecito, AuthResponse, CreditiScadutiResponse, Sollecito } from '@suite/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { Mailer, type Messaggio } from '../src/solleciti/mailer';

class FakeMailer extends Mailer {
  inviati: Messaggio[] = [];
  pecDisponibile() {
    return true;
  }
  async send(m: Messaggio) {
    this.inviati.push(m);
    return { messageId: `fake-${this.inviati.length}` };
  }
}

const mailer = new FakeMailer();
let app: INestApplication;
let http: ReturnType<typeof request>;
let s: AuthResponse; // azienda che sollecita, P.IVA 11122233346
let altra: AuthResponse; // un'altra azienda, P.IVA 22233344450
let cliente: string;
let consumatore: string;

const auth = (a: AuthResponse) => ({ Authorization: `Bearer ${a.token}` });
const IBAN = 'IT60X0542811101000000123456';

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .compile();
  app = configureApp(moduleRef.createNestApplication({ bodyParser: false }));
  await app.init();
  http = request(app.getHttpServer());

  const reg = (email: string, partitaIva: string, ragioneSociale: string) =>
    http
      .post('/api/auth/register')
      .send({ email, password: 'password-sicura-1', nome: 'Lorenzo Rossi', ragioneSociale, partitaIva })
      .expect(201)
      .then((r) => r.body as AuthResponse);
  s = await reg('sol@test.it', '11122233346', 'Solleciti Demo S.r.l.');
  altra = await reg('altra@test.it', '22233344450', 'Altra S.r.l.');
});

afterAll(async () => {
  await app?.close();
});

describe('impostazioni azienda', () => {
  it("valida l'IBAN e salva i dati per le lettere", async () => {
    await http.patch('/api/azienda').set(auth(s)).send({ iban: 'IT00X0000000000000000000000' }).expect(400);
    const res = await http
      .patch('/api/azienda')
      .set(auth(s))
      .send({ iban: 'it60 x054 2811 1010 0000 0123 456', pec: 'solleciti@pec.demo.it', email: 'amm@demo.it', indirizzo: 'Via Roma 1, Milano' })
      .expect(200);
    expect(res.body).toMatchObject({ iban: IBAN, pec: 'solleciti@pec.demo.it', partitaIva: '11122233346' });
    const altraAz = await http.get('/api/azienda').set(auth(altra)).expect(200);
    expect(altraAz.body.iban).toBeNull();
  });
});

describe('solleciti', () => {
  let promemoria: Sollecito;

  it('prepara clienti e fatture scadute', async () => {
    const c = await http
      .post('/api/controparti')
      .set(auth(s))
      .send({ denominazione: 'Cliente B2B S.p.A.', partitaIva: '01234567897', email: 'amm@cliente.it', pec: 'cliente@pec.it' })
      .expect(201);
    cliente = c.body.id;
    await http
      .post('/api/fatture')
      .set(auth(s))
      .send({ controparteId: cliente, numero: 'S-1', dataEmissione: '2026-01-01', totaleCents: 100_000 })
      .expect(201);

    const p = await http.post('/api/controparti').set(auth(s)).send({ denominazione: 'Maria Bianchi' }).expect(201);
    consumatore = p.body.id;
    await http
      .post('/api/fatture')
      .set(auth(s))
      .send({ controparteId: consumatore, numero: 'S-2', dataEmissione: '2026-01-01', totaleCents: 30_000 })
      .expect(201);
  });

  it('suggerisce il promemoria come primo contatto', async () => {
    const res = await http
      .post('/api/solleciti/anteprima')
      .set(auth(s))
      .send({ controparteId: cliente, alla: '2026-03-02' })
      .expect(200);
    const a: AnteprimaSollecito = res.body;
    expect(a.livello).toBe('promemoria');
    expect(a.totaleCents).toBe(100_000);
    expect(a.testo).toContain(IBAN);
    expect(a.testo).toContain('Lorenzo Rossi');
    expect(a.avvisi).toEqual([]);
  });

  it('salva la bozza con il testo modificato e produce il PDF', async () => {
    const a = (
      await http.post('/api/solleciti/anteprima').set(auth(s)).send({ controparteId: cliente, alla: '2026-03-02' })
    ).body as AnteprimaSollecito;
    const res = await http
      .post('/api/solleciti')
      .set(auth(s))
      .send({ controparteId: cliente, livello: 'promemoria', alla: '2026-03-02', oggetto: a.oggetto, testo: `${a.testo}\n\nP.S. Grazie!` })
      .expect(201);
    promemoria = res.body;
    expect(promemoria).toMatchObject({ stato: 'bozza', totaleCents: 100_000, canale: null });
    expect(promemoria.testo).toMatch(/P\.S\. Grazie!$/);

    const pdf = await http
      .get(`/api/solleciti/${promemoria.id}/pdf`)
      .set(auth(s))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('promemoria-cliente-b2b-s-p-a-2026-03-02.pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it("un'altra azienda non vede i solleciti", async () => {
    expect((await http.get('/api/solleciti').set(auth(altra)).expect(200)).body).toEqual([]);
    await http.get(`/api/solleciti/${promemoria.id}/pdf`).set(auth(altra)).expect(404);
    await http.post(`/api/solleciti/${promemoria.id}/invia`).set(auth(altra)).send({ canale: 'manuale' }).expect(404);
  });

  it("invia via email con il PDF allegato e non permette un secondo invio", async () => {
    const res = await http.post(`/api/solleciti/${promemoria.id}/invia`).set(auth(s)).send({ canale: 'email' }).expect(200);
    expect(res.body).toMatchObject({ stato: 'inviato', canale: 'email', destinatario: 'amm@cliente.it' });

    expect(mailer.inviati).toHaveLength(1);
    const m = mailer.inviati[0]!;
    expect(m).toMatchObject({ canale: 'email', to: 'amm@cliente.it', replyTo: 'amm@demo.it', subject: promemoria.oggetto });
    expect(m.attachments?.[0]?.contentType).toBe('application/pdf');

    await http.post(`/api/solleciti/${promemoria.id}/invia`).set(auth(s)).send({ canale: 'email' }).expect(409);
    await http.delete(`/api/solleciti/${promemoria.id}`).set(auth(s)).expect(409);
  });

  it('dopo il promemoria suggerisce il sollecito e lo mostra nei crediti', async () => {
    const a = (
      await http.post('/api/solleciti/anteprima').set(auth(s)).send({ controparteId: cliente, alla: '2026-03-02' })
    ).body as AnteprimaSollecito;
    expect(a.suggerito.livello).toBe('sollecito');

    const crediti: CreditiScadutiResponse = (
      await http.get('/api/incassi/crediti-scaduti?alla=2026-03-02').set(auth(s)).expect(200)
    ).body;
    const riga = crediti.perCliente.find((c) => c.controparteId === cliente)!;
    expect(riga.ultimoSollecito?.livello).toBe('promemoria');
    expect(crediti.perCliente.find((c) => c.controparteId === consumatore)!.ultimoSollecito).toBeNull();
  });

  it('la diffida include interessi e indennizzo e parte via PEC', async () => {
    const a = (
      await http
        .post('/api/solleciti/anteprima')
        .set(auth(s))
        .send({ controparteId: cliente, livello: 'diffida', alla: '2026-03-02' })
        .expect(200)
    ).body as AnteprimaSollecito;
    // 1.000 € x 10,15% x 30/365 = 8,34 €, piu 40 € di indennizzo
    expect(a).toMatchObject({ livello: 'diffida', capitaleCents: 100_000, interessiCents: 834, indennizziCents: 4_000, totaleCents: 104_834 });
    expect(a.avvisi).toEqual([]);

    const bozza = (
      await http
        .post('/api/solleciti')
        .set(auth(s))
        .send({ controparteId: cliente, livello: 'diffida', alla: '2026-03-02', oggetto: a.oggetto, testo: a.testo })
        .expect(201)
    ).body as Sollecito;
    const inviata = await http.post(`/api/solleciti/${bozza.id}/invia`).set(auth(s)).send({ canale: 'pec' }).expect(200);
    expect(inviata.body).toMatchObject({ canale: 'pec', destinatario: 'cliente@pec.it' });
    expect(mailer.inviati.at(-1)).toMatchObject({ canale: 'pec', to: 'cliente@pec.it', replyTo: 'solleciti@pec.demo.it' });
  });

  it('registra un invio fatto fuori dalla app', async () => {
    const a = (
      await http.post('/api/solleciti/anteprima').set(auth(s)).send({ controparteId: consumatore, livello: 'sollecito', alla: '2026-03-02' })
    ).body as AnteprimaSollecito;
    const bozza = (
      await http
        .post('/api/solleciti')
        .set(auth(s))
        .send({ controparteId: consumatore, livello: 'sollecito', alla: '2026-03-02', oggetto: a.oggetto, testo: a.testo })
        .expect(201)
    ).body as Sollecito;
    const inviati = mailer.inviati.length;
    const res = await http
      .post(`/api/solleciti/${bozza.id}/invia`)
      .set(auth(s))
      .send({ canale: 'manuale', inviatoIl: '2026-03-05' })
      .expect(200);
    expect(res.body).toMatchObject({ stato: 'inviato', canale: 'manuale', inviatoIl: '2026-03-05' });
    expect(mailer.inviati).toHaveLength(inviati);
  });

  it('verso un consumatore niente interessi, e avvisa', async () => {
    const a = (
      await http
        .post('/api/solleciti/anteprima')
        .set(auth(s))
        .send({ controparteId: consumatore, livello: 'diffida', alla: '2026-03-02' })
        .expect(200)
    ).body as AnteprimaSollecito;
    expect(a).toMatchObject({ interessiCents: 0, indennizziCents: 0, totaleCents: 30_000 });
    expect(a.avvisi.join(' ')).toMatch(/consumatore/);
    expect(a.testo).not.toMatch(/231\/2002/);
  });

  it("senza email del cliente chiede il destinatario", async () => {
    const a = (
      await http.post('/api/solleciti/anteprima').set(auth(s)).send({ controparteId: consumatore, livello: 'promemoria', alla: '2026-03-02' })
    ).body as AnteprimaSollecito;
    const bozza = (
      await http
        .post('/api/solleciti')
        .set(auth(s))
        .send({ controparteId: consumatore, livello: 'promemoria', alla: '2026-03-02', oggetto: a.oggetto, testo: a.testo })
    ).body as Sollecito;
    const err = await http.post(`/api/solleciti/${bozza.id}/invia`).set(auth(s)).send({ canale: 'email' }).expect(400);
    expect(err.body.message).toMatch(/indica il destinatario/);
    await http
      .post(`/api/solleciti/${bozza.id}/invia`)
      .set(auth(s))
      .send({ canale: 'email', destinatario: 'maria@example.com' })
      .expect(200);
    expect(mailer.inviati.at(-1)?.to).toBe('maria@example.com');
  });

  it('rifiuta un sollecito senza fatture scadute', async () => {
    const c = await http.post('/api/controparti').set(auth(s)).send({ denominazione: 'Puntuale S.r.l.' }).expect(201);
    const res = await http.post('/api/solleciti/anteprima').set(auth(s)).send({ controparteId: c.body.id }).expect(400);
    expect(res.body.message).toMatch(/Nessuna fattura scaduta/);
  });

  it('elenca lo storico per cliente', async () => {
    const res = await http.get(`/api/solleciti?controparteId=${cliente}`).set(auth(s)).expect(200);
    expect(res.body.map((x: Sollecito) => x.livello)).toEqual(['diffida', 'promemoria']);
  });
});
