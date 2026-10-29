import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { IsoDate } from '@suite/shared';
import { config } from '../config';
import { SollecitiAutoService } from './solleciti-auto.service';

/** Data e ora correnti in Italia, qualunque sia il fuso del server. */
export function oraItaliana(now: Date): { data: IsoDate; ora: number } {
  const parti = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { data: `${parti.year}-${parti.month}-${parti.day}`, ora: Number(parti.hour) };
}

/**
 * Controlla ogni 15 minuti; dall'ora configurata (SOLLECITI_AUTO_ORA, default 9)
 * esegue il giro del giorno per le aziende che non l'hanno ancora fatto.
 * Avviato da main.ts, quindi non gira nei test.
 */
@Injectable()
export class SollecitiScheduler implements OnApplicationShutdown {
  private readonly log = new Logger('SollecitiScheduler');
  private timer?: NodeJS.Timeout;
  private occupato = false;

  constructor(private readonly auto: SollecitiAutoService) {}

  avvia() {
    this.timer = setInterval(() => void this.tick(), 15 * 60_000);
    this.timer.unref();
    void this.tick();
    this.log.log(`Solleciti automatici: giro giornaliero dalle ${config.sollecitiAutoOra}:00 (ora italiana)`);
  }

  async tick(now = new Date()): Promise<number> {
    const { data, ora } = oraItaliana(now);
    if (ora < config.sollecitiAutoOra || this.occupato) return 0;
    this.occupato = true;
    try {
      return await this.auto.eseguiTutte(data);
    } catch (err) {
      this.log.error((err as Error).message);
      return 0;
    } finally {
      this.occupato = false;
    }
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }
}
