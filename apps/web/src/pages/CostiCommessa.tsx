import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CSV_BOM, formatData, importoCsv, parseEuroToCents, toCsv, todayIso, type CostoCommessa, type CostoCommessaInput } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { api, salvaFile } from '../api';
import { Button, Empty, ErrorBox, Field, Money, Select, Tabella } from '../ui';

export function CostiCommessa({ commessaId, ricavoNettoCents }: { commessaId: string; ricavoNettoCents: number | null }) {
  const [tipo, setTipo] = useState<'lavoro' | 'spesa'>('lavoro');
  const [modalitaCosto, setModalitaCosto] = useState<'orario' | 'totale'>('orario');
  const [dal, setDal] = useState('');
  const [al, setAl] = useState('');
  const cache = useQueryClient();
  const queryKey = ['commesse', commessaId, 'costi'];
  const path = '/commesse/' + commessaId + '/costi';
  const costi = useQuery({ queryKey, queryFn: () => api<CostoCommessa[]>(path) });
  const salva = useMutation({
    mutationFn: (form: FormData) => {
      const dati = {
        data: String(form.get('data') ?? ''),
        descrizione: String(form.get('descrizione') ?? ''),

      };
      const importo = parseEuroToCents(String(form.get('costo') ?? ''));
      const body: CostoCommessaInput = tipo === 'lavoro'
        ? {
          ...dati, tipo, minuti: Number(form.get('minuti')),
          operatore: String(form.get('operatore') ?? '').trim() || undefined,
          ...(modalitaCosto === 'orario' ? { tariffaOrariaCents: importo } : { costoCents: importo }),
        }
        : { ...dati, tipo, costoCents: importo };
      return api(path, { body });
    },
    onSuccess: () => cache.invalidateQueries({ queryKey }),
  });
  const elimina = useMutation({
    mutationFn: (id: string) => api<void>(path + '/' + id, { method: 'DELETE' }),
    onSuccess: () => cache.invalidateQueries({ queryKey }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    salva.mutate(new FormData(form), { onSuccess: () => form.reset() });
  }

  function rimuovi(voce: CostoCommessa) {
    if (window.confirm('Eliminare questa registrazione?')) elimina.mutate(voce.id);
  }

  const totali = costi.data?.reduce((tot, voce) => {
    tot.minuti += voce.minuti;
    if (voce.tipo === 'lavoro') tot.lavoro += voce.costoCents;
    else tot.spese += voce.costoCents;
    return tot;
  }, { minuti: 0, lavoro: 0, spese: 0 });

  const visibili = costi.data?.filter((voce) => (!dal || voce.data >= dal) && (!al || voce.data <= al)) ?? [];
  const margine = ricavoNettoCents === null || !totali ? null : ricavoNettoCents - totali.lavoro - totali.spese;

  function esporta() {
    const righe = visibili.map((voce) => [
      formatData(voce.data), voce.tipo, voce.operatore, voce.descrizione,
      voce.tipo === 'lavoro' ? voce.minuti : null,
      voce.tariffaOrariaCents === null ? null : importoCsv(voce.tariffaOrariaCents),
      importoCsv(voce.costoCents),
    ]);
    salvaFile('rendiconto-commessa-' + commessaId + '.csv', CSV_BOM + toCsv([
      ['Data', 'Tipo', 'Persona', 'Descrizione', 'Minuti', 'Costo orario (€)', 'Costo registrato (€)'],
      ...righe,
    ]));
  }

  return (
    <section className="card">
      <h2>Rendiconto ore e spese</h2>
      <ErrorBox error={costi.error ?? salva.error ?? elimina.error} />
      {totali && (
        <dl className="kpis">
          <div className="kpi">
            <dt className="kpi-label">Tempo registrato</dt>
            <dd className="kpi-value">{durata(totali.minuti)}</dd>
          </div>
          <div className="kpi">
            <dt className="kpi-label">Costo del lavoro</dt>
            <dd className="kpi-value"><Money cents={totali.lavoro} /></dd>
          </div>
          <div className="kpi">
            <dt className="kpi-label">Spese</dt>
            <dd className="kpi-value"><Money cents={totali.spese} /></dd>
          </div>
          <div className="kpi">
            <dt className="kpi-label">Costi totali registrati</dt>
            <dd className="kpi-value"><Money cents={totali.lavoro + totali.spese} strong /></dd>
          </div>
        </dl>
      )}
      {margine !== null && (
        <p className="muted">
          Margine sui costi registrati <Money cents={margine} strong /> su <Money cents={ricavoNettoCents!} /> di ricavo previsto al netto IVA.
        </p>
      )}
      {ricavoNettoCents === null && <p className="muted">Indica il ricavo previsto al netto IVA in «Modifica commessa» per vedere il margine.</p>}
      <form className="inline-form" onSubmit={submit}>
        <Select label="Tipo" value={tipo} onChange={(event) => setTipo(event.target.value === 'spesa' ? 'spesa' : 'lavoro')}>
          <option value="lavoro">Lavoro</option>
          <option value="spesa">Spesa</option>
        </Select>
        <Field label="Data" name="data" type="date" defaultValue={todayIso()} required />
        <Field label="Descrizione" name="descrizione" maxLength={160} required />
        {tipo === 'lavoro' && (
          <>
            <Field label="Persona" name="operatore" maxLength={100} />
            <Field label="Durata (minuti)" name="minuti" type="number" min={1} max={1440} required />
            <Select label="Calcolo del costo" value={modalitaCosto} onChange={(e) => setModalitaCosto(e.target.value === 'totale' ? 'totale' : 'orario')}>
              <option value="orario">Da costo orario</option>
              <option value="totale">Costo totale</option>
            </Select>
          </>
        )}
        <Field key={tipo + modalitaCosto} label={tipo === 'lavoro' && modalitaCosto === 'orario' ? 'Costo orario (€)' : 'Costo totale (€)'}
          name="costo" inputMode="decimal" required />
        <Button disabled={salva.isPending}>{salva.isPending ? 'Salvataggio…' : 'Aggiungi voce'}</Button>
      </form>
      {costi.isPending && <p>Caricamento costi…</p>}
      {costi.data?.length === 0 && <Empty title="Nessuna voce registrata" />}
      {!!costi.data?.length && (
        <>
          <div className="card-row">
            <div className="inline-form">
              <Field label="Dal" type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
              <Field label="Al" type="date" min={dal || undefined} value={al} onChange={(e) => setAl(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" disabled={!visibili.length} onClick={esporta}>Esporta rendiconto CSV</Button>
          </div>
          <Tabella>
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Persona</th><th>Descrizione</th><th>Durata</th><th className="r">Costo</th><th>Azioni</th></tr>
            </thead>
            <tbody>
              {visibili.map((voce) => (
                <tr key={voce.id}>
                  <td>{formatData(voce.data)}</td>
                  <td>{voce.tipo === 'lavoro' ? 'Lavoro' : 'Spesa'}</td>
                  <td>{voce.operatore ?? '—'}</td>
                  <td>{voce.descrizione}</td>
                  <td>{voce.tipo === 'lavoro' ? durata(voce.minuti) : '—'}</td>
                  <td className="r"><Money cents={voce.costoCents} /></td>
                  <td><Button variant="ghost" disabled={elimina.isPending} onClick={() => rimuovi(voce)}>Elimina</Button></td>
                </tr>
              ))}
            </tbody>
          </Tabella>
          {visibili.length === 0 && <Empty title="Nessuna voce nel periodo selezionato" />}
        </>
      )}
    </section>
  );
}

function durata(minuti: number): string {
  return Math.floor(minuti / 60) + ' h ' + (minuti % 60) + ' min';
}
