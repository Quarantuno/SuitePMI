/**
 * Date "di calendario" come stringhe ISO `YYYY-MM-DD`.
 * Tutti i calcoli avvengono in UTC per evitare scarti dovuti al fuso orario.
 */
export type IsoDate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toEpochDay(date: IsoDate): number {
  if (!isIsoDate(date)) throw new Error(`Data non valida: ${date}`);
  return Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY;
}

function fromEpochDay(day: number): IsoDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Giorni tra due date: positivo se `to` e' dopo `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + days);
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}
