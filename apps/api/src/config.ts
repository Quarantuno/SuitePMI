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
};
