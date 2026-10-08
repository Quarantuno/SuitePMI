import { useQuery } from '@tanstack/react-query';
import { ETICHETTA_LIVELLO, formatData, type Sollecito } from '@suite/shared';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Empty, ErrorBox, Money, PageHeader } from '../ui';

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
                  <td>{ETICHETTA_LIVELLO[s.livello]}</td>
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
