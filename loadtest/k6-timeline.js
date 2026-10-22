// Teste de carga da página na CDN (k6: https://k6.io).
//
//   k6 run -e URL=https://SEU-BUCKET.REGIAO.cdn.digitaloceanspaces.com/teste/ -e RATE=500 loadtest/k6-timeline.js
//
// O que ele mede: a CDN aguentar RATE pedidos/s do timeline.json, como os
// leitores fazem (com If-None-Match → 304), sem erro e com resposta rápida.
//
// O que ele NÃO prova: 80 mil leitores ≈ 3.200 pedidos/s. Um computador
// doméstico satura antes disso (conexão e CPU), então o resultado é medido
// numa taxa menor e extrapolado — os números que importam são: zero erros,
// p95 baixo e a CDN respondendo do cache (cabeçalhos abaixo).
import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

const BASE = (__ENV.URL || "").replace(/\/?$/, "/");
const RATE = Number(__ENV.RATE || 300);
const notModified = new Rate("respostas_304");

export const options = {
  scenarios: {
    leitores: {
      executor: "ramping-arrival-rate",
      startRate: Math.max(10, Math.round(RATE / 10)),
      timeUnit: "1s",
      preAllocatedVUs: Math.max(50, RATE),
      maxVUs: Math.max(200, RATE * 3),
      stages: [
        { target: RATE, duration: "30s" },   // sobe
        { target: RATE, duration: "2m" },    // sustenta
        { target: 0, duration: "15s" },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

export function setup() {
  if (!__ENV.URL) throw new Error("passe -e URL=https://…/ (a pasta da página na CDN)");
  const page = http.get(BASE, { headers: { "Accept-Encoding": "gzip" } });
  const t = http.get(BASE + "timeline.json", { headers: { "Accept-Encoding": "gzip" } });
  console.log(`página: HTTP ${page.status}, ${page.body ? page.body.length : 0} bytes`);
  console.log(`timeline.json: HTTP ${t.status}, Content-Encoding=${t.headers["Content-Encoding"]}, ` +
              `Cache-Control=${t.headers["Cache-Control"]}, ETag=${t.headers["Etag"] || t.headers["ETag"]}`);
  return { etag: t.headers["Etag"] || t.headers["ETag"] || "" };
}

export default function (data) {
  // Cada leitor já tem o arquivo e pergunta "mudou?" — como o navegador faz.
  const res = http.get(BASE + "timeline.json", {
    headers: { "Accept-Encoding": "gzip", ...(data.etag ? { "If-None-Match": data.etag } : {}) },
    tags: { arquivo: "timeline" },
  });
  notModified.add(res.status === 304);
  check(res, { "200 ou 304": (r) => r.status === 200 || r.status === 304 });
}
