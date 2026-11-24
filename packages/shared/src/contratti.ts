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

export const contrattoLavoroSchema = contrattoSchema.omit({ data: true }).extend({
  decorrenza: isoDate.refine((data) => data >= '0001-01-01', 'La decorrenza deve avere un anno maggiore di zero'),
});

export type ContrattoLavoroInput = z.infer<typeof contrattoLavoroSchema>;
export type ContrattoLavoro = ContrattoLavoroInput & { id: string };
export type ContrattoLavoroSintesi = Omit<ContrattoLavoro, 'testo'>;
