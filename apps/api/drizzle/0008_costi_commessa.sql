CREATE TABLE "costi_commessa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"commessa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"data" date NOT NULL,
	"descrizione" text NOT NULL,
	"minuti" integer DEFAULT 0 NOT NULL,
	"costo_cents" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "costi_commessa" ADD CONSTRAINT "costi_commessa_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costi_commessa" ADD CONSTRAINT "costi_commessa_commessa_id_commesse_id_fk" FOREIGN KEY ("commessa_id") REFERENCES "public"."commesse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "costi_commessa_azienda_commessa_idx" ON "costi_commessa" USING btree ("azienda_id","commessa_id");
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON costi_commessa TO suite_app;
--> statement-breakpoint
ALTER TABLE costi_commessa ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON costi_commessa
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
