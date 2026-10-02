import { CONDUCT_ATTITUDE_CRITERIA } from "../lib/conduct-attitude-rubric";

export type RubricMatrixStudent = { id: string; name: string; scores: string[]; status: string };
export function CaRubricMatrix({ partialName, students, busy, onReview }: {
  partialName: string;
  students: RubricMatrixStudent[];
  busy: boolean;
  onReview: (studentId: string) => void;
}) {
  return <><div className="academic-matrix-header"><div><h3>Conducta y actitud</h3><p>{partialName} · Español</p></div></div><div className="matrix-scroll"><table className="academic-matrix ca-grade-matrix" aria-label="Calificaciones de conducta y actitud"><thead><tr><th scope="col">No.</th><th scope="col">ID alumno</th><th scope="col">Alumno</th>{CONDUCT_ATTITUDE_CRITERIA.map((criterion) => <th scope="col" key={criterion}>{criterion}</th>)}<th scope="col">Promedio</th></tr></thead><tbody>{students.map((student, rowIndex) => {
    const valid = student.scores.length === 5 && student.scores.every((score) => score.trim() !== "" && Number.isFinite(Number(score)) && Number(score) >= 1 && Number(score) <= 10);
    const average = valid ? student.scores.reduce((sum, score) => sum + Number(score), 0) / 5 : null;
    return <tr key={student.id}><td>{rowIndex + 1}</td><td>{student.id}</td><th scope="row"><button type="button" onClick={() => onReview(student.id)} title={student.status} aria-label={`Revisar rúbrica de ${student.name}`} disabled={busy}>{student.name}</button></th>{CONDUCT_ATTITUDE_CRITERIA.map((criterion, index) => <td key={criterion}>{student.scores[index] ?? "—"}</td>)}<td>{average === null ? "—" : average.toFixed(2)}</td></tr>;
  })}</tbody></table></div></>;
}
