import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatData, type ContrattoLavoro, type ContrattoLavoroInput, type ContrattoLavoroSintesi, type Persona } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, scarica } from '../api';
import { Button, Empty, ErrorBox, Field, PageHeader, Tabella, fieldError } from '../ui';

export function ContrattiLavoro() {
  const { id = '' } = useParams();
  const [edita, setEdita] = useState<string | null>(null);
  const cache = useQueryClient();
  const path = '/personale/' + id + '/contratti';
  const chiave = ['personale', id, 'contratti'] as const;
  const organico = useQuery({ queryKey: ['personale'], queryFn: () => api<Persona[]>('/personale') });
  const persona = organico.data?.find((p) => p.id === id);
  const elenco = useQuery({ queryKey: chiave, queryFn: () => api<ContrattoLavoroSintesi[]>(path), enabled: !!persona });
  const esistente = !!edita && edita !== 'nuova';
  const dettaglio = useQuery({
    queryKey: [...chiave, edita],
    queryFn: () => api<ContrattoLavoro>(path + '/' + edita),
    enabled: !!persona && esistente,
  });
  const pdf = useMutation({ mutationFn: (bozzaId: string) => scarica(path + '/' + bozzaId + '/pdf') });
  const rimuovi = useMutation({
    mutationFn: (bozzaId: string) => api<void>(path + '/' + bozzaId, { method: 'DELETE' }),
    onSuccess: (_, bozzaId) => {
      cache.removeQueries({ queryKey: [...chiave, bozzaId], exact: true });
      return cache.invalidateQueries({ queryKey: chiave, exact: true });
    },
  });

  return (
    <>
      <PageHeader title="Contratti di lavoro" subtitle={persona && persona.nome + ' ' + persona.cognome} actions={
        <>
          <Link to="/personale">Torna al personale</Link>
          {elenco.isSuccess && !edita && <Button onClick={() => setEdita('nuova')}>Nuova bozza</Button>}
        </>
      } />
      <ErrorBox error={organico.error ?? elenco.error ?? dettaglio.error ?? pdf.error ?? rimuovi.error} />
      {(organico.isPending || (persona && elenco.isPending)) && <p>Caricamento bozze…</p>}
      {organico.isSuccess && !persona && <Empty title="Persona non trovata" />}
      {esistente && !dettaglio.data && (
        <div className="card">
          {dettaglio.isPending && <p>Caricamento bozza…</p>}
          <Button variant="ghost" onClick={() => setEdita(null)}>Annulla</Button>
        </div>
      )}
      {persona && edita && (!esistente || dettaglio.data) && (
        <ModuloBozza key={edita} decorrenza={persona.dataIngresso}
          bozza={esistente ? dettaglio.data : undefined} path={path}
          chiudi={() => setEdita(null)}
          salvata={async (bozza) => {
            cache.setQueryData([...chiave, bozza.id], bozza);
            await cache.invalidateQueries({ queryKey: chiave, exact: true });
            setEdita(null);
          }} />
      )}
      {elenco.data?.length === 0 && !edita && <Empty title="Nessuna bozza di contratto di lavoro" />}
      {!!elenco.data?.length && (
        <section className="card">
          <Tabella>
            <thead><tr><th>Titolo</th><th>Decorrenza</th><th>Azioni</th></tr></thead>
            <tbody>
              {elenco.data.map((bozza) => (
                <tr key={bozza.id}>
                  <td>{bozza.titolo}</td>
                  <td>{formatData(bozza.decorrenza)}</td>
                  <td>
                    <div className="page-actions">
                      <Button variant="ghost" disabled={!!edita || rimuovi.isPending} onClick={() => setEdita(bozza.id)}>Modifica</Button>
                      <Button variant="secondary" disabled={pdf.isPending} onClick={() => pdf.mutate(bozza.id)}>Scarica bozza PDF</Button>
                      <Button variant="ghost" disabled={!!edita || rimuovi.isPending}
                        onClick={() => window.confirm('Eliminare questa bozza di contratto?') && rimuovi.mutate(bozza.id)}>Elimina</Button>
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

function ModuloBozza({ decorrenza, bozza, path, chiudi, salvata }: {
  decorrenza: string;
  bozza?: ContrattoLavoro;
  path: string;
  chiudi: () => void;
  salvata: (bozza: ContrattoLavoro) => Promise<void>;
}) {
  const salva = useMutation({
    mutationFn: (body: ContrattoLavoroInput) => bozza
      ? api<ContrattoLavoro>(path + '/' + bozza.id, { method: 'PUT', body })
      : api<ContrattoLavoro>(path, { body }),
    onSuccess: salvata,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    salva.mutate({
      titolo: String(form.get('titolo') ?? ''),
      decorrenza: String(form.get('decorrenza') ?? ''),
      testo: String(form.get('testo') ?? ''),
    });
  }

  return (
    <form className="card letter-editor" onSubmit={submit}>
      <h2>{bozza ? 'Modifica bozza' : 'Nuova bozza di contratto'}</h2>
      <div className="grid-2">
        <Field label="Titolo" name="titolo" defaultValue={bozza?.titolo} required maxLength={160} />
        <Field label="Decorrenza" name="decorrenza" type="date" defaultValue={bozza?.decorrenza ?? decorrenza}
          min="0001-01-01" max="9999-12-31" error={fieldError(salva.error, 'decorrenza')} required />
      </div>
      <label className="field">
        <span className="field-label">Testo del contratto</span>
        <textarea name="testo" defaultValue={bozza?.testo} required maxLength={30_000} />
      </label>
      <p className="muted small">Il PDF della bozza include i dati dell’azienda e della scheda del personale.</p>
      <ErrorBox error={salva.error} />
      <div className="form-actions">
        <Button disabled={salva.isPending}>Salva bozza</Button>
        <Button type="button" variant="ghost" disabled={salva.isPending} onClick={chiudi}>Annulla</Button>
      </div>
    </form>
  );
}
