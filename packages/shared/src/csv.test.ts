import { describe, expect, it } from 'vitest';
import { creditiScadutiCsv, importoCsv, toCsv } from './csv';
import type { CreditiScadutiResponse } from './types';

describe('csv', () => {
  it('formatta gli importi con la virgola decimale', () => {
    expect(importoCsv(123_456)).toBe('1234,56');
    expect(importoCsv(5)).toBe('0,05');
    expect(importoCsv(-1_050)).toBe('-10,50');
  });

  it('usa il punto e virgola e mette tra virgolette quando serve', () => {
    expect(toCsv([['a', 'b;c', 'd "e"'], [1, null, 'riga\nnuova']])).toBe('a;"b;c";"d ""e"""\r\n1;;"riga\nnuova"');
  });

  it('neutralizza le formule (CSV injection)', () => {
    expect(toCsv([['=SOMMA(A1)', '+39 333', '-A1+1', '@x']])).toBe("'=SOMMA(A1);'+39 333;'-A1+1;'@x");
    expect(toCsv([[-5, '-10,50']])).toBe('-5;-10,50');
  });

  it('esporta i crediti scaduti con i totali', () => {
    const d: CreditiScadutiResponse = {
      alla: '2026-04-15',
      righe: [
        {
          scadenzaId: 's',
          fatturaId: 'f',
          numeroFattura: '2026/0042',
          dataEmissione: '2026-01-15',
          controparte: { id: 'c', denominazione: 'Cliente; Demo', pec: null, email: null },
          dataScadenza: '2026-03-16',
          importoCents: 122_000,
          residuoCents: 122_000,
          stato: 'scaduto',
          applicaInteressi: true,
          giorniRitardo: 30,
          interessiCents: 1_018,
          periodi: [],
        },
      ],
      perCliente: [],
      totali: { residuoCents: 122_000, interessiCents: 1_018, indennizziCents: 4_000, totaleCents: 127_018 },
    };
    const righe = creditiScadutiCsv(d).split('\r\n');
    expect(righe[0]).toMatch(/^Cliente;Fattura;Data fattura/);
    expect(righe[1]).toBe('"Cliente; Demo";2026/0042;15/01/2026;16/03/2026;30;1220,00;1220,00;10,18;Da incassare;Sì');
    expect(righe.at(-1)).toBe('Totale richiedibile;1270,18');
  });
});
