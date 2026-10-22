import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FatturaPAError, parseFatturaPA } from './fatturapa.parser';
import { notaDiCredito } from '../../test/note-credito';

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

  it('legge le note di credito con la fattura collegata', () => {
    const nota = parseFatturaPA(notaDiCredito(xml, { numero: 'NC-5', data: '2026-02-20', importo: '-500.00', rif: '2026/0042' }));
    expect(nota).toMatchObject({ tipoDocumento: 'TD04', numero: 'NC-5', totaleCents: 50_000, scadenze: [] });
    expect(nota.collegate).toEqual([{ numero: '2026/0042', data: '2026-01-15' }]);
    const senzaRif = parseFatturaPA(notaDiCredito(xml, { numero: 'NC-6', data: '2026-02-20', importo: '10.00' }));
    expect(senzaRif.avvisi[0]).toMatch(/abbinala a mano/);
  });

  it('rifiuta note di credito semplificate e file non validi', () => {
    expect(() => parseFatturaPA(xml.replace('TD01', 'TD08'))).toThrow(FatturaPAError);
    expect(() => parseFatturaPA('<html></html>')).toThrow(/non è una FatturaPA/);
  });
});
