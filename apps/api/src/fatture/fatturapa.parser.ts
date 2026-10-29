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
  /** Per le note di credito (TD04): fatture di riferimento. */
  collegate: { numero: string; data: IsoDate | null }[];
  avvisi: string[];
}

export class FatturaPAError extends Error {}

const ARRAY_TAGS = new Set([
  'FatturaElettronicaBody',
  'DatiBeniServizi',
  'DatiPagamento',
  'DettaglioPagamento',
  'DatiRiepilogo',
  'DatiFattureCollegate',
]);

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

function leggiXml(xml: string): Node {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new FatturaPAError('Il file non è un XML valido');
  }
  const d = obj(doc);
  if (!d) throw new FatturaPAError('Il file non è un XML valido');
  return d;
}

function totaleDaRiepilogo(body: unknown, avvisi: string[]): number {
  // DatiBeniServizi è una lista (nelle semplificate si ripete): raccogliamo tutti i riepiloghi.
  const blocchi = (path(body, 'DatiBeniServizi') as unknown[] | undefined) ?? [];
  const riepiloghi = blocchi.flatMap((b) => (path(b, 'DatiRiepilogo') as unknown[] | undefined) ?? []);
  avvisi.push('ImportoTotaleDocumento assente: totale calcolato dal riepilogo IVA.');
  return riepiloghi.reduce<number>(
    (s, r) => s + euro(path(r, 'ImponibileImporto'), 'ImponibileImporto') + euro(path(r, 'Imposta'), 'Imposta'),
    0,
  );
}

function leggiScadenze(body: unknown, dataDoc: IsoDate, totaleCents: number, avvisi: string[]) {
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
  return scadenze;
}

/** Fattura ordinaria (FPA12/FPR12): uno o più body (lotto) con lo stesso header. */
function leggiOrdinaria(root: Node): FatturaPAParsed[] {
  const header = obj(root.FatturaElettronicaHeader);
  const bodies = (root.FatturaElettronicaBody as unknown[] | undefined) ?? [];
  if (!header || bodies.length === 0) throw new FatturaPAError('Header o body della fattura mancanti');

  const cedente = soggetto(header.CedentePrestatore, 'cedente/prestatore');
  const cessionario = soggetto(header.CessionarioCommittente, 'cessionario/committente');
  const pecDestinatario = str(path(header, 'DatiTrasmissione', 'PECDestinatario')) ?? null;

  return bodies.map((body, i) => {
    const avvisi: string[] = [];
    const dgd = obj(path(body, 'DatiGenerali', 'DatiGeneraliDocumento'));
    if (!dgd) throw new FatturaPAError(`DatiGeneraliDocumento mancanti (documento ${i + 1})`);
    const tipoDocumento = str(dgd.TipoDocumento) ?? 'TD01';
    const numero = str(dgd.Numero);
    if (!numero) throw new FatturaPAError('Numero fattura mancante');
    const dataDoc = data(dgd.Data, 'Data documento');
    const divisa = str(dgd.Divisa) ?? 'EUR';
    if (divisa !== 'EUR') avvisi.push(`Fattura in ${divisa}: gli importi sono trattati come euro.`);

    const collegate = ((path(body, 'DatiGenerali', 'DatiFattureCollegate') as unknown[] | undefined) ?? [])
      .map((c) => ({ numero: str(path(c, 'IdDocumento')), data: str(path(c, 'Data')) ?? null }))
      .filter((c): c is { numero: string; data: string | null } => !!c.numero);

    // Alcuni software scrivono le note di credito con importi negativi: conta il valore assoluto.
    const totaleCents = Math.abs(
      str(dgd.ImportoTotaleDocumento)
        ? euro(dgd.ImportoTotaleDocumento, 'ImportoTotaleDocumento')
        : totaleDaRiepilogo(body, avvisi),
    );

    const notaDiCredito = tipoDocumento === 'TD04';
    if (notaDiCredito && collegate.length === 0) avvisi.push('Nota di credito senza riferimento alla fattura: abbinala a mano.');
    return {
      tipoDocumento,
      numero,
      data: dataDoc,
      divisa,
      totaleCents,
      cedente,
      cessionario,
      pecDestinatario,
      scadenze: notaDiCredito ? [] : leggiScadenze(body, dataDoc, totaleCents, avvisi),
      collegate,
      avvisi,
    };
  });
}

/**
 * Fattura semplificata (FSM10, art. 21-bis d.P.R. 633/1972): TD07 fattura, TD08 nota di credito.
 * Struttura diversa: soggetti senza DatiAnagrafici, importi per riga IVA inclusa, nessun dato di pagamento.
 */
function soggettoSemplificato(node: unknown, ruolo: string): SoggettoFattura {
  const n = obj(node);
  if (!n) throw new FatturaPAError(`Dati del ${ruolo} mancanti`);
  const id = obj(n.IdentificativiFiscali) ?? n;
  const altri = obj(n.AltriDatiIdentificativi) ?? n;
  const denominazione =
    str(altri.Denominazione) ?? [str(altri.Nome), str(altri.Cognome)].filter(Boolean).join(' ');
  const codiceFiscale = str(id.CodiceFiscale) ?? null;
  if (!denominazione && !codiceFiscale) throw new FatturaPAError(`Denominazione del ${ruolo} mancante`);
  const idPaese = str(path(id, 'IdFiscaleIVA', 'IdPaese'));
  const idCodice = str(path(id, 'IdFiscaleIVA', 'IdCodice'));
  const sede = obj(altri.Sede);
  const indirizzo = sede
    ? [[str(sede.Indirizzo), str(sede.NumeroCivico)].filter(Boolean).join(' '), [str(sede.CAP), str(sede.Comune)].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : null;
  return {
    denominazione: denominazione || `Cliente ${codiceFiscale}`,
    partitaIva: idCodice && (!idPaese || idPaese === 'IT') ? idCodice : null,
    codiceFiscale,
    indirizzo: indirizzo || null,
  };
}

function leggiSemplificata(root: Node): FatturaPAParsed[] {
  const header = obj(root.FatturaElettronicaHeader);
  const bodies = (root.FatturaElettronicaBody as unknown[] | undefined) ?? [];
  if (!header || bodies.length === 0) throw new FatturaPAError('Header o body della fattura mancanti');
  const cedente = soggettoSemplificato(header.CedentePrestatore, 'cedente/prestatore');
  const cessionario = soggettoSemplificato(header.CessionarioCommittente, 'cessionario/committente');
  const pecDestinatario = str(path(header, 'DatiTrasmissione', 'PECDestinatario')) ?? null;

  return bodies.map((body) => {
    const avvisi: string[] = [];
    const dgd = obj(path(body, 'DatiGenerali', 'DatiGeneraliDocumento'));
    if (!dgd) throw new FatturaPAError('DatiGeneraliDocumento mancanti');
    const tipo = str(dgd.TipoDocumento) ?? 'TD07';
    const numero = str(dgd.Numero);
    if (!numero) throw new FatturaPAError('Numero fattura mancante');
    const dataDoc = data(dgd.Data, 'Data documento');
    const righe = (path(body, 'DatiBeniServizi') as unknown[] | undefined) ?? [];
    const totaleCents = Math.abs(righe.reduce<number>((s, r) => s + euro(path(r, 'Importo'), 'Importo'), 0));
    const rettificata = obj(path(body, 'DatiGenerali', 'DatiFatturaRettificata'));
    const collegate = str(rettificata?.NumeroFR)
      ? [{ numero: str(rettificata!.NumeroFR)!, data: str(rettificata!.DataFR) ?? null }]
      : [];
    // Per il resto dell'app una semplificata è una fattura (TD01) o una nota di credito (TD04).
    const notaDiCredito = tipo === 'TD08';
    if (notaDiCredito && collegate.length === 0) avvisi.push('Nota di credito senza riferimento alla fattura: abbinala a mano.');
    avvisi.push(`Fattura semplificata (${tipo}).`);
    return {
      tipoDocumento: notaDiCredito ? 'TD04' : 'TD01',
      numero,
      data: dataDoc,
      divisa: str(dgd.Divisa) ?? 'EUR',
      totaleCents,
      cedente,
      cessionario,
      pecDestinatario,
      scadenze: notaDiCredito ? [] : leggiScadenze(body, dataDoc, totaleCents, avvisi),
      collegate,
      avvisi,
    };
  });
}

/** Tutti i documenti del file: uno per una fattura singola, più di uno per un lotto. */
export function parseFatturaPALotto(xml: string): FatturaPAParsed[] {
  const doc = leggiXml(xml);
  const ordinaria = obj(doc.FatturaElettronica);
  if (ordinaria) return leggiOrdinaria(ordinaria);
  const semplificata = obj(doc.FatturaElettronicaSemplificata);
  if (semplificata) return leggiSemplificata(semplificata);
  throw new FatturaPAError('Il file non è una FatturaPA (manca FatturaElettronica)');
}

/** Il primo documento del file (comodo nei test e per i file con una sola fattura). */
export function parseFatturaPA(xml: string): FatturaPAParsed {
  return parseFatturaPALotto(xml)[0]!;
}
