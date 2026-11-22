CREATE TABLE "assenze" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"dal" date NOT NULL,
	"al" date NOT NULL,
	CONSTRAINT "assenze_date_coerenti" CHECK ("assenze"."al" >= "assenze"."dal")
);
--> statement-breakpoint
ALTER TABLE "assenze" ADD CONSTRAINT "assenze_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assenze" ADD CONSTRAINT "assenze_persona_id_personale_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assenze_azienda_dal_idx" ON "assenze" USING btree ("azienda_id","dal");--> statement-breakpoint
CREATE INDEX "assenze_persona_idx" ON "assenze" USING btree ("persona_id");
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON assenze TO suite_app;
--> statement-breakpoint
ALTER TABLE assenze ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON assenze
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
