import { z } from 'zod';
import { isoDate } from './schemas';

export const statiPreventivo = ['bozza', 'inviato', 'accettato', 'rifiutato'] as const;
export type StatoPreventivo = (typeof statiPreventivo)[number];

const vocePreventivoSchema = z.object({
  descrizione: z.string().trim().min(1).max(240),
  quantita: z.number().int().min(1).max(1000),
  prezzoCents: z.number().int().min(0).max(100_000_000),
  ivaBps: z.number().int().min(0).max(10_000),
}).strict();

export type VocePreventivo = z.infer<typeof vocePreventivoSchema>;

export function totaliPreventivo(voci: readonly VocePreventivo[]) {
  let imponibileCents = 0;
  let ivaCents = 0;
  for (const voce of voci) {
    const netto = voce.quantita * voce.prezzoCents;
    imponibileCents += netto;
    ivaCents += Math.round(netto * voce.ivaBps / 10_000);
  }
  return { imponibileCents, ivaCents, totaleCents: imponibileCents + ivaCents };
}

export const preventivoSchema = z.object({
  clienteId: z.uuid(),
  titolo: z.string().trim().min(1).max(160),
  data: isoDate,
  validoFino: isoDate.nullable(),
  voci: z.array(vocePreventivoSchema).min(1).max(100),
  note: z.string().trim().max(2000).nullable(),
}).strict().refine((p) => !p.validoFino || p.validoFino >= p.data, {
  path: ['validoFino'],
  message: 'La validità deve essere uguale o successiva alla data del preventivo',
}).refine((p) => totaliPreventivo(p.voci).totaleCents <= 100_000_000_000, {
  path: ['voci'],
  message: 'Il totale supera il limite supportato',
});

export const esitoPreventivoSchema = z.object({
  stato: z.enum(['inviato', 'accettato', 'rifiutato']),
}).strict();

export type PreventivoInput = z.infer<typeof preventivoSchema>;
export type EsitoPreventivoInput = z.infer<typeof esitoPreventivoSchema>;
export type PreventivoSintesi = Omit<PreventivoInput, 'voci' | 'note'> & {
  id: string;
  stato: StatoPreventivo;
  cliente: { id: string; denominazione: string };
  commessaId: string | null;
  totaleCents: number;
};
export type Preventivo = PreventivoSintesi & Pick<PreventivoInput, 'voci' | 'note'>;
