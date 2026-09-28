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

export const importXmlSchema = z.object({
  xml: z.string().min(1).max(5_000_000),
  nomeFile: z.string().optional(),
});
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
