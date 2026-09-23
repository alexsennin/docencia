/**
 * Puente privado para la aplicación Docencia.
 *
 * Despliegue recomendado:
 * - Ejecutar como la cuenta propietaria de la hoja.
 * - Acceso: cualquier usuario con el enlace.
 * - Configurar en Propiedades del proyecto: SPREADSHEET_ID, BRIDGE_TOKEN y EXAM_UNLOCK_PASSWORD.
 * - El token nunca se guarda en el repositorio.
 */
function doPost(e) {
  try {
    var request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    authorize_(request.token);
    var result = dispatch_(request.action, request.payload || {});
    return json_({ ok: true, data: result });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) });
  }
}

function authorize_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('BRIDGE_TOKEN');
  if (!expected || !token || token !== expected) throw new Error('No autorizado');
}

function dispatch_(action, payload) {
  if (action === 'lookupStudent') return lookupStudent_(payload.studentId);
  if (action === 'getExamDefinition') return getExamDefinition_(payload.examId);
  if (action === 'startAttempt') return startAttempt_(payload);
  if (action === 'saveAnswers') return saveAnswers_(payload);
  if (action === 'examEvent') return examEvent_(payload);
  if (action === 'unlockAttempt') return unlockAttempt_(payload);
  if (action === 'submitAttempt') return submitAttempt_(payload);
  if (action === 'finalizeAttempt') return finalizeAttempt_(payload);
  throw new Error('Acción no soportada: ' + action);
}

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Falta SPREADSHEET_ID');
  return SpreadsheetApp.openById(id);
}

function rows_(name) {
  var values = sheet_().getSheetByName(name).getDataRange().getDisplayValues();
  if (!values.length) return [];
  var headers = values.shift();
  return values.filter(function(row) { return row.some(function(value) { return value !== ''; }); }).map(function(row, index) {
    var object = { _row: index + 2 };
    headers.forEach(function(header, column) { object[header] = row[column] || ''; });
    return object;
  });
}

function publicExam_(exam, questions) {
  return {
    id: exam.examen_id, partialId: exam.parcial_id, name: exam.nombre, subject: exam.materia,
    grade: exam.grado, group: exam.grupo, status: exam.estado, durationMinutes: Number(exam.duracion_minutos || 50),
    maxScore: Number(exam.puntaje_maximo || 100), requiresFullscreen: String(exam.requiere_pantalla_completa).toUpperCase() === 'TRUE',
    instructions: exam.instrucciones, questions: questions.map(function(item) {
      var options = [];
      try { options = JSON.parse(item.opciones_json || '[]').map(function(label) { return { value: String(label).slice(0, 1), label: label }; }); } catch (_) {}
      return { id: item.reactivo_id, order: Number(item.orden), topic: item.tema, type: item.tipo, prompt: item.consigna, options: options, maxScore: Number(item.puntaje_maximo), evaluationMethod: item.metodo_evaluacion };
    }),
  };
}

function lookupStudent_(studentId) {
  var students = rows_('Registros');
  var student = students.find(function(item) { return String(item.id).trim().toUpperCase() === String(studentId || '').trim().toUpperCase(); });
  if (!student) throw new Error('No se encontró el ID escolar');
  var exams = rows_('EXAMENES').filter(function(exam) {
    return exam.estado === 'Publicado' && exam.grado === student.grado && (exam.grupo === 'TODOS' || exam.grupo === student.grupo);
  });
  var questions = rows_('REACTIVOS');
  return { student: { id: student.id, name: student.nombre, grade: student.grado, group: student.grupo }, exams: exams.map(function(exam) { return publicExam_(exam, questions.filter(function(item) { return item.examen_id === exam.examen_id && String(item.activo).toUpperCase() !== 'FALSE'; })); }) };
}

function getExamDefinition_(examId) {
  var exam = rows_('EXAMENES').find(function(item) { return item.examen_id === examId && item.estado === 'Publicado'; });
  if (!exam) throw new Error('Examen no encontrado');
  var questions = rows_('REACTIVOS').filter(function(item) { return item.examen_id === examId && String(item.activo).toUpperCase() !== 'FALSE'; });
  return { exam: privateExam_(exam, questions) };
}

function privateExam_(exam, questions) {
  var publicExam = publicExam_(exam, questions);
  publicExam.questions = questions.map(function(item) {
    var question = publicExam.questions.find(function(candidate) { return candidate.id === item.reactivo_id; });
    var correct = item.respuesta_correcta || '';
    try { correct = JSON.parse(correct); } catch (_) {}
    var rubric = null;
    try { rubric = item.rubrica ? JSON.parse(item.rubrica) : null; } catch (_) {}
    return Object.assign({}, question, { correctAnswer: correct, rubric: rubric });
  });
  return publicExam;
}

function startAttempt_(payload) {
  var lookup = lookupStudent_(payload.studentId);
  var exam = lookup.exams.find(function(item) { return item.id === payload.examId; });
  if (!exam) throw new Error('El examen no está asignado a este alumno');
  var startedAt = new Date();
  var deadlineAt = new Date(startedAt.getTime() + exam.durationMinutes * 60000);
  var attemptId = 'attempt-' + Utilities.getUuid();
  append_('INTENTOS', [attemptId, exam.id, exam.partialId, lookup.student.id, lookup.student.group, 'Activo', startedAt.toISOString(), '', exam.durationMinutes, '', '', '', '', 'true', 'false', startedAt.toISOString(), startedAt.toISOString()]);
  append_('EVENTOS', ['event-' + Utilities.getUuid(), 'exam_started', 'INTENTOS', attemptId, exam.partialId, lookup.student.id, lookup.student.id, JSON.stringify({ examId: exam.id }), startedAt.toISOString()]);
  return { attemptId: attemptId, startedAt: startedAt.toISOString(), deadlineAt: deadlineAt.toISOString(), exam: exam };
}

function saveAnswers_(payload) {
  var answers = payload.answers || {};
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    Object.keys(answers).forEach(function(reactivoId) {
      var value = Array.isArray(answers[reactivoId]) ? JSON.stringify(answers[reactivoId]) : String(answers[reactivoId] || '');
      upsert_('RESPUESTAS', ['intento_id', 'reactivo_id'], [payload.attemptId, reactivoId], [
        'answer-' + Utilities.getUuid(), payload.attemptId, reactivoId, payload.studentId, value, value ? 'Guardada' : 'Sin_respuesta', '', '', '', '', new Date().toISOString()
      ]);
    });
    return { savedAt: new Date().toISOString() };
  } finally { lock.releaseLock(); }
}

function examEvent_(payload) {
  append_('EVENTOS', ['event-' + Utilities.getUuid(), String(payload.event || 'exam_event'), 'INTENTOS', payload.attemptId || '', payload.partialId || '', payload.studentId || '', payload.studentId || '', JSON.stringify(payload), payload.at || new Date().toISOString()]);
  if (payload.event === 'window_blur' || payload.event === 'visibility_hidden' || payload.event === 'fullscreen_exit') updateById_('INTENTOS', 'intento_id', payload.attemptId, { bloqueo_activo: 'true', estado: 'Bloqueado', updated_at: new Date().toISOString() });
  return { recorded: true };
}

function unlockAttempt_(payload) {
  var expected = PropertiesService.getScriptProperties().getProperty('EXAM_UNLOCK_PASSWORD');
  if (!expected || payload.password !== expected) throw new Error('Contraseña incorrecta');
  updateById_('INTENTOS', 'intento_id', payload.attemptId, { bloqueo_activo: 'false', estado: 'Activo', updated_at: new Date().toISOString() });
  append_('EVENTOS', ['event-' + Utilities.getUuid(), 'exam_unlocked', 'INTENTOS', payload.attemptId, '', '', 'docente', JSON.stringify({}), new Date().toISOString()]);
  return { ok: true, unlockedAt: new Date().toISOString() };
}

function submitAttempt_(payload) {
  saveAnswers_(payload);
  updateById_('INTENTOS', 'intento_id', payload.attemptId, { estado: 'Provisional', fin_at: new Date().toISOString(), bloqueo_activo: 'false', updated_at: new Date().toISOString() });
  return { accepted: true, aiPending: true, submittedAt: new Date().toISOString(), message: 'Intento guardado. La evaluación abierta queda pendiente de IA y revisión docente.' };
}

function finalizeAttempt_(payload) {
  var result = payload.result || {};
  var answers = payload.answers || {};
  var exam = getExamDefinition_(payload.examId).exam;
  var questionById = {};
  exam.questions.forEach(function(question) { questionById[question.id] = question; });
  Object.keys(questionById).forEach(function(reactivoId) {
    var question = questionById[reactivoId];
    var item = (result.items || []).find(function(candidate) { return candidate.questionId === reactivoId; }) || {};
    var answer = Array.isArray(answers[reactivoId]) ? JSON.stringify(answers[reactivoId]) : String(answers[reactivoId] || '');
    upsert_('RESPUESTAS', ['intento_id', 'reactivo_id'], [payload.attemptId, reactivoId], [
      'answer-' + Utilities.getUuid(), payload.attemptId, reactivoId, payload.studentId, answer,
      answer ? 'Respondida' : 'Sin_respuesta', item.score === null || item.score === undefined ? '' : item.score,
      question.evaluationMethod, item.feedback || '', item.status === 'pendiente_ia' ? 'Pendiente' : 'Evaluada', new Date().toISOString()
    ]);
    if (question.evaluationMethod === 'ai') {
      upsert_('EVALUACION_AI', ['intento_id', 'reactivo_id'], [payload.attemptId, reactivoId], [
        'ai-' + Utilities.getUuid(), payload.attemptId, reactivoId, payload.model || 'gemini-3.6-flash', '1.0', JSON.stringify({ answer: answers[reactivoId], rubric: question.rubric }), item.status === 'pendiente_ia' ? 'Pendiente' : 'Evaluada', item.score === null || item.score === undefined ? '' : item.score, item.feedback || '', JSON.stringify(item), '', new Date().toISOString(), ''
      ]);
    }
  });
  updateById_('INTENTOS', 'intento_id', payload.attemptId, {
    estado: result.aiPending ? 'Provisional' : 'Definitivo',
    fin_at: result.submittedAt || new Date().toISOString(),
    puntaje_automatico: result.automaticScore === null || result.automaticScore === undefined ? '' : result.automaticScore,
    puntaje_ai: result.aiScore === null || result.aiScore === undefined ? '' : result.aiScore,
    puntaje_total: result.totalScore === null || result.totalScore === undefined ? '' : result.totalScore,
    calificacion_10: result.grade10 === null || result.grade10 === undefined ? '' : result.grade10,
    ai_pendiente: result.aiPending ? 'true' : 'false', bloqueo_activo: 'false', updated_at: new Date().toISOString(),
  });
  return { ok: true, finalizedAt: new Date().toISOString() };
}

function append_(name, values) {
  var tab = sheet_().getSheetByName(name);
  tab.getRange(tab.getLastRow() + 1, 1, 1, values.length).setValues([values]);
}

function upsert_(name, keys, keyValues, values) {
  var tab = sheet_().getSheetByName(name);
  var all = tab.getDataRange().getValues();
  var headers = all.shift();
  var rowIndex = all.findIndex(function(row) { return keys.every(function(key, index) { return String(row[headers.indexOf(key)] || '') === String(keyValues[index]); }); });
  if (rowIndex >= 0) tab.getRange(rowIndex + 2, 1, 1, values.length).setValues([values]); else append_(name, values);
}

function updateById_(name, idHeader, idValue, changes) {
  var tab = sheet_().getSheetByName(name);
  var all = tab.getDataRange().getValues();
  var headers = all.shift();
  var idColumn = headers.indexOf(idHeader);
  var rowIndex = all.findIndex(function(row) { return String(row[idColumn] || '') === String(idValue); });
  if (rowIndex < 0) return;
  Object.keys(changes).forEach(function(key) { var column = headers.indexOf(key); if (column >= 0) tab.getRange(rowIndex + 2, column + 1).setValue(changes[key]); });
}

function json_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
