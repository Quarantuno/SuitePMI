import { formatData } from './format';
import type { CreditiScadutiResponse } from './types';

/**
 * CSV per Excel in italiano: separatore ";" e virgola decimale, così il file si apre
 * già in colonne. Va salvato con BOM UTF-8 (vedi CSV_BOM) per gli accenti.
 */
export const CSV_BOM = '\uFEFF';

function cella(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Evita che Excel interpreti come formula un testo che inizia con = + - @ (CSV injection).
  // Un numero negativo come "-10,50" resta un numero.
  const sicuro = typeof v === 'string' && /^(?:[=+@\t\r]|-(?![\d,.]+$))/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(sicuro) ? `"${sicuro.replace(/"/g, '""')}"` : sicuro;
}

export function toCsv(righe: (string | number | null | undefined)[][]): string {
  return righe.map((r) => r.map(cella).join(';')).join('\r\n');
}

/** 123456 -> "1234,56" (senza separatore delle migliaia, per i fogli di calcolo). */
export function importoCsv(cents: number): string {
  const segno = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${segno}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

export function creditiScadutiCsv(d: CreditiScadutiResponse): string {
  const intestazione = [
    'Cliente',
    'Fattura',
    'Data fattura',
    'Scadenza',
    'Giorni di ritardo',
    'Importo rata',
    'Da incassare',
    'Interessi di mora',
    'Stato',
    'Interessi applicabili',
  ];
  const righe = d.righe.map((r) => [
    r.controparte.denominazione,
    r.numeroFattura,
    formatData(r.dataEmissione),
    formatData(r.dataScadenza),
    r.giorniRitardo,
    importoCsv(r.importoCents),
    importoCsv(r.residuoCents),
    importoCsv(r.interessiCents),
    r.stato === 'scaduto' ? 'Da incassare' : 'Pagata in ritardo',
    r.applicaInteressi ? 'Sì' : 'No (consumatore)',
  ]);
  const totali = [
    [],
    ['Totali al', formatData(d.alla)],
    ['Da incassare', importoCsv(d.totali.residuoCents)],
    ['Interessi di mora', importoCsv(d.totali.interessiCents)],
    ['Indennizzi (40 € per fattura)', importoCsv(d.totali.indennizziCents)],
    ['Totale richiedibile', importoCsv(d.totali.totaleCents)],
  ];
  return toCsv([intestazione, ...righe, ...totali]);
}
