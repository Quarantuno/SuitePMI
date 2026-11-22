CREATE TABLE "personale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cognome" text NOT NULL,
	"email_lavoro" text,
	"mansione" text NOT NULL,
	"data_ingresso" date NOT NULL,
	"data_uscita" date,
	CONSTRAINT "personale_date_coerenti" CHECK ("personale"."data_uscita" >= "personale"."data_ingresso")
);
--> statement-breakpoint
ALTER TABLE "personale" ADD CONSTRAINT "personale_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personale_azienda_idx" ON "personale" USING btree ("azienda_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON personale TO suite_app;
--> statement-breakpoint
ALTER TABLE personale ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON personale
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
