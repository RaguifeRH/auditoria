// Sorteio reprodutível: mesma base + mesmo código de sorteio = mesma amostra.

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const nomeMes = id => { const [a, m] = id.split('-').map(Number); return `${MESES[m - 1]}/${a}`; };
export function competenciaDe(mesAuditoria) { // "2026-10" -> "2026-09"
  const [a, m] = mesAuditoria.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function limitesCompetencia(comp) {
  const [a, m] = comp.split('-').map(Number);
  return { ini: new Date(a, m - 1, 1), fim: new Date(a, m, 0) };
}

export function gerarCodigo() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const v = new Uint32Array(8); crypto.getRandomValues(v);
  const s = [...v].map(x => abc[x % abc.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function hash32(str) { // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export async function impressao(chapas) { // "impressão digital" da população
  const txt = [...chapas].sort().join(',');  // recebe as chaves (Chapa|nome)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16).toUpperCase();
}

export const tamanhoAmostra = (N, pct, min) => N === 0 ? 0 : Math.min(N, Math.max(min || 0, Math.ceil(N * (pct || 0) / 100)));

export function sortear(populacao, n, codigo, procId) {
  const ord = [...populacao].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rnd = mulberry32(hash32(`${codigo}|${procId}`));
  for (let i = ord.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
  return ord.slice(0, n).sort((a, b) => a.nome.localeCompare(b.nome));
}

// Populações derivadas da base de funcionários
export function populacao(fonte, base, comp) {
  const { ini, fim } = limitesCompetencia(comp);
  const dentro = d => d && d >= ini && d <= fim;
  const ativo = f => f.adm <= fim && (!f.dem || f.dem >= ini);
  const somaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  switch (fonte) {
    case 'ativos': return base.filter(ativo);
    case 'admitidos': return base.filter(f => dentro(f.adm));
    case 'demitidos': return base.filter(f => dentro(f.dem));
    case 'experiencia': return base.filter(f => ativo(f) && (dentro(somaDias(f.adm, 44)) || dentro(somaDias(f.adm, 89))));
    case 'menores': return base.filter(f => {
      if (!ativo(f)) return false;
      if (/aprendiz/i.test(f.cargo)) return true;
      if (!f.nasc) return false;
      const fez18 = new Date(f.nasc.getFullYear() + 18, f.nasc.getMonth(), f.nasc.getDate());
      return fez18 > ini; // menor em algum dia da competência
    });
    default: return [];
  }
}
