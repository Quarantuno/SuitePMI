-- Stesso isolamento per azienda delle altre tabelle (vedi 0001_rls.sql).
-- I permessi a suite_app arrivano dagli ALTER DEFAULT PRIVILEGES di 0001; li
-- ripetiamo per sicurezza nel caso la tabella sia stata creata da un altro utente.
GRANT SELECT, INSERT, UPDATE, DELETE ON solleciti TO suite_app;
--> statement-breakpoint
ALTER TABLE solleciti ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON solleciti
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
