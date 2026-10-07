// Camada de dados: Firebase (produção) ou memória/navegador (modo demonstração).
// As duas implementações têm a mesma interface.

const agora = () => new Date().toISOString();

// ======================= FIREBASE =======================
async function backendFirebase(cfg) {
  const V = '10.12.2';
  const appM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const authM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const fsM = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const { initializeApp, deleteApp } = appM;
  const { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, createUserWithEmailAndPassword } = authM;
  const { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, FieldPath, arrayUnion, deleteDoc } = fsM;

  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let uidAtual = null;

  return {
    modo: 'firebase',
    onAuth(cb) { onAuthStateChanged(auth, u => { uidAtual = u?.uid || null; cb(u ? { uid: u.uid, email: u.email } : null); }); },
    login: (email, senha) => signInWithEmailAndPassword(auth, email, senha),
    logout: () => signOut(auth),
    resetSenha: email => sendPasswordResetEmail(auth, email),

    async perfil(uid) { const s = await getDoc(doc(db, 'usuarios', uid)); return s.exists() ? { uid, ...s.data() } : null; },
    async listarUsuarios() { const s = await getDocs(collection(db, 'usuarios')); return s.docs.map(d => ({ uid: d.id, ...d.data() })); },
    async criarUsuario({ nome, email, senha, perfil, areas }) {
      // App secundário: cria o login sem derrubar a sessão do administrador
      const sec = initializeApp(cfg, 'sec-' + Date.now());
      try {
        const a2 = getAuth(sec);
        const cred = await createUserWithEmailAndPassword(a2, email, senha);
        await signOut(a2);
        await setDoc(doc(db, 'usuarios', cred.user.uid), { nome, email, perfil, areas, ativo: true, criadoEm: agora(), criadoPor: uidAtual });
        return cred.user.uid;
      } finally { await deleteApp(sec); }
    },
    atualizarUsuario: (uid, dados) => updateDoc(doc(db, 'usuarios', uid), { ...dados, alteradoEm: agora(), alteradoPor: uidAtual }),

    async lerConfig() { const s = await getDoc(doc(db, 'config', 'processos')); return s.exists() ? { lista: s.data().lista, versao: s.data().versao || 1 } : null; },
    salvarConfig: (lista, versao) => setDoc(doc(db, 'config', 'processos'), { lista, versao, alteradoEm: agora(), alteradoPor: uidAtual }),

    async listarAuditorias() { const s = await getDocs(collection(db, 'auditorias')); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
    async lerAuditoria(mes) { const s = await getDoc(doc(db, 'auditorias', mes)); return s.exists() ? { id: mes, ...s.data() } : null; },
    salvarAuditoria: (mes, dados) => setDoc(doc(db, 'auditorias', mes), dados, { merge: true }),
    registrarLog: (mes, evento) => updateDoc(doc(db, 'auditorias', mes), { log: arrayUnion({ ...evento, em: agora() }) }),
    salvarBase: (mes, pessoas, desligados) => setDoc(doc(db, 'auditorias', mes, 'base', 'funcionarios'), { pessoas, desligados }),
    async lerBase(mes) { const s = await getDoc(doc(db, 'auditorias', mes, 'base', 'funcionarios')); return s.exists() ? s.data() : null; },

    async listarAmostras(mes, areas) {
      const col = collection(db, 'auditorias', mes, 'amostras');
      if (!areas) { const s = await getDocs(col); return s.docs.map(d => d.data()); }
      const out = [];
      for (const a of areas) { const s = await getDocs(query(col, where('area', '==', a))); out.push(...s.docs.map(d => d.data())); }
      return out;
    },
    async lerAmostra(mes, procId) { const s = await getDoc(doc(db, 'auditorias', mes, 'amostras', procId)); return s.exists() ? s.data() : null; },
    salvarAmostra: (mes, procId, dados) => setDoc(doc(db, 'auditorias', mes, 'amostras', procId), dados),
    excluirAmostra: (mes, procId) => deleteDoc(doc(db, 'auditorias', mes, 'amostras', procId)),
    responder: (mes, procId, pk, idx, valor) =>
      updateDoc(doc(db, 'auditorias', mes, 'amostras', procId), new FieldPath('respostas', pk, String(idx)), valor),
  };
}

// ======================= DEMONSTRAÇÃO =======================
function backendDemo() {
  const CH = 'auditoria-raguife-demo';
  let st;
  try { st = JSON.parse(localStorage.getItem(CH) || 'null'); } catch { st = null; }
  if (!st) st = {
    usuarios: { admin: { nome: 'Administrador (demo)', email: 'admin@demo', senha: 'demo123', perfil: 'admin', areas: ['dp', 'sst', 'amb', 'rh'], ativo: true } },
    config: null, auditorias: {}, amostras: {}, base: {},
  };
  const salvar = () => { try { localStorage.setItem(CH, JSON.stringify(st)); } catch { /* sem armazenamento: fica em memória */ } };
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
  let cbAuth = () => {};
  let sessao = null;
  try { sessao = JSON.parse(sessionStorage.getItem(CH + '-sessao') || 'null'); } catch { }
  const setSessao = s => { sessao = s; try { sessionStorage.setItem(CH + '-sessao', JSON.stringify(s)); } catch { } cbAuth(s); };
  const espera = () => new Promise(r => setTimeout(r, 60));

  return {
    modo: 'demo',
    onAuth(cb) { cbAuth = cb; setTimeout(() => cb(sessao), 0); },
    async login(email, senha) {
      await espera();
      const e = Object.entries(st.usuarios).find(([, u]) => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!e || e[1].senha !== senha) { const err = new Error('Login inválido'); err.code = 'auth/invalid-credential'; throw err; }
      setSessao({ uid: e[0], email: e[1].email });
    },
    async logout() { setSessao(null); },
    async resetSenha() { await espera(); },
    async perfil(uid) { const u = st.usuarios[uid]; if (!u) return null; const { senha, ...r } = u; return { uid, ...clone(r) }; },
    async listarUsuarios() { return Object.entries(st.usuarios).map(([uid, u]) => { const { senha, ...r } = u; return { uid, ...clone(r) }; }); },
    async criarUsuario({ nome, email, senha, perfil, areas }) {
      if (Object.values(st.usuarios).some(u => u.email.toLowerCase() === email.toLowerCase())) { const e = new Error('E-mail já cadastrado'); e.code = 'auth/email-already-in-use'; throw e; }
      const uid = 'u' + Date.now(); st.usuarios[uid] = { nome, email, senha, perfil, areas, ativo: true, criadoEm: agora() }; salvar(); return uid;
    },
    async atualizarUsuario(uid, dados) { Object.assign(st.usuarios[uid], clone(dados)); salvar(); },
    async lerConfig() { return st.config ? clone(st.config.lista ? st.config : { lista: st.config, versao: 1 }) : null; },
    async salvarConfig(lista, versao) { st.config = clone({ lista, versao }); salvar(); },
    async listarAuditorias() { return Object.entries(st.auditorias).map(([id, a]) => ({ id, ...clone(a) })); },
    async lerAuditoria(mes) { return st.auditorias[mes] ? { id: mes, ...clone(st.auditorias[mes]) } : null; },
    async salvarAuditoria(mes, dados) { st.auditorias[mes] = { ...(st.auditorias[mes] || {}), ...clone(dados) }; salvar(); },
    async registrarLog(mes, ev) { const a = st.auditorias[mes]; a.log = [...(a.log || []), { ...ev, em: agora() }]; salvar(); },
    async salvarBase(mes, pessoas, desligados) { st.base[mes] = clone({ pessoas, desligados }); salvar(); },
    async lerBase(mes) { return clone(st.base[mes] || null); },
    async listarAmostras(mes, areas) { const t = Object.values(st.amostras[mes] || {}); return clone(areas ? t.filter(x => areas.includes(x.area)) : t); },
    async lerAmostra(mes, p) { return clone(st.amostras[mes]?.[p] || null); },
    async salvarAmostra(mes, p, dados) { (st.amostras[mes] ||= {})[p] = clone(dados); salvar(); },
    async excluirAmostra(mes, p) { delete st.amostras[mes]?.[p]; salvar(); },
    async responder(mes, p, pk, idx, valor) { await espera(); const a = st.amostras[mes][p]; ((a.respostas ||= {})[pk] ||= {})[idx] = clone(valor); salvar(); },
  };
}

export async function criarBackend(cfg) {
  return cfg && cfg.apiKey ? backendFirebase(cfg) : backendDemo();
}
