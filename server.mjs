import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("dist");
const port = Number(process.env.PORT || 4322);
const revision = (process.env.REVISION || process.env.RAILWAY_GIT_COMMIT_SHA || "local").slice(0, 80);
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json; charset=utf-8" };

if (!existsSync(join(root, "index.html"))) throw new Error("dist/index.html not found. Run pnpm build first.");

createServer((request, response) => {
  const headers = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" };
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  if (pathname === "/healthz") { response.writeHead(200, { ...headers, "Content-Type": "application/json" }); response.end(JSON.stringify({ status: "ok" })); return; }
  if (pathname === "/revision") { response.writeHead(200, { ...headers, "Content-Type": "application/json" }); response.end(JSON.stringify({ revision })); return; }
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400, headers); response.end("Bad path"); return; }
  const candidate = resolve(root, `.${normalize(decoded)}`);
  if (candidate !== root && !candidate.startsWith(`${root}\\`) && !candidate.startsWith(`${root}/`)) { response.writeHead(400, headers); response.end("Bad path"); return; }
  const hasExt = Boolean(extname(decoded));
  const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : hasExt ? null : join(root, "index.html");
  if (!file) { response.writeHead(404, headers); response.end("Not found"); return; }
  const extension = extname(file).toLowerCase();
  response.writeHead(200, { ...headers, "Content-Type": types[extension] || "application/octet-stream", "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable" });
  if (request.method === "HEAD") response.end(); else createReadStream(file).pipe(response);
}).listen(port, "0.0.0.0", () => process.stdout.write(`Veil listening on 0.0.0.0:${port} (${revision})\n`));
