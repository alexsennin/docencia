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

`project.config.json` describe una versión anterior del esquema: faltan columnas agregadas en varias pestañas y la pestaña `EXAMEN_ASIGNACIONES`. La búsqueda del repositorio no encontró código que consuma ese archivo. No lo uses para construir escrituras ni cambies la hoja basándote en él; ver tarea `DOC-001`.

### Flujos de producto

- **Sesión académica:** `TeacherAcademicModule` usa el parcial/grupo seleccionado para capturar sesiones, asistencia `P/I/R`, actividades y comentarios; el puente valida y guarda en Sheets.
- **Calificación:** `lib/academic-engine.ts` calcula indicadores y parcial; el puente persiste snapshots. La nota implementada pondera EC 40%, C.A. 10% y examen 50%.
- **Rúbrica C.A.:** el docente selecciona grado/parcial. Apps Script filtra pendientes, guarda el trabajo en Script Properties y programa un trigger de un minuto. Cada ejecución procesa hasta tres alumnos; el cursor y errores se conservan. Al terminar, la interfaz consulta estado/progreso. Las propuestas deben ser revisadas y aprobadas por la docente.
- **Exámenes:** el docente importa `.docx`, obtiene texto en el servidor, genera y revisa el borrador antes de publicar; los alumnos inician intentos, guardan respuestas y envían. Apps Script controla estados/tiempos y persiste las respuestas en Sheets; las preguntas cerradas se califican automáticamente y Gemini evalúa preguntas abiertas según el flujo configurado. Resultados se consultan mediante rutas protegidas.
- **Retroalimentación y salida externa:** informes de IA requieren revisión docente; Innovat se representa como cola en Sheets. El código documentado no demuestra un envío externo de esa cola.

### Datos y secretos

El identificador de la hoja, el token del puente, la contraseña de desbloqueo y la configuración Gemini residen en Script Properties/variables de entorno según el servicio. `TEACHER_PASSWORD` y `TEACHER_SESSION_SECRET` son variables sensibles de Vercel. Los nombres se documentan en `.env.example`; sus valores no pertenecen al repositorio.

El acceso y las escrituras de la hoja se realizan en Apps Script como cuenta desplegadora. La autorización por pantalla no sustituye las validaciones de `doPost`, rutas y handlers del servidor. Sheets y Git tienen copias e historial distintos; el checkout Git no es backup de datos.

## Arquitectura objetivo

No hay una arquitectura objetivo aprobada diferente de la implementación descrita. Una migración o cambio de proveedor requiere decisión separada; no se infiere de la adopción del estándar.
