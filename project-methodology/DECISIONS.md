# Decisiones duraderas

## DEC-019 — Priorización operativa y postergación de complejidad en autenticación

- **Fecha / estado:** 2026-11-06 · Aceptada por instrucción explícita del usuario.
- **Contexto:** En la auditoría técnica se sugirieron rate limiting (`SEC-02`), mitigación de timing side-channel (`SEC-03`) y contraseñas estudiantiles. El usuario clarificó que el sistema se encuentra en fase de prueba funcional con aproximadamente 127 alumnos, donde el acceso se limita a consultar notas y realizar exámenes asignados sin operaciones críticas que comprometan la integridad general.
- **Decisión:** Mantener el acceso por ID escolar simple sin contraseñas para los alumnos, evitando fricción operativa y pérdidas de tiempo docente gestionando olvidos de contraseña. Posponer medidas complejas de autenticación estudiantil. A futuro, se contempla separar explícitamente el inicio de sesión docente (con contraseña obligatoria) del portal del estudiante, incorporando en este último una ventana/tiempo de espera ante intentos fallidos.
- **Consecuencias:** Se eliminan las tareas `SEC-02`, `SEC-03` y `SEC-05` de las prioridades inmediatas.

## DEC-020 — Matriz consolidada de asistencia por grupo y exportación para hojas de cálculo

- **Fecha / estado:** 2026-11-06 · Implementada, validada y desplegada en Producción.
- **Decisión:** En la sección Clases (debajo del listado general de sesiones), se incorpora una matriz consolidada de asistencia (`AttendanceMatrixTable`).
- **Estructura:**
  - Columnas: `ID Alumno`, `Nombre alumno`, seguidos cronológicamente por cada fecha de clase (`fecha 1 | fecha 2 | ...`) en formato `DD/MM` con indicador del día de la semana.
  - Celdas: `P` (Asistencia / Presente - fondo verde suave), `I` (Inasistencia - fondo rojo suave), `R` (Retardo - fondo ámbar suave) y vacía si no existe registro.
  - Orden: Alumnos ordenados estrictamente de forma alfabética por sus apellidos (`localeCompare(..., "es-MX")`).
  - Copiado al portapapeles: Un botón permite copiar en formato TSV (compatible con Excel y Google Sheets) **exclusivamente** el nombre del alumno, las fechas y las celdas de asistencia, omitiendo la columna del ID escolar para que coincida directamente con los registros oficiales de la docente.
- **Referencias:** `components/attendance-matrix-table.tsx`, `components/teacher-academic-module.tsx`, `app/globals.css`, `tests/attendance-matrix.test.mjs`.

## DEC-017 — Evaluaciones reutilizables y trabajos en modalidad examen

- **Fecha / estado:** 2026-10-12 · Implementada, probada en UI local y publicada en Producción (`dpl_7uWX9cLEjYKcgUZaVEyRa7aTjhSX`).
- **Decisión:** separar plantillas de Examen y Actividad; la docente guarda una versión (incluso con claves o rúbricas pendientes), la prueba en `/docente/probar` sin crear intentos, la aprueba con validación completa y luego la aplica explícitamente al grupo del catálogo. Una Actividad se vincula a la sesión y aporta una sola nota derivada del intento a EC; un Examen aporta a EX. Nuevas aplicaciones guardan política inmutable de tiempo estricto/libre y bloqueo opcional por pantalla completa/pérdida de foco. Las aplicaciones históricas conservan su contrato.
- **Acceso:** por instrucción expresa del usuario, el alumno continúa entrando sólo con ID. Una sesión de servidor ligada al ID protege las rutas posteriores; no se considera verificación fuerte de identidad.
- **Tiempo y cierre:** el deadline estricto se persiste y no se extiende al desbloquear. Alumno, docente y cron pueden cerrar intentos vencidos usando respuestas autoguardadas. El cron diario es respaldo; el intervalo efectivo se revisará según plan y necesidad operativa.
- **Límites:** migración `0009` en Neon Production y frontend en Vercel `dpl_7uWX9cLEjYKcgUZaVEyRa7aTjhSX` (READY). Se completó el recorrido autenticado de lectura y simulación en Producción (`Constructor`, `Exámenes` y `/docente/probar`) sin escribir ni alterar datos escolares reales; GitHub `origin/main` sigue en `39cc792` sin push.

## DEC-018 — Constructor unificado en 1 solo archivo y revisión visual de reactivos

- **Fecha / estado:** 2026-10-13 · Implementada, validada en PostgreSQL local aislado y publicada en Vercel Producción (`docencia-ophhgjpg6-alex-sennin.vercel.app`, alias `https://docencia.integratech.app`).
- **Contexto:** las docentes solían requerir dos archivos `.docx` separados (uno para el examen y otro para la rúbrica), y la revisión de borradores obligaba a manipular JSON crudo en un `<textarea>`. La docente solicitó un flujo más natural: un único documento que incluya el nombre de la evaluación al principio, los reactivos limpios para el alumno y la rúbrica detallada al final.
- **Decisión:** permitir la carga de 1 solo archivo `.docx` (modo predeterminado) que reúne el título/nombre del ejercicio al inicio, las consignas e incisos del alumno, y la sección delimitada de guía docente y rúbrica al final. Se mantiene un modo alterno para subir 2 archivos si la docente ya los tiene separados. En la interfaz se incorpora una guía desplegable con la plantilla modelo descargable/copiable. La revisión del borrador se transforma de JSON crudo a tarjetas visuales interactivas: campo editable del título del examen, contador dinámico de suma de puntos a 100 y lista de reactivos con sus consignas, opciones y criterios de rúbrica, dejando el editor JSON como acordeón técnico secundario.
- **Consecuencias y límites:** el backend (`app/api/teacher/exams/draft/route.ts` y `lib/exam-authoring-postgres.ts`) extrae el texto, detecta el título en el encabezado (`NOMBRE DE LA EVALUACIÓN: ...`), separa preguntas de la rúbrica y mantiene la privacidad de los criterios de calificación. Sin commits ni push a GitHub por regla vigente del proyecto.

## DEC-001 — Mantener la arquitectura operativa Sheets + Apps Script + Vercel

- **Fecha / estado:** 2026-09-30 · Aceptada; describe el sistema actual.
- **Contexto:** Docencia ya opera con una aplicación Next.js en Vercel, Apps Script y la hoja Google Sheets `Docencia`.
- **Opciones consideradas:** mantener el stack operativo; planear una migración a otra base/proveedor en una iniciativa independiente.
- **Decisión y razón:** conservar el stack que usaba Producción en el momento de esta decisión. La migración posterior a Neon se registra en DEC-011.
- **Consecuencias originales:** Sheets era la fuente operativa; Apps Script validaba y escribía; Vercel atendía la aplicación. El corte a Neon se realizó el 2026-10-01; Sheets/Apps Script permanecen como legado.
- **Alcance / revisión:** proyecto Docencia. Revisar sólo si el usuario solicita una migración o cambia la fuente de datos.
- **Referencias:** `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `project.config.json` y metadatos/encabezados vivos de `Docencia` consultados el 2026-09-30.

## DEC-002 — Usar Producción como referencia y limitar cambios en GitHub

- **Fecha / estado:** 2026-09-30 · Aceptada; su excepción de Git se aplicó sólo a la adopción documental v1.0.
- **Contexto:** el usuario revisa y mejora `docencia.integratech.app` directamente; pidió no hacer nada en GitHub por ahora.
- **Opciones consideradas:** usar `origin/main` como única fuente operativa; mantener el flujo actual de publicación directa en Vercel/Apps Script; reanudar GitHub tras una nueva decisión.
- **Decisión y razón:** tratar Producción como referencia operativa. La autorización del usuario del 2026-09-30 para una rama de revisión, commit y push cubrió únicamente la adopción documental v1.0. No abarcó cambios funcionales preexistentes, merge ni deployment.
- **Consecuencias:** el checkout local y Producción pueden divergir; el SHA remoto no identifica necesariamente lo desplegado. Para el trabajo funcional sigue pausada la sincronización con GitHub salvo el alcance funcional específico de DEC-012. La adopción documental v1.2 permanece local hasta que exista una autorización explícita para publicarla en Git.
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

## DEC-004 — Adoptar ALEX DEVELOPMENT STANDARD con memoria en `project-methodology/`

- **Fecha / estado:** 2026-09-30 · Aceptada; adopción documental y piloto DOC-001 completados.
- **Contexto:** futuros agentes necesitan contexto persistente y cierre trazable sin depender de conversaciones.
- **Opciones consideradas:** conservar sólo memoria de chat; copiar íntegro el estándar; adoptar sus responsabilidades y enlazar la fuente.
- **Decisión y razón:** mantener documentos propios del proyecto bajo `project-methodology/`, enlazar la metodología canónica y no copiarla ni imponer su stack, herramientas o identidad visual.
- **Consecuencias:** la primera versión de adopción había dejado los documentos específicos del producto en la raíz; esta corrección los reubicó a la estructura indicada por v1.0, eliminó la duplicación y mantiene `AGENTS.md` como puerta de entrada. El piloto DOC-001 comparó los encabezados vivos de Sheets y marcó las tablas antiguas de `project.config.json` como no autoritativas; la adopción documental queda completada sin despliegue ni cambio funcional.
- **Alcance / revisión:** documentación del repositorio Docencia. Revisar si cambia la fuente/versionado del estándar o si una tarea futura evidencia que la guía local ya no cumple el método.
- **Referencia exacta consultada:** `alexsennin/alex-development-standard/standards/v1.0/`, commit `e0c356e219771cbab456fed8e52aa6a86f40a70d`.

### Actualización DEC-004 — Adopción de v1.2 (antecedente)

- **Fecha / estado:** 2026-10-06 · Aceptada para Docencia por solicitud del usuario; sustituye v1.0 como metodología vigente. DOC-001 permanece como evidencia histórica de la primera adopción.
- **Contexto y opciones:** el repositorio fuente recomienda v1.2 para adopción gradual; se consideró conservar v1.0 o adoptar v1.2 contrastando el proyecto existente.
- **Decisión y razón:** adoptar v1.2 por referencia al paquete canónico, conservar `AGENTS.md` y `project-methodology/` como autoridad local, y aplicar modos y niveles proporcionales. La ruta rápida de RELEASE aplica sólo cuando los efectos y la autorización del destino lo permiten; las reglas específicas de Docencia prevalecen para sus servicios y datos. El agente semanal es opcional y no se programa por esta adopción.
- **Consecuencias y límites:** no se copian documentos normativos, no se alteran código de ejecución, datos ni configuración remota; la documentación se actualiza sólo cuando cambia su verdad. Git, Vercel, Neon y Apps Script conservan políticas y estados separados. La validación del piloto documental v1.2 se registra en `PROJECT_STATE.md`.
- **Referencia exacta consultada:** `alexsennin/alex-development-standard/standards/v1.2/`, commit `b083cd99a7007c784e8e13e255aef8446cf640d8`.

### Actualización DEC-004 — Adopción de v1.3

- **Fecha / estado:** 2026-10-06 · Aceptada por solicitud del usuario; v1.3 reemplaza v1.2 como versión vigente de Docencia.
- **Contexto y decisión:** el repositorio oficial publicó v1.3 como vigente el 2026-10-06. Docencia adopta esa revisión y conserva la fuente normativa central en sólo lectura. Se actualizan las referencias de entrada y la memoria del proyecto; no se copian guías normativas.
- **Adaptación local:** v1.3 separa modo, nivel de riesgo y capacidad cognitiva. El runtime actual no enruta automáticamente modelos/reasoning por microtarea y las reglas activas limitan la delegación. Se usa el fallback manual: acotar microtareas por comportamiento verificable, emplear la capacidad disponible cuando baste y elevar la limitación sólo si una tarea requiere una capacidad no disponible. La delegación no cambia alcance, permiso o destino.
- **Piloto y verificación:** adopción documental PATCH/Nivel 1; análisis de fuente y perfil como EXPERT, actualización de referencias como FOCUSED. Se verifican enlaces/rutas, estructura existente y `git diff --check`; no se ejecutan pruebas de aplicación, ni se consulta/escribe Producción.
- **Referencia exacta consultada:** `alexsennin/alex-development-standard/standards/v1.3/`, commit `8b275ede744a2fa393efaed1bf85192ee7efc7ba`.

### Actualización DEC-004 — Adopción de v1.3.1

- **Fecha / estado:** 2026-10-06 · Aceptada por solicitud del usuario; v1.3.1 reemplaza v1.3 como versión vigente de Docencia.
- **Contexto y decisión:** la rama principal del repositorio canónico identifica v1.3.1 como vigente y obligatoria para trabajo nuevo/activo; Docencia actualiza su puerta de entrada y perfil local antes de continuar trabajo sustantivo. No se copian documentos normativos ni se instala el agente semanal opcional.
- **Adaptación local:** `CORE.md` es el contrato operativo mínimo y se consulta desde el origen central. Se conservan las reglas específicas de Docencia; publicación/push y despliegue a Producción se tratan como operaciones distintas, y los cambios en Producción requieren autorización explícita para esa acción y destino. Señales de alto riesgo requieren análisis EXPERT antes de editar; el runtime usa compatibilidad manual y respeta restricciones de delegación.
- **Consecuencias y límites:** la adopción modifica sólo documentación. No autoriza Git remoto, Producción ni una operación de datos. PAD-001 fue aplicado y desplegado antes por su autorización propia; la adopción no altera ni repite esas operaciones. No se exige piloto separado.
- **Referencia exacta consultada:** `alexsennin/alex-development-standard/standards/v1.3.1/`, commit `d2b0a3efc194bf0cf1c74eeab9fa432c2ff1f3d7`.

### Actualización DEC-004 — Adopción de ARC Development Standard v1.3.2

- **Fecha / estado:** 2026-10-06 · Adoptada por instrucción explícita del usuario; sustituye v1.3.1 como identidad y versión vigentes de la metodología de Docencia.
- **Decisión:** ARC Development Standard v1.3.2 es la metodología del proyecto; AXIOM v0.1 es su runtime oficial, Codex CLI su motor de ejecución y Luna / Sol / Astra la familia de modelos que AXIOM selecciona según capacidad. Se conserva la base operativa local ya documentada para modo, riesgo, capacidad, autorización y validación. No se inventan cambios normativos adicionales.
- **Fuente y límite:** no se encontró ni verificó una URL canónica publicada para ARC v1.3.2 durante esta adopción. La edición registra el nombre, versión y relación con AXIOM previamente definidos por el usuario; no copia documentos del estándar ni modifica el repositorio fuente ALEX.
- **Alcance:** actualización documental de Docencia. No modifica código, esquema, datos, GitHub ni Producción.

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

## DEC-013 — Corregir y finalizar intentos por alumno en la matriz de Exámenes

- **Fecha / estado:** 2026-10-02 · Implementada, publicada y verificada.
- **Decisión:** separar en la matriz estado del intento, su valor y acciones por alumno. `Editar calificación` abre el desglose individual y guarda únicamente puntos por reactivo, junto con motivo/auditoría, sin reescribir respuesta ni estado correcto/incorrecto. `Re-evaluar` queda disponible sólo para respuestas IA pendientes y se ejecuta individualmente. `Finalizar examen` procesa un intento activo/bloqueado con las respuestas autoguardadas; las respuestas abiertas no vacías se someten al flujo normal de IA.
- **Razón:** permitir recuperar entregas interrumpidas y resolver calificaciones puntuales sin volver a evaluar respuestas que ya revisó la docente.
- **Consecuencias:** dos columnas nuevas aditivas guardan el puntaje manual y su fecha. Neon Production recibió la migración probada y verificada; Vercel Production y GitHub `main` quedaron actualizados.
- **Alcance:** matriz docente de exámenes en PostgreSQL. No sincroniza las bases de datos local y productiva.
- **Referencias:** `components/teacher-exam-grade-matrix.tsx`, `lib/exam-attempt-postgres.ts`, migración `0006_mute_lady_vermin.sql`.

## DEC-014 — Fijar la calificación final manualmente por alumno

- **Fecha / estado:** 2026-10-04 · Implementada, publicada y verificada en Producción.
- **Decisión:** en `Editar calificación`, además de los puntajes por reactivo, la docente puede activar una nota final manual sobre 10. Guardar esa nota establece `manualGradeLocked`; las reevaluaciones de IA del intento se bloquean y los resultados de IA que estuvieran en curso no se aplican. El cálculo derivado por reactivos se conserva y vuelve a mostrarse al retirar el ajuste.
- **Consecuencias:** se mantiene separada la nota calculada de la manual; cada cambio requiere motivo y auditoría. La matriz marca como Manual la nota fijada. No se altera la respuesta ni se recalifican otros alumnos. `Calificaciones` convierte la nota final manual sobre 10 al componente Examen sobre 100 y la prioriza sobre el puntaje por reactivos, incluso si queda evaluación de IA pendiente; sin ajuste manual usa puntajes por reactivo/maxScore. El cambio de puntaje por reactivo renueva el snapshot del parcial.
- **Publicación y evidencia:** migración `0007_lucky_maestro.sql` aplicada desde Neon SQL Editor como `neondb_owner` sin ampliar permisos del runtime; hash y columnas verificados. Vercel `dpl_gwxjwcP1XHzjL7u2GPD975cQbfZK` quedó READY. Recorrido autenticado de Producción confirmó el control editable en 3.º A; se cerró sin modificar notas. GitHub `main` quedó sincronizada en `5ea7671`.
- **Referencias:** migración `0007_lucky_maestro.sql`, `components/teacher-exam-grade-matrix.tsx`, `lib/exam-attempt-postgres.ts`.

## DEC-015 — Permitir puntuar manualmente reactivos sin respuesta

- **Fecha / estado:** 2026-10-04 · Implementada, publicada y verificada.
- **Decisión:** el editor de calificación muestra un campo de puntaje para cada reactivo de un intento entregado. Si falta la fila de respuesta, el servidor crea un registro vacío con el puntaje manual; no inventa respuesta ni cambia `Sin_respuesta`.
- **Consecuencias:** los puntos manuales cuentan para el resultado final aun si la respuesta está vacía. La pregunta vacía no se manda a IA ni queda disponible para reevaluación; el cambio conserva motivo y auditoría.
- **Validación y publicación:** integración con fixtures sintéticos confirma fila ausente antes de editar, puntos calculados, respuesta vacía y cero evaluación IA. Vercel `dpl_CHsvJha7S3N8ddpQyL4bVpuqLQwQ` quedó READY; UI autenticada de Producción mostró todos los reactivos habilitados para un intento sin respuestas, cerrado sin guardar. GitHub `main`: `6894b05`.
- **Referencias:** `components/teacher-exam-grade-matrix.tsx`, `lib/exam-attempt-postgres.ts`, `tests/exam-attempt-postgres.integration.mjs`.

## DEC-016 — Administrar el padrón con catálogos y baja reversible

- **Fecha / estado:** 2026-10-06 · Aceptada dentro de la solicitud PAD-001; código local implementado, Producción pendiente.
- **Decisión:** el padrón docente permite crear, editar, desactivar y restaurar alumnos. Desactivar conserva historial y auditoría, y bloquea acceso/captura nueva. Los catálogos administrables son Grado (`students.nivel`) y Grupo (etiqueta visible asociada al grado, más su correspondencia heredada `students.grado`/`students.grupo`).
- **Formato:** el `.xlsx` contiene `ID`, `Nombre alumno` y `Grupo y grado`; admite el encabezado `Nombre alumbo` solicitado inicialmente. La última columna valida exactamente la pareja activa del catálogo, salvo mayúsculas y espacios extra. Los IDs existentes conservan su valor canónico; IDs nuevos requieren confirmación; filas omitidas no producen bajas; los cambios se aplican con auditoría en una transacción.
- **Alcance y estado:** migración aditiva `0008_striped_toad.sql` aplicada en Docker y validada en una rama temporal de Neon; pendiente autorización específica para completar la migración de `production` y después publicar/verificar en Vercel. No se sincronizan datos entre bases.
- **Referencias:** `app/api/teacher/students/route.ts`, `components/teacher-student-management.tsx`, `lib/student-registry-postgres.ts`, `db/migrations/0008_striped_toad.sql`, `TODO.md`.

### Actualización DEC-016 — Consultar alumnos por grupo

- **Fecha / estado:** 2026-10-06 · Solicitada por el usuario; implementada en el checkout local.
- **Decisión:** la vista Alumnos requiere seleccionar un grupo activo antes de mostrar estudiantes y limita búsqueda, paginación e inclusión de inactivos a ese grupo.
- **Alcance:** sólo presentación del padrón; no cambia API, esquema, asignaciones, ni datos. Despliegue y aceptación de Producción quedan pendientes.

## DEC-017 — Constructor Unificado de Evaluaciones en Archivo Único y Rúbrica Privada

- **Fecha / estado:** 2026-10-13 · Implementada y verificada.
- **Decisión:** simplificar la creación de evaluaciones docentes a un único archivo `.docx` que incluye el nombre del ejercicio al inicio (`NOMBRE DE LA EVALUACIÓN: ...`), las consignas del estudiante y la rúbrica/criterios al final (`SECCIÓN 2: GUÍA DOCENTE, CRITERIOS Y RÚBRICA`).
- **Consecuencias:** el backend parsea y divide el documento, asegurando que la rúbrica y respuestas esperadas se usen exclusivamente como guía para la IA evaluadora y nunca se expongan en el frontend estudiantil. Se alineó tanto PostgreSQL como Google Sheets Bridge (`Code.js`) para aceptar y procesar este formato unificado. La interfaz incorpora vista previa visual de reactivos con tarjetas interactivas, edición directa del título y medidor en tiempo real de sumatoria a 100 puntos.
- **Referencias:** `app/api/teacher/exams/draft/route.ts`, `lib/exam-authoring-postgres.ts`, `integrations/google-sheets-bridge/Code.js`, `components/teacher-assessment-repository.tsx`.

## DEC-018 — Correcciones de Seguridad, Calificación Proporcional y Modularidad

- **Fecha / estado:** 2026-10-13 · Implementada y probada localmente.
- **Decisiones clave:**
  1. **Seguridad contra Inyección de Prompts (`SEC-04` / `SEC-01`):** blindaje en la evaluación de respuestas abiertas mediante delimitadores XML `<RESPUESTA_DEL_ALUMNO>`, instrucción del sistema estricta anti-jailbreak y migración de credenciales Gemini de query parameter a cabecera HTTP `x-goog-api-key`.
  2. **Calificación Proporcional y Reactivos Dinámicos (`DAT-01` / `DAT-03`):** preguntas de clasificación ahora extraen reactivos dinámicos del prompt del examen y otorgan crédito proporcional según aciertos individuales (`(aciertos / total) * maxScore`), eliminando la penalización "todo o nada".
  3. **Integridad Relacional (`DAT-04`):** adición de `ON DELETE CASCADE` en la clave foránea de `assessment_template_questions.template_id` (migración `0010_redundant_albert_cleary.sql`).
  4. **Cumplimiento de UI (`FNT-01` / `FNT-02` / `FNT-03`):** inclusión obligatoria de `ProgressOverlay` y guardia contra doble ejecución en refresco de asignaciones; eliminación de componente muerto `TeacherExamAuthoring`; y modularización del monolito `teacher-academic-module.tsx` en `AcademicDashboardView`, `AcademicArchivedView` y `AcademicStudentDetailDialog`.
  5. **Estabilización de Entorno Local:** sincronización de base de datos Docker local en puerto 15432 con migraciones 0009 y 0010 y semillas de prueba, permitiendo ejecución completa de pruebas de integración offline.
- **Referencias:** `lib/exam-attempt-postgres.ts`, `lib/exam-engine.ts`, `components/student-exam-portal.tsx`, `components/teacher-exam-preview.tsx`, `components/teacher-academic-module.tsx`, `db/migrations/0010_redundant_albert_cleary.sql`.
