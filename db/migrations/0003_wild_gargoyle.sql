ALTER TABLE "exam_attempts" ALTER COLUMN "tiempo_limite_min" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN "bloqueado_at" timestamp with time zone;