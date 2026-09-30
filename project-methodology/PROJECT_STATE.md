# Estado actual

Fecha de actualización: 2026-09-30.

## Estado del producto

Docencia está activa en Producción en [docencia.integratech.app](https://docencia.integratech.app). El panel docente, la captura académica por sesión, la rúbrica C.A. por grado, la autoría y aplicación de exámenes, la matriz de resultados y la consulta académica estudiantil están implementados en el código que se publicó.

La rúbrica por grado usa un trabajo temporizado de Apps Script y Script Properties para conservar cursor/progreso; el navegador consulta el estado. Los comentarios y retardos alimentan una propuesta, que requiere aprobación docente antes de afectar C.A.

## Verificación conocida

- Vercel: el 2026-09-30 `vercel inspect` confirmó el deployment `dpl_FYKWrwwamiQ18G5DDKT8yReas4cG` en `READY`, alias `docencia.integratech.app`, target `production`, creado el 2026-09-30 06:17 (America/Mexico_City). La portada respondió HTTP 200 y `/api/teacher/results` respondió 401 sin sesión en la verificación anterior. Esto no demuestra el recorrido docente autenticado ni persistencia en Sheets.
- La lista de los 20 deployments más recientes no mostró uno asociado a la rama documental; todos los resultados listados correspondían a `main` y target `production`. No se inició un deployment desde la adopción.
- Apps Script: la última versión verificada del puente fue `@34` (`Examen: plazo, guardado y respuestas normalizadas`). En esta revisión no se pudo consultar de nuevo: `clasp` no está instalado en el PATH. No se ejecutó ningún comando de escritura remota.
- Google Sheets: el 2026-09-30 se verificaron metadatos y sólo la fila de encabezados de las 20 pestañas de `Docencia`; no se leyeron filas de alumnos ni se escribió en la hoja. El esquema de `project.config.json` omite `EXAMEN_ASIGNACIONES` y columnas actuales de varias pestañas; quedó marcado `historical_non_authoritative`.
- Compilación local: `npm run build` pasó el 2026-09-30 antes del deployment `dpl_FYK...`. En esta adopción documental no se volvió a compilar ni se ejecutaron `npm run lint` o `npm run test:academic`.
- Pruebas automatizadas: `origin/main` no contiene script de pruebas ni directorio `tests/`; el checkout sucio actual sí añade `npm run test:academic` y `tests/`, pero ambos quedan fuera del commit documental. No se ejecutaron.
- No se hizo un recorrido manual autenticado de la rúbrica, el examen o la persistencia durante esta adopción. No se escribieron datos reales de prueba.

## Adopción del estándar

La documentación de producto está ubicada en `project-methodology/`, con `AGENTS.md` como puerta de entrada en la raíz. Se consultó el SOURCE_REPO canónico en `origin/main`, commit `e0c356e219771cbab456fed8e52aa6a86f40a70d`; la metodología central no se copia al TARGET_REPO. Una auditoría independiente confirmó los diez criterios documentales de orientación, estructura y enlaces locales; no verificó código, servicios remotos ni Producción. El piloto DOC-001 fue una tarea de Nivel 1: se compararon los encabezados de la fila 1 de las 20 pestañas, se marcó el esquema antiguo en `project.config.json` como histórico/no autoritativo, y se validaron el JSON y la ausencia de consumidores en el código. `python3 -m json.tool`, la revisión de enlaces y `git diff --check` pasaron. No se ejecutaron build, lint ni pruebas de aplicación, pues no cambió código de ejecución; tampoco hubo cambios funcionales ni escrituras remotas. La adopción se declara completada tras este piloto; la verificación operacional de rúbrica y examen permanece pendiente como trabajo de producto.

## Git y despliegue

- Snapshot previo a la adopción documental (2026-09-30): checkout en rama `main`, HEAD `d8612eac7c8abdaa58ca2c5972021b9c5f72f289`, coincidente con `origin/main`.
- La adopción y el piloto están en la rama de revisión `codex/alex-standard-v1-adoption`; el trabajo comprometido se limita a documentación y metadatos descriptivos de `project.config.json`, no consumidos por la aplicación. No se hace merge.
- Working tree: sucio, con cambios funcionales previos y archivos nuevos sin commit en módulos académicos, rúbrica, exámenes, puente, dependencias y UI. No descartarlos ni asumir que coinciden con `origin/main`.
- Producción se ha desplegado directamente por Vercel CLI desde el checkout local; el código desplegado no queda identificado por el SHA de `origin/main`. Apps Script también tiene trabajo publicado directamente en `@34`.
- En la revisión del 2026-09-30 no se encontraron workflows en `.github/workflows`; no se verificó un despliegue automático desde GitHub.
- El usuario autorizó una excepción limitada a esta adopción documental: rama de revisión y push sólo de documentación, sin merge ni deployment. Los cambios funcionales locales siguen fuera de ese alcance. Los cambios locales no constituyen respaldo remoto del código publicado.
- La corrección documental y el piloto no disparan un deployment; no se creó workflow, PR ni merge como parte de este trabajo.
- La hoja operativa es externa; el repositorio no respalda sus datos. No se verificó un backup independiente/restaurable de Sheets en esta fase.

## Problemas vigentes y siguiente paso

1. Completar `OPS-001`: verificar rúbrica C.A. por grado y persistencia de examen en sandbox con datos ficticios o con autorización explícita para los datos de prueba.
2. Resolver `GIT-001`: comparar el código publicado con Producción y conservarlo con SHA verificable cuando el usuario autorice ese alcance funcional.
3. Resolver `UI-001`: confirmar si `components/teacher-login-form.tsx` es obsoleto o tiene un consumidor omitido antes de eliminarlo o reutilizarlo.

Antes de cualquier operación basada en el esquema de Sheets, leer los encabezados vivos; las tablas de `project.config.json` son sólo una instantánea histórica.

Estado sujeto a revalidación antes de cualquier operación remota o publicación posterior.
