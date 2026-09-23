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

Los pesos no se fijan por código: se guardarán en la configuración del parcial para que la docente pueda definirlos. La calificación total se calculará en servidor cuando exista el puente con Google Sheets y la autenticación docente.

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

## Exámenes digitales

La vista de alumno está en `/alumno`. Los tres exámenes publicados se normalizaron a 100 puntos, con máximo de 50 minutos, reactivos cerrados de autocalificación y reactivos abiertos pendientes de IA/revisión docente. La previa local reconoce `DEMO-1`, `DEMO-2` y `DEMO-3`; los IDs reales sólo se habilitan cuando `GOOGLE_SHEETS_BRIDGE_URL` y `GOOGLE_SHEETS_BRIDGE_TOKEN` están configurados en Vercel.

El panel docente incluye `Revocar examen`. La operación requiere la contraseña docente configurada, elimina los intentos, respuestas y evaluaciones de IA del alumno para el examen seleccionado, conserva el evento de auditoría en `EVENTOS` y deja vigente la asignación para que el alumno pueda volver a presentarlo. Las asignaciones individuales se registran en `EXAMEN_ASIGNACIONES` y tienen prioridad sobre el filtro ordinario de grado y grupo.

Para activar persistencia real, despliega `integrations/google-sheets-bridge/Code.gs` como aplicación web ejecutada por la cuenta propietaria de la hoja y configura en sus propiedades `SPREADSHEET_ID`, `BRIDGE_TOKEN` y `EXAM_UNLOCK_PASSWORD`. En Vercel configura la URL de implementación, el mismo token, la clave de Gemini y la contraseña de desbloqueo. Ninguno de esos valores debe entrar al repositorio ni al navegador.

El despliegue de producción se realizará desde la rama `main` en Vercel. Las variables sensibles, cuando se agreguen, deben configurarse en Vercel y no en el repositorio.
