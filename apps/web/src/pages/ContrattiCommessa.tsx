import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatData, todayIso, type Commessa, type Contratto, type ContrattoInput, type ContrattoSintesi } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, scarica } from '../api';
import { Button, Empty, ErrorBox, Field, PageHeader, Tabella } from '../ui';

export function ContrattiCommessa() {
  const { id = '' } = useParams();
  const [edita, setEdita] = useState<string | null>(null);
  const path = '/commesse/' + id + '/contratti';
  const queryKey = ['commesse', id, 'contratti'];
  const commesse = useQuery({ queryKey: ['commesse'], queryFn: () => api<Commessa[]>('/commesse') });
  const commessa = commesse.data?.find((c) => c.id === id);
  const elenco = useQuery({ queryKey, queryFn: () => api<ContrattoSintesi[]>(path), enabled: !!commessa });
  const dettaglio = useQuery({
    queryKey: [...queryKey, edita],
    queryFn: () => api<Contratto>(path + '/' + edita),
    enabled: !!edita && edita !== 'nuovo',
  });
  const pdf = useMutation({ mutationFn: (idContratto: string) => scarica(path + '/' + idContratto + '/pdf') });

  return (
    <>
      <PageHeader title="Contratti" subtitle={commessa && commessa.nome + ' · ' + commessa.cliente.denominazione} actions={
        <>
          <Link to={'/commesse/' + id}>Torna alla commessa</Link>
          {elenco.isSuccess && !edita && <Button onClick={() => setEdita('nuovo')}>Nuova bozza</Button>}
        </>
      } />
      <ErrorBox error={commesse.error ?? elenco.error ?? dettaglio.error ?? pdf.error} />
      {commesse.isPending && <p>Caricamento commessa…</p>}
      {commesse.isSuccess && !commessa && <Empty title="Commessa non trovata" />}
      {commessa && elenco.isPending && <p>Caricamento bozze…</p>}
      {commessa && edita && (edita === 'nuovo' || dettaglio.data) && (
        <Bozza key={edita} commessa={commessa} bozza={edita === 'nuovo' ? undefined : dettaglio.data}
          path={path} chiudi={() => setEdita(null)} />
      )}
      {edita && edita !== 'nuovo' && dettaglio.isPending && <p>Caricamento bozza…</p>}
      {elenco.data?.length === 0 && <Empty title="Nessuna bozza di contratto" />}
      {!!elenco.data?.length && (
        <section className="card">
          <Tabella>
            <thead><tr><th>Titolo</th><th>Data</th><th>Azioni</th></tr></thead>
            <tbody>
              {elenco.data.map((bozza) => (
                <tr key={bozza.id}>
                  <td>{bozza.titolo}</td>
                  <td>{formatData(bozza.data)}</td>
                  <td>
                    <div className="page-actions">
                      <Button variant="ghost" disabled={!!edita} onClick={() => setEdita(bozza.id)}>Modifica</Button>
                      <Button variant="secondary" disabled={pdf.isPending} onClick={() => pdf.mutate(bozza.id)}>Scarica bozza PDF</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabella>
        </section>
      )}
    </>
  );
}

function Bozza({ commessa, bozza, path, chiudi }:
  { commessa: Commessa; bozza?: Contratto; path: string; chiudi: () => void }) {
  const cache = useQueryClient();
  const salva = useMutation({
    mutationFn: (body: ContrattoInput) => bozza
      ? api<Contratto>(path + '/' + bozza.id, { method: 'PUT', body })
      : api<Contratto>(path, { body }),
    onSuccess: async (contratto) => {
      const chiave = ['commesse', commessa.id, 'contratti'];
      cache.setQueryData([...chiave, contratto.id], contratto);
      await cache.invalidateQueries({ queryKey: chiave, exact: true });
      chiudi();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    salva.mutate({
      titolo: String(form.get('titolo') ?? ''),
      data: String(form.get('data') ?? ''),
      testo: String(form.get('testo') ?? ''),
    });
  }

  return (
    <form className="card letter-editor" onSubmit={submit}>
      <h2>{bozza ? 'Modifica bozza' : 'Nuova bozza di contratto'}</h2>
      <div className="grid-2">
        <Field label="Titolo" name="titolo" defaultValue={bozza?.titolo ?? commessa.nome} required maxLength={160} />
        <Field label="Data" name="data" type="date" defaultValue={bozza?.data ?? todayIso()} required />
      </div>
      <label className="field">
        <span className="field-label">Testo del contratto</span>
        <textarea name="testo" defaultValue={bozza?.testo ?? ''} required maxLength={30_000} />
      </label>
      <p className="muted small">La bozza PDF include i dati di azienda, cliente e commessa.</p>
      <ErrorBox error={salva.error} />
      <div className="form-actions">
        <Button disabled={salva.isPending}>Salva bozza</Button>
        <Button type="button" variant="ghost" disabled={salva.isPending} onClick={chiudi}>Annulla</Button>
      </div>
    </form>
  );
}
