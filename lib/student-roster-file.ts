import * as XLSX from "xlsx";

export type StudentRosterRow = { rowNumber: number; id: string; name: string; groupAndGrade: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const normalizeHeader = (value: string) => value.trim().toLocaleUpperCase("es-MX").replace(/\s+/g, " ");

function cellText(cell: XLSX.CellObject | undefined) {
  if (!cell) return "";
  if (cell.f) throw new Error("El archivo contiene fórmulas. Pega los valores antes de cargarlo.");
  if (typeof cell.v === "string") return cell.v.trim();
  if (typeof cell.v === "number" && Number.isFinite(cell.v)) return (cell.w ?? String(cell.v)).trim();
  return "";
}

export function parseStudentRosterWorkbook(buffer: Buffer): StudentRosterRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellFormula: true, sheetRows: MAX_ROWS + 1, WTF: true });
  } catch {
    throw new Error("No se pudo leer el archivo. Usa un libro .xlsx válido.");
  }
  if (!workbook.SheetNames.length) throw new Error("El libro no contiene hojas.");
  const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "ALUMNOS") ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet?.["!ref"]) throw new Error("La hoja está vacía.");

  let range: XLSX.Range;
  try { range = XLSX.utils.decode_range(sheet["!ref"]); }
  catch { throw new Error("La hoja tiene un rango inválido."); }
  if (range.s.r !== 0 || range.s.c !== 0) throw new Error("Los encabezados deben comenzar en la celda A1.");
  if (range.e.r - range.s.r > MAX_ROWS) throw new Error(`El archivo supera el límite de ${MAX_ROWS} alumnos por carga.`);

  const header = [0, 1, 2].map((column) => normalizeHeader(cellText(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + column })] ?? undefined)));
  const validNameHeader = header[1] === "NOMBRE ALUMNO" || header[1] === "NOMBRE ALUMBO";
  if (header[0] !== "ID" || !validNameHeader || header[2] !== "GRUPO Y GRADO") {
    throw new Error("La primera fila debe tener las columnas: ID | Nombre alumno | Grupo y grado.");
  }
  for (let column = range.s.c + 3; column <= range.e.c; column++) {
    if (cellText(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })])) {
      throw new Error("El archivo debe tener sólo las tres columnas indicadas.");
    }
  }

  const rows: StudentRosterRow[] = [];
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const values = [0, 1, 2].map((offset) => cellText(sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + offset })]));
    if (values.every((value) => !value)) continue;
    for (let column = range.s.c + 3; column <= range.e.c; column++) {
      if (cellText(sheet[XLSX.utils.encode_cell({ r: row, c: column })])) {
        throw new Error(`La fila ${row + 1} contiene datos fuera de las tres columnas permitidas.`);
      }
    }
    rows.push({ rowNumber: row + 1, id: values[0], name: values[1], groupAndGrade: values[2] });
  }
  if (!rows.length) throw new Error("La hoja no contiene filas de alumnos.");
  if (rows.length > MAX_ROWS) throw new Error(`El archivo supera el límite de ${MAX_ROWS} alumnos por carga.`);
  return rows;
}

export async function parseStudentRosterUpload(file: File): Promise<StudentRosterRow[]> {
  if (!file.name.toLocaleLowerCase("es-MX").endsWith(".xlsx")) throw new Error("Selecciona un archivo .xlsx.");
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error("El archivo debe pesar entre 1 byte y 5 MB.");
  return parseStudentRosterWorkbook(Buffer.from(await file.arrayBuffer()));
}
