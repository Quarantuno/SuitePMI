import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FatturaPAError, parseFatturaPA, parseFatturaPALotto } from './fatturapa.parser';
import { notaDiCredito } from '../../test/note-credito';
import { lotto, semplificata, variante } from '../../test/xml-builder';

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

  it('legge tutti i documenti di un lotto con lo stesso header', () => {
    const docs = parseFatturaPALotto(
      lotto(
        xml,
        variante(xml, { numero: '2026/0043', data: '2026-01-20' }),
        notaDiCredito(xml, { numero: 'NC-9', data: '2026-01-25', importo: '100.00', rif: '2026/0043', rifData: '2026-01-20' }),
      ),
    );
    expect(docs.map((d) => [d.tipoDocumento, d.numero, d.data])).toEqual([
      ['TD01', '2026/0042', '2026-01-15'],
      ['TD01', '2026/0043', '2026-01-20'],
      ['TD04', 'NC-9', '2026-01-25'],
    ]);
    expect(docs.every((d) => d.cessionario.partitaIva === '01234567897')).toBe(true);
    expect(docs[2]!.collegate).toEqual([{ numero: '2026/0043', data: '2026-01-20' }]);
    expect(docs[0]!.avvisi).toEqual([]);
  });

  it('legge le fatture semplificate TD07 come fatture a 30 giorni', () => {
    const f = parseFatturaPA(semplificata({ numero: 'S-1', data: '2026-03-02', righe: ['122.00', '61.00'] }));
    expect(f).toMatchObject({ tipoDocumento: 'TD01', numero: 'S-1', totaleCents: 18_300, collegate: [] });
    expect(f.cedente).toMatchObject({ denominazione: 'Officina Demo S.r.l.', partitaIva: '12345678903' });
    expect(f.cessionario).toMatchObject({ denominazione: 'Cliente Demo S.p.A.', partitaIva: '01234567897' });
    expect(f.scadenze).toEqual([{ dataScadenza: '2026-04-01', importoCents: 18_300 }]);
    expect(f.avvisi.join(' ')).toMatch(/semplificata \(TD07\)/);
  });

  it('legge un consumatore con solo codice fiscale', () => {
    const f = parseFatturaPA(
      semplificata({ numero: 'S-2', data: '2026-03-02', righe: ['50.00'], cessionario: { cf: 'RSSMRA80A01H501U', nome: 'Mario', cognome: 'Rossi' } }),
    );
    expect(f.cessionario).toMatchObject({ denominazione: 'Mario Rossi', partitaIva: null, codiceFiscale: 'RSSMRA80A01H501U' });
  });

  it('legge le note di credito semplificate TD08 come note di credito', () => {
    const n = parseFatturaPA(
      semplificata({ tipo: 'TD08', numero: 'NS-1', data: '2026-03-10', righe: ['-30.50'], rif: { numero: 'S-1', data: '2026-03-02' } }),
    );
    expect(n).toMatchObject({ tipoDocumento: 'TD04', totaleCents: 3_050, scadenze: [] });
    expect(n.collegate).toEqual([{ numero: 'S-1', data: '2026-03-02' }]);
  });

  it('rifiuta i file non validi', () => {
    expect(() => parseFatturaPA('<html></html>')).toThrow(/non è una FatturaPA/);
    expect(() => parseFatturaPA('<a><b></a>')).toThrow(FatturaPAError);
  });
});
