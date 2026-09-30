# Docencia

Aplicación de evaluación escolar de Español para el Instituto Santa María. La instancia operativa está en [`docencia.integratech.app`](https://docencia.integratech.app).

El repositorio `alexsennin/docencia` es privado. La rama `main`, el checkout local y Producción son estados separados: el deployment operativo se ha publicado directamente desde el checkout con Vercel CLI, por lo que `origin/main` no identifica necesariamente el código desplegado. Consulta [PROJECT_STATE.md](PROJECT_STATE.md) antes de asumir sincronización o publicar.

La base inicial es la hoja nativa de Google Sheets [`Docencia`](https://docs.google.com/spreadsheets/d/1YcnvSaHeIpZrbthI8rNOKIEJy0Z6QQ-06VCROS4Yh48/edit), con zona horaria `America/Mexico_City`. La estructura académica contempla parciales ilimitados, asistencia detallada, tareas, conducta y actitud, exámenes digitales, calificaciones consolidadas, reportes de IA, auditoría, accesos y una cola de salida para Innovat. El puente seguro de Apps Script está en `integrations/google-sheets-bridge/Code.gs`; sus propiedades y tokens se configuran fuera del repositorio.

## Estructura de evaluación

Cada parcial es independiente y se puede crear sin límite práctico desde el panel docente. El cálculo se realiza en servidor y se persiste en `CALIFICACIONES`:

- `Días` cuenta sesiones impartidas; `Faltas` cuenta sólo inasistencias registradas. Ambos son informativos y no descuentan puntos.
- La captura diaria se concentra en una sesión: pase de lista, comentarios individuales y columnas para actividades. La evaluación C.A. se maneja en el apartado separado `Rúbrica C.A.`. La sesión se puede guardar parcialmente, cerrar al completar asistencia y reabrir para corregir.
- `Agregar tarea` guarda el encargo en el banco del grupo y parcial, sin exigir fecha de calificación. En otra sesión, el docente selecciona las tareas pendientes cuando decida revisarlas; los trabajos en clase se agregan directamente a la sesión.
- Sólo una tarea agregada para calificación participa en EC. Una tarea en revisión mantiene EC pendiente; `No_entregada` vale cero y `Justificada` no penaliza. Las actividades históricas conservan la regla anterior de vencimiento.
- EC se configura por parcial: `Promedio` de actividades elegibles o `Ponderado` según el porcentaje asignado a cada actividad.
- C.A. se determina desde la rúbrica de conducta y actitud: se genera una propuesta por alumno como trabajo de fondo por grado/parcial, usando comentarios y retardos disponibles. La docente revisa y aprueba la propuesta; una rúbrica pendiente o desactualizada no se considera aprobada.
- EX se integra desde exámenes publicados/asignados del mismo parcial. Un intento provisional por revisión de IA mantiene EX pendiente.
- Nota final: `CA × 10% + EC × 40% + EX × 50%`; queda pendiente si falta algún componente.

En `PARCIALES`, los pesos efectivos quedan en EC 40%, CA 10% y EX 50%; los indicadores históricos de asistencia/días no intervienen en el cálculo.

## Pestañas de datos

- `Registros`: padrón de alumnos y grupo.
- `CONFIG`: ciclo, materia, docente, zona horaria y reglas generales.
- `PARCIALES`: periodos de evaluación y ponderaciones.
- `SESIONES_CLASE` y `ASISTENCIAS`: días impartidos y asistencia por alumno.
- `TAREAS` y `CALIFICACIONES_TAREAS`: actividades, entregas y tareas faltantes.
- `CONDUCTA_ACTITUD`: observaciones, comentarios, propuestas de rúbrica y puntuaciones aprobadas. La captura vigente de sesión no solicita una calificación C.A.; el puente conserva compatibilidad con clientes antiguos que aún envíen ese campo.
- La revisión general permite abrir una sesión del grupo/parcial y continuar su captura.
- `EXAMENES`, `REACTIVOS`, `EXAMEN_ASIGNACIONES`, `INTENTOS`, `RESPUESTAS` y `EVALUACION_AI`: ciclo completo del examen digital.
- `EVALUACIONES` y `CALIFICACIONES`: consolidación de resultados por parcial y publicación.
- `REPORTES_AI`: borradores, revisión docente y visibilidad de retroalimentación.
- `INNOVAT_SALIDA`: cola de datos preparados para el sistema externo.
- `EVENTOS`: auditoría de cambios y acciones importantes.
- `ACCESOS`: pestaña existente en la hoja. El flujo de autenticación web observado no la usa: la sesión docente se valida con variables sensibles de Vercel y el alumno accede por ID escolar.

## Desarrollo

```bash
npm install
npm run dev
```

## Verificación

```bash
npm run lint
npm run build
```

El checkout de trabajo revisado contiene además `npm run test:academic` y `tests/`, pero esos cambios están sin commit y no forman parte de `origin/main` ni de esta rama documental.

## Acceso docente

La ruta principal `/` es el único acceso: un ID escolar abre los exámenes asignados y la contraseña docente abre el panel. `/alumno` y `/docente/ingresar` redirigen a `/`. Una sesión firmada en una cookie `HttpOnly`, `Secure` y `SameSite=Strict` protege el panel y las rutas administrativas durante ocho horas. El botón `Salir` cierra la sesión del navegador.

Configura `TEACHER_PASSWORD` y `TEACHER_SESSION_SECRET` como variables sensibles de Production en Vercel. La primera contiene la clave compartida para iniciar sesión; la segunda debe ser un valor aleatorio de al menos 32 bytes. No incluyas ninguna de las dos en Git ni en variables `NEXT_PUBLIC_`.

## Exámenes digitales

Los exámenes se configuran por parcial, grado/grupo, duración y reactivos. El constructor produce un borrador para revisión docente antes de publicar. El intento conserva respuestas y límite temporal en servidor; los envíos se guardan antes de evaluarse para permitir recuperación. Las claves de opción cerrada se normalizan por posición (`A`, `B`, `C`…), y las respuestas abiertas pueden quedar pendientes de revisión de IA/docente. Un examen enviado queda bloqueado hasta que el docente lo revoque.

El panel docente consulta resultados de `INTENTOS` y `RESPUESTAS` por grupo, examen y estado, con desglose de cada reactivo. La vista `/docente/probar` permite revisar la presentación de exámenes sin guardar respuestas ni alterar calificaciones; no es una verificación de persistencia.

El panel docente incluye `Revocar examen`: busca alumnos con exámenes entregados en una caja única de texto y permite elegir una coincidencia y uno de sus exámenes completados; antes de ejecutar, muestra una confirmación de los datos que se eliminarán. La sesión docente vigente autoriza la operación, sin solicitar otra contraseña. Se eliminan todos los intentos entregados, respuestas, calificaciones por reactivo, calificación total y evaluaciones de IA de ese alumno para el examen seleccionado; se conserva el evento de auditoría en `EVENTOS` y queda vigente la asignación para que pueda volver a presentarlo. Las asignaciones individuales se registran en `EXAMEN_ASIGNACIONES` y tienen prioridad sobre el filtro ordinario de grado y grupo.

El código y la configuración de `clasp` del puente están en `integrations/google-sheets-bridge`. La aplicación web ejecuta como la cuenta propietaria de la hoja y usa propiedades privadas `SPREADSHEET_ID`, `BRIDGE_TOKEN`, `EXAM_UNLOCK_PASSWORD`, `GEMINI_API_KEY` y `GEMINI_MODEL`. La docente configura Gemini en el módulo del panel; la página sólo informa si existe una clave, nunca la lee. La clave se transmite al puente de Apps Script y las respuestas abiertas se evalúan allí. El modelo inicial es `gemini-3.6-flash`. El propietario debe ejecutar una vez `authorizeGeminiConnection` desde el editor Apps Script para autorizar el acceso a la hoja y las solicitudes externas. Ningún secreto debe entrar al repositorio ni al navegador.

## Constructor y reportes de IA

El módulo de exámenes recibe dos `.docx` (examen definitivo y guía/rúbrica), extrae texto en servidor y pide a Gemini un borrador. La salida normaliza los puntos a 100, marca consignas que no coinciden literalmente con el texto fuente y anota advertencias; la docente debe revisar respuestas, consignas y rúbricas, guardar la versión como borrador y aprobarla antes de publicarla. Cada revisión crea un examen/versionado separado; los intentos históricos no se reasignan ni se sobrescriben. Los proveedores de IA pasan por `requestAiJson_`; Gemini es el único activo por ahora y las credenciales permanecen en Script Properties.

El informe de retroalimentación pedagógica se genera por alumno/parcial, se conserva como borrador privado en `REPORTES_AI` y sólo aparece en el acceso del alumno cuando la docente lo aprueba. `Preparar salida Innovat` coloca las calificaciones completas en `INNOVAT_SALIDA` como cola `Pendiente`; no realiza un envío de red al sistema Innovat.

## Contexto para trabajo futuro

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md): propósito, stack, límites y mapa.
- [PROJECT_STATE.md](PROJECT_STATE.md): fotografía verificada del estado actual.
- [ARCHITECTURE.md](ARCHITECTURE.md): flujos, datos y responsabilidades.
- [TODO.md](TODO.md): pendientes con aceptación verificable.
- [DECISIONS.md](DECISIONS.md): decisiones duraderas y excepciones.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) y [TOKENS.md](TOKENS.md): observaciones de UI existentes.
- [AGENTS.md](AGENTS.md): reglas de trabajo y publicación.

Este proyecto adopta la fase documental inicial de [ALEX DEVELOPMENT STANDARD v1.0](https://github.com/alexsennin/alex-development-standard/tree/main/standards/v1.0). No se copia el estándar al repositorio; el piloto aún está pendiente.

Las variables sensibles de autenticación y del puente se configuran fuera del repositorio; Gemini conserva su clave exclusivamente en Script Properties de Apps Script. La hoja de Google es la fuente operativa, y Git no es un respaldo de sus datos.
