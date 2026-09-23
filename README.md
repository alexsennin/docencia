# Docencia

Base inicial para [`docencia.integratech.app`](https://docencia.integratech.app).

El repositorio es privado en GitHub y el proyecto de Vercel usa la rama `main` como referencia de producción. El dominio `integratech.app` usa los nameservers de Vercel; no se modificaron registros ajenos a este proyecto.

La base inicial es la hoja nativa de Google Sheets [`Docencia`](https://docs.google.com/spreadsheets/d/1YcnvSaHeIpZrbthI8rNOKIEJy0Z6QQ-06VCROS4Yh48/edit), con la pestaña `Registros` y zona horaria `America/Mexico_City`. El puente de lectura/escritura desde Vercel se agregará cuando se defina el mecanismo de autenticación de Google; no se guardan credenciales en el repositorio.

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
