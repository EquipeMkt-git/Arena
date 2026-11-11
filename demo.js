/* Dados 100% fictícios, só para ver o painel com ?demo=1. */
export function dados() {
  const agora = Date.now(), dia = 864e5, id = 'demo-capt';
  const variantes = [
    {id: 'A', nome: 'LPD', url: 'https://exemplo.com.br/pagina-d/', tag: ''},
    {id: 'B', nome: 'LPE', url: 'https://exemplo.com.br/pagina-e/', tag: ''},
  ];
  let sem = 7;
  const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
  const visitas = {}, cadastros = {}, erros = {};
  for (let i = 0; i < 900; i++) {
    const cfgv = i < 400 ? 1 : 2, v = rnd() < (cfgv === 1 ? .5 : .7) ? 'A' : 'B';
    const t = agora - (cfgv === 1 ? 6 : 2) * dia - rnd() * dia, taxa = v === 'A' ? .11 : .16;
    const r = {v, t, cfgv, src: rnd() < .8 ? 'facebook' : 'instagram', cmp: rnd() < .5 ? 'CP01' : 'CP02', disp: rnd() < .85 ? 'celular' : 'computador'};
    if (rnd() < .96) {
      r.ver = t + 800; r.seg = 20 + rnd() * 200; r.rol = 30 + rnd() * 70;
      if (rnd() < .4) { r.clk = t + 9000; r.ini = t + 11000; }
      if (r.ini && rnd() < .6) r.env = t + 30000;
      if (r.env && rnd() < taxa * 5) { r.ok = t + 31000; cadastros['c' + i] = {v, t: r.ok, vid: 'v' + i, d: false}; r.obr = t + 33000; }
      else if (r.env) erros['e' + i] = {v, t: t + 31000, tipo: rnd() < .9 ? 'validacao' : 'integracao', d: false, campos: rnd() < .7 ? 'Seu Whatsapp com DDD aqui' : 'Seu melhor E-mail aqui'};
    }
    visitas['v' + i] = r;
  }
  return {
    exps: {[id]: {id, nome: 'Demonstração: captação', janelaDias: 7, obrigado: 'https://exemplo.com.br/obrigado/', criadoEm: agora - 7 * dia, variantes}},
    cfgs: {[id]: {status: 'ativo', pesos: {A: 70, B: 30}, paginas: {A: variantes[0].url, B: variantes[1].url}, cfgv: 2, atualizadoEm: agora - 2 * dia}},
    visitas, cadastros, erros, diretas: Object.fromEntries(Array.from({length: 120}, (_, i) => { const v = rnd() < .5 ? 'A' : 'B', t = agora - rnd() * 5 * dia, r = {v, t, ver: t + 500, src: rnd() < .7 ? 'facebook_ads' : undefined, cmp: rnd() < .5 ? 'CAMP_DIRETA_1' : 'CAMP_DIRETA_2', disp: 'celular'}; if (!r.src) { delete r.src; delete r.cmp; } if (rnd() < .1) { r.ini = t + 5000; r.ok = t + 40000; } return ['d' + i, r]; })),
    historico: {
      h1: {quando: agora - 7 * dia, por: 'demo@4blue.com.br', tipo: 'criacao', cfgv: 1, para: {pesos: {A: 50, B: 50}}},
      h2: {quando: agora - 2 * dia, por: 'demo@4blue.com.br', tipo: 'distribuicao', cfgv: 2, de: {pesos: {A: 50, B: 50}}, para: {pesos: {A: 70, B: 30}}},
    },
    admins: {'demo@4blue,com,br': true},
  };
}
