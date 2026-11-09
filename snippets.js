/* Arena: gera os códigos colados no Elementor. Nenhum segredo aqui: só a URL pública do banco. */
(function (raiz) {
  'use strict';

  const JS_COMUM = (db, exp) => `var DB = ${JSON.stringify(db)}, EXP = ${JSON.stringify(exp)};
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function aleatorio(n) { var s = "", a = new Uint8Array(n), i; (window.crypto || window.msCrypto).getRandomValues(a); for (i = 0; i < n; i++) s += (a[i] % 36).toString(36); return s; }
  function enviar(caminho, dados, metodo) {
    var u = DB + "/" + caminho + ".json?x-http-method-override=" + metodo, b = JSON.stringify(dados);
    try { if (navigator.sendBeacon) { if (navigator.sendBeacon(u, new Blob([b], {type: "text/plain;charset=UTF-8"}))) return; } } catch (e) {}
    try { fetch(u, {method: "POST", body: b, keepalive: true, headers: {"Content-Type": "text/plain;charset=UTF-8"}}); } catch (e) {}
  }
  /* Etapa do funil: depende do registro já existir no banco, então confere a resposta e tenta de novo. */
  function enviarEtapa(caminho, tentativa) {
    var u = DB + "/" + caminho + ".json?x-http-method-override=PUT", n = tentativa || 0;
    try {
      fetch(u, {method: "POST", body: '{".sv":"timestamp"}', keepalive: true, headers: {"Content-Type": "text/plain;charset=UTF-8"}})
        .then(function (r) { if (!r.ok) { if (n < 3) setTimeout(function () { enviarEtapa(caminho, n + 1); }, 1500 * (n + 1)); } })
        .catch(function () { if (n < 3) setTimeout(function () { enviarEtapa(caminho, n + 1); }, 1500 * (n + 1)); });
    } catch (e) {}
  }
  function dispositivo() { var u = navigator.userAgent;
    if (/iPad|Tablet/i.test(u)) return "tablet"; if (/Mobi|iPhone/i.test(u)) return "celular"; if (/Android/i.test(u)) return "tablet"; return "computador"; }`;

  function caminhoDe(url) {
    const p = new URL(url).pathname;
    return p.endsWith('/') ? p : p + '/';
  }

  /* Página de entrada: sorteia, grava a atribuição e redireciona sem acrescentar parâmetro nenhum.
     Parâmetro novo fura o cache do LiteSpeed (medido: 0,3 s para 1,3 s). UTM e fbclid não furam. */
  function codigoEntrada(exp, db) {
    const pag = {}, pesos = {};
    exp.variantes.forEach(v => { pag[v.id] = v.url; pesos[v.id] = Number(v.peso) || 0; });
    const reserva = JSON.stringify({status: 'ativo', pesos, paginas: pag, cfgv: 0}).replace(/</g, '\\u003c');
    const primeira = exp.variantes[0].url;
    return `<!-- Arena · página de entrada · ${exp.id}. Não precisa recolar ao mudar percentuais no painel. -->
<link rel="preconnect" href="${db}" crossorigin>
<style>html,body{background:#000!important}</style>
<noscript><meta http-equiv="refresh" content="0;url=${primeira}"></noscript>
<script data-no-optimize="1" data-no-defer="1" data-cfasync="false">
(function () {
  ${JS_COMUM(db, exp.id)}
  var RESERVA = ${reserva}, ESPERA = 1200, feito = false;
  var q = new URLSearchParams(location.search);
  if (q.get("arena") === "teste") ls("arena_teste", "1");
  if (q.get("arena") === "normal") { try { localStorage.removeItem("arena_teste"); } catch (e) {} }
  var robo = /bot|crawl|spider|facebookexternalhit|meta-external|adsbot|lighthouse|preview/i.test(navigator.userAgent);

  function ir(url) {
    var d; try { d = new URL(url); } catch (e) { return; }
    q.forEach(function (valor, chave) { if (chave !== "arena") { if (!d.searchParams.has(chave)) d.searchParams.set(chave, valor); } });
    location.replace(d.toString());
  }
  function sortear(c) {
    var ids = Object.keys(c.paginas), ativos = ids.filter(function (l) { return (c.pesos[l] || 0) > 0; }), total = 0, i;
    if (!ativos.length) { ativos = ids; ativos.forEach(function (l) { c.pesos[l] = 1; }); }
    ativos.forEach(function (l) { total += c.pesos[l]; });
    var a = new Uint32Array(1); window.crypto.getRandomValues(a);
    var r = a[0] / 4294967296 * total;
    for (i = 0; i < ativos.length; i++) { r -= c.pesos[ativos[i]]; if (r < 0) return ativos[i]; }
    return ativos[ativos.length - 1];
  }
  function decidir(c) {
    var guardada = null;
    try { guardada = JSON.parse(ls("arena_" + EXP)); } catch (e) {}
    if (c.status === "encerrado") { if (c.vencedora ? c.paginas[c.vencedora] : false) return ir(c.paginas[c.vencedora]); }
    if (guardada ? c.paginas[guardada.v] : false) return ir(c.paginas[guardada.v]);
    if (c.status === "pausado") return ir(c.paginas[Object.keys(c.paginas).sort()[0]]);
    var v = sortear(c);
    if (robo) return ir(c.paginas[v]);
    var id = aleatorio(16), registro = {v: v, t: {".sv": "timestamp"}, cfgv: c.cfgv || 0, disp: dispositivo()};
    ["src:utm_source", "med:utm_medium", "cmp:utm_campaign", "ad:utm_content", "con:utm_term"].forEach(function (p) {
      var par = p.split(":"), val = q.get(par[1]); if (val) registro[par[0]] = val.slice(0, 120); });
    if (ls("arena_teste")) registro.x = true;
    ls("arena_" + EXP, JSON.stringify({id: id, v: v}));
    enviar("visitas/" + EXP + "/" + id, registro, "PUT");
    ir(c.paginas[v]);
  }
  function seguir(c) {
    if (feito) return; feito = true;
    function valida(x) { return x ? (x.paginas ? !!x.pesos : false) : false; }
    if (valida(c)) ls("arena_cfg_" + EXP, JSON.stringify(c));
    else { try { c = JSON.parse(ls("arena_cfg_" + EXP)); } catch (e) { c = null; } }
    decidir(valida(c) ? c : RESERVA);
  }
  var ctrl = window.AbortController ? new AbortController() : null;
  setTimeout(function () { if (ctrl) ctrl.abort(); seguir(null); }, ESPERA);
  fetch(DB + "/config/" + EXP + ".json", {cache: "no-store", signal: ctrl ? ctrl.signal : undefined})
    .then(function (r) { return r.ok ? r.json() : null; }).then(seguir).catch(function () { seguir(null); });
})();
<\/script>`;
  }

  /* Páginas do teste e obrigado: o mesmo código para todas, sem capturar conteúdo de campo. */
  function codigoPaginas(exp, db) {
    const mapa = {};
    exp.variantes.forEach(v => { mapa[caminhoDe(v.url)] = v.id; });
    const obrig = exp.obrigado ? caminhoDe(exp.obrigado) : '';
    return `<!-- Arena · rastreamento · ${exp.id}. Cole em cada página do teste e na página de obrigado. -->
<script data-no-optimize="1" data-no-defer="1" data-cfasync="false">
(function () {
  ${JS_COMUM(db, exp.id)}
  var MAPA = ${JSON.stringify(mapa).replace(/</g, '\\u003c')}, OBRIGADO = ${JSON.stringify(obrig)};
  var p = location.pathname; if (p.charAt(p.length - 1) !== "/") p += "/";
  var pagina = MAPA[p], ctx = null, direta = false, base, vid, v;
  if (!pagina) { if (p !== OBRIGADO) return; }
  try { ctx = JSON.parse(ls("arena_" + EXP)); } catch (e) {}
  var teste = !!ls("arena_teste");

  if (ctx ? (!pagina || ctx.v === pagina) : false) { vid = ctx.id; v = ctx.v; base = "visitas/" + EXP + "/" + vid; }
  else if (pagina) {
    /* Veio direto, sem passar pelo sorteio, ou abriu outra variante: fica fora da comparação. */
    direta = true; v = pagina;
    var did = ls("arena_dir_" + EXP); if (!did) { did = aleatorio(16); ls("arena_dir_" + EXP, did); }
    vid = did + "_" + pagina; base = "diretas/" + EXP + "/" + vid;
    if (!ls("arena_m_" + vid)) {
      ls("arena_m_" + vid, "1");
      var q = new URLSearchParams(location.search), r = {v: v, t: {".sv": "timestamp"}, disp: dispositivo()};
      if (q.get("utm_source")) r.src = q.get("utm_source").slice(0, 120);
      if (q.get("utm_campaign")) r.cmp = q.get("utm_campaign").slice(0, 120);
      if (teste) r.x = true;
      r.ver = {".sv": "timestamp"}; ls("arena_ver_" + vid, "1");
      enviar(base, r, "PUT");
    }
  } else return;

  function marca(campo) {
    var k = "arena_" + campo + "_" + vid; if (ls(k)) return; ls(k, "1");
    enviarEtapa(base + "/" + campo);
  }
  if (pagina) marca("ver"); else return marca("obr");

  var ultimo = 0;
  function sucesso() {
    var agora = Date.now(); if (agora - ultimo < 3000) return; ultimo = agora;
    marca("ok");
    var r = {v: v, t: {".sv": "timestamp"}, vid: vid, d: direta}; if (teste) r.x = true;
    enviar("cadastros/" + EXP + "/" + aleatorio(24), r, "PUT");
  }
  function falha(tipo) {
    var r = {v: v, t: {".sv": "timestamp"}, tipo: tipo, d: direta}; if (teste) r.x = true;
    enviar("erros/" + EXP + "/" + aleatorio(24), r, "PUT");
  }
  function ehForm(el) { return (el ? !!el.closest : false) ? el.closest("form.elementor-form") : null; }

  document.addEventListener("click", function (ev) {
    var a = (ev.target ? !!ev.target.closest : false) ? ev.target.closest("a,button") : null;
    if (a ? !ehForm(a) : false) { var h = a.getAttribute("href") || ""; if (h.charAt(0) === "#" || /elementor-button/.test(a.className)) marca("clk"); }
  }, true);
  document.addEventListener("focusin", function (ev) { if (ehForm(ev.target)) marca("ini"); }, true);
  document.addEventListener("submit", function (ev) { if (ehForm(ev.target)) { marca("ini"); marca("env"); } }, true);

  /* Cadastro só conta com a resposta de sucesso do servidor do Elementor. */
  (function ligar() {
    var $ = window.jQuery; if (!$) return setTimeout(ligar, 300);
    $(document).ajaxComplete(function (e, xhr, o) {
      var d = o ? o.data : null; if (!d || !d.get || d.get("action") !== "elementor_pro_forms_send_form") return;
      var j = xhr.responseJSON || {}, dj = j.data || {};
      if (j.success === true) return sucesso();
      if (dj.errors ? Object.keys(dj.errors).length : 0) return falha("validacao");
      falha("integracao");
    });
    $(document).on("submit_success", "form.elementor-form", sucesso);
  })();

  /* Tempo ativo e rolagem. */
  var rol = 0, ativo = 0, desde = document.visibilityState === "visible" ? Date.now() : 0, enviado = "";
  function medir() { var h = document.documentElement; rol = Math.max(rol, Math.min(100, Math.round((window.scrollY + window.innerHeight) / Math.max(h.scrollHeight, 1) * 100))); }
  window.addEventListener("scroll", medir, {passive: true});
  function fechar() {
    if (direta) return;
    if (desde) { ativo += Date.now() - desde; desde = 0; }
    var s = Math.min(86400, Math.round(ativo / 1000)), c = s + "|" + rol; if (c === enviado) return; enviado = c;
    enviar(base + "/seg", s, "PUT"); enviar(base + "/rol", rol, "PUT");
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") fechar(); else desde = Date.now(); });
  window.addEventListener("pagehide", fechar);
})();
<\/script>`;
  }

  const api = {codigoEntrada, codigoPaginas, caminhoDe};
  if (typeof module !== 'undefined') module.exports = api; else raiz.ArenaSnippets = api;
})(typeof window !== 'undefined' ? window : globalThis);
