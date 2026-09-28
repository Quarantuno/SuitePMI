import { addDays, daysBetween, minDate, type IsoDate } from './date';
import { semestrePer } from './tassi-mora';

export interface Pagamento {
  data: IsoDate;
  importoCents: number;
}

export interface InputInteressi {
  /** Importo della scadenza, in centesimi. */
  importoCents: number;
  /** Ultimo giorno utile per pagare senza interessi. */
  scadenza: IsoDate;
  /** Pagamenti ricevuti su questa scadenza (anche parziali, in qualsiasi ordine). */
  pagamenti: Pagamento[];
  /** Data fino alla quale calcolare gli interessi (inclusa). */
  alla: IsoDate;
}

export interface PeriodoInteressi {
  /** Primo giorno del periodo (incluso). */
  dal: IsoDate;
  /** Ultimo giorno del periodo (incluso). */
  al: IsoDate;
  giorni: number;
  /** Capitale ancora dovuto nel periodo, in centesimi. */
  baseCents: number;
  /** Tasso di mora annuo applicato, in punti base. */
  bpsMora: number;
  interessiCents: number;
}

export interface RisultatoInteressi {
  residuoCents: number;
  /** Data in cui la scadenza e' stata saldata, se saldata entro `alla`. */
  saldataIl: IsoDate | null;
  /** Giorni di ritardo: fino al saldo, oppure fino ad `alla` se ancora aperta. */
  giorniRitardo: number;
  interessiCents: number;
  periodi: PeriodoInteressi[];
}

const GIORNI_ANNO = 365;

/**
 * Interessi moratori ex d.lgs. 231/2002 su una singola scadenza.
 *
 * - Decorrono dal giorno successivo alla scadenza, senza bisogno di messa in mora.
 * - Si applica il tasso del semestre in cui cade ciascun giorno di ritardo.
 * - Un pagamento nel giorno X riduce il capitale a partire dal giorno X+1
 *   (i giorni di ritardo di un pagamento sono quindi X - scadenza).
 * - Interesse semplice, anno di 365 giorni.
 */
export function calcolaInteressiMora(input: InputInteressi): RisultatoInteressi {
  const { importoCents, scadenza, alla } = input;
  if (!Number.isInteger(importoCents) || importoCents < 0) {
    throw new Error('importoCents deve essere un intero non negativo');
  }
  const pagamenti = [...input.pagamenti]
    .filter((p) => p.importoCents > 0)
    .sort((a, b) => a.data.localeCompare(b.data));

  const pagatoFinoA = (giornoEscluso: IsoDate) =>
    pagamenti.filter((p) => p.data < giornoEscluso).reduce((s, p) => s + p.importoCents, 0);

  const fineEsclusa = addDays(alla, 1);
  const residuoCents = Math.max(0, importoCents - pagatoFinoA(fineEsclusa));

  // Data del pagamento che ha azzerato il debito (entro `alla`).
  let saldataIl: IsoDate | null = null;
  let cumulato = 0;
  for (const p of pagamenti) {
    if (p.data > alla) break;
    cumulato += p.importoCents;
    if (cumulato >= importoCents) {
      saldataIl = p.data;
      break;
    }
  }
  if (importoCents === 0) saldataIl = scadenza;

  const fineRitardo = saldataIl ?? alla;
  const giorniRitardo = Math.max(0, daysBetween(scadenza, fineRitardo));

  const periodi: PeriodoInteressi[] = [];
  let esatto = 0;
  let cursore = addDays(scadenza, 1);

  while (cursore < fineEsclusa) {
    const base = Math.max(0, importoCents - pagatoFinoA(cursore));
    if (base === 0) break;

    const semestre = semestrePer(cursore);
    // Il capitale cambia il giorno dopo ogni pagamento.
    const prossimoCambio = pagamenti
      .map((p) => addDays(p.data, 1))
      .find((d) => d > cursore);
    let prossimo = minDate(semestre.al, fineEsclusa);
    if (prossimoCambio) prossimo = minDate(prossimo, prossimoCambio);

    const giorni = daysBetween(cursore, prossimo);
    const valore = (base * semestre.bpsMora * giorni) / (10_000 * GIORNI_ANNO);
    esatto += valore;
    periodi.push({
      dal: cursore,
      al: addDays(prossimo, -1),
      giorni,
      baseCents: base,
      bpsMora: semestre.bpsMora,
      interessiCents: Math.round(valore),
    });
    cursore = prossimo;
  }

  return {
    residuoCents,
    saldataIl,
    giorniRitardo,
    interessiCents: Math.round(esatto),
    periodi,
  };
}
