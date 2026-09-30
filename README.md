# Docencia

Aplicación escolar para gestionar sesiones, evaluaciones y exámenes de Español del Instituto Santa María. La instancia operativa es [docencia.integratech.app](https://docencia.integratech.app).

La aplicación usa Next.js y Vercel; Google Sheets es la fuente operativa de datos y Apps Script conecta la aplicación con la hoja. El estado de Producción y los límites de las verificaciones conocidas están en [PROJECT_STATE.md](project-methodology/PROJECT_STATE.md). El checkout, `origin/main` y Producción pueden representar estados distintos.

## Desarrollo local

```bash
npm install
npm run dev
```

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

Este proyecto adopta [ALEX DEVELOPMENT STANDARD v1.0](https://github.com/alexsennin/alex-development-standard/tree/main/standards/v1.0). La fuente canónica es de solo lectura; la documentación del producto vive en `project-methodology/`. La adopción documental queda pendiente de una tarea piloto de bajo riesgo.
