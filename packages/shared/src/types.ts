import type { IsoDate } from './date';
import type { PeriodoInteressi } from './interessi-mora';

/** Tipi delle risposte API, condivisi con il frontend. */

export interface AuthResponse {
  token: string;
  utente: { id: string; email: string; nome: string };
  azienda: { id: string; ragioneSociale: string; partitaIva: string };
}

export interface Controparte {
  id: string;
  tipo: 'cliente' | 'fornitore' | 'entrambi';
  denominazione: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  email: string | null;
  pec: string | null;
  telefono: string | null;
  indirizzo: string | null;
  note: string | null;
  sollecitiAutomatici: boolean;
  createdAt: string;
}

export interface Scadenza {
  id: string;
  dataScadenza: IsoDate;
  importoCents: number;
  /** Incassato (o pagato) davvero. */
  pagatoCents: number;
  /** Stornato da note di credito. Residuo = importo - pagato - stornato. */
  stornatoCents: number;
}

export interface Fattura {
  id: string;
  direzione: 'attiva' | 'passiva';
  numero: string;
  dataEmissione: IsoDate;
  totaleCents: number;
  controparte: { id: string; denominazione: string };
  scadenze: Scadenza[];
  origine: 'manuale' | 'xml';
  /** Codice FatturaPA: TD01 fattura, TD04 nota di credito, TD05 nota di debito… (vedi TIPI_DOCUMENTO). */
  tipoDocumento: string;
  notaDiCredito: boolean;
  /** Nota di credito: fattura rettificata. Nota di debito: fattura integrata. */
  fatturaCollegata: { id: string; numero: string } | null;
  /** Nota di credito: quanto è stato effettivamente scalato dalla fattura collegata. */
  applicatoCents: number;
}

export type StatoCredito = 'scaduto' | 'pagato_in_ritardo';

export interface RigaCredito {
  scadenzaId: string;
  fatturaId: string;
  numeroFattura: string;
  dataEmissione: IsoDate;
  controparte: { id: string; denominazione: string; pec: string | null; email: string | null };
  dataScadenza: IsoDate;
  importoCents: number;
  residuoCents: number;
  stato: StatoCredito;
  /**
   * Il d.lgs. 231/2002 vale solo tra imprese (o con la PA): se la controparte
   * non ha partita IVA la trattiamo come consumatore e non calcoliamo interessi.
   */
  applicaInteressi: boolean;
  giorniRitardo: number;
  interessiCents: number;
  periodi: PeriodoInteressi[];
}

export interface RiepilogoCliente {
  controparteId: string;
  denominazione: string;
  fatture: number;
  residuoCents: number;
  interessiCents: number;
  indennizziCents: number;
  totaleCents: number;
  /** Ultimo sollecito inviato a questa controparte, se c'e. */
  ultimoSollecito: { livello: 'promemoria' | 'sollecito' | 'diffida'; inviatoIl: IsoDate } | null;
}

export interface CreditiScadutiResponse {
  alla: IsoDate;
  righe: RigaCredito[];
  perCliente: RiepilogoCliente[];
  totali: {
    residuoCents: number;
    interessiCents: number;
    /** 40 euro per ogni fattura pagata in ritardo o ancora scaduta. */
    indennizziCents: number;
    totaleCents: number;
  };
}

export interface ImportXmlResponse {
  /** Il primo documento importato (comodo per i file con una sola fattura); null se il file conteneva solo documenti ignorati. */
  fattura: Fattura | null;
  /** Tutti i documenti importati: più di uno per i lotti. */
  fatture: Fattura[];
  /** Numeri dei documenti del lotto già registrati e quindi saltati. */
  duplicate: string[];
  /** Documenti solo fiscali (integrazioni, autofatture) non importati. */
  ignorate: { numero: string; tipoDocumento: string }[];
  controparteCreata: boolean;
  avvisi: string[];
}

export interface Azienda {
  id: string;
  ragioneSociale: string;
  partitaIva: string;
  indirizzo: string | null;
  email: string | null;
  pec: string | null;
  iban: string | null;
  saldoCassaCents: number | null;
  saldoCassaAl: IsoDate | null;
  sollecitiAutoAttivi: boolean;
  sollecitiAutoGiorni: number;
  sollecitiAutoLivelloMax: LivelloSollecitoApi;
  /** Ultimo giorno in cui il giro automatico è stato eseguito. */
  sollecitiAutoUltimaEsecuzione: IsoDate | null;
}

export type LivelloSollecitoApi = 'promemoria' | 'sollecito' | 'diffida';
export type CanaleSollecito = 'email' | 'pec' | 'manuale';

export interface Sollecito {
  id: string;
  controparte: { id: string; denominazione: string };
  livello: LivelloSollecitoApi;
  stato: 'bozza' | 'inviato';
  alla: IsoDate;
  oggetto: string;
  testo: string;
  capitaleCents: number;
  interessiCents: number;
  indennizziCents: number;
  totaleCents: number;
  canale: CanaleSollecito | null;
  destinatario: string | null;
  inviatoIl: IsoDate | null;
  /** Creato e inviato dal giro automatico. */
  automatico: boolean;
  createdAt: string;
}

export type DecisioneSollecitoAuto =
  | { azione: 'invia'; livello: LivelloSollecitoApi; canale: 'email' | 'pec'; destinatario: string; motivo: string }
  | { azione: 'salta'; livello: LivelloSollecitoApi | null; motivo: string };

export interface PianoSollecitiAuto {
  data: IsoDate;
  attivi: boolean;
  righe: {
    controparte: { id: string; denominazione: string };
    /** Residuo delle rate scadute. */
    scadutoCents: number;
    giorniRitardoMax: number;
    /** Cliente escluso a mano dai solleciti automatici. */
    escluso: boolean;
    decisione: DecisioneSollecitoAuto;
  }[];
}

export interface EsitoSollecitiAuto {
  data: IsoDate;
  inviati: Sollecito[];
  errori: { controparte: { id: string; denominazione: string }; messaggio: string }[];
}

export interface AnteprimaSollecito {
  controparte: { id: string; denominazione: string; email: string | null; pec: string | null };
  livello: LivelloSollecitoApi;
  suggerito: { livello: LivelloSollecitoApi; motivo: string };
  alla: IsoDate;
  oggetto: string;
  testo: string;
  capitaleCents: number;
  interessiCents: number;
  indennizziCents: number;
  totaleCents: number;
  /** Dati mancanti che conviene completare (es. IBAN, PEC del cliente). */
  avvisi: string[];
}

export interface PrevisioneCassaResponse {
  da: IsoDate;
  /** Saldo di cassa dichiarato in Impostazioni e data a cui si riferisce. */
  saldo: { cents: number; al: IsoDate | null };
  includiCreditiScaduti: boolean;
  settimane: {
    dal: IsoDate;
    al: IsoDate;
    entrateCents: number;
    usciteCents: number;
    nettoCents: number;
    saldoCents: number;
  }[];
  arretrati: { entrateCents: number; usciteCents: number };
  totali: { entrateCents: number; usciteCents: number };
  saldoMinimo: { cents: number; settimanaDal: IsoDate };
  primaSettimanaNegativa: IsoDate | null;
  /** Scadenzario: rate aperte nell'orizzonte e arretrate, in ordine di data. */
  movimenti: {
    scadenzaId: string;
    fatturaId: string;
    numeroFattura: string;
    controparte: { id: string; denominazione: string };
    tipo: 'entrata' | 'uscita';
    dataScadenza: IsoDate;
    residuoCents: number;
    scaduta: boolean;
  }[];
}
