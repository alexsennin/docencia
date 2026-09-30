# Componentes de interfaz observados

Inventario estático de los componentes principales del checkout de Docencia. Describe sus responsabilidades visibles; no establece APIs públicas ni propone refactor.

| Componente | Archivo | Responsabilidad observada |
| --- | --- | --- |
| `TeacherDashboard` | [`teacher-dashboard.tsx`](../../components/teacher-dashboard.tsx) | Coordina navegación y vistas del panel docente: sesiones, calificaciones, rúbrica C.A., autoría y reportes de exámenes, y configuración relacionada. |
| `TeacherAcademicModule` | [`teacher-academic-module.tsx`](../../components/teacher-academic-module.tsx) | Captura y revisa sesiones, asistencia, comentarios y actividades; muestra datos académicos del grupo/parcial. |
| `TeacherCaRubric` | [`teacher-ca-rubric.tsx`](../../components/teacher-ca-rubric.tsx) | Inicia y presenta el progreso del procesamiento C.A. por grado, y permite revisar propuestas. |
| `TeacherExamAuthoring` | [`teacher-exam-authoring.tsx`](../../components/teacher-exam-authoring.tsx) | Recibe materiales, solicita un borrador de examen y presenta controles de revisión/publicación. |
| `TeacherExamGradeMatrix` | [`teacher-exam-grade-matrix.tsx`](../../components/teacher-exam-grade-matrix.tsx) | Presenta calificaciones por alumno y reactivo según el parcial seleccionado. |
| `AdminExamControls` | [`admin-exam-controls.tsx`](../../components/admin-exam-controls.tsx) | Busca intentos entregados y presenta el flujo docente para revocar un examen. |
| `TeacherExamPreview` | [`teacher-exam-preview.tsx`](../../components/teacher-exam-preview.tsx) | Permite revisar la presentación de un examen sin crear un intento ni guardar en Sheets. |
| `StudentExamPortal` | [`student-exam-portal.tsx`](../../components/student-exam-portal.tsx) | Gestiona acceso por ID escolar, lista de exámenes, intento, guardado de respuestas y resultados del alumno. |
| `TeacherLoginForm` | [`teacher-login-form.tsx`](../../components/teacher-login-form.tsx) | El archivo define un formulario docente, pero no se encontró referencia desde `app/` o `components/`; ver `UI-001`. El acceso observado en `/` está en `StudentExamPortal`. |
| `TeacherGeminiSettings` | [`teacher-gemini-settings.tsx`](../../components/teacher-gemini-settings.tsx) | Consulta y configura la conexión Gemini sin revelar la clave al navegador. |
| `ProgressOverlay` | [`progress-overlay.tsx`](../../components/progress-overlay.tsx) | Expone el título y detalle de operaciones remotas bloqueantes. |

## Estados compartidos y límites

- Mantén el estado de progreso/error junto a la operación que inicia una consulta o escritura remota, siguiendo [`AGENTS.md`](../../AGENTS.md).
- El examen comunica el guardado automático en línea (`Guardando…` / `Guardado`); no reemplazar ese estado por un modal que interrumpa al alumno.
- Los nombres y responsabilidades de la tabla proceden de exports, imports y contenido de los archivos; no implican que cada recorrido se haya probado de extremo a extremo.
- Las props y detalles internos pueden cambiar. Inspecciona la fuente del componente antes de reutilizarlo.
