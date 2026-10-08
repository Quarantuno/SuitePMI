import { z } from 'zod';
import { isIsoDate } from './date';

export const isoDate = z.string().refine(isIsoDate, 'Data non valida (formato AAAA-MM-GG)');

/** Partita IVA italiana: 11 cifre con cifra di controllo (algoritmo di Luhn). */
export function isPartitaIvaValida(piva: string): boolean {
  if (!/^\d{11}$/.test(piva)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let n = Number(piva[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export const partitaIva = z
  .string()
  .trim()
  .transform((v) => v.replace(/^IT/i, ''))
  .refine(isPartitaIvaValida, 'Partita IVA non valida');

const euroCents = z.number().int().nonnegative();

// --- Auth ---------------------------------------------------------------

export const registerSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(10, 'La password deve avere almeno 10 caratteri'),
  nome: z.string().trim().min(1),
  ragioneSociale: z.string().trim().min(1),
  partitaIva,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// --- Controparti (clienti e fornitori) -----------------------------------

export const tipoControparte = z.enum(['cliente', 'fornitore', 'entrambi']);

export const controparteSchema = z.object({
  tipo: tipoControparte.default('cliente'),
  denominazione: z.string().trim().min(1),
  partitaIva: partitaIva.optional(),
  codiceFiscale: z.string().trim().toUpperCase().optional(),
  email: z.email().optional(),
  pec: z.email().optional(),
  telefono: z.string().trim().optional(),
  indirizzo: z.string().trim().optional(),
  note: z.string().optional(),
});
export type ControparteInput = z.infer<typeof controparteSchema>;
// Nessun default in modifica: un PATCH senza "tipo" non deve riportarlo a "cliente".
export const controparteUpdateSchema = controparteSchema.extend({ tipo: tipoControparte.optional() }).partial();

// --- Fatture ---------------------------------------------------------------

export const direzioneFattura = z.enum(['attiva', 'passiva']);

export const scadenzaInputSchema = z.object({
  dataScadenza: isoDate,
  importoCents: euroCents,
});

export const fatturaCreateSchema = z.object({
  controparteId: z.uuid(),
  direzione: direzioneFattura.default('attiva'),
  numero: z.string().trim().min(1),
  dataEmissione: isoDate,
  totaleCents: euroCents,
  /** Se vuoto: una sola scadenza a 30 giorni per l'intero importo. */
  scadenze: z.array(scadenzaInputSchema).default([]),
});
export type FatturaCreateInput = z.infer<typeof fatturaCreateSchema>;

/** Una fattura: XML in chiaro oppure busta firmata .p7m codificata in base64. */
export const importXmlSchema = z
  .object({
    xml: z.string().min(1).max(5_000_000).optional(),
    p7mBase64: z.string().min(1).max(8_000_000).optional(),
    nomeFile: z.string().optional(),
  })
  .refine((v) => !!v.xml !== !!v.p7mBase64, 'Indica il contenuto XML oppure il file .p7m');
export type ImportXmlInput = z.infer<typeof importXmlSchema>;

export const pagamentoSchema = z.object({
  data: isoDate,
  importoCents: euroCents.positive(),
  note: z.string().optional(),
});
export type PagamentoInput = z.infer<typeof pagamentoSchema>;

export const creditiQuerySchema = z.object({
  alla: isoDate.optional(),
});

// --- Azienda -----------------------------------------------------------------

/** IBAN con verifica del codice di controllo (ISO 13616, modulo 97). */
export function isIbanValido(value: string): boolean {
  const iban = value.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith('IT') && iban.length !== 27) return false;
  const riordinato = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const ch of riordinato) {
    const n = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1;
}

export const iban = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .refine(isIbanValido, 'IBAN non valido');

/** Stringa vuota = campo cancellato. */
const opzionale = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal('').transform(() => null), schema]).optional();

export const aziendaUpdateSchema = z.object({
  ragioneSociale: z.string().trim().min(1).optional(),
  indirizzo: opzionale(z.string().trim().min(1)),
  email: opzionale(z.email()),
  pec: opzionale(z.email()),
  iban: opzionale(iban),
  /** Saldo di cassa e banca alla data indicata (può essere negativo). */
  saldoCassaCents: z.number().int().min(-1e13).max(1e13).optional(),
  saldoCassaAl: isoDate.optional(),
});
export type AziendaUpdateInput = z.infer<typeof aziendaUpdateSchema>;

// --- Solleciti ---------------------------------------------------------------

export const livelloSollecito = z.enum(['promemoria', 'sollecito', 'diffida']);
export const canaleSollecito = z.enum(['email', 'pec', 'manuale']);

export const sollecitoAnteprimaSchema = z.object({
  controparteId: z.uuid(),
  /** Se assente usiamo il livello suggerito. */
  livello: livelloSollecito.optional(),
  alla: isoDate.optional(),
});
export type SollecitoAnteprimaInput = z.infer<typeof sollecitoAnteprimaSchema>;

export const sollecitoCreateSchema = z.object({
  controparteId: z.uuid(),
  livello: livelloSollecito,
  alla: isoDate,
  oggetto: z.string().trim().min(1).max(300),
  testo: z.string().trim().min(1).max(20_000),
});
export type SollecitoCreateInput = z.infer<typeof sollecitoCreateSchema>;

export const sollecitoInviaSchema = z.object({
  canale: canaleSollecito,
  /** Obbligatorio per email e PEC se la controparte non ha l'indirizzo in anagrafica. */
  destinatario: z.email().optional(),
  /** Per l'invio "manuale" (raccomandata, PEC dal proprio gestore...): data di invio. */
  inviatoIl: isoDate.optional(),
});
export type SollecitoInviaInput = z.infer<typeof sollecitoInviaSchema>;

// --- Cassa -------------------------------------------------------------------

export const previsioneQuerySchema = z.object({
  da: isoDate.optional(),
  settimane: z.coerce.number().int().min(1).max(52).default(13),
  includiCreditiScaduti: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type PrevisioneQuery = z.infer<typeof previsioneQuerySchema>;
