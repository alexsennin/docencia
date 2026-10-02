# Docencia

Aplicación escolar para gestionar sesiones, evaluaciones y exámenes de Español del Instituto Santa María. La instancia operativa es [docencia.integratech.app](https://docencia.integratech.app).

La aplicación usa Next.js y Vercel. La migración gradual añade PostgreSQL local en Docker y Neon como destino; el estado de Producción y los límites de las verificaciones conocidas están en [PROJECT_STATE.md](project-methodology/PROJECT_STATE.md). El checkout, `origin/main` y Producción pueden representar estados distintos. El MVP actual se prueba localmente; este flujo no cambia Producción.

## Desarrollo local

### MVP con PostgreSQL en Docker

Requisitos: Docker Desktop con Compose y Node.js 24 para comandos de proyecto ejecutados en el host. Desde la raíz del checkout:

```bash
npm ci
npm run local:init-env
docker compose up --build -d
docker compose exec -T web npm run db:migrate
docker compose ps
```

`local:init-env` crea `.env` sólo si no existe, genera credenciales locales aleatorias y aplica permisos `0600`. Si el archivo ya existe, lo conserva. Para entrar, abre [http://localhost:13000](http://localhost:13000) y usa el valor `TEACHER_PASSWORD` del `.env` en el campo «ID escolar o contraseña docente». No copies esas credenciales a Vercel, Neon ni Apps Script. La base PostgreSQL queda accesible sólo desde el equipo en `localhost:15432`.

El volumen `docencia_pgdata` conserva la base entre reinicios. `docker compose down` detiene los servicios y conserva los datos; **no ejecutes `docker compose down -v`** si quieres conservar el padrón importado. Una instalación limpia recibe el esquema con `db:migrate`, pero no contiene el padrón real: los datos escolares no se distribuyen en Git ni en la semilla sintética. En este checkout, las 172 filas no sintéticas del padrón residen en el volumen Docker existente. Para replicarlas en otra base se requiere un snapshot autorizado, guardado de forma privada, reconciliado y aplicado localmente con `npm run import:sheets-snapshot -- --input <snapshot.json> --apply-local`; nunca se debe apuntar ese importador a Neon o Producción.

Para la semilla exclusivamente ficticia, usa `docker compose exec -T web env SEED_LOCAL_CONFIRM=YES npm run db:seed:local`. Verifica estructura con `docker compose exec -T web npm run db:smoke`.

El modo `npm run dev` sin Docker todavía existe, pero no prepara ni migra PostgreSQL por sí solo; para probar el MVP migrado usa el flujo de Compose de arriba.

Comprobaciones disponibles en el manifiesto:

```bash
npm run lint
npm run build
```

Consulta [AGENTS.md](AGENTS.md) antes de trabajar. La memoria específica del producto está en [project-methodology/](project-methodology/):

- [Contexto](project-methodology/PROJECT_CONTEXT.md)
- [Estado](project-methodology/PROJECT_STATE.md)
- [Arquitectura y flujos](project-methodology/ARCHITECTURE.md)
- [Pendientes](project-methodology/TODO.md)
- [Decisiones](project-methodology/DECISIONS.md)
- [Diseño](project-methodology/design/)

Este proyecto adopta [ALEX DEVELOPMENT STANDARD v1.0](https://github.com/alexsennin/alex-development-standard/tree/main/standards/v1.0). La fuente canónica es de solo lectura; la documentación del producto vive en `project-methodology/`. La adopción se completó con el piloto de Nivel 1 DOC-001, documentado en el estado del proyecto.
