CREATE TABLE "assessment_template_questions" (
	"plantilla_reactivo_id" text PRIMARY KEY NOT NULL,
	"plantilla_id" text NOT NULL,
	"orden" integer NOT NULL,
	"tema" text,
	"tipo" text NOT NULL,
	"consigna" text NOT NULL,
	"opciones_json" jsonb,
	"respuesta_correcta" jsonb,
	"puntaje_maximo" numeric NOT NULL,
	"metodo_evaluacion" text NOT NULL,
	"rubrica" text
);
--> statement-breakpoint
CREATE TABLE "assessment_templates" (
	"plantilla_id" text PRIMARY KEY NOT NULL,
	"familia_id" text NOT NULL,
	"version" integer NOT NULL,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"instrucciones" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT 'Borrador' NOT NULL,
	"materia" text,
	"grado" text,
	"modo_tiempo" text DEFAULT 'Estricto' NOT NULL,
	"duracion_minutos" integer,
	"bloqueo_foco" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_sessions" (
	"sesion_id" text PRIMARY KEY NOT NULL,
	"alumno_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "version_politica" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "modo_tiempo" text DEFAULT 'Estricto' NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "bloqueo_foco" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "limite_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "transcurrido_segundos" integer;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "plantilla_origen_id" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "proposito" text DEFAULT 'Examen' NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "modo_asignacion" text DEFAULT 'LegacyGroup' NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "version_politica" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "modo_tiempo" text DEFAULT 'Estricto' NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "bloqueo_foco" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "solicitud_asignacion_id" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "solicitud_huella" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "evaluacion_examen_id" text;--> statement-breakpoint
ALTER TABLE "assessment_template_questions" ADD CONSTRAINT "assessment_template_questions_plantilla_id_assessment_templates_plantilla_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."assessment_templates"("plantilla_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_alumno_id_students_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_template_questions_order_unique" ON "assessment_template_questions" USING btree ("plantilla_id","orden");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_templates_family_version_unique" ON "assessment_templates" USING btree ("familia_id","version");--> statement-breakpoint
CREATE INDEX "assessment_templates_kind_status_idx" ON "assessment_templates" USING btree ("tipo","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "student_sessions_token_hash_unique" ON "student_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "student_sessions_student_idx" ON "student_sessions" USING btree ("alumno_id");--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_plantilla_origen_id_assessment_templates_plantilla_id_fk" FOREIGN KEY ("plantilla_origen_id") REFERENCES "public"."assessment_templates"("plantilla_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_evaluacion_examen_id_exams_examen_id_fk" FOREIGN KEY ("evaluacion_examen_id") REFERENCES "public"."exams"("examen_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exams_assignment_request_unique" ON "exams" USING btree ("solicitud_asignacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_assessment_exam_unique" ON "tasks" USING btree ("evaluacion_examen_id");--> statement-breakpoint
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_contract_check" CHECK (
  "tipo" IN ('Examen', 'Actividad') AND "estado" IN ('Borrador', 'Aprobada')
  AND "modo_tiempo" IN ('Estricto', 'Libre')
  AND (("modo_tiempo" = 'Estricto' AND "duracion_minutos" BETWEEN 1 AND 240)
    OR ("modo_tiempo" = 'Libre' AND "duracion_minutos" IS NULL))
);--> statement-breakpoint
ALTER TABLE "assessment_template_questions" ADD CONSTRAINT "assessment_template_questions_contract_check" CHECK (
  "orden" > 0 AND "puntaje_maximo" > 0
  AND "tipo" IN ('opcion_multiple', 'clasificacion', 'abierta')
  AND "metodo_evaluacion" IN ('automatic', 'ai')
);--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_assessment_contract_check" CHECK (
  "proposito" IN ('Examen', 'Actividad') AND "modo_asignacion" IN ('LegacyGroup', 'Explicit')
  AND "version_politica" IN ('legacy', 'v1') AND "modo_tiempo" IN ('Estricto', 'Libre')
  AND ("version_politica" = 'legacy' OR (
    "modo_asignacion" = 'Explicit' AND "plantilla_origen_id" IS NOT NULL
    AND "solicitud_asignacion_id" IS NOT NULL AND "solicitud_huella" IS NOT NULL
    AND (("modo_tiempo" = 'Estricto' AND "duracion_minutos" BETWEEN 1 AND 240)
      OR ("modo_tiempo" = 'Libre' AND "duracion_minutos" IS NULL))
  ))
);--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_policy_contract_check" CHECK (
  "version_politica" IN ('legacy', 'v1') AND "modo_tiempo" IN ('Estricto', 'Libre')
  AND ("transcurrido_segundos" IS NULL OR "transcurrido_segundos" >= 0)
  AND ("version_politica" = 'legacy' OR
    (("modo_tiempo" = 'Estricto' AND "limite_at" IS NOT NULL)
      OR ("modo_tiempo" = 'Libre' AND "limite_at" IS NULL)))
);--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_expiry_check" CHECK ("expires_at" > "created_at");
