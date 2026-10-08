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
  createdAt: string;
}

export interface Scadenza {
  id: string;
  dataScadenza: IsoDate;
  importoCents: number;
  pagatoCents: number;
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
  fattura: Fattura;
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
  createdAt: string;
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
