import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida e trasforma il body/query con uno schema Zod condiviso con il frontend. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Dati non validi',
        errori: result.error.issues.map((i) => ({ campo: i.path.join('.'), messaggio: i.message })),
      });
    }
    return result.data;
  }
}
