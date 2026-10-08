import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ETICHETTA_LIVELLO, formatData, todayIso, type CanaleSollecito, type Controparte, type Sollecito } from '@suite/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, scarica } from '../api';
import { Button, ErrorBox, Money, PageHeader } from '../ui';

const ETICHETTA_CANALE: Record<CanaleSollecito, string> = {
  email: 'Email',
  pec: 'PEC',
  manuale: 'Fuori dalla app',
};

function Invio({ s, controparte }: { s: Sollecito; controparte: Controparte | undefined }) {
  const qc = useQueryClient();
  const [canale, setCanale] = useState<CanaleSollecito>(s.livello === 'diffida' ? 'pec' : 'email');
  const [destinatario, setDestinatario] = useState('');
  const [inviatoIl, setInviatoIl] = useState(todayIso());

  useEffect(() => {
    if (canale === 'pec') setDestinatario(controparte?.pec ?? '');
    if (canale === 'email') setDestinatario(controparte?.email ?? '');
  }, [canale, controparte]);

  const invia = useMutation({
    mutationFn: () =>
      api<Sollecito>(`/solleciti/${s.id}/invia`, {
        body:
          canale === 'manuale'
            ? { canale, inviatoIl }
            : { canale, ...(destinatario ? { destinatario } : {}) },
      }),
    onSuccess: (nuovo) => {
      qc.setQueryData(['sollecito', s.id], nuovo);
      void qc.invalidateQueries({ queryKey: ['solleciti'] });
      void qc.invalidateQueries({ queryKey: ['crediti'] });
    },
  });

  return (
    <section className="card">
      <h2>Invia</h2>
      <div className="segmented" role="radiogroup" aria-label="Canale di invio">
        {(['email', 'pec', 'manuale'] as const).map((c) => (
          <button key={c} role="radio" aria-checked={canale === c} className={canale === c ? 'active' : ''} onClick={() => setCanale(c)}>
            {c === 'manuale' ? "L'ho già inviato io" : ETICHETTA_CANALE[c]}
          </button>
        ))}
      </div>
      {canale === 'manuale' ? (
        <div className="send-row">
          <label className="field">
            <span className="field-label">Data di invio</span>
            <input type="date" value={inviatoIl} onChange={(e) => setInviatoIl(e.target.value)} />
          </label>
          <p className="muted small">Per raccomandata A/R o PEC inviata dalla tua casella: conserva le ricevute.</p>
        </div>
      ) : (
        <div className="send-row">
          <label className="field">
            <span className="field-label">{canale === 'pec' ? 'PEC del destinatario' : 'Email del destinatario'}</span>
            <input type="email" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="nome@dominio.it" />
          </label>
          <p className="muted small">La lettera parte con il PDF allegato.</p>
        </div>
      )}
      <ErrorBox error={invia.error} />
      <div className="form-actions">
        <Button onClick={() => invia.mutate()} disabled={invia.isPending}>
          {canale === 'manuale' ? 'Segna come inviato' : `Invia via ${ETICHETTA_CANALE[canale]}`}
        </Button>
      </div>
    </section>
  );
}

export function SollecitoDettaglio() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sollecito', id], queryFn: () => api<Sollecito>(`/solleciti/${id}`) });
  const s = q.data;
  const controparte = useQuery({
    queryKey: ['controparte', s?.controparte.id],
    queryFn: () => api<Controparte>(`/controparti/${s!.controparte.id}`),
    enabled: !!s,
  });
  const pdf = useMutation({ mutationFn: () => scarica(`/solleciti/${id}/pdf`) });
  const elimina = useMutation({
    mutationFn: () => api(`/solleciti/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['solleciti'] });
      navigate('/solleciti');
    },
  });

  return (
    <>
      <PageHeader
        title={s ? `${ETICHETTA_LIVELLO[s.livello]} · ${s.controparte.denominazione}` : 'Sollecito'}
        subtitle={s ? `Importi al ${formatData(s.alla)}` : undefined}
        actions={<Link to="/solleciti">Tutti i solleciti</Link>}
      />
      <ErrorBox error={q.error} />
      {s && (
        <>
          <section className="card">
            <div className="card-row">
              <div className="totals">
                <div>
                  <span className="muted small">Totale richiesto</span>
                  <Money cents={s.totaleCents} strong />
                </div>
                <div>
                  <span className="muted small">Stato</span>
                  {s.stato === 'bozza' ? (
                    <span className="badge">Bozza</span>
                  ) : (
                    <span className="badge badge-ok">
                      Inviato il {formatData(s.inviatoIl!)} · {ETICHETTA_CANALE[s.canale!]}
                      {s.destinatario ? ` a ${s.destinatario}` : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="page-actions">
                <Button variant="secondary" onClick={() => pdf.mutate()} disabled={pdf.isPending}>
                  Scarica PDF
                </Button>
                {s.stato === 'bozza' && (
                  <Button
                    variant="secondary"
                    onClick={() => window.confirm('Eliminare questa bozza?') && elimina.mutate()}
                    disabled={elimina.isPending}
                  >
                    Elimina bozza
                  </Button>
                )}
              </div>
            </div>
            <ErrorBox error={pdf.error ?? elimina.error} />
          </section>

          {s.stato === 'bozza' && <Invio s={s} controparte={controparte.data} />}

          <section className="card letter">
            <p className="letter-subject">Oggetto: {s.oggetto}</p>
            <div className="letter-body">{s.testo}</div>
          </section>
        </>
      )}
    </>
  );
}
