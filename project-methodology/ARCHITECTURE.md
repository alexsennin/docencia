# Arquitectura

## Alcance vigente: Producción en Neon (2026-10-01)

Por instrucción explícita del usuario, Vercel Production (docencia.integratech.app) ya selecciona PostgreSQL en Neon. Neon es la fuente operativa actual; Docker PostgreSQL local conserva una copia independiente y Sheets/Apps Script quedan como legado, sin desactivación. La UI sigue en Vercel: Neon es el backend PostgreSQL, no el host del frontend. La aceptación autenticada consultó en Producción los 171 alumnos, 30 sesiones y 760 asistencias. La clave de Gemini está configurada en Vercel, pero no se hizo una llamada de prueba.

## Reporte docente de exámenes (2026-10-02)

`getTeacherExamResultsInPostgres` reconstruye el desglose de intentos Definitivo/Provisional con el mismo motor del resultado estudiantil, incluida la nota automática que versiones anteriores no persistían por pregunta. No escribe ni invoca IA durante la consulta. El envío guarda también puntaje/retroalimentación por reactivo. `includeInProgress=true` en la ruta docente permite que la matriz muestre respuestas autoguardadas de Activo/Bloqueado/Evaluando, sin calificarlas; el comportamiento ordinario de resultados/revocación sólo incluye entregados. La recuperación de intentos vencidos crea las evaluaciones IA faltantes desde el autoguardado dentro de la transacción de envío, sin reemplazar respuestas por un payload de recuperación.

## Reportes académicos con PostgreSQL

Cuando `DATA_BACKEND=postgres`, `/api/teacher/academic` genera reportes con `lib/academic-report-postgres.ts`: el servidor vuelve a consultar al alumno, parcial y evidencia vigente, arma el contexto y llama al proveedor configurado desde servidor. El cliente sólo envía los identificadores; no puede suministrar calificaciones u observaciones para el prompt. La propuesta y su evidencia se guardan como `Pendiente_revision_docente`, con `visibilidad_alumno=false`; una transacción vuelve a comprobar que la evidencia no cambió mientras se generaba. La misma ruta requiere sesión docente para aprobar/publicar y registra auditoría. El endpoint del alumno filtra reportes privados y sólo entrega los visibles.

Cuando el backend es Sheets, la UI conserva la acción remota Apps Script existente. Ambas acciones iniciadas desde el módulo muestran `ProgressOverlay`. La generación en Postgres usa `GEMINI_API_KEY` del servidor; no se configura ni se necesita Gemini para crear propuestas con el evaluador sintético de pruebas. La aprobación es una acción docente separada y repetida de forma segura.

## Respaldo de PostgreSQL

`npm run backup:postgres` genera un dump custom con `pg_dump` del contenedor Docker, calcula SHA-256 y cifra el archive con AES-256-GCM usando `BACKUP_ENCRYPTION_KEY` (64 caracteres hexadecimales, custodiados fuera del repo). Requiere `BACKUP_DIR` externo al repo; aplica permisos privados y elimina passfiles temporales. Opcionalmente, `RESTORE_CHECK_URL` apunta a PostgreSQL local: una base temporal aleatoria recibe el restore, compara conteos por tabla y se elimina al finalizar. `npm run verify:postgres-backup` vuelve a verificar una copia existente con `VERIFY_BACKUP_ARCHIVE`, `VERIFY_BACKUP_MANIFEST`, la clave y un `RESTORE_CHECK_URL` local.

El flujo crea y verifica un artefacto, pero no lo copia por sí mismo a almacenamiento independiente ni administra rotación/custodia de claves. Tras el corte del 2026-10-01 sigue pendiente custodiar una copia independiente fuera de este equipo y demostrar su restauración.

## Actualización del flujo de rúbrica (2026-09-30)

DEC-006 sustituye el flujo anterior de propuesta/aprobación para rúbrica C.A.: Evaluar trabaja por grupo, clasifica comentarios de sesiones impartidas en cinco criterios 1–10 y guarda automáticamente en Evaluada_ai (versión 2026-09-v4). Sin comentarios relacionados se asigna 10; puntualidad también usa cantidad y fechas de retardos registrados del alumno en el parcial, una vez por sesión impartida. El job persiste progreso y el hash permite actualizar evidencias modificadas. La matriz copia cinco puntuaciones, promedio y equivalente al 10 % sin nombres/encabezados. Otros flujos de revisión humana conservan su comportamiento. Véase RUBRIC_MATRIX_CHANGE.md para evidencia y límites.

## Arquitectura actual

### Aplicación web

Next.js App Router sirve el portal desde `/`. Si existe una cookie docente válida, renderiza `TeacherDashboard`; en caso contrario, renderiza `StudentExamPortal`. `/alumno` y `/docente/ingresar` redirigen a `/`; `/docente/probar` requiere sesión docente.

Las API Routes en `app/api/` median entre navegador y servicios: acceso estudiantil/docente, exámenes, resultados, académico, rúbrica C.A. y autoría. La autenticación y el cliente de Sheets viven en `lib/teacher-auth.ts` y `lib/sheets-bridge.ts`.

### Autenticación y límites

- La sesión docente es un token HMAC sin estado del servidor, con expiración de ocho horas, guardado en cookie `HttpOnly` y `SameSite=Strict`; en Producción también usa `Secure`.
- El acceso estudiantil consulta el padrón de la fuente seleccionada (`Google Sheets` o `PostgreSQL`) usando el ID escolar. En local, el padrón de las 172 filas de `Registros` fue importado y reconciliado en Docker. No hay una contraseña individual de alumno en este flujo; se mantiene así temporalmente por decisión del usuario.
- Las rutas docentes verifican la cookie antes de invocar operaciones protegidas.
- El Web App de Apps Script está configurado para ejecutarse como quien lo despliega y admitir llamadas anónimas. `doPost` valida `BRIDGE_TOKEN` desde Script Properties antes de ejecutar una acción. Los secretos no se leen desde el cliente.

### Flujo de datos e integraciones

```text
Navegador
  └─ Next.js página/API Routes en Vercel
       ├─ DATA_BACKEND=sheets → lib/sheets-bridge.ts → Web App Apps Script → Google Sheets "Docencia" y Gemini (legado)
       └─ DATA_BACKEND=postgres → servicios PostgreSQL → Docker local o Neon Production
                                   └─ Gemini directo desde servidor con clave de entorno
```

Los flujos migrados gradualmente usan un backend alternativo seleccionado por `DATA_BACKEND=postgres`:

```text
Navegador
  └─ Next.js páginas/API Routes
       └─ servicios PostgreSQL en lib/ y cliente Drizzle en db/
            ├─ Docker PostgreSQL 18 durante desarrollo local
            └─ Neon PostgreSQL Production desde Vercel
```

La carga del 2026-10-01 fue una copia puntual de la base PostgreSQL local hacia Neon Production; no creó sincronización continua con Docker ni con Sheets. `PROJECT_STATE.md` registra conteos, verificación de restauración y límites de ese hito.

`Docencia` usa zona `America/Mexico_City`. La hoja viva tiene 20 pestañas: padrón/configuración, parciales, sesiones, asistencia, tareas, conducta/actitud, exámenes, intentos/respuestas, evaluaciones, reportes, auditoría y salida Innovat. Sus nombres y encabezados se leyeron el 2026-09-30; el 2026-10-01 se releyeron encabezados y datos para reconciliar e importar la copia local. Los valores de filas escolares no se registran en esta documentación.

`project.config.json` conserva una versión anterior del esquema. El 2026-09-30 se comparó su lista con los encabezados actuales de las 20 pestañas; faltan `EXAMEN_ASIGNACIONES` y columnas añadidas en varias tablas. La búsqueda del repositorio no encontró código que consuma ese archivo. `sheets.schemaStatus` lo marca como `historical_non_authoritative`; no lo uses para operaciones basadas en esquema ni cambies la hoja basándote en él.

### Flujos de producto

- **Parciales:** el selector docente muestra los periodos cargados. `Nuevo parcial` pide nombre y ciclo; con `DATA_BACKEND=postgres`, `/api/teacher/academic` inserta los valores iniciales y la auditoría en una transacción, serializa la detección de nombres repetidos y el orden con un advisory lock, y devuelve la matriz actualizada. La operación usa `ProgressOverlay` y selecciona el parcial recién creado. Con backend Sheets se conserva la acción existente de Apps Script.
- **Sesión académica:** `TeacherAcademicModule` usa el parcial/grupo seleccionado para capturar sesiones, asistencia `P/I/R`, actividades y comentarios; Apps Script o PostgreSQL valida y guarda según `DATA_BACKEND`.
- **Calificación:** `lib/academic-engine.ts` calcula indicadores y parcial; el puente persiste snapshots. La nota implementada pondera EC 40%, C.A. 10% y examen 50%.
- **Rúbrica C.A.:** el docente selecciona grupo/parcial. Con Sheets, Apps Script filtra pendientes, guarda el trabajo en Script Properties y programa un trigger de un minuto; con PostgreSQL, `background_jobs` persiste el progreso y la UI o el worker procesan la cola recuperable. En ambos casos la evaluación se guarda automáticamente; sus criterios y fundamentos se pueden revisar sin un paso de aprobación separado.
- **Exámenes:** el docente importa `.docx`, obtiene texto en el servidor, genera y revisa el borrador antes de publicar; los alumnos inician intentos, guardan respuestas y envían. Apps Script controla estados/tiempos y persiste las respuestas en Sheets; las preguntas cerradas se califican automáticamente y Gemini evalúa preguntas abiertas según el flujo configurado. Resultados se consultan mediante rutas protegidas.
- **Retroalimentación y salida externa:** informes de IA requieren revisión docente; Innovat se representa como cola en Sheets. El código documentado no demuestra un envío externo de esa cola.

### Detalle de evaluación y captura

- Cada parcial es independiente y puede crearse desde el panel docente. `Días` cuenta sesiones impartidas y `Faltas` cuenta sólo inasistencias; son indicadores informativos y no descuentan puntos de la nota final.
- La sesión permite guardar una captura parcial, cerrarla cuando se completa la asistencia y reabrirla para corregirla. La asistencia se representa como `P` (asistencia), `I` (inasistencia) o `R` (retardo). La captura actual registra comentarios, no una calificación de C.A. por sesión; el puente conserva compatibilidad con clientes anteriores que envíen ese campo.
- `Agregar tarea` guarda el encargo en el banco del grupo y parcial. En una sesión posterior, el docente selecciona tareas pendientes para calificarlas; los trabajos hechos en clase se agregan directamente a esa sesión.
- Sólo las tareas agregadas para calificación participan en EC. Una tarea en revisión mantiene el componente pendiente; `No_entregada` se trata como cero y `Justificada` no penaliza. Las actividades históricas mantienen la regla anterior de vencimiento.
- EC admite los modos `Promedio` de actividades elegibles y `Ponderado` por porcentaje asignado a cada actividad. C.A. proviene de propuestas de la rúbrica de conducta y actitud, generadas por alumno en un trabajo de fondo del grado/parcial a partir de comentarios y retardos disponibles. La evaluación C.A. guarda sus resultados automáticamente y no requiere una aprobación manual separada; criterios y fundamentos permanecen disponibles para revisión docente.
- EX integra exámenes publicados y asignados del mismo parcial. Si un intento está pendiente de revisión de IA, EX permanece pendiente. La nota final usa `CA × 10% + EC × 40% + EX × 50%`; queda pendiente si falta un componente requerido. Las ponderaciones configuradas en `PARCIALES` reflejan EC 40%, C.A. 10% y EX 50%.

### Pestañas de la hoja

La hoja `Docencia` observada contiene estas 20 pestañas. La lista y sus encabezados se verificaron el 2026-09-30 sin leer filas de alumnos.

| Pestaña | Función documentada |
| --- | --- |
| `Registros` | Padrón de alumnos y grupo. |
| `CONFIG` | Ciclo, materia, docente, zona horaria y reglas generales. |
| `PARCIALES` | Periodos de evaluación y ponderaciones. |
| `SESIONES_CLASE` | Sesiones impartidas. |
| `ASISTENCIAS` | Asistencia por alumno y sesión. |
| `TAREAS` | Actividades y encargos. |
| `CALIFICACIONES_TAREAS` | Entregas y calificaciones de actividades. |
| `CONDUCTA_ACTITUD` | Observaciones, comentarios, propuestas de rúbrica y puntuaciones aprobadas. |
| `EXAMENES` | Exámenes configurados/publicados. |
| `REACTIVOS` | Reactivos y claves/rúbricas asociadas. |
| `EXAMEN_ASIGNACIONES` | Asignaciones por grupo o alumno. |
| `INTENTOS` | Intentos de alumnos. |
| `RESPUESTAS` | Respuestas por reactivo. |
| `EVALUACION_AI` | Evaluaciones asistidas por IA. |
| `EVALUACIONES` | Resultados de evaluación por parcial. |
| `CALIFICACIONES` | Consolidación de resultados por parcial y publicación. |
| `REPORTES_AI` | Borradores y aprobaciones de retroalimentación. |
| `INNOVAT_SALIDA` | Cola de datos preparados para el sistema externo Innovat. |
| `EVENTOS` | Auditoría de cambios y acciones importantes. |
| `ACCESOS` | Pestaña existente; el flujo de autenticación web observado no la consulta. |

La lista describe el esquema observado, no autoriza cambios directos en la hoja. `project.config.json` es anterior a este esquema y omite columnas y `EXAMEN_ASIGNACIONES`; véase `DOC-001` en [TODO.md](TODO.md).

### Acceso docente y portal estudiantil

La ruta principal `/` sirve ambos accesos: el ID escolar abre los exámenes asignados y la contraseña docente abre el panel. `/alumno` y `/docente/ingresar` redirigen a `/`. `/docente/probar` permite revisar la presentación de exámenes sin guardar respuestas ni alterar calificaciones; no prueba persistencia.

La cookie firmada de sesión docente usa atributos `HttpOnly`, `Secure` en Producción y `SameSite=Strict`, con duración de ocho horas. `Salir` cierra la sesión del navegador. El inicio docente usa `TEACHER_PASSWORD` y `TEACHER_SESSION_SECRET` configurados como variables sensibles de Production en Vercel. El secreto de sesión debe ser aleatorio y de al menos 32 bytes; ninguno de estos valores debe ir a Git ni a variables `NEXT_PUBLIC_`.

### Exámenes digitales y autoría

Los exámenes se configuran por parcial, grado/grupo, duración y reactivos. El módulo de autoría recibe dos documentos `.docx` (examen y guía/rúbrica), extrae texto en el servidor mediante Mammoth y pide a Gemini un borrador. La salida normaliza el puntaje total a 100, señala consignas que no coinciden literalmente con el texto fuente y adjunta advertencias. La docente debe revisar consignas, respuestas y rúbricas, guardar un borrador y aprobarlo antes de publicar. Cada revisión crea un examen/versionado separado; no reasigna ni sobrescribe intentos históricos.

Al iniciar un intento, el servidor conserva las respuestas y el límite temporal. El envío se persiste antes de evaluarse para permitir recuperación. Las claves de opción cerrada se normalizan por posición (`A`, `B`, `C`, …); las respuestas abiertas pueden quedar pendientes de revisión de IA/docente. Un examen enviado queda bloqueado hasta que la docente lo revoque.

El panel consulta `INTENTOS` y `RESPUESTAS` por grupo, examen y estado, con detalle por reactivo. `Revocar examen` busca alumnos con exámenes entregados, muestra el alumno/examen seleccionado y pide confirmación antes de ejecutar. La sesión docente vigente autoriza la operación, sin otra contraseña. La revocación elimina intentos entregados, respuestas, calificaciones por reactivo, calificación total y evaluaciones de IA de ese alumno para el examen; conserva el evento en `EVENTOS` y la asignación, para permitir otro intento. Las asignaciones individuales en `EXAMEN_ASIGNACIONES` tienen prioridad sobre el filtro ordinario por grado/grupo.

### Gemini, reportes y salida Innovat

El puente de Apps Script ejecuta como la cuenta propietaria de la hoja. Sus Script Properties incluyen `SPREADSHEET_ID`, `BRIDGE_TOKEN`, `EXAM_UNLOCK_PASSWORD`, `GEMINI_API_KEY` y `GEMINI_MODEL`. La docente configura Gemini desde el panel; la web sólo indica si existe una clave, sin leerla. La clave se transmite al puente y las respuestas abiertas se evalúan allí. El modelo inicial documentado es `gemini-3.6-flash`; el propietario debe ejecutar `authorizeGeminiConnection` una vez desde el editor Apps Script para autorizar el acceso a Sheets y solicitudes externas. Las credenciales permanecen en Script Properties.

La retroalimentación pedagógica se genera por alumno/parcial y se conserva como borrador privado en `REPORTES_AI`; sólo se muestra al alumno después de aprobación docente. La preparación de salida Innovat se retiró del runtime local el 2026-10-01: la UI, la acción API, el servicio PostgreSQL y la acción del puente Apps Script ya no crean filas en `INNOVAT_SALIDA`. Se conserva la tabla y su mapeo de importación para proteger registros existentes. La capa de proveedores de IA pasa por `requestAiJson_`; Gemini es el proveedor activo documentado.

### Datos y secretos

El identificador de la hoja, el token del puente, la contraseña de desbloqueo y la configuración Gemini residen en Script Properties/variables de entorno según el servicio. Con PostgreSQL, el servidor usa `GEMINI_API_KEY`/`GEMINI_MODEL`; no traslada la clave desde Apps Script. `TEACHER_PASSWORD` y `TEACHER_SESSION_SECRET` son variables sensibles de Vercel. Los nombres se documentan en `.env.example`; sus valores no pertenecen al repositorio.

El acceso y las escrituras de la hoja se realizan en Apps Script como cuenta desplegadora. La autorización por pantalla no sustituye las validaciones de `doPost`, rutas y handlers del servidor. Sheets y Git tienen copias e historial distintos; el checkout Git no es backup de datos.

## Arquitectura objetivo

La arquitectura objetivo autorizada por el usuario el 2026-09-30 es Next.js/TypeScript con PostgreSQL local en Docker y PostgreSQL de Producción en Neon. La migración será gradual; el corte depende de aceptación, backup independiente restaurable y plan de reversión.

### Estado de transición

- Producción continúa en Vercel → Apps Script → Google Sheets. No se cambió su backend ni se importaron datos a Neon o a Producción. La copia reconciliada de 868 filas está sólo en Docker local.
- En local, `DATA_BACKEND=postgres` activa repositorios PostgreSQL; Sheets es el backend predeterminado. En deployments `VERCEL_ENV=production`, `getDataBackend()` rechaza `DATA_BACKEND=postgres` salvo que `POSTGRES_PRODUCTION_CUTOVER_APPROVED=YES`; esa bandera sólo se debe establecer después de cerrar las puertas de aceptación, respaldo independiente restaurable y reversión. Los servidores locales `next start` y deployments Preview no se bloquean por esta puerta.
- `lib/student-access.ts` migra `/api/access` y `/api/student/lookup`; el padrón local está cargado desde `Registros`. `lib/student-academic.ts` migra la lectura de `/api/student/academic`. La matriz usa el cálculo compartido `lib/academic-engine.ts`.
- `lib/teacher-session-postgres.ts` implementa en PostgreSQL la apertura idempotente de sesión, creación de tareas/trabajos, asignación segura de tareas pendientes a una sesión y guardado transaccional de asistencia, comentarios y calificaciones. `GET /api/teacher/academic` devuelve un snapshot de Postgres y `POST` sólo acepta estas acciones migradas cuando `DATA_BACKEND=postgres`; las acciones aún no migradas devuelven error explícito sin fallback a Sheets. La autenticación de docente se conserva.
- El mismo módulo PostgreSQL admite los controles visibles de calificaciones para modo EC (`Promedio`/`Ponderado`) y pesos por actividad, además de cancelar sesiones y retirar tareas/trabajos con baja lógica. Cada operación valida el parcial/grupo/actividades, conserva registros históricos y deja auditoría; la API recalcula los snapshots del parcial al terminar.
- Las acciones de retiro se presentan como archivo: las actividades inactivas y sesiones canceladas aparecen en el menú docente `Archivados`, en una lista conjunta de sólo consulta para todos los parciales. Archivar una sesión también retira sus tareas/trabajos de origen o calificados en ella de los cálculos activos; asistencias, comentarios y calificaciones permanecen guardados. Aún no hay restauración desde este listado.
- En PostgreSQL, las mutaciones académicas admitidas vuelven a calcular y guardan snapshots por alumno/parcial en `grades`, incluyendo el detalle EC y la versión de cálculo. El guardado es idempotente, valida alumnos, rangos y duplicados, y se protege con índice único por parcial/alumno; envíos, reevaluaciones y revocaciones de examen también actualizan el snapshot relacionado. La matriz y el portal estudiantil leen el mismo resultado persistido.
- `lib/ca-rubric-postgres.ts` implementa la evaluación por hash de evidencia, la persistencia automática y el progreso recuperable en `background_jobs`. `functions/ca-rubric-worker.ts` usa esa misma lógica para drenar hasta seis alumnos por invocación programada de Neon Functions; el trigger sólo debe habilitarse después de configurar la clave de Gemini en esa función. En Docker, el cliente autenticado conserva el avance inmediato mientras la UI está abierta. Gemini se llama exclusivamente en servidor mediante `GEMINI_API_KEY`/`GEMINI_MODEL`; los secretos no se exponen ni se sincronizan desde Apps Script. La función Neon está en validación de desarrollo y no está conectada a Producción.
- `lib/exam-attempt-postgres.ts` implementa localmente inicio/reanudación, autosave, bloqueo por pérdida de foco, desbloqueo con ampliación del tiempo, aceptación idempotente del envío y persistencia de resultado. Las respuestas objetivas se califican en PostgreSQL. Las abiertas se encolan por intento/reactivo; el proveedor servidor puede evaluarlas, y si no termina quedan `Provisional` para revisión docente. La acción existente de revisión usa `reevaluateOpenAnswerInPostgres` al seleccionar “Re-evaluar con IA”; vuelve a dejar el resultado provisional si Gemini falla y finaliza el intento cuando ya no queden preguntas pendientes. `GET /api/teacher/results` sirve las listas y respuestas desde Postgres, y ambas rutas conservan la sesión docente. La revocación local usa una transacción que borra intentos terminales y sus respuestas/evaluaciones, conserva asignación y evento de auditoría; el endpoint exige sesión docente y mantiene el `ProgressOverlay`. Pruebas locales con datos y credenciales sintéticas verificaron el endpoint autenticado y la persistencia/auditoría; no consumieron Gemini.
- `lib/exam-authoring-postgres.ts` implementa en modo PostgreSQL la generación de borrador desde texto extraído de `.docx`, validación de reactivos, guardado versionado y publicación tras revisión. El prompt trata los documentos como datos no confiables y mantiene las consignas fuente como referencia literal; puntajes se normalizan a 100 y las claves se canonicalizan/validan. El guardado crea cada versión y sus reactivos atómicamente, serializa el número de versión concurrente con un advisory lock y audita guardado/publicación. Gemini usa sólo la clave de servidor `GEMINI_API_KEY`; sin ella la generación devuelve error claro y no recurre a Apps Script. `npm run test:exam-authoring` verifica el prompt mediante evaluador falso, validación, versiones concurrentes, publicación, auditoría y autenticación HTTP docente local; no llamó a Gemini.
- La implementación local de preparación Innovat descrita en el historial del proyecto se retiró el 2026-10-01 por solicitud del usuario. El esquema y la reconciliación/importación de `INNOVAT_SALIDA` permanecen para conservar datos históricos; no se generan nuevas salidas desde Docencia.
- La generación, revisión y publicación de reportes académicos están migradas localmente a PostgreSQL. La captura manual de notas que no pase por calificaciones de tareas y la aceptación completa de la UI docente de autoría siguen pendientes; Producción continúa usando Apps Script/Sheets mientras la bandera no cambie.
- Neon `production` no recibió cambios ni tiene tablas públicas de Docencia. `docencia-migration-dev` recibió el esquema y conserva fixtures sintéticos de un ensayo de examen; no se importó el padrón real allí. El esquema de aplicación tiene 21 tablas y 32 claves foráneas sin borrado en cascada. La importación de la hoja ya fue reconciliada en Docker local; antes de Neon se debe ensayar su carga aislada y seguir analizando unicidad, posibles huérfanos, backup y reversión.
- No habilitar Neon en Producción hasta completar recorridos de lectura/escritura, autenticación y autorización, pruebas de consistencia, respaldo restaurable y reversión que preserve escrituras posteriores al corte.
