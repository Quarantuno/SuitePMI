import {
  addDays,
  isIsoDate,
  parseEuroToCents,
  TERMINE_PAGAMENTO_DEFAULT_GIORNI,
  type IsoDate,
} from '@suite/shared';
import { XMLParser } from 'fast-xml-parser';

/**
 * Lettura di una fattura elettronica in formato FatturaPA (tracciato SdI 1.2.x).
 * Estrae solo i dati che servono a incassi e anagrafiche: soggetti, numero,
 * data, totale e scadenze di pagamento.
 */

export interface SoggettoFattura {
  denominazione: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
}

export interface FatturaPAParsed {
  tipoDocumento: string;
  numero: string;
  data: IsoDate;
  divisa: string;
  totaleCents: number;
  cedente: SoggettoFattura;
  cessionario: SoggettoFattura;
  pecDestinatario: string | null;
  scadenze: { dataScadenza: IsoDate; importoCents: number }[];
  avvisi: string[];
}

export class FatturaPAError extends Error {}

const ARRAY_TAGS = new Set(['FatturaElettronicaBody', 'DatiPagamento', 'DettaglioPagamento', 'DatiRiepilogo']);

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false, // "0001" deve restare "0001"
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type Node = Record<string, unknown>;

function obj(value: unknown): Node | undefined {
  return value && typeof value === 'object' ? (value as Node) : undefined;
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function path(root: unknown, ...keys: string[]): unknown {
  let cur: unknown = root;
  for (const k of keys) cur = obj(cur)?.[k];
  return cur;
}

function soggetto(node: unknown, ruolo: string): SoggettoFattura {
  const anagrafici = obj(path(node, 'DatiAnagrafici'));
  if (!anagrafici) throw new FatturaPAError(`Dati anagrafici del ${ruolo} mancanti`);
  const anagrafica = obj(anagrafici.Anagrafica);
  const denominazione =
    str(anagrafica?.Denominazione) ??
    [str(anagrafica?.Nome), str(anagrafica?.Cognome)].filter(Boolean).join(' ');
  if (!denominazione) throw new FatturaPAError(`Denominazione del ${ruolo} mancante`);

  const idPaese = str(path(anagrafici, 'IdFiscaleIVA', 'IdPaese'));
  const idCodice = str(path(anagrafici, 'IdFiscaleIVA', 'IdCodice'));
  // Salviamo la partita IVA solo per i soggetti italiani (11 cifre).
  const partitaIva = idCodice && (!idPaese || idPaese === 'IT') ? idCodice : null;

  const sede = obj(path(node, 'Sede'));
  const indirizzo = sede
    ? [
        [str(sede.Indirizzo), str(sede.NumeroCivico)].filter(Boolean).join(' '),
        [str(sede.CAP), str(sede.Comune), str(sede.Provincia) && `(${str(sede.Provincia)})`]
          .filter(Boolean)
          .join(' '),
      ]
        .filter(Boolean)
        .join(', ')
    : null;

  return {
    denominazione,
    partitaIva,
    codiceFiscale: str(anagrafici.CodiceFiscale) ?? null,
    indirizzo: indirizzo || null,
  };
}

function euro(value: unknown, campo: string): number {
  const s = str(value);
  if (!s) throw new FatturaPAError(`Importo mancante: ${campo}`);
  return parseEuroToCents(s);
}

function data(value: unknown, campo: string): IsoDate {
  const s = str(value);
  if (!s || !isIsoDate(s)) throw new FatturaPAError(`Data non valida: ${campo}`);
  return s;
}

export function parseFatturaPA(xml: string): FatturaPAParsed {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new FatturaPAError('Il file non è un XML valido');
  }
  const root = obj(path(doc, 'FatturaElettronica'));
  if (!root) throw new FatturaPAError('Il file non è una FatturaPA (manca FatturaElettronica)');

  const avvisi: string[] = [];
  const header = obj(root.FatturaElettronicaHeader);
  const bodies = (root.FatturaElettronicaBody as unknown[] | undefined) ?? [];
  if (!header || bodies.length === 0) throw new FatturaPAError('Header o body della fattura mancanti');
  if (bodies.length > 1) {
    avvisi.push(`Il file contiene ${bodies.length} fatture (lotto): importata solo la prima.`);
  }
  const body = bodies[0];

  const cedente = soggetto(header.CedentePrestatore, 'cedente/prestatore');
  const cessionario = soggetto(header.CessionarioCommittente, 'cessionario/committente');
  const pecDestinatario = str(path(header, 'DatiTrasmissione', 'PECDestinatario')) ?? null;

  const dgd = obj(path(body, 'DatiGenerali', 'DatiGeneraliDocumento'));
  if (!dgd) throw new FatturaPAError('DatiGeneraliDocumento mancanti');
  const tipoDocumento = str(dgd.TipoDocumento) ?? 'TD01';
  if (tipoDocumento === 'TD04' || tipoDocumento === 'TD08') {
    throw new FatturaPAError('Le note di credito non sono ancora supportate');
  }
  const numero = str(dgd.Numero);
  if (!numero) throw new FatturaPAError('Numero fattura mancante');
  const dataDoc = data(dgd.Data, 'Data documento');
  const divisa = str(dgd.Divisa) ?? 'EUR';
  if (divisa !== 'EUR') avvisi.push(`Fattura in ${divisa}: gli importi sono trattati come euro.`);

  let totaleCents: number;
  if (str(dgd.ImportoTotaleDocumento)) {
    totaleCents = euro(dgd.ImportoTotaleDocumento, 'ImportoTotaleDocumento');
  } else {
    const riepiloghi = (path(body, 'DatiBeniServizi', 'DatiRiepilogo') as unknown[] | undefined) ?? [];
    totaleCents = riepiloghi.reduce<number>(
      (s, r) => s + euro(path(r, 'ImponibileImporto'), 'ImponibileImporto') + euro(path(r, 'Imposta'), 'Imposta'),
      0,
    );
    avvisi.push('ImportoTotaleDocumento assente: totale calcolato dal riepilogo IVA.');
  }

  const scadenze: FatturaPAParsed['scadenze'] = [];
  const datiPagamento = (obj(body)?.DatiPagamento as unknown[] | undefined) ?? [];
  for (const dp of datiPagamento) {
    const dettagli = (obj(dp)?.DettaglioPagamento as unknown[] | undefined) ?? [];
    for (const d of dettagli) {
      const n = obj(d)!;
      const importoCents = euro(n.ImportoPagamento, 'ImportoPagamento');
      let dataScadenza: IsoDate;
      if (str(n.DataScadenzaPagamento)) {
        dataScadenza = data(n.DataScadenzaPagamento, 'DataScadenzaPagamento');
      } else if (str(n.GiorniTerminiPagamento)) {
        const base = str(n.DataRiferimentoTerminiPagamento)
          ? data(n.DataRiferimentoTerminiPagamento, 'DataRiferimentoTerminiPagamento')
          : dataDoc;
        dataScadenza = addDays(base, Number(n.GiorniTerminiPagamento));
      } else {
        dataScadenza = addDays(dataDoc, TERMINE_PAGAMENTO_DEFAULT_GIORNI);
        avvisi.push('Una rata senza data di scadenza: impostata a 30 giorni dalla data fattura.');
      }
      scadenze.push({ dataScadenza, importoCents });
    }
  }
  if (scadenze.length === 0) {
    scadenze.push({ dataScadenza: addDays(dataDoc, TERMINE_PAGAMENTO_DEFAULT_GIORNI), importoCents: totaleCents });
    avvisi.push('Nessun dato di pagamento: scadenza unica a 30 giorni (termine legale, d.lgs. 231/2002).');
  }
  const sommaRate = scadenze.reduce((s, r) => s + r.importoCents, 0);
  if (sommaRate !== totaleCents) {
    avvisi.push('Le rate non coincidono con il totale (es. ritenuta o split payment): usiamo le rate indicate.');
  }

  return {
    tipoDocumento,
    numero,
    data: dataDoc,
    divisa,
    totaleCents,
    cedente,
    cessionario,
    pecDestinatario,
    scadenze,
    avvisi,
  };
}
