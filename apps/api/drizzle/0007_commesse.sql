CREATE TABLE "commesse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"budget_cents" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fatture" ADD COLUMN "commessa_id" uuid;--> statement-breakpoint
ALTER TABLE "commesse" ADD CONSTRAINT "commesse_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commesse" ADD CONSTRAINT "commesse_cliente_id_controparti_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."controparti"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commesse_azienda_idx" ON "commesse" USING btree ("azienda_id");--> statement-breakpoint
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_commessa_id_commesse_id_fk" FOREIGN KEY ("commessa_id") REFERENCES "public"."commesse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fatture_commessa_idx" ON "fatture" USING btree ("commessa_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON commesse TO suite_app;
--> statement-breakpoint
ALTER TABLE commesse ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON commesse
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
