# SuitePMI

**Il gestionale per PMI italiane che collega fatture, incassi, cassa e commesse.**

Importa le fatture elettroniche, segui i crediti dei clienti e controlla
budget, ore e spese per ogni commessa.

[Avvio rapido](#avvio-rapido) · [Guida ai moduli](#guida-ai-moduli) · [Sviluppo](#sviluppo) · [API](#api) · [Sito di documentazione (sorgenti)](docs/)

## Cosa puoi fare

| Modulo | Funzioni |
| --- | --- |
| **Fatture e incassi** | Import FatturaPA in XML, P7M e ZIP, scadenze, rate, incassi e note di credito. |
| **Solleciti** | Promemoria, solleciti e diffide con PDF, storico e invio via email o PEC. |
| **Cassa** | Previsione settimanale da 4 a 26 settimane e scadenzario di incassi e pagamenti. |
| **Preventivi** | Bozze, voci e IVA, esportazione PDF e conversione in commessa. |
| **Commesse** | Budget, fatture collegate, rendiconto ore e spese, margine e bozze di contratto. |
| **Personale** | Anagrafica, ingressi e uscite, ferie e permessi, registro presenze, preparazione paghe. |

## Avvio rapido

**Prerequisiti** — Node.js 22+, pnpm 10.28.0 e Docker con Compose.

```bash
pnpm install
cp .env.example .env
pnpm db:up          # avvia Postgres (porta 5432) e Mailpit (http://localhost:8025) in Docker
pnpm db:migrate     # crea tabelle e policy di sicurezza
pnpm dev            # API su :3000, web su http://localhost:5173
```

Apri [SuitePMI in locale](http://localhost:5173), registra la tua azienda e vai
su **Fatture → Importa fatture elettroniche**. Per provare con dati di esempio,
registrati con la partita IVA `12345678903` e importa la
[fattura XML di prova](apps/api/test/fixtures/fattura-attiva.xml).

| Servizio | Indirizzo locale |
| --- | --- |
| Applicazione web | [localhost:5173](http://localhost:5173) |
| API, endpoint di verifica | [localhost:3000/api/health](http://localhost:3000/api/health) |
| Mailpit, posta di prova | [localhost:8025](http://localhost:8025) |

## Guida ai moduli

### Fatture e incassi

Puoi importare file XML, file firmati `.p7m` (DER, BER o base64) o archivi
`.zip` come quelli scaricati dal cassetto fiscale. L’import ignora i file di
metadati `_MT_`.

L’import gestisce questi tipi di documento.

- **fatture in lotto**: un file può contenere fino a 100 documenti.
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

### Interessi di mora

I test coprono il [calcolo degli interessi](packages/shared/src/interessi-mora.ts).

- decorrono dal giorno dopo la scadenza, senza messa in mora;
- tasso = riferimento BCE del semestre + 8 punti, applicato giorno per giorno;
- un pagamento parziale riduce la base dal giorno successivo;
- valgono anche sulle fatture **pagate in ritardo**;
- 40 euro di indennizzo forfettario per fattura;
- non si applicano alle controparti senza partita IVA (consumatori).

**Da fare ogni semestre**: aggiungere il nuovo tasso BCE in
`packages/shared/src/tassi-mora.ts` (il MEF lo pubblica a gennaio e luglio).
Se manca, l'API risponde con un errore esplicito invece di calcolare male.

### Solleciti

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

#### Solleciti automatici

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

La pagina **Solleciti** mostra il piano di oggi cliente per cliente. SuitePMI
riserva la bozza prima di contattare il gestore. Se il gestore risponde con un
errore o l’API si interrompe, verifica l’esito prima di procedere. Puoi
confermare l’invio dal dettaglio dopo averlo riscontrato presso il gestore.
Se il tentativo si è concluso con un errore, puoi riaprire la bozza dopo aver
verificato la mancata consegna.

**Email e PEC in locale** usano il Mailpit senza credenziali su loopback,
consultabile su [localhost:8025](http://localhost:8025). Fuori da questo
ambiente gli invii dal server sono abilitati solo per l’azienda il cui UUID
corrisponde a `MAIL_TENANT_ID`. Configura `SMTP_*` e `PEC_SMTP_*` con caselle
che appartengono a quell’azienda. Le altre aziende possono scaricare il PDF e
registrare un invio effettuato dalla propria casella.

Il recapito PEC dell’anagrafica va inserito o confermato dalla pagina **Clienti**.
Dopo la migrazione, usa **Inserisci PEC** accanto alla controparte per confermare nuovamente i recapiti prima di usarli
per gli invii. L’import delle fatture lascia invariata l’anagrafica PEC.

### Cassa

La pagina **Cassa** parte dal saldo di cassa e banca che inserisci tu (con la data)
e lo proietta settimana per settimana usando le rate aperte di fatture emesse
(entrate) e ricevute (uscite). Logica in `packages/shared/src/cassa.ts`:

- settimane da lunedì a domenica, la prima parte da oggi; orizzonte 4–26 settimane;
- i **debiti già scaduti** entrano subito nella prima settimana (vanno pagati);
- i **crediti già scaduti** per prudenza non sono contati, salvo l'opzione
  "Conta i crediti già scaduti come incassati subito";
- evidenzia il saldo minimo previsto e la prima settimana in cui si va sotto zero.

### Preventivi

Crea una bozza per un cliente esistente, aggiungi le voci con quantità, prezzo
unitario e aliquota IVA e scarica il PDF. Dopo averlo inviato al cliente,
registralo come inviato. Quando il cliente accetta, **Accetta e crea commessa**
apre una commessa per lo stesso cliente, con il totale lordo come budget.

### Commesse

Dalla voce **Commesse**, crea una commessa scegliendo un cliente esistente e
inserendo il budget lordo in euro. Nel dettaglio puoi collegare o scollegare le
fatture attive di quel cliente. Ogni fattura può appartenere a una sola commessa.

Puoi impostare una scadenza facoltativa e aggiornare lo stato da **Da avviare**
a **In corso** o **Completata**. L’elenco filtra le commesse per stato e segnala
quelle ancora aperte oltre la scadenza.

Il riepilogo mostra budget, totale lordo delle fatture collegate, incassi
registrati e residuo delle rate. Gli storni applicati tramite note di credito
riducono il residuo e sono indicati separatamente dagli incassi.

Nel dettaglio della commessa, **Ore e spese** registra data, descrizione e
costo totale della voce. Per il lavoro si inserisce anche la durata in minuti.
Indica il costo totale della voce oppure il costo orario per ottenere il costo
in base ai minuti registrati. Il CSV esporta il periodo selezionato.

Il margine sui costi registrati è il ricavo previsto al netto IVA meno lavoro
e spese registrate. I totali del margine si riferiscono a tutta la commessa.
Per le commesse nate da un preventivo, il ricavo iniziale è l’imponibile
dell’offerta. Per le altre, inseriscilo in **Modifica commessa**.

Da **Contratti** nel dettaglio della commessa puoi salvare e modificare più
bozze con il tuo testo. Il PDF riporta azienda, cliente, commessa e la dicitura
**Bozza di contratto**.

### Personale

Titolari e amministratori possono creare e aggiornare le schede dalla pagina
**Personale**. Usa la ricerca per nome, mansione o email di lavoro e filtra
l’elenco per stato. Lo stato deriva dalle date di ingresso e uscita. La persona
risulta attiva fino all’ultimo giorno di lavoro compreso.

Da **Personale → Ferie e permessi** puoi registrare assenze a giornata intera e
consultarle per mese. Le date sono inclusive. L’app impedisce sovrapposizioni
per la stessa persona e controlla che l’assenza rientri nel periodo di lavoro.

Da **Personale → Registro presenze** puoi registrare ore ordinarie e
straordinarie per persona e giorno, correggere le registrazioni e consultare
i totali mensili. Il registro rifiuta le giornate già coperte da ferie o
permessi a giornata intera. Le ore di commessa restano nel rendiconto progetti.

Da **Personale → Preparazione paghe**, un titolare o un amministratore può
registrare un prospetto mensile per persona, scaricare il PDF interno ed esportare il mese in CSV.
I totali del registro presenze appaiono a video e nel CSV dei prospetti.
Il **Riepilogo mensile** è consultabile ed esportabile anche senza prospetti.
Include tutte le persone in organico almeno un giorno del mese, le ore
ordinarie e straordinarie registrate e i giorni di calendario di ferie e
permesso compresi nel periodo. Nel CSV le celle delle ore sono vuote per
chi è senza registrazioni di presenza.
Il saldo somma lordo e altre competenze e sottrae contributi, ritenute e
trattenute già quantificati e inseriti a mano. Il prospetto è per uso interno.
Il calcolo contributivo e fiscale e la produzione dei cedolini ufficiali
richiedono un motore paghe o un’integrazione dedicata.

## Sviluppo

`main` è il branch stabile. Gli aggiornamenti in lavorazione arrivano su
[`dev-unstable`](https://github.com/Quarantuno/SuitePMI/tree/dev-unstable).

### Build e test

```bash
pnpm build
pnpm typecheck
pnpm test
```

I test end-to-end richiedono PostgreSQL avviato con `pnpm db:up` e usano
il database separato `suite_test`. La build genera i tipi condivisi usati
dall’API e dal frontend.

### Stack

| Parte | Tecnologia |
| --- | --- |
| Monorepo | pnpm workspaces |
| API | NestJS 11 (monolite modulare), Drizzle ORM, PostgreSQL 16 |
| Web | React 19, Vite 7, TanStack Query, React Router |
| Condiviso | `@suite/shared`: schemi Zod, tipi delle API, calcolo interessi |
| Test | Vitest (unitari + end-to-end su Postgres reale) |

### Struttura

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
      commesse/        commesse, fatture collegate, ore e spese
    test/              test end-to-end + fattura XML di esempio
  web/                 React
    src/pages/         Crediti, Solleciti, Cassa, Fatture, Clienti, Impostazioni, Accesso
    src/GraficoCassa.tsx  grafico SVG fatto a mano (entrate, uscite, saldo)
packages/
  shared/              logica e tipi condivisi (usati da API e web)
```

### Architettura

**Multi-tenant con Row-Level Security.** Ogni tabella di business ha `azienda_id`.
L'API si collega a Postgres con il ruolo `suite_app`, che non possiede le tabelle:
per questo le policy RLS valgono sempre. Ogni richiesta gira dentro
`DbService.withTenant(aziendaId, tx => ...)`, che imposta `app.azienda_id` per la
transazione. Anche un bug nel codice (una `where` dimenticata) non espone i dati
di un'altra azienda: il test e2e lo verifica.

Le migrazioni girano invece con l'utente `postgres` (`DATABASE_ADMIN_URL`).

**Monolite modulare.** Ogni modulo vive in una cartella di `apps/api/src`, con controller e service.
I moduli condividono il nucleo (`db`, `common`, `auth`) e `@suite/shared`.

**Importi in centesimi interi** (`bigint` in Postgres, `number` in TypeScript).
Mai float per i soldi.

**Validazione condivisa.** Gli schemi Zod in `packages/shared/src/schemas.ts` validano
le richieste nell'API e descrivono i form nel frontend.

### Sicurezza

- Isolamento dei dati tra aziende con Row-Level Security (vedi sopra).
- Password con Argon2. In produzione imposta `JWT_SECRET` con una chiave casuale di almeno 32 caratteri.
- PostgreSQL e Mailpit del Compose di sviluppo sono accessibili da loopback.
- L’identificativo dell’azienda è interno. La partita IVA dichiarata serve ai documenti e non riserva un’azienda sulla piattaforma.
- Limite di **10 tentativi al minuto per IP** su login e registrazione (`AUTH_RATE_LIMIT`).
  In produzione dietro un proxy imposta `TRUST_PROXY=true`, altrimenti tutti gli utenti
  sembrano lo stesso IP.
- Header di sicurezza HTTP con `helmet`.
- Pagamenti e note di credito bloccano le rate (`SELECT … FOR UPDATE`): due incassi
  registrati nello stesso istante non possono superare l'importo della rata.
- Gli export CSV neutralizzano le formule (CSV injection) e sono pensati per Excel in
  italiano (separatore `;`, virgola decimale, UTF-8 con BOM).

## API

Gli endpoint hanno prefisso `/api`. Per quelli protetti, invia l’header `Authorization: Bearer <token>`.

| Metodo | Percorso | Cosa fa |
| --- | --- | --- |
| GET | `/health` | Verifica che l’API risponda. Endpoint pubblico. |
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
| GET/POST | `/preventivi` | Elenco e creazione dei preventivi |
| GET/PUT | `/preventivi/:id` | Dettaglio e modifica della bozza |
| GET | `/preventivi/:id/pdf` | Scarica il preventivo in PDF |
| PATCH | `/preventivi/:id/stato` | Registra lo stato e crea la commessa all’accettazione |
| GET/POST | `/commesse` | Elenco e creazione delle commesse |
| PATCH | `/commesse/:id` | Modifica nome, budget, stato e scadenza |
| GET | `/commesse/:id/fatture` | Fatture collegate e disponibili |
| PATCH | `/commesse/:id/fatture/:fatturaId` | Collega o scollega la fattura |
| GET/POST | `/commesse/:id/costi` | Elenco e registrazione di ore e spese |
| DELETE | `/commesse/:id/costi/:costoId` | Elimina una voce di costo |
| GET/POST | `/personale` | Elenco e creazione delle schede del personale |
| PUT | `/personale/:id` | Aggiorna una scheda del personale |
| GET/POST | `/personale/assenze` | Calendario per mese (`?mese=AAAA-MM`) e registrazione delle assenze |
| DELETE | `/personale/assenze/:id` | Rimuove un’assenza |

## Prossimi passi tecnici

- Caselle PEC e SMTP configurabili per più aziende, con ricevute di accettazione e consegna.
- Pratica per il decreto ingiuntivo da passare all'avvocato (fatture, solleciti, ricevute PEC).
- Collegamento a un intermediario SdI (A-Cube o Openapi) per ricevere le fatture in automatico.
- Token in cookie httpOnly con refresh, inviti di altri utenti, più aziende per utente.
