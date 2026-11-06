/* Cálculo do painel. Sem dependência do Firebase, para poder ser testado no Node. */
const DIA = 864e5;

export function filtrar(lista, f) {
  return lista.filter(r =>
    (!f.desde || r.t >= f.desde) && (!f.ate || r.t < f.ate) &&
    (!f.origem || (r.src || '(sem origem)') === f.origem) &&
    (!f.campanha || (r.cmp || '(sem campanha)') === f.campanha) &&
    (!f.dispositivo || r.disp === f.dispositivo) &&
    (f.cfgv == null || f.cfgv === '' || r.cfgv === Number(f.cfgv)));
}

/* visitas: objeto {vid: registro}. Visitante único = atribuído pelo sorteio e com a página efetivamente carregada. */
export function comparar(exp, visitas, cadastros, erros, filtros, agora) {
  const janela = (exp.janelaDias || 7) * DIA;
  const todas = Object.entries(visitas || {}).map(([id, r]) => ({id, ...r}));
  const teste = todas.filter(r => r.x).length;
  const reais = todas.filter(r => !r.x);
  const lista = filtrar(reais, filtros);
  const ids = new Set(lista.map(r => r.id));

  const linhas = exp.variantes.map(v => {
    const dela = lista.filter(r => r.v === v.id);
    const vistos = dela.filter(r => r.ver);
    const conv = vistos.filter(r => r.ok && r.ok - r.t <= janela);
    const iniciou = vistos.filter(r => r.ini || r.env || r.ok);
    const cads = Object.values(cadastros || {}).filter(c => c.v === v.id && !c.d && !c.x && ids.has(c.vid));
    const errs = Object.values(erros || {}).filter(c => c.v === v.id && !c.d && !c.x);
    return {
      id: v.id, nome: v.nome, url: v.url, peso: v.peso,
      atribuidos: dela.length, unicos: vistos.length,
      cliques: vistos.filter(r => r.clk).length,
      inicios: iniciou.length,
      envios: vistos.filter(r => r.env || r.ok).length,
      convertidos: conv.length,
      cadastrosTotais: cads.length,
      obrigado: vistos.filter(r => r.obr).length,
      errosValidacao: errs.filter(e => e.tipo === 'validacao').length,
      errosIntegracao: errs.filter(e => e.tipo === 'integracao').length,
      emJanela: vistos.filter(r => !r.ok && agora - r.t < janela).length,
      tempoMedio: media(vistos.map(r => r.seg)),
      rolagemMedia: media(vistos.map(r => r.rol)),
    };
  });

  const totalUnicos = linhas.reduce((a, l) => a + l.unicos, 0);
  linhas.forEach(l => {
    l.observada = totalUnicos ? l.unicos / totalUnicos : null;
    l.taxa = l.unicos ? l.convertidos / l.unicos : null;
    l.conclusao = l.inicios ? l.convertidos / l.inicios : null;
  });
  const base = linhas[0];
  linhas.forEach((l, i) => {
    l.difPP = i && l.taxa != null && base.taxa != null ? (l.taxa - base.taxa) * 100 : null;
    l.melhoria = i && l.taxa != null && base.taxa ? (l.taxa / base.taxa - 1) * 100 : null;
  });

  const versoes = new Set(lista.map(r => r.cfgv));
  return {
    linhas, teste, totalUnicos,
    totalConv: linhas.reduce((a, l) => a + l.convertidos, 0),
    emJanela: linhas.reduce((a, l) => a + l.emJanela, 0),
    versoes: [...versoes].filter(v => v != null).sort((a, b) => a - b),
    semCarregar: linhas.reduce((a, l) => a + l.atribuidos - l.unicos, 0),
  };
}

function media(arr) {
  const v = arr.filter(x => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/* Probabilidade de cada página ser a melhor: Beta(1+c, 1+n-c) por simulação de Monte Carlo. */
export function probMelhor(lista, N = 12000, rnd = Math.random) {
  const normal = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const gama = k => {
    if (k < 1) return gama(k + 1) * Math.pow(rnd(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v; do { x = normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const u = rnd();
      if (u < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const vit = lista.map(() => 0);
  for (let i = 0; i < N; i++) {
    let melhor = -1, idx = 0;
    lista.forEach((l, j) => { const a = gama(1 + l.c), b = gama(1 + Math.max(0, l.n - l.c)), s = a / (a + b); if (s > melhor) { melhor = s; idx = j; } });
    vit[idx]++;
  }
  return vit.map(v => v / N);
}

/* Só declara vencedora com amostra mínima, 95% e sem mudança de distribuição no período analisado. */
export function veredito(R, peso, {MIN_VIS, MIN_CONV, CONF}, mudouDistribuicao) {
  const ativas = R.linhas.filter(l => l.unicos > 0);
  if (!R.totalUnicos) return {estado: 'vazio', probs: {}};
  const p = ativas.length >= 2 ? probMelhor(ativas.map(l => ({c: l.convertidos, n: l.unicos}))) : [1];
  const probs = {}; ativas.forEach((l, i) => probs[l.id] = p[i]);
  const lider = ativas.reduce((a, b) => probs[b.id] > probs[a.id] ? b : a);
  const menor = Math.min(...R.linhas.filter(l => peso[l.id] > 0 || l.unicos > 0).map(l => l.unicos));
  let estado;
  if (menor < MIN_VIS || R.totalConv < MIN_CONV) estado = 'coletando';
  else if (probs[lider.id] >= CONF) estado = mudouDistribuicao ? 'indicativa' : 'vencedora';
  else if (probs[lider.id] >= 0.8) estado = 'tendencia';
  else estado = 'empate';
  return {estado, probs, lider, menor};
}

export function pesosValidos(pesos) {
  const v = Object.values(pesos);
  if (v.some(x => !Number.isInteger(x) || x < 0 || x > 100)) return 'Use números inteiros de 0 a 100.';
  if (v.reduce((a, b) => a + b, 0) !== 100) return 'A soma precisa ser 100%.';
  return null;
}
