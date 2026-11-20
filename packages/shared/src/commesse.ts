import { z } from 'zod';
import { isoDate } from './schemas';

export const statiCommessa = ['da_avviare', 'in_corso', 'completata'] as const;
export type StatoCommessa = (typeof statiCommessa)[number];

export const commessaSchema = z.object({
  clienteId: z.uuid(),
  nome: z.string().trim().min(1).max(160),
  budgetCents: z.number().int().min(0).max(100_000_000_000),
  stato: z.enum(statiCommessa).optional(),
  scadenza: isoDate.nullable().optional(),
});

export const aggiornaCommessaSchema = commessaSchema.omit({ clienteId: true });
export type AggiornaCommessaInput = z.infer<typeof aggiornaCommessaSchema>;

export const collegamentoCommessaSchema = z.object({ collegata: z.boolean() });

export type CommessaInput = z.infer<typeof commessaSchema>;
export type CollegamentoCommessaInput = z.infer<typeof collegamentoCommessaSchema>;

export interface Commessa {
  id: string;
  nome: string;
  cliente: { id: string; denominazione: string };
  budgetCents: number;
  stato: StatoCommessa;
  scadenza: string | null;
}

export interface FatturaCommessa {
  id: string;
  numero: string;
  dataEmissione: string;
  fatturatoCents: number;
  incassatoCents: number;
  stornatoCents: number;
  residuoCents: number;
}

const datiCosto = {
  data: isoDate,
  descrizione: z.string().trim().min(1).max(160),
};

export const costoCommessaSchema = z.discriminatedUnion('tipo', [
  z.object({
    ...datiCosto,
    tipo: z.literal('lavoro'),
    minuti: z.number().int().min(1).max(1440),
    costoCents: z.number().int().min(0).max(100_000_000_000),
  }),
  z.object({
    ...datiCosto,
    tipo: z.literal('spesa'),
    costoCents: z.number().int().min(1).max(100_000_000_000),
  }),
]);

export type CostoCommessaInput = z.infer<typeof costoCommessaSchema>;

export interface CostoCommessa {
  id: string;
  tipo: 'lavoro' | 'spesa';
  data: string;
  descrizione: string;
  minuti: number;
  costoCents: number;
}
