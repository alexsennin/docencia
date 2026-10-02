# Rúbrica por comentarios y grupo

2026-09-30. Corrige la interpretación del Excel: se conserva la matriz de calificaciones, integrada al diseño de Docencia, sin reproducir su formato impreso.

## Comportamiento publicado

- Selector de grupo, botón Evaluar y Copiar calificaciones.
- Evaluar comprueba rúbricas ausentes, versión y hash de comentarios y retardos. Procesa sólo el grupo seleccionado, mediante el job persistente de Apps Script.
- Prompt específico: orden/limpieza/cuidado del espacio; puntualidad; uso indicado de computadora; lugar asignado; seguimiento de indicaciones y respeto. Escala 1 a 10; criterios sin comentarios relacionados mantienen 10. Los comentarios positivos o ambiguos no reducen; las reducciones requieren IDs y justificación. Comentarios son datos, nunca instrucciones. Se evalúan comentarios de sesiones impartidas del parcial, también los retardos R/Retardo de ASISTENCIAS, exclusivamente para puntualidad. Se cuentan una vez por sesión impartida, alumno y parcial; se envían cantidad y fechas al prompt.
- Bandas iniciales del prompt: leve aislada 9; leve repetida explícitamente o moderada aislada 7–8; moderada repetida o grave aislada 4–6; grave reiterada explícitamente 1–3. Son criterios implementados para concretar la escala; sujetos a revisión docente del resultado.
- Cada rúbrica se guarda automáticamente con estado Evaluada_ai y versión 2026-09-v4. CALIFICACIONES recibe CA en escala 0–100; el consolidado previo se deja pendiente para no mantener un total desactualizado. El motor académico admite este estado y calcula el promedio/final con los componentes disponibles.
- El copiado entrega siete columnas TSV: cinco puntuaciones, promedio y promedio/10; sin número, nombres ni encabezados. Bloquea el copiado de un grupo con evaluaciones pendientes, para evitar omitir alumnos y desalinear filas.
- El nombre abre fundamentos de la evaluación. ProgressOverlay cubre revisión inicial, evaluación y guardado; controles y handler impiden doble envío. Los fallos quedan visibles y se pueden reintentar; no se inventan notas si Gemini falla.

## Evidencia

- Build local y remoto aprobados; TypeScript, lint de los componentes/ruta y git diff --check aprobados.
- Cinco pruebas del puente con servicios simulados y datos ficticios aprobadas: sin comentarios/guardar 10, reevaluación por cambios/anulación y grupo aislado, rechazo de nota sin evidencia, bloqueo de jobs simultáneos.
- Comprobación visual del componente con datos ficticios: 9,10,10,10,10 produce promedio 9.80 y equivalente 0.98; cinco dieces producen 10.00 y 1.00.
- Puente vivo descargado y comparado antes de publicar: diferencias limitadas al flujo de rúbrica; manifiesto idéntico. Copia del código anterior conservada temporalmente para recuperación. Deployment existente actualizado a @37, sin crear otra URL.
- Vercel dpl_9ngDSPxseNmFpn3dugBV7pycF3nH, READY, alias docencia.integratech.app. Portada 200 y rutas docentes 401 sin sesión.
- Gemini con comentarios ficticios se validó mediante prueba del puente simulado; no se invocó el servicio Gemini real ni se escribió una evaluación de alumnos reales. Falta recorrido autenticado de evaluación, recuperación, copiado y persistencia real; OPS-001 sigue abierto. Las pruebas académicas anteriores tienen tres fallos ya documentados, no corregidos en este alcance.

## Entrega

Código: components/teacher-ca-rubric.tsx, components/ca-rubric-matrix.tsx, app/globals.css, app/api/teacher/ca-rubric-job/route.ts, lib/academic-engine.ts e integrations/google-sheets-bridge/Code.gs. Pruebas en tests/ca-rubric-bridge.test.mjs.

Rama codex/alex-standard-v1-adoption, HEAD a430ca8. Árbol sucio previo conservado; sin commit, push, PR ni merge. Frontend y puente publicados directamente, no respaldados por un nuevo SHA Git. Siguiente paso: revisar el flujo desde Producción con el caso autorizado de OPS-001.

Actualización de puntualidad: test adicional cubre filtros por alumno/parcial, duplicados por sesión y reevaluación al corregir un retardo a P. El detalle del alumno muestra cantidad y fechas de retardos considerados en la evaluación guardada. Las calificaciones existentes se actualizan al pulsar Evaluar; no se ejecutó una evaluación de alumnos reales durante la publicación.
