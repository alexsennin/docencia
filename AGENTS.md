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

Este proyecto adopta **ARC Development Standard v1.3.2** (2026-10-06).

- `STANDARD`: `ARC Development Standard v1.3.2`
- `RUNTIME`: `AXIOM v0.1`
- `EXECUTION_ENGINE`: Codex CLI
- `MODEL_FAMILY`: Luna / Sol / Astra, seleccionados por AXIOM según la capacidad requerida
- `TARGET_REPO`: `alexsennin/docencia`
- `TARGET_ROOT`: raíz de este checkout
- `TARGET_METHODOLOGY_DIR`: `project-methodology/`

ARC v1.3.2 es la metodología vigente y AXIOM v0.1 su runtime oficial; Codex CLI es el motor de ejecución y AXIOM selecciona Luna, Sol o Astra según la capacidad. La adopción conserva las reglas de trabajo ya asentadas en este archivo (modo, riesgo, capacidad, escalamiento y autorización) y no copia documentos normativos centrales dentro de Docencia. La referencia canónica publicada de ARC v1.3.2 aún no está registrada en este checkout; no atribuyas reglas nuevas a esa fuente hasta que esté disponible. La memoria específica del producto vive en `project-methodology/`.

Antes de trabajar, lee:

- `project-methodology/PROJECT_CONTEXT.md`
- `project-methodology/PROJECT_STATE.md`
- `project-methodology/ARCHITECTURE.md`
- `project-methodology/TODO.md`
- `project-methodology/DECISIONS.md`

Para UI, lee también `project-methodology/design/`. Las reglas operativas heredadas clasifican cada intervención por modo (PATCH, FEATURE, SYSTEM, CHECK o RELEASE), nivel de riesgo (1–4) y capacidad cognitiva necesaria. Las señales de auth, permisos, secretos, pagos, migraciones, datos persistentes, borrados, infraestructura, Producción y contratos entre servicios exigen análisis EXPERT antes de editar; el riesgo y la complejidad cognitiva se evalúan por separado. El perfil AXIOM y sus límites para este entorno están en `PROJECT_STATE.md`. Publicar o hacer push no autoriza Producción: aplica sólo una autorización explícita que cubra esa operación y destino. Aplica verificaciones proporcionales y actualiza únicamente los documentos cuya verdad cambió. Las versiones anteriores se conservan como historial; la adopción ARC no activa automatizaciones opcionales.

## Reglas propias del proyecto

- Actualización del usuario del 2026-10-02: la corrección del desglose de respuestas debe mantener el mismo código en Local, Producción y GitHub. Esta tarea autoriza commits y push al repositorio privado para sincronizar la implementación existente y la corrección. No implica copiar datos escolares entre bases, recalificar intentos ni publicar secretos. Sustituye la pausa de GitHub para esta sincronización.

- Actualización del usuario del 2026-09-30: los cambios funcionales solicitados deben quedar desplegados en Producción, porque allí los revisa. Tras implementar y validar, publicar en el proyecto existente de Vercel y verificar dominio y rutas pertinentes; actualizar el puente existente sólo si el cambio lo requiere, comparándolo antes con el origen vivo. Esta instrucción autoriza la publicación funcional y mantiene GitHub pausado: no autoriza commits, pushes, PR ni merge. Los cambios exclusivamente documentales no requieren despliegue.

- La referencia operativa es Producción en `https://docencia.integratech.app`; Neon PostgreSQL es la fuente operativa desde el corte del 2026-10-01. Docker local mantiene datos independientes; Google Sheets/Apps Script se conservan como legado sin sincronización continua. `project.config.json` no se usa desde código y su esquema está marcado histórico/no autoritativo; consulta los encabezados de la hoja viva antes de basar operaciones en un esquema.
- El árbol local y `origin/main` no necesariamente representan lo desplegado. La excepción del 2026-09-30 para rama, commits y push correspondió a la adopción documental de v1.0; la excepción funcional del 2026-10-02 se limita al desglose de respuestas (DEC-012). No incluyas cambios funcionales preexistentes en una entrega documental. Para cualquier otro trabajo, incluidos commits o push de la adopción ARC v1.3.2, no crees commits, ramas remotas, PR ni pushes sin una instrucción explícita que los autorice. No despliegues cambios documentales.
- El acceso estudiantil por ID se conserva temporalmente por instrucción del usuario. No lo cambies como parte de otra tarea; registra el riesgo y espera una solicitud específica para cambiar esa decisión.
- Toda acción iniciada por el usuario que consulte o escriba Apps Script, Google Sheets, Gemini u otro servicio remoto debe seguir la regla `ProgressOverlay` al inicio de este archivo. El autoguardado de exámenes conserva su estado visible en línea y el envío mantiene su pantalla de evaluación.
- Mantén secretos en variables sensibles de Vercel o Script Properties de Apps Script. No copies filas de alumnos, calificaciones, credenciales ni tokens a documentación, logs o fixtures.

## Comandos y operaciones

`package.json` declara `npm run dev`, `npm run build`, `npm run start`, `npm run lint` y pruebas focales como `npm run test:academic` y `npm run test:exam-attempt`. Verifica los scripts vigentes antes de ejecutarlos y elige sólo las comprobaciones pertinentes. Un build no demuestra persistencia ni recorrido de usuario.

El puente de Apps Script está en `integrations/google-sheets-bridge/`. `clasp deployments` consulta sus despliegues; `clasp push`, `clasp version` y `clasp deploy -i <deployment-existente> -V <version>` escriben en el proyecto o deployment remoto. Antes de usarlos, compara el archivo local con el origen vivo y confirma que la tarea autoriza ese cambio. Actualiza el deployment existente; no crees otra URL por accidente.

Vercel se publica con la CLI del proyecto (`npx --yes vercel@60.0.0 deploy --prod --yes --scope team_vBGSim0Om0qNR6PJXwpuSvow`) y se verifica con `vercel inspect`, el dominio, rutas y recorridos pertinentes. La instrucción de Producción directa no convierte una tarea documental en autorización para publicar. No supongas que un push a `main` actualiza Producción.

## Cierre local

Al entregar, indica objetivo, rutas modificadas, evidencia y límites, rama/HEAD, estado sucio y cambios ajenos, remoto, despliegue/Producción y siguiente paso. Distingue código implementado, publicado en Git, desplegado y verificado en Producción.


---

## Orientación empresarial — IntegraTech Business Governance v1.0

- Antes de **priorizar** una funcionalidad relevante, consultar [PRODUCT_STRATEGY.md](PRODUCT_STRATEGY.md): objetivo, alcance y restricciones comerciales disponibles.
- Fuente canónica de **decisiones empresariales aprobadas**: [IntegraTech Business Strategy](https://github.com/alexsennin/integratech-business-strateg/blob/main/05_BUSINESS_DECISIONS/DECISION_LOG.md) (repositorio privado).
- Si una solicitud se aparta del objetivo empresarial aprobado, **advertir y explicar el costo de oportunidad**, proponer backlog o revisión; **no bloquear automáticamente** una instrucción explícita autorizada.
- Nunca transformar conversaciones, hipótesis o resultados técnicos en decisiones empresariales aprobadas de forma automática.
- Si no existe dirección empresarial aprobada para este producto, indicarlo y continuar con los requisitos funcionales y autorizaciones técnicas existentes. **No inventar un MVP ni un precio.**
- Si GitHub privado es inaccesible, usar la copia estratégica local e indicar que no se verificó su vigencia.
- **ARC Development Standard y todas las reglas previas de este AGENTS.md permanecen vigentes sin alteración.** Este enlace no permite desplegar, cambiar datos, fijar precios ni realizar inversiones.
