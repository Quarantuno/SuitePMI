import { useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Cassa } from './pages/Cassa';
import { Clienti } from './pages/Clienti';
import { Assenze } from './pages/Assenze';
import { Personale } from './pages/Personale';
import { Commesse, CommessaDettaglio } from './pages/Commesse';
import { Crediti } from './pages/Crediti';
import { Fatture } from './pages/Fatture';
import { Impostazioni } from './pages/Impostazioni';
import { NuovoSollecito } from './pages/NuovoSollecito';
import { SollecitoDettaglio } from './pages/SollecitoDettaglio';
import { Solleciti } from './pages/Solleciti';
import { Accesso } from './pages/Accesso';
import { Button } from './ui';

const sezioni = [
  {
    titolo: 'Finanza',
    voci: [
      { to: '/', nome: 'Crediti scaduti', end: true },
      { to: '/fatture', nome: 'Fatture' },
      { to: '/solleciti', nome: 'Solleciti' },
      { to: '/cassa', nome: 'Cassa' },
    ],
  },
  {
    titolo: 'Operatività',
    voci: [
      { to: '/commesse', nome: 'Commesse' },
      { to: '/personale', nome: 'Personale' },
      { to: '/clienti', nome: 'Clienti e fornitori' },
    ],
  },
];

function Layout() {
  const { sessione, esci } = useAuth();
  const [menuAperto, setMenuAperto] = useState(false);
  const pulsanteMenu = useRef<HTMLButtonElement>(null);
  const contenuto = useRef<HTMLElement>(null);
  const azienda = sessione?.azienda.ragioneSociale ?? '';

  function naviga() {
    if (menuAperto) contenuto.current?.focus();
    setMenuAperto(false);
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#contenuto">Salta al contenuto</a>
      <aside className="sidebar" onKeyDown={(event) => {
        if (event.key !== 'Escape' || !menuAperto) return;
        setMenuAperto(false);
        pulsanteMenu.current?.focus();
      }}>
        <div className="sidebar-top">
          <NavLink className="brand" to="/" end onClick={naviga}>
            <span className="brand-mark" aria-hidden>S</span>
            <span className="brand-name">SuitePMI</span>
          </NavLink>
          <button ref={pulsanteMenu} className="menu-toggle" type="button"
            aria-expanded={menuAperto} aria-controls="menu-principale" onClick={() => setMenuAperto((aperto) => !aperto)}>
            <span className="menu-glyph" aria-hidden />
            {menuAperto ? 'Chiudi menu' : 'Menu'}
          </button>
        </div>
        <div id="menu-principale" className="sidebar-menu" data-aperto={menuAperto}>
          <div className="workspace">
            <span className="workspace-iniziale" aria-hidden>{azienda.slice(0, 1).toLocaleUpperCase('it')}</span>
            <span className="workspace-nome">{azienda}</span>
          </div>
          <nav aria-label="Navigazione principale">
            {sezioni.map(({ titolo, voci }) => (
              <div className="nav-group" key={titolo}>
                <div className="nav-caption">{titolo}</div>
                {voci.map(({ to, nome, end }) => (
                  <NavLink key={to} to={to} end={end} onClick={naviga}>{nome}</NavLink>
                ))}
              </div>
            ))}
            <div className="nav-group nav-group-impostazioni">
              <NavLink to="/impostazioni" onClick={naviga}>Impostazioni</NavLink>
            </div>
          </nav>
          <div className="sidebar-foot">
            <div className="sidebar-utente">
              <strong>{sessione?.utente.nome}</strong>
              <span>{sessione?.utente.email}</span>
            </div>
            <Button variant="ghost" onClick={esci}>Esci</Button>
          </div>
        </div>
      </aside>
      <main ref={contenuto} id="contenuto" className="content" tabIndex={-1}>
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
        <Route path="personale" element={<Personale />} />
        <Route path="personale/assenze" element={<Assenze />} />
        <Route path="commesse" element={<Commesse />} />
        <Route path="commesse/:id" element={<CommessaDettaglio />} />
        <Route path="fatture" element={<Fatture />} />
        <Route path="cassa" element={<Cassa />} />
        <Route path="clienti" element={<Clienti />} />
        <Route path="solleciti" element={<Solleciti />} />
        <Route path="solleciti/nuovo" element={<NuovoSollecito />} />
        <Route path="solleciti/:id" element={<SollecitoDettaglio />} />
        <Route path="impostazioni" element={<Impostazioni />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
