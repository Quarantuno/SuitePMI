import { useMutation } from '@tanstack/react-query';
import type { AuthResponse } from '@suite/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button, ErrorBox, Field, fieldError } from '../ui';

export function Accesso({ modo }: { modo: 'login' | 'registrazione' }) {
  const { entra } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', nome: '', ragioneSociale: '', partitaIva: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () =>
      modo === 'login'
        ? api<AuthResponse>('/auth/login', { body: { email: form.email, password: form.password } })
        : api<AuthResponse>('/auth/register', { body: form }),
    onSuccess: (r) => {
      entra(r);
      navigate('/', { replace: true });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };
  const err = mutation.error;

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            S
          </span>
          <div className="brand-name">Suite PMI</div>
        </div>
        <h1>{modo === 'login' ? 'Accedi' : 'Crea il tuo account'}</h1>
        <p className="muted">
          {modo === 'login'
            ? 'Incassi, fatture e clienti della tua azienda in un unico posto.'
            : 'Registra la tua azienda: in pochi minuti vedi quanto ti devono i clienti.'}
        </p>

        {modo === 'registrazione' && (
          <>
            <Field label="Il tuo nome" value={form.nome} onChange={set('nome')} required autoComplete="name" error={fieldError(err, 'nome')} />
            <Field
              label="Ragione sociale"
              value={form.ragioneSociale}
              onChange={set('ragioneSociale')}
              required
              autoComplete="organization"
              error={fieldError(err, 'ragioneSociale')}
            />
            <Field
              label="Partita IVA"
              value={form.partitaIva}
              onChange={set('partitaIva')}
              required
              inputMode="numeric"
              hint="Serve a riconoscere le tue fatture elettroniche"
              error={fieldError(err, 'partitaIva')}
            />
          </>
        )}
        <Field label="Email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" error={fieldError(err, 'email')} />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          required
          autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
          hint={modo === 'registrazione' ? 'Almeno 10 caratteri' : undefined}
          error={fieldError(err, 'password')}
        />

        {err && !(err as { errori?: unknown[] }).errori?.length && <ErrorBox error={err} />}

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Attendi…' : modo === 'login' ? 'Accedi' : 'Crea account'}
        </Button>
        <p className="muted small center">
          {modo === 'login' ? (
            <>
              Non hai un account? <Link to="/registrati">Registrati</Link>
            </>
          ) : (
            <>
              Hai già un account? <Link to="/accedi">Accedi</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
