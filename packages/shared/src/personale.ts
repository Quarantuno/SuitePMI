import { z } from 'zod';
import { isoDate } from './schemas';

export const personaSchema = z.object({
  nome: z.string().trim().min(1).max(100),
  cognome: z.string().trim().min(1).max(100),
  emailLavoro: z.email().max(254).nullable(),
  mansione: z.string().trim().min(1).max(160),
  dataIngresso: isoDate,
  dataUscita: isoDate.nullable(),
}).strict().refine((p) => p.dataUscita === null || p.dataUscita >= p.dataIngresso, {
  path: ['dataUscita'],
  message: 'La data di uscita deve essere uguale o successiva alla data di ingresso',
});

export type PersonaInput = z.infer<typeof personaSchema>;
export type StatoPersona = 'in_arrivo' | 'attivo' | 'cessato';
export type Persona = PersonaInput & { id: string; stato: StatoPersona };
