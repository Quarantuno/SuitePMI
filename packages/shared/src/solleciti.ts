import { daysBetween, type IsoDate } from './date';
import { formatData, formatEuro } from './format';
import { INDENNIZZO_FORFETTARIO_CENTS } from './tassi-mora';
import type { RigaCredito } from './types';

export const LIVELLI_SOLLECITO = ['promemoria', 'sollecito', 'diffida'] as const;
export type LivelloSollecito = (typeof LIVELLI_SOLLECITO)[number];

export const ETICHETTA_LIVELLO: Record<LivelloSollecito, string> = {
  promemoria: 'Promemoria cortese',
  sollecito: 'Sollecito formale',
  diffida: 'Diffida e messa in mora',
};

/** Giorni dati al cliente per pagare, per livello. */
export const TERMINE_GIORNI: Record<LivelloSollecito, number> = {
  promemoria: 7,
  sollecito: 7,
  diffida: 15,
};

/** Attesa minima consigliata prima di passare al livello successivo. */
const ATTESA_MINIMA_GIORNI: Record<LivelloSollecito, number> = {
  promemoria: 7,
  sollecito: 10,
  diffida: 15,
};

export interface SollecitoPrecedente {
  livello: LivelloSollecito;
  inviatoIl: IsoDate;
}

export interface SuggerimentoLivello {
  livello: LivelloSollecito;
  motivo: string;
}

/** Livello consigliato in base ai solleciti già inviati e al ritardo massimo. */
export function suggerisciLivello(
  storico: SollecitoPrecedente[],
  oggi: IsoDate,
  giorniRitardoMax: number,
): SuggerimentoLivello {
  const ultimo = [...storico].sort((a, b) => b.inviatoIl.localeCompare(a.inviatoIl))[0];
  if (!ultimo) {
    return giorniRitardoMax > 60
      ? { livello: 'sollecito', motivo: `Nessun contatto precedente, ma il ritardo supera i 60 giorni (${giorniRitardoMax}).` }
      : { livello: 'promemoria', motivo: 'Primo contatto: un promemoria cortese risolve molti ritardi.' };
  }
  const trascorsi = daysBetween(ultimo.inviatoIl, oggi);
  const attesa = ATTESA_MINIMA_GIORNI[ultimo.livello];
  const presto = trascorsi < attesa ? ` Sono passati solo ${trascorsi} giorni: valuta se attendere almeno ${attesa} giorni.` : '';
  switch (ultimo.livello) {
    case 'promemoria':
      return { livello: 'sollecito', motivo: `Promemoria inviato il ${formatData(ultimo.inviatoIl)} senza esito.${presto}` };
    case 'sollecito':
      return { livello: 'diffida', motivo: `Sollecito formale inviato il ${formatData(ultimo.inviatoIl)} senza esito.${presto}` };
    case 'diffida':
      return {
        livello: 'diffida',
        motivo: `Diffida già inviata il ${formatData(ultimo.inviatoIl)}. Scaduto il termine, il passo successivo è il ricorso per decreto ingiuntivo tramite avvocato.`,
      };
  }
}

// --- Generazione del testo -------------------------------------------------

export interface DatiMittente {
  ragioneSociale: string;
  partitaIva: string;
  indirizzo: string | null;
  email: string | null;
  pec: string | null;
  iban: string | null;
}

export interface DatiDestinatario {
  denominazione: string;
  partitaIva: string | null;
  indirizzo: string | null;
  pec: string | null;
  email: string | null;
}

export interface InputSollecito {
  livello: LivelloSollecito;
  mittente: DatiMittente;
  destinatario: DatiDestinatario;
  /** Righe di credito di questa controparte (da /incassi/crediti-scaduti). */
  righe: RigaCredito[];
  alla: IsoDate;
  firmatario: string;
  /** Solleciti gia inviati a questa controparte (cambia l'attacco della lettera). */
  precedenti?: number;
}

export interface TestoSollecito {
  oggetto: string;
  testo: string;
  /** Righe effettivamente citate nella lettera. */
  righe: RigaCredito[];
  capitaleCents: number;
  interessiCents: number;
  indennizziCents: number;
  totaleCents: number;
}

export class SollecitoVuotoError extends Error {}

function elencoFatture(righe: RigaCredito[], conInteressi: boolean): string {
  return righe
    .map((r) => {
      const base = `- Fattura n. ${r.numeroFattura} del ${formatData(r.dataEmissione)}, scadenza ${formatData(r.dataScadenza)}`;
      if (r.stato === 'pagato_in_ritardo') {
        return `${base}: pagata con ${r.giorniRitardo} giorni di ritardo, interessi maturati ${formatEuro(r.interessiCents)}`;
      }
      const interessi = conInteressi && r.applicaInteressi ? `, interessi di mora ${formatEuro(r.interessiCents)}` : '';
      return `${base}: importo non pagato ${formatEuro(r.residuoCents)} (${r.giorniRitardo} giorni di ritardo)${interessi}`;
    })
    .join('\n');
}

function coordinatePagamento(m: DatiMittente): string {
  return m.iban
    ? `Coordinate per il bonifico: conto intestato a ${m.ragioneSociale}, IBAN ${m.iban}, indicando in causale i numeri delle fatture.`
    : 'Per il pagamento valgono le modalità indicate in fattura; si prega di indicare in causale i numeri delle fatture.';
}

function firma(input: InputSollecito): string {
  const m = input.mittente;
  const contatti = [m.email && `Email: ${m.email}`, m.pec && `PEC: ${m.pec}`].filter(Boolean).join(' - ');
  return [`${input.firmatario}`, m.ragioneSociale, `P.IVA ${m.partitaIva}`, contatti].filter(Boolean).join('\n');
}

/**
 * Genera oggetto e testo della lettera. Il testo è una bozza: l'utente puo
 * modificarlo prima dell'invio. I riferimenti normativi valgono solo verso
 * imprese e PA (controparti con partita IVA).
 */
export function generaSollecito(input: InputSollecito): TestoSollecito {
  const { livello, mittente, destinatario, alla } = input;
  const b2b = destinatario.partitaIva !== null;
  const aperte = input.righe.filter((r) => r.stato === 'scaduto');
  const righe = livello === 'diffida' && b2b ? input.righe : aperte;
  if (righe.length === 0) {
    throw new SollecitoVuotoError(
      input.righe.length > 0
        ? 'Non ci sono importi aperti: le fatture sono state pagate. Restano solo gli interessi per ritardo, richiedibili con una diffida.'
        : 'Nessuna fattura scaduta per questa controparte.',
    );
  }

  const capitaleCents = righe.reduce((s, r) => s + r.residuoCents, 0);
  const conInteressi = livello === 'diffida' && b2b;
  const interessiCents = conInteressi ? righe.reduce((s, r) => s + r.interessiCents, 0) : 0;
  const numeroFatture = new Set(righe.map((r) => r.fatturaId)).size;
  const indennizziCents = conInteressi ? numeroFatture * INDENNIZZO_FORFETTARIO_CENTS : 0;
  const totaleCents = capitaleCents + interessiCents + indennizziCents;
  const termine = TERMINE_GIORNI[livello];
  const elenco = elencoFatture(righe, conInteressi);
  const nFatture = righe.length === 1 ? 'la seguente fattura risulta' : 'i seguenti importi risultano';
  const precedenti = input.precedenti ?? 0;

  let oggetto: string;
  let corpo: string[];

  if (livello === 'promemoria') {
    oggetto = `Promemoria di pagamento - ${mittente.ragioneSociale}`;
    corpo = [
      'Gentile cliente,',
      `da una verifica della nostra contabilità, alla data del ${formatData(alla)} ${nFatture} ancora da saldare:`,
      elenco,
      `Totale da saldare: ${formatEuro(capitaleCents)}.`,
      `Le chiediamo cortesemente di provvedere al pagamento entro ${termine} giorni. ${coordinatePagamento(mittente)}`,
      'Se ha già provveduto, la preghiamo di non considerare questa comunicazione e, se possibile, di inviarci copia della contabile.',
      'Restiamo a disposizione per qualsiasi chiarimento.',
      'Cordiali saluti,',
    ];
  } else if (livello === 'sollecito') {
    oggetto = `Sollecito di pagamento fatture scadute - ${mittente.ragioneSociale}`;
    corpo = [
      'Spettabile ' + destinatario.denominazione + ',',
      precedenti > 0
        ? `nonostante il precedente promemoria, alla data del ${formatData(alla)} ${nFatture} ancora ${righe.length === 1 ? 'insoluta' : 'insoluti'}:`
        : `alla data del ${formatData(alla)} ${nFatture} ancora ${righe.length === 1 ? 'insoluta' : 'insoluti'}:`,
      elenco,
      `Totale scaduto: ${formatEuro(capitaleCents)}.`,
      `Vi invitiamo a provvedere al saldo entro ${termine} giorni dal ricevimento della presente. ${coordinatePagamento(mittente)}`,
      b2b
        ? 'Vi ricordiamo che sui ritardi di pagamento nelle transazioni commerciali decorrono automaticamente gli interessi di mora previsti dal d.lgs. 231/2002, oltre a un importo forfettario di 40 euro per ciascuna fattura a titolo di costi di recupero: ci riserviamo di richiederli.'
        : 'Ci riserviamo di richiedere gli interessi di legge per il ritardo.',
      'Qualora il pagamento sia già stato disposto, vi preghiamo di inviarci copia della contabile.',
      'Distinti saluti,',
    ];
  } else {
    oggetto = b2b
      ? 'Intimazione di pagamento e costituzione in mora ai sensi dell\'art. 1219 c.c. e del d.lgs. 231/2002'
      : 'Intimazione di pagamento e costituzione in mora ai sensi dell\'art. 1219 c.c.';
    const voci = [
      `- capitale non pagato: ${formatEuro(capitaleCents)}`,
      ...(conInteressi
        ? [
            `- interessi di mora maturati al ${formatData(alla)} (art. 5 d.lgs. 231/2002, tasso BCE maggiorato di 8 punti): ${formatEuro(interessiCents)}`,
            `- importo forfettario per costi di recupero (art. 6, comma 2, d.lgs. 231/2002), 40 euro per ${numeroFatture} ${numeroFatture === 1 ? 'fattura' : 'fatture'}: ${formatEuro(indennizziCents)}`,
          ]
        : []),
    ].join('\n');
    corpo = [
      'Spettabile ' + destinatario.denominazione + ',',
      `${precedenti > 0 ? 'nonostante i precedenti solleciti, ' : ''}risultano ancora a vostro carico i seguenti importi dovuti a ${mittente.ragioneSociale}:`,
      elenco,
      'Con la presente vi intimiamo formalmente il pagamento delle seguenti somme:',
      voci,
      `per un totale di ${formatEuro(totaleCents)}${conInteressi ? ', oltre agli ulteriori interessi di mora che matureranno fino al saldo effettivo' : ''}.`,
      `Il pagamento dovrà pervenire entro e non oltre ${termine} giorni dal ricevimento della presente. ${coordinatePagamento(mittente)}`,
      'La presente vale quale atto di costituzione in mora ai sensi dell\'art. 1219 c.c. e quale atto interruttivo della prescrizione ai sensi dell\'art. 2943 c.c.',
      `Decorso inutilmente il termine indicato, saremo costretti a tutelare i nostri diritti in sede giudiziale, anche mediante ricorso per decreto ingiuntivo, senza ulteriore avviso e con aggravio di spese a vostro carico.`,
      'Distinti saluti,',
    ];
  }

  const testo = [...corpo, '', firma(input)].join('\n\n').replace(/\n{3,}/g, '\n\n');
  return { oggetto, testo, righe, capitaleCents, interessiCents, indennizziCents, totaleCents };
}
