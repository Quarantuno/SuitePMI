ALTER TABLE "aziende" DROP CONSTRAINT "aziende_partita_iva_unique";--> statement-breakpoint
ALTER TABLE "controparti" ADD COLUMN "pec_confermata" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fatture" ADD COLUMN "riferimenti_nota" jsonb;