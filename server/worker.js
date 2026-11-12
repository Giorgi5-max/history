const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessions = "istoria_teacher";
const expirySeconds = 60 * 60 * 8;
const attempts = new Map();
const mediaTypes = {
  video: { max: 90 * 1024 * 1024, ext: { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime" } },
  audio: { max: 35 * 1024 * 1024, ext: { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", aac: "audio/aac", webm: "audio/webm" } }
};
mediaTypes.podcast = mediaTypes.audio;

const baseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'"
};
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { ...baseHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
});
const problem = (status, message) => json({ error: message }, status);

function configured(env) {
  return /^\d{8}$/.test(env.TEACHER_PIN || "") && (env.SESSION_SECRET || "").length >= 32;
}

async function keyFor(env) {
  return crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign(env, value) {
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", await keyFor(env), encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function verify(env, value, hex) {
  if (!/^[0-9a-f]{64}$/.test(hex || "")) return false;
  const bytes = Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
  return crypto.subtle.verify("HMAC", await keyFor(env), bytes, encoder.encode(value));
}

function cookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessions}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

async function authenticated(request, env) {
  if (!configured(env)) return false;
  const raw = (request.headers.get("cookie") || "").split(";").map(piece => piece.trim())
    .find(piece => piece.startsWith(sessions + "="))?.slice(sessions.length + 1);
  const [expires, nonce, signature] = (raw || "").split(".");
  return /^\d+$/.test(expires || "") && Number(expires) > Date.now() &&
    /^[0-9a-f-]{36}$/.test(nonce || "") && await verify(env, `teacher:${expires}.${nonce}:${env.TEACHER_PIN}`, signature);
}

function rateLimited(request) {
  const address = request.headers.get("cf-connecting-ip") || "local";
  const now = Date.now();
  const attempt = attempts.get(address);
  if (!attempt || now - attempt.start >= 60_000) {
    if (attempts.size >= 2048) attempts.delete(attempts.keys().next().value);
    attempts.set(address, { start: now, count: 1 });
    return false;
  }
  attempt.count += 1;
  return attempt.count > 10;
}

async function login(request, env) {
  if (!configured(env)) return problem(503, "მასწავლებლის პანელის შესვლის პარამეტრები ჯერ არ არის დაყენებული.");
  if (rateLimited(request)) return problem(429, "სცადეთ ხელახლა ერთ წუთში.");
  let pin;
  try {
    if (!/^application\/json\b/i.test(request.headers.get("content-type") || "")) return problem(415, "შესვლის ფორმა ხელახლა გახსენით.");
    ({ pin } = await request.json());
  } catch {
    return problem(400, "შეიყვანეთ რვაციფრიანი პინი.");
  }
  const expected = await sign(env, "pin:" + env.TEACHER_PIN);
  if (typeof pin !== "string" || !/^\d{8}$/.test(pin) || !await verify(env, "pin:" + pin, expected)) {
    return problem(401, "პინი არასწორია. სცადეთ ხელახლა.");
  }
  const expires = Date.now() + expirySeconds * 1000;
  const token = `${expires}.${crypto.randomUUID()}`;
  const signature = await sign(env, `teacher:${token}:${env.TEACHER_PIN}`);
  return json({ authenticated: true }, 200, { "Set-Cookie": cookie(request, `${token}.${signature}`, expirySeconds) });
}

function metadata(object) {
  if (!object) return null;
  return {
    name: object.customMetadata?.name || "",
    type: object.httpMetadata?.contentType || "application/octet-stream",
    size: object.size,
    updated: object.uploaded.toISOString()
  };
}

function byteRange(value, size) {
  const parts = /^bytes=(\d*)-(\d*)$/.exec(value || "");
  if (!parts || (!parts[1] && !parts[2])) return null;
  const start = parts[1] ? Number(parts[1]) : Math.max(0, size - Number(parts[2]));
  const end = parts[1] && parts[2] ? Math.min(size - 1, Number(parts[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return null;
  return { offset: start, length: end - start + 1 };
}

async function readMedia(request, bucket, key) {
  const object = await bucket.head(key);
  if (!object) return problem(404, "რესურსი ჯერ არ არის ატვირთული.");
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? byteRange(rangeHeader, object.size) : null;
  const headers = {
    ...baseHeaders,
    "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    ETag: object.httpEtag
  };
  if (rangeHeader && !range) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${object.size}` } });
  const matching = request.headers.get("if-none-match") === object.httpEtag;
  if (!range && matching) return new Response(null, { status: 304, headers });
  if (range) headers["Content-Range"] = `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`;
  headers["Content-Length"] = String(range?.length ?? object.size);
  if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
  // Constrain the read to the exact object checked above during concurrent replacements.
  const body = await bucket.get(key, { ...(range ? { range } : {}), onlyIf: { etagMatches: object.etag } });
  if (!body?.body) return problem(409, "რესურსი ახლახან განახლდა. გახსენით ხელახლა.");
  return new Response(body.body, { status: range ? 206 : 200, headers });
}

async function writeMedia(request, bucket, key, kind) {
  let name;
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") || "").trim();
  } catch {
    return problem(400, "ფაილის სახელი ვერ წავიკითხეთ.");
  }
  const ext = name.split(".").pop().toLowerCase();
  const type = mediaTypes[kind].ext[ext];
  if (!name || name.length > 160 || !Object.hasOwn(mediaTypes[kind].ext, ext) || !request.body) {
    return problem(415, "აირჩიეთ ამ რესურსისთვის მხარდაჭერილი ფაილი.");
  }
  const size = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size < 1) return problem(411, "ფაილი ცარიელია ან მისი ზომა უცნობია.");
  if (size > mediaTypes[kind].max) return problem(413, "ფაილი მეტისმეტად დიდია.");
  const object = await bucket.put(key, request.body, {
    httpMetadata: { contentType: type },
    customMetadata: { name }
  });
  return json({ file: metadata(object) }, 201);
}

export function createApp({ lessonIds, asset }) {
  return {
    async fetch(request, env = {}) {
      try {
        const url = new URL(request.url);
        const method = request.method;
        if (!url.pathname.startsWith("/api/")) {
          if (!["GET", "HEAD"].includes(method)) return problem(405, "ეს მოქმედება აქ მიუწვდომელია.");
          const response = await asset(url.pathname === "/" ? "/index.html" : url.pathname, method);
          if (!response) return problem(404, "გვერდი ვერ მოიძებნა.");
          const headers = new Headers(response.headers);
          for (const [name, value] of Object.entries(baseHeaders)) headers.set(name, value);
          return new Response(response.body, { status: response.status, headers });
        }

        const origin = request.headers.get("origin");
        if (!["GET", "HEAD"].includes(method) && origin && origin !== url.origin) return problem(403, "მოთხოვნა სხვა მისამართიდანაა.");
        if (url.pathname === "/api/session" && method === "GET") return json({ authenticated: await authenticated(request, env), configured: configured(env) });
        if (url.pathname === "/api/login" && method === "POST") return await login(request, env);
        if (url.pathname === "/api/logout" && method === "POST") return json({ authenticated: false }, 200, { "Set-Cookie": cookie(request, "", 0) });

        const match = /^\/api\/media\/([a-z0-9-]+)(?:\/(video|audio|podcast))?$/.exec(url.pathname);
        if (!match || !lessonIds.has(match[1])) return problem(404, "პარაგრაფი ვერ მოიძებნა.");
        const [, id, kind] = match;
        if (!env.BUCKET) return problem(503, "მედიათეკა დროებით მიუწვდომელია.");
        const bucket = env.BUCKET;
        const prefix = `lesson/${id}/`;
        if (!kind && method === "GET") {
          const entries = await Promise.all(Object.keys(mediaTypes).map(async kind => [kind, metadata(await bucket.head(prefix + kind))]));
          return json({ media: Object.fromEntries(entries) });
        }
        if (!kind) return problem(405, "აირჩიეთ რესურსის ტიპი.");
        const key = prefix + kind;
        if (["GET", "HEAD"].includes(method)) return await readMedia(request, bucket, key);
        if (!await authenticated(request, env)) return problem(401, "ხელახლა შედით მასწავლებლის პანელში.");
        if (method === "PUT") return await writeMedia(request, bucket, key, kind);
        if (method === "DELETE") {
          await bucket.delete(key);
          return json({ file: null });
        }
        return problem(405, "ეს მოქმედება აქ მიუწვდომელია.");
      } catch (error) {
        console.error("Istoria request failed", error?.message || "Unknown error");
        return problem(500, "მოქმედება ვერ დასრულდა. სცადეთ ხელახლა.");
      }
    }
  };
}
