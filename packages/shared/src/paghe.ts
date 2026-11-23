import { z } from 'zod';
import { calendarioAssenzeSchema } from './personale';

export const pagheMeseSchema = calendarioAssenzeSchema;
const importoPaghe = z.number().int().min(0).max(100_000_000_000);

export const prospettoPagheSchema = z.object({
  personaId: z.uuid(),
  mese: pagheMeseSchema.shape.mese,
  lordoCents: importoPaghe,
  competenzeCents: importoPaghe,
  contributiCents: importoPaghe,
  ritenuteCents: importoPaghe,
  trattenuteCents: importoPaghe,
}).strict();

export type ProspettoPagheInput = z.infer<typeof prospettoPagheSchema>;
export type ProspettoPaghe = ProspettoPagheInput & {
  id: string;
  persona: { nome: string; cognome: string; mansione: string };
  saldoCents: number;
};

export function saldoPaghe(movimenti: Omit<ProspettoPagheInput, 'personaId' | 'mese'>): number {
  return movimenti.lordoCents + movimenti.competenzeCents -
    movimenti.contributiCents - movimenti.ritenuteCents - movimenti.trattenuteCents;
}

export const campiProspettoPaghe = [
  ['lordoCents', 'Lordo base'],
  ['competenzeCents', 'Altre competenze'],
  ['contributiCents', 'Contributi a carico del dipendente'],
  ['ritenuteCents', 'Ritenute fiscali'],
  ['trattenuteCents', 'Altre trattenute'],
] as const;
