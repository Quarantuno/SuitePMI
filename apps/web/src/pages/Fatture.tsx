import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatData,
  formatEuro,
  parseEuroToCents,
  todayIso,
  type Controparte,
  type Fattura,
  type ImportXmlResponse,
  type Scadenza,
} from '@suite/shared';
import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Button, Empty, ErrorBox, Field, Money, PageHeader, Select } from '../ui';

interface EsitoImport {
  file: string;
  ok: boolean;
  messaggio: string;
  avvisi: string[];
}

function ImportXml({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [esiti, setEsiti] = useState<EsitoImport[]>([]);
  const [inCorso, setInCorso] = useState(false);

  async function importa(files: FileList | null) {
    if (!files?.length) return;
    setInCorso(true);
    const risultati: EsitoImport[] = [];
    for (const file of Array.from(files)) {
      try {
        const xml = await file.text();
        const r = await api<ImportXmlResponse>('/fatture/import-xml', { body: { xml, nomeFile: file.name } });
        risultati.push({
          file: file.name,
          ok: true,
          messaggio: `Fattura ${r.fattura.numero} (${r.fattura.direzione}) di ${formatEuro(r.fattura.totaleCents)}${r.controparteCreata ? ` · nuova controparte: ${r.fattura.controparte.denominazione}` : ''}`,
          avvisi: r.avvisi,
        });
      } catch (err) {
        risultati.push({ file: file.name, ok: false, messaggio: (err as Error).message, avvisi: [] });
      }
    }
    setEsiti(risultati);
    setInCorso(false);
    if (input.current) input.current.value = '';
    onDone();
  }

  return (
    <div className="card">
      <div className="card-row">
        <div>
          <h2>Importa fatture elettroniche</h2>
          <p className="muted small">File XML FatturaPA (anche più di uno). Riconosciamo da soli se sono fatture emesse o ricevute.</p>
        </div>
        <Button onClick={() => input.current?.click()} disabled={inCorso}>
          {inCorso ? 'Importazione…' : 'Scegli file XML'}
        </Button>
        <input ref={input} type="file" accept=".xml,text/xml" multiple hidden onChange={(e) => importa(e.target.files)} />
      </div>
      {esiti.length > 0 && (
        <ul className="import-results">
          {esiti.map((e) => (
            <li key={e.file} className={e.ok ? 'ok' : 'ko'}>
              <strong>{e.file}</strong>: {e.messaggio}
              {e.avvisi.map((a) => (
                <div key={a} className="muted small">
                  {a}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NuovaFattura({ onDone }: { onDone: () => void }) {
  const controparti = useQuery({ queryKey: ['controparti'], queryFn: () => api<Controparte[]>('/controparti') });
  const [form, setForm] = useState({ controparteId: '', numero: '', dataEmissione: todayIso(), totale: '' });
  const m = useMutation({
    mutationFn: () =>
      api<Fattura>('/fatture', {
        body: {
          controparteId: form.controparteId,
          numero: form.numero,
          dataEmissione: form.dataEmissione,
          totaleCents: parseEuroToCents(form.totale),
        },
      }),
    onSuccess: () => {
      setForm((f) => ({ ...f, numero: '', totale: '' }));
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Nuova fattura manuale</h2>
      <p className="muted small">Scadenza unica a 30 giorni, il termine legale se non ne è stato concordato un altro.</p>
      <div className="grid-4">
        <Select
          label="Cliente"
          value={form.controparteId}
          onChange={(e) => setForm({ ...form, controparteId: e.target.value })}
          required
        >
          <option value="">Scegli…</option>
          {controparti.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.denominazione}
            </option>
          ))}
        </Select>
        <Field label="Numero" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} required />
        <Field
          label="Data"
          type="date"
          value={form.dataEmissione}
          onChange={(e) => setForm({ ...form, dataEmissione: e.target.value })}
          required
        />
        <Field
          label="Totale (€)"
          inputMode="decimal"
          placeholder="1.220,00"
          value={form.totale}
          onChange={(e) => setForm({ ...form, totale: e.target.value })}
          required
        />
      </div>
      <ErrorBox error={m.error} />
      <div className="form-actions">
        <Button type="submit" disabled={m.isPending}>
          Salva fattura
        </Button>
      </div>
    </form>
  );
}

function RegistraIncasso({ scadenza, onDone }: { scadenza: Scadenza; onDone: () => void }) {
  const residuo = scadenza.importoCents - scadenza.pagatoCents;
  const [data, setData] = useState(todayIso());
  const [importo, setImporto] = useState((residuo / 100).toFixed(2).replace('.', ','));
  const m = useMutation({
    mutationFn: () =>
      api(`/scadenze/${scadenza.id}/pagamenti`, { body: { data, importoCents: parseEuroToCents(importo) } }),
    onSuccess: onDone,
  });
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data incasso" required />
      <input value={importo} onChange={(e) => setImporto(e.target.value)} aria-label="Importo incassato" inputMode="decimal" required />
      <Button type="submit" variant="secondary" disabled={m.isPending}>
        Registra
      </Button>
      {m.error && <span className="field-error">{(m.error as Error).message}</span>}
    </form>
  );
}

function StatoRata({ s }: { s: Scadenza }) {
  if (s.pagatoCents >= s.importoCents) return <span className="badge badge-ok">Pagata</span>;
  if (s.dataScadenza < todayIso()) return <span className="badge badge-warn">Scaduta</span>;
  if (s.pagatoCents > 0) return <span className="badge badge-info">Parziale</span>;
  return <span className="badge">Da pagare</span>;
}

export function Fatture() {
  const qc = useQueryClient();
  const [direzione, setDirezione] = useState<'attiva' | 'passiva'>('attiva');
  const [incasso, setIncasso] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['fatture', direzione],
    queryFn: () => api<Fattura[]>(`/fatture?direzione=${direzione}`),
  });
  const aggiorna = () => {
    void qc.invalidateQueries({ queryKey: ['fatture'] });
    void qc.invalidateQueries({ queryKey: ['crediti'] });
    void qc.invalidateQueries({ queryKey: ['controparti'] });
  };

  return (
    <>
      <PageHeader title="Fatture" subtitle="Fatture emesse e ricevute, con le loro rate e gli incassi." />
      <ImportXml onDone={aggiorna} />
      <NuovaFattura onDone={aggiorna} />

      <section className="card">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={direzione === 'attiva'} onClick={() => setDirezione('attiva')}>
            Emesse
          </button>
          <button role="tab" aria-selected={direzione === 'passiva'} onClick={() => setDirezione('passiva')}>
            Ricevute
          </button>
        </div>
        <ErrorBox error={q.error} />
        {q.data?.length === 0 && <Empty title="Nessuna fattura" />}
        {q.data && q.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Numero</th>
                <th>Data</th>
                <th>{direzione === 'attiva' ? 'Cliente' : 'Fornitore'}</th>
                <th className="r">Totale</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.numero} {f.origine === 'xml' && <span className="badge">XML</span>}
                  </td>
                  <td>{formatData(f.dataEmissione)}</td>
                  <td>{f.controparte.denominazione}</td>
                  <td className="r">
                    <Money cents={f.totaleCents} strong />
                  </td>
                  <td>
                    <ul className="rate">
                      {f.scadenze.map((s) => (
                        <li key={s.id}>
                          <span className="num">{formatData(s.dataScadenza)}</span>
                          <Money cents={s.importoCents} />
                          <StatoRata s={s} />
                          {s.pagatoCents < s.importoCents &&
                            (incasso === s.id ? (
                              <RegistraIncasso
                                scadenza={s}
                                onDone={() => {
                                  setIncasso(null);
                                  aggiorna();
                                }}
                              />
                            ) : (
                              <button className="link-btn" onClick={() => setIncasso(s.id)}>
                                {direzione === 'attiva' ? 'Registra incasso' : 'Registra pagamento'}
                              </button>
                            ))}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
