import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatBps, formatData, parseEuroToCents, todayIso, totaliPreventivo,
  type Controparte, type EsitoPreventivoInput, type Preventivo, type PreventivoInput,
  type PreventivoSintesi, type StatoPreventivo, type VocePreventivo,
} from '@suite/shared';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, scarica } from '../api';
import { Button, Empty, ErrorBox, Field, Money, PageHeader, Select, Tabella } from '../ui';

const stati: Record<StatoPreventivo, string> = {
  bozza: 'Bozza', inviato: 'Inviato', accettato: 'Accettato', rifiutato: 'Rifiutato',
};

export function Preventivi() {
  const [stato, setStato] = useState('tutti');
  const elenco = useQuery({ queryKey: ['preventivi'], queryFn: () => api<PreventivoSintesi[]>('/preventivi') });
  const visibili = elenco.data?.filter((p) => stato === 'tutti' || p.stato === stato) ?? [];

  return (
    <>
      <PageHeader title="Preventivi" actions={<Link to="/preventivi/nuovo" className="btn btn-primary">Nuovo preventivo</Link>} />
      <ErrorBox error={elenco.error} />
      {elenco.isPending && <p>Caricamento preventivi…</p>}
      {elenco.data?.length === 0 && <Empty title="Nessun preventivo" />}
      {!!elenco.data?.length && (
        <section className="card">
          <div className="inline-form spaziato">
            <Select label="Stato" value={stato} onChange={(e) => setStato(e.target.value)}>
              <option value="tutti">Tutti</option>
              {Object.entries(stati).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </Select>
          </div>
          {visibili.length === 0 ? <Empty title="Nessun preventivo per questo stato" /> : (
            <Tabella>
              <thead><tr><th>Preventivo</th><th>Cliente</th><th>Data</th><th>Valido fino al</th><th>Stato</th><th className="r">Totale</th></tr></thead>
              <tbody>
                {visibili.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={p.id}>{p.titolo}</Link></td>
                    <td>{p.cliente.denominazione}</td>
                    <td>{formatData(p.data)}</td>
                    <td>{p.validoFino ? formatData(p.validoFino) : '—'}</td>
                    <td><span className="badge">{stati[p.stato]}</span></td>
                    <td className="r"><Money cents={p.totaleCents} strong /></td>
                  </tr>
                ))}
              </tbody>
            </Tabella>
          )}
        </section>
      )}
    </>
  );
}

export function PreventivoDettaglio() {
  const { id = '' } = useParams();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['preventivi', id], queryFn: () => api<Preventivo>('/preventivi/' + id) });
  const cambia = useMutation({
    mutationFn: (stato: EsitoPreventivoInput['stato']) =>
      api<Preventivo>('/preventivi/' + id + '/stato', { method: 'PATCH', body: { stato } }),
    onSuccess: async (p) => {
      cache.setQueryData(['preventivi', id], p);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['preventivi'], exact: true }),
        cache.invalidateQueries({ queryKey: ['commesse'], exact: true }),
      ]);
    },
  });
  const pdf = useMutation({ mutationFn: () => scarica('/preventivi/' + id + '/pdf') });
  const p = query.data;
  const totali = p && totaliPreventivo(p.voci);

  return (
    <>
      <PageHeader title={p?.titolo ?? 'Preventivo'} subtitle={p?.cliente.denominazione}
        actions={<Link to="/preventivi">Tutti i preventivi</Link>} />
      <ErrorBox error={query.error ?? cambia.error ?? pdf.error} />
      {query.isPending && <p>Caricamento preventivo…</p>}
      {p && totali && (
        <section className="card">
          <div className="card-row">
            <div>
              <span className="badge">{stati[p.stato]}</span>
              <p className="muted small">{formatData(p.data)}{p.validoFino && ' · Valido fino al ' + formatData(p.validoFino)}</p>
            </div>
            <div className="page-actions">
              <Button variant="secondary" disabled={pdf.isPending} onClick={() => pdf.mutate()}>Scarica PDF</Button>
              {p.stato === 'bozza' && (
                <>
                  <Link className="btn btn-secondary" to="modifica">Modifica bozza</Link>
                  <Button disabled={cambia.isPending} onClick={() => cambia.mutate('inviato')}>Segna come inviato</Button>
                </>
              )}
              {p.stato === 'inviato' && (
                <>
                  <Button variant="secondary" disabled={cambia.isPending} onClick={() => cambia.mutate('rifiutato')}>Segna come rifiutato</Button>
                  <Button disabled={cambia.isPending} onClick={() => cambia.mutate('accettato')}>Accetta e crea commessa</Button>
                </>
              )}
              {p.commessaId && <Link className="btn btn-primary" to={'/commesse/' + p.commessaId}>Apri commessa</Link>}
            </div>
          </div>
          <Tabella>
            <thead><tr><th>Voce</th><th className="r">Quantità</th><th className="r">Prezzo unitario</th><th className="r">IVA</th><th className="r">Imponibile</th></tr></thead>
            <tbody>
              {p.voci.map((voce, i) => (
                <tr key={i}>
                  <td>{voce.descrizione}</td>
                  <td className="r num">{voce.quantita}</td>
                  <td className="r"><Money cents={voce.prezzoCents} /></td>
                  <td className="r num">{formatBps(voce.ivaBps)}</td>
                  <td className="r"><Money cents={voce.prezzoCents * voce.quantita} /></td>
                </tr>
              ))}
            </tbody>
          </Tabella>
          <dl className="totali-preventivo">
            <dt>Imponibile</dt><dd><Money cents={totali.imponibileCents} /></dd>
            <dt>IVA</dt><dd><Money cents={totali.ivaCents} /></dd>
            <dt>Totale</dt><dd><Money cents={totali.totaleCents} strong /></dd>
          </dl>
          {p.note && <p className="letter-body">{p.note}</p>}
        </section>
      )}
    </>
  );
}

export function ModificaPreventivo() {
  const { id = '' } = useParams();
  const dettaglio = useQuery({ queryKey: ['preventivi', id], queryFn: () => api<Preventivo>('/preventivi/' + id), enabled: !!id });
  const clienti = useQuery({ queryKey: ['controparti'], queryFn: () => api<Controparte[]>('/controparti') });
  const opzioni = clienti.data?.filter((cliente) => cliente.tipo !== 'fornitore') ?? [];
  const p = dettaglio.data;

  return (
    <>
      <PageHeader title={id ? 'Modifica preventivo' : 'Nuovo preventivo'}
        actions={<Link to={id ? '/preventivi/' + id : '/preventivi'}>Annulla</Link>} />
      <ErrorBox error={dettaglio.error ?? clienti.error} />
      {clienti.isPending || (id && dettaglio.isPending) ? <p>Caricamento…</p> : null}
      {clienti.isSuccess && opzioni.length === 0 && (
        <Empty title="Serve un cliente per creare un preventivo"><Link to="/clienti">Vai a Clienti e fornitori</Link></Empty>
      )}
      {p && p.stato !== 'bozza' ? <Empty title="Il preventivo è già stato inviato" /> : (
        (!!opzioni.length && (!id || p)) && <ModuloPreventivo key={id || 'nuovo'} preventivo={p} clienti={opzioni} />
      )}
    </>
  );
}

type RigaModulo = { id: number; descrizione: string; quantita: string; prezzo: string; iva: string };

function ModuloPreventivo({ preventivo, clienti }: { preventivo?: Preventivo; clienti: Controparte[] }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [voci, setVoci] = useState<RigaModulo[]>(() => preventivo?.voci.map((v, id) => ({
    id, descrizione: v.descrizione, quantita: String(v.quantita),
    prezzo: (v.prezzoCents / 100).toFixed(2).replace('.', ','), iva: String(v.ivaBps / 100).replace('.', ','),
  })) ?? [{ id: 0, descrizione: '', quantita: '1', prezzo: '', iva: '22' }]);
  const prossimoId = useRef(voci.length);

  function aggiornaVoce(id: number, campo: 'descrizione' | 'quantita' | 'prezzo' | 'iva', valore: string) {
    setVoci((correnti) => correnti.map((voce) => voce.id === id ? { ...voce, [campo]: valore } : voce));
  }

  const salva = useMutation({
    mutationFn: (form: FormData) => {
      const righe: VocePreventivo[] = voci.map((v) => ({
        descrizione: v.descrizione,
        quantita: Number(v.quantita),
        prezzoCents: parseEuroToCents(v.prezzo),
        ivaBps: parseEuroToCents(v.iva),
      }));
      const body: PreventivoInput = {
        clienteId: String(form.get('clienteId') ?? ''),
        titolo: String(form.get('titolo') ?? ''),
        data: String(form.get('data') ?? ''),
        validoFino: String(form.get('validoFino') ?? '') || null,
        note: String(form.get('note') ?? '').trim() || null,
        voci: righe,
      };
      return preventivo
        ? api<Preventivo>('/preventivi/' + preventivo.id, { method: 'PUT', body })
        : api<Preventivo>('/preventivi', { body });
    },
    onSuccess: async (p) => {
      cache.setQueryData(['preventivi', p.id], p);
      await cache.invalidateQueries({ queryKey: ['preventivi'], exact: true });
      navigate('/preventivi/' + p.id);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    salva.mutate(new FormData(event.currentTarget));
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="grid-2">
        <Field label="Titolo" name="titolo" maxLength={160} defaultValue={preventivo?.titolo} required />
        <Select label="Cliente" name="clienteId" required defaultValue={preventivo?.clienteId ?? ''}>
          <option value="" disabled>Seleziona un cliente</option>
          {clienti.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.denominazione}</option>)}
        </Select>
        <Field label="Data del preventivo" name="data" type="date" defaultValue={preventivo?.data ?? todayIso()} required />
        <Field label="Valido fino al" name="validoFino" type="date" defaultValue={preventivo?.validoFino ?? ''} />
      </div>
      {voci.map((voce) => (
        <fieldset key={voce.id} className="voce-preventivo">
          <legend>Voce</legend>
          <div className="grid-4">
            <Field label="Descrizione" value={voce.descrizione} onChange={(e) => aggiornaVoce(voce.id, 'descrizione', e.target.value)} maxLength={240} required />
            <Field label="Quantità" type="number" min={1} max={1000} value={voce.quantita} onChange={(e) => aggiornaVoce(voce.id, 'quantita', e.target.value)} required />
            <Field label="Prezzo unitario (€)" inputMode="decimal" value={voce.prezzo} onChange={(e) => aggiornaVoce(voce.id, 'prezzo', e.target.value)} required />
            <Field label="IVA (%)" inputMode="decimal" value={voce.iva} onChange={(e) => aggiornaVoce(voce.id, 'iva', e.target.value)} required />
          </div>
          {voci.length > 1 && <Button type="button" variant="ghost" onClick={() => setVoci(voci.filter((v) => v.id !== voce.id))}>Rimuovi voce</Button>}
        </fieldset>
      ))}
      <Button type="button" variant="secondary" disabled={voci.length >= 100}
        onClick={() => setVoci([...voci, { id: prossimoId.current++, descrizione: '', quantita: '1', prezzo: '', iva: '22' }])}>Aggiungi voce</Button>
      <label className="field note-preventivo">
        <span className="field-label">Note</span>
        <textarea name="note" defaultValue={preventivo?.note ?? ''} maxLength={2000} rows={3} />
      </label>
      <ErrorBox error={salva.error} />
      <div className="form-actions"><Button disabled={salva.isPending}>{salva.isPending ? 'Salvataggio…' : 'Salva bozza'}</Button></div>
    </form>
  );
}
