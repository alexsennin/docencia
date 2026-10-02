CREATE TABLE "academic_periods" (
	"parcial_id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer,
	"ciclo_escolar" text,
	"materia" text,
	"estado" text,
	"fecha_inicio" date,
	"fecha_cierre" date,
	"peso_asistencias" numeric,
	"peso_trabajos_clase" numeric,
	"peso_tareas" numeric,
	"peso_evaluacion_continua" numeric,
	"peso_conducta" numeric,
	"peso_actitud" numeric,
	"peso_examen" numeric,
	"ponderacion_total" numeric,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"modo_evaluacion_continua" text
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" text,
	"descripcion" text,
	"editable" boolean,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"nivel" text,
	"grado" text,
	"grupo" text,
	"ciclo_escolar" text,
	"asignacion" text,
	"hoja_origen" text
);
--> statement-breakpoint
CREATE INDEX "academic_periods_school_year_order_idx" ON "academic_periods" USING btree ("ciclo_escolar","orden");--> statement-breakpoint
CREATE INDEX "students_school_year_grade_group_idx" ON "students" USING btree ("ciclo_escolar","grado","grupo");