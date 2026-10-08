import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatData, formatEuro, parseEuroToCents, type PrevisioneCassaResponse } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { GraficoCassa } from '../GraficoCassa';
import { Button, Empty, ErrorBox, Money, PageHeader } from '../ui';

function SaldoEditor({ saldo }: { saldo: PrevisioneCassaResponse['saldo'] }) {
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [valore, setValore] = useState('');
  const m = useMutation({
    mutationFn: () => api('/azienda', { method: 'PATCH', body: { saldoCassaCents: parseEuroToCents(valore) } }),
    onSuccess: () => {
      setAperto(false);
      void qc.invalidateQueries({ queryKey: ['cassa'] });
      void qc.invalidateQueries({ queryKey: ['azienda'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };

  if (!aperto) {
    return (
      <button
        className="link-btn"
        onClick={() => {
          setValore((saldo.cents / 100).toFixed(2).replace('.', ','));
          setAperto(true);
        }}
      >
        {saldo.al ? 'Aggiorna saldo' : 'Inserisci il saldo di oggi'}
      </button>
    );
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <input value={valore} onChange={(e) => setValore(e.target.value)} inputMode="decimal" aria-label="Saldo di cassa e banca oggi" autoFocus />
      <Button type="submit" variant="secondary" disabled={m.isPending}>
        Salva
      </Button>
      {m.error && <span className="field-error">{(m.error as Error).message}</span>}
    </form>
  );
}

export function Cassa() {
  const [settimane, setSettimane] = useState(13);
  const [includiScaduti, setIncludiScaduti] = useState(false);
  const [filtro, setFiltro] = useState<'tutti' | 'entrata' | 'uscita'>('tutti');
  const [tabella, setTabella] = useState(false);

  const q = useQuery({
    queryKey: ['cassa', settimane, includiScaduti],
    queryFn: () =>
      api<PrevisioneCassaResponse>(`/cassa/previsione?settimane=${settimane}&includiCreditiScaduti=${includiScaduti}`),
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  const movimenti = d?.movimenti.filter((m) => filtro === 'tutti' || m.tipo === filtro) ?? [];

  return (
    <>
      <PageHeader
        title="Cassa"
        subtitle="Quanto entra e quanto esce nelle prossime settimane, dalle scadenze delle fatture emesse e ricevute."
      />
      <div className="filtri">
        <label className="inline-field">
          <span>Orizzonte</span>
          <select value={settimane} onChange={(e) => setSettimane(Number(e.target.value))}>
            <option value={4}>4 settimane</option>
            <option value={8}>8 settimane</option>
            <option value={13}>13 settimane</option>
            <option value={26}>26 settimane</option>
          </select>
        </label>
        <label className="inline-field checkbox">
          <input type="checkbox" checked={includiScaduti} onChange={(e) => setIncludiScaduti(e.target.checked)} />
          <span>Conta i crediti già scaduti come incassati subito</span>
        </label>
      </div>
      <ErrorBox error={q.error} />

      {d && (
        <div className={q.isFetching ? 'refetching' : ''}>
          <section className="kpis">
            <div className="kpi">
              <div className="kpi-label">Saldo di cassa e banca</div>
              <div className="kpi-value">{formatEuro(d.saldo.cents)}</div>
              <div className="kpi-note">
                {d.saldo.al ? `Aggiornato al ${formatData(d.saldo.al)} · ` : 'Non ancora inserito · '}
                <SaldoEditor saldo={d.saldo} />
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Entrate previste</div>
              <div className="kpi-value">{formatEuro(d.totali.entrateCents)}</div>
              <div className="kpi-note">Fatture emesse in scadenza</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Uscite previste</div>
              <div className="kpi-value">{formatEuro(d.totali.usciteCents)}</div>
              <div className="kpi-note">Fatture ricevute, compresi i debiti scaduti</div>
            </div>
            <div className={`kpi ${d.saldoMinimo.cents < 0 ? 'kpi-danger' : 'kpi-accent'}`}>
              <div className="kpi-label">Saldo minimo previsto</div>
              <div className="kpi-value">{formatEuro(d.saldoMinimo.cents)}</div>
              <div className="kpi-note">Settimana dal {formatData(d.saldoMinimo.settimanaDal)}</div>
            </div>
          </section>

          {d.primaSettimanaNegativa && (
            <div className="alert alert-error" role="status">
              <strong>Attenzione:</strong> dalla settimana del {formatData(d.primaSettimanaNegativa)} il saldo previsto va sotto zero.
              Sollecita i crediti in ritardo o sposta qualche pagamento.
            </div>
          )}
          {d.arretrati.entrateCents > 0 && !d.includiCreditiScaduti && (
            <p className="muted small">
              Crediti già scaduti non conteggiati: <strong>{formatEuro(d.arretrati.entrateCents)}</strong>. Per prudenza non li
              consideriamo un incasso certo.
            </p>
          )}

          <section className="card">
            <div className="card-row">
              <h2>Andamento per settimana</h2>
              <button className="link-btn" onClick={() => setTabella(!tabella)}>
                {tabella ? 'Mostra grafico' : 'Mostra tabella'}
              </button>
            </div>
            {tabella ? (
              <table>
                <thead>
                  <tr>
                    <th>Settimana</th>
                    <th className="r">Entrate</th>
                    <th className="r">Uscite</th>
                    <th className="r">Netto</th>
                    <th className="r">Saldo previsto</th>
                  </tr>
                </thead>
                <tbody>
                  {d.settimane.map((w) => (
                    <tr key={w.dal}>
                      <td className="num">
                        {formatData(w.dal)} – {formatData(w.al)}
                      </td>
                      <td className="r">
                        <Money cents={w.entrateCents} />
                      </td>
                      <td className="r">
                        <Money cents={w.usciteCents} />
                      </td>
                      <td className="r">
                        <Money cents={w.nettoCents} />
                      </td>
                      <td className={`r ${w.saldoCents < 0 ? 'neg' : ''}`}>
                        <Money cents={w.saldoCents} strong />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <GraficoCassa settimane={d.settimane} />
            )}
          </section>

          <section className="card">
            <div className="card-row">
              <h2>Scadenzario</h2>
              <div className="tabs compact" role="tablist">
                {(['tutti', 'entrata', 'uscita'] as const).map((f) => (
                  <button key={f} role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)}>
                    {f === 'tutti' ? 'Tutte' : f === 'entrata' ? 'Da incassare' : 'Da pagare'}
                  </button>
                ))}
              </div>
            </div>
            {movimenti.length === 0 ? (
              <Empty title="Nessuna scadenza aperta in questo periodo" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Scadenza</th>
                    <th>Controparte</th>
                    <th>Fattura</th>
                    <th>Tipo</th>
                    <th className="r">Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimenti.map((m) => (
                    <tr key={m.scadenzaId}>
                      <td className="num">
                        {formatData(m.dataScadenza)} {m.scaduta && <span className="badge badge-warn">Scaduta</span>}
                      </td>
                      <td>{m.controparte.denominazione}</td>
                      <td>{m.numeroFattura}</td>
                      <td>{m.tipo === 'entrata' ? 'Da incassare' : 'Da pagare'}</td>
                      <td className={`r ${m.tipo === 'uscita' ? 'neg-soft' : ''}`}>
                        {m.tipo === 'uscita' ? '−' : ''}
                        <Money cents={m.residuoCents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </>
  );
}
