CREATE TABLE "presenze" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"giorno" date NOT NULL,
	"minuti_ordinari" integer NOT NULL,
	"minuti_straordinari" integer NOT NULL,
	CONSTRAINT "presenze_minuti_validi" CHECK ("presenze"."minuti_ordinari" BETWEEN 0 AND 1440
      AND "presenze"."minuti_straordinari" BETWEEN 0 AND 1440
      AND "presenze"."minuti_ordinari" + "presenze"."minuti_straordinari" BETWEEN 1 AND 1440)
);
--> statement-breakpoint
ALTER TABLE "presenze" ADD CONSTRAINT "presenze_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presenze" ADD CONSTRAINT "presenze_persona_id_personale_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presenze_azienda_giorno_persona_idx" ON "presenze" USING btree ("azienda_id","giorno","persona_id");--> statement-breakpoint
CREATE INDEX "presenze_persona_idx" ON "presenze" USING btree ("persona_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON presenze TO suite_app;
--> statement-breakpoint
ALTER TABLE presenze ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON presenze
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
