import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const allowLocalSeed = process.env.SEED_LOCAL_CONFIRM === "YES";

if (!connectionString || !allowLocalSeed) {
  throw new Error("Semilla detenida: define DATABASE_URL local y SEED_LOCAL_CONFIRM=YES.");
}

const databaseHost = new URL(connectionString).hostname;
if (!["db", "localhost", "127.0.0.1"].includes(databaseHost)) {
  throw new Error("Semilla detenida: sólo se permiten hosts locales (db/localhost/127.0.0.1).");
}

const pool = new Pool({ connectionString, max: 1 });

try {
  await pool.query(
    `INSERT INTO students (id, nombre, nivel, grado, grupo, ciclo_escolar, asignacion, hoja_origen)
     VALUES ('SYNTH-001', 'Alumno ficticio 1', 'Secundaria', '1', 'A', 'TEST-LOCAL', 'Prueba', 'fixture')
     ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, grupo = EXCLUDED.grupo`,
  );
  await pool.query(
    `INSERT INTO academic_periods (parcial_id, nombre, orden, ciclo_escolar, materia, estado)
     VALUES ('SYNTH-P1', 'Periodo ficticio', 1, 'TEST-LOCAL', 'Español', 'Prueba')
     ON CONFLICT (parcial_id) DO UPDATE SET nombre = EXCLUDED.nombre, estado = EXCLUDED.estado`,
  );
  await pool.query(
    `INSERT INTO class_sessions (sesion_id, parcial_id, fecha_clase, grupo, materia, estado)
     VALUES ('SYNTH-SESSION-001', 'SYNTH-P1', '2026-09-01', '1 A', 'Español', 'Realizada')
     ON CONFLICT (sesion_id) DO UPDATE SET estado = EXCLUDED.estado`,
  );
  await pool.query(
    `INSERT INTO attendance (asistencia_id, sesion_id, parcial_id, alumno_id, grupo, fecha_clase, estado)
     VALUES ('SYNTH-ATTENDANCE-001', 'SYNTH-SESSION-001', 'SYNTH-P1', 'SYNTH-001', '1 A', '2026-09-01', 'I')
     ON CONFLICT (asistencia_id) DO UPDATE SET estado = EXCLUDED.estado`,
  );
  await pool.query(
    `INSERT INTO tasks (tarea_id, parcial_id, grupo, nombre, fecha_entrega, puntaje_maximo, obligatoria, activa, estado_banco, peso_ec, sesion_calificacion_id)
     VALUES ('SYNTH-TASK-001', 'SYNTH-P1', '1 A', 'Actividad ficticia', '2026-09-02', 10, TRUE, TRUE, 'En_calificacion', 100, 'SYNTH-SESSION-001')
     ON CONFLICT (tarea_id) DO UPDATE SET activa = EXCLUDED.activa, estado_banco = EXCLUDED.estado_banco, sesion_calificacion_id = EXCLUDED.sesion_calificacion_id`,
  );
  await pool.query(
    `INSERT INTO task_grades (registro_id, tarea_id, parcial_id, alumno_id, grupo, entregada, puntaje, estado)
     VALUES ('SYNTH-TASK-GRADE-001', 'SYNTH-TASK-001', 'SYNTH-P1', 'SYNTH-001', '1 A', TRUE, 9, 'Calificada')
     ON CONFLICT (registro_id) DO UPDATE SET puntaje = EXCLUDED.puntaje`,
  );
  await pool.query(
    `INSERT INTO ai_reports (reporte_id, parcial_id, alumno_id, tipo, estado, resumen, fortalezas, areas_oportunidad, recomendaciones_json, visibilidad_alumno)
     VALUES ('SYNTH-REPORT-VISIBLE', 'SYNTH-P1', 'SYNTH-001', 'Académico', 'Aprobado', 'Reporte ficticio visible', '["Fortaleza ficticia"]', '[]', '["Recomendación ficticia"]', TRUE),
            ('SYNTH-REPORT-HIDDEN', 'SYNTH-P1', 'SYNTH-001', 'Académico', 'Borrador', 'Reporte ficticio privado', '[]', '[]', '[]', FALSE)
     ON CONFLICT (reporte_id) DO UPDATE SET visibilidad_alumno = EXCLUDED.visibilidad_alumno`,
  );
  await pool.query(
    `INSERT INTO exams (examen_id, parcial_id, nombre, materia, grado, grupo, estado, duracion_minutos, puntaje_maximo, requiere_pantalla_completa, instrucciones, created_at)
     VALUES ('SYNTH-EXAM-001', 'SYNTH-P1', 'Examen ficticio 1A', 'Español', '1', 'A', 'Publicado', 30, 10, FALSE, 'Prueba local con datos sintéticos.', NOW()),
            ('SYNTH-EXAM-ASSIGNED', 'SYNTH-P1', 'Examen ficticio asignado', 'Español', '2', 'B', 'Publicado', 30, 10, FALSE, 'Prueba de asignación individual.', NOW()),
            ('SYNTH-EXAM-DRAFT', 'SYNTH-P1', 'Borrador ficticio', 'Español', '1', 'A', 'Borrador', 30, 10, FALSE, 'No debe mostrarse al alumno.', NOW())
     ON CONFLICT (examen_id) DO UPDATE SET estado = EXCLUDED.estado, grupo = EXCLUDED.grupo`,
  );
  await pool.query(
    `INSERT INTO exam_questions (reactivo_id, examen_id, orden, tema, tipo, consigna, opciones_json, respuesta_correcta, puntaje_maximo, metodo_evaluacion, activo)
     VALUES ('SYNTH-Q1', 'SYNTH-EXAM-001', 1, 'Prueba', 'opcion_multiple', '¿Cuál opción es ficticia?', '["Opción A", "Opción B"]'::jsonb, '"A"'::jsonb, 10, 'automatic', TRUE)
     ON CONFLICT (reactivo_id) DO UPDATE SET opciones_json = EXCLUDED.opciones_json, activo = EXCLUDED.activo`,
  );
  await pool.query(
    `INSERT INTO exam_assignments (asignacion_id, alumno_id, examen_id, estado)
     VALUES ('SYNTH-ASG-001', 'SYNTH-001', 'SYNTH-EXAM-ASSIGNED', 'ACTIVO')
     ON CONFLICT (asignacion_id) DO UPDATE SET estado = EXCLUDED.estado`,
  );
  await pool.query(
    `INSERT INTO exam_attempts (intento_id, examen_id, parcial_id, alumno_id, grupo, estado, tiempo_limite_min, ai_pendiente, bloqueo_activo, created_at)
     VALUES ('SYNTH-ATTEMPT-001', 'SYNTH-EXAM-001', 'SYNTH-P1', 'SYNTH-001', 'A', 'Enviado', 30, FALSE, FALSE, NOW())
     ON CONFLICT (intento_id) DO UPDATE SET estado = EXCLUDED.estado, updated_at = NOW()`,
  );
  process.stdout.write("Datos sintéticos cargados en PostgreSQL local.\n");
} finally {
  await pool.end();
}
