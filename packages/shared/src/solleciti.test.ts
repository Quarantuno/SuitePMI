import { describe, expect, it } from 'vitest';
import { aziendaUpdateSchema, isIbanValido } from './schemas';
import { generaSollecito, SollecitoVuotoError, suggerisciLivello, type InputSollecito } from './solleciti';
import type { RigaCredito } from './types';

const riga = (over: Partial<RigaCredito>): RigaCredito => ({
  scadenzaId: 's1',
  fatturaId: 'f1',
  numeroFattura: '2026/0042',
  dataEmissione: '2026-01-15',
  controparte: { id: 'c1', denominazione: 'Cliente Demo S.p.A.', pec: null, email: null },
  dataScadenza: '2026-03-16',
  importoCents: 122_000,
  residuoCents: 122_000,
  stato: 'scaduto',
  applicaInteressi: true,
  giorniRitardo: 30,
  interessiCents: 1018,
  periodi: [],
  ...over,
});

const base: InputSollecito = {
  livello: 'promemoria',
  mittente: {
    ragioneSociale: 'Officina Demo S.r.l.',
    partitaIva: '12345678903',
    indirizzo: 'Via Roma 1, Milano',
    email: 'amministrazione@officina.it',
    pec: 'officina@pec.it',
    iban: 'IT60X0542811101000000123456',
  },
  destinatario: {
    denominazione: 'Cliente Demo S.p.A.',
    partitaIva: '01234567897',
    indirizzo: null,
    pec: 'amministrazione@pec.clientedemo.it',
    email: null,
  },
  righe: [
    riga({}),
    riga({ scadenzaId: 's0', dataScadenza: '2026-02-14', residuoCents: 0, stato: 'pagato_in_ritardo', giorniRitardo: 15, interessiCents: 509 }),
  ],
  alla: '2026-04-15',
  firmatario: 'Lorenzo',
};

describe('suggerisciLivello', () => {
  it('parte dal promemoria, o dal sollecito se il ritardo e lungo', () => {
    expect(suggerisciLivello([], '2026-04-15', 30).livello).toBe('promemoria');
    expect(suggerisciLivello([], '2026-04-15', 90).livello).toBe('sollecito');
  });

  it("sale di livello dopo l'ultimo invio e avvisa se e troppo presto", () => {
    const dopoPromemoria = suggerisciLivello([{ livello: 'promemoria', inviatoIl: '2026-04-01' }], '2026-04-15', 30);
    expect(dopoPromemoria.livello).toBe('sollecito');
    expect(dopoPromemoria.motivo).not.toMatch(/attendere/);

    const troppoPresto = suggerisciLivello([{ livello: 'sollecito', inviatoIl: '2026-04-12' }], '2026-04-15', 30);
    expect(troppoPresto.livello).toBe('diffida');
    expect(troppoPresto.motivo).toMatch(/solo 3 giorni/);
  });

  it("usa l'ultimo invio anche se lo storico non e ordinato", () => {
    const s = suggerisciLivello(
      [
        { livello: 'sollecito', inviatoIl: '2026-03-20' },
        { livello: 'promemoria', inviatoIl: '2026-03-01' },
        { livello: 'diffida', inviatoIl: '2026-04-01' },
      ],
      '2026-04-20',
      50,
    );
    expect(s.livello).toBe('diffida');
    expect(s.motivo).toMatch(/decreto ingiuntivo/);
  });
});

describe('generaSollecito', () => {
  it('il promemoria chiede solo il capitale aperto, con IBAN', () => {
    const r = generaSollecito(base);
    expect(r.righe).toHaveLength(1);
    expect(r.totaleCents).toBe(122_000);
    expect(r.interessiCents).toBe(0);
    expect(r.oggetto).toMatch(/^Promemoria/);
    expect(r.testo).toContain('IT60X0542811101000000123456');
    expect(r.testo).toContain('Fattura n. 2026/0042 del 15/01/2026');
    expect(r.testo).not.toMatch(/231\/2002/);
  });

  it("l'attacco cambia se ci sono stati solleciti precedenti", () => {
    expect(generaSollecito({ ...base, livello: 'sollecito' }).testo).not.toMatch(/nonostante/);
    expect(generaSollecito({ ...base, livello: 'sollecito', precedenti: 1 }).testo).toMatch(/nonostante il precedente promemoria/);
    expect(generaSollecito({ ...base, livello: 'diffida', precedenti: 2 }).testo).toMatch(/nonostante i precedenti solleciti/);
  });

  it('formatta gli importi con il separatore delle migliaia', () => {
    expect(generaSollecito(base).testo).toMatch(/1\.220,00\s€/);
  });

  it('il sollecito cita il d.lgs. 231/2002 solo verso imprese', () => {
    expect(generaSollecito({ ...base, livello: 'sollecito' }).testo).toMatch(/d\.lgs\. 231\/2002/);
    const consumatore = generaSollecito({
      ...base,
      livello: 'sollecito',
      destinatario: { ...base.destinatario, partitaIva: null },
    });
    expect(consumatore.testo).not.toMatch(/231\/2002/);
  });

  it('la diffida chiede capitale, interessi (anche su pagamenti tardivi) e 40 euro per fattura', () => {
    const r = generaSollecito({ ...base, livello: 'diffida' });
    expect(r.righe).toHaveLength(2);
    expect(r.capitaleCents).toBe(122_000);
    expect(r.interessiCents).toBe(1527);
    expect(r.indennizziCents).toBe(4_000); // stessa fattura: un solo indennizzo
    expect(r.totaleCents).toBe(127_527);
    expect(r.oggetto).toMatch(/costituzione in mora/);
    expect(r.testo).toMatch(/art\. 2943 c\.c\./);
    expect(r.testo).toMatch(/entro e non oltre 15 giorni/);
    expect(r.testo).toMatch(/pagata con 15 giorni di ritardo/);
  });

  it('senza importi aperti non genera promemoria', () => {
    const soloInteressi = { ...base, righe: [base.righe[1]!] };
    expect(() => generaSollecito(soloInteressi)).toThrow(SollecitoVuotoError);
    expect(generaSollecito({ ...soloInteressi, livello: 'diffida' }).totaleCents).toBe(509 + 4_000);
  });
});

describe('IBAN e dati azienda', () => {
  it('verifica il codice di controllo', () => {
    expect(isIbanValido('IT60 X054 2811 1010 0000 0123 456')).toBe(true);
    expect(isIbanValido('IT61X0542811101000000123456')).toBe(false);
    expect(isIbanValido('IT60X054281110100000012345')).toBe(false);
  });
  it('normalizza e permette di cancellare i campi', () => {
    const r = aziendaUpdateSchema.parse({ iban: 'it60 x054 2811 1010 0000 0123 456', pec: '' });
    expect(r).toEqual({ iban: 'IT60X0542811101000000123456', pec: null });
  });
});
