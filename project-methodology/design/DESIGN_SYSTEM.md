# Sistema visual observado

## Fuente y alcance

La interfaz de Docencia está escrita con componentes React propios y CSS en [`app/globals.css`](../../app/globals.css). Los textos identifican Docencia / Español e Instituto Santa María. No se encontró un manual de marca aprobado ni una biblioteca visual externa; los colores actuales son implementación, no una identidad aprobada.

Este documento describe la UI existente sin proponer rediseño. [`TOKENS.md`](TOKENS.md) registra variables CSS; [`COMPONENTS.md`](COMPONENTS.md) y [`LAYOUTS.md`](LAYOUTS.md) organizan el inventario estructural y visual.

## Reglas de continuidad

- Reutiliza primero variables y patrones implementados que cubran el caso; no trates cada literal CSS como token oficial.
- Conserva etiquetas en español y estados de carga, error, vacío, éxito y selección del flujo correspondiente.
- Las operaciones remotas iniciadas por el docente muestran `ProgressOverlay` con explicación de la acción. El autoguardado frecuente del examen informa su estado en línea, sin interrumpir la evaluación.
- No infieras marca, iconografía o un patrón aprobado a partir de una sola pantalla.
- Antes de tocar UI, inspecciona el componente y la cascada CSS del flujo afectado; valida en el navegador cuando el nivel y entorno lo permitan.

## Límites de la inspección

La revisión documentada es estática. No se realizó un recorrido visual autenticado ni una auditoría completa de contraste, teclado, responsive o accesibilidad. Los patrones observados no equivalen a conformidad de accesibilidad ni a aprobación visual.
