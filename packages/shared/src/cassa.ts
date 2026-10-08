import { addDays, daysBetween, type IsoDate } from './date';

/** Una rata ancora aperta (residuo > 0), da incassare o da pagare. */
export interface MovimentoPrevisto {
  scadenzaId: string;
  fatturaId: string;
  numeroFattura: string;
  controparte: { id: string; denominazione: string };
  tipo: 'entrata' | 'uscita';
  dataScadenza: IsoDate;
  residuoCents: number;
}

export interface SettimanaCassa {
  dal: IsoDate;
  al: IsoDate;
  entrateCents: number;
  usciteCents: number;
  nettoCents: number;
  /** Saldo previsto a fine settimana. */
  saldoCents: number;
}

export interface PrevisioneCassa {
  da: IsoDate;
  saldoInizialeCents: number;
  settimane: SettimanaCassa[];
  /** Rate scadute prima di `da` e non ancora regolate. */
  arretrati: { entrateCents: number; usciteCents: number };
  totali: { entrateCents: number; usciteCents: number };
  saldoMinimo: { cents: number; settimanaDal: IsoDate };
  /** Prima settimana in cui il saldo previsto va sotto zero, se c'è. */
  primaSettimanaNegativa: IsoDate | null;
}

export interface InputPrevisione {
  da: IsoDate;
  settimane: number;
  saldoInizialeCents: number;
  movimenti: MovimentoPrevisto[];
  /**
   * Prudenza: i crediti già scaduti di norma NON si contano come incasso certo.
   * Con `true` li consideriamo incassati nella prima settimana.
   */
  includiCreditiScaduti?: boolean;
}

/** Lunedì della settimana che contiene la data. */
export function lunedi(date: IsoDate): IsoDate {
  const giorno = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = domenica
  return addDays(date, -((giorno + 6) % 7));
}

/**
 * Previsione di cassa a settimane (lunedì-domenica). La prima settimana parte da `da`.
 * Le uscite già scadute sono debiti da pagare subito: entrano nella prima settimana.
 * I crediti scaduti restano fuori, salvo `includiCreditiScaduti`.
 */
export function previsioneCassa(input: InputPrevisione): PrevisioneCassa {
  const { da, settimane, saldoInizialeCents } = input;
  if (settimane < 1 || settimane > 52) throw new Error('Il numero di settimane deve essere tra 1 e 52');

  const inizio = lunedi(da);
  const buckets = Array.from({ length: settimane }, (_, i) => ({
    dal: i === 0 ? da : addDays(inizio, 7 * i),
    al: addDays(inizio, 7 * i + 6),
    entrateCents: 0,
    usciteCents: 0,
  }));
  const fine = buckets[buckets.length - 1]!.al;

  const arretrati = { entrateCents: 0, usciteCents: 0 };
  for (const m of input.movimenti) {
    if (m.residuoCents <= 0) continue;
    const prima = buckets[0]!;
    if (m.dataScadenza < da) {
      if (m.tipo === 'entrata') {
        arretrati.entrateCents += m.residuoCents;
        if (input.includiCreditiScaduti) prima.entrateCents += m.residuoCents;
      } else {
        arretrati.usciteCents += m.residuoCents;
        prima.usciteCents += m.residuoCents;
      }
      continue;
    }
    if (m.dataScadenza > fine) continue;
    const indice = Math.floor(daysBetween(inizio, m.dataScadenza) / 7);
    const b = buckets[indice]!;
    if (m.tipo === 'entrata') b.entrateCents += m.residuoCents;
    else b.usciteCents += m.residuoCents;
  }

  let saldo = saldoInizialeCents;
  let minimo = { cents: saldoInizialeCents, settimanaDal: da };
  let primaNegativa: IsoDate | null = null;
  const risultato: SettimanaCassa[] = buckets.map((b, i) => {
    const netto = b.entrateCents - b.usciteCents;
    saldo += netto;
    if (i === 0 || saldo < minimo.cents) minimo = { cents: saldo, settimanaDal: b.dal };
    if (saldo < 0 && primaNegativa === null) primaNegativa = b.dal;
    return { ...b, nettoCents: netto, saldoCents: saldo };
  });

  return {
    da,
    saldoInizialeCents,
    settimane: risultato,
    arretrati,
    totali: {
      entrateCents: risultato.reduce((s, b) => s + b.entrateCents, 0),
      usciteCents: risultato.reduce((s, b) => s + b.usciteCents, 0),
    },
    saldoMinimo: minimo,
    primaSettimanaNegativa: primaNegativa,
  };
}
