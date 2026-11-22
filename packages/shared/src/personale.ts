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

export const tipiAssenza = ['ferie', 'permesso'] as const;
export type TipoAssenza = (typeof tipiAssenza)[number];

export const assenzaSchema = z.object({
  personaId: z.uuid(),
  tipo: z.enum(tipiAssenza),
  dal: isoDate,
  al: isoDate,
}).strict().refine((a) => a.al >= a.dal, {
  path: ['al'],
  message: 'L’ultimo giorno deve essere uguale o successivo al primo',
});

export const calendarioAssenzeSchema = z.object({
  mese: z.string().regex(/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/, 'Indica un mese nel formato AAAA-MM'),
});

export type AssenzaInput = z.infer<typeof assenzaSchema>;
export type Assenza = AssenzaInput & { id: string; persona: { nome: string; cognome: string } };
