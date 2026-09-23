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
  if (action === 'listExamResults') return listExamResults_();
  if (action === 'getGeminiConfig') return getGeminiConfig_();
  if (action === 'setGeminiConfig') return setGeminiConfig_(payload);
  if (action === 'testGeminiConnection') return testGeminiConnection_();
  if (action === 'evaluateOpenAnswer') return evaluateOpenAnswer_(payload);
  if (action === 'getExamDefinition') return getExamDefinition_(payload.examId);
  if (action === 'startAttempt') return startAttempt_(payload);
  if (action === 'saveAnswers') return saveAnswers_(payload);
  if (action === 'examEvent') return examEvent_(payload);
  if (action === 'unlockAttempt') return unlockAttempt_(payload);
  if (action === 'revokeExam') return revokeExam_(payload);
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
  var assignments = rows_('EXAMEN_ASIGNACIONES').filter(function(item) {
    return String(item.alumno_id).trim().toUpperCase() === String(student.id).trim().toUpperCase() && String(item.estado).toUpperCase() === 'ACTIVO';
  });
  var assignedExamIds = assignments.map(function(item) { return item.examen_id; });
  var exams = rows_('EXAMENES').filter(function(exam) {
    return exam.estado === 'Publicado' && (assignedExamIds.indexOf(exam.examen_id) >= 0 || (exam.grado === student.grado && (exam.grupo === 'TODOS' || exam.grupo === student.grupo)));
  });
  var questions = rows_('REACTIVOS');
  var attempts = rows_('INTENTOS').filter(function(item) { return sameId_(item.alumno_id, student.id); });
  return { student: { id: student.id, name: student.nombre, grade: student.grado, group: student.grupo }, exams: exams.map(function(exam) {
    var publicExam = publicExam_(exam, questions.filter(function(item) { return item.examen_id === exam.examen_id && String(item.activo).toUpperCase() !== 'FALSE'; }));
    var related = attempts.filter(function(item) { return item.examen_id === exam.examen_id; });
    var attempt = related.find(function(item) { return item.estado !== 'Activo' && item.estado !== 'Bloqueado'; }) || related[0];
    publicExam.attemptStatus = attempt ? attempt.estado : 'Disponible';
    return publicExam;
  }) };
}

function sameId_(a, b) { return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase(); }

function getGeminiConfig_() {
  var properties = PropertiesService.getScriptProperties();
  return { configured: Boolean(properties.getProperty('GEMINI_API_KEY')), model: properties.getProperty('GEMINI_MODEL') || 'gemini-3.6-flash' };
}

function setGeminiConfig_(payload) {
  var model = String(payload.model || '').trim();
  if (!/^gemini-[a-z0-9.-]{2,80}$/i.test(model)) throw new Error('Escribe un nombre de modelo Gemini válido.');
  var properties = PropertiesService.getScriptProperties();
  var apiKey = String(payload.apiKey || '').trim();
  if (apiKey && (apiKey.length < 20 || apiKey.length > 256)) throw new Error('La clave API no tiene un formato válido.');
  if (apiKey) properties.setProperty('GEMINI_API_KEY', apiKey);
  if (!apiKey && !properties.getProperty('GEMINI_API_KEY')) throw new Error('Captura una clave API de Gemini para configurarla.');
  properties.setProperty('GEMINI_MODEL', model);
  return getGeminiConfig_();
}

function testGeminiConnection_() {
  var properties = PropertiesService.getScriptProperties();
  var apiKey = properties.getProperty('GEMINI_API_KEY');
  var model = properties.getProperty('GEMINI_MODEL') || 'gemini-3.6-flash';
  if (!apiKey) throw new Error('Primero guarda una clave API de Gemini.');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  var response;
  try {
    response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ parts: [{ text: 'Responde únicamente: OK' }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } }) });
  } catch (_) { throw new Error('No se pudo conectar con Gemini. Revisa que Apps Script tenga autorización para conectarse.'); }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Gemini no aceptó la solicitud (HTTP ' + response.getResponseCode() + '). Revisa el modelo, el estado de la API y la clave.');
  return { connected: true, model: model };
}

function authorizeGeminiConnection() {
  UrlFetchApp.getRequest('https://generativelanguage.googleapis.com');
  return { authorizationReady: true };
}

function evaluateOpenAnswer_(payload) {
  var examResult = getExamDefinition_(payload.examId);
  var exam = examResult.exam;
  var question = exam.questions.find(function(item) { return item.id === payload.questionId && item.evaluationMethod === 'ai'; });
  if (!question) throw new Error('Reactivo abierto no encontrado.');
  if (payload.attemptId) {
    var attempt = activeAttempt_(payload);
    if (attempt.examen_id !== exam.id) throw new Error('Intento no autorizado para este examen.');
  }
  var properties = PropertiesService.getScriptProperties();
  var apiKey = properties.getProperty('GEMINI_API_KEY');
  var model = properties.getProperty('GEMINI_MODEL') || 'gemini-3.6-flash';
  if (!apiKey) throw new Error('La clave de Gemini aún no está configurada.');
  var prompt = 'Evalúa la respuesta de un alumno de Español usando exclusivamente la consigna y rúbrica. Devuelve JSON con score, level, feedback, strengths y opportunities. score debe ser numérico entre 0 y ' + question.maxScore + '.\nExamen: ' + exam.name + '\nConsigna: ' + question.prompt + '\nRespuesta: ' + JSON.stringify(payload.answer || '') + '\nRúbrica: ' + JSON.stringify(question.rubric || {});
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  var response;
  try {
    response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }) });
  } catch (_) { throw new Error('No se pudo conectar con Gemini.'); }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('La evaluación Gemini falló (HTTP ' + response.getResponseCode() + ').');
  var body = JSON.parse(response.getContentText());
  var text = body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts && body.candidates[0].content.parts[0] && body.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini no devolvió una evaluación.');
  var evaluation = JSON.parse(String(text).replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
  evaluation.score = Math.max(0, Math.min(question.maxScore, Number(evaluation.score) || 0));
  return { evaluation: evaluation, model: model };
}

function listExamResults_() {
  var students = rows_('Registros');
  var exams = rows_('EXAMENES');
  var answers = rows_('RESPUESTAS');
  var results = rows_('INTENTOS').filter(function(item) { return item.estado === 'Definitivo' || item.estado === 'Provisional'; });
  return { results: results.map(function(item) {
    var student = students.find(function(candidate) { return sameId_(candidate.id, item.alumno_id); }) || {};
    var exam = exams.find(function(candidate) { return candidate.examen_id === item.examen_id; }) || {};
    return { attemptId: item.intento_id, studentId: item.alumno_id, studentName: student.nombre || item.alumno_id,
      grade: student.grado || exam.grado || '', group: item.grupo || student.grupo || '', examId: item.examen_id,
      examName: exam.nombre || item.examen_id, partialId: item.parcial_id, status: item.estado,
      score: item.puntaje_total === '' ? null : Number(item.puntaje_total), grade10: item.calificacion_10 === '' ? null : Number(item.calificacion_10),
      automaticScore: item.puntaje_automatico === '' ? null : Number(item.puntaje_automatico), aiPending: String(item.ai_pendiente).toLowerCase() === 'true',
      submittedAt: item.fin_at, answers: answers.filter(function(answer) { return answer.intento_id === item.intento_id; }).map(function(answer) {
        return { questionId: answer.reactivo_id, answer: answer.respuesta, score: answer.puntaje_obtenido === '' ? null : Number(answer.puntaje_obtenido), feedback: answer.retroalimentacion, status: answer.estado_respuesta };
      }) };
  }) };
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
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var lookup = lookupStudent_(payload.studentId);
    var exam = lookup.exams.find(function(item) { return item.id === payload.examId; });
    if (!exam) throw new Error('El examen no está asignado a este alumno');
    var related = rows_('INTENTOS').filter(function(item) { return sameId_(item.alumno_id, lookup.student.id) && item.examen_id === exam.id; });
    var existing = related.find(function(item) { return item.estado !== 'Activo' && item.estado !== 'Bloqueado'; }) || related[0];
    if (existing && (existing.estado === 'Activo' || existing.estado === 'Bloqueado')) {
      var saved = {};
      rows_('RESPUESTAS').filter(function(item) { return item.intento_id === existing.intento_id; }).forEach(function(item) {
        var value = item.respuesta;
        try { if (String(value).charAt(0) === '[') value = JSON.parse(value); } catch (_) {}
        saved[item.reactivo_id] = value;
      });
      var originalStart = new Date(existing.inicio_at);
      return { attemptId: existing.intento_id, startedAt: originalStart.toISOString(), deadlineAt: new Date(originalStart.getTime() + Number(existing.tiempo_limite_min || 50) * 60000).toISOString(), exam: exam, answers: saved, locked: existing.estado === 'Bloqueado', resumed: true };
    }
    if (existing) throw new Error('Este examen ya fue presentado. Solicita al docente que lo revoque si necesitas repetirlo.');
    var startedAt = new Date();
    var deadlineAt = new Date(startedAt.getTime() + exam.durationMinutes * 60000);
    var attemptId = 'attempt-' + Utilities.getUuid();
    append_('INTENTOS', [attemptId, exam.id, exam.partialId, lookup.student.id, lookup.student.group, 'Activo', startedAt.toISOString(), '', exam.durationMinutes, '', '', '', '', 'true', 'false', startedAt.toISOString(), startedAt.toISOString()]);
    append_('EVENTOS', ['event-' + Utilities.getUuid(), 'exam_started', 'INTENTOS', attemptId, exam.partialId, lookup.student.id, lookup.student.id, JSON.stringify({ examId: exam.id }), startedAt.toISOString()]);
    return { attemptId: attemptId, startedAt: startedAt.toISOString(), deadlineAt: deadlineAt.toISOString(), exam: exam };
  } finally { lock.releaseLock(); }
}

function activeAttempt_(payload) {
  var attempt = rows_('INTENTOS').find(function(item) { return item.intento_id === payload.attemptId; });
  if (!attempt || !sameId_(attempt.alumno_id, payload.studentId) || attempt.examen_id !== payload.examId) throw new Error('Intento no autorizado');
  if (attempt.estado !== 'Activo' && attempt.estado !== 'Bloqueado') throw new Error('El examen ya fue enviado');
  return attempt;
}

function saveAnswers_(payload) {
  var answers = payload.answers || {};
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var attempt = activeAttempt_(payload);
    var allowed = rows_('REACTIVOS').filter(function(item) { return item.examen_id === attempt.examen_id; }).map(function(item) { return item.reactivo_id; });
    Object.keys(answers).forEach(function(reactivoId) {
      if (allowed.indexOf(reactivoId) < 0) throw new Error('Reactivo no autorizado');
      var value = Array.isArray(answers[reactivoId]) ? JSON.stringify(answers[reactivoId]) : String(answers[reactivoId] || '');
      upsert_('RESPUESTAS', ['intento_id', 'reactivo_id'], [payload.attemptId, reactivoId], [
        'answer-' + Utilities.getUuid(), payload.attemptId, reactivoId, payload.studentId, value, value ? 'Guardada' : 'Sin_respuesta', '', '', '', '', new Date().toISOString()
      ]);
    });
    return { savedAt: new Date().toISOString() };
  } finally { lock.releaseLock(); }
}

function examEvent_(payload) {
  var attempt = activeAttempt_(payload);
  append_('EVENTOS', ['event-' + Utilities.getUuid(), String(payload.event || 'exam_event'), 'INTENTOS', payload.attemptId || '', payload.partialId || '', payload.studentId || '', payload.studentId || '', JSON.stringify(payload), payload.at || new Date().toISOString()]);
  if (payload.event === 'window_blur' || payload.event === 'visibility_hidden' || payload.event === 'fullscreen_exit') updateById_('INTENTOS', 'intento_id', attempt.intento_id, { bloqueo_activo: 'true', estado: 'Bloqueado', updated_at: new Date().toISOString() });
  return { recorded: true };
}

function unlockAttempt_(payload) {
  assertTeacherPassword_(payload.password);
  var attempt = rows_('INTENTOS').find(function(item) { return item.intento_id === payload.attemptId && item.estado === 'Bloqueado'; });
  if (!attempt) throw new Error('No hay un intento bloqueado para desbloquear');
  updateById_('INTENTOS', 'intento_id', payload.attemptId, { bloqueo_activo: 'false', estado: 'Activo', updated_at: new Date().toISOString() });
  append_('EVENTOS', ['event-' + Utilities.getUuid(), 'exam_unlocked', 'INTENTOS', payload.attemptId, '', '', 'docente', JSON.stringify({}), new Date().toISOString()]);
  return { ok: true, unlockedAt: new Date().toISOString() };
}

function assertTeacherPassword_(password) {
  var expected = PropertiesService.getScriptProperties().getProperty('EXAM_UNLOCK_PASSWORD');
  if (!expected || password !== expected) throw new Error('Contraseña incorrecta');
}

function revokeExam_(payload) {
  assertTeacherPassword_(payload.password);
  if (!payload.studentId || !payload.examId) throw new Error('Alumno y examen son obligatorios');
  var exam = rows_('EXAMENES').find(function(item) { return item.examen_id === payload.examId; });
  if (!exam) throw new Error('Examen no encontrado');
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var attempts = rows_('INTENTOS').filter(function(item) {
      return sameId_(item.alumno_id, payload.studentId) && item.examen_id === payload.examId &&
        (item.estado === 'Definitivo' || item.estado === 'Provisional');
    });
    if (!attempts.length) throw new Error('El alumno ya no tiene intentos entregados de este examen para revocar. Actualiza la búsqueda e inténtalo de nuevo.');
    var attemptIds = {};
    attempts.forEach(function(item) { attemptIds[item.intento_id] = true; });
    var deletedAnswers = deleteRowsByIds_('RESPUESTAS', 'intento_id', attemptIds);
    var deletedAi = deleteRowsByIds_('EVALUACION_AI', 'intento_id', attemptIds);
    var deletedAttempts = deleteRowsByIds_('INTENTOS', 'intento_id', attemptIds);
    append_('EVENTOS', ['event-' + Utilities.getUuid(), 'exam_revoked', 'EXAMENES', payload.examId, exam.parcial_id || '', payload.studentId, 'docente', JSON.stringify({ attemptIds: Object.keys(attemptIds), deletedAnswers: deletedAnswers, deletedAi: deletedAi, deletedAttempts: deletedAttempts }), new Date().toISOString()]);
    return { ok: true, examId: payload.examId, studentId: payload.studentId, deletedAnswers: deletedAnswers, deletedAi: deletedAi, deletedAttempts: deletedAttempts, canRetake: true };
  } finally { lock.releaseLock(); }
}

function deleteRowsByIds_(name, key, ids) {
  var tab = sheet_().getSheetByName(name);
  var all = tab.getDataRange().getValues();
  var headers = all.shift();
  var column = headers.indexOf(key);
  if (column < 0) return 0;
  var rowNumbers = [];
  all.forEach(function(row, index) { if (ids[String(row[column] || '')]) rowNumbers.push(index + 2); });
  rowNumbers.sort(function(a, b) { return b - a; }).forEach(function(rowNumber) { tab.deleteRow(rowNumber); });
  return rowNumbers.length;
}

function submitAttempt_(payload) {
  saveAnswers_(payload);
  updateById_('INTENTOS', 'intento_id', payload.attemptId, { estado: 'Provisional', fin_at: new Date().toISOString(), bloqueo_activo: 'false', updated_at: new Date().toISOString() });
  return { accepted: true, aiPending: true, submittedAt: new Date().toISOString(), message: 'Intento guardado. La evaluación abierta queda pendiente de IA y revisión docente.' };
}

function finalizeAttempt_(payload) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
  activeAttempt_(payload);
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
        'ai-' + Utilities.getUuid(), payload.attemptId, reactivoId, PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || payload.model || 'gemini-3.6-flash', '1.0', JSON.stringify({ answer: answers[reactivoId], rubric: question.rubric }), item.status === 'pendiente_ia' ? 'Pendiente' : 'Evaluada', item.score === null || item.score === undefined ? '' : item.score, item.feedback || '', JSON.stringify(item), '', new Date().toISOString(), ''
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
  } finally { lock.releaseLock(); }
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
