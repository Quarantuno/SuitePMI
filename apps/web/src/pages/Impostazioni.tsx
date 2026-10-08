import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Azienda } from '@suite/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Button, ErrorBox, Field, fieldError, PageHeader } from '../ui';

const campi = ['ragioneSociale', 'indirizzo', 'email', 'pec', 'iban'] as const;
type Form = Record<(typeof campi)[number], string>;

export function Impostazioni() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['azienda'], queryFn: () => api<Azienda>('/azienda') });
  const [form, setForm] = useState<Form>({ ragioneSociale: '', indirizzo: '', email: '', pec: '', iban: '' });
  const [salvato, setSalvato] = useState(false);

  useEffect(() => {
    if (q.data) {
      setForm({
        ragioneSociale: q.data.ragioneSociale,
        indirizzo: q.data.indirizzo ?? '',
        email: q.data.email ?? '',
        pec: q.data.pec ?? '',
        iban: q.data.iban ?? '',
      });
    }
  }, [q.data]);

  const m = useMutation({
    mutationFn: () => api<Azienda>('/azienda', { method: 'PATCH', body: form }),
    onSuccess: (a) => {
      qc.setQueryData(['azienda'], a);
      void qc.invalidateQueries({ queryKey: ['me'] });
      setSalvato(true);
    },
  });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSalvato(false);
    setForm({ ...form, [k]: e.target.value });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };

  return (
    <>
      <PageHeader title="Impostazioni azienda" subtitle="Questi dati compaiono nell'intestazione e nella firma di solleciti e diffide." />
      <ErrorBox error={q.error} />
      <form className="card" onSubmit={submit}>
        <div className="grid-2">
          <Field label="Ragione sociale" value={form.ragioneSociale} onChange={set('ragioneSociale')} required error={fieldError(m.error, 'ragioneSociale')} />
          <Field label="Partita IVA" value={q.data?.partitaIva ?? ''} disabled hint="Non modificabile" />
          <Field label="Indirizzo della sede" value={form.indirizzo} onChange={set('indirizzo')} placeholder="Via Roma 1, 20100 Milano (MI)" />
          <Field
            label="IBAN"
            value={form.iban}
            onChange={set('iban')}
            placeholder="IT60 X054 2811 1010 0000 0123 456"
            hint="Compare nelle lettere come coordinate per il bonifico"
            error={fieldError(m.error, 'iban')}
          />
          <Field label="Email amministrazione" type="email" value={form.email} onChange={set('email')} hint="Le risposte dei clienti arrivano qui" error={fieldError(m.error, 'email')} />
          <Field label="PEC" type="email" value={form.pec} onChange={set('pec')} error={fieldError(m.error, 'pec')} />
        </div>
        {m.error && !campi.some((c) => fieldError(m.error, c)) && <ErrorBox error={m.error} />}
        <div className="form-actions">
          {salvato && <span className="muted small saved">Salvato</span>}
          <Button type="submit" disabled={m.isPending}>
            Salva
          </Button>
        </div>
      </form>
    </>
  );
}
