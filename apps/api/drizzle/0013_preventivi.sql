CREATE TABLE "preventivi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"commessa_id" uuid,
	"titolo" text NOT NULL,
	"data" date NOT NULL,
	"valido_fino" date,
	"stato" text DEFAULT 'bozza' NOT NULL,
	"totale_cents" bigint NOT NULL,
	"voci" jsonb NOT NULL,
	"note" text,
	CONSTRAINT "preventivi_validita_coerente" CHECK ("preventivi"."valido_fino" >= "preventivi"."data")
);
--> statement-breakpoint
ALTER TABLE "preventivi" ADD CONSTRAINT "preventivi_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preventivi" ADD CONSTRAINT "preventivi_cliente_id_controparti_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."controparti"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preventivi" ADD CONSTRAINT "preventivi_commessa_id_commesse_id_fk" FOREIGN KEY ("commessa_id") REFERENCES "public"."commesse"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preventivi_azienda_data_idx" ON "preventivi" USING btree ("azienda_id","data");--> statement-breakpoint
CREATE UNIQUE INDEX "preventivi_commessa_idx" ON "preventivi" USING btree ("commessa_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON preventivi TO suite_app;
--> statement-breakpoint
ALTER TABLE preventivi ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON preventivi
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
