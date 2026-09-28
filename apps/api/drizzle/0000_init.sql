CREATE TABLE "aziende" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ragione_sociale" text NOT NULL,
	"partita_iva" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aziende_partita_iva_unique" UNIQUE("partita_iva")
);
--> statement-breakpoint
CREATE TABLE "controparti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"tipo" text DEFAULT 'cliente' NOT NULL,
	"denominazione" text NOT NULL,
	"partita_iva" text,
	"codice_fiscale" text,
	"email" text,
	"pec" text,
	"telefono" text,
	"indirizzo" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fatture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"controparte_id" uuid NOT NULL,
	"direzione" text NOT NULL,
	"numero" text NOT NULL,
	"data_emissione" date NOT NULL,
	"totale_cents" bigint NOT NULL,
	"origine" text DEFAULT 'manuale' NOT NULL,
	"xml_originale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membri" (
	"azienda_id" uuid NOT NULL,
	"utente_id" uuid NOT NULL,
	"ruolo" text DEFAULT 'membro' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membri_azienda_id_utente_id_pk" PRIMARY KEY("azienda_id","utente_id")
);
--> statement-breakpoint
CREATE TABLE "pagamenti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"scadenza_id" uuid NOT NULL,
	"data" date NOT NULL,
	"importo_cents" bigint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scadenze" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"fattura_id" uuid NOT NULL,
	"data_scadenza" date NOT NULL,
	"importo_cents" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utenti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"nome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utenti_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "controparti" ADD CONSTRAINT "controparti_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_controparte_id_controparti_id_fk" FOREIGN KEY ("controparte_id") REFERENCES "public"."controparti"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membri" ADD CONSTRAINT "membri_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membri" ADD CONSTRAINT "membri_utente_id_utenti_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."utenti"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamenti" ADD CONSTRAINT "pagamenti_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamenti" ADD CONSTRAINT "pagamenti_scadenza_id_scadenze_id_fk" FOREIGN KEY ("scadenza_id") REFERENCES "public"."scadenze"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scadenze" ADD CONSTRAINT "scadenze_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scadenze" ADD CONSTRAINT "scadenze_fattura_id_fatture_id_fk" FOREIGN KEY ("fattura_id") REFERENCES "public"."fatture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "controparti_azienda_idx" ON "controparti" USING btree ("azienda_id");--> statement-breakpoint
CREATE UNIQUE INDEX "controparti_piva_uq" ON "controparti" USING btree ("azienda_id","partita_iva") WHERE "controparti"."partita_iva" is not null;--> statement-breakpoint
CREATE INDEX "fatture_azienda_idx" ON "fatture" USING btree ("azienda_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fatture_numero_uq" ON "fatture" USING btree ("azienda_id","direzione","controparte_id","numero","data_emissione");--> statement-breakpoint
CREATE INDEX "pagamenti_scadenza_idx" ON "pagamenti" USING btree ("scadenza_id");--> statement-breakpoint
CREATE INDEX "scadenze_fattura_idx" ON "scadenze" USING btree ("fattura_id");--> statement-breakpoint
CREATE INDEX "scadenze_data_idx" ON "scadenze" USING btree ("azienda_id","data_scadenza");