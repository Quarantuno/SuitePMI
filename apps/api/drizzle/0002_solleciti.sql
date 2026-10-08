CREATE TABLE "solleciti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"controparte_id" uuid NOT NULL,
	"livello" text NOT NULL,
	"stato" text DEFAULT 'bozza' NOT NULL,
	"alla" date NOT NULL,
	"oggetto" text NOT NULL,
	"testo" text NOT NULL,
	"capitale_cents" bigint NOT NULL,
	"interessi_cents" bigint NOT NULL,
	"indennizzi_cents" bigint NOT NULL,
	"totale_cents" bigint NOT NULL,
	"scadenze_ids" uuid[] NOT NULL,
	"canale" text,
	"destinatario" text,
	"inviato_il" date,
	"creato_da" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aziende" ADD COLUMN "indirizzo" text;--> statement-breakpoint
ALTER TABLE "aziende" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "aziende" ADD COLUMN "pec" text;--> statement-breakpoint
ALTER TABLE "aziende" ADD COLUMN "iban" text;--> statement-breakpoint
ALTER TABLE "solleciti" ADD CONSTRAINT "solleciti_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solleciti" ADD CONSTRAINT "solleciti_controparte_id_controparti_id_fk" FOREIGN KEY ("controparte_id") REFERENCES "public"."controparti"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solleciti" ADD CONSTRAINT "solleciti_creato_da_utenti_id_fk" FOREIGN KEY ("creato_da") REFERENCES "public"."utenti"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solleciti_controparte_idx" ON "solleciti" USING btree ("azienda_id","controparte_id");