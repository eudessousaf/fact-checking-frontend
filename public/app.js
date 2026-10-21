// Página pública da checagem. Sem dependências: no pico de acesso, cada KB e
// cada pedido a terceiros contam.
//
// Regras que este arquivo garante:
// - Dado vindo do JSON vira TEXTO (textContent), nunca HTML.
// - Falha ao atualizar mantém o que já está na tela e tenta de novo.
// - Os números do gráfico vêm prontos do backend (stats); aqui não se recalcula.
// - Publicidade carrega DEPOIS da linha do tempo, e se falhar some sem barulho.
(() => {
  "use strict";

  const C = Object.assign({
    timelineUrl: "timeline.json", adsUrl: "ads.json",
    pollBaseSeconds: 20, pollJitterSeconds: 10,
    reportErrorHref: "#", reportErrorLabel: "", timezone: "America/Sao_Paulo",
  }, window.SITE_CONFIG || {});

  const VERDICTS = {
    VERDADEIRO: { label: "Verdadeiro", icon: "✓" },
    NAO_E_BEM_ASSIM: { label: "Não é bem assim", icon: "!" },
    FALSO: { label: "Falso", icon: "✗" },
  };
  const ORDER = ["VERDADEIRO", "NAO_E_BEM_ASSIM", "FALSO"];
  const STATUS = {
    aguardando: "Debate ainda não começou",
    em_andamento: "Debate em andamento",
    intervalo: "Intervalo comercial",
    encerrado: "Debate encerrado",
  };
  // Aba em segundo plano consulta 3x menos: com dezenas de milhares de
  // leitores, as abas esquecidas são boa parte do tráfego.
  const HIDDEN_FACTOR = 3;

  const $ = (id) => document.getElementById(id);
  let lastSeq = -1;
  let current = null;           // último timeline aplicado
  let olderItems = null;        // itens do arquivo completo, se carregado
  let timer = null;
  let adsStarted = false;

  // --- utilidades ----------------------------------------------------------------

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function safeHttpUrl(raw) {
    try {
      const u = new URL(String(raw), location.href);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
    } catch { return null; }
  }

  const timeFmt = (() => {
    try {
      return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: C.timezone });
    } catch {
      return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
  })();

  function hhmm(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : timeFmt.format(d).replace(":", "h");
  }

  function candidateName(data, id) {
    const c = (data.candidates || []).find((x) => x && x.id === id);
    return c ? (c.short_name || c.name) : (id ? `Candidato ${id}` : "");
  }

  function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

  // --- cabeçalho ---------------------------------------------------------------

  function renderHeader(data) {
    $("env-banner").hidden = data.environment === "producao";
    const st = $("status");
    st.textContent = STATUS[data.status] || "Situação desconhecida";
    st.className = `status status--${STATUS[data.status] ? data.status : "loading"}`;
    $("mode-banner").hidden = data.mode !== "pos_debate";
    const ev = data.event || {};
    if (ev.title) { $("event-title").textContent = ev.title; document.title = `Checagem — ${ev.title}`; }
    const names = (data.candidates || []).map((c) => c && c.name).filter(Boolean).join(" × ");
    $("event-sub").textContent = [ev.broadcaster, names].filter(Boolean).join(" · ");
  }

  // --- gráfico -------------------------------------------------------------------

  function renderChart(data) {
    const box = $("chart");
    const stats = (data.stats && Array.isArray(data.stats.by_candidate)) ? data.stats.by_candidate : [];
    const rows = stats.map((s) => {
      const name = candidateName(data, s.candidate_id);
      const total = Number(s.total) || 0;
      if (!s.display) {
        return el("div", { class: "chart-row" },
          el("p", { class: "chart-name" }, name),
          el("p", { class: "chart-insufficient" },
            `Dados insuficientes para comparação (${plural(total, "checagem", "checagens")} até agora).`));
      }
      // Porcentagem nunca aparece sem o total ao lado: "40% (4 de 10)".
      const parts = ORDER.map((v) => {
        const cp = s[v] || { count: 0, pct: 0 };
        return { v, count: Number(cp.count) || 0, pct: Number(cp.pct) || 0 };
      });
      const summary = parts.map((p) => `${VERDICTS[p.v].label} ${p.pct}% (${p.count} de ${total})`).join("; ");
      const bar = el("div", { class: "bar", role: "img", "aria-label": `${name}: ${summary}` },
        ...parts.filter((p) => p.pct > 0).map((p) => {
          const seg = el("span", { class: `seg-${p.v}` });
          seg.style.width = `${p.pct}%`;
          return seg;
        }));
      const legend = el("ul", { class: "chart-legend", "aria-hidden": "true" },
        ...parts.map((p) => el("li", null,
          `${VERDICTS[p.v].icon} ${VERDICTS[p.v].label} ${p.pct}% (${p.count} de ${total})`)));
      return el("div", { class: "chart-row" }, el("p", { class: "chart-name" }, name), bar, legend);
    });
    box.replaceChildren(...rows);
  }

  // --- linha do tempo ------------------------------------------------------------

  function renderPublished(data, it) {
    const v = VERDICTS[it.verdict];
    if (!v) return null; // veredito desconhecido: melhor não mostrar do que mostrar errado
    const node = el("li", { class: `item item--${it.verdict}`, id: `item-${it.id}` },
      el("span", { class: `badge badge--${it.verdict}` }, el("span", { "aria-hidden": "true" }, v.icon), v.label),
      el("p", { class: "meta" }, el("strong", null, candidateName(data, it.candidate_id)),
        it.said_at ? ` · disse às ${hhmm(it.said_at)}` : ""));
    if (it.quote) {
      node.append(el("blockquote", { class: "quote" }, `“${it.quote}”`,
        el("small", null, "transcrição automática")));
    }
    if (it.claim) node.append(el("p", { class: "claim" }, `Afirmação checada: ${it.claim}`));
    if (it.explanation) node.append(el("p", null, it.explanation));
    if (it.what_is_off) node.append(el("p", { class: "off" }, el("strong", null, "O que não confere: "), it.what_is_off));
    const ind = it.indicators || {};
    if (typeof ind.source_count === "number") {
      node.append(el("ul", { class: "indicators" },
        el("li", null, plural(ind.source_count, "fonte", "fontes")),
        el("li", null, `Fonte primária: ${ind.has_primary_source ? "sim" : "não"}`),
        el("li", null, `Checagem de agência: ${ind.has_agency_check ? "sim" : "não"}`)));
    }
    const sources = (it.sources || []).map((s) => {
      const href = safeHttpUrl(s && s.url);
      if (!href) return null;
      return el("li", null,
        el("a", { href, target: "_blank", rel: "noopener noreferrer nofollow" }, s.title || href),
        s.publisher ? ` — ${s.publisher}` : "");
    }).filter(Boolean);
    if (sources.length) node.append(el("p", { class: "meta" }, "Fontes:"), el("ol", { class: "sources" }, ...sources));
    if (it.updated_at) node.append(el("p", { class: "edited" }, `Atualizada pela equipe às ${hhmm(it.updated_at)}.`));
    return node;
  }

  function renderRemoved(data, it) {
    // Removido aparece, mas sem o conteúdo retirado: some da leitura, não da história.
    const who = it.candidate_id ? candidateName(data, it.candidate_id) : "";
    return el("li", { class: "item item--removido", id: `item-${it.id}` },
      el("p", null, el("strong", null, "Checagem removida/corrigida pela equipe")),
      el("p", { class: "meta" },
        [who, it.said_at ? `fala das ${hhmm(it.said_at)}` : "", it.removed_at ? `removida às ${hhmm(it.removed_at)}` : ""]
          .filter(Boolean).join(" · ")),
      it.note ? el("p", null, it.note) : null);
  }

  function mergedItems(data) {
    const latest = Array.isArray(data.items) ? data.items : [];
    if (!olderItems) return latest;
    const byId = new Map(olderItems.map((i) => [i.id, i]));
    for (const i of latest) byId.set(i.id, i); // o mais recente vence (removido, editado)
    return [...byId.values()].sort((a, b) => String(b.said_at).localeCompare(String(a.said_at)));
  }

  function renderTimeline(data) {
    const items = mergedItems(data)
      .map((it) => (it && it.state === "removido" ? renderRemoved(data, it)
        : it && it.state === "publicado" ? renderPublished(data, it) : null))
      .filter(Boolean);
    $("timeline").replaceChildren(...items);
    $("empty").hidden = items.length > 0;
    $("load-older").hidden = !data.older_items_url || olderItems !== null;
  }

  function render(data) {
    renderHeader(data);
    renderChart(data);
    renderTimeline(data);
  }

  // --- atualização periódica -----------------------------------------------------

  function setUpdated(ok) {
    const now = new Date();
    const t = timeFmt.format(now).replace(":", "h");
    $("updated").textContent = ok ? `Atualizado às ${t}. A página se atualiza sozinha.`
      : `Sem conexão para atualizar (${t}). Tentando de novo…`;
  }

  function schedule() {
    clearTimeout(timer);
    let secs = C.pollBaseSeconds + Math.random() * C.pollJitterSeconds;
    if (document.hidden) secs *= HIDDEN_FACTOR;
    timer = setTimeout(load, secs * 1000);
  }

  async function load() {
    try {
      // "no-cache" NÃO desliga o cache: faz o navegador perguntar "mudou?"
      // (If-None-Match) e reaproveitar a cópia quando a resposta é 304.
      const r = await fetch(C.timelineUrl, { cache: "no-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const seq = typeof data.sequence === "number" ? data.sequence : 0;
      // Uma borda da CDN pode entregar um arquivo mais velho que o já exibido.
      if (seq > lastSeq || current === null) {
        lastSeq = seq;
        current = data;
        render(data);
      }
      setUpdated(true);
      if (!adsStarted) { adsStarted = true; loadAds(); }
    } catch (e) {
      setUpdated(false);
    } finally {
      schedule();
    }
  }

  async function loadOlder() {
    if (!current || !current.older_items_url) return;
    const btn = $("load-older");
    btn.disabled = true;
    btn.textContent = "Carregando…";
    try {
      const r = await fetch(new URL(current.older_items_url, new URL(C.timelineUrl, location.href)), { cache: "no-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const full = await r.json();
      olderItems = Array.isArray(full.items) ? full.items : [];
      renderTimeline(current);
    } catch {
      btn.textContent = "Não foi possível carregar. Tentar de novo";
    } finally {
      btn.disabled = false;
    }
  }

  // --- publicidade -------------------------------------------------------------

  const AD_IMAGE = /^ads\/[A-Za-z0-9][A-Za-z0-9._-]*\.(webp|png|jpe?g|avif)$/;

  function adNode(ad, onFail) {
    const img = el("img", { src: ad.image_path, width: ad.image_width, height: ad.image_height,
      alt: ad.alt_text, decoding: "async" });
    img.addEventListener("error", onFail, { once: true });
    const link = el("a", { href: ad.link_url, target: "_blank", rel: "sponsored noopener noreferrer" }, img);
    return { img, link };
  }

  function reserveBottom(slot) {
    const apply = () => { document.body.style.paddingBottom = slot.hidden ? "" : `${slot.offsetHeight}px`; };
    apply();
    window.addEventListener("resize", apply);
    slot.querySelector("img")?.addEventListener("load", apply);
  }

  function showModal(ad) {
    let shown = false;
    try { shown = sessionStorage.getItem("ad-modal-shown") === "1"; } catch { /* sem storage: mostra uma vez por carga */ }
    if (shown) return;
    setTimeout(() => {
      const modal = $("ad-modal");
      const box = modal.querySelector(".ad-modal__content");
      const close = modal.querySelector(".ad-modal__close");
      const opener = document.activeElement;
      const hide = () => {
        modal.hidden = true;
        document.removeEventListener("keydown", onKey);
        if (opener && opener.focus) opener.focus();
      };
      const onKey = (e) => { if (e.key === "Escape") hide(); };
      const { link } = adNode(ad, hide);
      box.replaceChildren(link, el("p", { class: "ad-label" }, `Anunciante: ${ad.advertiser}`));
      close.onclick = hide;
      modal.onclick = (e) => { if (e.target === modal) hide(); };
      document.addEventListener("keydown", onKey);
      modal.hidden = false;
      close.focus();
      try { sessionStorage.setItem("ad-modal-shown", "1"); } catch { /* idem */ }
    }, (Number(ad.modal_delay_seconds) || 8) * 1000);
  }

  async function loadAds() {
    try {
      const r = await fetch(C.adsUrl, { cache: "no-cache" });
      if (!r.ok) return;
      const ad = await r.json();
      if (!ad || ad.active !== true) return;
      // O backend valida pelo schema; aqui só se recusa o que poderia
      // carregar algo de terceiros ou enganar o leitor.
      if (!AD_IMAGE.test(ad.image_path || "") || !/^https:\/\//.test(ad.link_url || "")
          || !ad.alt_text || !ad.advertiser) return;
      if (ad.format === "modal") { showModal(ad); return; }
      const slot = ad.format === "faixa_topo" ? $("ad-top") : ad.format === "faixa_rodape" ? $("ad-bottom") : null;
      if (!slot) return;
      const { link } = adNode(ad, () => { slot.hidden = true; slot.replaceChildren(); reserveBottom(slot); });
      slot.replaceChildren(el("p", { class: "ad-label" }, "Publicidade"), link);
      slot.hidden = false;
      if (slot.id === "ad-bottom") reserveBottom(slot);
    } catch { /* anúncio nunca derruba a página */ }
  }

  // --- início ----------------------------------------------------------------------

  const report = $("report-link");
  report.href = C.reportErrorHref;
  if (C.reportErrorLabel) report.textContent = `Avise-nos (${C.reportErrorLabel})`;
  $("load-older").addEventListener("click", loadOlder);
  document.addEventListener("visibilitychange", () => {
    // Ao voltar para a aba, atualiza logo — com um pouco de variação, para
    // não sincronizar todo mundo que desbloqueia o celular junto.
    if (!document.hidden) { clearTimeout(timer); timer = setTimeout(load, Math.random() * 3000); }
  });
  load();
})();
