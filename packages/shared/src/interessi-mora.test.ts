import { describe, expect, it } from 'vitest';
import { calcolaInteressiMora } from './interessi-mora';
import { semestrePer } from './tassi-mora';
import { isPartitaIvaValida } from './schemas';
import { daysBetween, addDays, isIsoDate } from './date';
import { parseEuroToCents } from './format';

describe('date', () => {
  it('conta i giorni e somma giorni in UTC', () => {
    expect(daysBetween('2025-12-31', '2026-03-31')).toBe(90);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('rifiuta date impossibili', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
  });
});

describe('semestrePer', () => {
  it('restituisce il tasso BCE + 8 punti del semestre', () => {
    expect(semestrePer('2026-03-15')).toMatchObject({ dal: '2026-01-01', al: '2026-07-01', bpsMora: 1015 });
    expect(semestrePer('2026-07-01')).toMatchObject({ dal: '2026-07-01', al: '2027-01-01', bpsMora: 1040 });
    expect(semestrePer('2020-05-05').bpsMora).toBe(800);
  });
  it('segnala i semestri senza tasso', () => {
    expect(() => semestrePer('2015-06-30')).toThrow(/non disponibile/);
    expect(() => semestrePer('2027-01-01')).toThrow(/non ancora inserito/);
  });
});

describe('calcolaInteressiMora', () => {
  it('calcola 90 giorni di ritardo in un solo semestre', () => {
    const r = calcolaInteressiMora({ importoCents: 100_000, scadenza: '2025-12-31', pagamenti: [], alla: '2026-03-31' });
    // 1.000 € x 10,15% x 90/365 = 25,027 €
    expect(r.interessiCents).toBe(2503);
    expect(r.giorniRitardo).toBe(90);
    expect(r.residuoCents).toBe(100_000);
    expect(r.saldataIl).toBeNull();
    expect(r.periodi).toHaveLength(1);
    expect(r.periodi[0]).toMatchObject({ dal: '2026-01-01', al: '2026-03-31', giorni: 90 });
  });

  it('applica tassi diversi a cavallo di due semestri', () => {
    const r = calcolaInteressiMora({ importoCents: 100_000, scadenza: '2026-06-20', pagamenti: [], alla: '2026-07-10' });
    // 10 gg al 10,15% (278,08 cent) + 10 gg al 10,40% (284,93 cent)
    expect(r.periodi.map((p) => [p.giorni, p.bpsMora])).toEqual([
      [10, 1015],
      [10, 1040],
    ]);
    expect(r.interessiCents).toBe(563);
  });

  it('riduce la base dopo un pagamento parziale', () => {
    const r = calcolaInteressiMora({
      importoCents: 100_000,
      scadenza: '2026-01-31',
      pagamenti: [{ data: '2026-02-10', importoCents: 40_000 }],
      alla: '2026-02-20',
    });
    // 10 gg su 1.000 € + 10 gg su 600 €
    expect(r.periodi.map((p) => [p.giorni, p.baseCents])).toEqual([
      [10, 100_000],
      [10, 60_000],
    ]);
    expect(r.interessiCents).toBe(445);
    expect(r.residuoCents).toBe(60_000);
    expect(r.giorniRitardo).toBe(20);
  });

  it('conta gli interessi anche su una fattura pagata in ritardo', () => {
    const r = calcolaInteressiMora({
      importoCents: 100_000,
      scadenza: '2026-01-31',
      pagamenti: [{ data: '2026-02-15', importoCents: 100_000 }],
      alla: '2026-09-27',
    });
    expect(r.saldataIl).toBe('2026-02-15');
    expect(r.giorniRitardo).toBe(15);
    expect(r.residuoCents).toBe(0);
    expect(r.interessiCents).toBe(417);
  });

  it('non conta interessi se il pagamento arriva entro la scadenza', () => {
    const r = calcolaInteressiMora({
      importoCents: 100_000,
      scadenza: '2026-01-31',
      pagamenti: [{ data: '2026-01-31', importoCents: 100_000 }],
      alla: '2026-09-27',
    });
    expect(r.interessiCents).toBe(0);
    expect(r.giorniRitardo).toBe(0);
    expect(r.periodi).toHaveLength(0);
  });

  it('non conta interessi prima della scadenza', () => {
    const r = calcolaInteressiMora({ importoCents: 100_000, scadenza: '2026-10-31', pagamenti: [], alla: '2026-09-27' });
    expect(r.interessiCents).toBe(0);
    expect(r.giorniRitardo).toBe(0);
  });

  it('ignora i pagamenti successivi alla data di calcolo', () => {
    const r = calcolaInteressiMora({
      importoCents: 100_000,
      scadenza: '2026-01-31',
      pagamenti: [{ data: '2026-03-01', importoCents: 100_000 }],
      alla: '2026-02-10',
    });
    expect(r.residuoCents).toBe(100_000);
    expect(r.saldataIl).toBeNull();
    expect(r.giorniRitardo).toBe(10);
  });
});

describe('validazioni', () => {
  it('verifica la cifra di controllo della partita IVA', () => {
    expect(isPartitaIvaValida('12345678903')).toBe(true);
    expect(isPartitaIvaValida('12345678901')).toBe(false);
    expect(isPartitaIvaValida('1234567890')).toBe(false);
  });
  it('converte importi in formato italiano', () => {
    expect(parseEuroToCents('1.234,56')).toBe(123_456);
    expect(parseEuroToCents('1234.5')).toBe(123_450);
    expect(parseEuroToCents('€ 40')).toBe(4_000);
  });
});
