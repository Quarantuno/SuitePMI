import { formatEuro } from '@suite/shared';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ApiError } from './api';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input {...props} aria-invalid={!!error} />
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select {...props}>{children}</select>
    </label>
  );
}

export function Money({ cents, strong }: { cents: number; strong?: boolean }) {
  const text = formatEuro(cents);
  return <span className={`num ${strong ? 'strong' : ''}`}>{text}</span>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Errore imprevisto';
  const dettagli = error instanceof ApiError ? error.errori : [];
  return (
    <div className="alert alert-error" role="alert">
      <strong>{message}</strong>
      {dettagli.length > 0 && (
        <ul>
          {dettagli.map((e) => (
            <li key={e.campo + e.messaggio}>
              {e.campo}: {e.messaggio}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Messaggio di errore di un campo, dagli errori di validazione dell'API. */
export function fieldError(error: unknown, campo: string): string | undefined {
  return error instanceof ApiError ? error.errori.find((e) => e.campo === campo)?.messaggio : undefined;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
