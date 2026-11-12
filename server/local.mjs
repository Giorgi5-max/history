import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createApp } from "./worker.js";
import { loadLessons } from "../scripts/content.mjs";
import { mimeType } from "../scripts/mime.mjs";

class LocalBucket {
  constructor(root) {
    this.root = resolve(root);
  }

  path(key) {
    return resolve(this.root, key.replaceAll("/", "_"));
  }

  async readObject(key) {
    let handle;
    try {
      handle = await open(this.path(key), "r");
      const buffer = Buffer.alloc(4);
      await handle.read(buffer, 0, 4, 0);
      const length = buffer.readUInt32BE();
      const header = Buffer.alloc(length);
      await handle.read(header, 0, length, 4);
      const metadata = JSON.parse(header.toString("utf8"));
      metadata.uploaded = new Date(metadata.uploaded);
      const size = (await handle.stat()).size - length - 4;
      return { handle, object: { ...metadata, size }, offset: length + 4 };
    } catch (error) {
      await handle?.close();
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async head(key) {
    const found = await this.readObject(key);
    if (!found) return null;
    await found.handle.close();
    return found.object;
  }

  async get(key, { range, onlyIf } = {}) {
    const found = await this.readObject(key);
    if (!found) return null;
    const { handle, object, offset } = found;
    if (onlyIf?.etagMatches && onlyIf.etagMatches !== object.etag) {
      await handle.close();
      return object;
    }
    const start = offset + (range?.offset ?? 0);
    const end = range ? start + range.length - 1 : offset + object.size - 1;
    return { ...object, body: Readable.toWeb(handle.createReadStream({ start, end })) };
  }

  async put(key, body, options) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const path = this.path(key);
    const id = crypto.randomUUID();
    const temp = path + "." + id + ".tmp";
    const object = { ...options, uploaded: new Date(), etag: id, httpEtag: '"' + id + '"' };
    const header = Buffer.from(JSON.stringify(object), "utf8");
    const size = Buffer.alloc(4);
    size.writeUInt32BE(header.length);
    try {
      await pipeline(Readable.from((async function* () {
        yield size;
        yield header;
        yield* Readable.fromWeb(body);
      })()), createWriteStream(temp, { flags: "wx", mode: 0o600 }));
      const contentSize = (await stat(temp)).size - header.length - 4;
      await rename(temp, path);
      return { ...object, size: contentSize };
    } finally {
      await rm(temp, { force: true });
    }
  }

  async delete(key) {
    await rm(this.path(key), { force: true });
  }
}

const content = loadLessons();
const assets = new URL("../public/", import.meta.url);
const app = createApp({
  lessonIds: new Set(Object.keys(content)),
  async asset(path, method) {
    const match = /^\/lessons\/([a-z0-9-]+)\.json$/.exec(path);
    if (match && Object.hasOwn(content, match[1])) {
      return new Response(method === "HEAD" ? null : JSON.stringify(content[match[1]]), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    if (!/^\/(?:assets\/)?[a-zA-Z0-9._-]+$/.test(path) || path.split("/").some(part => part.startsWith("."))) return null;
    const file = new URL(path.slice(1), assets);
    try {
      const info = await stat(file);
      if (!info.isFile()) return null;
      return new Response(method === "HEAD" ? null : Readable.toWeb(createReadStream(file)), {
        headers: { "Content-Type": mimeType(path), "Content-Length": String(info.size) }
      });
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
});
const env = { ...process.env, BUCKET: new LocalBucket(process.env.ISTORIA_MEDIA_DIR || ".istoria-media") };
const portFlag = process.argv.indexOf("--port");
const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT || 3000);

createServer(async (incoming, outgoing) => {
  try {
    const proto = incoming.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const host = incoming.headers["x-forwarded-host"] || incoming.headers.host || "localhost";
    const hasBody = !["GET", "HEAD"].includes(incoming.method);
    const request = new Request(new URL(incoming.url, `${proto}://${host}`), {
      method: incoming.method,
      headers: incoming.headers,
      ...(hasBody ? { body: Readable.toWeb(incoming), duplex: "half" } : {})
    });
    const result = await app.fetch(request, env);
    outgoing.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) await pipeline(Readable.fromWeb(result.body), Writable.toWeb(outgoing));
    else outgoing.end();
  } catch (error) {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
    if (error.code !== "ERR_STREAM_PREMATURE_CLOSE") console.error(error.message);
  }
}).listen(port, "0.0.0.0", () => console.log(`ისტორია · http://localhost:${port}`));
