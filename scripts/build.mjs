import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLessons } from "./content.mjs";
import { mimeType } from "./mime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = resolve(root, "public");
const dist = resolve(root, "dist");
const content = loadLessons();
const assets = {};
for (const entry of readdirSync(publicDir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const path = resolve(entry.parentPath, entry.name);
  const route = "/" + relative(publicDir, path).replaceAll("\\", "/");
  assets[route] = [mimeType(route), readFileSync(path).toString("base64")];
}
for (const [id, lesson] of Object.entries(content)) {
  assets[`/lessons/${id}.json`] = ["application/json; charset=utf-8", Buffer.from(JSON.stringify(lesson)).toString("base64")];
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, "server"), { recursive: true });
const worker = readFileSync(resolve(root, "server/worker.js"), "utf8").replace("export function createApp(", "function createApp(");
const entrypoint = `${worker}
const ASSETS = ${JSON.stringify(assets)};
export default createApp({
  lessonIds: new Set(${JSON.stringify(Object.keys(content))}),
  asset(path, method) {
    if (!Object.hasOwn(ASSETS, path)) return null;
    const [type, encoded] = ASSETS[path];
    const bytes = method === "HEAD" ? null : Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const cache = path.startsWith("/assets/") ? "private, max-age=3600" : "private, no-cache";
    return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": cache } });
  }
});
`;
writeFileSync(resolve(dist, "server/index.js"), entrypoint);
const manifest = resolve(root, ".openai/hosting.json");
if (existsSync(manifest)) {
  mkdirSync(resolve(dist, ".openai"));
  cpSync(manifest, resolve(dist, ".openai/hosting.json"));
}
console.log(`Built ${Object.keys(content).length} lessons and ${Object.keys(assets).length} routes`);
