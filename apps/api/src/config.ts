import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Carica il file .env dalla radice del monorepo (se esiste). */
function loadRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      if (existsSync(candidate)) process.loadEnvFile(candidate);
      return;
    }
    dir = dirname(dir);
  }
}

loadRootEnv();

function required(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Variabile d'ambiente mancante: ${name}`);
  }
  return devDefault;
}

export const config = {
  databaseUrl: required('DATABASE_URL', 'postgres://suite_app:suite_app_dev@localhost:5432/suite'),
  databaseAdminUrl: required('DATABASE_ADMIN_URL', 'postgres://postgres:postgres@localhost:5432/suite'),
  jwtSecret: required('JWT_SECRET', 'solo-per-sviluppo-locale'),
  port: Number(process.env.API_PORT ?? 3000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  /** Email ordinarie. In locale: Mailpit (docker compose), interfaccia su http://localhost:8025 */
  smtp: smtpConfig('SMTP'),
  /** PEC: in produzione è l'SMTP del gestore PEC. Se non configurata, l'invio PEC è disattivato. */
  pec: process.env.PEC_SMTP_HOST ? smtpConfig('PEC_SMTP') : null,
};

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

function smtpConfig(prefix: string): SmtpConfig {
  return {
    host: process.env[`${prefix}_HOST`] ?? 'localhost',
    port: Number(process.env[`${prefix}_PORT`] ?? 1025),
    secure: process.env[`${prefix}_SECURE`] === 'true',
    user: process.env[`${prefix}_USER`] || undefined,
    pass: process.env[`${prefix}_PASS`] || undefined,
    from: process.env[`${prefix}_FROM`] ?? 'Suite PMI <noreply@suite.local>',
  };
}
