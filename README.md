# Docencia

Base inicial para [`docencia.integratech.app`](https://docencia.integratech.app).

El repositorio es privado en GitHub y el proyecto de Vercel usa la rama `main` como referencia de producción. El dominio `integratech.app` usa los nameservers de Vercel; no se modificaron registros ajenos a este proyecto.

La base inicial es la hoja nativa de Google Sheets [`Docencia`](https://docs.google.com/spreadsheets/d/1YcnvSaHeIpZrbthI8rNOKIEJy0Z6QQ-06VCROS4Yh48/edit), con zona horaria `America/Mexico_City`. La estructura académica contempla parciales ilimitados, asistencia detallada, tareas, conducta y actitud, exámenes digitales, calificaciones consolidadas, reportes de IA, auditoría, accesos y una cola de salida para Innovat. El puente seguro de Apps Script está en `integrations/google-sheets-bridge/Code.gs`; sus propiedades y tokens se configuran fuera del repositorio.

## Estructura de evaluación

Cada parcial es independiente y puede contener cuatro componentes configurables:

- `asistencias`: registro por fecha y alumno;
- `trabajos_clase` y `tareas`: actividades agrupadas dentro de `TAREAS`;
- `conducta` y `actitud`: valoración formativa y observaciones;
- `examen`: calificación del instrumento correspondiente al parcial.

Los pesos no se fijan por código: se guardarán en la configuración del parcial para que la docente pueda definirlos. La calificación total se calculará en servidor cuando se conecte la consolidación de resultados con Google Sheets.

## Pestañas de datos

- `Registros`: padrón de alumnos y grupo.
- `CONFIG`: ciclo, materia, docente, zona horaria y reglas generales.
- `PARCIALES`: periodos de evaluación y ponderaciones.
- `SESIONES_CLASE` y `ASISTENCIAS`: días impartidos y asistencia por alumno.
- `TAREAS` y `CALIFICACIONES_TAREAS`: actividades, entregas y tareas faltantes.
- `CONDUCTA_ACTITUD`: observaciones, infracciones, rúbrica y puntuación.
- `EXAMENES`, `REACTIVOS`, `EXAMEN_ASIGNACIONES`, `INTENTOS`, `RESPUESTAS` y `EVALUACION_AI`: ciclo completo del examen digital.
- `EVALUACIONES` y `CALIFICACIONES`: consolidación de resultados por parcial y publicación.
- `REPORTES_AI`: borradores, revisión docente y visibilidad de retroalimentación.
- `INNOVAT_SALIDA`: cola de datos preparados para el sistema externo.
- `EVENTOS`: auditoría de cambios y acciones importantes.
- `ACCESOS`: registro de roles y usuarios sin guardar contraseñas en texto plano.

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

## Acceso docente

La ruta principal `/` es el único acceso: un ID escolar abre los exámenes asignados y la contraseña docente abre el panel. `/alumno` y `/docente/ingresar` redirigen a `/`. Una sesión firmada en una cookie `HttpOnly`, `Secure` y `SameSite=Strict` protege el panel y las rutas administrativas durante ocho horas. El botón `Salir` cierra la sesión del navegador.

Configura `TEACHER_PASSWORD` y `TEACHER_SESSION_SECRET` como variables sensibles de Production en Vercel. La primera contiene la clave compartida para iniciar sesión; la segunda debe ser un valor aleatorio de al menos 32 bytes. No incluyas ninguna de las dos en Git ni en variables `NEXT_PUBLIC_`.

## Exámenes digitales

Los tres exámenes publicados se normalizaron a 100 puntos, con máximo de 50 minutos, reactivos cerrados de autocalificación y reactivos abiertos pendientes de IA/revisión docente. El puente de Sheets aplica un bloqueo atómico para impedir un segundo intento; si el mismo intento sigue activo, puede reanudarse con las respuestas y el reloj originales. Un examen enviado queda bloqueado hasta que el docente lo revoque.

El panel docente consulta resultados reales de `INTENTOS` y `RESPUESTAS` por grupo, examen y estado, con desglose de cada reactivo. La vista `/docente/probar` carga los tres exámenes reales para una simulación privada sin usar ID, guardar respuestas ni alterar calificaciones.

El panel docente incluye `Revocar examen`: busca alumnos con exámenes entregados por nombre y permite seleccionar uno de sus exámenes completados. La sesión docente vigente autoriza la operación, sin solicitar otra contraseña. Se eliminan los intentos entregados, respuestas y evaluaciones de IA de ese alumno para el examen seleccionado, se conserva el evento de auditoría en `EVENTOS` y queda vigente la asignación para que pueda volver a presentarlo. Las asignaciones individuales se registran en `EXAMEN_ASIGNACIONES` y tienen prioridad sobre el filtro ordinario de grado y grupo.

El código y la configuración de `clasp` del puente están en `integrations/google-sheets-bridge`. La aplicación web ejecuta como la cuenta propietaria de la hoja y usa propiedades privadas `SPREADSHEET_ID`, `BRIDGE_TOKEN`, `EXAM_UNLOCK_PASSWORD`, `GEMINI_API_KEY` y `GEMINI_MODEL`. La docente configura Gemini en el módulo del panel; la página sólo informa si existe una clave, nunca la lee. La clave se transmite al puente de Apps Script y las respuestas abiertas se evalúan allí. El modelo inicial es `gemini-3.6-flash`. El propietario debe ejecutar una vez `authorizeGeminiConnection` desde el editor Apps Script para autorizar el acceso a la hoja y las solicitudes externas. Ningún secreto debe entrar al repositorio ni al navegador.

La rama `main` conserva el código fuente y el despliegue de producción se publica en Vercel. Las variables sensibles se configuran en Vercel y no en el repositorio.
