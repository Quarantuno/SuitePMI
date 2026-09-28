# Suite PMI

Piattaforma all-in-one per le PMI italiane. Questa prima versione contiene il **nucleo**
(account, aziende, isolamento dei dati, anagrafiche) e il **modulo Incassi**:
import delle fatture elettroniche FatturaPA, scadenze, incassi e calcolo degli
interessi di mora secondo il d.lgs. 231/2002.

## Stack

| Parte | Tecnologia |
| --- | --- |
| Monorepo | pnpm workspaces |
| API | NestJS 11 (monolite modulare), Drizzle ORM, PostgreSQL 16 |
| Web | React 19, Vite 7, TanStack Query, React Router |
| Condiviso | `@suite/shared`: schemi Zod, tipi delle API, calcolo interessi |
| Test | Vitest (unitari + end-to-end su Postgres reale) |

## Avvio in locale

Prerequisiti: **Node 22+**, **Docker Desktop** e **pnpm** (`corepack enable` lo attiva).

```bash
pnpm install
cp .env.example .env
pnpm db:up          # avvia Postgres in Docker (porta 5432)
pnpm db:migrate     # crea tabelle e policy di sicurezza
pnpm dev            # API su :3000, web su http://localhost:5173
```

Apri http://localhost:5173, registra la tua azienda e importa un XML da **Fatture**.
Un file di prova e in `apps/api/test/fixtures/fattura-attiva.xml`: funziona se ti
registri con la partita IVA `12345678903`.

Test (richiedono Postgres avviato; usano un database separato `suite_test`):

```bash
pnpm test
```

## Struttura

```
apps/
  api/                 NestJS
    drizzle/           migrazioni SQL (0001_rls.sql = policy di isolamento)
    src/
      db/              schema Drizzle, connessione, withTenant()
      common/          guard JWT, validazione Zod, errori Postgres
      auth/            registrazione, login, /me
      controparti/     clienti e fornitori
      fatture/         fatture, rate, pagamenti, parser FatturaPA
      incassi/         crediti scaduti con interessi e indennizzi
    test/              test end-to-end + fattura XML di esempio
  web/                 React
    src/pages/         Crediti, Fatture, Clienti, Accesso
packages/
  shared/              logica e tipi condivisi (usati da API e web)
```

## Scelte architetturali

**Multi-tenant con Row-Level Security.** Ogni tabella di business ha `azienda_id`.
L'API si collega a Postgres con il ruolo `suite_app`, che non possiede le tabelle:
per questo le policy RLS valgono sempre. Ogni richiesta gira dentro
`DbService.withTenant(aziendaId, tx => ...)`, che imposta `app.azienda_id` per la
transazione. Anche un bug nel codice (una `where` dimenticata) non espone i dati
di un'altra azienda: il test e2e lo verifica.

Le migrazioni girano invece con l'utente `postgres` (`DATABASE_ADMIN_URL`).

**Monolite modulare.** Un modulo = una cartella in `apps/api/src` con controller,
service e le sue tabelle. I moduli dipendono dal nucleo (`db`, `common`, `auth`)
e da `@suite/shared`, non tra loro (eccezione: `fatture` usa `controparti`).

**Importi in centesimi interi** (`bigint` in Postgres, `number` in TypeScript).
Mai float per i soldi.

**Validazione condivisa.** Gli schemi Zod in `packages/shared/src/schemas.ts` validano
le richieste nell'API e descrivono i form nel frontend.

## Interessi di mora

Il calcolo e in `packages/shared/src/interessi-mora.ts`, coperto da test:

- decorrono dal giorno dopo la scadenza, senza messa in mora;
- tasso = riferimento BCE del semestre + 8 punti, applicato giorno per giorno;
- un pagamento parziale riduce la base dal giorno successivo;
- valgono anche sulle fatture **pagate in ritardo**;
- 40 euro di indennizzo forfettario per fattura;
- non si applicano alle controparti senza partita IVA (consumatori).

**Da fare ogni semestre**: aggiungere il nuovo tasso BCE in
`packages/shared/src/tassi-mora.ts` (il MEF lo pubblica a gennaio e luglio).
Se manca, l'API risponde con un errore esplicito invece di calcolare male.

## API

Tutte sotto `/api`, con `Authorization: Bearer <token>` tranne registrazione e login.

| Metodo | Percorso | Cosa fa |
| --- | --- | --- |
| POST | `/auth/register` | Crea utente + azienda, restituisce il token |
| POST | `/auth/login` | Login |
| GET | `/auth/me` | Utente e azienda correnti |
| GET/POST | `/controparti` | Elenco (`?q=`, `?tipo=`) e creazione |
| GET/PATCH/DELETE | `/controparti/:id` | Dettaglio, modifica, eliminazione |
| GET/POST | `/fatture` | Elenco (`?direzione=attiva\|passiva`) e fattura manuale |
| POST | `/fatture/import-xml` | Import FatturaPA (`{ "xml": "..." }`) |
| GET/DELETE | `/fatture/:id` | Dettaglio ed eliminazione |
| POST | `/scadenze/:id/pagamenti` | Registra un incasso o pagamento |
| GET | `/incassi/crediti-scaduti?alla=AAAA-MM-GG` | Crediti, interessi, indennizzi |

## Prossimi passi tecnici

- Solleciti: modelli email/PEC progressivi e generazione della diffida in PDF.
- Collegamento a un intermediario SdI (A-Cube o Openapi) per ricevere le fatture in automatico.
- Token in cookie httpOnly con refresh, inviti di altri utenti, piu aziende per utente.
- Note di credito (TD04) e fatture in lotto.
- Blocco riga (`SELECT ... FOR UPDATE`) sui pagamenti concorrenti.
