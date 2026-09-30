# Estado actual

Fecha de actualización: 2026-09-30.

## Estado del producto

Docencia está activa en Producción en [docencia.integratech.app](https://docencia.integratech.app). El panel docente, la captura académica por sesión, la rúbrica C.A. por grado, la autoría y aplicación de exámenes, la matriz de resultados y la consulta académica estudiantil están implementados en el código que se publicó.

La rúbrica por grado usa un trabajo temporizado de Apps Script y Script Properties para conservar cursor/progreso; el navegador consulta el estado. Los comentarios y retardos alimentan una propuesta, que requiere aprobación docente antes de afectar C.A.

## Verificación conocida

- Vercel: deployment `dpl_FYKWrwwamiQ18G5DDKT8yReas4cG`, `READY`, alias `docencia.integratech.app`, publicado el 2026-09-30. La portada respondió HTTP 200; la ruta protegida `/api/teacher/results` respondió 401 sin sesión. Esto no demuestra el recorrido docente autenticado ni persistencia en Sheets.
- Apps Script: el deployment existente del puente está en versión `@34` (`Examen: plazo, guardado y respuestas normalizadas`).
- Google Sheets: el 2026-09-30 se verificaron metadatos y encabezados de las 20 pestañas de `Docencia`, sin leer filas de alumnos. `project.config.json` no coincide con varios encabezados y omite `EXAMEN_ASIGNACIONES`.
- Compilación local: `npm run build` pasó el 2026-09-30 antes del deployment `dpl_FYK...`. En esta adopción documental no se volvió a compilar ni se ejecutaron `npm run lint` o `npm run test:academic`.
- Pruebas automatizadas: `origin/main` no contiene script de pruebas ni directorio `tests/`; el checkout sucio actual sí añade `npm run test:academic` y `tests/`, pero ambos quedan fuera del commit documental. No se ejecutaron.
- No se hizo un recorrido manual autenticado de la rúbrica, el examen o la persistencia durante esta adopción. No se escribieron datos reales de prueba.

## Adopción del estándar

La fase documental inicial de ALEX DEVELOPMENT STANDARD v1.0 está preparada. Un agente independiente, sin acceso al chat, respondió las once preguntas de orientación usando estos documentos y no halló contradicciones internas; no verificó código, servicios remotos ni Producción. La adopción completa no está declarada: falta un piloto de tarea real autorizada y un handoff basado en su resultado.

## Git y despliegue

- Snapshot previo a la adopción documental (2026-09-30): checkout en rama `main`, HEAD `d8612eac7c8abdaa58ca2c5972021b9c5f72f289`, coincidente con `origin/main`.
- Working tree: sucio, con cambios funcionales previos y archivos nuevos sin commit en módulos académicos, rúbrica, exámenes, puente, dependencias y UI. No descartarlos ni asumir que coinciden con `origin/main`.
- Producción se ha desplegado directamente por Vercel CLI desde el checkout local; el código desplegado no queda identificado por el SHA de `origin/main`. Apps Script también tiene trabajo publicado directamente en `@34`.
- En la revisión del 2026-09-30 no se encontraron workflows en `.github/workflows`; no se verificó un despliegue automático desde GitHub.
- El usuario autorizó una excepción limitada a esta adopción documental: rama de revisión y push sólo de documentación, sin merge ni deployment. Los cambios funcionales locales siguen fuera de ese alcance. Los cambios locales no constituyen respaldo remoto del código publicado.
- La hoja operativa es externa; el repositorio no respalda sus datos. No se verificó un backup independiente/restaurable de Sheets en esta fase.

## Problemas vigentes y siguiente paso

1. Conciliar `project.config.json` con los encabezados vigentes de Sheets antes de tratarlo como esquema.
2. Ejecutar un piloto de tarea real, pequeña y autorizada; la comprobación independiente de orientación documental ya se completó satisfactoriamente.
3. Verificar los recorridos remotos de la rúbrica C.A. por grupo y del examen con un entorno de ensayo o registros autorizados, sin usar datos de alumnos inadvertidamente.
4. Reanudar la trazabilidad Git de los cambios funcionales sólo con autorización para ese alcance; la instrucción actual permite únicamente la rama documental de ALEX.

Estado sujeto a revalidación antes de cualquier operación remota o publicación posterior.
