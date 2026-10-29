ALTER TABLE "aziende" ADD COLUMN "solleciti_auto_attivi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "aziende" ADD COLUMN "solleciti_auto_giorni" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "aziende" ADD COLUMN "solleciti_auto_livello_max" text DEFAULT 'sollecito' NOT NULL;--> statement-breakpoint
ALTER TABLE "aziende" ADD COLUMN "solleciti_auto_ultima_esecuzione" date;--> statement-breakpoint
ALTER TABLE "controparti" ADD COLUMN "solleciti_automatici" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "solleciti" ADD COLUMN "automatico" boolean DEFAULT false NOT NULL;