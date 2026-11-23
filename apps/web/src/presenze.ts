import { queryOptions } from '@tanstack/react-query';
import type { Presenza } from '@suite/shared';
import { api } from './api';

export function presenzeDelMese(mese: string) {
  return queryOptions({
    queryKey: ['presenze', mese],
    queryFn: () => api<Presenza[]>('/personale/presenze?mese=' + mese),
  });
}

export function totaliPresenze(presenze: Presenza[] = []) {
  const totali = new Map<string, Pick<Presenza, 'persona' | 'minutiOrdinari' | 'minutiStraordinari'>>();
  for (const presenza of presenze) {
    const totale = totali.get(presenza.personaId);
    if (totale) {
      totale.minutiOrdinari += presenza.minutiOrdinari;
      totale.minutiStraordinari += presenza.minutiStraordinari;
    } else {
      const { persona, minutiOrdinari, minutiStraordinari } = presenza;
      totali.set(presenza.personaId, { persona, minutiOrdinari, minutiStraordinari });
    }
  }
  return totali;
}

export function oreEMinuti(minuti: number) {
  return Math.floor(minuti / 60) + ' h ' + String(minuti % 60).padStart(2, '0') + ' min';
}
