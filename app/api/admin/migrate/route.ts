import { sql } from "drizzle-orm";
import { getDatabase } from "../../../../db/client";
import { hasTeacherSession } from "../../../../lib/teacher-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await hasTeacherSession())) {
    return Response.json({ error: "Inicia sesión como docente." }, { status: 401 });
  }

  try {
    const db = getDatabase();

    // Comprobar si el constraint ya tiene ON DELETE CASCADE ('c')
    const result = await db.execute<{ confdeltype: string }>(sql`
      SELECT confdeltype FROM pg_constraint
      WHERE conname = 'assessment_template_questions_plantilla_id_assessment_templates_plantilla_id_fk'
      LIMIT 1;
    `);

    const currentType = result.rows?.[0]?.confdeltype;
    let applied = false;

    if (currentType !== "c") {
      await db.execute(sql`
        ALTER TABLE "assessment_template_questions"
        DROP CONSTRAINT IF EXISTS "assessment_template_questions_plantilla_id_assessment_templates_plantilla_id_fk";

        ALTER TABLE "assessment_template_questions"
        ADD CONSTRAINT "assessment_template_questions_plantilla_id_assessment_templates_plantilla_id_fk"
        FOREIGN KEY ("plantilla_id")
        REFERENCES "public"."assessment_templates"("plantilla_id")
        ON DELETE cascade
        ON UPDATE no action;
      `);
      applied = true;
    }

    return Response.json({
      ok: true,
      applied,
      confdeltype: "c",
      message: applied ? "Migración 0010 aplicada exitosamente (ON DELETE CASCADE)." : "El constraint ya contaba con ON DELETE CASCADE.",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Error ejecutando migración 0010" },
      { status: 500 }
    );
  }
}
