ALTER TABLE "fatture" ADD COLUMN "tipo_documento" text DEFAULT 'TD01' NOT NULL;--> statement-breakpoint
ALTER TABLE "fatture" ADD COLUMN "fattura_collegata_id" uuid;--> statement-breakpoint
ALTER TABLE "pagamenti" ADD COLUMN "tipo" text DEFAULT 'incasso' NOT NULL;--> statement-breakpoint
ALTER TABLE "pagamenti" ADD COLUMN "nota_credito_id" uuid;--> statement-breakpoint
ALTER TABLE "fatture" ADD CONSTRAINT "fatture_fattura_collegata_id_fatture_id_fk" FOREIGN KEY ("fattura_collegata_id") REFERENCES "public"."fatture"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamenti" ADD CONSTRAINT "pagamenti_nota_credito_id_fatture_id_fk" FOREIGN KEY ("nota_credito_id") REFERENCES "public"."fatture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagamenti_nota_idx" ON "pagamenti" USING btree ("nota_credito_id");