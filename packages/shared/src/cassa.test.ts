import { describe, expect, it } from 'vitest';
import { lunedi, previsioneCassa, type MovimentoPrevisto } from './cassa';

let n = 0;
const mov = (tipo: 'entrata' | 'uscita', dataScadenza: string, residuoCents: number): MovimentoPrevisto => ({
  scadenzaId: `s${++n}`,
  fatturaId: `f${n}`,
  numeroFattura: `${n}`,
  controparte: { id: 'c', denominazione: 'C' },
  tipo,
  dataScadenza,
  residuoCents,
});

const movimenti = [
  mov('entrata', '2026-10-10', 100_000),
  mov('uscita', '2026-10-15', 30_000),
  mov('entrata', '2026-09-30', 50_000), // credito scaduto
  mov('uscita', '2026-10-01', 20_000), // debito scaduto
  mov('entrata', '2027-06-01', 5_000), // fuori orizzonte
  mov('uscita', '2026-10-20', 200_000),
  mov('entrata', '2026-10-12', 0), // già pagata
];

describe('lunedi', () => {
  it('trova il lunedì della settimana', () => {
    expect(lunedi('2026-10-08')).toBe('2026-10-05');
    expect(lunedi('2026-10-11')).toBe('2026-10-05');
    expect(lunedi('2026-10-12')).toBe('2026-10-12');
  });
});

describe('previsioneCassa', () => {
  const p = previsioneCassa({ da: '2026-10-08', settimane: 13, saldoInizialeCents: 100_000, movimenti });

  it('divide in settimane lunedì-domenica, la prima parte da oggi', () => {
    expect(p.settimane).toHaveLength(13);
    expect(p.settimane[0]).toMatchObject({ dal: '2026-10-08', al: '2026-10-11' });
    expect(p.settimane[1]).toMatchObject({ dal: '2026-10-12', al: '2026-10-18' });
    expect(p.settimane[12]!.al).toBe('2027-01-03');
  });

  it('conta i debiti scaduti subito e lascia fuori i crediti scaduti', () => {
    expect(p.arretrati).toEqual({ entrateCents: 50_000, usciteCents: 20_000 });
    expect(p.settimane[0]).toMatchObject({ entrateCents: 100_000, usciteCents: 20_000, saldoCents: 180_000 });
    expect(p.settimane[1]).toMatchObject({ usciteCents: 30_000, saldoCents: 150_000 });
    expect(p.settimane[2]).toMatchObject({ usciteCents: 200_000, saldoCents: -50_000 });
    expect(p.totali).toEqual({ entrateCents: 100_000, usciteCents: 250_000 });
  });

  it('segnala il saldo minimo e la prima settimana in rosso', () => {
    expect(p.primaSettimanaNegativa).toBe('2026-10-19');
    expect(p.saldoMinimo).toEqual({ cents: -50_000, settimanaDal: '2026-10-19' });
  });

  it('su richiesta conta i crediti scaduti nella prima settimana', () => {
    const ottimista = previsioneCassa({
      da: '2026-10-08',
      settimane: 4,
      saldoInizialeCents: 100_000,
      movimenti,
      includiCreditiScaduti: true,
    });
    expect(ottimista.settimane[0]!.entrateCents).toBe(150_000);
    expect(ottimista.primaSettimanaNegativa).toBeNull();
  });

  it('rifiuta orizzonti assurdi', () => {
    expect(() => previsioneCassa({ da: '2026-10-08', settimane: 0, saldoInizialeCents: 0, movimenti: [] })).toThrow();
  });
});
