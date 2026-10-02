import { randomBytes } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(process.cwd(), ".env");
const templatePath = path.join(projectRoot, "docker.env.example");

try {
  await readFile(targetPath);
  process.stdout.write("Se conservó el .env local existente; no se modificó.\n");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;

  const template = await readFile(templatePath, "utf8");
  const generated = new Map([
    ["POSTGRES_PASSWORD", randomBytes(24).toString("base64url")],
    ["TEACHER_PASSWORD", randomBytes(24).toString("base64url")],
    ["TEACHER_SESSION_SECRET", randomBytes(32).toString("base64url")],
  ]);
  let output = template;
  for (const [name, value] of generated) {
    const assignment = new RegExp(`^${name}=.*$`, "m");
    if (!assignment.test(output)) throw new Error(`Falta ${name} en docker.env.example.`);
    output = output.replace(assignment, `${name}=${value}`);
  }

  const handle = await open(targetPath, "wx", 0o600);
  try {
    await handle.writeFile(output, "utf8");
    await handle.chmod(0o600);
  } catch (writeError) {
    await handle.close();
    throw writeError;
  }
  await handle.close();
  process.stdout.write("Se creó .env con credenciales locales aleatorias y permisos privados.\n");
  process.stdout.write("Consulta TEACHER_PASSWORD en .env para iniciar sesión en el entorno local.\n");
}
