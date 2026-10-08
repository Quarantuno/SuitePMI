import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Controparte } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Button, Empty, ErrorBox, Field, fieldError, PageHeader, Select } from '../ui';

const vuoto = { tipo: 'cliente', denominazione: '', partitaIva: '', email: '', pec: '', telefono: '' };

/** Converte le stringhe vuote in "assente", come si aspetta l'API. */
function pulisci(form: typeof vuoto) {
  return Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''));
}

const etichettaTipo = { cliente: 'Cliente', fornitore: 'Fornitore', entrambi: 'Cliente e fornitore' } as const;

export function Clienti() {
  const qc = useQueryClient();
  const [cerca, setCerca] = useState('');
  const [form, setForm] = useState(vuoto);
  const [aperto, setAperto] = useState(false);

  const q = useQuery({
    queryKey: ['controparti', cerca],
    queryFn: () => api<Controparte[]>(`/controparti${cerca ? `?q=${encodeURIComponent(cerca)}` : ''}`),
  });
  const crea = useMutation({
    mutationFn: () => api<Controparte>('/controparti', { body: pulisci(form) }),
    onSuccess: () => {
      setForm(vuoto);
      setAperto(false);
      void qc.invalidateQueries({ queryKey: ['controparti'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    crea.mutate();
  };
  const set = (k: keyof typeof vuoto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <PageHeader
        title="Clienti e fornitori"
        subtitle="Si aggiornano da soli quando importi le fatture elettroniche."
        actions={<Button onClick={() => setAperto(!aperto)}>{aperto ? 'Annulla' : 'Nuova controparte'}</Button>}
      />

      {aperto && (
        <form className="card" onSubmit={submit}>
          <h2>Nuova controparte</h2>
          <div className="grid-3">
            <Field label="Denominazione" value={form.denominazione} onChange={set('denominazione')} required error={fieldError(crea.error, 'denominazione')} />
            <Field
              label="Partita IVA"
              value={form.partitaIva}
              onChange={set('partitaIva')}
              inputMode="numeric"
              hint="Senza P.IVA è un consumatore: niente interessi di mora"
              error={fieldError(crea.error, 'partitaIva')}
            />
            <Select label="Tipo" value={form.tipo} onChange={set('tipo')}>
              <option value="cliente">Cliente</option>
              <option value="fornitore">Fornitore</option>
              <option value="entrambi">Cliente e fornitore</option>
            </Select>
            <Field label="Email" type="email" value={form.email} onChange={set('email')} error={fieldError(crea.error, 'email')} />
            <Field label="PEC" type="email" value={form.pec} onChange={set('pec')} hint="Serve per solleciti e diffide" error={fieldError(crea.error, 'pec')} />
            <Field label="Telefono" value={form.telefono} onChange={set('telefono')} />
          </div>
          {crea.error && !fieldError(crea.error, 'partitaIva') && !fieldError(crea.error, 'denominazione') && (
            <ErrorBox error={crea.error} />
          )}
          <div className="form-actions">
            <Button type="submit" disabled={crea.isPending}>
              Salva
            </Button>
          </div>
        </form>
      )}

      <section className="card">
        <input
          className="search"
          type="search"
          placeholder="Cerca per nome o partita IVA"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
        />
        <ErrorBox error={q.error} />
        {q.data?.length === 0 && <Empty title={cerca ? 'Nessun risultato' : 'Ancora nessuna controparte'} />}
        {q.data && q.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Denominazione</th>
                <th>Tipo</th>
                <th>Partita IVA</th>
                <th>Contatti</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.denominazione}
                    {c.indirizzo && <div className="muted small">{c.indirizzo}</div>}
                  </td>
                  <td>{etichettaTipo[c.tipo]}</td>
                  <td className="num">{c.partitaIva ?? <span className="muted">consumatore</span>}</td>
                  <td className="small">
                    {c.pec && <div>PEC: {c.pec}</div>}
                    {c.email && <div>{c.email}</div>}
                    {c.telefono && <div>{c.telefono}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
