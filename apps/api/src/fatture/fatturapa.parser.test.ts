import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FatturaPAError, parseFatturaPA } from './fatturapa.parser';

const xml = readFileSync(join(__dirname, '../../test/fixtures/fattura-attiva.xml'), 'utf8');

describe('parseFatturaPA', () => {
  it('legge soggetti, totale e rate', () => {
    const f = parseFatturaPA(xml);
    expect(f.numero).toBe('2026/0042');
    expect(f.data).toBe('2026-01-15');
    expect(f.totaleCents).toBe(244_000);
    expect(f.cedente).toMatchObject({ denominazione: 'Officina Demo S.r.l.', partitaIva: '12345678903' });
    expect(f.cessionario.partitaIva).toBe('01234567897');
    expect(f.cessionario.indirizzo).toBe('Corso Italia 10, 10100 Torino (TO)');
    expect(f.pecDestinatario).toBe('amministrazione@pec.clientedemo.it');
    expect(f.scadenze).toEqual([
      { dataScadenza: '2026-02-14', importoCents: 122_000 },
      { dataScadenza: '2026-03-16', importoCents: 122_000 },
    ]);
    expect(f.avvisi).toEqual([]);
  });

  it('senza dati di pagamento usa il termine legale di 30 giorni', () => {
    const senzaPagamento = xml.replace(/<DatiPagamento>[\s\S]*<\/DatiPagamento>/, '');
    const f = parseFatturaPA(senzaPagamento);
    expect(f.scadenze).toEqual([{ dataScadenza: '2026-02-14', importoCents: 244_000 }]);
    expect(f.avvisi[0]).toMatch(/30 giorni/);
  });

  it('calcola la scadenza dai giorni di termine', () => {
    const conGiorni = xml.replace(
      '<DataScadenzaPagamento>2026-02-14</DataScadenzaPagamento>',
      '<DataRiferimentoTerminiPagamento>2026-01-31</DataRiferimentoTerminiPagamento><GiorniTerminiPagamento>60</GiorniTerminiPagamento>',
    );
    expect(parseFatturaPA(conGiorni).scadenze[0]!.dataScadenza).toBe('2026-04-01');
  });

  it('rifiuta note di credito e file non validi', () => {
    expect(() => parseFatturaPA(xml.replace('TD01', 'TD04'))).toThrow(FatturaPAError);
    expect(() => parseFatturaPA('<html></html>')).toThrow(/non e una FatturaPA/);
  });
});
