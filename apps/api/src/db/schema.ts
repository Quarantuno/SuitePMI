import { relations, sql } from 'drizzle-orm';
import {
  bigint,
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
  partitaIva: text('partita_iva').notNull().unique(),
  // Dati usati nelle lettere e nei solleciti
  indirizzo: text('indirizzo'),
  email: text('email'),
  pec: text('pec'),
  iban: text('iban'),
  // Saldo di cassa/banca dichiarato dall'utente, base della previsione di cassa
  saldoCassaCents: cents('saldo_cassa_cents'),
  saldoCassaAl: date('saldo_cassa_al', { mode: 'string' }),
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
    telefono: text('telefono'),
    indirizzo: text('indirizzo'),
    note: text('note'),
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

export const fatture = pgTable(
  'fatture',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aziendaId: aziendaId(),
    controparteId: uuid('controparte_id')
      .notNull()
      .references(() => controparti.id, { onDelete: 'restrict' }),
    direzione: text('direzione', { enum: ['attiva', 'passiva'] }).notNull(),
    numero: text('numero').notNull(),
    dataEmissione: date('data_emissione', { mode: 'string' }).notNull(),
    totaleCents: cents('totale_cents').notNull(),
    origine: text('origine', { enum: ['manuale', 'xml'] }).notNull().default('manuale'),
    xmlOriginale: text('xml_originale'),
    createdAt: createdAt(),
  },
  (t) => [
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
    createdAt: createdAt(),
  },
  (t) => [index('pagamenti_scadenza_idx').on(t.scadenzaId)],
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
    stato: text('stato', { enum: ['bozza', 'inviato'] }).notNull().default('bozza'),
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
  scadenze: many(scadenze),
}));

export const scadenzeRelations = relations(scadenze, ({ one, many }) => ({
  fattura: one(fatture, { fields: [scadenze.fatturaId], references: [fatture.id] }),
  pagamenti: many(pagamenti),
}));

export const pagamentiRelations = relations(pagamenti, ({ one }) => ({
  scadenza: one(scadenze, { fields: [pagamenti.scadenzaId], references: [scadenze.id] }),
}));
