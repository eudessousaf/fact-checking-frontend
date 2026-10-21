// Servidor local que se comporta como a CDN no que importa para a página:
// ETag + 304, gzip e Cache-Control curto. Só para teste; em produção quem
// serve é a CDN, nunca esta máquina.
//
//   node scripts/serve.mjs [pasta] [porta]     (padrão: public 8080)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".avif": "image/avif", ".svg": "image/svg+xml",
};

export function startServer(root, port = 0, hooks = {}) {
  const base = resolve(root);
  const stats = { requests: 0, notModified: 0 };
  const server = createServer(async (req, res) => {
    stats.requests++;
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (hooks.fail && hooks.fail(path)) { res.writeHead(503).end(); return; }
    const file = normalize(join(base, path.endsWith("/") ? path + "index.html" : path));
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    try {
      if (!(await stat(file)).isFile()) throw new Error("dir");
      const body = await readFile(file);
      const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;
      const headers = {
        "Content-Type": TYPES[extname(file)] || "application/octet-stream",
        ETag: etag,
        // Igual ao que se configura na CDN para os JSON: cache curto.
        "Cache-Control": extname(file) === ".json" ? "public, max-age=10" : "public, max-age=300",
        Vary: "Accept-Encoding",
      };
      if (req.headers["if-none-match"] === etag) {
        stats.notModified++;
        res.writeHead(304, headers).end();
        return;
      }
      const gz = /\bgzip\b/.test(req.headers["accept-encoding"] || "") && /json|javascript|css|html/.test(headers["Content-Type"]);
      if (gz) headers["Content-Encoding"] = "gzip";
      res.writeHead(200, headers).end(gz ? gzipSync(body) : body);
    } catch {
      res.writeHead(404).end("não encontrado");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({ server, stats, port: server.address().port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || "public";
  const { port } = await startServer(root, Number(process.argv[3] || 8080));
  console.log(`servindo ${root} em http://127.0.0.1:${port}  (Ctrl+C para parar)`);
}
