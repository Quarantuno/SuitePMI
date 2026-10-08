import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ETICHETTA_LIVELLO,
  LIVELLI_SOLLECITO,
  formatData,
  todayIso,
  type AnteprimaSollecito,
  type LivelloSollecito,
  type Sollecito,
} from '@suite/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Button, ErrorBox, Money, PageHeader } from '../ui';

export function NuovoSollecito() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const controparteId = params.get('cliente') ?? '';
  const alla = params.get('alla') ?? todayIso();
  const [livello, setLivello] = useState<LivelloSollecito | undefined>(undefined);
  const [oggetto, setOggetto] = useState('');
  const [testo, setTesto] = useState('');
  const [modificato, setModificato] = useState(false);

  const anteprima = useQuery({
    queryKey: ['anteprima-sollecito', controparteId, livello, alla],
    queryFn: () =>
      api<AnteprimaSollecito>('/solleciti/anteprima', { body: { controparteId, livello, alla } }),
    enabled: !!controparteId,
    retry: false,
  });
  const a = anteprima.data;

  // Ogni nuova anteprima (cambio livello) sostituisce il testo proposto.
  useEffect(() => {
    if (!a) return;
    setOggetto(a.oggetto);
    setTesto(a.testo);
    setModificato(false);
    if (!livello) setLivello(a.livello);
  }, [a]); // eslint-disable-line react-hooks/exhaustive-deps

  const salva = useMutation({
    mutationFn: () =>
      api<Sollecito>('/solleciti', { body: { controparteId, livello: a!.livello, alla, oggetto, testo } }),
    onSuccess: (s) => navigate(`/solleciti/${s.id}`),
  });

  const cambiaLivello = (l: LivelloSollecito) => {
    if (modificato && !window.confirm('Cambiando livello il testo viene rigenerato e perdi le modifiche. Continuare?')) {
      return;
    }
    setLivello(l);
  };

  if (!controparteId) {
    return (
      <PageHeader title="Nuovo sollecito" subtitle="Scegli un cliente dalla pagina Crediti scaduti." />
    );
  }

  return (
    <>
      <PageHeader
        title={a ? `Sollecito a ${a.controparte.denominazione}` : 'Nuovo sollecito'}
        subtitle={`Importi e interessi calcolati al ${formatData(alla)}. Il testo è una bozza: modificalo come preferisci.`}
        actions={<Link to="/">Torna ai crediti</Link>}
      />
      <ErrorBox error={anteprima.error} />

      {a && (
        <>
          <section className="card">
            <div className="segmented" role="radiogroup" aria-label="Livello del sollecito">
              {LIVELLI_SOLLECITO.map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={a.livello === l}
                  className={a.livello === l ? 'active' : ''}
                  onClick={() => cambiaLivello(l)}
                >
                  {ETICHETTA_LIVELLO[l]}
                  {a.suggerito.livello === l && <span className="badge badge-info">consigliato</span>}
                </button>
              ))}
            </div>
            <p className="muted small">{a.suggerito.motivo}</p>
            {a.avvisi.length > 0 && (
              <ul className="alert alert-warn">
                {a.avvisi.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="totals">
              <div>
                <span className="muted small">Capitale</span>
                <Money cents={a.capitaleCents} />
              </div>
              <div>
                <span className="muted small">Interessi</span>
                <Money cents={a.interessiCents} />
              </div>
              <div>
                <span className="muted small">Indennizzi</span>
                <Money cents={a.indennizziCents} />
              </div>
              <div>
                <span className="muted small">Totale richiesto</span>
                <Money cents={a.totaleCents} strong />
              </div>
            </div>
          </section>

          <section className="card letter-editor">
            <label className="field">
              <span className="field-label">Oggetto</span>
              <input
                value={oggetto}
                onChange={(e) => {
                  setOggetto(e.target.value);
                  setModificato(true);
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Testo</span>
              <textarea
                value={testo}
                rows={24}
                onChange={(e) => {
                  setTesto(e.target.value);
                  setModificato(true);
                }}
              />
            </label>
            <ErrorBox error={salva.error} />
            <div className="form-actions">
              <Button onClick={() => salva.mutate()} disabled={salva.isPending || !oggetto.trim() || !testo.trim()}>
                Salva bozza e continua
              </Button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
