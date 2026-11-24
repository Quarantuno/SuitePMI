ALTER TABLE "assenze" ADD COLUMN "minuti" integer;--> statement-breakpoint
ALTER TABLE "assenze" ADD CONSTRAINT "assenze_permesso_orario_valido" CHECK ("assenze"."minuti" IS NULL OR
      ("assenze"."tipo" = 'permesso' AND "assenze"."al" = "assenze"."dal" AND "assenze"."minuti" BETWEEN 1 AND 1439));