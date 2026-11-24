CREATE TABLE "contratti_lavoro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"titolo" text NOT NULL,
	"decorrenza" date NOT NULL,
	"testo" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contratti_lavoro" ADD CONSTRAINT "contratti_lavoro_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratti_lavoro" ADD CONSTRAINT "contratti_lavoro_persona_id_personale_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personale"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contratti_lavoro_persona_decorrenza_idx" ON "contratti_lavoro" USING btree ("persona_id","decorrenza");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON contratti_lavoro TO suite_app;
--> statement-breakpoint
ALTER TABLE contratti_lavoro ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON contratti_lavoro
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
