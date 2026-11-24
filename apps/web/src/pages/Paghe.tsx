import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  campiProspettoPaghe as campi, CSV_BOM, importoCsv, pagheMeseSchema, parseEuroToCents, toCsv,
  type Persona, type ProspettoPaghe, type ProspettoPagheInput, type RiepilogoPaghe,
} from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, salvaFile, scarica } from '../api';
import { oreEMinuti } from '../presenze';
import { Button, Empty, ErrorBox, Field, Money, PageHeader, Select, Tabella } from '../ui';

export function Paghe() {
  const [mese, setMese] = useState(() =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' }).format(new Date()),
  );
  const [edita, setEdita] = useState<ProspettoPaghe | 'nuovo' | null>(null);
  const persone = useQuery({ queryKey: ['personale'], queryFn: () => api<Persona[]>('/personale') });
  const prospetti = useQuery({ queryKey: ['paghe', mese], queryFn: () => api<ProspettoPaghe[]>('/personale/paghe?mese=' + mese) });
  const riepilogo = useQuery({
    queryKey: ['riepilogo-paghe', mese],
    staleTime: 0,
    queryFn: () => api<RiepilogoPaghe[]>('/personale/paghe/riepilogo?mese=' + mese),
  });
  const totali = new Map(riepilogo.data?.map((riga) => [riga.personaId, riga]));
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
    if (!prospetti.data?.length || !riepilogo.isSuccess) return;
    const dati = prospetti.data.map((p) => {
      const ore = totali.get(p.personaId);
      return [
        p.mese, p.persona.nome, p.persona.cognome, p.persona.mansione,
        ...campi.map(([campo]) => importoCsv(p[campo])), importoCsv(p.saldoCents),
        ore?.giorniConPresenza ? ore.minutiOrdinari : '',
        ore?.giorniConPresenza ? ore.minutiStraordinari : '',
      ];
    });
    salvaFile('preparazione-paghe-' + mese + '.csv', CSV_BOM + toCsv([
      ['Mese', 'Nome', 'Cognome', 'Mansione', ...campi.map(([, label]) => label + ' (€)'), 'Saldo calcolato (€)',
        'Ordinario (minuti)', 'Straordinario (minuti)'],
      ...dati,
    ]));
  }

  function esportaRiepilogo() {
    if (!riepilogo.isSuccess || !riepilogo.data.length) return;
    salvaFile('riepilogo-mensile-paghe-' + mese + '.csv', CSV_BOM + toCsv([
      ['Mese', 'ID persona', 'Cognome', 'Nome', 'Mansione', 'Data ingresso', 'Data uscita', 'Giorni con presenza',
        'Ordinario (minuti)', 'Straordinario (minuti)', 'Ferie (giorni di calendario)', 'Permessi (giorni di calendario)',
        'Permessi a ore (minuti)'],
      ...riepilogo.data.map((r) => [
        mese, r.personaId, r.persona.cognome, r.persona.nome, r.persona.mansione, r.persona.dataIngresso, r.persona.dataUscita,
        r.giorniConPresenza, r.giorniConPresenza ? r.minutiOrdinari : '', r.giorniConPresenza ? r.minutiStraordinari : '',
        r.giorniFerie, r.giorniPermesso, r.minutiPermesso,
      ]),
    ]));
  }

  return (
    <>
      <PageHeader title="Preparazione paghe" subtitle="Prospetti interni calcolati dagli importi che inserisci." actions={
        <>
          <Link to="/personale">Torna al personale</Link>
          <Link to="/personale/presenze">Registro presenze</Link>
        </>
      } />
      <ErrorBox error={persone.error ?? prospetti.error ?? riepilogo.error ?? pdf.error} />
      <section className="card">
        <div className="card-row">
          <form className="inline-form" onSubmit={cambiaMese}>
            <Field label="Mese di competenza" name="mese" type="month" defaultValue={mese} required
              min="1900-01" max="9999-12" pattern="[0-9]{4}-[0-9]{2}" placeholder="AAAA-MM" disabled={!!edita} />
            <Button type="submit" variant="secondary" disabled={!!edita}>Mostra mese</Button>
          </form>
          <div className="page-actions">
            {!!prospetti.data?.length && <Button variant="secondary" onClick={esporta} disabled={!riepilogo.isSuccess || riepilogo.isFetching}>Esporta prospetti CSV</Button>}
            {prospetti.isSuccess && !!disponibili.length && !edita && <Button onClick={() => setEdita('nuovo')}>Nuovo prospetto</Button>}
          </div>
        </div>
        {prospetti.isPending && <p>Caricamento prospetti…</p>}
        {prospetti.data?.length === 0 && <Empty title="Nessun prospetto per il mese selezionato" />}
        {!!prospetti.data?.length && (
          <Tabella>
            <thead><tr><th>Persona</th><th className="r">Ore ordinarie</th><th className="r">Straordinario</th>{campi.map(([campo, label]) => <th key={campo} className="r">{label}</th>)}<th className="r">Saldo</th><th>Azioni</th></tr></thead>
            <tbody>
              {prospetti.data.map((p) => {
                const ore = totali.get(p.personaId);
                return (
                  <tr key={p.id}>
                    <td>{p.persona.cognome} {p.persona.nome}</td>
                    <td className="r">{ore?.giorniConPresenza ? oreEMinuti(ore.minutiOrdinari) : '—'}</td>
                    <td className="r">{ore?.giorniConPresenza ? oreEMinuti(ore.minutiStraordinari) : '—'}</td>
                    {campi.map(([campo]) => <td key={campo} className="r"><Money cents={p[campo]} /></td>)}
                    <td className="r"><Money cents={p.saldoCents} strong /></td>
                    <td>
                      <div className="page-actions">
                        <Button variant="ghost" disabled={!!edita} onClick={() => setEdita(p)}>Modifica</Button>
                        <Button variant="secondary" disabled={pdf.isPending} onClick={() => pdf.mutate(p.id)}>PDF interno</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabella>
        )}
      </section>
      {edita && <ModuloPaghe key={edita === 'nuovo' ? 'nuovo' : edita.id} mese={mese}
        persone={disponibili} totali={totali} prospetto={edita === 'nuovo' ? undefined : edita} chiudi={() => setEdita(null)} />}
      <section className="card">
        <div className="card-row">
          <h2>Riepilogo mensile</h2>
          {!!riepilogo.data?.length && (
            <Button variant="secondary" onClick={esportaRiepilogo} disabled={!riepilogo.isSuccess || riepilogo.isFetching}>Esporta riepilogo CSV</Button>
          )}
        </div>
        {riepilogo.isPending && <p>Caricamento riepilogo…</p>}
        {riepilogo.data?.length === 0 && <Empty title="Nessuna persona in organico nel mese selezionato" />}
        {!!riepilogo.data?.length && (
          <>
            <p className="muted">Le assenze a giornata intera sono conteggiate in giorni di calendario. Il trattino indica ore di presenza ancora da registrare.</p>
            <Tabella>
              <thead>
                <tr>
                  <th>Persona</th><th className="r">Giorni con presenza</th><th className="r">Ore ordinarie</th>
                  <th className="r">Straordinario</th><th className="r">Giorni di ferie</th><th className="r">Giorni di permesso</th>
                  <th className="r">Permessi a ore</th>
                </tr>
              </thead>
              <tbody>
                {riepilogo.data.map((r) => (
                  <tr key={r.personaId}>
                    <td>{r.persona.cognome} {r.persona.nome}</td>
                    <td className="r">{r.giorniConPresenza}</td>
                    <td className="r">{r.giorniConPresenza ? oreEMinuti(r.minutiOrdinari) : '—'}</td>
                    <td className="r">{r.giorniConPresenza ? oreEMinuti(r.minutiStraordinari) : '—'}</td>
                    <td className="r">{r.giorniFerie}</td>
                    <td className="r">{r.giorniPermesso}</td>
                    <td className="r">{oreEMinuti(r.minutiPermesso)}</td>
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

function ModuloPaghe({ mese, persone, totali, prospetto, chiudi }:
  { mese: string; persone: Persona[]; totali: Map<string, RiepilogoPaghe>; prospetto?: ProspettoPaghe; chiudi: () => void }) {
  const cache = useQueryClient();
  const [personaId, setPersonaId] = useState(prospetto?.personaId ?? '');
  const ore = totali.get(personaId);
  const salva = useMutation({
    mutationFn: (dati: FormData) => {
      const importo = (campo: (typeof campi)[number][0]) => parseEuroToCents(String(dati.get(campo) ?? ''));
      const body: ProspettoPagheInput = {
        personaId,
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
      {!prospetto && (
        <Select label="Persona" name="personaId" value={personaId} onChange={(event) => setPersonaId(event.target.value)} required>
          <option disabled value="">Seleziona una persona</option>
          {persone.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome} · {p.mansione}</option>)}
        </Select>
      )}
      {!!ore?.giorniConPresenza && <p>Ore ordinarie {oreEMinuti(ore.minutiOrdinari)} · Straordinario {oreEMinuti(ore.minutiStraordinari)}</p>}
      <div className="grid-2">
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
