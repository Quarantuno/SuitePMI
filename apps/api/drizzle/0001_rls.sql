-- Isolamento dei dati tra aziende con Row-Level Security.
--
-- L'API si collega con il ruolo "suite_app", che non e' superuser e non possiede
-- le tabelle: quindi Postgres applica sempre queste policy alle sue query.
-- Ogni richiesta autenticata apre una transazione e imposta
--   set_config('app.azienda_id', '<uuid>', true)
-- Se la variabile non e' impostata, le tabelle del tenant risultano vuote.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'suite_app') THEN
    CREATE ROLE suite_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO suite_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO suite_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO suite_app;
--> statement-breakpoint
ALTER TABLE controparti ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON controparti
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE fatture ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON fatture
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE scadenze ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON scadenze
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE pagamenti ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pagamenti
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
