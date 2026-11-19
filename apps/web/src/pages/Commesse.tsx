import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatData, parseEuroToCents, type Commessa, type CommessaInput, type Controparte, type FatturaCommessa } from '@suite/shared';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { CostiCommessa } from './CostiCommessa';
import { Button, Empty, ErrorBox, Field, Money, PageHeader, Select } from '../ui';

export function Commesse() {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const elenco = useQuery({ queryKey: ['commesse'], queryFn: () => api<Commessa[]>('/commesse') });
  const clienti = useQuery({ queryKey: ['controparti'], queryFn: () => api<Controparte[]>('/controparti') });
  const opzioni = clienti.data?.filter((cliente) => cliente.tipo !== 'fornitore') ?? [];
  const crea = useMutation({
    mutationFn: (form: FormData) => {
      const body: CommessaInput = {
        clienteId: String(form.get('clienteId') ?? ''),
        nome: String(form.get('nome') ?? ''),
        budgetCents: parseEuroToCents(String(form.get('budget') ?? '')),
      };
      return api<Commessa>('/commesse', { body });
    },
    onSuccess: async (commessa) => {
      cache.setQueryData<Commessa[]>(['commesse'], (attuali) => [...(attuali ?? []), commessa]);
      await cache.invalidateQueries({ queryKey: ['commesse'] });
      navigate('/commesse/' + commessa.id);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    crea.mutate(new FormData(event.currentTarget));
  }

  return (
    <>
      <PageHeader title="Commesse" />
      <ErrorBox error={elenco.error ?? clienti.error ?? crea.error} />
      <section className="card">
        <h2>Nuova commessa</h2>
        {clienti.isPending && <p>Caricamento clienti…</p>}
        {clienti.isSuccess && opzioni.length === 0 && <p>Aggiungi prima un <Link to="/clienti">cliente</Link>.</p>}
        {opzioni.length > 0 && (
          <form className="inline-form" onSubmit={submit}>
            <Field label="Nome" name="nome" required maxLength={160} />
            <Select label="Cliente" name="clienteId" required defaultValue="">
              <option value="" disabled>Seleziona un cliente</option>
              {opzioni.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.denominazione}</option>)}
            </Select>
            <Field label="Budget lordo (€)" name="budget" inputMode="decimal" required />
            <Button disabled={crea.isPending}>{crea.isPending ? 'Creazione…' : 'Crea commessa'}</Button>
          </form>
        )}
      </section>
      {elenco.isPending && <p>Caricamento commesse…</p>}
      {elenco.data?.length === 0 && <Empty title="Nessuna commessa" />}
      {!!elenco.data?.length && (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>Commessa</th><th>Cliente</th><th className="r">Budget lordo</th></tr></thead>
            <tbody>
              {elenco.data.map((commessa) => (
                <tr key={commessa.id}>
                  <td><Link to={commessa.id}>{commessa.nome}</Link></td>
                  <td>{commessa.cliente.denominazione}</td>
                  <td className="r"><Money cents={commessa.budgetCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

export function CommessaDettaglio() {
  const { id } = useParams();
  const cache = useQueryClient();
  const elenco = useQuery({ queryKey: ['commesse'], queryFn: () => api<Commessa[]>('/commesse') });
  const commessa = elenco.data?.find((item) => item.id === id);
  const documenti = useQuery({
    queryKey: ['commesse', id, 'fatture'],
    queryFn: () => api<{ collegate: FatturaCommessa[]; disponibili: FatturaCommessa[] }>('/commesse/' + id + '/fatture'),
    enabled: !!commessa,
  });
  const collega = useMutation({
    mutationFn: ({ fatturaId, collegata }: { fatturaId: string; collegata: boolean }) =>
      api<void>('/commesse/' + id + '/fatture/' + fatturaId, { method: 'PATCH', body: { collegata } }),
    onSettled: () => cache.invalidateQueries({ queryKey: ['commesse'] }),
  });

  if (elenco.isPending) return <p>Caricamento commessa…</p>;
  if (elenco.error) return <ErrorBox error={elenco.error} />;
  if (!commessa) return <Empty title="Commessa non trovata"><Link to="/commesse">Torna alle commesse</Link></Empty>;

  const collegate = documenti.data?.collegate ?? [];
  const disponibili = documenti.data?.disponibili ?? [];
  const metriche = [
    { nome: 'Budget lordo', cents: commessa.budgetCents },
    { nome: 'Fatturato lordo', cents: collegate.reduce((tot, f) => tot + f.fatturatoCents, 0) },
    { nome: 'Incassato', cents: collegate.reduce((tot, f) => tot + f.incassatoCents, 0) },
    { nome: 'Residuo da incassare', cents: collegate.reduce((tot, f) => tot + f.residuoCents, 0) },
  ];

  function abbina(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    collega.mutate({ fatturaId: String(new FormData(event.currentTarget).get('fatturaId')), collegata: true });
  }

  return (
    <>
      <PageHeader title={commessa.nome} subtitle={commessa.cliente.denominazione} actions={<Link to="/commesse">Tutte le commesse</Link>} />
      <ErrorBox error={documenti.error ?? collega.error} />
      {documenti.isPending && <p>Caricamento fatture…</p>}
      {documenti.data && (
        <>
          <section className="kpis">
            {metriche.map(({ nome, cents }) => (
              <div className="kpi" key={nome}>
                <div className="kpi-label">{nome}</div>
                <div className="kpi-value"><Money cents={cents} /></div>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Fatture collegate</h2>
            {disponibili.length > 0 ? (
              <form className="inline-form" onSubmit={abbina}>
                <Select label="Fattura da collegare" name="fatturaId" required defaultValue="">
                  <option value="" disabled>Seleziona una fattura</option>
                  {disponibili.map((f) => <option key={f.id} value={f.id}>{f.numero} · {formatData(f.dataEmissione)}</option>)}
                </Select>
                <Button disabled={collega.isPending}>Collega</Button>
              </form>
            ) : <p className="muted">Nessuna fattura attiva disponibile per questo cliente.</p>}
            {collegate.length === 0 ? <Empty title="Nessuna fattura collegata" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fattura</th><th className="r">Totale</th><th className="r">Incassato</th><th className="r">Stornato</th><th className="r">Residuo</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {collegate.map((f) => (
                      <tr key={f.id}>
                        <td>{f.numero} · {formatData(f.dataEmissione)}</td>
                        <td className="r"><Money cents={f.fatturatoCents} /></td>
                        <td className="r"><Money cents={f.incassatoCents} /></td>
                        <td className="r"><Money cents={f.stornatoCents} /></td>
                        <td className="r"><Money cents={f.residuoCents} /></td>
                        <td><Button variant="ghost" disabled={collega.isPending} onClick={() => collega.mutate({ fatturaId: f.id, collegata: false })}>Scollega</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <CostiCommessa key={commessa.id} commessaId={commessa.id} />
    </>
  );
}
