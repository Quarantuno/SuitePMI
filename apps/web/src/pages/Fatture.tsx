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
import { api, ApiError } from '../api';
import { leggiFile } from '../importFatture';
import { Button, Empty, ErrorBox, Field, Money, PageHeader, Select } from '../ui';

interface EsitoImport {
  file: string;
  /** "gia": la fattura era già stata importata (non è un errore). */
  stato: 'ok' | 'ko' | 'gia' | 'ignorati';
  messaggio: string;
  avvisi: string[];
  /** Documenti importati dal file: più di uno per un lotto. */
  documenti?: number;
}

function descriviImport(r: ImportXmlResponse): string {
  const nuova = r.controparteCreata ? ` · nuova controparte: ${r.fattura.controparte.denominazione}` : '';
  const verso = r.fattura.direzione === 'attiva' ? 'emessi' : 'ricevuti';
  if (r.fatture.length > 1) {
    const totale = r.fatture.reduce((s, f) => s + (f.notaDiCredito ? -f.totaleCents : f.totaleCents), 0);
    const note = r.fatture.filter((f) => f.notaDiCredito).length;
    return `Lotto: ${r.fatture.length} documenti ${verso} (${r.fatture.map((f) => f.numero).join(', ')})${
      note > 0 ? `, di cui ${note === 1 ? '1 nota' : `${note} note`} di credito` : ''
    }, netto ${formatEuro(totale)}${nuova}`;
  }
  const f = r.fattura;
  return `${f.notaDiCredito ? 'Nota di credito' : 'Fattura'} ${f.numero} (${f.direzione === 'attiva' ? 'emessa' : 'ricevuta'}) di ${formatEuro(f.totaleCents)}${nuova}`;
}

function ImportXml({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [esiti, setEsiti] = useState<EsitoImport[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [progresso, setProgresso] = useState<{ fatti: number; totale: number } | null>(null);

  async function importa(files: FileList | null) {
    if (!files?.length) return;
    setInCorso(true);
    const risultati: EsitoImport[] = [];
    const { documenti, saltati } = await leggiFile(Array.from(files));
    setProgresso({ fatti: 0, totale: documenti.length });
    for (const [i, doc] of documenti.entries()) {
      try {
        const r = await api<ImportXmlResponse>('/fatture/import-xml', { body: { ...doc.corpo, nomeFile: doc.nome } });
        risultati.push({
          file: doc.nome,
          stato: 'ok',
          messaggio: descriviImport(r),
          avvisi: r.avvisi,
          documenti: r.fatture.length,
        });
      } catch (err) {
        const dettagli = err instanceof ApiError ? err.errori.map((e) => e.messaggio) : [];
        const gia = err instanceof ApiError && err.status === 409;
        risultati.push({ file: doc.nome, stato: gia ? 'gia' : 'ko', messaggio: (err as Error).message, avvisi: dettagli });
      }
      setProgresso({ fatti: i + 1, totale: documenti.length });
    }
    if (saltati.length > 0) {
      risultati.push({
        file: `${saltati.length} file ignorati`,
        stato: 'ignorati',
        messaggio: 'non sono fatture (metadati SdI, ricevute o altri file)',
        avvisi: saltati.slice(0, 5).concat(saltati.length > 5 ? [`… e altri ${saltati.length - 5}`] : []),
      });
    }
    setEsiti(risultati);
    setInCorso(false);
    setProgresso(null);
    if (input.current) input.current.value = '';
    onDone();
  }

  const importate = esiti.filter((e) => e.stato === 'ok').reduce((s, e) => s + (e.documenti ?? 1), 0);
  const gia = esiti.filter((e) => e.stato === 'gia').length;
  const errori = esiti.filter((e) => e.stato === 'ko').length;

  return (
    <div className="card">
      <div className="card-row">
        <div>
          <h2>Importa fatture elettroniche</h2>
          <p className="muted small">
            File XML, firmati .p7m o interi archivi .zip (anche quelli del cassetto fiscale). Riconosciamo da soli se sono
            fatture emesse o ricevute.
          </p>
        </div>
        <Button onClick={() => input.current?.click()} disabled={inCorso}>
          {inCorso ? (progresso ? `Importazione ${progresso.fatti}/${progresso.totale}…` : 'Lettura file…') : 'Scegli i file'}
        </Button>
        <input ref={input} type="file" accept=".xml,.p7m,.zip,text/xml,application/zip" multiple hidden onChange={(e) => importa(e.target.files)} />
      </div>
      {(esiti.length > 1 || importate > 1) && (
        <p className="small import-summary">
          {importate} importate{gia > 0 ? `, ${gia} già presenti` : ''}{errori > 0 ? `, ${errori} con errori` : ''}
        </p>
      )}
      {esiti.length > 0 && (
        <ul className="import-results">
          {esiti.map((e) => (
            <li key={e.file} className={e.stato}>
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
  const residuo = scadenza.importoCents - scadenza.pagatoCents - scadenza.stornatoCents;
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

function NotaCredito({ nota, fatture, onDone }: { nota: Fattura; fatture: Fattura[]; onDone: () => void }) {
  const [scelta, setScelta] = useState('');
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const m = useMutation({
    mutationFn: () => api<{ fattura: Fattura; avvisi: string[] }>(`/fatture/${nota.id}/collega`, { body: { fatturaId: scelta } }),
    onSuccess: (r) => {
      setAvvisi(r.avvisi);
      onDone();
    },
  });
  return (
    <div className="nota-credito">
      {nota.fatturaCollegata ? (
        <span className="small">
          Rettifica la fattura <strong>{nota.fatturaCollegata.numero}</strong>: scalati <Money cents={nota.applicatoCents} />
          {nota.applicatoCents < nota.totaleCents && (
            <span className="muted"> (eccedenza <Money cents={nota.totaleCents - nota.applicatoCents} />)</span>
          )}
        </span>
      ) : (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <span className="badge badge-warn">Da abbinare</span>
          <select value={scelta} onChange={(e) => setScelta(e.target.value)} aria-label="Fattura da rettificare" required>
            <option value="">Scegli la fattura…</option>
            {fatture.map((f) => (
              <option key={f.id} value={f.id}>
                {f.numero} del {formatData(f.dataEmissione)}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" disabled={!scelta || m.isPending}>
            Abbina
          </Button>
          {m.error && <span className="field-error">{(m.error as Error).message}</span>}
        </form>
      )}
      {avvisi.map((a) => (
        <div key={a} className="muted small">
          {a}
        </div>
      ))}
    </div>
  );
}

function StatoRata({ s, attiva }: { s: Scadenza; attiva: boolean }) {
  const chiusa = s.pagatoCents + s.stornatoCents >= s.importoCents;
  if (chiusa && s.pagatoCents === 0) return <span className="badge badge-info">Stornata</span>;
  if (chiusa) return <span className="badge badge-ok">Pagata</span>;
  if (s.dataScadenza < todayIso()) return <span className="badge badge-warn">Scaduta</span>;
  if (s.pagatoCents + s.stornatoCents > 0) return <span className="badge badge-info">Parziale</span>;
  return <span className="badge">{attiva ? 'Da incassare' : 'Da pagare'}</span>;
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
                <tr key={f.id} className={f.notaDiCredito ? 'riga-nota' : undefined}>
                  <td>
                    {f.numero} {f.notaDiCredito && <span className="badge badge-info">Nota di credito</span>}{' '}
                    {f.origine === 'xml' && <span className="badge">XML</span>}
                  </td>
                  <td>{formatData(f.dataEmissione)}</td>
                  <td>{f.controparte.denominazione}</td>
                  <td className="r">
                    {f.notaDiCredito ? '−' : ''}
                    <Money cents={f.totaleCents} strong />
                  </td>
                  <td>
                    {f.notaDiCredito && (
                      <NotaCredito
                        nota={f}
                        fatture={q.data.filter((x) => !x.notaDiCredito && x.controparte.id === f.controparte.id)}
                        onDone={aggiorna}
                      />
                    )}
                    <ul className="rate">
                      {f.scadenze.map((s) => (
                        <li key={s.id}>
                          <span className="num">{formatData(s.dataScadenza)}</span>
                          <Money cents={s.importoCents} />
                          <StatoRata s={s} attiva={direzione === 'attiva'} />
                          {s.stornatoCents > 0 && (
                            <span className="muted small">
                              −<Money cents={s.stornatoCents} /> da note di credito
                            </span>
                          )}
                          {s.pagatoCents + s.stornatoCents < s.importoCents &&
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
