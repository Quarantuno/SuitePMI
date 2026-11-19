import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatData, parseEuroToCents, todayIso, type CostoCommessa, type CostoCommessaInput } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Button, Empty, ErrorBox, Field, Money, Select } from '../ui';

export function CostiCommessa({ commessaId }: { commessaId: string }) {
  const [tipo, setTipo] = useState<'lavoro' | 'spesa'>('lavoro');
  const cache = useQueryClient();
  const queryKey = ['commesse', commessaId, 'costi'];
  const path = '/commesse/' + commessaId + '/costi';
  const costi = useQuery({ queryKey, queryFn: () => api<CostoCommessa[]>(path) });
  const salva = useMutation({
    mutationFn: (form: FormData) => {
      const dati = {
        data: String(form.get('data') ?? ''),
        descrizione: String(form.get('descrizione') ?? ''),
        costoCents: parseEuroToCents(String(form.get('costo') ?? '')),
      };
      const body: CostoCommessaInput = tipo === 'lavoro'
        ? { ...dati, tipo, minuti: Number(form.get('minuti')) }
        : { ...dati, tipo };
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

  return (
    <section className="card">
      <h2>Ore e spese</h2>
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
      <form className="inline-form" onSubmit={submit}>
        <Select label="Tipo" value={tipo} onChange={(event) => setTipo(event.target.value === 'spesa' ? 'spesa' : 'lavoro')}>
          <option value="lavoro">Lavoro</option>
          <option value="spesa">Spesa</option>
        </Select>
        <Field label="Data" name="data" type="date" defaultValue={todayIso()} required />
        <Field label="Descrizione" name="descrizione" maxLength={160} required />
        {tipo === 'lavoro' && <Field label="Durata (minuti)" name="minuti" type="number" min={1} max={1440} required />}
        <Field label="Costo totale della voce (€)" name="costo" inputMode="decimal" required />
        <Button disabled={salva.isPending}>{salva.isPending ? 'Salvataggio…' : 'Aggiungi voce'}</Button>
      </form>
      {costi.isPending && <p>Caricamento costi…</p>}
      {costi.data?.length === 0 && <Empty title="Nessuna voce registrata" />}
      {!!costi.data?.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Descrizione</th><th>Durata</th><th className="r">Costo</th><th>Azioni</th></tr>
            </thead>
            <tbody>
              {costi.data.map((voce) => (
                <tr key={voce.id}>
                  <td>{formatData(voce.data)}</td>
                  <td>{voce.tipo === 'lavoro' ? 'Lavoro' : 'Spesa'}</td>
                  <td>{voce.descrizione}</td>
                  <td>{voce.tipo === 'lavoro' ? durata(voce.minuti) : '—'}</td>
                  <td className="r"><Money cents={voce.costoCents} /></td>
                  <td><Button variant="ghost" disabled={elimina.isPending} onClick={() => rimuovi(voce)}>Elimina</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function durata(minuti: number): string {
  return Math.floor(minuti / 60) + ' h ' + (minuti % 60) + ' min';
}
