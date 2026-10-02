import type { ExamDefinition } from "./exam-types";

const option = (value: string, label: string) => ({ value, label });

const multi = (id: string, order: number, topic: string, prompt: string, options: string[], correct: string, maxScore: number) => ({
  id,
  order,
  topic,
  type: "opcion_multiple" as const,
  prompt,
  options: options.map((label, index) => option(String.fromCharCode(65 + index), label)),
  correctAnswer: correct,
  maxScore,
  evaluationMethod: "automatic" as const,
});

const open = (id: string, order: number, topic: string, prompt: string, maxScore: number, criteria: Array<{ criterion: string; description: string }>, levels: number[]) => ({
  id,
  order,
  topic,
  type: "abierta" as const,
  prompt,
  options: [],
  maxScore,
  evaluationMethod: "ai" as const,
  rubric: {
    version: "1.0-normalizada",
    aggregation: "average_criteria_level" as const,
    maxScore,
    levels: levels.map((score, index) => ({ level: ["Excelente", "Satisfactorio", "En proceso", "Inicial"][index], score })),
    criteria,
  },
});

const examOne: ExamDefinition = {
  id: "exam-1-esp-1",
  partialId: "partial-1",
  name: "Cazadores de Greenwashing",
  subject: "Español",
  grade: "1°",
  group: "TODOS",
  status: "Publicado",
  durationMinutes: 50,
  maxScore: 100,
  requiresFullscreen: true,
  instructions: "Responde todos los reactivos. El examen dura como máximo 50 minutos. Tus respuestas se guardan automáticamente.",
  questions: [
    multi("ex1-q1", 1, "Reglamento", "¿Cuál es la función principal de un reglamento?", ["A) Contar historias entretenidas", "B) Establecer normas que guíen el comportamiento", "C) Describir sentimientos personales", "D) Persuadir a las personas a comprar"], "B", 5),
    multi("ex1-q2", 2, "Refranes", "Los REFRANES son expresiones que:", ["A) Hablan solo sobre animales", "B) Transmiten sabiduría popular de forma breve", "C) Explican procesos científicos", "D) Relatan eventos históricos"], "B", 5),
    multi("ex1-q3", 3, "Expresiones populares", "¿Cuál es la diferencia fundamental entre un DICHO y un PREGÓN?", ["A) El dicho es muy largo y el pregón es muy corto", "B) El dicho es una expresión con enseñanza; el pregón es un anuncio que se grita en la calle", "C) El dicho solo habla de dinero y el pregón de objetos", "D) No hay diferencia, son sinónimos"], "B", 10),
    {
      id: "ex1-q4", order: 4, topic: "Reglamento, Refranes, Pregón", type: "clasificacion",
      prompt: "Clasifica cada fragmento: 1) Artículo 1: Los estudiantes deben llegar 10 minutos antes. 2) No por mucho madrugar amanece más temprano. 3) ¡Agua, agua fresca! ¡Bebidas para calmar la sed! 4) El que no arriesga no gana. 5) Está prohibido usar teléfono celular durante clase.",
      options: [option("A", "A) Reglamento"), option("B", "B) Refrán"), option("C", "C) Pregón")], correctAnswer: ["A", "B", "C", "B", "A"], maxScore: 20, evaluationMethod: "automatic",
    },
    multi("ex1-q5", 5, "Refranes", "Lee: “De los errores nunca debemos aprender porque nos desmoraliza”. ¿Por qué esta frase contradice la sabiduría popular?", ["A) Porque dice “nunca” cuando debería decir “siempre”", "B) Porque los refranes enseñan que aprender de errores es importante", "C) Porque es muy larga para ser un refrán", "D) Porque usa palabras que no son de la antigüedad"], "B", 12),
    multi("ex1-q6", 6, "Reglamento", "Completa: “Artículo 1: Es necesario _________________________ para crear un ambiente de respeto”.", ["A) contar historias divertidas todos los días", "B) respetar a los compañeros y seguir las normas", "C) traer dinero a la escuela", "D) hablar en voz muy alta constantemente"], "B", 13),
    multi("ex1-q7", 7, "Refranes", "Daniel está triste porque sus amigos ganaron el torneo y él no jugó. Piensa que nunca podrá ser futbolista porque falló una vez. ¿Qué refrán le aconsejaría para motivarlo?", ["A) Más vale prevenir que lamentar", "B) Del dicho al hecho hay un trecho", "C) La práctica hace al maestro", "D) Más vale pájaro en mano que ciento volando"], "C", 13),
    multi("ex1-q8", 8, "Reglamento", "En una biblioteca escolar necesitan crear un reglamento. ¿Cuál es una característica ESENCIAL?", ["A) Ser poético y muy largo", "B) Establecer normas claras y obligatorias", "C) Contar historias sobre la biblioteca", "D) Enseñar cálculo matemático"], "B", 7),
    open("ex1-q9", 9, "Pregón", "Crea un PREGÓN original sobre un tema de tu interés. Debe ser atractivo, memorizable y apropiado para gritarse en la calle o en un mercado. Mínimo 4 líneas. Escribe también el tema elegido.", 15, [
      { criterion: "Claridad y estructura", description: "El pregón es claro, bien estructurado y fácil de recordar." },
      { criterion: "Creatividad y atracción", description: "Es original, atractivo y persuasivo." },
      { criterion: "Características de pregón", description: "Cumple con las características del género pregón." },
      { criterion: "Ortografía y redacción", description: "Presenta redacción y ortografía adecuadas." },
    ], [15, 10, 6, 2]),
  ],
};

const examTwo: ExamDefinition = {
  id: "exam-2-esp-1", partialId: "partial-1", name: "Creadores contra el Cambio Climático", subject: "Español", grade: "2°", group: "TODOS", status: "Publicado", durationMinutes: 50, maxScore: 100, requiresFullscreen: true,
  instructions: "Responde todos los reactivos. El examen dura como máximo 50 minutos. Tus respuestas se guardan automáticamente.",
  questions: [
    multi("ex2-q1", 1, "Historieta", "¿Cuál es la principal característica de una HISTORIETA como género narrativo?", ["A) Usa solo palabras, sin imágenes visuales", "B) Combina secuencias visuales (viñetas) con texto en diálogos", "C) Es siempre de contenido infantil", "D) No puede transmitir mensajes sociales"], "B", 7),
    multi("ex2-q2", 2, "Historieta", "El NARRADOR en una historieta es principalmente:", ["A) La voz del autor real", "B) La perspectiva desde la que se cuenta la historia a través de viñetas", "C) Siempre omnisciente", "D) Una persona que aparece en cada viñeta"], "B", 7),
    multi("ex2-q3", 3, "Comparación de textos", "Cuando COMPARAMOS TEXTOS sobre un mismo tema, buscamos:", ["A) Escribir nuestro propio texto", "B) Identificar similitudes, diferencias y perspectivas distintas de los autores", "C) Determinar cuál es el único correcto", "D) Memorizar información"], "B", 6),
    multi("ex2-q4", 4, "Historieta", "Si transformaras el fragmento de María, el grito y el niño caído en historieta, ¿cuántas viñetas necesitarías mínimo?", ["A) 1 viñeta", "B) 2 viñetas", "C) 3 viñetas: María escucha / ve al niño / corre a ayudar", "D) 5 o más viñetas"], "C", 12),
    multi("ex2-q5", 5, "Historieta", "En la transformación de una narración a historieta se muestran diálogos, pero no el clima ni la expresión de López. ¿Qué elemento se perdió?", ["A) Los diálogos de los personajes", "B) La información sobre clima y emociones internas", "C) El nombre del personaje", "D) La secuencia de eventos"], "B", 13),
    multi("ex2-q6", 6, "Comparación de textos", "El texto científico proporciona datos sobre temperatura y el narrativo cuenta la laguna de Don Jorge. ¿Cuál es el propósito principal de cada texto?", ["A) A=Entretener / B=Informar", "B) A=Proporcionar datos / B=Mostrar impacto humano del clima", "C) A=Criticar / B=Alabar", "D) A=Crear ficción / B=Relatar hechos históricos"], "B", 20),
    multi("ex2-q7", 7, "Diversidad lingüística", "¿Qué es la DIVERSIDAD LINGÜÍSTICA?", ["A) El idioma que habla solamente una persona", "B) La variedad de lenguas y variantes que existen en una región o país", "C) Solo los idiomas antiguos que ya no se hablan", "D) La forma incorrecta de hablar español"], "B", 10),
    multi("ex2-q8", 8, "Diversidad lingüística", "¿Cuál es la diferencia entre LENGUA INDÍGENA y DIALECTO?", ["A) La lengua indígena es de un pueblo originario / Dialecto es variación del español", "B) No hay diferencia, son lo mismo", "C) La lengua indígena solo se habla en otros países", "D) El dialecto es más importante que la lengua indígena"], "A", 10),
    open("ex2-q9", 9, "Historieta", "Transforma el párrafo de Ana, la deforestación, la marcha pacífica y la comunidad en una historieta de 4 viñetas. Describe qué ocurre en cada viñeta e incluye acciones, diálogos o expresiones.", 15, [
      { criterion: "Secuencia narrativa", description: "Las 4 viñetas siguen una secuencia lógica." },
      { criterion: "Elementos visuales descritos", description: "Describe las acciones y elementos principales de cada viñeta." },
      { criterion: "Diálogos y textos", description: "Incluye diálogos o textos adecuados en las viñetas." },
      { criterion: "Claridad y comprensión", description: "La propuesta es clara y comprensible." },
    ], [15, 10, 6, 2]),
  ],
};

const examThree: ExamDefinition = {
  id: "exam-3-esp-1", partialId: "partial-1", name: "Comunicamos la Crisis Climática", subject: "Español", grade: "3°", group: "TODOS", status: "Publicado", durationMinutes: 50, maxScore: 100, requiresFullscreen: true,
  instructions: "Responde todos los reactivos. El examen dura como máximo 50 minutos. Tus respuestas se guardan automáticamente.",
  questions: [
    multi("ex3-q1", 1, "Crónica", "¿Cuál es la principal diferencia entre una CRÓNICA y una NOTICIA?", ["A) La crónica es solo de eventos deportivos", "B) La crónica proporciona contexto, análisis y perspectiva temporal sobre hechos", "C) La noticia es más larga que la crónica", "D) La crónica no puede ser objetiva"], "B", 5),
    multi("ex3-q2", 2, "Crónica", "En una CRÓNICA, la temporalidad se expresa mediante:", ["A) Solo fechas exactas al inicio", "B) Marcadores temporales, verbos en pasado y secuencia de hechos", "C) Solamente en el último párrafo", "D) No es importante en este género"], "B", 5),
    multi("ex3-q3", 3, "Crónica", "¿Cuál de estos elementos NO es característico de una crónica bien escrita?", ["A) Diálogos que muestran perspectivas de personajes", "B) Descripciones detalladas de lugares y momentos", "C) Fantasía y mundos completamente imaginarios", "D) Reflexión del cronista sobre los hechos"], "C", 10),
    multi("ex3-q4", 4, "Crónica", "En “La sequía en la región: un año de cambios”, ¿cuál es el acontecimiento principal?", ["A) Don Manuel cultiva maíz hace treinta años", "B) La sequía que afectó la región durante un año", "C) La comunidad se reúne cada mes", "D) Los campesinos cavan pozos nuevos"], "B", 13),
    multi("ex3-q5", 5, "Crónica", "¿Cuál de estos marcadores temporales aparece en la crónica?", ["A) Mañana llegará la lluvia", "B) Hace un año, Para abril y Para mayo", "C) Nunca llegó la lluvia", "D) Ayer fue muy caluroso"], "B", 12),
    multi("ex3-q6", 6, "Plan de lectura", "Debes leer 3 textos sobre crisis climática en 2 semanas. ¿Cuál es la mejor estrategia para maximizar tu comprensión?", ["A) Leer todo de una vez sin parar", "B) Distribuir la lectura en días, tomar notas y reflexionar sobre lo leído", "C) Solo leer los títulos", "D) Esperar hasta el último día"], "B", 15),
    multi("ex3-q7", 7, "Formularios", "El formulario de investigación sobre conciencia ambiental pregunta edad, municipio, consumo diario de agua y cambios climáticos. ¿Cuál es su propósito principal?", ["A) Vender productos ecológicos", "B) Recopilar datos sobre consumo de agua y percepción de cambios climáticos", "C) Castigar a quienes consumen mucha agua", "D) Contar cuánta gente vive en cada municipio"], "B", 15),
    open("ex3-q8", 8, "Crónica", "Escribe una crónica de 200 a 300 palabras sobre un día de lluvia después de la sequía o cualquier evento ambiental de tu comunidad. Incluye un acontecimiento real o verosímil, marcadores temporales claros, contexto, recursos narrativos, coherencia y ortografía.", 25, [
      { criterion: "Contenido y estructura", description: "Narra con claridad un evento real o verosímil." },
      { criterion: "Temporalidad", description: "Usa marcadores temporales frecuentes y claros." },
      { criterion: "Recursos narrativos", description: "Integra diálogos, descripciones o reflexión." },
      { criterion: "Coherencia y cohesión", description: "El texto es fluido, conectado y lógico." },
      { criterion: "Ortografía y puntuación", description: "Presenta ortografía y puntuación adecuadas." },
    ], [25, 18, 11, 5]),
  ],
};

export const demoExams: ExamDefinition[] = [examOne, examTwo, examThree];

export const demoStudents = [
  { id: "DEMO-1", name: "Alumno de demostración · 1° A", grade: "1°", group: "A" },
  { id: "DEMO-2", name: "Alumno de demostración · 2° A", grade: "2°", group: "A" },
  { id: "DEMO-3", name: "Alumno de demostración · 3° A", grade: "3°", group: "A" },
];
