import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { pipeline } from "node:stream/promises";

const { Client, Pool } = pg;
const sourceUrl = process.env.DATABASE_URL;
const backupDirectoryInput = process.env.BACKUP_DIR;
const restoreCheckUrl = process.env.RESTORE_CHECK_URL;
const encryptionKeyHex = process.env.BACKUP_ENCRYPTION_KEY || "";
const verifyArchiveInput = process.env.VERIFY_BACKUP_ARCHIVE;
const verifyManifestInput = process.env.VERIFY_BACKUP_MANIFEST;
const repositoryRoot = process.cwd();

function parseConnection(value, variableName) {
  if (!value) throw new Error(`${variableName} es obligatorio.`);
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(`${variableName} debe ser una URL PostgreSQL.`);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database || !url.hostname || !url.username || !url.password) throw new Error(`${variableName} debe incluir host, base, usuario y contraseña.`);
  return {
    url,
    database,
    host: url.hostname,
    port: url.port || "5432",
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

function escapePassfileField(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("\n", "").replaceAll("\r", "");
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function makePassfile(connection) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "docencia-pgpass-"));
  const file = path.join(directory, "pgpass");
  const contents = [connection.host, connection.port, connection.database, connection.username, connection.password]
    .map(escapePassfileField).join(":");
  await writeFile(file, `${contents}\n`, { mode: 0o600 });
  return { directory, file };
}

async function run(program, args, env, stdio = "inherit") {
  await new Promise((resolve, reject) => {
    const child = spawn(program, args, { env: { ...process.env, ...env }, stdio });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${program} terminó con ${signal ? `señal ${signal}` : `código ${code}`}.`));
    });
  });
}

function connectionInsideDocker(connection) {
  const url = new URL(connection.url);
  if (["localhost", "127.0.0.1", "::1"].includes(connection.host)) {
    url.hostname = "127.0.0.1";
    url.port = "5432";
  }
  return parseConnection(url.toString(), "DATABASE_URL");
}

async function copyPassfileToDocker(passfile) {
  return copyFileToDocker(passfile.file, "pgpass");
}

async function copyFileToDocker(localFile, kind) {
  const target = `/tmp/docencia-${kind}-${randomUUID().replaceAll("-", "")}`;
  await run("docker", ["compose", "cp", localFile, `db:${target}`], {}, "ignore");
  await run("docker", ["compose", "exec", "-T", "db", "chmod", "600", target], {}, "ignore");
  return target;
}

async function removeDockerPassfile(target) {
  await run("docker", ["compose", "exec", "-T", "db", "rm", "-f", target], {}).catch(() => {});
}

function dockerExecArgs(passfilePath, connection) {
  const args = ["compose", "exec", "-T", "-e", `PGPASSFILE=${passfilePath}`, "db"];
  if (connection.url.searchParams.has("sslmode")) args.splice(5, 0, "-e", `PGSSLMODE=${connection.url.searchParams.get("sslmode")}`);
  return args;
}

async function tableCounts(connectionString) {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const { rows } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
    const counts = {};
    for (const { table_name: tableName } of rows) {
      const identifier = `\"${String(tableName).replaceAll('\"', '\"\"')}\"`;
      const result = await pool.query(`SELECT count(*)::bigint AS count FROM public.${identifier}`);
      counts[tableName] = Number(result.rows[0].count);
    }
    return counts;
  } finally {
    await pool.end();
  }
}

function getEncryptionKey() {
  if (!encryptionKeyHex) return null;
  if (!/^[a-f\d]{64}$/i.test(encryptionKeyHex)) throw new Error("BACKUP_ENCRYPTION_KEY debe ser una clave hexadecimal de 64 caracteres; guárdala fuera de Git.");
  return Buffer.from(encryptionKeyHex, "hex");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function encryptArchive(sourcePath, encryptedPath, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await pipeline(createReadStream(sourcePath), cipher, createWriteStream(encryptedPath, { flags: "wx", mode: 0o600 }));
  return { algorithm: "aes-256-gcm", iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

async function decryptArchive(encryptedPath, outputPath, key, encryption) {
  const iv = Buffer.from(encryption.iv, "base64");
  const authTag = Buffer.from(encryption.authTag, "base64");
  if (iv.length !== 12 || authTag.length !== 16) throw new Error("El manifiesto del respaldo cifrado no es válido.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  await pipeline(createReadStream(encryptedPath), decipher, createWriteStream(outputPath, { flags: "wx", mode: 0o600 }));
}

function sameCounts(actual, expected) {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected ?? {}).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && Number(actual[key]) === Number(expected[key]));
}

async function restoreAndCompare(archivePath, connection, expectedCounts) {
  if (!['localhost', '127.0.0.1', '::1', 'db'].includes(connection.host)) {
    throw new Error("RESTORE_CHECK_URL debe apuntar a PostgreSQL local para evitar restauraciones de prueba en una base remota.");
  }
  const verifyDatabase = `docencia_restore_check_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const adminUrl = new URL(connection.url);
  adminUrl.pathname = `/${encodeURIComponent(connection.database)}`;
  const adminClient = new Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();
  let created = false;
  let dockerArchive = "";
  try {
    await adminClient.query(`CREATE DATABASE "${verifyDatabase}"`);
    created = true;
    dockerArchive = await copyFileToDocker(archivePath, "restore");
    const targetUrl = new URL(connection.url);
    targetUrl.pathname = `/${encodeURIComponent(verifyDatabase)}`;
    const target = connectionInsideDocker(parseConnection(targetUrl.toString(), "RESTORE_CHECK_URL"));
    const passfile = await makePassfile(target);
    const dockerPassfile = await copyPassfileToDocker(passfile);
    try {
      await run("docker", [...dockerExecArgs(dockerPassfile, target), "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "--host", target.host, "--port", target.port, "--username", target.username, "--dbname", target.database, dockerArchive], {});
    } finally {
      await removeDockerPassfile(dockerPassfile);
      await rm(passfile.directory, { recursive: true, force: true });
    }
    const restoredCounts = await tableCounts(targetUrl.toString());
    if (!sameCounts(restoredCounts, expectedCounts)) {
      throw new Error("La restauración temporal no coincide con los conteos del manifiesto del respaldo.");
    }
    return { status: "passed", restoredTables: Object.keys(restoredCounts).length };
  } finally {
    if (dockerArchive) await run("docker", ["compose", "exec", "-T", "db", "rm", "-f", dockerArchive], {}).catch(() => {});
    if (created) await adminClient.query(`DROP DATABASE IF EXISTS "${verifyDatabase}" WITH (FORCE)`);
    await adminClient.end();
  }
}

async function verifyExistingBackup() {
  if (!verifyArchiveInput || !verifyManifestInput || !restoreCheckUrl) {
    throw new Error("La verificación de un backup existente requiere VERIFY_BACKUP_ARCHIVE, VERIFY_BACKUP_MANIFEST y RESTORE_CHECK_URL local.");
  }
  const key = getEncryptionKey();
  if (!key) throw new Error("BACKUP_ENCRYPTION_KEY es obligatorio para descifrar el respaldo.");
  const archivePath = path.resolve(verifyArchiveInput);
  const manifestPath = path.resolve(verifyManifestInput);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.archive !== path.basename(archivePath) || manifest.encryption?.algorithm !== "aes-256-gcm") {
    throw new Error("El archivo y el manifiesto no corresponden o no declaran cifrado AES-256-GCM.");
  }
  if (!manifest.tableCounts || typeof manifest.tableCounts !== "object" || Array.isArray(manifest.tableCounts)
      || Object.values(manifest.tableCounts).some((count) => !Number.isSafeInteger(Number(count)) || Number(count) < 0)) {
    throw new Error("El manifiesto no contiene conteos de tablas válidos para comparar la restauración.");
  }
  const checksum = await sha256File(archivePath);
  if (checksum !== manifest.sha256) throw new Error("El SHA-256 del archive no coincide con el manifiesto.");

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "docencia-backup-verify-"));
  const plainArchivePath = path.join(temporaryDirectory, "restore.dump");
  try {
    await decryptArchive(archivePath, plainArchivePath, key, manifest.encryption);
    await chmod(plainArchivePath, 0o600);
    const result = await restoreAndCompare(plainArchivePath, parseConnection(restoreCheckUrl, "RESTORE_CHECK_URL"), manifest.tableCounts);
    process.stdout.write(`Respaldo existente verificado: ${path.basename(archivePath)}\nSHA-256: ${checksum}\nTablas restauradas: ${result.restoredTables}\n`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  if (verifyArchiveInput || verifyManifestInput) {
    await verifyExistingBackup();
    return;
  }
  const source = parseConnection(sourceUrl, "DATABASE_URL");
  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) throw new Error("BACKUP_ENCRYPTION_KEY es obligatorio; no se crearán respaldos escolares sin cifrar.");
  if (!backupDirectoryInput) throw new Error("BACKUP_DIR debe apuntar a un destino externo al repositorio.");
  const backupDirectory = path.resolve(backupDirectoryInput);
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const resolvedRepositoryRoot = await realpath(repositoryRoot);
  const resolvedBackupDirectory = await realpath(backupDirectory);
  if (isWithin(resolvedRepositoryRoot, resolvedBackupDirectory)) throw new Error("BACKUP_DIR no puede estar dentro del repositorio ni de Git.");
  await chmodDirectoryPrivate(resolvedBackupDirectory);

  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const baseName = `docencia-${timestamp}-${randomUUID().slice(0, 8)}`;
  const plainArchivePath = path.join(resolvedBackupDirectory, `${baseName}.dump`);
  const archivePath = encryptionKey ? `${plainArchivePath}.enc` : plainArchivePath;
  const manifestPath = path.join(resolvedBackupDirectory, `${baseName}.manifest.json`);
  const passfile = await makePassfile(source);
  const sourceInDocker = connectionInsideDocker(source);
  let dockerPassfile = "";
  let outputFd;
  try {
    dockerPassfile = await copyPassfileToDocker(passfile);
    outputFd = await open(plainArchivePath, "wx", 0o600);
    await run("docker", [...dockerExecArgs(dockerPassfile, sourceInDocker), "pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--host", sourceInDocker.host, "--port", sourceInDocker.port, "--username", sourceInDocker.username, "--dbname", sourceInDocker.database], {}, ["ignore", outputFd.fd, "inherit"]);
  } finally {
    if (outputFd) await outputFd.close();
    if (dockerPassfile) await removeDockerPassfile(dockerPassfile);
    await rm(passfile.directory, { recursive: true, force: true });
  }
  await chmod(plainArchivePath, 0o600);
  const dockerArchive = await copyFileToDocker(plainArchivePath, "archive");
  try {
    await run("docker", ["compose", "exec", "-T", "db", "pg_restore", "--list", dockerArchive], {}, "ignore");
  } finally {
    await run("docker", ["compose", "exec", "-T", "db", "rm", "-f", dockerArchive], {}).catch(() => {});
  }
  let encryption = null;
  if (encryptionKey) {
    encryption = await encryptArchive(plainArchivePath, archivePath, encryptionKey);
    await rm(plainArchivePath, { force: true });
  }
  const archiveStat = await stat(archivePath);
  const sha256 = await sha256File(archivePath);
  const manifest = {
    format: encryption ? "pg_dump custom archive encrypted with AES-256-GCM" : "pg_dump custom archive",
    createdAt: new Date().toISOString(),
    source: { host: source.host, database: source.database },
    archive: path.basename(archivePath),
    bytes: archiveStat.size,
    sha256,
    encryption,
    tableCounts: await tableCounts(sourceUrl),
    restoreCheck: restoreCheckUrl ? { status: "pending" } : { status: "not-run" },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  if (restoreCheckUrl) {
    const temporaryRestoreDirectory = encryptionKey ? await mkdtemp(path.join(os.tmpdir(), "docencia-restore-")) : "";
    const restoreArchivePath = encryptionKey ? path.join(temporaryRestoreDirectory, "restore.dump") : archivePath;
    try {
      if (encryptionKey) {
        await decryptArchive(archivePath, restoreArchivePath, encryptionKey, encryption);
        await chmod(restoreArchivePath, 0o600);
      }
      manifest.restoreCheck = await restoreAndCompare(restoreArchivePath, parseConnection(restoreCheckUrl, "RESTORE_CHECK_URL"), manifest.tableCounts);
    } catch (error) {
      manifest.restoreCheck = { status: "failed" };
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
      throw error;
    } finally {
      if (temporaryRestoreDirectory) await rm(temporaryRestoreDirectory, { recursive: true, force: true });
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`Respaldo creado: ${path.basename(archivePath)}\nSHA-256: ${sha256}\nRestauración: ${manifest.restoreCheck.status}\n`);
}

async function chmodDirectoryPrivate(directory) {
  await chmod(directory, 0o700);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Falló el respaldo PostgreSQL."}\n`);
  process.exitCode = 1;
});
