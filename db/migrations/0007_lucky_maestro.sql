ALTER TABLE "exam_attempts" ADD COLUMN "calificacion_manual_10" numeric;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "calificacion_manual_bloqueada" boolean DEFAULT false NOT NULL;