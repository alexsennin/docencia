# Arquitectura

## Arquitectura actual

### Aplicación web

Next.js App Router sirve el portal desde `/`. Si existe una cookie docente válida, renderiza `TeacherDashboard`; en caso contrario, renderiza `StudentExamPortal`. `/alumno` y `/docente/ingresar` redirigen a `/`; `/docente/probar` requiere sesión docente.

Las API Routes en `app/api/` median entre navegador y servicios: acceso estudiantil/docente, exámenes, resultados, académico, rúbrica C.A. y autoría. La autenticación y el cliente de Sheets viven en `lib/teacher-auth.ts` y `lib/sheets-bridge.ts`.

### Autenticación y límites

- La sesión docente es un token HMAC sin estado del servidor, con expiración de ocho horas, guardado en cookie `HttpOnly` y `SameSite=Strict`; en Producción también usa `Secure`.
- El acceso estudiantil consulta el padrón de Google Sheets usando el ID escolar. No hay una contraseña individual de alumno en este flujo; se mantiene así temporalmente por decisión del usuario.
- Las rutas docentes verifican la cookie antes de invocar operaciones protegidas.
- El Web App de Apps Script está configurado para ejecutarse como quien lo despliega y admitir llamadas anónimas. `doPost` valida `BRIDGE_TOKEN` desde Script Properties antes de ejecutar una acción. Los secretos no se leen desde el cliente.

### Flujo de datos e integraciones

```text
Navegador
  └─ Next.js página/API Routes en Vercel
       └─ lib/sheets-bridge.ts (token sólo servidor)
            └─ Web App Apps Script (V8, deployment versionado)
                 ├─ Google Sheets "Docencia" (fuente operativa)
                 └─ Gemini API (evaluaciones y generación asistida)
```

`Docencia` usa zona `America/Mexico_City`. La hoja viva tiene 20 pestañas: padrón/configuración, parciales, sesiones, asistencia, tareas, conducta/actitud, exámenes, intentos/respuestas, evaluaciones, reportes, auditoría y salida Innovat. Sus nombres y encabezados se leyeron el 2026-09-30; no se leyeron datos de alumnos.

`project.config.json` conserva una versión anterior del esquema. El 2026-09-30 se comparó su lista con los encabezados actuales de las 20 pestañas; faltan `EXAMEN_ASIGNACIONES` y columnas añadidas en varias tablas. La búsqueda del repositorio no encontró código que consuma ese archivo. `sheets.schemaStatus` lo marca como `historical_non_authoritative`; no lo uses para operaciones basadas en esquema ni cambies la hoja basándote en él.

### Flujos de producto

- **Sesión académica:** `TeacherAcademicModule` usa el parcial/grupo seleccionado para capturar sesiones, asistencia `P/I/R`, actividades y comentarios; el puente valida y guarda en Sheets.
- **Calificación:** `lib/academic-engine.ts` calcula indicadores y parcial; el puente persiste snapshots. La nota implementada pondera EC 40%, C.A. 10% y examen 50%.
- **Rúbrica C.A.:** el docente selecciona grado/parcial. Apps Script filtra pendientes, guarda el trabajo en Script Properties y programa un trigger de un minuto. Cada ejecución procesa hasta tres alumnos; el cursor y errores se conservan. Al terminar, la interfaz consulta estado/progreso. Las propuestas deben ser revisadas y aprobadas por la docente.
- **Exámenes:** el docente importa `.docx`, obtiene texto en el servidor, genera y revisa el borrador antes de publicar; los alumnos inician intentos, guardan respuestas y envían. Apps Script controla estados/tiempos y persiste las respuestas en Sheets; las preguntas cerradas se califican automáticamente y Gemini evalúa preguntas abiertas según el flujo configurado. Resultados se consultan mediante rutas protegidas.
- **Retroalimentación y salida externa:** informes de IA requieren revisión docente; Innovat se representa como cola en Sheets. El código documentado no demuestra un envío externo de esa cola.

### Detalle de evaluación y captura

- Cada parcial es independiente y puede crearse desde el panel docente. `Días` cuenta sesiones impartidas y `Faltas` cuenta sólo inasistencias; son indicadores informativos y no descuentan puntos de la nota final.
- La sesión permite guardar una captura parcial, cerrarla cuando se completa la asistencia y reabrirla para corregirla. La asistencia se representa como `P` (asistencia), `I` (inasistencia) o `R` (retardo). La captura actual registra comentarios, no una calificación de C.A. por sesión; el puente conserva compatibilidad con clientes anteriores que envíen ese campo.
- `Agregar tarea` guarda el encargo en el banco del grupo y parcial. En una sesión posterior, el docente selecciona tareas pendientes para calificarlas; los trabajos hechos en clase se agregan directamente a esa sesión.
- Sólo las tareas agregadas para calificación participan en EC. Una tarea en revisión mantiene el componente pendiente; `No_entregada` se trata como cero y `Justificada` no penaliza. Las actividades históricas mantienen la regla anterior de vencimiento.
- EC admite los modos `Promedio` de actividades elegibles y `Ponderado` por porcentaje asignado a cada actividad. C.A. proviene de propuestas de la rúbrica de conducta y actitud, generadas por alumno en un trabajo de fondo del grado/parcial a partir de comentarios y retardos disponibles. La docente revisa y aprueba cada propuesta; una propuesta pendiente o desactualizada no cuenta como aprobada.
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

La retroalimentación pedagógica se genera por alumno/parcial y se conserva como borrador privado en `REPORTES_AI`; sólo se muestra al alumno después de aprobación docente. `Preparar salida Innovat` registra calificaciones completas como estado `Pendiente` en `INNOVAT_SALIDA`; el comportamiento observado no realiza un envío de red al sistema Innovat. La capa de proveedores de IA pasa por `requestAiJson_`; Gemini es el proveedor activo documentado.

### Datos y secretos

El identificador de la hoja, el token del puente, la contraseña de desbloqueo y la configuración Gemini residen en Script Properties/variables de entorno según el servicio. `TEACHER_PASSWORD` y `TEACHER_SESSION_SECRET` son variables sensibles de Vercel. Los nombres se documentan en `.env.example`; sus valores no pertenecen al repositorio.

El acceso y las escrituras de la hoja se realizan en Apps Script como cuenta desplegadora. La autorización por pantalla no sustituye las validaciones de `doPost`, rutas y handlers del servidor. Sheets y Git tienen copias e historial distintos; el checkout Git no es backup de datos.

## Arquitectura objetivo

No hay una arquitectura objetivo aprobada diferente de la implementación descrita. Una migración o cambio de proveedor requiere decisión separada; no se infiere de la adopción del estándar.
