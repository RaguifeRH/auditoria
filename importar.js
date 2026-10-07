// Leitura dos relatórios exportados do MIX (xlsx/xls/csv).
// Nada é enviado a servidor aqui: o arquivo é lido no navegador.
// Dados sensíveis (CPF, salário, conta bancária) são descartados na leitura.

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const CHAPA_RE = /^\d{4,}$/;

export function lerPlanilha(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const linhas = [];
  for (const nome of wb.SheetNames) {
    const ws = wb.Sheets[nome];
    linhas.push(...XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }));
  }
  return linhas;
}

export function parseData(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number') { // serial do Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let a = +m[3]; if (a < 100) a += 2000;
    return new Date(a, +m[2] - 1, +m[1]);
  }
  const iso = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  return null;
}

export const fmtData = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
export const isoData = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

// Localiza a linha de cabeçalho e devolve { idx: {campo: coluna}, linha }
function acharCabecalho(linhas, exigidos) {
  for (let i = 0; i < Math.min(linhas.length, 200); i++) {
    const cels = linhas[i].map(norm);
    if (exigidos.every(e => cels.some(c => c === e || c.startsWith(e)))) return { linha: i, cels };
  }
  return null;
}
const col = (cels, ...nomes) => {
  for (const n of nomes) { const i = cels.findIndex(c => c === n); if (i >= 0) return i; }
  for (const n of nomes) { const i = cels.findIndex(c => c.startsWith(n)); if (i >= 0) return i; }
  return -1;
};
const chapaDe = v => String(v ?? '').trim().replace(/\.0$/, '');
// A Chapa se repete entre filiais/pessoas diferentes, então a chave é Chapa + nome.
export const chave = (chapa, nome) => `${chapa}|${norm(nome)}`;

// Identifica o tipo de relatório pelo cabeçalho
export function identificar(linhas) {
  if (acharCabecalho(linhas, ['chapa', 'nome', 'dt. admissao'])) return 'funcionarios';
  if (acharCabecalho(linhas, ['chapa', 'cpf'])) return 'complementar';
  if (acharCabecalho(linhas, ['chapa'])) return 'lista';
  return null;
}

// Relatório 1: Chapa, Nome, Cargo, Faixa, Salário, Depto, Admissão, Demissão, Status
export function lerFuncionarios(linhas) {
  const h = acharCabecalho(linhas, ['chapa', 'nome', 'dt. admissao']);
  if (!h) throw new Error('Cabeçalho do relatório de funcionários não encontrado (Chapa, Nome, Dt. Admissão).');
  const c = {
    chapa: col(h.cels, 'chapa'), nome: col(h.cels, 'nome'), cargo: col(h.cels, 'cargo'),
    faixa: col(h.cels, 'faixa sal.', 'faixa'), depto: col(h.cels, 'depto', 'departamento', 'secao'),
    adm: col(h.cels, 'dt. admissao', 'admissao'), dem: col(h.cels, 'dt. demissao', 'demissao'),
    status: col(h.cels, 'status func.', 'status', 'situacao'),
  };
  const out = new Map();
  for (const r of linhas.slice(h.linha + 1)) {
    const chapa = chapaDe(r[c.chapa]);
    if (!CHAPA_RE.test(chapa)) continue;
    const adm = parseData(r[c.adm]);
    if (!adm) continue;
    const nome = String(r[c.nome] || '').trim();
    const id = chave(chapa, nome);
    const ant = out.get(id);
    const dem = c.dem >= 0 ? parseData(r[c.dem]) : null;
    // readmissão/duplicidade: fica o vínculo mais recente (sem demissão vence)
    if (ant && (ant.adm > adm || (+ant.adm === +adm && (!ant.dem || (dem && ant.dem > dem))))) continue;
    out.set(id, {
      id, chapa, nome, cargo: String(r[c.cargo] || '').trim(),
      faixa: c.faixa >= 0 ? String(r[c.faixa] || '').trim() : '',
      depto: c.depto >= 0 ? String(r[c.depto] || '').trim() : '',
      adm, dem,
      status: c.status >= 0 ? String(r[c.status] || '').trim() : '',
    });
  }
  return out;
}

// Relatório 2: Chapa, Nome, CPF, Escala, CBO, Nascimento. CPF é lido só para descartar.
export function lerComplementar(linhas) {
  const h = acharCabecalho(linhas, ['chapa', 'cpf']);
  if (!h) throw new Error('Cabeçalho do relatório complementar não encontrado (Chapa, CPF).');
  const c = {
    chapa: col(h.cels, 'chapa'), nome: col(h.cels, 'nome'), escala: col(h.cels, 'escala horario de trab.', 'escala', 'horario', 'jornada'),
    cbo: col(h.cels, 'cbo'), nasc: col(h.cels, 'dt. nascimento', 'nascimento', 'data de nascimento'),
  };
  const out = new Map();
  for (const r of linhas.slice(h.linha + 1)) {
    const chapa = chapaDe(r[c.chapa]);
    if (!CHAPA_RE.test(chapa)) continue;
    out.set(chave(chapa, r[c.nome]), {
      escala: c.escala >= 0 ? String(r[c.escala] || '').trim() : '',
      cbo: c.cbo >= 0 ? String(r[c.cbo] || '').trim() : '',
      nasc: c.nasc >= 0 ? parseData(r[c.nasc]) : null,
    });
  }
  return out;
}

// Junta os dois relatórios pela Chapa e devolve avisos de Chapas sem par
export function juntarBase(func, comp) {
  const avisos = [];
  const base = [];
  for (const [id, f] of func) {
    const x = comp ? comp.get(id) : null;
    if (comp && !x) avisos.push(`Chapa ${f.chapa} (${f.nome}) está no relatório de funcionários, mas não no complementar.`);
    base.push({ ...f, escala: x?.escala || '', cbo: x?.cbo || '', nasc: x?.nasc || null });
  }
  if (comp) for (const id of comp.keys()) if (!func.has(id)) avisos.push(`Chapa ${id.split('|')[0]} está no relatório complementar, mas não no de funcionários.`);
  return { base, avisos };
}

// Arquivo do consignado (Crédito do Trabalhador, exportado do portal): uma linha por contrato,
// sem Chapa. Agrupa por trabalhador e guarda só nome, admissão e um resumo dos contratos (CPF descartado).
function lerConsignado(linhas, h) {
  const c = { nome: col(h.cels, 'nometrabalhador'), adm: col(h.cels, 'dataadmissao'), parcela: col(h.cels, 'valorparcela'),
    banco: col(h.cels, 'ifconcessora.descricao') };
  const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const out = new Map();
  for (const r of linhas.slice(h.linha + 1)) {
    const nome = String(r[c.nome] || '').trim(); if (!nome) continue;
    const adm = parseData(r[c.adm]);
    const id = `|${norm(nome)}|${adm ? fmtData(adm) : ''}`;
    const x = out.get(id) || { id, chapa: '', nome, adm: adm ? fmtData(adm) : '', _n: 0, _v: 0, _b: new Set() };
    x._n++; x._v += Number(r[c.parcela]) || 0; if (c.banco >= 0 && r[c.banco]) x._b.add(String(r[c.banco]).trim());
    out.set(id, x);
  }
  return [...out.values()].map(({ _n, _v, _b, ...x }) => ({ ...x, info: `${_n} contrato(s) · parcelas ${brl(_v)} · ${[..._b].join(', ')}` }));
}

// Fatura do plano de saúde (operadora): uma linha por beneficiário e evento.
// "CPP" = mensalidade; "COPARTICIPACAO" = uso do plano. Agrupa pelo titular (respfamilia).
// - processo "planos": titulares com dependentes (mensalidade dos dependentes é descontada do titular)
// - demais (coparticipação): titulares com coparticipação própria ou dos dependentes
function lerPlanoSaude(linhas, h, procId) {
  const c = { resp: col(h.cels, 'respfamilia'), benef: col(h.cels, 'beneficiario'), rel: col(h.cels, 'relacionamento'),
    ev: col(h.cels, 'dsevento'), st: col(h.cels, 'statusbenef'), valor: col(h.cels, 'valor') };
  const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fam = new Map();
  for (const r of linhas.slice(h.linha + 1)) {
    const resp = String(r[c.resp] || '').trim(); if (!resp) continue;
    const f = fam.get(resp) || { deps: new Set(), cppDep: 0, cop: 0, nCop: 0, cancel: false };
    const titular = norm(r[c.rel]) === 'titular', ev = norm(r[c.ev]), v = Number(r[c.valor]) || 0;
    if (norm(r[c.st]) === 'cancelado') f.cancel = true;
    if (ev.startsWith('cpp') && !titular) { f.deps.add(String(r[c.benef]).trim()); f.cppDep += v; }
    if (ev.startsWith('copart')) { f.cop += v; f.nCop++; }
    fam.set(resp, f);
  }
  const out = [];
  for (const [nome, f] of fam) {
    const canc = f.cancel ? ' · beneficiário cancelado na fatura' : '';
    if (procId === 'planos') { if (f.deps.size) out.push({ id: `|${norm(nome)}|`, chapa: '', nome, info: `Saúde: ${f.deps.size} dependente(s), mensalidade ${brl(f.cppDep)}${canc}` }); }
    else if (f.nCop) out.push({ id: `|${norm(nome)}|`, chapa: '', nome, info: `coparticipação ${brl(f.cop)} (${f.nCop} lançamento(s) da família)${canc}` });
  }
  return out;
}

const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Boleto do plano odontológico (Bradesco Dental, aba "Table 1"): certificado /00 = titular, /01+ = dependentes.
// O nome é sempre o do titular. Linhas com valor negativo (estornos) são desconsideradas.
function lerOdonto(linhas, h) {
  const c = { cert: col(h.cels, 'certif.'), nome: h.cels.findIndex(x => x.includes('nome segurado')), par: col(h.cels, 'paren.'), valor: col(h.cels, 'valor') };
  const fam = new Map();
  let cert = '';
  for (const r of linhas.slice(h.linha + 1)) {
    if (r[c.cert]) cert = String(r[c.cert]).trim();
    const nome = String(r[c.nome] || '').trim(), v = Number(r[c.valor]) || 0;
    if (!nome || v <= 0) continue;
    const f = fam.get(nome) || { deps: new Set(), val: 0 };
    if (String(r[c.par] || '').trim() || !/\/00$/.test(cert)) { f.deps.add(cert); f.val += v; }
    fam.set(nome, f);
  }
  return [...fam].filter(([, f]) => f.deps.size).map(([nome, f]) => ({ id: `|${norm(nome)}|`, chapa: '', nome, info: `Odonto: ${f.deps.size} dependente(s), mensalidade ${brl(f.val)}` }));
}

// Pendências de exames periódicos (sistema de saúde ocupacional): Funcionário, Cargo, Procedimento.
function lerPeriodicos(linhas, h) {
  const c = { nome: col(h.cels, 'funcionario'), cargo: col(h.cels, 'cargo'), proc: col(h.cels, 'procedimento') };
  const out = new Map();
  for (const r of linhas.slice(h.linha + 1)) {
    const nome = String(r[c.nome] || '').replace(/\s+/g, ' ').trim(); if (!nome) continue;
    const id = `|${norm(nome)}|`;
    const x = out.get(id) || { id, chapa: '', nome: nome.toUpperCase(), cargo: String(r[c.cargo] || '').trim(), _p: [] };
    if (r[c.proc]) x._p.push(String(r[c.proc]).replace(/\s*-\s*Ocupacional/i, '').trim());
    out.set(id, x);
  }
  return [...out.values()].map(({ _p, ...x }) => ({ ...x, info: `Exames pendentes: ${_p.join(', ')}` }));
}

// Conferência de Alteração de Cargo / de Estrutura (MIX). Ignora o motivo "Admissão".
function lerMudancas(linhas) {
  const out = new Map();
  let c = null;
  for (const r of linhas) {
    const cels = r.map(norm);
    if (cels.includes('chapa') && cels.some(x => x.startsWith('motivo alteracao'))) {
      c = { chapa: col(cels, 'chapa'), nome: col(cels, 'nome'), ca: col(cels, 'cargo anterior'), cn: col(cels, 'cargo atual'),
        ea: col(cels, 'estrutura anterior'), en: col(cels, 'estrutura atual'), cargo: col(cels, 'cargo'), data: col(cels, 'data alteracao'), mot: col(cels, 'motivo alteracao') };
      continue;
    }
    if (!c) continue;
    const chapa = chapaDe(r[c.chapa]); if (!CHAPA_RE.test(chapa)) continue;
    const mot = String(r[c.mot] || '').trim();
    if (norm(mot) === 'admissao') continue;
    const nome = String(r[c.nome] || '').trim(), id = chave(chapa, nome);
    const de = c.ca >= 0 ? `Cargo: ${r[c.ca] || '—'} → ${r[c.cn] || '—'}` : `Setor: ${r[c.ea] || '—'} → ${r[c.en] || '—'}`;
    const desc = `${de} (${mot}, ${fmtData(parseData(r[c.data])) || '—'})`;
    const x = out.get(id) || { id, chapa, nome, cargo: String(r[c.cn >= 0 ? c.cn : c.cargo] || '').trim(), info: '' };
    x.info = [x.info, desc].filter(Boolean).join(' · ');
    out.set(id, x);
  }
  if (!c) return null;
  return [...out.values()];
}

// Junta listas de vários arquivos da mesma importação, somando as informações por pessoa
export function mesclar(listas) {
  const out = new Map();
  for (const l of listas) for (const x of l) {
    const y = out.get(x.id);
    if (!y) out.set(x.id, { ...x });
    else y.info = [y.info, x.info].filter(Boolean).join(' · ');
  }
  return [...out.values()];
}

// Lista genérica: qualquer relatório com coluna "Chapa" (ex.: Relação de Líquidos de Férias).
// Ignora cabeçalhos repetidos, linhas de filial/totais e colunas bancárias.
// Também reconhece: consignado, fatura do plano de saúde, boleto odontológico,
// pendências de periódicos e conferência de alteração de cargo/estrutura.
export function lerLista(linhas, procId) {
  const hc = acharCabecalho(linhas, ['nometrabalhador', 'dataadmissao']);
  if (hc) return lerConsignado(linhas, hc);
  const hs = acharCabecalho(linhas, ['respfamilia', 'dsevento']);
  if (hs) return lerPlanoSaude(linhas, hs, procId);
  const ho = acharCabecalho(linhas, ['certif.', 'paren.']);
  if (ho) return procId === 'planos' ? lerOdonto(linhas, ho) : [];
  const hp = acharCabecalho(linhas, ['funcionario', 'procedimento']);
  if (hp) return lerPeriodicos(linhas, hp);
  const mu = lerMudancas(linhas);
  if (mu) return mu;
  const out = new Map();
  let c = null;
  for (const r of linhas) {
    const cels = r.map(norm);
    const iChapa = cels.findIndex(x => x === 'chapa');
    if (iChapa >= 0) { c = { chapa: iChapa, nome: col(cels, 'nome'), cargo: col(cels, 'cargo', 'funcao') }; continue; }
    if (!c) continue;
    const chapa = chapaDe(r[c.chapa]);
    if (!CHAPA_RE.test(chapa)) continue;
    const nome = c.nome >= 0 ? String(r[c.nome] || '').trim() : '';
    const id = chave(chapa, nome);
    if (out.has(id)) continue;
    out.set(id, { id, chapa, nome, cargo: c.cargo >= 0 ? String(r[c.cargo] || '').trim() : '' });
  }
  if (!c) throw new Error('Formato não reconhecido: o arquivo precisa ter uma coluna "Chapa" (ou ser o arquivo do consignado do portal).');
  return [...out.values()];
}
