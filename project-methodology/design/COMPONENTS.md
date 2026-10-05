# Componentes de interfaz observados

Inventario estático de los componentes principales del checkout de Docencia. Describe sus responsabilidades visibles; no establece APIs públicas ni propone refactor.

| Componente | Archivo | Responsabilidad observada |
| --- | --- | --- |
| `TeacherDashboard` | [`teacher-dashboard.tsx`](../../components/teacher-dashboard.tsx) | Coordina navegación y vistas del panel docente; mantiene el selector de parcial y el formulario `Nuevo parcial`, cuyo guardado remoto muestra `ProgressOverlay`. |
| `TeacherAcademicModule` | [`teacher-academic-module.tsx`](../../components/teacher-academic-module.tsx) | Captura y revisa sesiones, asistencia, comentarios y actividades; consulta calificaciones y presenta el listado general de sesiones, tareas y trabajos archivados. |
| `TeacherCaRubric` | [`teacher-ca-rubric.tsx`](../../components/teacher-ca-rubric.tsx) | Inicia y presenta el progreso C.A. por grupo; en Postgres avanza jobs persistidos por petición autenticada y los reanuda al volver a abrir la sección. |
| `TeacherExamAuthoring` | [`teacher-exam-authoring.tsx`](../../components/teacher-exam-authoring.tsx) | Recibe materiales, solicita un borrador de examen y presenta controles de revisión/publicación. |
| `TeacherExamGradeMatrix` | [`teacher-exam-grade-matrix.tsx`](../../components/teacher-exam-grade-matrix.tsx) | Presenta una fila por alumno con estado/acciones, calificación total sobre 10 y columnas compactas `P1`, `P2`, etc. con respuesta y puntaje en el mismo renglón; distingue entregados de intentos autoguardados sin enviar y no califica estos últimos. `Ver respuestas` abre el desglose con consigna, respuesta, estado, puntaje y retroalimentación usando los datos ya consultados. `Editar calificación` deja ajustar el puntaje de todos los reactivos, incluidos los que no tienen respuesta, o fijar la nota final manualmente; puntuar una pregunta vacía conserva su estado y la excluye de IA. La marca Manual de la nota final bloquea la reevaluación de ese intento hasta retirar el ajuste. |
| `AdminExamControls` | [`admin-exam-controls.tsx`](../../components/admin-exam-controls.tsx) | Busca intentos entregados y presenta el flujo docente para revocar un examen. |
| `TeacherExamPreview` | [`teacher-exam-preview.tsx`](../../components/teacher-exam-preview.tsx) | Permite revisar la presentación de un examen sin crear un intento ni guardar en Sheets. |
| `StudentExamPortal` | [`student-exam-portal.tsx`](../../components/student-exam-portal.tsx) | Gestiona acceso por ID escolar, lista de exámenes, intento, guardado de respuestas y resultados del alumno. |
| `TeacherLoginForm` | [`teacher-login-form.tsx`](../../components/teacher-login-form.tsx) | El archivo define un formulario docente, pero no se encontró referencia desde `app/` o `components/`; ver `UI-001`. El acceso observado en `/` está en `StudentExamPortal`. |
| `TeacherGeminiSettings` | [`teacher-gemini-settings.tsx`](../../components/teacher-gemini-settings.tsx) | Consulta configuración de Gemini; permite editarla en Apps Script o muestra el estado del secreto de servidor cuando se usa Postgres, sin revelar la clave. |
| `ProgressOverlay` | [`progress-overlay.tsx`](../../components/progress-overlay.tsx) | Expone el título y detalle de operaciones remotas bloqueantes. |

## Estados compartidos y límites

- Mantén el estado de progreso/error junto a la operación que inicia una consulta o escritura remota, siguiendo [`AGENTS.md`](../../AGENTS.md).
- El examen comunica el guardado automático en línea (`Guardando…` / `Guardado`); no reemplazar ese estado por un modal que interrumpa al alumno.
- Los nombres y responsabilidades de la tabla proceden de exports, imports y contenido de los archivos; no implican que cada recorrido se haya probado de extremo a extremo.
- Las props y detalles internos pueden cambiar. Inspecciona la fuente del componente antes de reutilizarlo.
