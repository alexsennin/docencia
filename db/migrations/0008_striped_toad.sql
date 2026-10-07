CREATE TABLE "student_grades" (
	"grado_id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_groups" (
	"grupo_id" text PRIMARY KEY NOT NULL,
	"grado_id" text NOT NULL,
	"nombre" text NOT NULL,
	"grado_academico" text NOT NULL,
	"grupo_academico" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "actualizado_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "desactivado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "desactivado_por" text;--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_grado_id_student_grades_grado_id_fk" FOREIGN KEY ("grado_id") REFERENCES "public"."student_grades"("grado_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_grades_normalized_name_unique" ON "student_grades" USING btree (upper(btrim("nombre")));--> statement-breakpoint
CREATE UNIQUE INDEX "student_groups_grade_normalized_name_unique" ON "student_groups" USING btree ("grado_id",upper(btrim("nombre")));--> statement-breakpoint
CREATE UNIQUE INDEX "student_groups_legacy_pair_unique" ON "student_groups" USING btree ("grado_id",upper(btrim("grado_academico")),upper(btrim("grupo_academico")));--> statement-breakpoint
CREATE INDEX "student_groups_grade_active_idx" ON "student_groups" USING btree ("grado_id","activo");--> statement-breakpoint
CREATE UNIQUE INDEX "students_normalized_id_unique" ON "students" USING btree (upper(btrim("id")));--> statement-breakpoint
CREATE INDEX "students_active_grade_group_idx" ON "students" USING btree ("activo","nivel","grado","grupo");
--> statement-breakpoint
INSERT INTO "student_grades" ("grado_id", "nombre", "activo")
SELECT 'grade-' || md5(upper(btrim("nivel"))), min(btrim("nivel")), true
FROM "students"
WHERE nullif(btrim("nivel"), '') IS NOT NULL
GROUP BY upper(btrim("nivel"))
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH "legacy_groups" AS (
  SELECT DISTINCT ON (upper(btrim("nivel")), upper(btrim("grado")), upper(btrim("grupo")))
    btrim("nivel") AS "nivel",
    btrim("grado") AS "grado",
    btrim("grupo") AS "grupo",
    'group-' || md5(upper(btrim("nivel")) || '|' || upper(btrim("grado")) || '|' || upper(btrim("grupo"))) AS "grupo_id",
    (CASE
      WHEN btrim("grado") ~* '^[0-9]+[°ºo]?$' THEN regexp_replace(btrim("grado"), '[°ºoO]$', '') || 'o'
      ELSE btrim("grado")
    END) || ' ' || btrim("grupo") || ' ' ||
    (CASE WHEN upper(btrim("nivel")) IN ('SECUNDARIA', 'SEC') THEN 'Sec' ELSE btrim("nivel") END) AS "nombre"
  FROM "students"
  WHERE nullif(btrim("nivel"), '') IS NOT NULL
    AND nullif(btrim("grado"), '') IS NOT NULL
    AND nullif(btrim("grupo"), '') IS NOT NULL
  ORDER BY upper(btrim("nivel")), upper(btrim("grado")), upper(btrim("grupo")), "grado", "grupo"
)
INSERT INTO "student_groups" ("grupo_id", "grado_id", "nombre", "grado_academico", "grupo_academico", "activo")
SELECT "legacy_groups"."grupo_id", "student_grades"."grado_id", "legacy_groups"."nombre", "legacy_groups"."grado", "legacy_groups"."grupo", true
FROM "legacy_groups"
JOIN "student_grades" ON upper(btrim("student_grades"."nombre")) = upper(btrim("legacy_groups"."nivel"))
;
