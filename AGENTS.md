## Regla de respuesta para operaciones remotas

- Toda acción iniciada por el usuario que consulte o escriba datos mediante Apps Script/Google Sheets, Gemini u otro servicio remoto debe mostrar `ProgressOverlay` con un título y una explicación específicos para esa acción.
- Mantener el indicador durante toda la cadena de consultas y guardados; deshabilitar el envío repetido y proteger también el handler contra doble ejecución. Al finalizar, mostrar el resultado o el error en la pantalla.
- Clics locales (navegación, filtros, selección de panel o abrir/cerrar detalles) no llevan modal si no llaman un servicio.
- Excepción: el guardado automático y frecuente de respuestas durante un examen muestra estado visible en línea (`Guardando…` / `Guardado`), sin modal que interrumpa al alumno. El envío del examen conserva su pantalla de evaluación.
- Las cargas remotas automáticas deben ser evidentes con un estado de carga; al abrir por primera vez una sección bajo demanda, usar el mismo `ProgressOverlay`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Metodología y puerta de entrada

Este proyecto adopta **ALEX DEVELOPMENT STANDARD v1.0**.

- `SOURCE_REPO`: `alexsennin/alex-development-standard`
- `SOURCE_VERSION`: `standards/v1.0/`
- `TARGET_REPO`: `alexsennin/docencia`
- `TARGET_ROOT`: raíz de este checkout
- `TARGET_METHODOLOGY_DIR`: `project-methodology/`

La metodología central es únicamente de lectura durante las adopciones; su fuente autoritativa es el [repositorio ALEX](https://github.com/alexsennin/alex-development-standard/tree/main/standards/v1.0/). No copies ni adaptes sus documentos normativos dentro de Docencia. La memoria específica del producto vive en `project-methodology/`.

Antes de trabajar, lee:

- `project-methodology/PROJECT_CONTEXT.md`
- `project-methodology/PROJECT_STATE.md`
- `project-methodology/ARCHITECTURE.md`
- `project-methodology/TODO.md`
- `project-methodology/DECISIONS.md`

Para UI, lee también `project-methodology/design/`. La adopción de ALEX DEVELOPMENT STANDARD v1.0 y su piloto de Nivel 1 (`DOC-001`) quedaron completados el 2026-09-30; consulta `project-methodology/PROJECT_STATE.md` para el alcance y la evidencia. Esto no autoriza cambios en Producción.

## Reglas propias del proyecto

- La referencia operativa es Producción en `https://docencia.integratech.app`; la hoja `Docencia` de Google Sheets es la fuente operativa de datos. `project.config.json` no se usa desde código y su esquema está marcado histórico/no autoritativo; consulta los encabezados de la hoja viva antes de basar operaciones en un esquema.
- El árbol local y `origin/main` no necesariamente representan lo desplegado. El usuario pidió trabajar directamente en Producción y pausar GitHub; su instrucción del 2026-09-30 autoriza una rama, commits y push exclusivamente para esta adopción documental. No incluyas cambios funcionales preexistentes, no mergees ni despliegues. Para cualquier otro trabajo, no crees commits, ramas remotas, PR ni pushes sin una nueva instrucción explícita. No despliegues cambios documentales.
- El acceso estudiantil por ID se conserva temporalmente por instrucción del usuario. No lo cambies como parte de otra tarea; registra el riesgo y espera una solicitud específica para cambiar esa decisión.
- Toda acción iniciada por el usuario que consulte o escriba Apps Script, Google Sheets, Gemini u otro servicio remoto debe seguir la regla `ProgressOverlay` al inicio de este archivo. El autoguardado de exámenes conserva su estado visible en línea y el envío mantiene su pantalla de evaluación.
- Mantén secretos en variables sensibles de Vercel o Script Properties de Apps Script. No copies filas de alumnos, calificaciones, credenciales ni tokens a documentación, logs o fixtures.

## Comandos y operaciones

En `origin/main`, `package.json` declara `npm run dev`, `npm run build`, `npm run start` y `npm run lint`. El checkout sucio revisado añade `npm run test:academic` y `tests/`, pero esos archivos no forman parte de la rama de adopción documental. Ejecuta sólo las comprobaciones pertinentes al cambio e informa cuáles no corriste. Un build no demuestra persistencia ni recorrido de usuario.

El puente de Apps Script está en `integrations/google-sheets-bridge/`. `clasp deployments` consulta sus despliegues; `clasp push`, `clasp version` y `clasp deploy -i <deployment-existente> -V <version>` escriben en el proyecto o deployment remoto. Antes de usarlos, compara el archivo local con el origen vivo y confirma que la tarea autoriza ese cambio. Actualiza el deployment existente; no crees otra URL por accidente.

Vercel se publica con la CLI del proyecto (`npx --yes vercel@60.0.0 deploy --prod --yes --scope team_vBGSim0Om0qNR6PJXwpuSvow`) y se verifica con `vercel inspect`, el dominio, rutas y recorridos pertinentes. La instrucción de Producción directa no convierte una tarea documental en autorización para publicar. No supongas que un push a `main` actualiza Producción.

## Cierre local

Al entregar, indica objetivo, rutas modificadas, evidencia y límites, rama/HEAD, estado sucio y cambios ajenos, remoto, despliegue/Producción y siguiente paso. Distingue código implementado, publicado en Git, desplegado y verificado en Producción.
