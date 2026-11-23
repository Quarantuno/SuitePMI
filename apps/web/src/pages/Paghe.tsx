import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  campiProspettoPaghe as campi, CSV_BOM, importoCsv, pagheMeseSchema, parseEuroToCents, toCsv,
  type Persona, type ProspettoPaghe, type ProspettoPagheInput,
} from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, salvaFile, scarica } from '../api';
import { Button, Empty, ErrorBox, Field, Money, PageHeader, Select, Tabella } from '../ui';

export function Paghe() {
  const [mese, setMese] = useState(() =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' }).format(new Date()),
  );
  const [edita, setEdita] = useState<ProspettoPaghe | 'nuovo' | null>(null);
  const persone = useQuery({ queryKey: ['personale'], queryFn: () => api<Persona[]>('/personale') });
  const prospetti = useQuery({ queryKey: ['paghe', mese], queryFn: () => api<ProspettoPaghe[]>('/personale/paghe?mese=' + mese) });
  const pdf = useMutation({ mutationFn: (id: string) => scarica('/personale/paghe/' + id + '/pdf') });
  const idPresenti = new Set(prospetti.data?.map((p) => p.personaId));
  const disponibili = persone.data?.filter((p) => !idPresenti.has(p.id)) ?? [];

  function cambiaMese(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const periodo = String(new FormData(event.currentTarget).get('mese') ?? '');
    if (!pagheMeseSchema.safeParse({ mese: periodo }).success) return;
    setMese(periodo);
  }

  function esporta() {
    if (!prospetti.data?.length) return;
    const dati = prospetti.data.map((p) => [
      p.mese, p.persona.nome, p.persona.cognome, p.persona.mansione,
      ...campi.map(([campo]) => importoCsv(p[campo])), importoCsv(p.saldoCents),
    ]);
    salvaFile('preparazione-paghe-' + mese + '.csv', CSV_BOM + toCsv([
      ['Mese', 'Nome', 'Cognome', 'Mansione', ...campi.map(([, label]) => label + ' (€)'), 'Saldo calcolato (€)'],
      ...dati,
    ]));
  }

  return (
    <>
      <PageHeader title="Preparazione paghe" subtitle="Prospetti interni calcolati dagli importi che inserisci." actions={
        <Link to="/personale">Torna al personale</Link>
      } />
      <ErrorBox error={persone.error ?? prospetti.error ?? pdf.error} />
      <section className="card">
        <div className="card-row">
          <form className="inline-form" onSubmit={cambiaMese}>
            <Field label="Mese di competenza" name="mese" type="month" defaultValue={mese} required
              min="1900-01" max="9999-12" pattern="[0-9]{4}-[0-9]{2}" placeholder="AAAA-MM" disabled={!!edita} />
            <Button type="submit" variant="secondary" disabled={!!edita}>Mostra mese</Button>
          </form>
          <div className="page-actions">
            {!!prospetti.data?.length && <Button variant="secondary" onClick={esporta}>Esporta CSV</Button>}
            {prospetti.isSuccess && !!disponibili.length && !edita && <Button onClick={() => setEdita('nuovo')}>Nuovo prospetto</Button>}
          </div>
        </div>
        {prospetti.isPending && <p>Caricamento prospetti…</p>}
        {prospetti.data?.length === 0 && <Empty title="Nessun prospetto per il mese selezionato" />}
        {!!prospetti.data?.length && (
          <Tabella>
            <thead><tr><th>Persona</th>{campi.map(([campo, label]) => <th key={campo} className="r">{label}</th>)}<th className="r">Saldo</th><th>Azioni</th></tr></thead>
            <tbody>
              {prospetti.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.persona.cognome} {p.persona.nome}</td>
                  {campi.map(([campo]) => <td key={campo} className="r"><Money cents={p[campo]} /></td>)}
                  <td className="r"><Money cents={p.saldoCents} strong /></td>
                  <td>
                    <div className="page-actions">
                      <Button variant="ghost" disabled={!!edita} onClick={() => setEdita(p)}>Modifica</Button>
                      <Button variant="secondary" disabled={pdf.isPending} onClick={() => pdf.mutate(p.id)}>PDF interno</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabella>
        )}
      </section>
      {edita && <ModuloPaghe key={edita === 'nuovo' ? 'nuovo' : edita.id} mese={mese}
        persone={disponibili} prospetto={edita === 'nuovo' ? undefined : edita} chiudi={() => setEdita(null)} />}
    </>
  );
}

function ModuloPaghe({ mese, persone, prospetto, chiudi }:
  { mese: string; persone: Persona[]; prospetto?: ProspettoPaghe; chiudi: () => void }) {
  const cache = useQueryClient();
  const salva = useMutation({
    mutationFn: (dati: FormData) => {
      const importo = (campo: (typeof campi)[number][0]) => parseEuroToCents(String(dati.get(campo) ?? ''));
      const body: ProspettoPagheInput = {
        personaId: prospetto?.personaId ?? String(dati.get('personaId') ?? ''),
        mese,
        lordoCents: importo('lordoCents'),
        competenzeCents: importo('competenzeCents'),
        contributiCents: importo('contributiCents'),
        ritenuteCents: importo('ritenuteCents'),
        trattenuteCents: importo('trattenuteCents'),
      };
      return api<ProspettoPaghe>('/personale/paghe', { method: 'PUT', body });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['paghe', mese] });
      chiudi();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    salva.mutate(new FormData(event.currentTarget));
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{prospetto ? prospetto.persona.cognome + ' ' + prospetto.persona.nome : 'Nuovo prospetto'}</h2>
      <div className="grid-2">
        {!prospetto && (
          <Select label="Persona" name="personaId" defaultValue="" required>
            <option disabled value="">Seleziona una persona</option>
            {persone.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome} · {p.mansione}</option>)}
          </Select>
        )}
        {campi.map(([campo, label]) => (
          <Field key={campo} label={label + ' (€)'} name={campo} inputMode="decimal"
            defaultValue={prospetto ? importoCsv(prospetto[campo]) : ''} required={campo === 'lordoCents'} />
        ))}
      </div>
      <ErrorBox error={salva.error} />
      <div className="form-actions">
        <Button disabled={salva.isPending}>Salva prospetto</Button>
        <Button variant="ghost" type="button" disabled={salva.isPending} onClick={chiudi}>Annulla</Button>
      </div>
    </form>
  );
}
