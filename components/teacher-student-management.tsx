"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ProgressOverlay } from "./progress-overlay";

type Grade = { id: string; name: string; active: boolean };
type Group = { id: string; gradeId: string; gradeName: string; name: string; studentGrade: string; section: string; active: boolean; studentCount: number };
type Student = { id: string; name: string; level: string | null; grade: string | null; group: string | null; schoolYear: string | null; active: boolean; catalogGroupId: string; catalogGroupName: string };
type Registry = { grades: Grade[]; groups: Group[]; students: Student[]; defaultSchoolYear: string };
type View = "alumnos" | "catalogos" | "importar";
type Busy = { title: string; detail: string };
type PreviewRow = { rowNumber: number; id: string; name: string; groupAndGrade: string; action: "alta" | "actualizacion" | "sin-cambios" | "conflicto"; message: string };
type ImportPreview = { rows: Array<{ rowNumber: number; id: string; name: string; groupAndGrade: string }>; preview: PreviewRow[]; counts: { altas: number; actualizaciones: number; sinCambios: number; conflictos: number }; canApply: boolean };

export function TeacherStudentManagement({ active }: { active: boolean }) {
  const [data, setData] = useState<Registry | null>(null);
  const [loadAttempted, setLoadAttempted] = useState(false);
  const [view, setView] = useState<View>("alumnos");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [studentPage, setStudentPage] = useState(0);
  const [studentForm, setStudentForm] = useState<{ id: string; name: string; groupId: string; schoolYear: string; originalId: string } | null>(null);
  const [gradeForm, setGradeForm] = useState<{ id: string; name: string } | null>(null);
  const [groupForm, setGroupForm] = useState<{ id: string; name: string; gradeId: string; studentGrade: string; section: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importCycle, setImportCycle] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const inFlight = useRef(false);

  async function loadRegistry() {
    const response = await fetch("/api/teacher/students", { cache: "no-store" });
    const body = await response.json() as Registry & { error?: string };
    if (!response.ok) throw new Error(body.error || "No se pudo consultar el padrón.");
    setData(body);
    setImportCycle((current) => current || body.defaultSchoolYear || "");
    return body;
  }

  useEffect(() => {
    if (!active || data || loadAttempted) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setBusy({ title: "Consultando alumnos y catálogos…", detail: "Cargamos el padrón docente y las relaciones vigentes de grado y grupo." });
        setError("");
      }
      return fetch("/api/teacher/students", { cache: "no-store" });
    }).then(async (response) => {
      const body = await response.json() as Registry & { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo consultar el padrón.");
      if (!cancelled) {
        setData(body);
        setImportCycle(body.defaultSchoolYear || "");
        setLoadAttempted(true);
      }
    }).catch((cause: unknown) => { if (!cancelled) { setError(cause instanceof Error ? cause.message : "No se pudo consultar el padrón."); setLoadAttempted(true); } })
      .finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, [active, data, loadAttempted]);

  async function send(action: string, payload: Record<string, unknown>, copy: Busy, refresh = true) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(copy); setError(""); setMessage("");
    try {
      const response = await fetch("/api/teacher/students", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, payload }) });
      const body = await response.json() as { result?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el cambio.");
      if (refresh) await loadRegistry();
      return body.result ?? {};
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
      return null;
    } finally { inFlight.current = false; setBusy(null); }
  }

  async function submitStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentForm) return;
    const result = await send("saveStudent", { ...studentForm, originalId: studentForm.originalId || undefined }, { title: studentForm.originalId ? "Guardando alumno…" : "Creando alumno…", detail: "Validamos el ID y el grupo; guardamos la ficha junto con su evento de auditoría." });
    if (result) { setStudentForm(null); setMessage(studentForm.originalId ? "Ficha del alumno actualizada." : "Alumno agregado al padrón."); }
  }

  async function submitGrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gradeForm) return;
    const result = await send(gradeForm.id ? "updateGrade" : "createGrade", gradeForm, { title: gradeForm.id ? "Actualizando grado…" : "Agregando grado…", detail: "Validamos el catálogo y guardamos el cambio con su auditoría." });
    if (result) { setGradeForm(null); setMessage("Catálogo de grados actualizado."); }
  }

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupForm) return;
    const result = await send(groupForm.id ? "updateGroup" : "createGroup", groupForm, { title: groupForm.id ? "Actualizando grupo…" : "Agregando grupo…", detail: "Validamos el grado asociado y su correspondencia académica." });
    if (result) { setGroupForm(null); setMessage("Catálogo de grupos actualizado."); }
  }

  async function previewImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || inFlight.current) return;
    inFlight.current = true; setBusy({ title: "Validando el archivo…", detail: "Leemos sus columnas y cotejamos cada alumno contra el padrón y los catálogos vigentes." }); setError(""); setMessage(""); setPreview(null); setConfirmNew(false);
    try {
      const form = new FormData(); form.set("action", "previewImport"); form.set("file", file); form.set("schoolYear", importCycle);
      const response = await fetch("/api/teacher/students", { method: "POST", body: form });
      const body = await response.json() as ImportPreview & { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo validar el archivo.");
      setPreview(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo validar el archivo."); }
    finally { inFlight.current = false; setBusy(null); }
  }

  async function applyImport() {
    if (!preview || !preview.canApply || inFlight.current) return;
    const result = await send("applyImport", { rows: preview.rows, schoolYear: importCycle, confirmNew }, { title: "Actualizando el padrón…", detail: "Aplicamos altas y cambios en una sola transacción y registramos cada fila afectada." });
    if (result && typeof result === "object") {
      const counts = result as { created?: number; updated?: number; unchanged?: number };
      setMessage(`Carga aplicada: ${counts.created ?? 0} altas, ${counts.updated ?? 0} actualizaciones y ${counts.unchanged ?? 0} sin cambios.`);
      setPreview(null); setFile(null); setConfirmNew(false);
    }
  }

  const activeGrades = (data?.grades ?? []).filter((grade) => grade.active);
  const activeGroups = (data?.groups ?? []).filter((group) => group.active && activeGrades.some((grade) => grade.id === group.gradeId));
  const selectedGroup = activeGroups.find((group) => group.id === selectedGroupId);
  const visibleStudents = selectedGroup ? (data?.students ?? []).filter((student) => student.catalogGroupId === selectedGroup.id && (includeInactive || student.active) && `${student.id} ${student.name} ${student.level ?? ""} ${student.catalogGroupName} ${student.schoolYear ?? ""}`.toLocaleLowerCase("es-MX").includes(search.trim().toLocaleLowerCase("es-MX"))) : [];
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(visibleStudents.length / pageSize));
  const currentPage = Math.min(studentPage, pageCount - 1);
  const pageStudents = visibleStudents.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  async function changeStudentActive(student: Student, nextActive: boolean) {
    const action = nextActive ? "restaurar" : "desactivar";
    if (!window.confirm(`¿Deseas ${action} a ${student.name}? ${nextActive ? "Podrá volver a acceder al portal." : "Conservará su historial y dejará de acceder al portal."}`)) return;
    const result = await send("setStudentActive", { id: student.id, active: nextActive }, { title: nextActive ? "Restaurando alumno…" : "Desactivando alumno…", detail: "Actualizamos el acceso del alumno y conservamos su historial académico." });
    if (result) setMessage(nextActive ? "Alumno restaurado." : "Alumno desactivado; su historial permanece disponible.");
  }

  async function changeGradeActive(grade: Grade, nextActive: boolean) {
    if (!window.confirm(nextActive ? `¿Restaurar el grado ${grade.name}?` : `¿Retirar el grado ${grade.name} y sus grupos para nuevas asignaciones? Los alumnos existentes y su historial se conservarán.`)) return;
    const result = await send("setGradeActive", { id: grade.id, active: nextActive }, { title: nextActive ? "Restaurando grado…" : "Retirando grado…", detail: "Actualizamos el catálogo y conservamos las asignaciones e historial existentes." });
    if (result) setMessage(nextActive ? "Grado restaurado; restaura sus grupos por separado." : "Grado y grupos retirados del uso futuro.");
  }

  async function changeGroupActive(group: Group, nextActive: boolean) {
    if (!window.confirm(nextActive ? `¿Restaurar el grupo ${group.name}?` : `¿Retirar el grupo ${group.name}? Los alumnos actuales y su historial se conservarán.`)) return;
    const result = await send("setGroupActive", { id: group.id, active: nextActive }, { title: nextActive ? "Restaurando grupo…" : "Retirando grupo…", detail: "Actualizamos el catálogo sin modificar las fichas de alumnos actuales." });
    if (result) setMessage(nextActive ? "Grupo restaurado." : "Grupo retirado del uso futuro.");
  }

  if (!data && !busy) return <section className="academic-card"><p className="notice" role="alert">{error || "No se pudieron cargar los alumnos."}</p><button type="button" className="secondary-button" onClick={() => { setLoadAttempted(false); setError(""); }}>Reintentar</button></section>;

  return <section className="academic-card student-management" aria-label="Gestión del padrón">
    <nav className="academic-view-tabs" aria-label="Gestión de alumnos">
      <button type="button" className={view === "alumnos" ? "active" : ""} aria-current={view === "alumnos" ? "page" : undefined} onClick={() => setView("alumnos")}>Alumnos</button>
      <button type="button" className={view === "catalogos" ? "active" : ""} aria-current={view === "catalogos" ? "page" : undefined} onClick={() => setView("catalogos")}>Catálogos de grado y grupo</button>
      <button type="button" className={view === "importar" ? "active" : ""} aria-current={view === "importar" ? "page" : undefined} onClick={() => setView("importar")}>Actualizar desde Excel</button>
    </nav>
    {error && <p className="notice" role="alert">{error}</p>}{message && <p className="gemini-success" role="status">{message}</p>}

    {view === "alumnos" && <>
      <div className="academic-matrix-header"><div><h2>Alumnos</h2><p>Selecciona un grupo para consultar únicamente sus alumnos. El ID escolar no se puede cambiar.</p></div><button type="button" className="primary-button" onClick={() => { if (selectedGroup) setStudentForm({ id: "", name: "", groupId: selectedGroup.id, schoolYear: data?.defaultSchoolYear ?? "", originalId: "" }); }} disabled={!selectedGroup || !!busy}>Agregar alumno</button></div>
      <div className="student-registry-tools"><label className="select-field"><span>Grupo</span><select value={selectedGroupId} onChange={(event) => { setSelectedGroupId(event.target.value); setStudentPage(0); }}><option value="">Selecciona un grupo</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}, {group.gradeName}</option>)}</select></label>
        {selectedGroup && <><label className="select-field"><span>Buscar en {selectedGroup.name}</span><input value={search} onChange={(event) => { setSearch(event.target.value); setStudentPage(0); }} placeholder="ID o nombre" /></label><label className="checkbox-field"><input type="checkbox" checked={includeInactive} onChange={(event) => { setIncludeInactive(event.target.checked); setStudentPage(0); }} /> Incluir inactivos</label></>}
      </div>
      {selectedGroup ? <><div className="matrix-scroll"><table className="academic-matrix"><thead><tr><th>ID</th><th>Nombre</th><th>Grupo, grado</th><th>Ciclo escolar</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{pageStudents.map((student) => <tr key={student.id}><td>{student.id}</td><th>{student.name}</th><td>{student.catalogGroupName ? `${student.catalogGroupName}, ${student.level ?? ""}` : `${student.grade ?? ""} ${student.group ?? ""}, ${student.level ?? "Sin catálogo"}`}</td><td>{student.schoolYear || "—"}</td><td>{student.active ? "Activo" : "Inactivo"}</td><td className="student-row-actions"><button type="button" className="text-button" onClick={() => setStudentForm({ id: student.id, name: student.name, groupId: student.catalogGroupId, schoolYear: student.schoolYear ?? "", originalId: student.id })} disabled={!student.active}>Editar</button>{student.active ? <button type="button" className="text-button danger-text" onClick={() => void changeStudentActive(student, false)}>Eliminar</button> : <button type="button" className="text-button" onClick={() => void changeStudentActive(student, true)}>Restaurar</button>}</td></tr>)}</tbody></table></div>
      {!!visibleStudents.length && <nav className="student-registry-pagination" aria-label="Paginación del padrón"><span>Mostrando {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, visibleStudents.length)} de {visibleStudents.length} alumnos</span><div><button type="button" className="secondary-button compact" onClick={() => setStudentPage(Math.max(currentPage - 1, 0))} disabled={currentPage === 0}>Anterior</button><span>Página {currentPage + 1} de {pageCount}</span><button type="button" className="secondary-button compact" onClick={() => setStudentPage(Math.min(currentPage + 1, pageCount - 1))} disabled={currentPage >= pageCount - 1}>Siguiente</button></div></nav>}
      {!visibleStudents.length && <p className="dashboard-empty">No hay alumnos de este grupo que coincidan con los filtros.</p>}</> : <p className="dashboard-empty">Selecciona un grupo para consultar sus alumnos.</p>}
    </>}

    {view === "catalogos" && <>
      <div className="student-catalog-grid">
        <section aria-labelledby="student-grades-title"><div className="academic-matrix-header"><div><h2 id="student-grades-title">Grados</h2><p>Ejemplo: SECUNDARIA.</p></div><button type="button" className="secondary-button compact" onClick={() => setGradeForm({ id: "", name: "" })}>Agregar grado</button></div><div className="student-catalog-list">{(data?.grades ?? []).map((grade) => <article className="student-catalog-row" key={grade.id}><div><strong>{grade.name}</strong><small>{grade.active ? "Vigente" : "Retirado"}</small></div><div><button type="button" className="text-button" onClick={() => setGradeForm({ id: grade.id, name: grade.name })} disabled={!grade.active}>Editar</button><button type="button" className="text-button" onClick={() => void changeGradeActive(grade, !grade.active)}>{grade.active ? "Eliminar" : "Restaurar"}</button></div></article>)}</div></section>
        <section aria-labelledby="student-groups-title"><div className="academic-matrix-header"><div><h2 id="student-groups-title">Grupos</h2><p>Un grupo pertenece a un grado y se valida como pareja en Excel.</p></div><button type="button" className="secondary-button compact" onClick={() => setGroupForm({ id: "", name: "", gradeId: activeGrades[0]?.id ?? "", studentGrade: "", section: "" })} disabled={!activeGrades.length}>Agregar grupo</button></div><div className="student-catalog-list">{(data?.groups ?? []).map((group) => <article className="student-catalog-row" key={group.id}><div><strong>{group.name}, {group.gradeName}</strong><small>{group.studentCount} alumnos · {group.active ? "Vigente" : "Retirado"} · compatibilidad: {group.studentGrade} {group.section}</small></div><div><button type="button" className="text-button" onClick={() => setGroupForm({ id: group.id, name: group.name, gradeId: group.gradeId, studentGrade: group.studentGrade, section: group.section })} disabled={!group.active}>Editar</button><button type="button" className="text-button" onClick={() => void changeGroupActive(group, !group.active)}>{group.active ? "Eliminar" : "Restaurar"}</button></div></article>)}</div></section>
      </div>
    </>}

    {view === "importar" && <>
      <div className="academic-matrix-header"><div><h2>Actualizar padrón desde Excel</h2><p>Columnas requeridas: <strong>ID | Nombre alumno | Grupo y grado</strong>. Ejemplo: <strong>1o A Sec, SECUNDARIA</strong>.</p></div></div>
      <form className="academic-form student-import-form" onSubmit={(event) => void previewImport(event)}>
        <label>Archivo .xlsx<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(""); }} required /></label>
        <label>Ciclo escolar para altas nuevas<input value={importCycle} onChange={(event) => { setImportCycle(event.target.value); setPreview(null); }} maxLength={30} placeholder="2026-2027" required /></label>
        <p>La hoja puede llamarse <strong>Alumnos</strong> o ser la primera hoja. La carga actualiza el nombre y grupo de los IDs existentes, y propone los IDs nuevos. Las filas que no coincidan exactamente con los catálogos detendrán el lote. Las filas ausentes no desactivan alumnos.</p>
        <button type="submit" className="primary-button" disabled={!file || !!busy}>Validar y mostrar vista previa</button>
      </form>
      {preview && <section className="student-import-preview" aria-live="polite"><div className="student-import-counts"><span>Altas <strong>{preview.counts.altas}</strong></span><span>Actualizaciones <strong>{preview.counts.actualizaciones}</strong></span><span>Sin cambios <strong>{preview.counts.sinCambios}</strong></span><span>Conflictos <strong>{preview.counts.conflictos}</strong></span></div>
        {preview.counts.altas > 0 && <label className="checkbox-field student-import-confirm"><input type="checkbox" checked={confirmNew} onChange={(event) => setConfirmNew(event.target.checked)} /> Confirmo agregar {preview.counts.altas} alumno(s) con IDs nuevos.</label>}
        <div className="matrix-scroll"><table className="academic-matrix"><thead><tr><th>Fila</th><th>ID</th><th>Nombre</th><th>Grupo, grado</th><th>Resultado</th></tr></thead><tbody>{preview.preview.map((row) => <tr key={`${row.rowNumber}-${row.id}`}><td>{row.rowNumber}</td><td>{row.id}</td><td>{row.name}</td><td>{row.groupAndGrade}</td><td><strong>{row.action === "alta" ? "Alta" : row.action === "actualizacion" ? "Actualizar" : row.action === "sin-cambios" ? "Sin cambios" : "Conflicto"}</strong>{row.message && <small className="student-import-row-error">{row.message}</small>}</td></tr>)}</tbody></table></div>
        <button type="button" className="primary-button" onClick={() => void applyImport()} disabled={!preview.canApply || !!busy || (preview.counts.altas > 0 && !confirmNew)}>Aplicar cambios en una transacción</button>
      </section>}
    </>}

    {studentForm && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setStudentForm(null); }}><section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="student-form-title"><div className="academic-matrix-header"><div><p className="eyebrow">PADRÓN ESCOLAR</p><h2 id="student-form-title">{studentForm.originalId ? "Editar alumno" : "Agregar alumno"}</h2></div><button type="button" className="text-button" onClick={() => setStudentForm(null)}>Cerrar</button></div><form className="academic-form" onSubmit={(event) => void submitStudent(event)}><label>ID escolar<input value={studentForm.id} onChange={(event) => setStudentForm({ ...studentForm, id: event.target.value })} maxLength={64} required disabled={!!studentForm.originalId} /></label><label>Nombre del alumno<input value={studentForm.name} onChange={(event) => setStudentForm({ ...studentForm, name: event.target.value })} maxLength={160} required /></label><label>Grupo y grado<select value={studentForm.groupId} onChange={(event) => setStudentForm({ ...studentForm, groupId: event.target.value })} required><option value="">Selecciona un grupo</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}, {group.gradeName}</option>)}</select></label>{!studentForm.originalId && <label>Ciclo escolar<input value={studentForm.schoolYear} onChange={(event) => setStudentForm({ ...studentForm, schoolYear: event.target.value })} maxLength={30} required /></label>}<div className="session-heading-actions"><button type="button" className="secondary-button" onClick={() => setStudentForm(null)}>Cancelar</button><button type="submit" className="primary-button" disabled={!!busy || !activeGroups.length}>Guardar</button></div></form></section></div>}

    {gradeForm && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setGradeForm(null); }}><section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="grade-form-title"><div className="academic-matrix-header"><div><p className="eyebrow">CATÁLOGO</p><h2 id="grade-form-title">{gradeForm.id ? "Editar grado" : "Agregar grado"}</h2></div><button type="button" className="text-button" onClick={() => setGradeForm(null)}>Cerrar</button></div><form className="academic-form" onSubmit={(event) => void submitGrade(event)}><label>Nombre del grado<input value={gradeForm.name} onChange={(event) => setGradeForm({ ...gradeForm, name: event.target.value })} maxLength={80} required placeholder="SECUNDARIA" /></label><div className="session-heading-actions"><button type="button" className="secondary-button" onClick={() => setGradeForm(null)}>Cancelar</button><button type="submit" className="primary-button" disabled={!!busy}>Guardar</button></div></form></section></div>}

    {groupForm && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setGroupForm(null); }}><section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="group-form-title"><div className="academic-matrix-header"><div><p className="eyebrow">CATÁLOGO</p><h2 id="group-form-title">{groupForm.id ? "Editar grupo" : "Agregar grupo"}</h2></div><button type="button" className="text-button" onClick={() => setGroupForm(null)}>Cerrar</button></div><form className="academic-form" onSubmit={(event) => void submitGroup(event)}><label>Nombre visible del grupo<input value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} maxLength={80} required placeholder="1o A Sec" /></label><label>Grado del catálogo<select value={groupForm.gradeId} onChange={(event) => setGroupForm({ ...groupForm, gradeId: event.target.value })} required><option value="">Selecciona un grado</option>{activeGrades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label><p>Correspondencia que conserva la integración con clases y exámenes.</p><div className="student-group-mapping"><label>Grado académico<input value={groupForm.studentGrade} onChange={(event) => setGroupForm({ ...groupForm, studentGrade: event.target.value })} maxLength={40} required placeholder="1°" /></label><label>Grupo o sección<input value={groupForm.section} onChange={(event) => setGroupForm({ ...groupForm, section: event.target.value })} maxLength={32} required placeholder="A" /></label></div><div className="session-heading-actions"><button type="button" className="secondary-button" onClick={() => setGroupForm(null)}>Cancelar</button><button type="submit" className="primary-button" disabled={!!busy}>Guardar</button></div></form></section></div>}

    {busy && <ProgressOverlay title={busy.title} detail={busy.detail} />}
  </section>;
}
