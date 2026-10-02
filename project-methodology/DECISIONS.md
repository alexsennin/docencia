# Decisiones duraderas

## DEC-001 — Mantener la arquitectura operativa Sheets + Apps Script + Vercel

- **Fecha / estado:** 2026-09-30 · Aceptada; describe el sistema actual.
- **Contexto:** Docencia ya opera con una aplicación Next.js en Vercel, Apps Script y la hoja Google Sheets `Docencia`.
- **Opciones consideradas:** mantener el stack operativo; planear una migración a otra base/proveedor en una iniciativa independiente.
- **Decisión y razón:** conservar el stack que usaba Producción en el momento de esta decisión. La migración posterior a Neon se registra en DEC-011.
- **Consecuencias originales:** Sheets era la fuente operativa; Apps Script validaba y escribía; Vercel atendía la aplicación. El corte a Neon se realizó el 2026-10-01; Sheets/Apps Script permanecen como legado.
- **Alcance / revisión:** proyecto Docencia. Revisar sólo si el usuario solicita una migración o cambia la fuente de datos.
- **Referencias:** `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `project.config.json` y metadatos/encabezados vivos de `Docencia` consultados el 2026-09-30.

## DEC-002 — Usar Producción como referencia y limitar cambios en GitHub

- **Fecha / estado:** 2026-09-30 · Aceptada; actualizada para esta adopción documental.
- **Contexto:** el usuario revisa y mejora `docencia.integratech.app` directamente; pidió no hacer nada en GitHub por ahora.
- **Opciones consideradas:** usar `origin/main` como única fuente operativa; mantener el flujo actual de publicación directa en Vercel/Apps Script; reanudar GitHub tras una nueva decisión.
- **Decisión y razón:** tratar Producción como referencia operativa. El usuario autorizó una rama de revisión, un commit y un push que incluyan sólo los documentos de esta adopción. Esa autorización no abarca los cambios funcionales preexistentes, merge ni deployment.
- **Consecuencias:** el checkout local y Producción pueden divergir; el SHA remoto no identifica necesariamente lo desplegado. Para el trabajo funcional sigue pausada la sincronización con GitHub; la rama documental es una excepción acotada al respaldo remoto habitual de ALEX v1.0.
- **Mitigación / riesgo:** antes de publicar, comparar el código con el deployment vivo y conservar los cambios locales; no afirmar respaldo Git de cambios que no se hayan publicado al remoto.
- **Alcance / revisión:** Vercel, Apps Script y repositorio Docencia. Revisar antes de reanudar trazabilidad o publicación de cambios funcionales.
- **Referencias:** `AGENTS.md`, `PROJECT_STATE.md`, `TODO.md`.

## DEC-003 — Mantener temporalmente el acceso estudiantil por ID

- **Fecha / estado:** 2026-09-30 · Aceptada temporalmente por el usuario.
- **Contexto:** el portal permite consultar exámenes/calificaciones mediante el ID escolar; no exige credencial individual del alumno.
- **Opciones consideradas:** conservar el acceso actual; diseñar autenticación estudiantil más fuerte en una tarea posterior.
- **Decisión y razón:** no cambiar el flujo ahora; el usuario entiende y acepta el riesgo temporal.
- **Consecuencias:** quien conozca o adivine un ID podría intentar consultar información de ese alumno. Esta decisión no demuestra que el riesgo sea mitigado.
- **Alcance / revisión:** acceso del alumno y datos que se muestran a través de él. Revisar antes de ampliar el tipo o sensibilidad de la información expuesta, o cuando el usuario solicite otro mecanismo.
- **Referencias:** `app/api/access/route.ts`, `AGENTS.md`, `PROJECT_CONTEXT.md`.

## DEC-004 — Adoptar ALEX DEVELOPMENT STANDARD v1.0 con memoria en `project-methodology/`

- **Fecha / estado:** 2026-09-30 · Aceptada; adopción documental y piloto DOC-001 completados.
- **Contexto:** futuros agentes necesitan contexto persistente y cierre trazable sin depender de conversaciones.
- **Opciones consideradas:** conservar sólo memoria de chat; copiar íntegro el estándar; adoptar sus responsabilidades y enlazar la fuente.
- **Decisión y razón:** mantener documentos propios del proyecto bajo `project-methodology/`, enlazar la metodología canónica y no copiarla ni imponer su stack, herramientas o identidad visual.
- **Consecuencias:** la primera versión de adopción había dejado los documentos específicos del producto en la raíz; esta corrección los reubicó a la estructura indicada por v1.0, eliminó la duplicación y mantiene `AGENTS.md` como puerta de entrada. El piloto DOC-001 comparó los encabezados vivos de Sheets y marcó las tablas antiguas de `project.config.json` como no autoritativas; la adopción documental queda completada sin despliegue ni cambio funcional.
- **Alcance / revisión:** documentación del repositorio Docencia. Revisar si cambia la fuente/versionado del estándar o si una tarea futura evidencia que la guía local ya no cumple el método.
- **Referencia exacta consultada:** `alexsennin/alex-development-standard/standards/v1.0/`, commit `e0c356e219771cbab456fed8e52aa6a86f40a70d`.

## DEC-005 — Publicar los cambios funcionales para revisión en Producción

- **Fecha / estado:** 2026-09-30 · Aceptada por instrucción explícita del usuario.
- **Decisión:** los cambios funcionales solicitados se implementan, validan y despliegan en `docencia.integratech.app`, donde el usuario revisa. Mantener el proyecto y dominio existentes; actualizar Apps Script sólo cuando el cambio lo requiera y tras comparar el origen vivo.
- **Alcance:** actualiza la restricción de publicación funcional de DEC-002. GitHub continúa pausado: no autoriza commits, pushes, PR ni merge. Los cambios exclusivamente documentales no se despliegan.
- **Límites:** build y READY no sustituyen el recorrido autenticado ni la verificación de persistencia.

## DEC-006 — Evaluación y guardado automático de rúbrica por grupo

- **Fecha / estado:** 2026-09-30 · Solicitada explícitamente por el usuario.
- **Decisión:** Evaluar clasifica comentarios de clase por cinco criterios, escala 1–10, asigna 10 sin comentarios relacionados y actualiza sólo resultados ausentes o desactualizados del grupo. Guarda automáticamente; no exige aprobación manual separada de esta rúbrica.
- **Consecuencia:** actualiza la revisión previa obligatoria de rúbrica documentada antes. Los fundamentos siguen disponibles para revisión; no cambia la aprobación de reportes pedagógicos ni exámenes. Copiar calificaciones produce siete columnas sin nombres ni encabezados.
- **Referencia:** RUBRIC_MATRIX_CHANGE.md; puente @36; frontend dpl_9ngDSPxseNmFpn3dugBV7pycF3nH.

### Ampliación DEC-006: puntualidad con asistencia registrada

El usuario indicó incluir retardos del periodo además de comentarios. La versión 2026-09-v4 y el puente @37 incorporan cantidad y fechas de R/Retardo de ASISTENCIAS del alumno, grupo y parcial en sesiones impartidas; sólo afectan el criterio 2. El hash detecta altas/correcciones/eliminaciones y Evaluar actualiza automáticamente. Sin comentarios relacionados ni retardos, puntualidad queda en 10.

## DEC-007 — Migrar gradualmente de Sheets/Apps Script a PostgreSQL/Neon

- **Fecha / estado:** 2026-09-30 · Aceptada; el corte productivo posterior se documenta en DEC-011.
- **Decisión original:** conservar Next.js/TypeScript y Vercel; usar Docker con PostgreSQL para desarrollo local y Neon PostgreSQL como objetivo de Producción; migrar un flujo a la vez.
- **Consecuencias:** durante la transición coexisten ambos backends. `DATA_BACKEND` elige la fuente; el valor por defecto es `sheets`. Ninguna rama de desarrollo debe contener PII escolar.
- **Actualización 2026-10-01:** por instrucción explícita del usuario, el corte de datos y backend a Neon Production se ejecutó; véase DEC-011. Se conserva temporalmente el acceso estudiantil por ID (DEC-003). El legado no se desactivó.
- **Referencia:** `NEON_MIGRATION_PLAN.md`.

## DEC-008 — C.A. sin evidencia usa la calificación completa

- **Fecha / estado:** 2026-09-30 · Aceptada como regla del motor académico.
- **Decisión:** cuando no hay rúbrica evaluada ni puntuaciones de conducta/actitud por sesión, C.A. es 100/100. Una columna copiada de `CALIFICACIONES` no es evidencia primaria y no reemplaza esos registros; si hay rúbrica pendiente/desactualizada, sigue pendiente.
- **Razón:** cumplir la regla solicitada de que sin comentarios relacionados el alumno recibe 10 en cada criterio, y evitar que un valor derivado histórico altere el cálculo actual.
- **Referencia:** `lib/academic-engine.ts`, prueba `CA promedia conducta y actitud por sesión y usa 10 si no hay captura de sesión` en `tests/academic-engine.test.mjs`.

## DEC-009 — Priorizar MVP local y diferir retiro del legado

- **Fecha / estado:** 2026-10-01 · Fue la prioridad inicial de la fase local; superada por la instrucción de corte a Neon registrada en DEC-011.
- **Decisión original:** priorizar un MVP Next.js/TypeScript accesible con PostgreSQL en Docker y datos de alumnos cargados; durante esa etapa no desplegar, hacer push ni cambiar la fuente productiva.
- **Consecuencias:** mantener intactos los servicios y datos remotos; el MVP local usa credenciales propias guardadas sólo en `.env`. La eliminación/desactivación del legado queda para una fase posterior con inventario, exportación/backup independiente restaurable, aceptación end-to-end y reversión revisada.
- **Revisión:** completada para el corte descrito en DEC-011.
- **Referencia:** `PROJECT_STATE.md` y `NEON_MIGRATION_PLAN.md`.

## DEC-010 — Archivar sesiones y actividades desde un apartado general

- **Fecha / estado:** 2026-10-01 · Implementada para el MVP local.
- **Decisión:** al retirar una sesión, tarea o trabajo, conservar sus registros en el sistema, excluirlos de vistas y cálculos activos, y listarlos en el menú docente `Archivados`. El listado es de consulta general y no permite restaurar todavía; el flujo de restauración se definirá después de revisar este apartado.
- **Consecuencias:** archivar una sesión también archiva las actividades cuyo origen o calificación pertenece a esa sesión, evitando que sigan afectando la Evaluación Continua. Se conservan asistencias, comentarios, calificaciones y auditoría para consulta.
- **Alcance:** Docker/PostgreSQL local y comportamiento homólogo del puente Apps Script; no se desplegó ni se alteró Producción.
- **Referencias:** `components/teacher-academic-module.tsx`, `lib/academic-archive.ts`, `lib/teacher-session-postgres.ts`, `integrations/google-sheets-bridge/Code.gs`.


## DEC-011 — Cortar Producción a Neon y cargar la base local existente

- **Fecha / estado:** 2026-10-01 · Ejecutada por instrucción explícita del usuario.
- **Decisión:** mantener Next.js en Vercel, apuntar el backend de Producción de docencia.integratech.app a Neon PostgreSQL y cargar sin datos ficticios la base local existente.
- **Evidencia:** aplicación READY en Vercel dpl_HzUY8PhcuN4wr8DWpATVodaVYM9N, alias confirmado; login docente y /api/teacher/academic respondieron 200 desde Neon con 171 alumnos, 30 sesiones, 760 asistencias y cero tareas/exámenes. Los conteos de las 21 tablas coincidieron entre origen local y destino; smoke confirmó 32 FKs y rechazo de huérfanos. Snapshot manual posterior al corte snap-flat-shadow-b5fy486y.
- **Consecuencias y límites:** se conservan Sheets/Apps Script y su configuración como legado; no hay sincronización continua ni reversión automática. Gemini está configurado como secreto de Vercel, pero no se llamó durante la verificación. El plan Neon no habilita snapshots programados. El backup cifrado local pasó restauración en Docker temporal, pero no existe una copia independiente fuera del equipo. Sin commits ni push; la rama funcional queda sucia.
- **Revisión:** completar y probar respaldo independiente de Neon; evaluar explícitamente un plan/servicio que permita snapshots programados antes de depender de automatización de recuperación.

## DEC-012 — Sincronizar fuente funcional con GitHub y mostrar respuestas en Exámenes

- **Fecha / estado:** 2026-10-02 · Solicitada explícitamente por el usuario.
- **Decisión:** corregir el acceso al desglose desde la matriz de Exámenes y publicar la misma fuente funcional en Local, Vercel Production y el repositorio privado GitHub, incluida la implementación PostgreSQL preexistente necesaria para reproducir el deployment.
- **Alcance:** esta tarea autoriza commit y push y sustituye la pausa de GitHub para la sincronización solicitada. No autoriza sincronizar bases de datos, reevaluar respuestas, retirar el legado ni subir datos escolares o secretos.
- **Validación:** lectura autenticada de 2.º B, comprobación visual del detalle, validaciones locales y verificación del deployment y SHA remoto.
