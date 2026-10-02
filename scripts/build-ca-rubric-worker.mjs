import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".neon-build", "ca-rubric-worker");
const bundlePath = path.join(outputDir, "index.mjs");
const zipPath = path.join(outputDir, "function.zip");
await mkdir(outputDir, { recursive: true });
await rm(zipPath, { force: true });

await build({
  entryPoints: [path.join(root, "functions", "ca-rubric-worker.ts")],
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  conditions: ["react-server"],
  banner: {
    js: "import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);",
  },
});
execFileSync("zip", ["-j", zipPath, bundlePath], { stdio: "inherit" });
console.log(`Created ${path.relative(root, zipPath)}`);
