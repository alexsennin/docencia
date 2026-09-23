# Docencia

Base inicial para [`docencia.integratech.app`](https://docencia.integratech.app).

El repositorio es privado en GitHub y el proyecto de Vercel usa la rama `main` como referencia de producción. El dominio `integratech.app` usa los nameservers de Vercel; no se modificaron registros ajenos a este proyecto.

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

El despliegue de producción se realizará desde la rama `main` en Vercel. Las variables sensibles, cuando se agreguen, deben configurarse en Vercel y no en el repositorio.
