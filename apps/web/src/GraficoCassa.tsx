import { formatData, formatEuro, type PrevisioneCassaResponse } from '@suite/shared';
import { useState } from 'react';

type Settimana = PrevisioneCassaResponse['settimane'][number];

const W = 800;
const H = 300;
const M = { top: 16, right: 16, bottom: 32, left: 64 };
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function etichettaData(iso: string) {
  return `${Number(iso.slice(8, 10))} ${MESI[Number(iso.slice(5, 7)) - 1]}`;
}

/** "12,5k €" per gli assi: il valore esatto è nel tooltip e nella tabella. */
function euroCompatto(cents: number) {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} mln €`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k €`;
  return `${v.toLocaleString('it-IT', { maximumFractionDigits: 0 })} €`;
}

function tacche(min: number, max: number, n = 5) {
  const span = max - min || 1;
  const grezzo = span / n;
  const pot = 10 ** Math.floor(Math.log10(grezzo));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => span / p <= n) ?? pot * 10;
  const out: number[] = [];
  for (let v = Math.floor(min / passo) * passo; v <= max + passo / 2; v += passo) out.push(Math.round(v));
  return out;
}

/** Barra con angoli arrotondati solo sul lato lontano dallo zero. */
function barra(x: number, w: number, y0: number, y1: number) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(4, h, w / 2);
  if (y1 < y0) {
    // verso l'alto
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

export function GraficoCassa({ settimane }: { settimane: Settimana[] }) {
  const [attiva, setAttiva] = useState<number | null>(null);

  const valori = settimane.flatMap((s) => [s.entrateCents, -s.usciteCents, s.saldoCents]);
  const t = tacche(Math.min(0, ...valori), Math.max(0, ...valori));
  const yMin = t[0]!;
  const yMax = t[t.length - 1]!;
  const y = (v: number) => M.top + ((yMax - v) / (yMax - yMin || 1)) * (H - M.top - M.bottom);
  const banda = (W - M.left - M.right) / settimane.length;
  const xCentro = (i: number) => M.left + banda * i + banda / 2;
  const larghezzaBarra = Math.min(22, banda * 0.32);
  const zero = y(0);
  const linea = settimane.map((s, i) => `${i === 0 ? 'M' : 'L'}${xCentro(i)},${y(s.saldoCents)}`).join('');
  const passoEtichette = settimane.length > 14 ? Math.ceil(settimane.length / 13) : 1;
  const s = attiva !== null ? settimane[attiva] : undefined;

  return (
    <div className="viz-root grafico-cassa">
      <ul className="legenda" aria-label="Legenda">
        <li>
          <span className="key-rect" style={{ background: 'var(--series-1)' }} /> Entrate previste
        </li>
        <li>
          <span className="key-rect" style={{ background: 'var(--series-2)' }} /> Uscite previste
        </li>
        <li>
          <span className="key-line" /> Saldo previsto
        </li>
      </ul>
      <div className="grafico-wrap" onPointerLeave={() => setAttiva(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Entrate, uscite e saldo di cassa previsti per settimana">
          {t.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'asse-zero' : 'griglia'} />
              <text x={M.left - 8} y={y(v) + 4} textAnchor="end" className="tick">
                {euroCompatto(v)}
              </text>
            </g>
          ))}
          {settimane.map((w, i) => (
            <g key={w.dal}>
              {attiva === i && (
                <rect x={M.left + banda * i} y={M.top} width={banda} height={H - M.top - M.bottom} className="banda-attiva" />
              )}
              <path d={barra(xCentro(i) - larghezzaBarra - 1, larghezzaBarra, zero, y(w.entrateCents))} fill="var(--series-1)" />
              <path d={barra(xCentro(i) + 1, larghezzaBarra, zero, y(-w.usciteCents))} fill="var(--series-2)" />
              {i % passoEtichette === 0 && (
                <text x={xCentro(i)} y={H - 10} textAnchor="middle" className="tick">
                  {etichettaData(w.dal)}
                </text>
              )}
            </g>
          ))}
          <path d={linea} className="linea-saldo" />
          {settimane.map((w, i) => (
            <circle
              key={w.dal}
              cx={xCentro(i)}
              cy={y(w.saldoCents)}
              r={attiva === i ? 5 : 3.5}
              className={w.saldoCents < 0 ? 'punto-saldo negativo' : 'punto-saldo'}
            />
          ))}
          {/* Aree di hover: tutta la colonna della settimana, raggiungibili anche da tastiera */}
          {settimane.map((w, i) => (
            <rect
              key={w.dal}
              x={M.left + banda * i}
              y={M.top}
              width={banda}
              height={H - M.top - M.bottom}
              fill="transparent"
              tabIndex={0}
              aria-label={`Settimana dal ${formatData(w.dal)}: entrate ${formatEuro(w.entrateCents)}, uscite ${formatEuro(w.usciteCents)}, saldo ${formatEuro(w.saldoCents)}`}
              onPointerEnter={() => setAttiva(i)}
              onFocus={() => setAttiva(i)}
              onBlur={() => setAttiva(null)}
            />
          ))}
        </svg>
        {s && attiva !== null && (
          <div
            className="tooltip"
            style={{
              left: `${(xCentro(attiva) / W) * 100}%`,
              // Il tooltip va dalla parte opposta al punto del saldo, per non coprire i dati
              top: y(s.saldoCents) < H / 2 ? '58%' : '4%',
              transform: attiva > settimane.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            }}
          >
            <div className="tooltip-title">
              {formatData(s.dal)} – {formatData(s.al)}
            </div>
            <div className="tooltip-row">
              <span className="key-stroke" style={{ background: 'var(--series-1)' }} />
              <strong>{formatEuro(s.entrateCents)}</strong> <span>entrate</span>
            </div>
            <div className="tooltip-row">
              <span className="key-stroke" style={{ background: 'var(--series-2)' }} />
              <strong>{formatEuro(s.usciteCents)}</strong> <span>uscite</span>
            </div>
            <div className="tooltip-row">
              <span className="key-stroke" style={{ background: 'var(--text-primary)' }} />
              <strong className={s.saldoCents < 0 ? 'neg' : ''}>{formatEuro(s.saldoCents)}</strong> <span>saldo a fine settimana</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
