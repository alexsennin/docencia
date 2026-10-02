# Contexto del proyecto

## Propósito y usuarios

Docencia apoya el trabajo de una docente de Español de secundaria y permite a sus alumnos consultar exámenes, resultados y retroalimentación. Maneja información escolar identificable y calificaciones, por lo que las filas reales y credenciales deben permanecer en los servicios autorizados.

## Alcance vigente (2026-10-01)

El backend de Producción se cortó explícitamente a Neon el 2026-10-01, por instrucción del usuario. Vercel sigue sirviendo https://docencia.integratech.app; la aplicación usa PostgreSQL Neon, y Sheets/Apps Script se mantienen configurados como legado sin recibir escrituras de este despliegue. Los datos locales existentes se copiaron a Neon sin generar registros: 171 alumnos, 30 sesiones, 760 asistencias y 61 eventos de auditoría; las demás tablas están vacías salvo un periodo. No sincroniza en vivo con Docker ni con Sheets. No desactivar el legado ni borrar sus datos sin inventario y petición específica. El 2026-10-02 el usuario autorizó sincronizar la fuente de Local, Producción y GitHub para corregir el desglose de exámenes (DEC-012). Los datos escolares y secretos quedan fuera de Git.

## Stack y servicios actuales

- Aplicación web: Next.js 16.3.6 con App Router, React 19.3.0, TypeScript 5.8 y CSS propio. La raíz `/` sirve el panel docente si hay sesión docente y el portal del alumno si no la hay.
- Datos de Producción: Neon PostgreSQL, proyecto purple-dust-42424287, rama production (br-proud-bonus-b596c9ro), base neondb, región aws-us-east-2. El 2026-10-01 se copió la base local existente: 171 alumnos, 30 sesiones, 760 asistencias, 61 eventos de auditoría, un periodo y cero filas en otras tablas. Los conteos exactos de las 21 tablas coinciden. Docker local y Sheets/Apps Script se conservan como entornos/legado independientes, sin sincronización continua.
- Despliegue web: Vercel, dominio operativo `https://docencia.integratech.app`.
- IA: con backend Sheets, Gemini se invoca desde Apps Script y su clave queda en Script Properties; con PostgreSQL, el servidor lo invoca usando una variable sensible propia. No envíes secretos de Gemini al navegador; cada servicio conserva sus propias variables sensibles.
- Documentos de exámenes: `mammoth` extrae texto de `.docx` en el servidor.
- Código remoto: repositorio privado `alexsennin/docencia`, rama `main`. La rama y Producción son estados separados: se han realizado despliegues directos por CLI desde el checkout local.
- Backend: el código conserva Sheets como valor local predeterminado; Docker usa PostgreSQL en desarrollo. Vercel Production tiene configurado DATA_BACKEND=postgres, DATABASE_DRIVER=neon y POSTGRES_PRODUCTION_CUTOVER_APPROVED=YES. Neon usa conexiones agrupadas y un rol de runtime con permisos DML acotados. GEMINI_API_KEY y GEMINI_MODEL están configuradas como variables sensibles de Vercel; se verificó su estado sin invocar Gemini.

## Acceso y restricciones

- La autenticación docente valida una contraseña configurada en Vercel y firma una cookie `HttpOnly`, `Secure` en Producción, `SameSite=Strict`, con duración de ocho horas. Las rutas docentes protegidas revisan esa sesión.
- Los alumnos se consultan por ID escolar; el usuario decidió mantener esta modalidad temporalmente y acepta su riesgo. No la amplíes ni la sustituyas sin una instrucción específica.
- El Web App de Apps Script permite invocación anónima a nivel de Google, pero el código exige `BRIDGE_TOKEN` antes de despachar operaciones. El token y el ID operativo de la hoja no deben exponerse al navegador.
- Las reglas detalladas para operaciones remotas, autoguardado durante exámenes y guías Next.js están en `AGENTS.md`.

## Convenciones de producto observadas

- La interfaz y los mensajes están en español (`es-MX`). Las fechas académicas siguen la zona horaria de la hoja.
- La asistencia guarda `P`, `I` o `R`.
- La captura docente concentra asistencia, actividades, comentarios y sesiones; la rúbrica C.A. es un apartado separado y se evalúa por grupo como trabajo recuperable en segundo plano. El resultado se guarda automáticamente, sin aprobación manual separada; la docente puede revisar los criterios y fundamentos.
- Los pesos académicos implementados son EC 40%, C.A. 10% y examen 50%; la asistencia y las faltas son datos informativos en la nota final.

## Mapa del repositorio

- `app/`: páginas y API Routes de Next.js.
- `components/`: portal del alumno, panel docente, captura académica, rúbrica y exámenes.
- `lib/`: cálculo académico, tipos, autenticación docente y cliente servidor del puente.
- `integrations/google-sheets-bridge/Code.gs`: aplicación Apps Script que lee/escribe la hoja y llama Gemini cuando `DATA_BACKEND=sheets`.
- `db/` y `lib/*-postgres.*`: esquema/migraciones PostgreSQL y flujos migrados gradualmente; el compose local usa Docker. Neon es el backend actual de Producción y Docker es el entorno local.
- `project.config.json`: manifiesto descriptivo sin referencias encontradas desde el código. Sus definiciones `sheets.tables` se compararon con los encabezados vivos el 2026-09-30 y quedaron marcadas como históricas/no autoritativas; no las uses para operaciones sobre Sheets.
- `tests/`: directorio de pruebas Node que existe en este checkout sucio; no está en `origin/main` ni en el commit documental.

## Contexto persistente

Lee [PROJECT_STATE.md](PROJECT_STATE.md) para el estado actual; [ARCHITECTURE.md](ARCHITECTURE.md) para contratos y flujos; [TODO.md](TODO.md) para trabajo futuro; y [DECISIONS.md](DECISIONS.md) para decisiones duraderas. Para UI, consulta [design/](design/).

La memoria específica del producto está en `project-methodology/`. ALEX DEVELOPMENT STANDARD v1.0 es la metodología central de sólo lectura: se consultó en `alexsennin/alex-development-standard`, `standards/v1.0/`, commit `e0c356e219771cbab456fed8e52aa6a86f40a70d`. No se copian sus documentos normativos. La adopción se completó con el piloto DOC-001, según el registro de [PROJECT_STATE.md](PROJECT_STATE.md).
