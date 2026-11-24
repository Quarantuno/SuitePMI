import { statiCommessa, statiPreventivo, tipiAssenza, type VocePreventivo } from '@suite/shared';
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  type AnyPgColumn,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * Tabelle "globali" (senza Row-Level Security): aziende, utenti, membri.
 * Tabelle "del tenant" (con RLS su azienda_id): tutte le altre.
 * Le policy RLS sono nella migrazione custom `drizzle/0001_rls.sql`.
 */

const cents = (name: string) => bigint(name, { mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const aziende = pgTable('aziende', {
  id: uuid('id').primaryKey().defaultRandom(),
  ragioneSociale: text('ragione_sociale').notNull(),
  partitaIva: text('partita_iva').notNull(),
  // Dati usati nelle lettere e nei solleciti
  indirizzo: text('indirizzo'),
  email: text('email'),
  pec: text('pec'),
  iban: text('iban'),
  // Saldo di cassa/banca dichiarato dall'utente, base della previsione di cassa
  saldoCassaCents: cents('saldo_cassa_cents'),
  saldoCassaAl: date('saldo_cassa_al', { mode: 'string' }),
  // Solleciti automatici (giro giornaliero)
  sollecitiAutoAttivi: boolean('solleciti_auto_attivi').notNull().default(false),
  sollecitiAutoGiorni: integer('solleciti_auto_giorni').notNull().default(7),
  sollecitiAutoLivelloMax: text('solleciti_auto_livello_max', { enum: ['promemoria', 'sollecito', 'diffida'] })
    .notNull()
    .default('sollecito'),
  sollecitiAutoUltimaEsecuzione: date('solleciti_auto_ultima_esecuzione', { mode: 'string' }),
  createdAt: createdAt(),
});

export const utenti = pgTable('utenti', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nome: text('nome').notNull(),
  createdAt: createdAt(),
});

export const membri = pgTable(
  'membri',
  {
    aziendaId: uuid('azienda_id')
      .notNull()
      .references(() => aziende.id, { onDelete: 'cascade' }),
    utenteId: uuid('utente_id')
      .notNull()
      .references(() => utenti.id, { onDelete: 'cascade' }),
    ruolo: text('ruolo', { enum: ['titolare', 'admin', 'membro'] }).notNull().default('membro'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.aziendaId, t.utenteId] })],
);

// --- Tabelle del tenant --------------------------------------------------

const aziendaId = () =>
  uuid('azienda_id')
    .notNull()
    .references(() => aziende.id, { onDelete: 'cascade' });

export const personale = pgTable(
  'personale',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    nome: text('nome').notNull(),
    cognome: text('cognome').notNull(),
    emailLavoro: text('email_lavoro'),
    mansione: text('mansione').notNull(),
    dataIngresso: date('data_ingresso', { mode: 'string' }).notNull(),
    dataUscita: date('data_uscita', { mode: 'string' }),
  },
  (t) => [
    index('personale_azienda_idx').on(t.aziendaId),
    check('personale_date_coerenti', sql`${t.dataUscita} >= ${t.dataIngresso}`),
  ],
);

export const assenze = pgTable(
  'assenze',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    personaId: uuid('persona_id').notNull().references(() => personale.id, { onDelete: 'cascade' }),
    tipo: text('tipo', { enum: tipiAssenza }).notNull(),
    dal: date('dal', { mode: 'string' }).notNull(),
    al: date('al', { mode: 'string' }).notNull(),
    minuti: integer('minuti'),
  },
  (t) => [
    index('assenze_azienda_dal_idx').on(t.aziendaId, t.dal),
    index('assenze_persona_idx').on(t.personaId),
    check('assenze_date_coerenti', sql`${t.al} >= ${t.dal}`),
    check('assenze_permesso_orario_valido', sql`${t.minuti} IS NULL OR
      (${t.tipo} = 'permesso' AND ${t.al} = ${t.dal} AND ${t.minuti} BETWEEN 1 AND 1439)`),
  ],
);

export const presenze = pgTable(
  'presenze',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    personaId: uuid('persona_id').notNull().references(() => personale.id, { onDelete: 'cascade' }),
    giorno: date('giorno', { mode: 'string' }).notNull(),
    minutiOrdinari: integer('minuti_ordinari').notNull(),
    minutiStraordinari: integer('minuti_straordinari').notNull(),
  },
  (t) => [
    uniqueIndex('presenze_azienda_giorno_persona_idx').on(t.aziendaId, t.giorno, t.personaId),
    index('presenze_persona_idx').on(t.personaId),
    check('presenze_minuti_validi', sql`${t.minutiOrdinari} BETWEEN 0 AND 1440
      AND ${t.minutiStraordinari} BETWEEN 0 AND 1440
      AND ${t.minutiOrdinari} + ${t.minutiStraordinari} BETWEEN 1 AND 1440`),
  ],
);

export const contrattiLavoro = pgTable(
  'contratti_lavoro',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    personaId: uuid('persona_id').notNull().references(() => personale.id, { onDelete: 'restrict' }),
    titolo: text('titolo').notNull(),
    decorrenza: date('decorrenza', { mode: 'string' }).notNull(),
    testo: text('testo').notNull(),
  },
  (t) => [index('contratti_lavoro_persona_decorrenza_idx').on(t.personaId, t.decorrenza)],
);

export const prospettiPaghe = pgTable(
  'prospetti_paghe',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    personaId: uuid('persona_id').notNull().references(() => personale.id, { onDelete: 'restrict' }),
    mese: text('mese').notNull(),
    lordoCents: cents('lordo_cents').notNull(),
    competenzeCents: cents('competenze_cents').notNull(),
    contributiCents: cents('contributi_cents').notNull(),
    ritenuteCents: cents('ritenute_cents').notNull(),
    trattenuteCents: cents('trattenute_cents').notNull(),
  },
  (t) => [uniqueIndex('prospetti_paghe_mese_persona_idx').on(t.aziendaId, t.mese, t.personaId)],
);

export const controparti = pgTable(
  'controparti',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    tipo: text('tipo', { enum: ['cliente', 'fornitore', 'entrambi'] }).notNull().default('cliente'),
    denominazione: text('denominazione').notNull(),
    partitaIva: text('partita_iva'),
    codiceFiscale: text('codice_fiscale'),
    email: text('email'),
    pec: text('pec'),
    pecConfermata: boolean('pec_confermata').notNull().default(false),
    telefono: text('telefono'),
    indirizzo: text('indirizzo'),
    note: text('note'),
    sollecitiAutomatici: boolean('solleciti_automatici').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('controparti_azienda_idx').on(t.aziendaId),
    uniqueIndex('controparti_piva_uq')
      .on(t.aziendaId, t.partitaIva)
      .where(sql`${t.partitaIva} is not null`),
  ],
);

export const commesse = pgTable(
  'commesse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    clienteId: uuid('cliente_id').notNull().references(() => controparti.id, { onDelete: 'restrict' }),
    nome: text('nome').notNull(),
    budgetCents: cents('budget_cents').notNull(),
    ricavoNettoCents: cents('ricavo_netto_cents'),
    stato: text('stato', { enum: statiCommessa }).notNull().default('da_avviare'),
    scadenza: date('scadenza', { mode: 'string' }),
  },
  (t) => [index('commesse_azienda_idx').on(t.aziendaId)],
);

export const contratti = pgTable(
  'contratti',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    commessaId: uuid('commessa_id').notNull().references(() => commesse.id, { onDelete: 'restrict' }),
    titolo: text('titolo').notNull(),
    data: date('data', { mode: 'string' }).notNull(),
    testo: text('testo').notNull(),
  },
  (t) => [index('contratti_azienda_commessa_idx').on(t.aziendaId, t.commessaId)],
);

export const preventivi = pgTable(
  'preventivi',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    clienteId: uuid('cliente_id').notNull().references(() => controparti.id, { onDelete: 'restrict' }),
    commessaId: uuid('commessa_id').references(() => commesse.id, { onDelete: 'restrict' }),
    titolo: text('titolo').notNull(),
    data: date('data', { mode: 'string' }).notNull(),
    validoFino: date('valido_fino', { mode: 'string' }),
    stato: text('stato', { enum: statiPreventivo }).notNull().default('bozza'),
    totaleCents: cents('totale_cents').notNull(),
    voci: jsonb('voci').$type<VocePreventivo[]>().notNull(),
    note: text('note'),
  },
  (t) => [
    index('preventivi_azienda_data_idx').on(t.aziendaId, t.data),
    uniqueIndex('preventivi_commessa_idx').on(t.commessaId),
    check('preventivi_validita_coerente', sql`${t.validoFino} >= ${t.data}`),
  ],
);

export const costiCommessa = pgTable(
  'costi_commessa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    commessaId: uuid('commessa_id').notNull().references(() => commesse.id, { onDelete: 'cascade' }),
    tipo: text('tipo', { enum: ['lavoro', 'spesa'] }).notNull(),
    data: date('data', { mode: 'string' }).notNull(),
    descrizione: text('descrizione').notNull(),
    minuti: integer('minuti').notNull().default(0),
    tariffaOrariaCents: cents('tariffa_oraria_cents'),
    operatore: text('operatore'),
    costoCents: cents('costo_cents').notNull(),
  },
  (t) => [index('costi_commessa_azienda_commessa_idx').on(t.aziendaId, t.commessaId)],
);

export const fatture = pgTable(
  'fatture',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    controparteId: uuid('controparte_id')
      .notNull()
      .references(() => controparti.id, { onDelete: 'restrict' }),
    commessaId: uuid('commessa_id').references(() => commesse.id, { onDelete: 'set null' }),
    direzione: text('direzione', { enum: ['attiva', 'passiva'] }).notNull(),
    numero: text('numero').notNull(),
    dataEmissione: date('data_emissione', { mode: 'string' }).notNull(),
    totaleCents: cents('totale_cents').notNull(),
    origine: text('origine', { enum: ['manuale', 'xml'] }).notNull().default('manuale'),
    /** TD01 fattura, TD04 nota di credito (codici FatturaPA). */
    tipoDocumento: text('tipo_documento').notNull().default('TD01'),
    /** Per le note di credito: la fattura che rettificano. */
    fatturaCollegataId: uuid('fattura_collegata_id').references((): AnyPgColumn => fatture.id, { onDelete: 'set null' }),
    xmlOriginale: text('xml_originale'),
    riferimentiNota: jsonb('riferimenti_nota').$type<{ numero: string; data: string | null }[]>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('fatture_commessa_idx').on(t.commessaId),
    index('fatture_azienda_idx').on(t.aziendaId),
    uniqueIndex('fatture_numero_uq').on(t.aziendaId, t.direzione, t.controparteId, t.numero, t.dataEmissione),
  ],
);

export const scadenze = pgTable(
  'scadenze',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    fatturaId: uuid('fattura_id')
      .notNull()
      .references(() => fatture.id, { onDelete: 'cascade' }),
    dataScadenza: date('data_scadenza', { mode: 'string' }).notNull(),
    importoCents: cents('importo_cents').notNull(),
  },
  (t) => [index('scadenze_fattura_idx').on(t.fatturaId), index('scadenze_data_idx').on(t.aziendaId, t.dataScadenza)],
);

export const pagamenti = pgTable(
  'pagamenti',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    scadenzaId: uuid('scadenza_id')
      .notNull()
      .references(() => scadenze.id, { onDelete: 'cascade' }),
    data: date('data', { mode: 'string' }).notNull(),
    importoCents: cents('importo_cents').notNull(),
    note: text('note'),
    /** "nota_credito": riduzione dovuta a una nota di credito, non un incasso di denaro. */
    tipo: text('tipo', { enum: ['incasso', 'nota_credito'] }).notNull().default('incasso'),
    notaCreditoId: uuid('nota_credito_id').references(() => fatture.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('pagamenti_scadenza_idx').on(t.scadenzaId), index('pagamenti_nota_idx').on(t.notaCreditoId)],
);

export const solleciti = pgTable(
  'solleciti',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    controparteId: uuid('controparte_id')
      .notNull()
      .references(() => controparti.id, { onDelete: 'restrict' }),
    livello: text('livello', { enum: ['promemoria', 'sollecito', 'diffida'] }).notNull(),
    stato: text('stato', { enum: ['bozza', 'in_invio', 'esito_incerto', 'inviato'] }).notNull().default('bozza'),
    /** Data a cui sono calcolati importi e interessi. */
    alla: date('alla', { mode: 'string' }).notNull(),
    oggetto: text('oggetto').notNull(),
    testo: text('testo').notNull(),
    // Fotografia degli importi al momento della lettera
    capitaleCents: cents('capitale_cents').notNull(),
    interessiCents: cents('interessi_cents').notNull(),
    indennizziCents: cents('indennizzi_cents').notNull(),
    totaleCents: cents('totale_cents').notNull(),
    scadenzeIds: uuid('scadenze_ids').array().notNull(),
    canale: text('canale', { enum: ['email', 'pec', 'manuale'] }),
    destinatario: text('destinatario'),
    inviatoIl: date('inviato_il', { mode: 'string' }),
    creatoDa: uuid('creato_da').references(() => utenti.id, { onDelete: 'set null' }),
    automatico: boolean('automatico').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('solleciti_controparte_idx').on(t.aziendaId, t.controparteId)],
);

// --- Relazioni (per le query relazionali di Drizzle) ------------------------

export const contropartiRelations = relations(controparti, ({ many }) => ({
  fatture: many(fatture),
  solleciti: many(solleciti),
}));

export const sollecitiRelations = relations(solleciti, ({ one }) => ({
  controparte: one(controparti, { fields: [solleciti.controparteId], references: [controparti.id] }),
}));

export const fattureRelations = relations(fatture, ({ one, many }) => ({
  controparte: one(controparti, { fields: [fatture.controparteId], references: [controparti.id] }),
  fatturaCollegata: one(fatture, { fields: [fatture.fatturaCollegataId], references: [fatture.id] }),
  scadenze: many(scadenze),
}));

export const scadenzeRelations = relations(scadenze, ({ one, many }) => ({
  fattura: one(fatture, { fields: [scadenze.fatturaId], references: [fatture.id] }),
  pagamenti: many(pagamenti),
}));

export const pagamentiRelations = relations(pagamenti, ({ one }) => ({
  scadenza: one(scadenze, { fields: [pagamenti.scadenzaId], references: [scadenze.id] }),
}));
