import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatData, type Persona, type PersonaInput, type StatoPersona } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Button, Empty, ErrorBox, Field, PageHeader, Select, fieldError } from '../ui';

const stati: Record<StatoPersona, string> = {
  in_arrivo: 'In arrivo',
  attivo: 'Attivo',
  cessato: 'Cessato',
};

export function Personale() {
  const [scheda, setScheda] = useState<Persona | 'nuova' | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [stato, setStato] = useState('tutti');
  const organico = useQuery({ queryKey: ['personale'], queryFn: () => api<Persona[]>('/personale') });
  const filtro = ricerca.trim().toLocaleLowerCase('it');
  const persone = organico.data?.filter((p) =>
    (stato === 'tutti' || p.stato === stato)
    && [p.nome + ' ' + p.cognome, p.cognome + ' ' + p.nome, p.mansione, p.emailLavoro ?? '']
      .some((valore) => valore.toLocaleLowerCase('it').includes(filtro)),
  ) ?? [];

  return (
    <>
      <PageHeader title="Personale" actions={organico.isSuccess && (
        <>
          <Link to="/personale/assenze">Ferie e permessi</Link>
          <Link to="/personale/presenze">Registro presenze</Link>
          <Link to="/personale/paghe">Preparazione paghe</Link>
          {!scheda && <Button onClick={() => setScheda('nuova')}>Aggiungi persona</Button>}
        </>
      )} />
      <ErrorBox error={organico.error} />
      {organico.isPending && <p>Caricamento personale…</p>}
      {organico.isSuccess && (
        <>
          {scheda && (
            <SchedaPersona key={scheda === 'nuova' ? 'nuova' : scheda.id}
              persona={scheda === 'nuova' ? undefined : scheda} chiudi={() => setScheda(null)} />
          )}
          {organico.data.length === 0 ? <Empty title="Nessuna persona registrata" /> : (
            <section className="card">
              <div className="inline-form">
                <Field label="Cerca nel personale" type="search" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
                <Select label="Stato" value={stato} onChange={(e) => setStato(e.target.value)}>
                  <option value="tutti">Tutti</option>
                  {Object.entries(stati).map(([valore, nome]) => <option key={valore} value={valore}>{nome}</option>)}
                </Select>
              </div>
              {persone.length === 0 ? <Empty title="Nessun risultato per i filtri selezionati" /> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Persona</th><th>Mansione</th><th>Ingresso</th><th>Ultimo giorno</th><th>Stato</th><th>Azioni</th></tr>
                    </thead>
                    <tbody>
                      {persone.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.nome} {p.cognome}</strong>{p.emailLavoro && <div className="muted small">{p.emailLavoro}</div>}</td>
                          <td>{p.mansione}</td>
                          <td>{formatData(p.dataIngresso)}</td>
                          <td>{p.dataUscita ? formatData(p.dataUscita) : '—'}</td>
                          <td><span className={p.stato === 'attivo' ? 'badge badge-ok' : 'badge'}>{stati[p.stato]}</span></td>
                          <td>
                            <div className="page-actions">
                              <Button variant="ghost" disabled={!!scheda} onClick={() => setScheda(p)}>Modifica</Button>
                              <Link to={p.id + '/contratti'} aria-label={'Contratti di lavoro di ' + p.nome + ' ' + p.cognome}>Contratti di lavoro</Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}

function SchedaPersona({ persona, chiudi }: { persona?: Persona; chiudi: () => void }) {
  const cache = useQueryClient();
  const salva = useMutation({
    mutationFn: (form: FormData) => {
      const body: PersonaInput = {
        nome: String(form.get('nome') ?? ''),
        cognome: String(form.get('cognome') ?? ''),
        mansione: String(form.get('mansione') ?? ''),
        emailLavoro: String(form.get('emailLavoro') ?? '').trim() || null,
        dataIngresso: String(form.get('dataIngresso') ?? ''),
        dataUscita: String(form.get('dataUscita') ?? '') || null,
      };
      return persona
        ? api<Persona>('/personale/' + persona.id, { method: 'PUT', body })
        : api<Persona>('/personale', { body });
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['personale'] }),
        cache.invalidateQueries({ queryKey: ['riepilogo-paghe'] }),
      ]);
      chiudi();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    salva.mutate(new FormData(event.currentTarget));
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{persona ? 'Modifica persona' : 'Nuova persona'}</h2>
      <div className="grid-2">
        <Field label="Nome" name="nome" defaultValue={persona?.nome} maxLength={100} required />
        <Field label="Cognome" name="cognome" defaultValue={persona?.cognome} maxLength={100} required />
        <Field label="Mansione" name="mansione" defaultValue={persona?.mansione} maxLength={160} required />
        <Field label="Email di lavoro" name="emailLavoro" defaultValue={persona?.emailLavoro ?? ''} type="email" maxLength={254} />
        <Field label="Data di ingresso" name="dataIngresso" type="date" defaultValue={persona?.dataIngresso} required />
        <Field label="Ultimo giorno di lavoro" name="dataUscita" type="date" defaultValue={persona?.dataUscita ?? ''}
          error={fieldError(salva.error, 'dataUscita')} />
      </div>
      <ErrorBox error={salva.error} />
      <div className="form-actions">
        <Button disabled={salva.isPending}>{salva.isPending ? 'Salvataggio…' : 'Salva'}</Button>
        <Button type="button" variant="ghost" disabled={salva.isPending} onClick={chiudi}>Annulla</Button>
      </div>
    </form>
  );
}
