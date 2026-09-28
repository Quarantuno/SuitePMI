import { useQuery } from '@tanstack/react-query';
import { formatBps, formatData, formatEuro, todayIso, type CreditiScadutiResponse, type RigaCredito } from '@suite/shared';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Empty, ErrorBox, Money, PageHeader } from '../ui';

function Kpi({ label, cents, note, accent }: { label: string; cents: number; note: string; accent?: boolean }) {
  return (
    <div className={`kpi ${accent ? 'kpi-accent' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{formatEuro(cents)}</div>
      <div className="kpi-note">{note}</div>
    </div>
  );
}

function DettaglioInteressi({ riga }: { riga: RigaCredito }) {
  if (!riga.applicaInteressi) {
    return <p className="muted small">Controparte senza partita IVA: il d.lgs. 231/2002 non si applica ai consumatori.</p>;
  }
  return (
    <table className="subtable">
      <thead>
        <tr>
          <th>Periodo</th>
          <th className="r">Giorni</th>
          <th className="r">Capitale</th>
          <th className="r">Tasso</th>
          <th className="r">Interessi</th>
        </tr>
      </thead>
      <tbody>
        {riga.periodi.map((p) => (
          <tr key={p.dal}>
            <td>
              {formatData(p.dal)} – {formatData(p.al)}
            </td>
            <td className="r num">{p.giorni}</td>
            <td className="r">
              <Money cents={p.baseCents} />
            </td>
            <td className="r num">{formatBps(p.bpsMora)}</td>
            <td className="r">
              <Money cents={p.interessiCents} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Crediti() {
  const [alla, setAlla] = useState(todayIso());
  const [aperta, setAperta] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['crediti', alla],
    queryFn: () => api<CreditiScadutiResponse>(`/incassi/crediti-scaduti?alla=${alla}`),
  });
  const d = q.data;

  return (
    <>
      <PageHeader
        title="Crediti scaduti"
        subtitle="Quanto ti devono i clienti, con interessi di mora e indennizzi previsti dal d.lgs. 231/2002."
        actions={
          <label className="inline-field">
            <span>Calcola al</span>
            <input type="date" value={alla} onChange={(e) => e.target.value && setAlla(e.target.value)} />
          </label>
        }
      />
      <ErrorBox error={q.error} />
      {q.isPending && <div className="skeleton" />}

      {d && d.righe.length === 0 && (
        <Empty title="Nessun credito scaduto">
          Importa le tue fatture elettroniche da <Link to="/fatture">Fatture</Link> per vedere scadenze, ritardi e interessi.
        </Empty>
      )}

      {d && d.righe.length > 0 && (
        <>
          <section className="kpis">
            <Kpi label="Da incassare" cents={d.totali.residuoCents} note="Capitale ancora aperto" />
            <Kpi label="Interessi di mora" cents={d.totali.interessiCents} note="Tasso BCE + 8 punti" />
            <Kpi label="Indennizzi" cents={d.totali.indennizziCents} note="40 € per fattura in ritardo" />
            <Kpi label="Totale richiedibile" cents={d.totali.totaleCents} note="Capitale + interessi + indennizzi" accent />
          </section>

          <section className="card">
            <h2>Per cliente</h2>
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="r">Fatture</th>
                  <th className="r">Da incassare</th>
                  <th className="r">Interessi</th>
                  <th className="r">Indennizzi</th>
                  <th className="r">Totale</th>
                </tr>
              </thead>
              <tbody>
                {d.perCliente.map((c) => (
                  <tr key={c.controparteId}>
                    <td>{c.denominazione}</td>
                    <td className="r num">{c.fatture}</td>
                    <td className="r">
                      <Money cents={c.residuoCents} />
                    </td>
                    <td className="r">
                      <Money cents={c.interessiCents} />
                    </td>
                    <td className="r">
                      <Money cents={c.indennizziCents} />
                    </td>
                    <td className="r">
                      <Money cents={c.totaleCents} strong />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Scadenze in ritardo</h2>
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Fattura</th>
                  <th>Scadenza</th>
                  <th className="r">Ritardo</th>
                  <th className="r">Da incassare</th>
                  <th className="r">Interessi</th>
                  <th>Stato</th>
                  <th aria-label="Dettaglio" />
                </tr>
              </thead>
              <tbody>
                {d.righe.map((r) => (
                  <Fragment key={r.scadenzaId}>
                    <tr>
                      <td>{r.controparte.denominazione}</td>
                      <td>
                        {r.numeroFattura} <span className="muted small">del {formatData(r.dataEmissione)}</span>
                      </td>
                      <td>{formatData(r.dataScadenza)}</td>
                      <td className="r num">{r.giorniRitardo} gg</td>
                      <td className="r">
                        <Money cents={r.residuoCents} />
                      </td>
                      <td className="r">
                        <Money cents={r.interessiCents} />
                      </td>
                      <td>
                        {r.stato === 'scaduto' ? (
                          <span className="badge badge-warn">Da incassare</span>
                        ) : (
                          <span className="badge badge-info">Pagata in ritardo</span>
                        )}
                      </td>
                      <td className="r">
                        <button
                          className="link-btn"
                          onClick={() => setAperta(aperta === r.scadenzaId ? null : r.scadenzaId)}
                          aria-expanded={aperta === r.scadenzaId}
                        >
                          {aperta === r.scadenzaId ? 'Chiudi' : 'Calcolo'}
                        </button>
                      </td>
                    </tr>
                    {aperta === r.scadenzaId && (
                      <tr className="detail-row">
                        <td colSpan={8}>
                          <DettaglioInteressi riga={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="muted small footnote">
              Interessi semplici su base 365 giorni, dal giorno successivo alla scadenza, al tasso del semestre in cui
              matura ciascun giorno di ritardo. Il calcolo e indicativo: verifica sempre con il tuo consulente prima di
              inviare una diffida.
            </p>
          </section>
        </>
      )}
    </>
  );
}
