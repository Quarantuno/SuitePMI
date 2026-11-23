import { z } from 'zod';
import { isoDate } from './schemas';

export const contrattoSchema = z.object({
  titolo: z.string().trim().min(1).max(160),
  data: isoDate,
  testo: z.string().trim().min(1).max(30_000),
}).strict();

export type ContrattoInput = z.infer<typeof contrattoSchema>;
export type Contratto = ContrattoInput & { id: string };
export type ContrattoSintesi = Omit<Contratto, 'testo'>;
