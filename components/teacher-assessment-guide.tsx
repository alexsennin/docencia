"use client";

import { useState } from "react";

export const ASSESSMENT_DOCUMENT_TEMPLATE = `================================================================================
NOMBRE DE LA EVALUACIÓN: Evaluación de Español 2° - Reporte de Lectura: El Principito
TIPO: Actividad
GRADO: 2° Secundaria
TIEMPO: 50 minutos
================================================================================

INSTRUCCIONES PARA EL ALUMNO:
Lee con atención cada una de las secciones y responde según lo solicitado.
Cuida tu redacción, coherencia y ortografía en las respuestas abiertas.

--------------------------------------------------------------------------------
SECCIÓN 1: CUESTIONARIO Y REACTIVOS (VISTA DEL ALUMNO)
--------------------------------------------------------------------------------

1. DATOS GENERALES DE LA OBRA
Escribe los datos bibliográficos solicitados:
a) Título del libro: ____________________
b) Nombre del autor: ____________________

2. PERSONAJES PRINCIPALES
Menciona al menos 3 personajes principales de la obra y describe brevemente quiénes son y qué representan:
a) ____________________________________________________
b) ____________________________________________________
c) ____________________________________________________

3. COMPRENSIÓN LECTORA
¿Qué lección fundamental le enseña el zorro al Principito respecto a los lazos afectivos?
( ) A) Que los lazos hacen que las personas dependan unas de otras sin libertad.
( ) B) Que domesticar significa crear lazos y volverse únicos el uno para el otro.
( ) C) Que los lazos solo causan sufrimiento cuando llega la hora de partir.
( ) D) Que el tiempo dedicado a una rosa no tiene ningún valor real.

4. REFLEXIÓN PERSONAL Y ANÁLISIS
Explica con tus propias palabras qué significa la frase: "Lo esencial es invisible para los ojos" y cómo se relaciona con la sociedad actual.
Respuesta: ____________________________________________________________________

================================================================================
SECCIÓN 2: GUÍA DOCENTE, CRITERIOS Y RÚBRICA (PRIVADO DOCENTE / EVALUACIÓN)
================================================================================
(El alumno NO verá esta sección; Gemini la usa exclusivamente para calificar)

PUNTUACIÓN TOTAL: 100 PUNTOS

REACTIVO 1: DATOS GENERALES (10 puntos)
- Criterio de respuesta:
  * Título: El Principito / Le Petit Prince (5 pts).
  * Autor: Antoine de Saint-Exupéry (5 pts).
- Clave de evaluación: Exacta o con ligeras variaciones ortográficas.

REACTIVO 2: PERSONAJES PRINCIPALES (30 puntos)
- Respuestas esperadas / Personajes válidos:
  El Principito, El Aviador, El Zorro, La Rosa, La Serpiente, El Rey, El Vanidoso, El Bebedor, El Hombre de Negocios, El Farolero, El Geógrafo.
- Niveles de logro:
  * Excelente (30 pts): Menciona al menos 3 personajes válidos con descripción clara de su rol o significado.
  * Satisfactorio (20 pts): Menciona 3 personajes, pero descripciones muy breves o superficiales.
  * En Proceso (10 pts): Menciona solo 1 o 2 personajes, o descripciones erróneas.
  * Requiere Mejora (0 pts): No menciona personajes de la obra o no describe sus roles.

REACTIVO 3: COMPRENSIÓN LECTORA (10 puntos)
- Tipo: Opción múltiple
- Clave correcta: B (Que domesticar significa crear lazos y volverse únicos el uno para el otro).

REACTIVO 4: REFLEXIÓN PERSONAL (20 puntos)
- Criterios específicos:
  * El alumno debe relacionar la frase con el valor de los sentimientos y el afecto por encima de lo material.
  * Debe incluir una conexión válida con la actualidad.
- Niveles de logro:
  * Excelente (20 pts): Interpretación profunda y justificada con conexión clara a la realidad actual.
  * Satisfactorio (14 pts): Explica la frase pero la relación con la actualidad es débil.
  * En Proceso (8 pts): Paráfrasis simple sin profundizar.
  * Requiere Mejora (0 pts): Respuesta incoherente o ajena al tema.

CRITERIOS GENERALES Y TRANSVERSALES (30 puntos distribuidos):
- Redacción y coherencia (15 pts): Ideas claras y conectores lógicos en respuestas abiertas.
- Ortografía y puntuación (15 pts): Uso correcto de mayúsculas, signos y acentuación en abiertas.`;

export function TeacherAssessmentGuide() {
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  return (
    <details className="assessment-guide-details" open={guideOpen} onToggle={(event) => setGuideOpen(event.currentTarget.open)}>
      <summary className="assessment-guide-summary">
        <strong>📘 Guía de estructura y plantilla modelo (.docx)</strong> — Aprende a preparar tu evaluación en 1 solo archivo
      </summary>
      <div className="assessment-guide-body">
        <p>Prepara tu examen o actividad en un <strong>único documento Word (.docx)</strong> con esta estructura recomendada:</p>
        <ol className="assessment-guide-steps">
          <li><strong>Encabezado:</strong> Incluye el nombre de la evaluación (<code>NOMBRE DE LA EVALUACIÓN: ...</code>), el grado y el tiempo sugerido.</li>
          <li><strong>Cuestionario para el alumno:</strong> Redacta los reactivos limpios, con sus consignas e incisos exactos, sin incluir respuestas ni pistas.</li>
          <li><strong>Guía docente y Rúbrica al final:</strong> Añade al final la sección de rúbrica con los puntos (que sumen 100), respuestas esperadas y niveles de logro (Excelente, Satisfactorio, etc.).</li>
        </ol>
        <div className="assessment-guide-actions">
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => {
              void navigator.clipboard.writeText(ASSESSMENT_DOCUMENT_TEMPLATE);
              setCopiedTemplate(true);
              setTimeout(() => setCopiedTemplate(false), 2500);
            }}
          >
            {copiedTemplate ? "✓ ¡Plantilla copiada al portapapeles!" : "Copiar plantilla modelo"}
          </button>
        </div>
        <pre className="assessment-template-pre"><code>{ASSESSMENT_DOCUMENT_TEMPLATE}</code></pre>
      </div>
    </details>
  );
}
