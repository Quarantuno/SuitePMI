CREATE TABLE "contratti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"commessa_id" uuid NOT NULL,
	"titolo" text NOT NULL,
	"data" date NOT NULL,
	"testo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospetti_paghe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azienda_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"mese" text NOT NULL,
	"lordo_cents" bigint NOT NULL,
	"competenze_cents" bigint NOT NULL,
	"contributi_cents" bigint NOT NULL,
	"ritenute_cents" bigint NOT NULL,
	"trattenute_cents" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commesse" ADD COLUMN "ricavo_netto_cents" bigint;--> statement-breakpoint
ALTER TABLE "costi_commessa" ADD COLUMN "tariffa_oraria_cents" bigint;--> statement-breakpoint
ALTER TABLE "costi_commessa" ADD COLUMN "operatore" text;--> statement-breakpoint
ALTER TABLE "contratti" ADD CONSTRAINT "contratti_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratti" ADD CONSTRAINT "contratti_commessa_id_commesse_id_fk" FOREIGN KEY ("commessa_id") REFERENCES "public"."commesse"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospetti_paghe" ADD CONSTRAINT "prospetti_paghe_azienda_id_aziende_id_fk" FOREIGN KEY ("azienda_id") REFERENCES "public"."aziende"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospetti_paghe" ADD CONSTRAINT "prospetti_paghe_persona_id_personale_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personale"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contratti_azienda_commessa_idx" ON "contratti" USING btree ("azienda_id","commessa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prospetti_paghe_mese_persona_idx" ON "prospetti_paghe" USING btree ("azienda_id","mese","persona_id");
--> statement-breakpoint
UPDATE commesse AS c
SET ricavo_netto_cents = (
  SELECT SUM((voce->>'quantita')::bigint * (voce->>'prezzoCents')::bigint)
  FROM jsonb_array_elements(p.voci) AS voce
)
FROM preventivi AS p
WHERE p.commessa_id = c.id AND p.azienda_id = c.azienda_id AND p.stato = 'accettato' AND c.ricavo_netto_cents IS NULL;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON contratti, prospetti_paghe TO suite_app;
--> statement-breakpoint
ALTER TABLE contratti ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON contratti
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE prospetti_paghe ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON prospetti_paghe
  USING (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid)
  WITH CHECK (azienda_id = NULLIF(current_setting('app.azienda_id', true), '')::uuid);
