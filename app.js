import { firebaseConfig } from './config.js';
import { criarBackend } from './data.js';
import { AREAS, FONTES, PROCESSOS_PADRAO, VERSAO_CATALOGO, areaNome } from './processos.js';
import { lerPlanilha, identificar, lerFuncionarios, lerComplementar, juntarBase, lerLista, mesclar, fmtData } from './importar.js';
import { nomeMes, competenciaDe, gerarCodigo, impressao, tamanhoAmostra, sortear, populacao } from './sorteio.js';

// ======================= utilidades =======================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = document.getElementById('app');
const PERFIS = { admin: 'Administrador', auditor: 'Auditor', leitor: 'Visualizador' };
const STATUS_TXT = { C: 'Conforme', NC: 'Não conforme', NA: 'Não se aplica' };
const dataHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const pctTxt = v => v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`;
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function toast(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'on' + (erro ? ' erro' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 3200);
}
function modal(html, { onOk, okTxt = 'Confirmar', perigo = false, semCancelar = false } = {}) {
  return new Promise(res => {
    const f = document.createElement('div'); f.className = 'modal-fundo';
    f.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}
      <div class="erro oculto" id="m-erro"></div>
      <div class="acoes">${semCancelar ? '' : '<button class="btn sec" data-x>Cancelar</button>'}<button class="btn ${perigo ? 'perigo' : ''}" data-ok>${okTxt}</button></div></div>`;
    document.body.appendChild(f);
    const fechar = v => { f.remove(); res(v); };
    f.querySelector('[data-x]')?.addEventListener('click', () => fechar(null));
    f.querySelector('[data-ok]').addEventListener('click', async () => {
      try {
        const v = onOk ? await onOk(f) : true;
        if (v === false) return; fechar(v);
      } catch (e) { const er = f.querySelector('#m-erro'); er.textContent = e.message; er.classList.remove('oculto'); }
    });
    (f.querySelector('input,textarea,select') || f.querySelector('[data-ok]')).focus();
  });
}
const msgErro = e => ({
  'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/email-already-in-use': 'Já existe um usuário com este e-mail.', 'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/invalid-email': 'E-mail inválido.', 'permission-denied': 'Sem permissão para esta ação.',
}[e?.code] || e?.message || 'Erro inesperado.');

// ======================= estado =======================
let B, eu = null, catalogo = null;
const isAdmin = () => eu?.perfil === 'admin';
const minhasAreas = () => isAdmin() ? null : (eu?.areas || []);
const podeEditarArea = area => isAdmin() || (eu?.perfil === 'auditor' && (eu.areas || []).includes(area));

async function carregarCatalogo() {
  const c = await B.lerConfig();
  // Configuração salva com catálogo antigo é substituída pelo padrão atual
  catalogo = c && c.lista?.length && c.versao >= VERSAO_CATALOGO ? c.lista : structuredClone(PROCESSOS_PADRAO);
}

// Estatística de uma amostra
function estat(a) {
  const m = a.itens.length, p = a.pessoas.length, total = m * p;
  let C = 0, NC = 0, NA = 0;
  for (const pk in (a.respostas || {})) for (const i in a.respostas[pk]) {
    const s = a.respostas[pk][i]?.s; if (s === 'C') C++; else if (s === 'NC') NC++; else if (s === 'NA') NA++;
  }
  const resp = C + NC + NA;
  return { total, resp, pend: total - resp, C, NC, NA, conf: C + NC ? C / (C + NC) : null };
}
function somar(lista) {
  const r = { total: 0, resp: 0, pend: 0, C: 0, NC: 0, NA: 0 };
  for (const e of lista) for (const k in r) r[k] += e[k];
  r.conf = r.C + r.NC ? r.C / (r.C + r.NC) : null; return r;
}

// ======================= casca =======================
function casca(conteudo, ativo) {
  const links = [['#/painel', 'Painel', 'painel']];
  if (isAdmin()) links.push(['#/usuarios', 'Usuários', 'usuarios'], ['#/config', 'Configurações', 'config']);
  app.innerHTML = `
    ${B.modo === 'demo' ? '<div class="faixa-demo">Modo demonstração: os dados ficam só neste navegador. Configure o Firebase para uso real.</div>' : ''}
    <header class="topo"><div class="topo-in">
      <a href="#/painel"><img src="raguife-logo.png" alt="Raguife"></a>
      <span class="titulo-sis">Auditoria Interna</span>
      <nav class="menu">${links.map(([h, t, k]) => `<a href="${h}" class="${k === ativo ? 'ativo' : ''}">${t}</a>`).join('')}
        <span class="usuario">${esc(eu.nome)} · ${PERFIS[eu.perfil]}</span>
        <button class="btn sec peq" id="minhaSenha">Minha senha</button>
        <button class="btn sec peq" id="sair">Sair</button></nav>
    </div></header>
    <main>${conteudo}</main>`;
  $('#sair').onclick = () => B.logout();
  $('#minhaSenha').onclick = trocarMinhaSenha;
}

async function trocarMinhaSenha() {
  const ok = await modal(`<h2>Alterar minha senha</h2>
    <div class="campo"><label for="s-atual">Senha atual</label><input id="s-atual" type="password" autocomplete="current-password"></div>
    <div class="campo"><label for="s-nova">Nova senha (mínimo 6 caracteres)</label><input id="s-nova" type="password" autocomplete="new-password"></div>
    <div class="campo"><label for="s-conf">Repita a nova senha</label><input id="s-conf" type="password" autocomplete="new-password"></div>`, {
    okTxt: 'Alterar senha',
    onOk: async f => {
      const at = f.querySelector('#s-atual').value, nv = f.querySelector('#s-nova').value, cf = f.querySelector('#s-conf').value;
      if (nv.length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');
      if (nv !== cf) throw new Error('A confirmação não é igual à nova senha.');
      try { await B.trocarSenha(at, nv); } catch (e) { throw new Error(/wrong-password|invalid-credential/.test(e.code || '') ? 'Senha atual incorreta.' : msgErro(e)); }
      return true;
    },
  });
  if (ok) toast('Senha alterada.');
}

// ======================= login =======================
function telaLogin() {
  app.innerHTML = `<div class="login"><form class="caixa" id="f">
    <img src="raguife-logo.png" alt="Raguife">
    <h1>Auditoria Interna de Processos</h1>
    ${B.modo === 'demo' ? '<p class="avisos" style="margin-bottom:16px">Modo demonstração. Acesse com <b>admin@demo</b> / <b>demo123</b>.</p>' : ''}
    <div class="campo"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username" required></div>
    <div class="campo"><label for="se">Senha</label><input id="se" type="password" autocomplete="current-password" required></div>
    <button class="btn" style="width:100%;justify-content:center">Entrar</button>
    <div class="erro oculto" id="er"></div>
    <p style="text-align:center;margin:16px 0 0"><a href="#" id="esq" class="pequeno">Esqueci minha senha</a></p>
  </form></div>`;
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); const er = $('#er'); er.classList.add('oculto');
    try { await B.login($('#em').value, $('#se').value); }
    catch (e) { er.textContent = msgErro(e); er.classList.remove('oculto'); }
  };
  $('#esq').onclick = async ev => {
    ev.preventDefault();
    const email = $('#em').value.trim();
    if (!email) { toast('Digite seu e-mail no campo acima.', true); return; }
    try { await B.resetSenha(email); toast('Se o e-mail estiver cadastrado, você receberá o link de redefinição.'); }
    catch (e) { toast(msgErro(e), true); }
  };
}
function telaSemPerfil(u, inativo) {
  app.innerHTML = `<div class="login"><div class="caixa">
    <img src="raguife-logo.png" alt="Raguife">
    <h1>${inativo ? 'Acesso desativado' : 'Usuário sem perfil'}</h1>
    <p>${inativo ? 'Seu acesso foi desativado pelo administrador.' : 'Seu login existe, mas ainda não tem perfil de acesso. Peça ao administrador do sistema.'}</p>
    ${inativo ? '' : `<p class="pequeno suave">Primeiro acesso do sistema? Siga o passo “Criar o primeiro administrador” do guia de implantação usando este identificador:<br><span class="codigo" style="font-size:13px;word-break:break-all">${esc(u.uid)}</span></p>`}
    <button class="btn sec" id="sair">Sair</button></div></div>`;
  $('#sair').onclick = () => B.logout();
}

// ======================= painel =======================
async function telaPainel() {
  casca('<div class="carregando">Carregando…</div>', 'painel');
  const auds = (await B.listarAuditorias()).sort((a, b) => b.id.localeCompare(a.id));
  const abertas = auds.filter(a => a.status === 'aberta');
  // progresso dos meses abertos
  for (const a of abertas) {
    const ams = await B.listarAmostras(a.id, minhasAreas());
    a._e = somar(ams.map(estat));
  }
  const fechadas = auds.filter(a => a.status === 'fechada' && a.resumo).slice(0, 12).reverse();

  const cardAbrir = isAdmin() ? `<div class="cartao destaque">
      <h2>Abrir auditoria</h2>
      <p class="suave pequeno">A auditoria de um mês analisa a competência anterior (mês fechado).</p>
      <div class="linha"><div style="min-width:200px"><label for="mes">Mês da auditoria</label><input type="month" id="mes" value="${mesAtual()}"></div>
      <div><div class="legenda">Competência analisada</div><div id="comp" style="font-weight:600">${nomeMes(competenciaDe(mesAtual()))}</div></div>
      <button class="btn" id="abrir" style="margin-left:auto">Iniciar abertura</button></div></div>` : '';

  const linhas = auds.map(a => {
    const e = a.status === 'aberta' ? a._e : a.resumo?.geral;
    return `<tr><td><a href="#/mes/${a.id}"><b>${nomeMes(a.id)}</b></a></td><td>${nomeMes(a.competencia)}</td>
      <td><span class="chip ${a.status}">${a.status === 'aberta' ? 'Aberta' : 'Fechada'}</span></td>
      <td class="num">${e ? `${e.resp}/${e.total}` : '—'}</td><td class="num pct">${e ? pctTxt(e.conf) : '—'}</td>
      <td class="num"><a class="btn sec peq" href="#/mes/${a.id}">Abrir</a> <a class="btn sec peq" href="#/relatorio/${a.id}">Relatório</a></td></tr>`;
  }).join('');

  casca(`
    <div class="cab"><div><div class="legenda">Painel</div><h1>Auditoria interna de processos</h1></div></div>
    ${abertas.map(a => `<div class="cartao destaque"><div class="linha" style="justify-content:space-between">
      <div><div class="legenda">Em andamento</div><h2>${nomeMes(a.id)} · competência ${nomeMes(a.competencia)}</h2></div>
      <a class="btn" href="#/mes/${a.id}">Ir para a auditoria</a></div>
      <div class="kpis" style="margin-top:16px">
        <div class="kpi"><div class="legenda">Itens respondidos</div><div class="v">${a._e.resp}<span class="suave" style="font-size:16px"> / ${a._e.total}</span></div></div>
        <div class="kpi"><div class="legenda">Pendentes</div><div class="v">${a._e.pend}</div></div>
        <div class="kpi"><div class="legenda">Não conformes</div><div class="v">${a._e.NC}</div></div>
        <div class="kpi"><div class="legenda">Conformidade parcial</div><div class="v">${pctTxt(a._e.conf)}</div></div>
      </div><div class="barra"><i style="width:${a._e.total ? (a._e.resp / a._e.total * 100) : 0}%"></i></div></div>`).join('')}
    ${abertas.length ? '' : cardAbrir}
    ${fechadas.length > 1 ? `<div class="cartao"><h2>Evolução da conformidade</h2>${grafico(fechadas)}</div>` : ''}
    <div class="cartao"><h2 style="margin-bottom:12px">Histórico</h2>
      ${auds.length ? `<div class="tabela-wrap"><table><thead><tr><th>Auditoria</th><th>Competência</th><th>Status</th><th class="num">Respondidos</th><th class="num">Conformidade</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
        : '<p class="suave">Nenhuma auditoria registrada ainda.</p>'}
    </div>`, 'painel');

  if (isAdmin() && !abertas.length) {
    $('#mes').oninput = () => $('#comp').textContent = $('#mes').value ? nomeMes(competenciaDe($('#mes').value)) : '—';
    $('#abrir').onclick = () => {
      const m = $('#mes').value; if (!m) return;
      if (auds.some(a => a.id === m)) { toast('Esta auditoria já existe.', true); return; }
      location.hash = `#/abrir/${m}`;
    };
  }
}

function grafico(meses) {
  const W = 760, H = 220, pl = 44, pb = 34, pt = 16, n = meses.length, bw = Math.min(56, (W - pl - 10) / n * .6);
  const x = i => pl + (i + .5) * (W - pl - 10) / n, y = v => pt + (1 - v) * (H - pt - pb);
  const grade = [0, .25, .5, .75, 1].map(v => `<line x1="${pl}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#E4E4E4"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#666">${v * 100}%</text>`).join('');
  const barras = meses.map((m, i) => {
    const v = m.resumo.geral.conf ?? 0;
    return `<rect x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" fill="#024F2B"><title>${nomeMes(m.id)}: ${pctTxt(m.resumo.geral.conf)}</title></rect>
      <text x="${x(i)}" y="${y(v) - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="#024F2B">${pctTxt(m.resumo.geral.conf)}</text>
      <text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#666">${m.id.slice(5)}/${m.id.slice(2, 4)}</text>`;
  }).join('');
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Conformidade por mês">${grade}${barras}</svg>`;
}

// ======================= abertura do mês =======================
let rascunho = null; // { mes, base, avisos, codigo }
async function telaAbrir(mes) {
  if (!isAdmin()) { location.hash = '#/painel'; return; }
  if (await B.lerAuditoria(mes)) { location.hash = `#/mes/${mes}`; return; }
  if (!rascunho || rascunho.mes !== mes) rascunho = { mes, func: null, comp: null, base: null, avisos: [], codigo: gerarCodigo(), arquivos: [] };
  const comp = competenciaDe(mes);
  await carregarCatalogo();
  const r = rascunho;
  const doBase = catalogo.filter(p => FONTES[p.fonte]?.base);
  const pops = r.base ? Object.fromEntries(Object.keys(FONTES).filter(f => FONTES[f].base).map(f => [f, populacao(f, r.base, comp)])) : null;

  casca(`
    <div class="cab"><div><div class="legenda">Abertura</div><h1>Auditoria de ${nomeMes(mes)}</h1><div class="suave">Competência analisada: <b>${nomeMes(comp)}</b></div></div>
      <div class="acoes"><a class="btn sec" href="#/painel">Cancelar</a></div></div>
    <div class="cartao"><h2>1. Importar a base de funcionários</h2>
      <p class="suave pequeno">Arraste os dois relatórios do MIX: <b>funcionários</b> (Chapa, Nome, Cargo, Faixa, Salário, Depto, Admissão, Demissão, Status) e <b>complementar</b> (Chapa, Nome, CPF, Escala, CBO, Nascimento). O sistema identifica cada um pelo cabeçalho. CPF e salário são lidos só no navegador e descartados.</p>
      <label class="drop" id="drop"><input type="file" id="arq" accept=".xlsx,.xls,.csv" multiple>Clique ou arraste os arquivos aqui</label>
      <ul class="lista-arq">${r.arquivos.map(a => `<li><span>${esc(a.nome)}</span><span class="chip ${a.ok ? 'ok' : 'nc'}">${esc(a.tipo)}</span></li>`).join('')}</ul>
      ${r.avisos.length ? `<div class="avisos" style="margin-top:12px"><b>${r.avisos.length} aviso(s) na junção:</b><br>${r.avisos.map(esc).join('<br>')}</div>` : ''}
    </div>
    ${r.base ? `
    <div class="cartao"><h2>2. Populações da competência</h2>
      <div class="kpis" style="margin-top:12px">${['ativos', 'admitidos', 'demitidos', 'experiencia', 'menores'].map(f => `<div class="kpi"><div class="legenda">${esc(FONTES[f].nome)}</div><div class="v">${pops[f].length}</div></div>`).join('')}</div>
      ${!r.comp ? '<p class="avisos">Sem o relatório complementar, “menores” considera apenas cargos de aprendiz, e a escala não aparece no checklist.</p>' : ''}
    </div>
    <div class="cartao"><h2>3. Amostras que serão sorteadas agora</h2>
      <p class="suave pequeno">Processos com fonte “lista importada” são sorteados depois, dentro do mês, quando você importar a lista de cada um. Checklists únicos são criados agora.</p>
      <div class="tabela-wrap"><table><thead><tr><th>Área</th><th>Processo</th><th>Fonte</th><th class="num">População</th><th class="num">% / mín.</th><th class="num">Amostra</th></tr></thead><tbody>
      ${catalogo.map(p => {
        const base = FONTES[p.fonte]?.base; const N = base ? pops[p.fonte].length : null;
        return `<tr><td>${areaNome(p.area)}</td><td>${esc(p.nome)}</td><td class="pequeno">${esc(FONTES[p.fonte].nome)}</td>
          <td class="num">${base ? N : '—'}</td><td class="num">${p.fonte === 'unico' ? '—' : `${p.pct}% / ${p.min}`}</td>
          <td class="num"><b>${base ? tamanhoAmostra(N, p.pct, p.min) : p.fonte === 'unico' ? '1 checklist' : 'depois'}</b></td></tr>`;
      }).join('')}</tbody></table></div>
    </div>
    <div class="cartao destaque"><h2>4. Código de sorteio</h2>
      <p class="suave pequeno">O código garante que o sorteio é aleatório e verificável: com a mesma base e o mesmo código, o resultado é sempre o mesmo. Ele fica registrado no relatório.</p>
      <div class="linha"><span class="codigo" id="cod">${r.codigo}</span><button class="btn sec peq" id="novoCod">Gerar outro código</button>
      <button class="btn" id="confirmar" style="margin-left:auto">Abrir mês e sortear</button></div>
    </div>` : ''}
  `, 'painel');

  const drop = $('#drop');
  const tratar = async files => {
    for (const f of files) {
      try {
        const linhas = lerPlanilha(await f.arrayBuffer());
        const tipo = identificar(linhas);
        if (tipo === 'funcionarios') { r.func = lerFuncionarios(linhas); r.arquivos.push({ nome: f.name, tipo: `Funcionários · ${r.func.size}`, ok: true }); }
        else if (tipo === 'complementar') { r.comp = lerComplementar(linhas); r.arquivos.push({ nome: f.name, tipo: `Complementar · ${r.comp.size}`, ok: true }); }
        else r.arquivos.push({ nome: f.name, tipo: 'Não reconhecido', ok: false });
      } catch (e) { r.arquivos.push({ nome: f.name, tipo: 'Erro: ' + e.message, ok: false }); }
    }
    if (r.func) { const j = juntarBase(r.func, r.comp); r.base = j.base; r.avisos = j.avisos; }
    telaAbrir(mes);
  };
  $('#arq').onchange = e => tratar([...e.target.files]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('sobre'); };
  drop.ondragleave = () => drop.classList.remove('sobre');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('sobre'); tratar([...e.dataTransfer.files]); };
  if (!r.base) return;
  $('#novoCod').onclick = () => { r.codigo = gerarCodigo(); $('#cod').textContent = r.codigo; };
  $('#confirmar').onclick = async () => {
    const ok = await modal(`<h2>Abrir a auditoria de ${nomeMes(mes)}?</h2><p>O sorteio será feito com o código <b>${r.codigo}</b> e não poderá ser refeito para os processos sorteados agora.</p>`, { okTxt: 'Abrir e sortear' });
    if (!ok) return;
    $('#confirmar').disabled = true;
    try { await abrirMes(mes, comp, r, pops, doBase); rascunho = null; toast('Auditoria aberta e amostras sorteadas.'); location.hash = `#/mes/${mes}`; }
    catch (e) { toast(msgErro(e), true); $('#confirmar').disabled = false; }
  };
}

const pessoaMin = (f, i) => ({ k: 'p' + i, id: f.id, chapa: f.chapa, nome: f.nome, cargo: f.cargo || '', depto: f.depto || '',
  adm: f.adm ? fmtData(f.adm) : '', dem: f.dem ? fmtData(f.dem) : '', escala: f.escala || '', status: f.status || '' });

async function abrirMes(mes, comp, r, pops, doBase) {
  const ts = new Date().toISOString(), por = { uid: eu.uid, nome: eu.nome };
  const processos = catalogo.map(p => ({ ...p }));
  await B.salvarAuditoria(mes, { mes, competencia: comp, status: 'aberta', codigo: r.codigo, abertura: { ...por, em: ts }, processos,
    log: [{ ev: 'abertura', ...por, em: ts }] });
  // snapshot mínimo da base (sem CPF, salário, nascimento) para enriquecer as listas importadas
  // desligados nos 24 meses anteriores: só nome e datas, para identificar quem aparece nas listas após o desligamento
  const [ca, cm] = comp.split('-').map(Number), ini = new Date(ca, cm - 1, 1), corte = new Date(ca - 2, cm - 1, 1);
  const desligados = r.base.filter(f => f.dem && f.dem < ini && f.dem >= corte).map(f => ({ id: f.id, chapa: f.chapa, nome: f.nome, adm: fmtData(f.adm), dem: fmtData(f.dem) }));
  await B.salvarBase(mes, pops.ativos.map((f, i) => pessoaMin(f, i)), desligados);
  for (const p of processos) {
    if (p.fonte === 'unico') {
      await B.salvarAmostra(mes, p.id, { procId: p.id, area: p.area, nome: p.nome, fonte: p.fonte, itens: p.itens, N: 1, n: 1, impressao: '—',
        pessoas: [{ k: 'p0', chapa: '—', nome: `Checklist de ${nomeMes(comp)}` }], respostas: {}, sorteio: { ...por, em: ts } });
    } else if (FONTES[p.fonte]?.base) {
      const pop = pops[p.fonte], n = tamanhoAmostra(pop.length, p.pct, p.min);
      const am = sortear(pop, n, r.codigo, p.id);
      await B.salvarAmostra(mes, p.id, { procId: p.id, area: p.area, nome: p.nome, fonte: p.fonte, itens: p.itens, N: pop.length, n,
        impressao: await impressao(pop.map(x => x.id)), pessoas: am.map(pessoaMin), respostas: {}, sorteio: { ...por, em: ts } });
    }
  }
}

// ======================= mês =======================
async function telaMes(mes) {
  casca('<div class="carregando">Carregando…</div>', 'painel');
  const a = await B.lerAuditoria(mes);
  if (!a) { casca('<p>Auditoria não encontrada.</p>', 'painel'); return; }
  const ams = await B.listarAmostras(mes, minhasAreas());
  const porId = Object.fromEntries(ams.map(x => [x.procId, x]));
  const aberta = a.status === 'aberta';
  const areasVis = AREAS.filter(ar => isAdmin() || (eu.areas || []).includes(ar.id));
  const tot = somar(ams.map(estat));

  const cardProc = p => {
    const am = porId[p.id];
    if (!am) {
      if (p.fonte !== 'lista' && p.fonte !== 'admitidos_lista') return '';
      const compart = p.chaveLista ? a.processos.filter(q => q.chaveLista === p.chaveLista && q.id !== p.id).map(q => q.nome) : [];
      return `<div class="proc"><h3>${esc(p.nome)}</h3><div class="meta">${esc(p.lista || FONTES.lista.nome)}${compart.length ? ` · a mesma importação alimenta: ${compart.map(esc).join(', ')}` : ''}</div>
        <span class="chip pend" style="align-self:flex-start">Aguardando lista</span>
        <div class="rod">${isAdmin() && aberta ? `<button class="btn peq" data-imp="${p.id}">${p.pct >= 100 ? 'Importar lista' : 'Importar lista e sortear'}</button><button class="btn sec peq" data-sem="${p.id}">${p.fonte === 'admitidos_lista' ? 'Sem mudanças (só admitidos)' : 'Sem ocorrências'}</button>` : '<span class="suave pequeno">O administrador importa a lista</span>'}</div></div>`;
    }
    const e = estat(am);
    const semPop = am.n === 0;
    return `<div class="proc"><h3>${esc(p.nome)}</h3>
      <div class="meta">${esc(FONTES[am.fonte]?.nome || '')}${am.fonte === 'unico' ? '' : ` · população ${am.N} · amostra ${am.n}`}</div>
      ${semPop ? '<span class="chip ok" style="align-self:flex-start">Sem ocorrências no mês</span>' : `
      <div class="barra" title="${e.resp} de ${e.total} itens"><i style="width:${e.total ? e.resp / e.total * 100 : 0}%"></i></div>
      <div class="linha pequeno" style="gap:8px"><span>${e.resp}/${e.total} itens</span>${e.NC ? `<span class="chip nc">${e.NC} NC</span>` : ''}${e.pend ? '' : '<span class="chip ok">Concluído</span>'}</div>`}
      <div class="rod"><span>Conformidade <span class="pct">${pctTxt(e.conf)}</span></span>
        ${semPop ? (isAdmin() && aberta ? `<button class="btn sec peq" data-desf="${p.id}">Desfazer</button>` : '') : `<a class="btn peq" href="#/mes/${mes}/p/${p.id}">${aberta && podeEditarArea(p.area) ? 'Auditar' : 'Ver'}</a>`}
      </div></div>`;
  };

  casca(`
    <div class="cab"><div><div class="legenda">Auditoria · <span class="chip ${a.status}">${aberta ? 'Aberta' : 'Fechada'}</span></div>
      <h1>${nomeMes(mes)}</h1><div class="suave">Competência ${nomeMes(a.competencia)} · código de sorteio <b>${esc(a.codigo)}</b></div></div>
      <div class="acoes"><a class="btn sec" href="#/relatorio/${mes}">Relatório</a>
      ${isAdmin() ? (aberta ? '<button class="btn" id="fechar">Fechar mês</button>' : '<button class="btn sec" id="reabrir">Reabrir mês</button>') + '<button class="btn perigo" id="excluirMes">Excluir auditoria</button>' : ''}</div></div>
    <div class="kpis">
      <div class="kpi"><div class="legenda">Itens respondidos</div><div class="v">${tot.resp}<span class="suave" style="font-size:16px"> / ${tot.total}</span></div></div>
      <div class="kpi"><div class="legenda">Pendentes</div><div class="v">${tot.pend}</div></div>
      <div class="kpi"><div class="legenda">Não conformes</div><div class="v">${tot.NC}</div></div>
      <div class="kpi"><div class="legenda">Conformidade</div><div class="v">${pctTxt(tot.conf)}</div></div>
    </div>
    ${areasVis.map(ar => {
      const ps = a.processos.filter(p => p.area === ar.id);
      const e = somar(ps.map(p => porId[p.id]).filter(Boolean).map(estat));
      return `<div class="area-tit"><h2>${ar.nome}</h2><span class="suave pequeno">· conformidade ${pctTxt(e.conf)}</span></div>
        <div class="grade">${ps.map(cardProc).join('')}</div>`;
    }).join('')}
  `, 'painel');

  $$('[data-imp]').forEach(b => b.onclick = () => importarLista(a, a.processos.find(p => p.id === b.dataset.imp)));
  $$('[data-sem]').forEach(b => b.onclick = async () => {
    const p = a.processos.find(x => x.id === b.dataset.sem);
    if (p.fonte === 'admitidos_lista') {
      if (!await modal(`<h2>Sem mudanças no mês</h2><p>Criar <b>${esc(p.nome)}</b> só com os admitidos da competência ${nomeMes(a.competencia)}?</p>`)) return;
      await sortearLista(a, [p], { lista: [], nome: 'sem mudanças no mês' });
      return;
    }
    if (!await modal(`<h2>Sem ocorrências</h2><p>Registrar que <b>${esc(p.nome)}</b> não teve ocorrências na competência ${nomeMes(a.competencia)}?</p>`)) return;
    await B.salvarAmostra(mes, p.id, { procId: p.id, area: p.area, nome: p.nome, fonte: p.fonte, itens: p.itens, N: 0, n: 0, impressao: '—', pessoas: [], respostas: {}, sorteio: { uid: eu.uid, nome: eu.nome, em: new Date().toISOString() } });
    await B.registrarLog(mes, { ev: 'sem-ocorrencias', proc: p.id, uid: eu.uid, nome: eu.nome });
    telaMes(mes);
  });
  $$('[data-desf]').forEach(b => b.onclick = async () => {
    if (!await modal('<h2>Desfazer “sem ocorrências”?</h2><p>O processo volta a aguardar a lista.</p>')) return;
    await B.excluirAmostra(mes, b.dataset.desf); await B.registrarLog(mes, { ev: 'desfazer-sem-ocorrencias', proc: b.dataset.desf, uid: eu.uid, nome: eu.nome });
    telaMes(mes);
  });
  $('#fechar')?.addEventListener('click', () => fecharMes(a, ams));
  $('#reabrir')?.addEventListener('click', () => reabrirMes(a));
  $('#excluirMes')?.addEventListener('click', () => excluirMes(a));
}

async function excluirMes(a) {
  const palavra = 'EXCLUIR';
  const ok = await modal(`<h2>Excluir a auditoria de ${nomeMes(a.id)}?</h2>
    <p>Serão apagados <b>definitivamente</b> as amostras sorteadas, todas as respostas dos checklists e o histórico deste mês. Não é possível desfazer.</p>
    ${a.status === 'fechada' ? '<p class="avisos">Este mês já está fechado e pode ter relatório arquivado.</p>' : ''}
    <div class="campo"><label for="conf-ex">Para confirmar, digite ${palavra}</label><input id="conf-ex" type="text" autocomplete="off"></div>`, {
    okTxt: 'Excluir definitivamente', perigo: true,
    onOk: async f => {
      if (f.querySelector('#conf-ex').value.trim().toUpperCase() !== palavra) throw new Error(`Digite ${palavra} para confirmar.`);
      try { await B.excluirAuditoria(a.id); } catch (e) { throw new Error(msgErro(e)); }
      return true;
    },
  });
  if (ok) { toast(`Auditoria de ${nomeMes(a.id)} excluída.`); location.hash = '#/painel'; }
}

// Importação de lista: os arquivos são lidos assim que escolhidos, e o sorteio só acontece na confirmação.
// Vários arquivos podem ser escolhidos juntos (ex.: fatura do saúde + boletos do odonto); as pessoas são somadas.
let listaLida = null, procImport = null;
document.addEventListener('change', async ev => {
  if (ev.target.id !== 'larq') return;
  const fs = [...ev.target.files]; if (!fs.length) return;
  const res = $('#lres');
  try {
    const listas = [], linhas = [];
    for (const f of fs) { const l = lerLista(lerPlanilha(await f.arrayBuffer()), procImport); listas.push(l); linhas.push(`${esc(f.name)}: ${l.length}`); }
    listaLida = { lista: mesclar(listas), nome: fs.map(f => f.name).join(', ') };
    res.innerHTML = `${linhas.join('<br>')}<br><b>Total: ${listaLida.lista.length} pessoa(s)</b>`;
  } catch (e) { listaLida = null; res.innerHTML = `<span class="erro">${esc(e.message)}</span>`; }
});

async function importarLista(a, p) {
  listaLida = null; procImport = p.id;
  const ams = await B.listarAmostras(a.id, null);
  const grupo = [p, ...(p.chaveLista ? a.processos.filter(q => q.chaveLista === p.chaveLista && q.id !== p.id && !ams.some(x => x.procId === q.id)) : [])];
  const ok = await modal(`<h2>${esc(p.nome)}</h2>
    <p class="pequeno suave">${esc(p.lista || 'Relatório com coluna Chapa')}. Competência ${nomeMes(a.competencia)}.</p>
    ${grupo.length > 1 ? `<p class="pequeno">Esta importação também cria: <b>${grupo.slice(1).map(q => esc(q.nome)).join(', ')}</b>.</p>` : ''}
    <label class="drop"><input type="file" id="larq" accept=".xlsx,.xls,.csv" multiple>Clique para escolher o(s) arquivo(s)</label>
    <div id="lres" class="pequeno" style="margin-top:12px"></div>`, {
    okTxt: p.pct >= 100 ? 'Importar' : 'Sortear amostra',
    onOk: () => {
      if (!listaLida) throw new Error('Escolha um arquivo válido primeiro.');
      if (!listaLida.lista.length && p.fonte !== 'admitidos_lista') throw new Error('Nenhuma pessoa encontrada no arquivo. Use “Sem ocorrências” se for o caso.');
      return true;
    },
  });
  if (ok) await sortearLista(a, grupo, listaLida);
}

const INATIVO_RE = /afast|aposent|licen/i;
async function sortearLista(a, procs, u) {
  const bd = await B.lerBase(a.id) || {};
  const base = Array.isArray(bd) ? bd : (bd.pessoas || []), desl = bd.desligados || [];
  const nn = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const unico = pares => { const m = new Map(); for (const [k, b] of pares) m.set(k, m.has(k) ? null : b); return m; }; // repetido = ambíguo
  const idx = l => ({ id: new Map(l.map(b => [b.id, b])), chapa: unico(l.map(b => [b.chapa, b])), nomeAdm: unico(l.map(b => [`${nn(b.nome)}|${b.adm}`, b])), nome: unico(l.map(b => [nn(b.nome), b])) });
  const achar = (ix, x) => ix.id.get(x.id) || (x.chapa && ix.chapa.get(x.chapa)) || (x.adm && ix.nomeAdm.get(`${nn(x.nome)}|${x.adm}`)) || (!x.chapa && ix.nome.get(nn(x.nome))) || null;
  const iAt = idx(base), iDe = idx(desl);
  const { ini, fim } = (() => { const [y, m] = a.competencia.split('-').map(Number); return { ini: new Date(y, m - 1, 1), fim: new Date(y, m, 0) }; })();
  const dataBR = s => { const [d, m, y] = String(s || '').split('/').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const ts = new Date().toISOString(), por = { uid: eu.uid, nome: eu.nome };
  let msg = [];
  for (const p of procs) {
    let fora = 0; const excluidos = [];
    let pop = [];
    for (const x of u.lista) {
      const b = achar(iAt, x);
      if (b) {
        if (p.excluirInativos && (INATIVO_RE.test(b.status) || b.dem)) { excluidos.push({ nome: b.nome, chapa: b.chapa, motivo: b.dem ? `desligado em ${b.dem}` : b.status }); continue; }
        pop.push({ ...b, info: x.info || '' }); continue;
      }
      const d = achar(iDe, x);
      if (d && p.excluirInativos) { excluidos.push({ nome: d.nome, chapa: d.chapa, motivo: `desligado em ${d.dem}` }); continue; }
      fora++;
      pop.push({ ...x, chapa: d?.chapa || x.chapa || '—', info: [x.info, d ? `desligado em ${d.dem}` : 'não localizado na base do MIX'].filter(Boolean).join(' · ') });
    }
    if (p.fonte === 'admitidos_lista') {
      const adm = base.filter(b => { const d = dataBR(b.adm); return d && d >= ini && d <= fim; }).map(b => ({ ...b, info: `Admissão em ${b.adm}` }));
      const ids = new Set(pop.map(x => x.id));
      pop = [...adm.filter(b => !ids.has(b.id)), ...pop.map(x => ({ ...x, info: `Mudança · ${x.info}` }))];
    }
    const n = tamanhoAmostra(pop.length, p.pct, p.min);
    const am = sortear(pop, n, a.codigo, p.id).map((x, i) => ({ k: 'p' + i, id: x.id, chapa: x.chapa, nome: x.nome, cargo: x.cargo || '',
      depto: x.depto || '', adm: x.adm || '', dem: x.dem || '', escala: x.escala || '', info: x.info || '' }));
    await B.salvarAmostra(a.id, p.id, { procId: p.id, area: p.area, nome: p.nome, fonte: p.fonte, itens: p.itens, N: pop.length, n,
      impressao: await impressao(pop.map(x => x.id)), arquivo: u.nome, pessoas: am, excluidos, respostas: {}, sorteio: { ...por, em: ts } });
    await B.registrarLog(a.id, { ev: 'sorteio-lista', proc: p.id, arquivo: u.nome, N: pop.length, n, excluidos: excluidos.length, ...por });
    msg.push(`${p.nome}: ${n} de ${pop.length}${excluidos.length ? `, ${excluidos.length} excluído(s)` : ''}${fora ? `, ${fora} fora dos ativos` : ''}`);
  }
  toast(msg.join(' · '));
  telaMes(a.id);
}

async function fecharMes(a, ams) {
  if (!isAdmin()) return;
  const todos = await B.listarAmostras(a.id, null);
  const faltaLista = a.processos.filter(p => p.fonte === 'lista' && !todos.some(x => x.procId === p.id));
  const est = todos.map(x => ({ x, e: estat(x) }));
  const pend = est.filter(o => o.e.pend);
  const totPend = pend.reduce((s, o) => s + o.e.pend, 0);
  const aviso = (faltaLista.length || totPend) ? `<div class="avisos" style="margin:12px 0">
      ${faltaLista.length ? `<b>Processos sem lista importada:</b> ${faltaLista.map(p => esc(p.nome)).join(', ')}.<br>` : ''}
      ${totPend ? `<b>${totPend} item(ns) sem resposta</b> em: ${pend.map(o => `${esc(o.x.nome)} (${o.e.pend})`).join(', ')}.` : ''}
      <br>Eles ficam registrados como pendências no relatório.</div>
      <div class="campo"><label for="just">Justificativa para fechar com pendências</label><textarea id="just"></textarea></div>` : '<p>Todos os itens foram respondidos.</p>';
  const ok = await modal(`<h2>Fechar a auditoria de ${nomeMes(a.id)}?</h2>${aviso}<p class="pequeno suave">Depois de fechado, o mês fica somente leitura e o relatório passa a ser o final, para arquivamento.</p>`, {
    okTxt: 'Fechar mês',
    onOk: f => { const j = f.querySelector('#just'); if (j && !j.value.trim()) throw new Error('Informe a justificativa.'); return { just: j ? j.value.trim() : '' }; },
  });
  if (!ok) return;
  const porArea = {}, porProc = {};
  for (const ar of AREAS) porArea[ar.id] = somar(est.filter(o => o.x.area === ar.id).map(o => o.e));
  for (const o of est) porProc[o.x.procId] = o.e;
  const ts = new Date().toISOString();
  await B.salvarAuditoria(a.id, { status: 'fechada', fechamento: { uid: eu.uid, nome: eu.nome, em: ts, justificativa: ok.just, pendencias: totPend, semLista: faltaLista.map(p => p.id) },
    resumo: { geral: somar(est.map(o => o.e)), porArea, porProc } });
  await B.registrarLog(a.id, { ev: 'fechamento', uid: eu.uid, nome: eu.nome, pendencias: totPend });
  toast('Mês fechado. Relatório final disponível.');
  location.hash = `#/relatorio/${a.id}`;
}
async function reabrirMes(a) {
  const ok = await modal(`<h2>Reabrir ${nomeMes(a.id)}?</h2><p class="pequeno">A reabertura fica registrada no histórico do mês e o relatório volta a ser parcial.</p>
    <div class="campo"><label for="mot">Motivo da reabertura</label><textarea id="mot"></textarea></div>`, {
    okTxt: 'Reabrir', perigo: true,
    onOk: f => { const m = f.querySelector('#mot').value.trim(); if (!m) throw new Error('Informe o motivo.'); return m; },
  });
  if (!ok) return;
  await B.salvarAuditoria(a.id, { status: 'aberta' });
  await B.registrarLog(a.id, { ev: 'reabertura', motivo: ok, uid: eu.uid, nome: eu.nome });
  telaMes(a.id);
}

// ======================= execução do checklist =======================
async function telaProc(mes, procId) {
  casca('<div class="carregando">Carregando…</div>', 'painel');
  const [a, am] = [await B.lerAuditoria(mes), await B.lerAmostra(mes, procId)];
  if (!a || !am) { casca('<p>Processo não encontrado.</p>', 'painel'); return; }
  const editavel = a.status === 'aberta' && podeEditarArea(am.area);
  let soPend = false;

  const desenhar = () => {
    const e = estat(am);
    const pessoas = am.pessoas.filter(p => !soPend || am.itens.some((_, i) => !am.respostas?.[p.k]?.[i]));
    $('#corpo').innerHTML = pessoas.length ? pessoas.map(p => `
      <section class="pessoa"><div class="pessoa-cab"><div><b>${esc(p.nome)}</b>${p.chapa && p.chapa !== '—' ? ` <span class="det">· Chapa ${esc(p.chapa)}</span>` : ''}
        <div class="det">${[p.cargo, p.depto].filter(Boolean).map(esc).join(' · ')}</div>${p.info ? `<div class="det"><b>${esc(p.info)}</b></div>` : ''}</div>
        <div class="det dir">${p.adm ? `Admissão ${esc(p.adm)}` : ''}${p.dem ? `<br>Desligamento ${esc(p.dem)}` : ''}${p.escala ? `<br>${esc(p.escala)}` : ''}</div></div>
        ${am.itens.map((it, i) => {
          const r = am.respostas?.[p.k]?.[i];
          return `<div class="item" data-p="${p.k}" data-i="${i}"><div class="item-l"><div class="txt">${esc(it)}
              ${r ? `<div class="quem">${STATUS_TXT[r.s]} · ${esc(r.nome)} · ${dataHora(r.em)}</div>` : '<div class="quem estado-item pendente">Pendente</div>'}</div>
            <div class="opcs" role="group" aria-label="Resultado">${['C', 'NC', 'NA'].map(s => `<button class="opc ${s}" data-s="${s}" aria-pressed="${r?.s === s}" ${editavel ? '' : 'disabled'}>${STATUS_TXT[s]}</button>`).join('')}</div></div>
            ${r?.s === 'NC' ? `<div class="nc-box"><div class="pequeno"><b>Observação:</b> ${esc(r.obs)}</div><div class="pequeno" style="margin-top:6px"><b>Plano de ação:</b> ${esc(r.plano)}</div>
              ${editavel ? '<button class="btn sec peq" data-editnc style="margin-top:8px">Editar</button>' : ''}</div>` : ''}
          </div>`;
        }).join('')}</section>`).join('') : '<div class="cartao">Nenhuma pendência.</div>';
    $('#prog').innerHTML = `${e.resp}/${e.total} itens · ${e.NC} não conforme(s) · conformidade <span class="pct">${pctTxt(e.conf)}</span>`;
    $('#barra').style.width = `${e.total ? e.resp / e.total * 100 : 0}%`;
  };

  const formNC = (pk, i, atual) => {
    const item = $(`.item[data-p="${pk}"][data-i="${i}"]`);
    item.querySelector('.nc-box')?.remove();
    const box = document.createElement('div'); box.className = 'nc-box';
    box.innerHTML = `<div class="campo"><label>Observação (o que foi encontrado) *</label><textarea data-obs>${esc(atual?.obs || '')}</textarea></div>
      <div class="campo" style="margin-bottom:8px"><label>Plano de ação (o que será feito para evitar o erro) *</label><textarea data-plano>${esc(atual?.plano || '')}</textarea></div>
      <div class="linha"><button class="btn peq" data-salvarnc>Salvar não conformidade</button><button class="btn sec peq" data-cancnc>Cancelar</button><span class="erro oculto" data-err></span></div>`;
    item.appendChild(box);
    box.querySelector('[data-obs]').focus();
    box.querySelector('[data-cancnc]').onclick = () => desenhar();
    box.querySelector('[data-salvarnc]').onclick = async () => {
      const obs = box.querySelector('[data-obs]').value.trim(), plano = box.querySelector('[data-plano]').value.trim();
      if (!obs || !plano) { const er = box.querySelector('[data-err]'); er.textContent = 'Preencha a observação e o plano de ação.'; er.classList.remove('oculto'); return; }
      await gravar(pk, i, { s: 'NC', obs, plano });
    };
  };
  const gravar = async (pk, i, v) => {
    const valor = { ...v, uid: eu.uid, nome: eu.nome, em: new Date().toISOString() };
    try {
      await B.responder(mes, procId, pk, i, valor);
      ((am.respostas ||= {})[pk] ||= {})[i] = valor;
      desenhar();
    } catch (e) { toast(msgErro(e), true); }
  };

  casca(`
    <div class="cab"><div><div class="legenda"><a href="#/mes/${mes}">${nomeMes(mes)}</a> · ${areaNome(am.area)}</div><h1>${esc(am.nome)}</h1>
      <div class="suave pequeno">${am.fonte === 'unico' ? 'Checklist único do mês' : `População ${am.N} · amostra ${am.n} · impressão da população ${esc(am.impressao)}${am.arquivo ? ` · arquivo ${esc(am.arquivo)}` : ''}`}</div></div>
      <div class="acoes"><label class="filtro"><input type="checkbox" id="soPend"> Mostrar só pendentes</label><a class="btn sec" href="#/mes/${mes}">Voltar</a></div></div>
    ${am.excluidos?.length ? `<details class="cartao pequeno" style="padding:12px 16px"><summary style="cursor:pointer"><b>${am.excluidos.length} pessoa(s) excluída(s) da lista</b> (afastados, aposentados, licenças ou desligados)</summary>
      <p style="margin:8px 0 0">${am.excluidos.map(x => `${esc(x.nome)}${x.chapa && x.chapa !== '—' ? ` (${esc(x.chapa)})` : ''}: ${esc(x.motivo)}`).join('<br>')}</p></details>` : ''}
    ${!editavel ? `<div class="avisos" style="margin-bottom:16px">${a.status !== 'aberta' ? 'Mês fechado: somente leitura.' : 'Você tem acesso somente leitura a esta área.'}</div>` : ''}
    <div class="cartao" style="padding:16px"><div id="prog" class="pequeno" style="margin-bottom:8px"></div><div class="barra"><i id="barra"></i></div></div>
    <div id="corpo"></div>`, 'painel');
  $('#soPend').onchange = e => { soPend = e.target.checked; desenhar(); };
  $('#corpo').addEventListener('click', ev => {
    const it = ev.target.closest('.item'); if (!it || !editavel) return;
    const pk = it.dataset.p, i = +it.dataset.i;
    const b = ev.target.closest('.opc');
    if (b) {
      const s = b.dataset.s, atual = am.respostas?.[pk]?.[i];
      if (s === 'NC') formNC(pk, i, atual?.s === 'NC' ? atual : null);
      else gravar(pk, i, { s });
    }
    if (ev.target.closest('[data-editnc]')) formNC(pk, i, am.respostas?.[pk]?.[i]);
  });
  desenhar();
}

// ======================= relatório =======================
async function telaRelatorio(mes) {
  casca('<div class="carregando">Carregando…</div>', 'painel');
  const a = await B.lerAuditoria(mes);
  if (!a) { casca('<p>Auditoria não encontrada.</p>', 'painel'); return; }
  const ams = await B.listarAmostras(mes, minhasAreas());
  const porId = Object.fromEntries(ams.map(x => [x.procId, x]));
  const final = a.status === 'fechada';
  const procs = a.processos.filter(p => isAdmin() || (eu.areas || []).includes(p.area));
  const est = procs.map(p => ({ p, am: porId[p.id], e: porId[p.id] ? estat(porId[p.id]) : null }));
  const geral = somar(est.filter(o => o.e).map(o => o.e));
  const auditores = [...new Set(ams.flatMap(x => Object.values(x.respostas || {}).flatMap(r => Object.values(r).map(v => v.nome))))];
  const ncs = [];
  for (const o of est) if (o.am) for (const pe of o.am.pessoas) for (const [i, r] of Object.entries(o.am.respostas?.[pe.k] || {}))
    if (r.s === 'NC') ncs.push({ proc: o.p, area: o.p.area, pe, item: o.am.itens[i], r });

  casca(`
    <div class="cab nao-imprimir"><div><div class="legenda"><a href="#/mes/${mes}">${nomeMes(mes)}</a></div><h1>Relatório de conformidade</h1></div>
      <div class="acoes">${B.modo === 'demo' ? '<span class="suave pequeno">No sistema publicado, aqui aparece o botão “Imprimir / salvar PDF”.</span>' : '<button class="btn" id="imprimir">Imprimir / salvar PDF</button>'}<a class="btn sec" href="#/mes/${mes}">Voltar</a></div></div>
    <article class="rel">
      <div class="rel-cab"><div><img src="raguife-logo.png" alt="Raguife"></div>
        <div style="text-align:right"><div class="legenda">Relatório de auditoria interna</div><h1 style="font-size:22px">${nomeMes(mes)}</h1>
        <div class="pequeno suave">Competência analisada: ${nomeMes(a.competencia)}</div>
        <div style="margin-top:6px"><span class="selo ${final ? 'final' : 'parcial'}">${final ? 'RELATÓRIO FINAL' : 'PARCIAL — MÊS EM ABERTO'}</span></div></div></div>
      <div class="ficha">
        <div><span class="legenda">Abertura</span><br>${esc(a.abertura?.nome)} · ${dataHora(a.abertura?.em)}</div>
        <div><span class="legenda">Fechamento</span><br>${final ? `${esc(a.fechamento?.nome)} · ${dataHora(a.fechamento?.em)}` : '—'}</div>
        <div><span class="legenda">Código de sorteio</span><br><b>${esc(a.codigo)}</b></div>
        <div><span class="legenda">Auditores</span><br>${auditores.map(esc).join(', ') || '—'}</div>
        ${!isAdmin() ? `<div><span class="legenda">Escopo</span><br>${(eu.areas || []).map(areaNome).join(', ')}</div>` : ''}
      </div>
      ${final && a.fechamento?.justificativa ? `<p class="avisos" style="margin-top:12px"><b>Fechado com pendências (${a.fechamento.pendencias} itens):</b> ${esc(a.fechamento.justificativa)}</p>` : ''}

      <h2>Resumo</h2>
      <div class="kpis">
        <div class="kpi"><div class="legenda">Conformidade geral</div><div class="v">${pctTxt(geral.conf)}</div></div>
        <div class="kpi"><div class="legenda">Itens avaliados</div><div class="v">${geral.resp}<span class="suave" style="font-size:14px"> / ${geral.total}</span></div></div>
        <div class="kpi"><div class="legenda">Não conformidades</div><div class="v">${geral.NC}</div></div>
        <div class="kpi"><div class="legenda">Pessoas sorteadas</div><div class="v">${est.reduce((s, o) => s + (o.am && o.am.fonte !== 'unico' ? o.am.pessoas.length : 0), 0)}</div></div>
      </div>
      <div class="tabela-wrap"><table><thead><tr><th>Área / processo</th><th class="num">Pop.</th><th class="num">Amostra</th><th class="num">C</th><th class="num">NC</th><th class="num">NA</th><th class="num">Pend.</th><th class="num">Conformidade</th></tr></thead><tbody>
      ${AREAS.filter(ar => procs.some(p => p.area === ar.id)).map(ar => {
        const os = est.filter(o => o.p.area === ar.id), ea = somar(os.filter(o => o.e).map(o => o.e));
        return `<tr><td colspan="3"><b style="color:var(--verde)">${ar.nome}</b></td><td class="num"><b>${ea.C}</b></td><td class="num"><b>${ea.NC}</b></td><td class="num"><b>${ea.NA}</b></td><td class="num"><b>${ea.pend}</b></td><td class="num pct">${pctTxt(ea.conf)}</td></tr>` +
          os.map(o => `<tr><td style="padding-left:22px">${esc(o.p.nome)}</td>
            ${o.am ? `<td class="num">${o.am.fonte === 'unico' ? '—' : o.am.N}</td><td class="num">${o.am.fonte === 'unico' ? 'único' : o.am.n}</td><td class="num">${o.e.C}</td><td class="num">${o.e.NC}</td><td class="num">${o.e.NA}</td><td class="num">${o.e.pend}</td><td class="num">${o.am.n === 0 ? 'sem ocorrências' : pctTxt(o.e.conf)}</td>`
              : '<td colspan="6" class="num suave">lista não importada</td>'}</tr>`).join('');
      }).join('')}</tbody></table></div>

      <h2>Não conformidades e planos de ação</h2>
      ${ncs.length ? `<div class="tabela-wrap"><table><thead><tr><th>Processo</th><th>Pessoa</th><th>Item</th><th>Observação</th><th>Plano de ação</th><th>Auditor</th></tr></thead><tbody>
        ${ncs.map(n => `<tr><td>${esc(n.proc.nome)}<div class="suave pequeno">${areaNome(n.area)}</div></td><td>${esc(n.pe.nome)}${n.pe.chapa !== '—' ? `<div class="suave pequeno">${esc(n.pe.chapa)}</div>` : ''}</td><td>${esc(n.item)}</td><td>${esc(n.r.obs)}</td><td>${esc(n.r.plano)}</td><td class="pequeno">${esc(n.r.nome)}<br>${dataHora(n.r.em)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="suave">Nenhuma não conformidade registrada.</p>'}

      <h2>Amostras sorteadas</h2>
      <div class="tabela-wrap"><table><thead><tr><th>Processo</th><th>Pessoas sorteadas</th></tr></thead><tbody>
        ${est.filter(o => o.am && o.am.fonte !== 'unico').map(o => `<tr><td>${esc(o.p.nome)}<div class="suave pequeno">${o.am.n} de ${o.am.N} · impressão ${esc(o.am.impressao)}${o.am.excluidos?.length ? ` · ${o.am.excluidos.length} excluído(s): ${o.am.excluidos.map(x => `${esc(x.nome)} (${esc(x.motivo)})`).join('; ')}` : ''}</div></td>
          <td class="pequeno">${o.am.pessoas.map(pe => `${esc(pe.nome)} (${esc(pe.chapa)})`).join('; ') || '—'}</td></tr>`).join('')}
      </tbody></table></div>

      <h2>Metodologia</h2>
      <p class="pequeno">A auditoria do mês ${nomeMes(mes)} avalia a competência ${nomeMes(a.competencia)}, já fechada. Para cada processo, a população foi formada a partir da base de funcionários exportada do MIX (ativos, admitidos, desligados, vencimentos de experiência ou menores na competência) ou de lista específica importada. A amostra corresponde ao percentual configurado da população, respeitado o mínimo, e foi sorteada de forma aleatória e reprodutível a partir do código de sorteio <b>${esc(a.codigo)}</b>. A “impressão” de cada população (SHA-256 das Chapas) permite comprovar que a base usada não foi alterada. Processos configurados com 100% verificam toda a população, sem sorteio. A conformidade é calculada como itens conformes ÷ (conformes + não conformes); itens “não se aplica” não entram no cálculo.</p>

      <div class="assin"><div>Gerente de Recursos Humanos</div><div>Auditor(es)</div></div>
    </article>`, 'painel');
  $('#imprimir')?.addEventListener('click', () => window.print());
}

// ======================= usuários =======================
async function telaUsuarios() {
  if (!isAdmin()) { location.hash = '#/painel'; return; }
  casca('<div class="carregando">Carregando…</div>', 'usuarios');
  const us = (await B.listarUsuarios()).sort((a, b) => a.nome.localeCompare(b.nome));
  casca(`
    <div class="cab"><div><div class="legenda">Administração</div><h1>Usuários</h1><div class="suave pequeno">Não existe cadastro aberto: só o administrador cria acessos.</div></div>
      <div class="acoes"><button class="btn" id="novo">Novo usuário</button></div></div>
    <div class="cartao"><div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Áreas</th><th>Situação</th><th></th></tr></thead><tbody>
      ${us.map(u => `<tr><td><b>${esc(u.nome)}</b></td><td>${esc(u.email)}</td><td>${PERFIS[u.perfil] || u.perfil}</td>
        <td class="pequeno">${u.perfil === 'admin' ? 'Todas' : (u.areas || []).map(areaNome).join(', ') || '—'}</td>
        <td><span class="chip ${u.ativo ? 'ok' : 'nc'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td class="num"><button class="btn sec peq" data-ed="${u.uid}">Editar</button> <button class="btn sec peq" data-rs="${esc(u.email)}">Enviar link de nova senha</button></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="cartao pequeno"><h3>Perfis</h3><p><b>Administrador:</b> abre e fecha meses, importa listas, cadastra usuários e configura processos. Acessa todas as áreas.<br>
      <b>Auditor:</b> responde os checklists das áreas liberadas para ele.<br><b>Visualizador:</b> consulta checklists e relatórios das áreas liberadas, sem alterar.</p></div>`, 'usuarios');

  const form = u => `
    <div class="campos2"><div class="campo"><label for="u-nome">Nome</label><input id="u-nome" type="text" value="${esc(u?.nome || '')}"></div>
    <div class="campo"><label for="u-email">E-mail</label><input id="u-email" type="email" value="${esc(u?.email || '')}" ${u ? 'disabled' : ''}></div></div>
    ${u ? '' : '<div class="campo"><label for="u-senha">Senha inicial (mínimo 6 caracteres)</label><input id="u-senha" type="text" autocomplete="off"></div>'}
    <div class="campo"><label for="u-perfil">Perfil</label><select id="u-perfil">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}" ${u?.perfil === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="campo"><label>Áreas</label><div class="checks">${AREAS.map(a => `<label><input type="checkbox" value="${a.id}" data-area ${(u?.areas || []).includes(a.id) ? 'checked' : ''}> ${a.nome}</label>`).join('')}</div></div>
    ${u ? `<div class="campo"><label class="checks" style="color:inherit"><input type="checkbox" id="u-ativo" ${u.ativo ? 'checked' : ''}> Acesso ativo</label></div>` : ''}`;
  const ler = f => {
    const d = { nome: f.querySelector('#u-nome').value.trim(), perfil: f.querySelector('#u-perfil').value, areas: $$('[data-area]', f).filter(c => c.checked).map(c => c.value) };
    if (!d.nome) throw new Error('Informe o nome.');
    if (d.perfil !== 'admin' && !d.areas.length) throw new Error('Selecione ao menos uma área.');
    if (d.perfil === 'admin') d.areas = AREAS.map(a => a.id);
    return d;
  };
  $('#novo').onclick = async () => {
    const ok = await modal(`<h2>Novo usuário</h2>${form(null)}`, {
      okTxt: 'Criar usuário',
      onOk: async f => {
        const d = ler(f); d.email = f.querySelector('#u-email').value.trim(); d.senha = f.querySelector('#u-senha').value;
        if (!d.email) throw new Error('Informe o e-mail.');
        if (d.senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        try { await B.criarUsuario(d); } catch (e) { throw new Error(msgErro(e)); }
        return true;
      },
    });
    if (ok) { toast('Usuário criado. Passe o e-mail e a senha inicial para a pessoa.'); telaUsuarios(); }
  };
  $$('[data-ed]').forEach(b => b.onclick = async () => {
    const u = us.find(x => x.uid === b.dataset.ed);
    const ok = await modal(`<h2>Editar usuário</h2>${form(u)}`, {
      okTxt: 'Salvar',
      onOk: async f => {
        const d = ler(f); d.ativo = f.querySelector('#u-ativo').checked;
        if (u.uid === eu.uid && (d.perfil !== 'admin' || !d.ativo)) throw new Error('Você não pode remover o seu próprio acesso de administrador.');
        try { await B.atualizarUsuario(u.uid, d); } catch (e) { throw new Error(msgErro(e)); }
        return true;
      },
    });
    if (ok) { toast('Usuário atualizado.'); telaUsuarios(); }
  });
  $$('[data-rs]').forEach(b => b.onclick = async () => {
    try { await B.resetSenha(b.dataset.rs); toast(`Link de redefinição enviado para ${b.dataset.rs}.`); } catch (e) { toast(msgErro(e), true); }
  });
}

// ======================= configurações =======================
async function telaConfig() {
  if (!isAdmin()) { location.hash = '#/painel'; return; }
  await carregarCatalogo();
  const fontesOpts = sel => Object.entries(FONTES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.nome}</option>`).join('');
  casca(`
    <div class="cab"><div><div class="legenda">Administração</div><h1>Configurações dos processos</h1>
      <div class="suave pequeno">As mudanças valem para os próximos meses abertos. Meses já abertos guardam a configuração da época.</div></div>
      <div class="acoes"><button class="btn sec" id="padrao">Restaurar padrão</button><button class="btn" id="salvar">Salvar</button></div></div>
    ${AREAS.map(ar => `<div class="area-tit"><h2>${ar.nome}</h2></div>
      ${catalogo.filter(p => p.area === ar.id).map(p => `<details class="cartao" data-id="${p.id}" style="padding:16px">
        <summary style="cursor:pointer"><b>${esc(p.nome)}</b> <span class="suave pequeno">· ${esc(FONTES[p.fonte].nome)}${p.fonte === 'unico' ? '' : ` · ${p.pct}% (mín. ${p.min})`} · ${p.itens.length} itens</span></summary>
        <div style="margin-top:16px">
          <div class="campos2">
            <div class="campo"><label>Nome</label><input type="text" data-f="nome" value="${esc(p.nome)}"></div>
            <div class="campo"><label>Fonte da população</label><select data-f="fonte">${fontesOpts(p.fonte)}</select></div>
            <div class="campo"><label>% da população</label><input type="number" min="0" max="100" step="0.5" data-f="pct" value="${p.pct}"></div>
            <div class="campo"><label>Mínimo de pessoas</label><input type="number" min="0" step="1" data-f="min" value="${p.min}"></div>
          </div>
          <div class="campo"><label>Descrição da lista (quando a fonte é lista importada)</label><input type="text" data-f="lista" value="${esc(p.lista || '')}"></div>
          <div class="campo"><label>Itens do checklist (um por linha)</label><textarea data-f="itens" rows="${p.itens.length + 1}">${esc(p.itens.join('\n'))}</textarea></div>
        </div></details>`).join('')}`).join('')}`, 'config');
  $('#salvar').onclick = async () => {
    const nova = catalogo.map(p => {
      const d = $(`details[data-id="${p.id}"]`), v = f => d.querySelector(`[data-f="${f}"]`).value;
      return { ...p, nome: v('nome').trim() || p.nome, fonte: v('fonte'), pct: Math.max(0, Math.min(100, +v('pct') || 0)), min: Math.max(0, Math.round(+v('min') || 0)),
        lista: v('lista').trim(), itens: v('itens').split('\n').map(s => s.trim()).filter(Boolean) };
    });
    const vazio = nova.find(p => !p.itens.length);
    if (vazio) { toast(`“${vazio.nome}” precisa de pelo menos um item.`, true); return; }
    await B.salvarConfig(nova, VERSAO_CATALOGO); catalogo = nova; toast('Configurações salvas.'); telaConfig();
  };
  $('#padrao').onclick = async () => {
    if (!await modal('<h2>Restaurar a configuração padrão?</h2><p>Percentuais, fontes e itens voltam ao padrão original.</p>', { perigo: true, okTxt: 'Restaurar' })) return;
    await B.salvarConfig(structuredClone(PROCESSOS_PADRAO), VERSAO_CATALOGO); telaConfig();
  };
}

// ======================= roteador =======================
async function rotear() {
  if (!eu) return;
  const h = location.hash.replace(/^#\/?/, '').split('/');
  try {
    if (h[0] === 'abrir' && h[1]) return await telaAbrir(h[1]);
    if (h[0] === 'mes' && h[1] && h[2] === 'p' && h[3]) return await telaProc(h[1], h[3]);
    if (h[0] === 'mes' && h[1]) return await telaMes(h[1]);
    if (h[0] === 'relatorio' && h[1]) return await telaRelatorio(h[1]);
    if (h[0] === 'usuarios') return await telaUsuarios();
    if (h[0] === 'config') return await telaConfig();
    return await telaPainel();
  } catch (e) { console.error(e); casca(`<div class="cartao"><h2>Algo deu errado</h2><p class="erro">${esc(msgErro(e))}</p><a class="btn sec" href="#/painel">Voltar ao painel</a></div>`, ''); }
}

(async function iniciar() {
  B = await criarBackend(firebaseConfig);
  window.addEventListener('hashchange', rotear);
  B.onAuth(async u => {
    if (!u) { eu = null; telaLogin(); return; }
    const p = await B.perfil(u.uid).catch(() => null);
    if (!p || !p.ativo) { eu = null; telaSemPerfil(u, p && !p.ativo); return; }
    eu = p;
    rotear();
  });
})();
