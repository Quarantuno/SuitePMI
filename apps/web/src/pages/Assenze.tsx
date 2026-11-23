import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, formatData, tipiAssenza, type Assenza, type AssenzaInput, type Persona, type TipoAssenza } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Button, Empty, ErrorBox, Field, PageHeader, Select, fieldError } from '../ui';

const tipi: Record<TipoAssenza, string> = { ferie: 'Ferie', permesso: 'Permesso' };
const giorni = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const meseItaliano = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const giornoItaliano = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'UTC' });

export function Assenze() {
  const [mese, setMese] = useState(() =>
    new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric', month: '2-digit', timeZone: 'Europe/Rome',
    }).format(new Date()),
  );
  const [nuova, setNuova] = useState(false);
  const cache = useQueryClient();
  const personale = useQuery({ queryKey: ['personale'], queryFn: () => api<Persona[]>('/personale') });
  const assenze = useQuery({
    queryKey: ['assenze', mese],
    queryFn: () => api<Assenza[]>('/personale/assenze?mese=' + mese),
  });
  const rimuovi = useMutation({
    mutationFn: (id: string) => api<void>('/personale/assenze/' + id, { method: 'DELETE' }),
    onSuccess: () => Promise.all([
      cache.invalidateQueries({ queryKey: ['assenze'] }),
      cache.invalidateQueries({ queryKey: ['riepilogo-paghe'] }),
    ]),
  });

  const inizio = new Date(mese + '-01T00:00:00Z');
  const [anno, numero] = mese.split('-').map(Number);
  const giorniNelMese = new Date(Date.UTC(anno!, numero!, 0)).getUTCDate();
  const spazi = (inizio.getUTCDay() + 6) % 7;

  function cambiaMese(delta: number) {
    const data = new Date(Date.UTC(anno!, numero! - 1 + delta, 1));
    if (data.getUTCFullYear() >= 1900 && data.getUTCFullYear() <= 9999) {
      setMese(data.toISOString().slice(0, 7));
    }
  }

  return (
    <>
      <PageHeader title="Ferie e permessi" actions={<Link to="/personale">Torna al personale</Link>} />
      <ErrorBox error={personale.error ?? assenze.error ?? rimuovi.error} />
      {personale.data?.length === 0 && <Empty title="Aggiungi una persona prima di registrare un’assenza"><Link to="/personale">Vai al personale</Link></Empty>}
      {nuova && !!personale.data?.length && (
        <NuovaAssenza persone={personale.data} mese={mese} chiudi={() => setNuova(false)}
          salvata={(assenza) => {
            setMese(assenza.dal.slice(0, 7));
            setNuova(false);
          }} />
      )}
      <section className="card">
        <div className="card-row">
          <h2 className="mese-assenze" aria-live="polite">{meseItaliano.format(inizio)}</h2>
          <div className="page-actions">
            <Button variant="secondary" onClick={() => cambiaMese(-1)} disabled={mese === '1900-01'}>Precedente</Button>
            <Button variant="secondary" onClick={() => cambiaMese(1)} disabled={mese === '9999-12'}>Successivo</Button>
            {!!personale.data?.length && !nuova && <Button onClick={() => setNuova(true)}>Registra assenza</Button>}
          </div>
        </div>
        {assenze.isPending && <p>Caricamento assenze…</p>}
        {assenze.data && (
          <>
            <div className="calendario-assenze" role="list" aria-label="Giorni del mese">
              {giorni.map((giorno) => <strong className="calendario-giorno" key={giorno} aria-hidden>{giorno}</strong>)}
              {Array.from({ length: spazi }, (_, i) => <div key={'vuoto-' + i} aria-hidden />)}
              {Array.from({ length: giorniNelMese }, (_, i) => {
                const data = addDays(mese + '-01', i);
                const delGiorno = assenze.data.filter((a) => a.dal <= data && a.al >= data);
                return (
                  <div className="calendario-cella" role="listitem" key={data} aria-label={giornoItaliano.format(new Date(data + 'T00:00:00Z'))}>
                    <div className="num">{i + 1}</div>
                    {delGiorno.slice(0, 3).map((a) => (
                      <span className={a.tipo === 'ferie' ? 'badge badge-ok' : 'badge badge-info'} key={a.id}>
                        {a.persona.nome} {a.persona.cognome}
                      </span>
                    ))}
                    {delGiorno.length > 3 && <span className="small">+{delGiorno.length - 3} persone</span>}
                  </div>
                );
              })}
            </div>
            {assenze.data.length === 0 ? <Empty title="Nessuna assenza nel mese" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Persona</th><th>Tipo</th><th>Dal</th><th>Al</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {assenze.data.map((a) => (
                      <tr key={a.id}>
                        <td>{a.persona.nome} {a.persona.cognome}</td>
                        <td><span className={a.tipo === 'ferie' ? 'badge badge-ok' : 'badge badge-info'}>{tipi[a.tipo]}</span></td>
                        <td>{formatData(a.dal)}</td>
                        <td>{formatData(a.al)}</td>
                        <td><Button variant="ghost" disabled={rimuovi.isPending}
                          onClick={() => window.confirm('Rimuovere questa registrazione dal calendario?') && rimuovi.mutate(a.id)}>Rimuovi</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function NuovaAssenza({ persone, mese, chiudi, salvata }:
  { persone: Persona[]; mese: string; chiudi: () => void; salvata: (a: Assenza) => void }) {
  const cache = useQueryClient();
  const salva = useMutation({
    mutationFn: (body: AssenzaInput) => api<Assenza>('/personale/assenze', { body }),
    onSuccess: async (a) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['assenze'] }),
        cache.invalidateQueries({ queryKey: ['riepilogo-paghe'] }),
      ]);
      salvata(a);
    },
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dati = new FormData(e.currentTarget);
    const tipo = tipiAssenza.find((value) => value === dati.get('tipo'));
    if (!tipo) return;
    salva.mutate({
      personaId: String(dati.get('personaId')),
      tipo,
      dal: String(dati.get('dal')),
      al: String(dati.get('al')),
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Nuova assenza</h2>
      <div className="grid-2">
        <Select label="Persona" name="personaId" defaultValue="" required>
          <option value="" disabled>Seleziona una persona</option>
          {persone.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome} · {p.mansione}</option>)}
        </Select>
        <Select label="Tipo" name="tipo">{tipiAssenza.map((tipo) => <option key={tipo} value={tipo}>{tipi[tipo]}</option>)}</Select>
        <Field label="Dal" type="date" name="dal" defaultValue={mese + '-01'} required />
        <Field label="Al (compreso)" type="date" name="al" defaultValue={mese + '-01'} required error={fieldError(salva.error, 'al')} />
      </div>
      <ErrorBox error={salva.error} />
      <div className="form-actions">
        <Button disabled={salva.isPending}>{salva.isPending ? 'Salvataggio…' : 'Salva'}</Button>
        <Button type="button" variant="ghost" disabled={salva.isPending} onClick={chiudi}>Annulla</Button>
      </div>
    </form>
  );
}
