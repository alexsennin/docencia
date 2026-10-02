import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const source = fs.readFileSync(new URL('../integrations/google-sheets-bridge/Code.gs', import.meta.url), 'utf8');
function harness() {
  const tables = { Registros: [{ id: 'fictional-1', grado: '1', grupo: 'A', nombre: 'Ficticio' }, { id: 'fictional-2', grado: '1', grupo: 'B', nombre: 'Otro ficticio' }], SESIONES_CLASE: [{ sesion_id: 's1', parcial_id: 'p1', grupo: '1 A', estado: 'Impartida', fecha_clase: '2026-09-30' }], CONDUCTA_ACTITUD: [], CALIFICACIONES: [], ASISTENCIAS: [] };
  const props = new Map();
  const c = vm.createContext({ console, Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_, input) => [...createHash('sha256').update(input).digest()], getUuid: () => crypto.randomUUID() }, PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k), setProperty: (k,v) => props.set(k,v), deleteProperty: k => props.delete(k) }) }, LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) }, ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased(){return this}, everyMinutes(){return this}, create(){} }) } });
  vm.runInContext(source, c);
  c.rows_ = name => tables[name] || [];
  c.findPartial_ = () => ({ parcial_id:'p1', estado:'Abierto' });
  c.findStudent_ = id => tables.Registros.find(s=>s.id===id);
  c.logAcademicEvent_ = () => {};
  c.storeRecord_ = (table,keys,values,record) => { let row=tables[table].find(r=>keys.every((key,i)=>r[key]===values[i])); if (!row) { row={}; tables[table].push(row); } Object.assign(row,record); };
  return {c,tables,props};
}
test('sin comentarios guarda cinco dieces y CA 100; una segunda evaluación no invoca IA', () => {
  const {c,tables}=harness(); c.requestAiJson_=()=>{throw Error('No debe invocar IA')};
  c.generateCaRubric_({partialId:'p1',studentId:'fictional-1',autoSave:true});
  const row=tables.CONDUCTA_ACTITUD[0];
  assert.equal(row.estado,'Evaluada_ai'); assert.deepEqual(JSON.parse(row.rubrica_criterios_json).map(x=>x.puntuacion),[10,10,10,10,10]); assert.equal(tables.CALIFICACIONES[0].calificacion_ca,100);
  assert.equal(c.generateCaRubric_({partialId:'p1',studentId:'fictional-1',autoSave:true}).skipped,true);
});
test('grupo aislado, comentarios corregidos y eliminados vuelven a entrar en evaluación', () => {
  const {c,tables,props}=harness();
  c.generateCaRubric_({partialId:'p1',studentId:'fictional-1',autoSave:true});
  assert.equal(c.startCaRubricJob_({partialId:'p1',group:'1 A',autoSave:true}).status,'Sin_pendientes');
  tables.CONDUCTA_ACTITUD.push({registro_id:'note1',parcial_id:'p1',alumno_id:'fictional-1',sesion_id:'s1',tipo:'Anotacion',observacion:'Dejó papeles en su lugar.',estado:'Registrada'});
  const job=c.startCaRubricJob_({partialId:'p1',group:'1 A',autoSave:true});assert.equal(job.total,1);
  assert.deepEqual(JSON.parse(props.get('CA_RUBRIC_BACKGROUND_JOB')).studentIds,['fictional-1']);
  c.requestAiJson_=prompt=>{assert.ok(prompt.includes('orden, limpieza'));return {model:'fixture',data:{criterios:[1,2,3,4,5].map(indice=>({indice,puntuacion:indice===1?9:10,evidencias:indice===1?['note1']:[],justificacion:'Evidencia ficticia'}))}}};
  c.runCaRubricJob_();assert.equal(c.getCaRubricJob_().status,'Completado');assert.equal(tables.CONDUCTA_ACTITUD[0].puntuacion,9.8);
  tables.CONDUCTA_ACTITUD[1].estado='Anulada';assert.equal(c.startCaRubricJob_({partialId:'p1',group:'1 A',autoSave:true}).total,1);c.runCaRubricJob_();assert.equal(tables.CONDUCTA_ACTITUD[0].puntuacion,10);
});
test('rechaza reducción sin evidencia y no guarda una nota inválida', () => {
  const {c,tables}=harness();tables.CONDUCTA_ACTITUD.push({registro_id:'note1',parcial_id:'p1',alumno_id:'fictional-1',sesion_id:'s1',tipo:'Anotacion',observacion:'Comentario ficticio',estado:'Registrada'});
  c.requestAiJson_=()=>({model:'fixture',data:{criterios:[1,2,3,4,5].map(indice=>({indice,puntuacion:9,evidencias:[],justificacion:'Inválida'}))}});
  assert.throws(()=>c.generateCaRubric_({partialId:'p1',studentId:'fictional-1',autoSave:true}),/sin citar evidencia/);assert.equal(tables.CALIFICACIONES.length,0);
});

test('un job activo impide otro y no cambia el grupo en proceso', () => {
  const {c}=harness();
  c.startCaRubricJob_({partialId:'p1',group:'1 A',autoSave:true});
  assert.throws(()=>c.startCaRubricJob_({partialId:'p1',group:'1 B',autoSave:true}),/en curso/);
  assert.equal(c.getCaRubricJob_().group,'1 A');
});


test('puntualidad cuenta retardos del alumno y parcial una vez por sesión; corregirlos permite reevaluar', () => {
  const {c,tables}=harness();
  tables.ASISTENCIAS.push(
    {asistencia_id:'late1',alumno_id:'fictional-1',parcial_id:'p1',sesion_id:'s1',estado:'R'},
    {asistencia_id:'duplicate',alumno_id:'fictional-1',parcial_id:'p1',sesion_id:'s1',estado:'Retardo'},
    {asistencia_id:'other-partial',alumno_id:'fictional-1',parcial_id:'p2',sesion_id:'s1',estado:'R'},
    {asistencia_id:'other-student',alumno_id:'fictional-2',parcial_id:'p1',sesion_id:'s1',estado:'R'},
    {asistencia_id:'absence',alumno_id:'fictional-1',parcial_id:'p1',sesion_id:'s1',estado:'I'});
  assert.equal(c.caRubricEvidence_('p1','fictional-1','1 A').tardies.length,1);
  c.requestAiJson_=prompt=>{assert.ok(prompt.includes('cantidad: 1'));return {model:'fixture',data:{criterios:[1,2,3,4,5].map(indice=>({indice,puntuacion:indice===2?9:10,evidencias:indice===2?['late1']:[],justificacion:'Llegada tarde documentada'}))}}};
  c.startCaRubricJob_({partialId:'p1',group:'1 A',autoSave:true});c.runCaRubricJob_();
  assert.deepEqual(JSON.parse(tables.CONDUCTA_ACTITUD[0].rubrica_criterios_json).map(x=>x.puntuacion),[10,9,10,10,10]);
  tables.ASISTENCIAS[0].estado='P';tables.ASISTENCIAS[1].estado='P';
  assert.equal(c.startCaRubricJob_({partialId:'p1',group:'1 A',autoSave:true}).total,1);c.runCaRubricJob_();
  assert.equal(tables.CONDUCTA_ACTITUD[0].puntuacion,10);
});
