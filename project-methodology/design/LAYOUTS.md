# Layouts y adaptación observados

Descripción estática de las estructuras visuales principales del checkout. Los tamaños proceden de `app/globals.css`; no se hicieron capturas autenticadas ni pruebas visuales por viewport durante esta revisión.

| Flujo | Estructura observada | Restricciones y adaptación |
| --- | --- | --- |
| Entrada `/` | El servidor muestra `TeacherDashboard` si hay sesión docente válida; si no, `StudentExamPortal`. | `/alumno` y `/docente/ingresar` redirigen a `/`; `/docente/probar` requiere sesión docente. Fuente: [`app/page.tsx`](../../app/page.tsx). |
| Panel docente | Navegación lateral y área de trabajo central sobre fondo claro. | El ancho de trabajo llega a 1270 px; a 650 px o menos la navegación pasa a una franja horizontal desplazable. |
| Portal alumno | Tarjeta centrada; la tarjeta de entrada tiene máximo de 520 px y la de contenido, 940 px. | Formularios, acceso, resultados y lista de exámenes reacomodan controles en pantallas estrechas. |
| Examen | Barra superior con temporizador y contenido centrado, con máximo de 920 px. | Las tarjetas de reactivos se apilan; las acciones se expanden al ancho disponible en móvil. |
| Captura académica | Tabla de sesión con encabezados y alumnos; paneles de detalle, listas y formularios. La matriz de exámenes usa una fila por alumno: estado/acciones, calificación total y columnas compactas por reactivo. | Tabla, matriz y paneles con contenido extenso mantienen desplazamiento; varios contenedores tienen altura máxima con overflow. |
| Archivados | Tabla general de sesiones, tareas y trabajos retirados de los cálculos activos, con grupo, parcial y fechas. | Reutiliza el contenedor desplazable de matrices; no ofrece restauración todavía. |
| Diálogos | Overlay de progreso y diálogos para revisión, confirmación y detalles. | El CSS limita ancho y altura, con desplazamiento interno para contenido largo. |

## Breakpoints CSS localizados

- `950px`: reduce navegación y reorganiza rejillas del panel.
- `800px`: apila la vista de dos columnas de la rúbrica C.A.
- `760px`: apila la disposición académica de dos columnas.
- `650px`: cambia el shell docente a una sola columna y vuelve horizontal la navegación.
- `520px`: apila formularios y controles adicionales.

Son reglas del CSS observado, no una especificación completa de dispositivos soportados. Validar los breakpoints y el flujo afectado en navegador cuando se modifique el layout.
