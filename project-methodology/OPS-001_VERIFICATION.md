# OPS-001 — Verificación operacional

Fecha: 2026-09-30. Estado: iniciada; recorrido remoto pendiente de identificar el caso autorizado.

## Alcance y autorización

El usuario solicitó ejecutar OPS-001 y eligió usar un grupo/alumno de prueba que indicará. No se ha recibido todavía el parcial, grado/grupo, alumno ni examen. La generación por grado procesa todos los alumnos pendientes elegibles de ese grado, no sólo el alumno elegido; debe quedar identificado el alcance autorizado antes de iniciarla. No se ha autorizado la aprobación de calificaciones reales.

## Evidencia de esta revisión

- Recorrido separado en Docker local: login docente sintético, sesión nueva de `1 A`, asistencia `R`, comentario sintético, guardado y confirmación en PostgreSQL de asistencia, anotación y eventos; los registros creados y el snapshot académico fueron retirados. No se contactó Apps Script, Sheets, Gemini ni Neon. Esta evidencia ayuda a la migración local, pero no cierra OPS-001 ni prueba la UI de Producción.

- La portada de Producción abrió en navegador y mostró el formulario de acceso; no había sesión docente en esa pestaña.
- GET sin sesión a `/api/teacher/academic`, `/api/teacher/ca-rubric-job` y `/api/teacher/results` respondió HTTP 401 con `Acceso docente requerido.` en las tres rutas.
- La comprobación de sintaxis de `integrations/google-sheets-bridge/Code.gs` mediante `vm.Script` pasó. No ejecuta APIs de Apps Script ni demuestra equivalencia con el puente publicado.
- `npm run test:academic`: 13 pruebas, 10 aprobadas y 3 fallidas. Las expectativas fallidas fueron final 76 frente a 75; final 68 frente a null; y C.A. por defecto 100 frente a 90. Los fixtures de las dos primeras pruebas omiten `alumno_id` en la fila de calificaciones. La tercera conserva una fila de C.A. 90 y espera el comportamiento anterior de nota por defecto 100. No se modificó el motor ni la suite; estos resultados no prueban la rúbrica ni persistencia remota.
- La inspección local del job muestra cursor persistido en Script Properties, trigger de un minuto, procesamiento de hasta tres alumnos y bloqueo de generación simultánea. Tanto el filtro de UI como el puente excluyen grupos/grados con PRUEBA o TEST del procesamiento por grado.
- La ruta de envío acepta y guarda respuestas antes de evaluar; contempla recuperación de un envío ya finalizado y sincronización académica pendiente. Es evidencia estática, no una prueba de recuperación.

## Recorrido pendiente

1. Identificar parcial, grado/grupo, alumno y examen autorizados; comprobar encabezados vivos antes de operaciones basadas en esquema.
2. Acceder al panel docente y observar ProgressOverlay, inicio del job, avance y resultado. Salir y volver para comprobar recuperación del estado. Verificar las propuestas sin aprobar calificaciones reales automáticamente.
3. Iniciar el examen de prueba, guardar respuestas y recuperar el intento tras recargar; enviar y comprobar resultado durable y bloqueo de un nuevo intento.
4. Contrastar persistencia en rangos acotados de Sheets, sin copiar datos identificables a este informe. Registrar resultado y límites antes de cerrar OPS-001.

## Límites y handoff

No se escribió en Sheets, no se llamó Gemini, no se inició un job ni un intento, y no se desplegó. No se ejecutaron build ni lint. No existe evidencia suficiente para cerrar OPS-001.

Rama al ejecutar: `codex/alex-standard-v1-adoption`; HEAD `a430ca8831d2b9cbf90aa5733cef8c7114b2a295`. Se conservaron los cambios funcionales previos sin commit. Este informe es local; no hubo commit, push, merge ni PR.
