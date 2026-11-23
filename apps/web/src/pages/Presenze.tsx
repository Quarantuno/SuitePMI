import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatData, mesePersonaleSchema, type Persona, type Presenza, type PresenzaInput } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { oreEMinuti, presenzeDelMese, totaliPresenze } from '../presenze';
import { Button, Empty, ErrorBox, Field, PageHeader, Select, Tabella, fieldError } from '../ui';

const dataItaliana = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', dateStyle: 'short' });

export function Presenze() {
  const oggi = dataItaliana.format(new Date());
  const [mese, setMese] = useState(() => oggi.slice(0, 7));
  const [edita, setEdita] = useState<Presenza | 'nuova' | null>(null);
  const cache = useQueryClient();
  const persone = useQuery({ queryKey: ['personale'], queryFn: () => api<Persona[]>('/personale') });
  const registro = useQuery(presenzeDelMese(mese));
  const rimuovi = useMutation({
    mutationFn: (id: string) => api<void>('/personale/presenze/' + id, { method: 'DELETE' }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['presenze', mese] }),
  });
  const totali = [...totaliPresenze(registro.data)].sort(([, a], [, b]) =>
    (a.persona.cognome + ' ' + a.persona.nome).localeCompare(b.persona.cognome + ' ' + b.persona.nome, 'it'),
  );

  function cambiaMese(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const periodo = new FormData(event.currentTarget).get('mese');
    const risultato = mesePersonaleSchema.safeParse({ mese: periodo });
    if (risultato.success) setMese(risultato.data.mese);
  }

  return (
    <>
      <PageHeader title="Registro presenze" subtitle="Ore ordinarie e straordinarie per persona e giorno." actions={
        <>
          <Link to="/personale">Torna al personale</Link>
          <Link to="/personale/paghe">Preparazione paghe</Link>
        </>
      } />
      <ErrorBox error={persone.error ?? registro.error ?? rimuovi.error} />
      {persone.data?.length === 0 && <Empty title="Aggiungi una persona per iniziare a registrare le presenze">
        <Link to="/personale">Vai al personale</Link>
      </Empty>}
      {edita && persone.data && (
        <ModuloPresenza key={edita === 'nuova' ? edita : edita.id} persone={persone.data}
          giorno={oggi.startsWith(mese) ? oggi : mese + '-01'}
          presenza={edita === 'nuova' ? undefined : edita} chiudi={() => setEdita(null)}
          salvata={(p) => { setMese(p.giorno.slice(0, 7)); setEdita(null); }} />
      )}
      <section className="card">
        <div className="card-row">
          <form key={mese} className="inline-form" onSubmit={cambiaMese}>
            <Field label="Mese" name="mese" type="month" defaultValue={mese} required
              min="1900-01" max="9999-12" pattern="[0-9]{4}-[0-9]{2}" placeholder="AAAA-MM" disabled={!!edita} />
            <Button variant="secondary" disabled={!!edita}>Mostra mese</Button>
          </form>
          {!!persone.data?.length && !edita && <Button onClick={() => setEdita('nuova')}>Registra presenza</Button>}
        </div>
        {registro.isPending && <p>Caricamento presenze…</p>}
        {registro.data?.length === 0 && !!persone.data?.length && <Empty title="Nessuna presenza per il mese selezionato" />}
        {!!registro.data?.length && (
          <>
            <h2>Totali del mese</h2>
            <Tabella>
              <thead><tr><th>Persona</th><th className="r">Ore ordinarie</th><th className="r">Straordinario</th></tr></thead>
              <tbody>
                {totali.map(([id, totale]) => (
                  <tr key={id}>
                    <td>{totale.persona.cognome} {totale.persona.nome}</td>
                    <td className="r">{oreEMinuti(totale.minutiOrdinari)}</td>
                    <td className="r">{oreEMinuti(totale.minutiStraordinari)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabella>
            <h2>Registrazioni giornaliere</h2>
            <Tabella>
              <thead><tr><th>Data</th><th>Persona</th><th className="r">Ore ordinarie</th><th className="r">Straordinario</th><th>Azioni</th></tr></thead>
              <tbody>
                {registro.data.map((p) => (
                  <tr key={p.id}>
                    <td>{formatData(p.giorno)}</td>
                    <td>{p.persona.cognome} {p.persona.nome}</td>
                    <td className="r">{oreEMinuti(p.minutiOrdinari)}</td>
                    <td className="r">{oreEMinuti(p.minutiStraordinari)}</td>
                    <td>
                      <div className="page-actions">
                        <Button variant="ghost" disabled={!!edita || rimuovi.isPending} onClick={() => setEdita(p)}>Modifica</Button>
                        <Button variant="ghost" disabled={!!edita || rimuovi.isPending}
                          onClick={() => window.confirm('Rimuovere questa presenza dal registro?') && rimuovi.mutate(p.id)}>Rimuovi</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabella>
          </>
        )}
      </section>
    </>
  );
}

function ModuloPresenza({ persone, giorno, presenza, chiudi, salvata }:
  { persone: Persona[]; giorno: string; presenza?: Presenza; chiudi: () => void; salvata: (p: Presenza) => void }) {
  const cache = useQueryClient();
  const salva = useMutation({
    mutationFn: (body: PresenzaInput) => presenza
      ? api<Presenza>('/personale/presenze/' + presenza.id, { method: 'PUT', body })
      : api<Presenza>('/personale/presenze', { body }),
    onSuccess: async (p) => {
      await cache.invalidateQueries({ queryKey: ['presenze', p.giorno.slice(0, 7)] });
      salvata(p);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dati = new FormData(event.currentTarget);
    salva.mutate({
      personaId: presenza?.personaId ?? String(dati.get('personaId') ?? ''),
      giorno: presenza?.giorno ?? String(dati.get('giorno') ?? ''),
      minutiOrdinari: Number(dati.get('minutiOrdinari')),
      minutiStraordinari: Number(dati.get('minutiStraordinari')),
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{presenza ? 'Modifica presenza' : 'Nuova presenza'}</h2>
      {presenza && <p>{presenza.persona.cognome} {presenza.persona.nome} · {formatData(presenza.giorno)}</p>}
      <div className="grid-2">
        {!presenza && (
          <>
            <Select label="Persona" name="personaId" defaultValue="" required>
              <option disabled value="">Seleziona una persona</option>
              {persone.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome} · {p.mansione}</option>)}
            </Select>
            <Field label="Giorno" type="date" name="giorno" defaultValue={giorno} min="1900-01-01" max="9999-12-31" required />
          </>
        )}
        <Field label="Ordinario (minuti)" name="minutiOrdinari" type="number" min="0" max="1440" step="1" required
          defaultValue={presenza?.minutiOrdinari ?? ''} />
        <Field label="Straordinario (minuti)" name="minutiStraordinari" type="number" min="0" max="1440" step="1"
          required defaultValue={presenza?.minutiStraordinari ?? 0} error={fieldError(salva.error, 'minutiStraordinari')} />
      </div>
      <ErrorBox error={salva.error} />
      <div className="form-actions">
        <Button disabled={salva.isPending}>Salva presenza</Button>
        <Button variant="ghost" type="button" disabled={salva.isPending} onClick={chiudi}>Annulla</Button>
      </div>
    </form>
  );
}
