-- Ruolo usato dall'applicazione a runtime.
-- NON e' superuser e NON possiede le tabelle: per questo le policy di
-- Row-Level Security si applicano sempre alle sue query.
-- Le migrazioni girano invece con l'utente "postgres" (proprietario).
CREATE ROLE suite_app LOGIN PASSWORD 'suite_app_dev';
