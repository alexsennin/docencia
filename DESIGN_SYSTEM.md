# Sistema visual observado

## Alcance y estado

Esta página registra la UI que aparece en el código; no crea una marca nueva ni prescribe un rediseño. No se encontró un manual de marca aprobado ni un logo externo. Los textos de interfaz identifican el producto como Docencia / Español e Instituto Santa María.

El estilo vive principalmente en `app/globals.css`, con clases CSS específicas y componentes React propios. No aparece una biblioteca visual externa. Los colores definidos en `:root` se registran en `TOKENS.md`; otros colores, tamaños y radios siguen escritos directamente en reglas CSS, así que el diseño no está tokenizado por completo.

## Patrones implementados

- **Panel docente:** navegación lateral azul marino en escritorio, tarjetas sobre superficie clara, acciones primarias oscuras y acentos menta. El contenido limita su ancho y reacomoda la navegación en pantallas estrechas.
- **Portal de alumno/examen:** tarjeta centrada sobre fondo claro, formularios y tarjetas de resultado. El examen ofrece una barra superior con temporizador, instrucciones y tarjetas por reactivo.
- **Tablas académicas:** el registro de sesión conserva el encabezado/alumno y habilita desplazamiento horizontal y vertical; las matrices usan tipografía compacta y celdas numéricas alineadas.
- **Estados:** se usan avisos inline, tarjetas de revisión, overlay para operaciones remotas y estados en línea de guardado del examen conforme a `AGENTS.md`.
- **Responsive observado en CSS:** puntos de corte en 950, 800, 760, 650 y 520 px, según módulo; a 650 px la navegación docente se vuelve horizontal. Las tablas mantienen overflow en vez de comprimir todas sus columnas.
- **Tipografía:** `Inter` con fallback de sistema, declarada en `body`.

## Reglas de continuidad

- Reutiliza primero las variables y patrones existentes donde cubran el caso; no trates cada literal como un token oficial.
- No infieras colores, marca, iconografía o patrón aprobado a partir de una sola pantalla.
- Conserva etiquetas en español y los estados/loading/error/vacío de los flujos actuales.
- Antes de cambiar UI, inspecciona el componente y la cascada CSS afectados, conserva el alcance aprobado y revisa el flujo real.

## Deuda y límites de inspección

`globals.css` concentra estilos de muchos módulos y mantiene bastantes valores literales; es una observación de mantenimiento, no una autorización para tokenizar o reescribirlo ahora. Esta revisión fue estática: no se hizo un recorrido visual autenticado ni una auditoría completa de responsive, teclado o contraste. No se declara conformidad de accesibilidad.

No se crea un inventario separado `COMPONENTS.md` o `LAYOUTS.md`: `ARCHITECTURE.md` mapea los módulos actuales y esta página resume los patrones compartidos. Crear un inventario sólo si la cantidad de componentes reutilizables crece y reduce una ambigüedad concreta.
