# Decisiones duraderas

## DEC-001 — Mantener la arquitectura operativa Sheets + Apps Script + Vercel

- **Fecha / estado:** 2026-09-30 · Aceptada; describe el sistema actual.
- **Contexto:** Docencia ya opera con una aplicación Next.js en Vercel, Apps Script y la hoja Google Sheets `Docencia`.
- **Opciones consideradas:** mantener el stack operativo; planear una migración a otra base/proveedor en una iniciativa independiente.
- **Decisión y razón:** conservar el stack que usa Producción. Esta adopción documental no autoriza migraciones.
- **Consecuencias:** Sheets es la fuente operativa; Apps Script valida y escribe; Vercel atiende la aplicación; el código en Git no respalda los datos de Sheets.
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

- **Fecha / estado:** 2026-09-30 · Aceptada para esta fase; adopción completa pendiente del piloto.
- **Contexto:** futuros agentes necesitan contexto persistente y cierre trazable sin depender de conversaciones.
- **Opciones consideradas:** conservar sólo memoria de chat; copiar íntegro el estándar; adoptar sus responsabilidades y enlazar la fuente.
- **Decisión y razón:** mantener documentos propios del proyecto bajo `project-methodology/`, enlazar la metodología canónica y no copiarla ni imponer su stack, herramientas o identidad visual.
- **Consecuencias:** la primera versión de adopción había dejado los documentos específicos del producto en la raíz; esta corrección los reubica a la estructura indicada por v1.0, elimina la duplicación y mantiene `AGENTS.md` como puerta de entrada. No se declara adopción completa hasta ejecutar un piloto y revisar su resultado.
- **Alcance / revisión:** documentación del repositorio Docencia. Revisar tras el piloto o cuando cambie la fuente/versionado del estándar.
- **Referencia exacta consultada:** `alexsennin/alex-development-standard/standards/v1.0/`, commit `e0c356e219771cbab456fed8e52aa6a86f40a70d`.
