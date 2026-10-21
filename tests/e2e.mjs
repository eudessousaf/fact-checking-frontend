// Testes da página num navegador de verdade (Chromium), contra o servidor que
// imita a CDN. Rodar: npm run test:e2e
//
// Navegador: CHROMIUM_PATH, ou o Chromium da nuvem, ou o Google Chrome da máquina.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startServer } from "../scripts/serve.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLOUD_CHROMIUM = "/opt/pw-browsers/chromium";
const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
  : existsSync(CLOUD_CHROMIUM) ? { executablePath: CLOUD_CHROMIUM } : { channel: "chrome" };

let browser;
before(async () => { browser = await chromium.launch(launchOpts); });
after(async () => { await browser?.close(); });

// Cada cenário ganha uma cópia de public/ com config acelerada e dados próprios.
async function site({ timeline, ads, failJson = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "pagina-"));
  await cp(join(root, "public"), dir, { recursive: true });
  await writeFile(join(dir, "config.js"), `window.SITE_CONFIG = { timelineUrl: "timeline.json", adsUrl: "ads.json",
    pollBaseSeconds: 0.3, pollJitterSeconds: 0.1, reportErrorHref: "mailto:erro@exemplo.com",
    reportErrorLabel: "erro@exemplo.com", timezone: "America/Sao_Paulo" };`);
  if (timeline) await writeFile(join(dir, "timeline.json"), JSON.stringify(timeline));
  if (ads) await writeFile(join(dir, "ads.json"), JSON.stringify(ads));
  const hooks = { fail: () => false };
  const srv = await startServer(dir, 0, hooks);
  return { dir, url: `http://127.0.0.1:${srv.port}/`, srv, hooks,
    close: () => new Promise((ok) => srv.server.close(ok)) };
}

const example = JSON.parse(await readFile(join(root, "public/timeline.json"), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));

test("exemplo: status, vereditos, gráfico e item removido", async () => {
  const s = await site();
  const page = await browser.newPage();
  try {
    await page.goto(s.url);
    await page.waitForSelector(".item");
    assert.equal(await page.textContent("#status"), "Debate em andamento");
    assert.equal(await page.isVisible("#env-banner"), true, "ambiente de teste precisa de faixa");
    const badges = await page.$$eval(".badge", (b) => b.map((x) => x.textContent));
    assert.ok(badges.some((t) => t.includes("Não é bem assim")));
    // Gráfico: A tem 8 (aparece, com total ao lado); B tem 3 (insuficiente).
    const chart = await page.textContent("#chart");
    assert.match(chart, /Verdadeiro 50% \(4 de 8\)/);
    assert.match(chart, /Dados insuficientes para comparação \(3 checagens até agora\)/);
    assert.match(await page.textContent(".item--removido"), /removida\/corrigida pela equipe/);
    assert.match(await page.textContent(".quote"), /transcrição automática/);
    assert.equal(await page.getAttribute("#report-link", "href"), "mailto:erro@exemplo.com");
  } finally { await page.close(); await s.close(); }
});

test("atualiza sozinha, ignora arquivo mais velho e usa 304", async () => {
  const s = await site();
  const page = await browser.newPage();
  try {
    await page.goto(s.url);
    await page.waitForSelector(".item");
    const before = await page.$$eval(".item", (x) => x.length);
    await new Promise((r) => setTimeout(r, 1500));
    assert.ok(s.srv.stats.notModified > 0, "o navegador deveria perguntar 'mudou?' e receber 304");

    const newer = clone(example);
    newer.sequence += 1;
    newer.status = "intervalo";
    newer.items.unshift({ ...clone(example.items.find((i) => i.state === "publicado")), id: "chk-9999" });
    newer.items[0].quote = "NOVO ITEM";
    await writeFile(join(s.dir, "timeline.json"), JSON.stringify(newer));
    await page.waitForFunction(() => document.querySelectorAll(".item").length > 0
      && document.getElementById("status").textContent === "Intervalo comercial");
    assert.equal(await page.$$eval(".item", (x) => x.length), before + 1);

    const older = clone(example); // sequence menor: cache atrasado de uma borda
    older.status = "encerrado";
    await writeFile(join(s.dir, "timeline.json"), JSON.stringify(older));
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await page.textContent("#status"), "Intervalo comercial");
  } finally { await page.close(); await s.close(); }
});

test("falha de rede mantém o conteúdo e avisa", async () => {
  const s = await site();
  const page = await browser.newPage();
  try {
    await page.goto(s.url);
    await page.waitForSelector(".item");
    const n = await page.$$eval(".item", (x) => x.length);
    s.hooks.fail = (p) => p.endsWith(".json");
    await page.waitForFunction(() => document.getElementById("updated").textContent.includes("Sem conexão"));
    assert.equal(await page.$$eval(".item", (x) => x.length), n);
    s.hooks.fail = () => false;
    await page.waitForFunction(() => document.getElementById("updated").textContent.includes("Atualizado"));
  } finally { await page.close(); await s.close(); }
});

test("texto do JSON nunca vira HTML; URL não-http é descartada", async () => {
  const t = clone(example);
  const it = t.items.find((i) => i.state === "publicado");
  it.quote = '<img src=x onerror="window.__xss=1">';
  it.sources[0].url = "javascript:window.__xss=2";
  const s = await site({ timeline: t });
  const page = await browser.newPage();
  try {
    await page.goto(s.url);
    await page.waitForSelector(".item");
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.$$eval(".timeline img", (x) => x.length), 0);
    assert.equal(await page.$$eval('a[href^="javascript"]', (x) => x.length), 0);
  } finally { await page.close(); await s.close(); }
});

test("pós-debate mostra o aviso; campos ausentes não quebram", async () => {
  const t = clone(example);
  t.mode = "pos_debate";
  t.status = "encerrado";
  delete t.stats;
  delete t.event.broadcaster;
  t.items[1] = { id: "chk-x", state: "publicado", verdict: "FALSO" }; // quase vazio
  const s = await site({ timeline: t });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(s.url);
    await page.waitForSelector(".item");
    assert.equal(await page.isVisible("#mode-banner"), true);
    assert.equal(await page.textContent("#status"), "Debate encerrado");
    assert.deepEqual(errors, []);
  } finally { await page.close(); await s.close(); }
});

test("celular (375 px): sem rolagem lateral", async () => {
  const s = await site();
  const page = await browser.newPage({ viewport: { width: 375, height: 740 } });
  try {
    await page.goto(s.url);
    await page.waitForSelector(".item");
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 375, `largura ${w}px passa da tela`);
  } finally { await page.close(); await s.close(); }
});

const BANNER = { schema_version: "1.0", updated_at: "2026-10-23T20:00:00-03:00", active: true,
  format: "faixa_rodape", image_path: "ads/teste.png", image_width: 728, image_height: 90,
  link_url: "https://example.com/", alt_text: "Anúncio de teste", advertiser: "Anunciante Teste" };
// PNG 1x1 válido.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("faixa de rodapé: rótulo Publicidade e espaço reservado", async () => {
  const s = await site({ ads: BANNER });
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(s.dir, "ads"), { recursive: true });
  await writeFile(join(s.dir, "ads/teste.png"), PNG);
  const page = await browser.newPage({ viewport: { width: 375, height: 740 } });
  try {
    await page.goto(s.url);
    await page.waitForSelector("#ad-bottom:not([hidden]) img");
    assert.match(await page.textContent("#ad-bottom"), /Publicidade/);
    await page.waitForFunction(() => parseFloat(document.body.style.paddingBottom) > 0);
  } finally { await page.close(); await s.close(); }
});

test("anúncio com imagem de terceiros é recusado; imagem quebrada some", async () => {
  const s = await site({ ads: { ...BANNER, image_path: "https://terceiro.example/x.png" } });
  const page = await browser.newPage();
  try {
    await page.goto(s.url);
    await page.waitForSelector(".item");
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await page.isHidden("#ad-bottom"), true);
  } finally { await page.close(); await s.close(); }
  const s2 = await site({ ads: { ...BANNER, image_path: "ads/nao-existe.png" } });
  const page2 = await browser.newPage();
  try {
    await page2.goto(s2.url);
    await page2.waitForSelector(".item");
    await page2.waitForFunction(() => document.getElementById("ad-bottom").hidden);
  } finally { await page2.close(); await s2.close(); }
});

test("modal: aparece depois do atraso, fecha com ESC e não volta na mesma visita", async () => {
  const s = await site({ ads: { ...BANNER, format: "modal", modal_delay_seconds: 3 } });
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(s.dir, "ads"), { recursive: true });
  await writeFile(join(s.dir, "ads/teste.png"), PNG);
  const page = await browser.newPage();
  try {
    await page.goto(s.url);
    await page.waitForSelector(".item");
    assert.equal(await page.isHidden("#ad-modal"), true, "não pode abrir antes do atraso");
    await page.waitForSelector("#ad-modal:not([hidden])", { timeout: 6000 });
    assert.match(await page.textContent("#ad-modal"), /Publicidade/);
    await page.keyboard.press("Escape");
    assert.equal(await page.isHidden("#ad-modal"), true);
    await page.reload();
    await page.waitForSelector(".item");
    await new Promise((r) => setTimeout(r, 4000));
    assert.equal(await page.isHidden("#ad-modal"), true, "uma vez por visita");
  } finally { await page.close(); await s.close(); }
});
