import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ETICHETTA_LIVELLO,
  formatData,
  type EsitoSollecitiAuto,
  type PianoSollecitiAuto,
  type Sollecito,
} from '@suite/shared';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Button, Empty, ErrorBox, Money, PageHeader } from '../ui';

const canale = { email: 'Email', pec: 'PEC', manuale: 'Fuori app' } as const;

export function Solleciti() {
  const q = useQuery({ queryKey: ['solleciti'], queryFn: () => api<Sollecito[]>('/solleciti') });

  return (
    <>
      <PageHeader
        title="Solleciti"
        subtitle="Storico di promemoria, solleciti e diffide: utile anche come prova per un decreto ingiuntivo."
      />
      <ErrorBox error={q.error} />
      <PianoAutomatico />
      <section className="card">
        {q.data?.length === 0 && (
          <Empty title="Nessun sollecito">
            Parti da <Link to="/">Crediti scaduti</Link> e clicca Sollecita accanto a un cliente.
          </Empty>
        )}
        {q.data && q.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th className="r">Totale richiesto</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td className="num">{formatData(s.inviatoIl ?? s.createdAt)}</td>
                  <td>
                    <Link to={`/solleciti/${s.id}`}>{s.controparte.denominazione}</Link>
                  </td>
                  <td>
                    {ETICHETTA_LIVELLO[s.livello]} {s.automatico && <span className="badge badge-info">Automatico</span>}
                  </td>
                  <td className="r">
                    <Money cents={s.totaleCents} />
                  </td>
                  <td>
                    {s.stato === 'bozza' ? (
                      <span className="badge">Bozza</span>
                    ) : (
                      <span className="badge badge-ok">Inviato · {canale[s.canale!]}</span>
                    )}
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

function PianoAutomatico() {
  const qc = useQueryClient();
  const piano = useQuery({ queryKey: ['solleciti-piano'], queryFn: () => api<PianoSollecitiAuto>('/solleciti/automatici/piano') });
  const esegui = useMutation({
    mutationFn: () => api<EsitoSollecitiAuto>('/solleciti/automatici/esegui', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['solleciti'] });
      void qc.invalidateQueries({ queryKey: ['solleciti-piano'] });
      void qc.invalidateQueries({ queryKey: ['azienda'] });
    },
  });
  const p = piano.data;
  if (!p) return <ErrorBox error={piano.error} />;

  if (!p.attivi) {
    return (
      <section className="card">
        <div className="card-row">
          <div>
            <h2>Solleciti automatici</h2>
            <p className="muted small">
              Spenti. Attivali in <Link to="/impostazioni">Impostazioni</Link>: ogni mattina l'app manderà da sola promemoria e
              solleciti ai clienti in ritardo.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const daInviare = p.righe.filter((r) => r.decisione.azione === 'invia').length;
  const esito = esegui.data;
  return (
    <section className="card">
      <div className="card-row">
        <div>
          <h2>Solleciti automatici di oggi</h2>
          <p className="muted small">
            {daInviare === 0
              ? 'Oggi non parte nulla: per ogni cliente in ritardo trovi il motivo qui sotto.'
              : `${daInviare === 1 ? 'Parte 1 sollecito' : `Partono ${daInviare} solleciti`} al giro delle 9, oppure subito con "Invia ora".`}
          </p>
        </div>
        <Button onClick={() => esegui.mutate()} disabled={esegui.isPending || daInviare === 0}>
          {esegui.isPending ? 'Invio…' : 'Invia ora'}
        </Button>
      </div>
      <ErrorBox error={esegui.error} />
      {esito && (
        <ul className="import-results">
          {esito.inviati.length > 0 && (
            <li className="ok">
              Inviati {esito.inviati.length}: {esito.inviati.map((s) => s.controparte.denominazione).join(', ')}
            </li>
          )}
          {esito.errori.map((e) => (
            <li key={e.controparte.id} className="ko">
              {e.controparte.denominazione}: {e.messaggio}
            </li>
          ))}
        </ul>
      )}
      {p.righe.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="r">Ritardo</th>
              <th className="r">Scaduto</th>
              <th>Oggi</th>
            </tr>
          </thead>
          <tbody>
            {p.righe.map((r) => (
              <tr key={r.controparte.id}>
                <td>{r.controparte.denominazione}</td>
                <td className="r num">{r.giorniRitardoMax} gg</td>
                <td className="r">
                  <Money cents={r.scadutoCents} />
                </td>
                <td>
                  {r.decisione.azione === 'invia' ? (
                    <span className="badge badge-warn">
                      {ETICHETTA_LIVELLO[r.decisione.livello]} via {r.decisione.canale === 'pec' ? 'PEC' : 'email'}
                    </span>
                  ) : (
                    <span className="muted small">{r.decisione.motivo}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
