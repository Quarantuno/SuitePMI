import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Clienti } from './pages/Clienti';
import { Crediti } from './pages/Crediti';
import { Fatture } from './pages/Fatture';
import { Accesso } from './pages/Accesso';
import { Button } from './ui';

function Layout() {
  const { sessione, esci } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            S
          </span>
          <div>
            <div className="brand-name">Suite PMI</div>
            <div className="brand-company">{sessione?.azienda.ragioneSociale}</div>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>
            Crediti scaduti
          </NavLink>
          <NavLink to="/fatture">Fatture</NavLink>
          <NavLink to="/clienti">Clienti e fornitori</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="muted small">{sessione?.utente.email}</div>
          <Button variant="ghost" onClick={esci}>
            Esci
          </Button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  const { sessione, caricamento } = useAuth();
  if (caricamento) return <div className="loading">Caricamento…</div>;

  if (!sessione) {
    return (
      <Routes>
        <Route path="/accedi" element={<Accesso modo="login" />} />
        <Route path="/registrati" element={<Accesso modo="registrazione" />} />
        <Route path="*" element={<Navigate to="/accedi" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Crediti />} />
        <Route path="fatture" element={<Fatture />} />
        <Route path="clienti" element={<Clienti />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
