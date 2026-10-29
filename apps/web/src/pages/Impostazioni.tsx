import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ETICHETTA_LIVELLO, formatData, LIVELLI_SOLLECITO, type Azienda, type LivelloSollecito } from '@suite/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Link } from 'react-router-dom';
import { Button, ErrorBox, Field, fieldError, PageHeader, Select } from '../ui';

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
      {q.data && <SollecitiAutomatici azienda={q.data} />}
    </>
  );
}

function SollecitiAutomatici({ azienda }: { azienda: Azienda }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    attivi: azienda.sollecitiAutoAttivi,
    giorni: String(azienda.sollecitiAutoGiorni),
    livelloMax: azienda.sollecitiAutoLivelloMax as LivelloSollecito,
  });
  const [salvato, setSalvato] = useState(false);
  const m = useMutation({
    mutationFn: () =>
      api<Azienda>('/azienda', {
        method: 'PATCH',
        body: { sollecitiAutoAttivi: form.attivi, sollecitiAutoGiorni: Number(form.giorni), sollecitiAutoLivelloMax: form.livelloMax },
      }),
    onSuccess: (a) => {
      qc.setQueryData(['azienda'], a);
      void qc.invalidateQueries({ queryKey: ['solleciti-piano'] });
      setSalvato(true);
    },
  });
  const cambia = (f: Partial<typeof form>) => {
    setSalvato(false);
    setForm({ ...form, ...f });
  };

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <h2>Solleciti automatici</h2>
      <p className="muted small">
        Ogni mattina alle 9 l'app controlla i crediti scaduti e invia da sola il passo successivo a ogni cliente: prima un
        promemoria, poi il sollecito formale, rispettando le attese tra un invio e l'altro. Puoi escludere singoli clienti
        dalla pagina <Link to="/clienti">Clienti</Link> e vedere cosa partirà oggi in <Link to="/solleciti">Solleciti</Link>.
      </p>
      <label className="inline-field checkbox spaziato">
        <input type="checkbox" checked={form.attivi} onChange={(e) => cambia({ attivi: e.target.checked })} />
        Attiva i solleciti automatici
      </label>
      <div className="grid-2">
        <Field
          label="Primo contatto dopo (giorni di ritardo)"
          type="number"
          min={1}
          max={365}
          value={form.giorni}
          onChange={(e) => cambia({ giorni: e.target.value })}
          error={fieldError(m.error, 'sollecitiAutoGiorni')}
        />
        <Select label="Fino a" value={form.livelloMax} onChange={(e) => cambia({ livelloMax: e.target.value as LivelloSollecito })}>
          {LIVELLI_SOLLECITO.map((l) => (
            <option key={l} value={l}>
              {ETICHETTA_LIVELLO[l]}
            </option>
          ))}
        </Select>
      </div>
      {form.livelloMax === 'diffida' && (
        <p className="small warn-text">
          La diffida automatica parte solo via PEC e vale come costituzione in mora: attivala solo se sei sicuro dei dati delle
          fatture e dei clienti.
        </p>
      )}
      {m.error && !fieldError(m.error, 'sollecitiAutoGiorni') && <ErrorBox error={m.error} />}
      <div className="form-actions">
        {azienda.sollecitiAutoUltimaEsecuzione && (
          <span className="muted small saved">Ultimo giro: {formatData(azienda.sollecitiAutoUltimaEsecuzione)}</span>
        )}
        {salvato && <span className="muted small saved">Salvato</span>}
        <Button type="submit" disabled={m.isPending}>
          Salva
        </Button>
      </div>
    </form>
  );
}
