CREATE TABLE "access_records" (
	"acceso_id" text PRIMARY KEY NOT NULL,
	"rol" text,
	"alumno_id" text,
	"usuario_login" text,
	"estado" text,
	"debe_cambiar_credencial" boolean,
	"ultimo_acceso" timestamp with time zone,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_evaluations" (
	"evaluacion_ai_id" text PRIMARY KEY NOT NULL,
	"intento_id" text NOT NULL,
	"reactivo_id" text NOT NULL,
	"modelo" text,
	"prompt_version" text,
	"entrada_json" jsonb,
	"estado" text,
	"puntaje" numeric,
	"retroalimentacion" text,
	"desglose_json" jsonb,
	"error" text,
	"ejecutado_at" timestamp with time zone,
	"aprobado_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_reports" (
	"reporte_id" text PRIMARY KEY NOT NULL,
	"parcial_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"tipo" text,
	"estado" text,
	"resumen" text,
	"fortalezas" text,
	"areas_oportunidad" text,
	"recomendaciones_json" jsonb,
	"evidencias_json" jsonb,
	"visibilidad_alumno" boolean,
	"revisado_por" text,
	"revisado_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"asistencia_id" text PRIMARY KEY NOT NULL,
	"sesion_id" text NOT NULL,
	"parcial_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"grupo" text,
	"fecha_clase" date,
	"estado" text,
	"observaciones" text,
	"registrado_por" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"evento_id" text PRIMARY KEY NOT NULL,
	"tipo" text,
	"entidad" text,
	"entidad_id" text,
	"parcial_id" text,
	"alumno_id" text,
	"actor_id" text,
	"detalle_json" jsonb,
	"ocurrido_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"job_id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"estado" text DEFAULT 'queued' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"ejecutar_despues" timestamp with time zone NOT NULL,
	"bloqueado_por" text,
	"bloqueado_at" timestamp with time zone,
	"ultimo_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completado_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"sesion_id" text PRIMARY KEY NOT NULL,
	"parcial_id" text NOT NULL,
	"fecha_clase" date,
	"grupo" text,
	"materia" text,
	"tema" text,
	"estado" text,
	"observaciones" text,
	"registrado_por" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"estado_captura" text,
	"pase_lista_completo" boolean
);
--> statement-breakpoint
CREATE TABLE "conduct_attitude" (
	"registro_id" text PRIMARY KEY NOT NULL,
	"parcial_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"grupo" text,
	"fecha" date,
	"tipo" text,
	"observacion" text,
	"infraccion" text,
	"puntuacion" numeric,
	"rubrica_version" text,
	"estado" text,
	"registrado_por" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"sesion_id" text,
	"rubrica_criterios_json" jsonb,
	"rubrica_propuesta_json" jsonb,
	"rubrica_evidencias_json" jsonb,
	"rubrica_modelo" text,
	"rubrica_fuente_hash" text,
	"evaluacion_ia_estado" text,
	"evaluacion_ia_puntaje_sugerido" numeric,
	"evaluacion_ia_justificacion" text,
	"evaluacion_ia_prompt_version" text
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"evaluacion_id" text PRIMARY KEY NOT NULL,
	"parcial_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"grupo" text,
	"dias_clase" numeric,
	"faltas" numeric,
	"tareas_faltantes" numeric,
	"evaluacion_continua" numeric,
	"conducta" numeric,
	"actitud" numeric,
	"examen" numeric,
	"calificacion_parcial" numeric,
	"estado" text,
	"comentario_docente" text,
	"reporte_ai_estado" text,
	"innovat_estado" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_answers" (
	"respuesta_id" text PRIMARY KEY NOT NULL,
	"intento_id" text NOT NULL,
	"reactivo_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"respuesta" text,
	"estado_respuesta" text,
	"puntaje_obtenido" numeric,
	"metodo_evaluacion" text,
	"retroalimentacion" text,
	"ai_estado" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_assignments" (
	"asignacion_id" text PRIMARY KEY NOT NULL,
	"alumno_id" text NOT NULL,
	"examen_id" text NOT NULL,
	"estado" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"intento_id" text PRIMARY KEY NOT NULL,
	"examen_id" text NOT NULL,
	"parcial_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"grupo" text,
	"estado" text,
	"inicio_at" timestamp with time zone,
	"fin_at" timestamp with time zone,
	"tiempo_limite_min" integer,
	"puntaje_automatico" numeric,
	"puntaje_ai" numeric,
	"puntaje_total" numeric,
	"calificacion_10" numeric,
	"ai_pendiente" boolean,
	"bloqueo_activo" boolean,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_questions" (
	"reactivo_id" text PRIMARY KEY NOT NULL,
	"examen_id" text NOT NULL,
	"orden" integer,
	"tema" text,
	"tipo" text,
	"consigna" text,
	"opciones_json" jsonb,
	"respuesta_correcta" jsonb,
	"puntaje_maximo" numeric,
	"metodo_evaluacion" text,
	"rubrica" text,
	"activo" boolean,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"examen_id" text PRIMARY KEY NOT NULL,
	"parcial_id" text NOT NULL,
	"nombre" text NOT NULL,
	"materia" text,
	"grado" text,
	"grupo" text,
	"estado" text,
	"fecha_apertura" timestamp with time zone,
	"fecha_cierre" timestamp with time zone,
	"duracion_minutos" integer,
	"puntaje_maximo" numeric,
	"requiere_pantalla_completa" boolean,
	"instrucciones" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"version" integer,
	"examen_origen_id" text,
	"proveedor_ia" text
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"calificacion_id" text PRIMARY KEY NOT NULL,
	"parcial_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"grupo" text,
	"dias_clase" numeric,
	"faltas" numeric,
	"tareas_faltantes" numeric,
	"evaluacion_continua" numeric,
	"conducta" numeric,
	"actitud" numeric,
	"examen" numeric,
	"calificacion_parcial" numeric,
	"calificacion_10" numeric,
	"estado" text,
	"comentario_docente" text,
	"reporte_ai_estado" text,
	"innovat_estado" text,
	"updated_at" timestamp with time zone,
	"calificacion_ca" numeric,
	"modo_evaluacion_continua" text,
	"detalle_ec_json" jsonb,
	"version_calculo" text
);
--> statement-breakpoint
CREATE TABLE "innovat_exports" (
	"export_id" text PRIMARY KEY NOT NULL,
	"parcial_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"grupo" text,
	"payload_json" jsonb,
	"estado" text,
	"intentos_envio" integer,
	"respuesta_innovat" text,
	"error" text,
	"enviado_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_grades" (
	"registro_id" text PRIMARY KEY NOT NULL,
	"tarea_id" text NOT NULL,
	"parcial_id" text NOT NULL,
	"alumno_id" text NOT NULL,
	"grupo" text,
	"entregada" boolean,
	"fecha_entrega" date,
	"puntaje" numeric,
	"estado" text,
	"observaciones" text,
	"updated_at" timestamp with time zone,
	"sesion_calificacion_id" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"tarea_id" text PRIMARY KEY NOT NULL,
	"parcial_id" text NOT NULL,
	"grupo" text,
	"nombre" text NOT NULL,
	"tipo" text,
	"fecha_asignacion" date,
	"fecha_entrega" date,
	"puntaje_maximo" numeric,
	"obligatoria" boolean,
	"activa" boolean,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"sesion_id" text,
	"descripcion" text,
	"peso_ec" numeric,
	"estado_banco" text,
	"sesion_calificacion_id" text
);
--> statement-breakpoint
CREATE INDEX "ai_evaluations_attempt_question_idx" ON "ai_evaluations" USING btree ("intento_id","reactivo_id");--> statement-breakpoint
CREATE INDEX "ai_reports_partial_student_idx" ON "ai_reports" USING btree ("parcial_id","alumno_id");--> statement-breakpoint
CREATE INDEX "attendance_partial_student_idx" ON "attendance" USING btree ("parcial_id","alumno_id");--> statement-breakpoint
CREATE INDEX "attendance_session_idx" ON "attendance" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_time_idx" ON "audit_events" USING btree ("entidad","entidad_id","ocurrido_at");--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_idempotency_key_unique" ON "background_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "background_jobs_status_run_after_idx" ON "background_jobs" USING btree ("estado","ejecutar_despues");--> statement-breakpoint
CREATE INDEX "class_sessions_partial_group_date_idx" ON "class_sessions" USING btree ("parcial_id","grupo","fecha_clase");--> statement-breakpoint
CREATE INDEX "conduct_attitude_partial_student_idx" ON "conduct_attitude" USING btree ("parcial_id","alumno_id");--> statement-breakpoint
CREATE INDEX "conduct_attitude_session_idx" ON "conduct_attitude" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "evaluations_partial_student_idx" ON "evaluations" USING btree ("parcial_id","alumno_id");--> statement-breakpoint
CREATE INDEX "evaluations_group_idx" ON "evaluations" USING btree ("grupo");--> statement-breakpoint
CREATE INDEX "exam_answers_attempt_idx" ON "exam_answers" USING btree ("intento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_answers_attempt_question_unique" ON "exam_answers" USING btree ("intento_id","reactivo_id");--> statement-breakpoint
CREATE INDEX "exam_assignments_exam_student_idx" ON "exam_assignments" USING btree ("examen_id","alumno_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_assignments_student_exam_unique" ON "exam_assignments" USING btree ("alumno_id","examen_id");--> statement-breakpoint
CREATE INDEX "exam_attempts_exam_student_status_idx" ON "exam_attempts" USING btree ("examen_id","alumno_id","estado");--> statement-breakpoint
CREATE INDEX "exam_attempts_partial_student_idx" ON "exam_attempts" USING btree ("parcial_id","alumno_id");--> statement-breakpoint
CREATE INDEX "exam_questions_exam_order_idx" ON "exam_questions" USING btree ("examen_id","orden");--> statement-breakpoint
CREATE INDEX "exams_partial_group_status_idx" ON "exams" USING btree ("parcial_id","grupo","estado");--> statement-breakpoint
CREATE INDEX "grades_partial_student_idx" ON "grades" USING btree ("parcial_id","alumno_id");--> statement-breakpoint
CREATE INDEX "innovat_exports_partial_student_idx" ON "innovat_exports" USING btree ("parcial_id","alumno_id");--> statement-breakpoint
CREATE INDEX "task_grades_partial_student_idx" ON "task_grades" USING btree ("parcial_id","alumno_id");--> statement-breakpoint
CREATE INDEX "tasks_partial_group_status_idx" ON "tasks" USING btree ("parcial_id","grupo","estado_banco");