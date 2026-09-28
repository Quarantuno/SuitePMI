import type { IsoDate } from './date';

/**
 * Tasso di riferimento semestrale per le transazioni commerciali
 * (art. 5 d.lgs. 231/2002): tasso BCE sulle operazioni di rifinanziamento
 * principali in vigore il primo giorno del semestre, pubblicato dal MEF.
 *
 * Valori in punti base (1% = 100). Aggiornare a gennaio e luglio di ogni anno.
 * Fonte 2023-2026: comunicati MEF riportati da FiscoeTasse (rilevato il 27/09/2026).
 */
export const TASSI_RIFERIMENTO_BCE: ReadonlyArray<{ dal: IsoDate; bps: number }> = [
  { dal: '2016-01-01', bps: 5 },
  { dal: '2016-07-01', bps: 0 },
  { dal: '2023-01-01', bps: 250 },
  { dal: '2023-07-01', bps: 400 },
  { dal: '2024-01-01', bps: 450 },
  { dal: '2024-07-01', bps: 425 },
  { dal: '2025-01-01', bps: 315 },
  { dal: '2025-07-01', bps: 215 },
  { dal: '2026-01-01', bps: 215 },
  { dal: '2026-07-01', bps: 240 },
];

/** Maggiorazione di legge: 8 punti percentuali (art. 5, comma 1). */
export const MAGGIORAZIONE_BPS = 800;

/** Importo forfettario per i costi di recupero (art. 6, comma 2): 40 euro. */
export const INDENNIZZO_FORFETTARIO_CENTS = 4_000;

/** Termine di pagamento legale se non concordato (art. 4, comma 2): 30 giorni. */
export const TERMINE_PAGAMENTO_DEFAULT_GIORNI = 30;

export interface SemestreTasso {
  dal: IsoDate;
  /** Primo giorno del semestre successivo (escluso). */
  al: IsoDate;
  bpsRiferimento: number;
  bpsMora: number;
}

function inizioSemestreSuccessivo(date: IsoDate): IsoDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month < 7 ? `${year}-07-01` : `${year + 1}-01-01`;
}

function inizioSemestre(date: IsoDate): IsoDate {
  const year = date.slice(0, 4);
  return Number(date.slice(5, 7)) < 7 ? `${year}-01-01` : `${year}-07-01`;
}

/** Il semestre (con il suo tasso di mora) che contiene la data indicata. */
export function semestrePer(date: IsoDate): SemestreTasso {
  const dal = inizioSemestre(date);
  let bps: number | undefined;
  for (const t of TASSI_RIFERIMENTO_BCE) {
    if (t.dal <= dal) bps = t.bps;
  }
  if (bps === undefined) {
    throw new Error(`Tasso di riferimento non disponibile per il semestre che inizia il ${dal}`);
  }
  const ultimo = TASSI_RIFERIMENTO_BCE[TASSI_RIFERIMENTO_BCE.length - 1]!;
  if (dal > ultimo.dal) {
    throw new Error(
      `Tasso di riferimento non ancora inserito per il semestre che inizia il ${dal}: aggiornare TASSI_RIFERIMENTO_BCE`,
    );
  }
  return { dal, al: inizioSemestreSuccessivo(date), bpsRiferimento: bps, bpsMora: bps + MAGGIORAZIONE_BPS };
}
