const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

/** "1.234,56" o "1234.56" -> 123456 centesimi. */
export function parseEuroToCents(value: string): number {
  const clean = value.trim().replace(/[€\s]/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new Error(`Importo non valido: ${value}`);
  return Math.round(n * 100);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })}%`;
}

export function formatData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
