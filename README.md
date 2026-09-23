# Docencia

Base inicial para [`docencia.integratech.app`](https://docencia.integratech.app).

El repositorio es privado en GitHub y el proyecto de Vercel usa la rama `main` como referencia de producción. El dominio `integratech.app` usa los nameservers de Vercel; no se modificaron registros ajenos a este proyecto.

La base inicial es la hoja nativa de Google Sheets [`Docencia`](https://docs.google.com/spreadsheets/d/1YcnvSaHeIpZrbthI8rNOKIEJy0Z6QQ-06VCROS4Yh48/edit), con la pestaña `Registros` y zona horaria `America/Mexico_City`. La estructura académica contempla parciales ilimitados mediante `PARCIALES`, la captura por alumno mediante `EVALUACIONES`, el desglose de actividades mediante `TAREAS` y sus calificaciones mediante `CALIFICACIONES_TAREAS`. El puente de lectura/escritura desde Vercel se agregará cuando se defina el mecanismo de autenticación de Google; no se guardan credenciales en el repositorio.

## Estructura de evaluación

Cada parcial es independiente y puede contener cuatro componentes configurables:

- `asistencias`: registro por fecha y alumno;
- `trabajos_clase` y `tareas`: actividades agrupadas dentro de `TAREAS`;
- `conducta` y `actitud`: valoración formativa y observaciones;
- `examen`: calificación del instrumento correspondiente al parcial.

Los pesos no se fijan por código: se guardarán en la configuración del parcial para que la docente pueda definirlos. La calificación total se calculará en servidor cuando exista el puente con Google Sheets y la autenticación docente.

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
