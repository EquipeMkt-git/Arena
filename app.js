import {FIREBASE, FUSO, MIN_VIS, MIN_CONV, CONF, JANELA_PADRAO} from './config.js';
import {comparar, veredito, pesosValidos} from './calculo.js';

const LETRAS = 'ABCDEFGH';
const CORES = {A: '#0072CE', B: '#F6BF00', C: '#0a7d57', D: '#7b4fb5', E: '#e0682d', F: '#18a0a6', G: '#c0397a', H: '#5b6b7c'};
const DEMO = new URLSearchParams(location.search).has('demo');
const {codigoEntrada, codigoPaginas} = window.ArenaSnippets;

const S = {
  usuario: null, admin: false, exps: {}, cfgs: {}, atual: null, aba: 'resultados', rascunho: null,
  visitas: {}, diretas: {}, cadastros: {}, erros: {}, historico: {}, admins: {}, dadosEm: 0,
  filtros: {periodo: 'tudo', origem: '', campanha: '', dispositivo: '', cfgv: ''},
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => (n ?? 0).toLocaleString('pt-BR');
const pct = (x, c = 1) => x == null ? '<span class="indisp">indisponível</span>' : (x * 100).toLocaleString('pt-BR', {minimumFractionDigits: c, maximumFractionDigits: c}) + '%';
const quando = t => new Date(t).toLocaleString('pt-BR', {timeZone: FUSO, dateStyle: 'short', timeStyle: 'medium'}) + ' (Brasília)';
const sinal = (x, suf) => x == null ? '<span class="indisp">indisponível</span>' : `<span class="${x >= 0 ? 'sobe' : 'desce'}">${x >= 0 ? '+' : '−'}${Math.abs(x).toLocaleString('pt-BR', {maximumFractionDigits: 2})}${suf}</span>`;
const tempo = s => s == null ? '–' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
const probTxt = p => p > .99 ? '>99%' : p < .01 ? '<1%' : Math.round(p * 100) + '%';
const atual = () => S.exps[S.atual] || null;
const chave = e => e.replace(/\./g, ',');

let toastT;
function toast(msg, tipo) {
  const el = $('#toast'); el.textContent = msg; el.className = 'toast' + (tipo ? ' ' + tipo : ''); el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 6000);
}

/* ---------- Dados ---------- */
let db;
const fb = {};
const ouvintes = [];

async function iniciarFirebase() {
  const V = '10.14.1', G = `https://www.gstatic.com/firebasejs/${V}/`;
  const [{initializeApp}, A, D] = await Promise.all(['firebase-app', 'firebase-auth', 'firebase-database'].map(m => import(`${G}${m}.js`)));
  const app = initializeApp(FIREBASE);
  fb.auth = A.getAuth(app); fb.A = A;
  db = D.getDatabase(app); fb.D = D;
  A.onAuthStateChanged(fb.auth, aoLogar);
}

async function aoLogar(u) {
  ouvintes.splice(0).forEach(f => f());
  S.usuario = u; S.admin = false;
  if (!u) return telaLogin();
  try {
    const s = await fb.D.get(fb.D.ref(db, 'admins/' + chave(u.email)));
    S.admin = s.val() === true;
  } catch (e) { S.admin = false; }
  if (!S.admin) return telaLogin(`A conta ${u.email} não está autorizada. Peça a um administrador para incluí-la.`);
  ouvir('experimentos', v => {
    S.exps = v || {};
    if (!S.atual) S.atual = location.hash.slice(1) && S.exps[location.hash.slice(1)] ? location.hash.slice(1) : Object.keys(S.exps)[0] || null;
    if (S.atual) ligarExperimento(S.atual); else if (!S.rascunho) S.rascunho = novoRascunho();
    render();
  });
  ouvir('admins', v => { S.admins = v || {}; if (S.aba === 'acesso') render(); });
}

function ouvir(caminho, cb) {
  ouvintes.push(fb.D.onValue(fb.D.ref(db, caminho), s => cb(s.val()), e => toast('Sem permissão de leitura: ' + caminho, 'erro')));
}
let expLigado = null, ouvintesExp = [];
function ligarExperimento(id) {
  if (expLigado === id) return;
  ouvintesExp.splice(0).forEach(f => f());
  expLigado = id; S.dadosEm = 0;
  if (DEMO) return;
  for (const [campo, base] of [['visitas', 'visitas'], ['diretas', 'diretas'], ['cadastros', 'cadastros'], ['erros', 'erros'], ['historico', 'historico']]) {
    ouvintesExp.push(fb.D.onValue(fb.D.ref(db, `${base}/${id}`), s => { S[campo] = s.val() || {}; S.dadosEm = Date.now(); agendar(); }));
  }
  ouvintesExp.push(fb.D.onValue(fb.D.ref(db, `config/${id}`), s => { S.cfgs[id] = s.val(); agendar(); }));
}
let agendado;
function agendar() { clearTimeout(agendado); agendado = setTimeout(() => { if (S.aba === 'resultados' || S.aba === 'historico' || S.aba === 'distribuicao') render(); }, 400); }

async function gravar(mudancas) {
  if (DEMO) {
    Object.entries(mudancas).forEach(([c, v]) => {
      const p = c.split('/'); let o = {config: S.cfgs, experimentos: S.exps, historico: {[S.atual]: S.historico}}[p[0]];
      if (!o) return; for (let i = 1; i < p.length - 1; i++) o = o[p[i]] = o[p[i]] || {};
      if (v === null) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = v;
    });
    return;
  }
  await fb.D.update(fb.D.ref(db), mudancas);
}
const idHist = () => DEMO ? 'h' + Date.now() : fb.D.push(fb.D.ref(db, 'historico/x')).key;
const emailAdm = () => DEMO ? 'demo@4blue.com.br' : S.usuario.email;

/* ---------- Tela ---------- */
function telaLogin(erro) {
  $('#raiz').innerHTML = `<div class="centro"><div class="cartao-login"><h1>Arena</h1>
    <p>Testes de página da 4blue. Entre com a sua conta Google autorizada.</p>
    ${erro ? `<p class="aviso">${esc(erro)}</p>` : ''}
    <button class="btn principal" data-acao="${S.usuario ? 'sair' : 'entrar'}">${S.usuario ? 'Trocar de conta' : 'Entrar com Google'}</button></div></div>`;
}

function render() {
  $('#raiz').innerHTML = `<div class="app"><aside class="lateral">${lateral()}</aside><main id="principal">${principal()}</main></div>`;
}

function lateral() {
  const lista = Object.values(S.exps).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  return `<p class="marca">Arena<small>Testes de página</small></p>
    <button class="btn" data-acao="novo">Novo teste</button>
    <nav aria-label="Testes"><ul class="lista">${lista.map(e => `<li><button data-exp="${esc(e.id)}" aria-current="${e.id === S.atual && S.aba !== 'novo'}">${esc(e.nome)}
      <small>${e.variantes.length} páginas · ${esc(S.cfgs[e.id]?.status || e.status || '')}</small></button></li>`).join('')}</ul></nav>
    <div class="rodape"><span>${esc(emailAdm())}</span><button data-aba="acesso">Administradores</button>${DEMO ? '<span>Modo demonstração: dados fictícios</span>' : '<button data-acao="sair">Sair</button>'}</div>`;
}

function principal() {
  if (S.aba === 'novo') return `<div class="topo"><div><h1>Novo teste</h1><div class="meta">De 2 a 8 páginas, todas no mesmo domínio</div></div></div>${telaEditor()}`;
  if (S.aba === 'acesso') return `<div class="topo"><div><h1>Administradores</h1></div></div>${telaAcesso()}`;
  const e = atual();
  if (!e) return `<div class="vazio"><h2>Nenhum teste ainda</h2><p>Cadastre as páginas que vão disputar o tráfego.</p>
    <div class="acoes"><button class="btn principal" data-acao="novo">Criar o primeiro teste</button></div></div>`;
  const c = S.cfgs[e.id] || {};
  const abas = [['resultados', 'Resultados'], ['distribuicao', 'Distribuição'], ['historico', 'Histórico'], ['instalacao', 'Instalação'], ['encerrar', 'Pausar e encerrar']];
  const telas = {resultados: telaResultados, distribuicao: telaDistribuicao, historico: telaHistorico, instalacao: telaInstalacao, encerrar: telaEncerrar};
  return `<div class="topo"><div><h1>${esc(e.nome)}<span class="selo ${esc(c.status)}">${esc(c.status || '')}</span></h1>
      <div class="meta">Métrica principal: taxa de captura · janela de atribuição de ${e.janelaDias} dias</div></div></div>
    <div class="abas" role="tablist">${abas.map(([k, r]) => `<button role="tab" aria-selected="${S.aba === k}" data-aba="${k}">${r}</button>`).join('')}</div>
    ${(telas[S.aba] || telaResultados)()}`;
}

/* ---------- Resultados ---------- */
function intervalo() {
  const p = S.filtros.periodo, h = Date.now();
  return {desde: p === 'tudo' ? 0 : h - Number(p) * 864e5, ate: 0};
}

function vigencias() {
  const h = Object.values(S.historico).filter(x => x.para?.pesos).sort((a, b) => a.quando - b.quando);
  return h.map(x => ({cfgv: x.cfgv, desde: x.quando, pesos: x.para.pesos}));
}

function telaResultados() {
  const e = atual(), c = S.cfgs[e.id] || {}, f = S.filtros;
  if (!S.dadosEm && !DEMO) return `<p class="carregando">Carregando dados…</p>`;
  const reg = Object.values(S.visitas).filter(r => !r.x);
  const op = (campo, vazio) => [...new Set(reg.map(r => r[campo] || vazio))].sort();
  const flt = {...intervalo(), origem: f.origem, campanha: f.campanha, dispositivo: f.dispositivo, cfgv: f.cfgv};
  const R = comparar({...e, variantes: e.variantes.map(v => ({...v, peso: c.pesos?.[v.id] ?? 0}))}, S.visitas, S.cadastros, S.erros, flt, Date.now());
  const vig = vigencias();
  const pesosDe = v => JSON.stringify(vig.find(x => x.cfgv === v)?.pesos ?? null);
  const mudou = new Set(R.versoes.map(pesosDe)).size > 1;
  const V = veredito(R, c.pesos || {}, {MIN_VIS, MIN_CONV, CONF}, mudou);

  const sel = (id, rot, val, ops) => `<label>${rot}<select class="campo" data-filtro="${id}">${ops.map(([k, t]) => `<option value="${esc(k)}" ${String(val) === String(k) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const filtros = `<div class="filtros">
    ${sel('periodo', 'Período de entrada', f.periodo, [['tudo', 'Todo o teste'], ['1', 'Últimas 24 horas'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias']])}
    ${sel('cfgv', 'Vigência da distribuição', f.cfgv, [['', 'Todas'], ...vig.map(x => [x.cfgv, `v${x.cfgv}: ${Object.entries(x.pesos).map(([k, p]) => k + ' ' + p + '%').join(' · ')}`])])}
    ${sel('origem', 'Origem', f.origem, [['', 'Todas'], ...op('src', '(sem origem)').map(o => [o, o])])}
    ${sel('campanha', 'Campanha', f.campanha, [['', 'Todas'], ...op('cmp', '(sem campanha)').map(o => [o, o])])}
    ${sel('dispositivo', 'Dispositivo', f.dispositivo, [['', 'Todos'], ...op('disp', '').filter(Boolean).map(o => [o, o])])}
  </div>`;

  const avisos = [];
  if (mudou) avisos.push('O período selecionado abrange mudanças na distribuição. Para uma comparação limpa, filtre por uma vigência. Nesse recorte o painel não declara vencedora.');
  if (R.emJanela) avisos.push(`Visitantes ainda dentro da janela de ${e.janelaDias} dias: ${num(R.emJanela)}. Eles podem converter, e as taxas tendem a subir.`);
  if (R.semCarregar) avisos.push(`Sorteados sem carregamento confirmado da página: ${num(R.semCarregar)}. Ficam fora dos cálculos.`);
  const diretas = Object.values(S.diretas).filter(d => !d.x);
  if (diretas.length) avisos.push(`Visitas diretas nas páginas, sem passar pelo sorteio: ${num(diretas.length)}, com ${num(diretas.filter(d => d.ok).length)} cadastro(s). Ficam fora da comparação.`);

  return `${filtros}${avisos.map(a => `<p class="aviso">${esc(a)}</p>`).join('')}${placar(V, R, e)}${tabela(R)}${funil(R)}${aoVivo(e)}
    <p class="nota">Dados de ${S.dadosEm ? quando(S.dadosEm) : quando(Date.now())}. Atualiza sozinho.${R.teste ? ` ${num(R.teste)} registros de teste excluídos.` : ''}</p>`;
}

function placar(V, R, e) {
  const nome = l => `${l.id} · ${l.nome}`;
  const L = V.lider; let frase, sub;
  if (V.estado === 'vazio') { frase = 'Nenhum visitante ainda.'; sub = 'Quando o anúncio rodar pelo link único, o placar aparece aqui.'; }
  else if (V.estado === 'coletando') { frase = `${nome(L)} está na frente, mas ainda é cedo.`; sub = `Falta amostra. O resultado só vale com ${MIN_VIS} visitantes em cada página e ${MIN_CONV} cadastros no teste. Menor página: ${num(V.menor)}. Cadastros: ${num(R.totalConv)}.`; }
  else if (V.estado === 'vencedora') { frase = `${nome(L)} venceu, com ${probTxt(V.probs[L.id])} de chance de ser a melhor.`; sub = 'Critério atingido. Para mandar todo mundo para ela, use a aba Pausar e encerrar.'; }
  else if (V.estado === 'indicativa') { frase = `${nome(L)} lidera com ${probTxt(V.probs[L.id])}, mas o recorte mistura distribuições.`; sub = 'Filtre por uma vigência antes de decidir.'; }
  else if (V.estado === 'tendencia') { frase = `${nome(L)} tende a vencer: ${probTxt(V.probs[L.id])} de chance de ser a melhor.`; sub = `O critério é ${pct(CONF, 0)}. Deixe rodar mais.`; }
  else { frase = 'Nenhuma página se destacou até agora.'; sub = 'As taxas estão próximas. Deixe rodar mais ou teste páginas mais diferentes entre si.'; }
  const barra = V.estado === 'vazio' ? '' : `<div class="prob" role="img" aria-label="Chance de cada página ser a melhor">${R.linhas.map(l => `<i style="--c:${CORES[l.id]};width:${(V.probs[l.id] || 0) * 100}%"></i>`).join('')}</div>
    <div class="legenda">${R.linhas.map(l => `<span><i class="chip" style="--c:${CORES[l.id]}">${l.id}</i>${esc(l.nome)} <b>${probTxt(V.probs[l.id] ?? 0)}</b></span>`).join('')}</div>`;
  return `<section class="placar ${V.estado === 'vencedora' ? 'ganhou' : ''}"><p class="veredito">${frase}</p><p class="veredito-sub">${esc(sub)}</p>${barra}</section>`;
}

function tabela(R) {
  const L = R.linhas, c = (rot, fn, cls = '') => `<tr class="${cls}"><td>${rot}</td>${L.map(l => `<td>${fn(l)}</td>`).join('')}</tr>`;
  return `<section class="bloco"><h2>Comparação</h2><p class="nota">A página A é a referência. Compare taxas: o número absoluto de cadastros não define a melhor página.</p>
    <div class="rolagem"><table><thead><tr><th>Indicador</th>${L.map(l => `<th><i class="chip" style="--c:${CORES[l.id]}">${l.id}</i>${esc(l.nome)}</th>`).join('')}</tr></thead><tbody>
    ${c('Taxa de captura (métrica principal)', l => pct(l.taxa, 2), 'principal')}
    ${c('Visitantes únicos', l => num(l.unicos))}
    ${c('Distribuição configurada', l => l.peso + '%')}
    ${c('Distribuição observada', l => pct(l.observada))}
    ${c('Inícios do formulário', l => num(l.inicios))}
    ${c('Visitantes convertidos', l => num(l.convertidos))}
    ${c('Cadastros totais', l => num(l.cadastrosTotais))}
    ${c('Taxa de conclusão do formulário', l => pct(l.conclusao))}
    ${c('Diferença em pontos percentuais', l => l.id === L[0].id ? 'referência' : sinal(l.difPP, ' p.p.'))}
    ${c('Melhoria relativa', l => l.id === L[0].id ? 'referência' : sinal(l.melhoria, '%'))}
    ${c('Leads qualificados', () => '<span class="indisp">indisponível</span>')}
    ${c('Taxa de qualificação', () => '<span class="indisp">indisponível</span>')}
    ${c('Conversão em lead qualificado', () => '<span class="indisp">indisponível</span>')}
    ${c('Erros de validação', l => num(l.errosValidacao))}
    ${c('Erros de integração', l => num(l.errosIntegracao))}
    ${c('Tempo ativo médio', l => tempo(l.tempoMedio))}
    ${c('Rolagem média', l => l.rolagemMedia == null ? '–' : Math.round(l.rolagemMedia) + '%')}
    </tbody></table></div>
    <p class="nota" style="margin-top:8px">Qualificação indisponível: ainda não há integração do CRM com o Arena. O painel não estima esse número.</p></section>`;
}

function funil(R) {
  const et = [['Visualizaram', 'unicos'], ['Clicaram no botão', 'cliques'], ['Iniciaram o formulário', 'inicios'], ['Tentaram enviar', 'envios'], ['Cadastro confirmado', 'convertidos'], ['Chegaram ao obrigado (aproximação)', 'obrigado']];
  const max = Math.max(1, ...R.linhas.map(l => l.unicos));
  return `<section class="bloco"><h2>Funil</h2><p class="nota">Cadastro confirmado só conta com a resposta de sucesso do servidor. Chegar ao obrigado é só uma conferência.</p>
    <div class="funil" style="margin-top:12px">${et.map(([r, k]) => `<div class="funil-linha"><span>${r}</span><div class="barras">${R.linhas.map(l => `<div class="barra"><i style="--c:${CORES[l.id]};width:${l[k] / max * 80}%"></i>${l.id}: ${num(l[k])}</div>`).join('')}</div></div>`).join('')}</div></section>`;
}

function aoVivo(e) {
  return `<section class="bloco"><h2>Como ler</h2><p class="nota">Taxa de captura = visitantes convertidos ÷ visitantes únicos. Visitante único = sorteado no link único e com a página carregada. Cada pessoa conta uma vez por teste, com cadastros feitos em até ${e.janelaDias} dias da entrada. Os percentuais são probabilidades: a divisão observada varia, principalmente com poucos visitantes.</p></section>`;
}

/* ---------- Distribuição ---------- */
function telaDistribuicao() {
  const e = atual(), c = S.cfgs[e.id] || {pesos: {}};
  const r = S.rascunhoPesos && S.rascunhoPesos.exp === e.id ? S.rascunhoPesos.pesos : {...c.pesos};
  S.rascunhoPesos = {exp: e.id, pesos: r};
  const soma = e.variantes.reduce((a, v) => a + (Number(r[v.id]) || 0), 0);
  return `<section class="bloco"><h2>Em vigor agora</h2>
      <p class="nota" style="margin-bottom:8px">Versão ${c.cfgv || '–'}${c.atualizadoEm ? ', desde ' + quando(c.atualizadoEm) : ''}</p>
      <div class="legenda">${e.variantes.map(v => `<span><i class="chip" style="--c:${CORES[v.id]}">${v.id}</i>${esc(v.nome)} <b>${c.pesos?.[v.id] ?? 0}%</b></span>`).join('')}</div></section>
    <section class="bloco"><h2>Alterar distribuição</h2>
      <p class="aviso" style="margin-top:10px">A mudança vale em segundos e só para novos visitantes. Quem já foi sorteado continua na mesma página, mesmo que ela passe a receber 0%. Para levar todo mundo a uma página, use Pausar e encerrar.</p>
      ${e.variantes.map(v => `<div class="dist-linha"><div><i class="chip" style="--c:${CORES[v.id]}">${v.id}</i><b>${esc(v.nome)}</b><div class="url">${esc(v.url)}</div></div>
        <input class="campo" type="number" min="0" max="100" step="1" aria-label="Percentual da página ${v.id}" data-peso="${v.id}" value="${esc(r[v.id] ?? 0)}"><output>${esc(r[v.id] ?? 0)}%</output></div>`).join('')}
      <p class="soma ${soma === 100 ? 'certo' : 'erro'}" id="soma">Soma: ${soma}%${soma === 100 ? '' : '. Precisa ser 100%.'}</p>
      <div class="acoes"><button class="btn principal" data-acao="salvarPesos">Salvar distribuição</button>
      <button class="btn" data-acao="igualar">Dividir igualmente</button></div>
      <p class="nota" style="margin-top:10px">Se o banco não responder em 1,2 s, a página usa a última configuração válida. Na falta dela, usa a que estava no código colado.</p></section>`;
}

function atualizaSoma() {
  const e = atual(), r = S.rascunhoPesos.pesos, soma = e.variantes.reduce((a, v) => a + (Number(r[v.id]) || 0), 0);
  const el = $('#soma'); el.className = 'soma ' + (soma === 100 ? 'certo' : 'erro'); el.textContent = `Soma: ${soma}%${soma === 100 ? '' : '. Precisa ser 100%.'}`;
}

async function salvarPesos() {
  const e = atual(), c = S.cfgs[e.id], pesos = {};
  e.variantes.forEach(v => pesos[v.id] = Number(S.rascunhoPesos.pesos[v.id]));
  const erro = pesosValidos(pesos);
  if (erro) return toast(erro, 'erro');
  if (e.variantes.every(v => pesos[v.id] === c.pesos[v.id])) return toast('Nada mudou.');
  const cfgv = c.cfgv + 1, agora = Date.now(), m = {};
  m[`config/${e.id}/pesos`] = pesos; m[`config/${e.id}/cfgv`] = cfgv; m[`config/${e.id}/atualizadoEm`] = agora;
  m[`historico/${e.id}/${idHist()}`] = {quando: agora, por: emailAdm(), tipo: 'distribuicao', cfgv, de: {pesos: c.pesos}, para: {pesos}};
  try { await gravar(m); S.rascunhoPesos = null; toast('Distribuição salva. Já vale para novos visitantes.'); render(); }
  catch (err) { toast('Não salvou: ' + err.message, 'erro'); }
}

/* ---------- Histórico ---------- */
function telaHistorico() {
  const h = Object.values(S.historico).sort((a, b) => b.quando - a.quando);
  const fmt = p => Object.entries(p || {}).map(([k, v]) => `${k} ${v}%`).join(' · ');
  const rot = {criacao: 'Teste criado', distribuicao: 'Distribuição alterada', pausa: 'Teste pausado', retomada: 'Teste retomado', encerramento: 'Teste encerrado', limpeza: 'Registros de teste apagados'};
  return `<section class="bloco"><h2>Histórico de alterações</h2>${h.length ? `<ul class="hist">${h.map(x => `<li><b>${rot[x.tipo] || esc(x.tipo)}</b> · ${quando(x.quando)} · ${esc(x.por)}
    ${x.de?.pesos ? `<div class="nota">De ${esc(fmt(x.de.pesos))} para ${esc(fmt(x.para?.pesos))}</div>` : ''}${x.detalhe ? `<div class="nota">${esc(x.detalhe)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="nota">Sem alterações.</p>'}</section>`;
}

/* ---------- Instalação ---------- */
function bloco(id, txt) { return `<div class="codigo"><pre id="${id}"><code>${esc(txt)}</code></pre><button class="btn" data-copiar="${id}">Copiar</button></div>`; }

function telaInstalacao() {
  const e = atual(), c = S.cfgs[e.id] || {};
  const x = {...e, variantes: e.variantes.map(v => ({...v, peso: c.pesos?.[v.id] ?? 0}))};
  const utm = '?utm_source=facebook&utm_medium=pago&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}';
  return `<ol class="passos">
    <li><h3>Página de entrada: o link único dos anúncios</h3>
      <p>Crie no Elementor uma página em branco, com modelo Elementor Canvas, em <b>${esc(new URL(e.variantes[0].url).host)}</b>. Arraste um widget HTML, cole o código e publique. Não coloque nada além dele nessa página.</p>
      ${bloco('c-ent', codigoEntrada(x, FIREBASE.databaseURL))}
      <p class="nota">Ao mudar percentuais no painel não precisa recolar. Só recole se trocar o link de alguma página.</p></li>
    <li><h3>Páginas do teste e obrigado</h3>
      <p>Cole este código em um widget HTML, no fim, em cada página: ${e.variantes.map(v => esc(v.id)).join(', ')}${e.obrigado ? ' e na página de obrigado' : ''}. É o mesmo código para todas.</p>
      ${bloco('c-pag', codigoPaginas(x, FIREBASE.databaseURL))}</li>
    <li><h3>Cache</h3><p>Depois de colar, limpe o cache do LiteSpeed das páginas alteradas. Confira que o Cloudflare e o LiteSpeed não atrasam o script: ele deve carregar sem que a pessoa precise tocar na tela.</p></li>
    <li><h3>Teste antes de rodar</h3>
      <p>Abra o link de entrada com <b>?arena=teste</b> no fim. Tudo o que esse navegador fizer fica marcado como teste e sai da comparação. Para voltar ao normal, use <b>?arena=normal</b>.</p></li>
    <li><h3>Parâmetros no Meta Ads</h3><p>Use o link da página de entrada, com estes parâmetros de URL:</p>${bloco('c-utm', utm)}</li>
  </ol>`;
}

/* ---------- Pausar e encerrar ---------- */
function telaEncerrar() {
  const e = atual(), c = S.cfgs[e.id] || {};
  const qtdTeste = Object.values(S.visitas).filter(r => r.x).length + Object.values(S.diretas).filter(r => r.x).length;
  return `<section class="bloco"><h2>Pausar</h2>
      <p class="nota">Pausado, ninguém novo entra no teste: novos visitantes vão para a página A e não são contados. Quem já foi sorteado continua na sua página.</p>
      <div class="acoes"><button class="btn" data-acao="${c.status === 'pausado' ? 'retomar' : 'pausar'}" ${c.status === 'encerrado' ? 'disabled' : ''}>${c.status === 'pausado' ? 'Retomar teste' : 'Pausar teste'}</button></div></section>
    <section class="bloco"><h2>Encerrar</h2>
      <p class="nota">Colocar 100%/0% muda só os novos visitantes. Encerrar é diferente: leva <b>todos</b> para a página escolhida, inclusive quem já tinha sido sorteado, e preserva o histórico.</p>
      <div class="grade2" style="margin-top:12px"><div><label class="rotulo" for="venc">Página que fica</label>
        <select id="venc" class="campo">${e.variantes.map(v => `<option value="${v.id}" ${c.vencedora === v.id ? 'selected' : ''}>${v.id} · ${esc(v.nome)}</option>`).join('')}</select></div></div>
      <div class="acoes"><button class="btn perigo" data-acao="encerrar">${c.status === 'encerrado' ? 'Trocar página final' : 'Encerrar teste'}</button></div></section>
    <section class="bloco"><h2>Iniciar outro teste</h2>
      <p class="nota">Crie um teste novo, com outro identificador. Os resultados não se misturam, porque cada teste guarda seus dados separadamente.</p></section>
    <section class="bloco"><h2>Registros de teste</h2>
      <p class="nota">${num(qtdTeste)} registros marcados como teste. Eles nunca entram na comparação. Apague antes de iniciar a coleta real.</p>
      <div class="acoes"><button class="btn" data-acao="limparTeste" ${qtdTeste ? '' : 'disabled'}>Apagar registros de teste</button></div></section>`;
}

async function mudarStatus(status, tipo, extra = {}, detalhe) {
  const e = atual(), m = {};
  m[`config/${e.id}/status`] = status; m[`config/${e.id}/atualizadoEm`] = Date.now();
  Object.entries(extra).forEach(([k, v]) => m[`config/${e.id}/${k}`] = v);
  m[`historico/${e.id}/${idHist()}`] = {quando: Date.now(), por: emailAdm(), tipo, ...(detalhe ? {detalhe} : {})};
  try { await gravar(m); toast('Feito.'); render(); } catch (err) { toast('Não salvou: ' + err.message, 'erro'); }
}

async function limparTeste() {
  const e = atual(), m = {}; let n = 0;
  for (const base of ['visitas', 'diretas', 'cadastros', 'erros'])
    Object.entries(S[base]).forEach(([k, v]) => { if (v.x) { m[`${base}/${e.id}/${k}`] = null; n++; } });
  m[`historico/${e.id}/${idHist()}`] = {quando: Date.now(), por: emailAdm(), tipo: 'limpeza', detalhe: `${n} registros apagados`};
  try { await gravar(m); toast(`${n} registros apagados.`); render(); } catch (err) { toast('Não apagou: ' + err.message, 'erro'); }
}

/* ---------- Novo teste ---------- */
function novoRascunho() {
  return {nome: '', janelaDias: JANELA_PADRAO, obrigado: '', variantes: [{id: 'A', nome: 'Página A', url: '', tag: ''}, {id: 'B', nome: 'Página B', url: '', tag: ''}]};
}

function telaEditor() {
  const r = S.rascunho;
  return `<section class="bloco"><div class="grade2">
      <div><label class="rotulo" for="f-nome">Nome do teste</label><input id="f-nome" class="campo" data-campo="nome" value="${esc(r.nome)}" placeholder="Ex.: Black 2026 captação LPD x LPE"></div>
      <div><label class="rotulo" for="f-jan">Janela de atribuição (dias)</label><input id="f-jan" class="campo" type="number" min="1" max="30" data-campo="janelaDias" value="${esc(r.janelaDias)}"></div>
      <div><label class="rotulo" for="f-obr">Página de obrigado</label><input id="f-obr" class="campo" data-campo="obrigado" value="${esc(r.obrigado)}" placeholder="https://…" inputmode="url"></div></div>
    <label class="rotulo">Páginas</label>
    ${r.variantes.map((v, i) => `<div class="form-var"><i class="chip" style="--c:${CORES[v.id]}">${v.id}</i>
      <input class="campo" aria-label="Nome da página ${v.id}" data-var="${i}" data-campo="nome" value="${esc(v.nome)}">
      <input class="campo url" aria-label="Link da página ${v.id}" data-var="${i}" data-campo="url" value="${esc(v.url)}" placeholder="https://cont.4blue.com.br/…" inputmode="url">
      <input class="campo url" aria-label="Tag do Active da página ${v.id}" data-var="${i}" data-campo="tag" value="${esc(v.tag)}" placeholder="Tag no Active (opcional)">
      <span class="nota">50%</span>
      <button class="btn" data-remover="${i}" aria-label="Remover página ${v.id}" ${r.variantes.length <= 2 ? 'disabled' : ''}>×</button></div>`).join('')}
    <p class="nota">Todo teste começa com divisão igual. Ajuste na aba Distribuição.</p>
    <div class="acoes"><button class="btn" data-acao="addVar" ${r.variantes.length >= 8 ? 'disabled' : ''}>Adicionar página</button>
      <button class="btn principal" data-acao="criar">Criar teste</button></div></section>`;
}

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);

async function criar() {
  const r = S.rascunho;
  if (!r.nome.trim()) return toast('Dê um nome ao teste.', 'erro');
  const ruim = r.variantes.find(v => !/^https:\/\/\S+$/i.test(v.url.trim()));
  if (ruim) return toast(`Coloque um link completo na página ${ruim.id}.`, 'erro');
  const hosts = new Set(r.variantes.map(v => new URL(v.url.trim()).host));
  if (r.obrigado.trim()) hosts.add(new URL(r.obrigado.trim()).host);
  if (hosts.size > 1) return toast('Todas as páginas precisam estar no mesmo domínio.', 'erro');
  const id = slug(r.nome) + '-' + Date.now().toString(36).slice(-4);
  const n = r.variantes.length, base = Math.floor(100 / n), pesos = {}, paginas = {};
  r.variantes.forEach((v, i) => { pesos[v.id] = base + (i < 100 - base * n ? 1 : 0); paginas[v.id] = v.url.trim(); });
  const agora = Date.now();
  const exp = {id, nome: r.nome.trim(), janelaDias: Number(r.janelaDias) || JANELA_PADRAO, obrigado: r.obrigado.trim(), criadoEm: agora, criadoPor: emailAdm(),
    variantes: r.variantes.map(v => ({id: v.id, nome: v.nome.trim(), url: v.url.trim(), tag: v.tag.trim()}))};
  const m = {[`experimentos/${id}`]: exp, [`config/${id}`]: {status: 'ativo', pesos, paginas, cfgv: 1, atualizadoEm: agora},
    [`historico/${id}/${idHist()}`]: {quando: agora, por: emailAdm(), tipo: 'criacao', cfgv: 1, para: {pesos}}};
  try {
    await gravar(m); S.atual = id; S.aba = 'instalacao'; S.rascunho = null; location.hash = id; ligarExperimento(id); toast('Teste criado.'); render();
  } catch (err) { toast('Não salvou: ' + err.message, 'erro'); }
}

/* ---------- Administradores ---------- */
function telaAcesso() {
  return `<section class="bloco"><h2>Quem acessa o painel</h2>
    <ul class="hist">${Object.keys(S.admins).map(k => `<li>${esc(k.replace(/,/g, '.'))}</li>`).join('')}</ul>
    <div class="grade2" style="margin-top:12px"><div><label class="rotulo" for="novo-adm">Novo administrador (@4blue.com.br)</label><input id="novo-adm" class="campo" type="email"></div></div>
    <div class="acoes"><button class="btn" data-acao="addAdm">Adicionar</button></div></section>`;
}

/* ---------- Eventos ---------- */
document.addEventListener('click', async ev => {
  const el = ev.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.exp) { S.atual = d.exp; S.aba = 'resultados'; location.hash = d.exp; ligarExperimento(d.exp); return render(); }
  if (d.aba) { S.aba = d.aba; S.rascunhoPesos = null; return render(); }
  if (d.remover) { S.rascunho.variantes.splice(Number(d.remover), 1); return render(); }
  if (d.copiar) {
    const t = document.getElementById(d.copiar).textContent;
    try { await navigator.clipboard.writeText(t); el.textContent = 'Copiado'; } catch { el.textContent = 'Selecione e use Ctrl+C'; }
    return setTimeout(() => el.textContent = 'Copiar', 2000);
  }
  const e = atual();
  switch (d.acao) {
    case 'entrar': try { await fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider()); } catch (err) { toast('Não entrou: ' + err.message, 'erro'); } return;
    case 'sair': return fb.A.signOut(fb.auth);
    case 'novo': S.aba = 'novo'; S.rascunho = novoRascunho(); return render();
    case 'addVar': { const u = new Set(S.rascunho.variantes.map(v => v.id)); const l = [...LETRAS].find(x => !u.has(x)); S.rascunho.variantes.push({id: l, nome: 'Página ' + l, url: '', tag: ''}); return render(); }
    case 'criar': return criar();
    case 'salvarPesos': return salvarPesos();
    case 'igualar': { const n = e.variantes.length, b = Math.floor(100 / n); e.variantes.forEach((v, i) => S.rascunhoPesos.pesos[v.id] = b + (i < 100 - b * n ? 1 : 0)); return render(); }
    case 'pausar': return mudarStatus('pausado', 'pausa');
    case 'retomar': return mudarStatus('ativo', 'retomada');
    case 'encerrar': {
      const v = $('#venc').value;
      if (!confirm(`Encerrar e levar todos os visitantes para a página ${v}?`)) return;
      return mudarStatus('encerrado', 'encerramento', {vencedora: v}, `Página final: ${v}`);
    }
    case 'limparTeste': return limparTeste();
    case 'addAdm': {
      const v = $('#novo-adm').value.trim().toLowerCase();
      if (!v.endsWith('@4blue.com.br')) return toast('Use um e-mail @4blue.com.br.', 'erro');
      try { await gravar({[`admins/${chave(v)}`]: true}); toast('Administrador incluído.'); } catch (err) { toast(err.message, 'erro'); }
    }
  }
});

document.addEventListener('input', ev => {
  const el = ev.target, d = el.dataset;
  if (d.peso) { S.rascunhoPesos.pesos[d.peso] = el.value === '' ? '' : Number(el.value); el.nextElementSibling.textContent = el.value + '%'; return atualizaSoma(); }
  if (d.campo && S.rascunho) { if (d.var != null) S.rascunho.variantes[Number(d.var)][d.campo] = el.value; else S.rascunho[d.campo] = el.value; }
});

document.addEventListener('change', ev => {
  const k = ev.target.dataset.filtro; if (k) { S.filtros[k] = ev.target.value; render(); }
});

/* ---------- Início ---------- */
if (DEMO) {
  const d = (await import('./demo.js')).dados();
  Object.assign(S, d, {usuario: {email: 'demo@4blue.com.br'}, admin: true, dadosEm: Date.now()});
  S.atual = Object.keys(S.exps)[0];
  render();
} else {
  iniciarFirebase().catch(e => { $('#raiz').innerHTML = `<div class="centro"><p class="aviso">Não foi possível carregar o Firebase: ${esc(e.message)}</p></div>`; });
}

/* Só para testes locais. */
if (location.hostname === 'localhost') window.__arena = {gravar, S};
