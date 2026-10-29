# Suite PMI

Piattaforma all-in-one per le PMI italiane. Contiene il **nucleo**
(account, aziende, isolamento dei dati, anagrafiche), il **modulo Incassi**
(import delle fatture elettroniche FatturaPA, scadenze, incassi e calcolo degli
interessi di mora secondo il d.lgs. 231/2002), il **modulo Solleciti**
(promemoria, sollecito formale e diffida, con PDF e invio via email o PEC) e la
**Cassa** (previsione settimanale e scadenzario di incassi e pagamenti).

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
pnpm db:up          # avvia Postgres (porta 5432) e Mailpit (http://localhost:8025) in Docker
pnpm db:migrate     # crea tabelle e policy di sicurezza
pnpm dev            # API su :3000, web su http://localhost:5173
```

Apri http://localhost:5173, registra la tua azienda e importa le fatture da **Fatture**:
file XML, firmati `.p7m` (DER, BER o base64) oppure interi archivi `.zip` come quelli
scaricati dal cassetto fiscale (i file di metadati `_MT_` vengono ignorati).

Sono supportati anche:

- **fatture in lotto**: un file con più `FatturaElettronicaBody` importa tutti i documenti;
  quelli già registrati vengono saltati (ed elencati) senza bloccare gli altri;
- **fatture semplificate** (tracciato FSM10, art. 21-bis d.P.R. 633/1972): la TD07 diventa
  una fattura con scadenza a 30 giorni, la TD08 una nota di credito collegata tramite
  `DatiFatturaRettificata`. Il cliente privato viene creato con il codice fiscale;
- **note di debito** (TD05): hanno rate proprie come una fattura e restano collegate
  alla fattura che integrano; acconti, parcelle e fatture differite (TD02, TD03, TD06,
  TD24–TD26) si comportano come fatture;
- **integrazioni e autofatture** (TD16–TD23, TD27, TD28) vengono riconosciute e saltate:
  servono all'IVA ma non sono crediti o debiti verso la controparte.

Le **note di credito** (TD04) si importano come le fatture: se trovano la fattura
indicata in `DatiFattureCollegate` ne riducono le rate aperte partendo dall'ultima,
altrimenti restano "da abbinare": vengono collegate in automatico quando importi la
fattura indicata, oppure le colleghi a mano dalla lista. Sulla parte
stornata non si calcolano interessi di mora, e un'eventuale eccedenza viene segnalata.
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
      fatture/         fatture, rate, pagamenti, parser FatturaPA, estrazione .p7m
      incassi/         crediti scaduti con interessi e indennizzi
      azienda/         dati dell'azienda per le lettere (indirizzo, PEC, IBAN)
      solleciti/       bozze, PDF della lettera, invio email/PEC, storico
      cassa/           previsione di cassa a settimane e scadenzario
    test/              test end-to-end + fattura XML di esempio
  web/                 React
    src/pages/         Crediti, Solleciti, Cassa, Fatture, Clienti, Impostazioni, Accesso
    src/GraficoCassa.tsx  grafico SVG fatto a mano (entrate, uscite, saldo)
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

## Solleciti

Dalla pagina **Crediti scaduti** clicchi **Sollecita** accanto a un cliente:

1. L'app consiglia il livello in base allo storico: promemoria, poi sollecito formale
   (dopo almeno 7 giorni), poi diffida e messa in mora (dopo almeno 10). Con oltre
   60 giorni di ritardo e nessun contatto parte direttamente dal sollecito.
2. Il testo è generato da `packages/shared/src/solleciti.ts` ed è modificabile.
   La diffida chiede capitale, interessi di mora (anche su fatture pagate in ritardo)
   e 40 euro per fattura, vale come costituzione in mora (art. 1219 c.c.) e
   interrompe la prescrizione (art. 2943 c.c.). Verso i consumatori (controparti
   senza partita IVA) i riferimenti al d.lgs. 231/2002 vengono omessi.
3. Salvi la bozza, scarichi il PDF e la invii via **email** o **PEC** (con il PDF
   allegato), oppure la segni come inviata se l'hai spedita per raccomandata o dalla
   tua casella PEC. Gli importi vengono fotografati al momento della lettera.

Compila prima **Impostazioni** (indirizzo, email, PEC, IBAN): compaiono
nell'intestazione e nelle coordinate di pagamento.

### Solleciti automatici

Da **Impostazioni → Solleciti automatici** l'azienda li attiva (spenti di default) e sceglie
dopo quanti giorni di ritardo parte il primo contatto e fino a che livello può arrivare
l'app da sola (default: sollecito formale). Ogni mattina dalle 9 ora italiana
(`SOLLECITI_AUTO_ORA`) l'API fa il giro e, per ogni cliente in ritardo, invia il passo
successivo firmato dal titolare. Le regole sono in `decidiSollecitoAutomatico`
(`packages/shared/src/solleciti.ts`):

- rispetta le attese tra un livello e l'altro (7 giorni dopo il promemoria, 10 dopo il sollecito);
- non va oltre il livello massimo scelto; dopo una diffida si ferma (il passo dopo è l'avvocato);
- la diffida parte solo via PEC, gli altri livelli via email (o PEC se manca l'email);
- i clienti esclusi dalla pagina **Clienti** non ricevono nulla.

La pagina **Solleciti** mostra il piano di oggi cliente per cliente, con il motivo di ogni
invio o salto, e il pulsante **Invia ora**. Se un invio fallisce la bozza viene scartata e
il giro del giorno dopo riprova. Lo scheduler è dentro l'API: con più istanze lascialo
attivo su una sola (`SOLLECITI_AUTO_SCHEDULER=false` sulle altre).

**Email e PEC in locale** finiscono in Mailpit: apri http://localhost:8025 per
vederle. In produzione configura `SMTP_*` con il tuo provider e `PEC_SMTP_*` con
l'SMTP del gestore PEC (senza `PEC_SMTP_HOST` l'invio PEC è disattivato). Nota:
una PEC ha valore legale solo se parte da una casella PEC vera; per ora la
casella è unica per tutta l'installazione (vedi prossimi passi).

## Cassa

La pagina **Cassa** parte dal saldo di cassa e banca che inserisci tu (con la data)
e lo proietta settimana per settimana usando le rate aperte di fatture emesse
(entrate) e ricevute (uscite). Logica in `packages/shared/src/cassa.ts`:

- settimane da lunedì a domenica, la prima parte da oggi; orizzonte 4–26 settimane;
- i **debiti già scaduti** entrano subito nella prima settimana (vanno pagati);
- i **crediti già scaduti** per prudenza non sono contati, salvo l'opzione
  "Conta i crediti già scaduti come incassati subito";
- evidenzia il saldo minimo previsto e la prima settimana in cui si va sotto zero.

## Sicurezza

- Isolamento dei dati tra aziende con Row-Level Security (vedi sopra).
- Password con Argon2, tempi di risposta del login uniformi anche per email inesistenti.
- Limite di **10 tentativi al minuto per IP** su login e registrazione (`AUTH_RATE_LIMIT`).
  In produzione dietro un proxy imposta `TRUST_PROXY=true`, altrimenti tutti gli utenti
  sembrano lo stesso IP.
- Header di sicurezza HTTP con `helmet`.
- Pagamenti e note di credito bloccano le rate (`SELECT … FOR UPDATE`): due incassi
  registrati nello stesso istante non possono superare l'importo della rata.
- Gli export CSV neutralizzano le formule (CSV injection) e sono pensati per Excel in
  italiano (separatore `;`, virgola decimale, UTF-8 con BOM).

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
| POST | `/fatture/import-xml` | Import FatturaPA, anche in lotto o semplificata (`{ "xml": "..." }` oppure `{ "p7mBase64": "..." }`) |
| GET/DELETE | `/fatture/:id` | Dettaglio ed eliminazione |
| POST | `/fatture/:id/collega` | Abbina una nota di credito alla fattura (`{ "fatturaId": "..." }`) |
| POST | `/scadenze/:id/pagamenti` | Registra un incasso o pagamento |
| GET | `/incassi/crediti-scaduti?alla=AAAA-MM-GG` | Crediti, interessi, indennizzi, ultimo sollecito |
| GET/PATCH | `/azienda` | Dati dell'azienda (indirizzo, email, PEC, IBAN) |
| POST | `/solleciti/anteprima` | Testo proposto e livello consigliato per un cliente |
| GET/POST | `/solleciti` | Storico (`?controparteId=`) e salvataggio bozza |
| GET/DELETE | `/solleciti/:id` | Dettaglio ed eliminazione (solo bozze) |
| GET | `/solleciti/:id/pdf` | Lettera in PDF |
| POST | `/solleciti/:id/invia` | Invio email/PEC o registrazione di un invio manuale |
| GET | `/solleciti/automatici/piano` | Cosa partirebbe oggi con i solleciti automatici, e perché |
| POST | `/solleciti/automatici/esegui` | Esegue subito il giro di oggi |
| GET | `/cassa/previsione?settimane=13&includiCreditiScaduti=false` | Previsione di cassa e scadenzario |

## Prossimi passi tecnici

- Casella PEC e SMTP per singola azienda (oggi sono globali), con ricevute di accettazione e consegna.
- Pratica per il decreto ingiuntivo da passare all'avvocato (fatture, solleciti, ricevute PEC).
- Collegamento a un intermediario SdI (A-Cube o Openapi) per ricevere le fatture in automatico.
- Token in cookie httpOnly con refresh, inviti di altri utenti, più aziende per utente.
