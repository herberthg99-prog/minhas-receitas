// Safe toast - works even if app-core not loaded yet
function _safeToast(msg, dur) {
  if (typeof toast === 'function') { toast(msg, dur); return; }
  var t = document.getElementById('toast');
  if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); }, dur||2400); }
}
// app-features.js — Login, estoque, pedidos, configurações
// ⛔ ZONA CRÍTICA: não editar funções de login sem cuidado

// ═══════════════════════════════════════════
// LOGIN / USUÁRIOS
// ═══════════════════════════════════════════
var ADMIN_PWD_KEY  = 'mr_admin_pwd';
var GUEST_PWD_KEY  = 'mr_guest_pwd';
var SESSION_KEY    = 'mr_session';
var SESSION_ROLE   = 'mr_role';

var currentLoginRole = 'admin';

function getAdminPwd() { return localStorage.getItem(ADMIN_PWD_KEY) || ''; }
function getGuestPwd() { return localStorage.getItem(GUEST_PWD_KEY) || ''; }
function setAdminPwd(p) { localStorage.setItem(ADMIN_PWD_KEY, p); }
function setGuestPwd(p) { localStorage.setItem(GUEST_PWD_KEY, p); }
function isLoggedIn() { return localStorage.getItem(SESSION_KEY) === 'ok'; }
function getCurrentRole() { return localStorage.getItem(SESSION_ROLE) || 'admin'; }
function setSession(role) {
  localStorage.setItem(SESSION_KEY, 'ok');
  localStorage.setItem(SESSION_ROLE, role);
}
function isGuest() { return getCurrentRole() === 'guest'; }

function toggleLoginPwd() {
  const inp = document.getElementById('login-pwd');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
function toggleLoginPwd2() {
  const inp = document.getElementById('login-pwd2');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function selectUser(role) {
  currentLoginRole = role;
  const adminBtn = document.getElementById('btn-user-admin');
  const guestBtn = document.getElementById('btn-user-guest');
  const label    = document.getElementById('login-user-label');
  const hint     = document.getElementById('login-hint');
  const err      = document.getElementById('login-err');
  const loginBtn = document.getElementById('login-btn-label');
  const setup    = document.getElementById('login-setup-box');
  const confirm  = document.getElementById('confirm-pwd-box');
  const forgot   = document.getElementById('login-forgot');

  document.getElementById('login-pwd').value = '';
  err.textContent = '';

  function setLoginBtnText(txt) {
    loginBtn.innerHTML = txt + ' <i class="ti ti-arrow-right"></i>';
  }

  if (role === 'admin') {
    adminBtn.classList.add('act'); guestBtn.classList.remove('act');
    label.textContent = 'Senha do Administrador';
    hint.textContent = 'Acesso completo ao app de receitas';

    const hasPwd = !!getAdminPwd();
    setup.style.display = hasPwd ? 'none' : 'block';
    confirm.style.display = hasPwd ? 'none' : 'block';
    setLoginBtnText(hasPwd ? 'Entrar como Admin' : 'Criar senha e entrar');
    forgot.style.display = hasPwd ? 'inline-block' : 'none';
    if (!hasPwd) {
      hint.textContent = 'Se já tem senha em outro dispositivo, digite ela aqui.';
      setup.innerHTML = '<p>👋 Primeira vez neste dispositivo?</p><span style="font-size:12px;color:var(--text2)">Se já criou senha em outro dispositivo, basta digitar ela. Se for a primeira vez, crie uma senha nova.</span>';
      confirm.style.display = 'none';
      setLoginBtnText('Entrar / Criar senha');
    }
  } else {
    guestBtn.classList.add('act'); adminBtn.classList.remove('act');
    label.textContent = 'Senha de Convidado';
    hint.textContent = 'Acesso apenas às receitas compartilhadas';
    setup.style.display = 'none';
    confirm.style.display = 'none';
    setLoginBtnText('Entrar como Convidado');
    forgot.style.display = 'none';

    if (!getGuestPwd()) {
      err.textContent = 'Nenhuma senha de convidado definida ainda.';
    }
  }
}

function revelarApp() {
  document.getElementById('app').style.display = 'flex';
  document.getElementById('login-overlay').style.display = 'none';
}

async function doLogin() {
  const pwd = document.getElementById('login-pwd').value;
  const err = document.getElementById('login-err');
  if (!pwd) { err.textContent = 'Digite a senha'; return; }

  if (currentLoginRole === 'admin') {
    const loginBtn = document.getElementById('login-btn-label');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verificando...';

    try {
      const { data: cfgs } = await sb.from('config')
        .select('share_pwd, admin_pwd')
        .eq('user_id', USER_ID)
        .limit(1);

      let cloudPwd = '';
      if (cfgs && cfgs.length > 0) {
        const row = cfgs[0];
        if (row.admin_pwd) {
          cloudPwd = row.admin_pwd;
        } else if (row.share_pwd && row.share_pwd.startsWith('adm:')) {
          cloudPwd = row.share_pwd.slice(4);
        }
      }
      const localPwd = getAdminPwd();
      const hasPwd = !!(cloudPwd || localPwd);

      if (!hasPwd) {
        const pwd2 = document.getElementById('login-pwd2').value;
        if (!pwd2) { err.textContent = 'Confirme a senha'; loginBtn.disabled=false; loginBtn.textContent='Criar senha e entrar'; return; }
        if (pwd !== pwd2) { err.textContent = 'As senhas não conferem'; loginBtn.disabled=false; loginBtn.textContent='Criar senha e entrar'; return; }
        if (pwd.length < 4) { err.textContent = 'Mínimo 4 caracteres'; loginBtn.disabled=false; loginBtn.textContent='Criar senha e entrar'; return; }
        setAdminPwd(pwd);
        try {
          await sb.from('config').upsert({ user_id: USER_ID, admin_pwd: pwd }, { onConflict: 'user_id' });
        } catch(e2) {
          await sb.from('config').upsert({ user_id: USER_ID, share_pwd: 'adm:' + pwd }, { onConflict: 'user_id' });
        }
        setSession('admin');
        revelarApp();
        _safeToast('Senha criada! Bem-vindo, Administrador!');
        return;
      }

      const matched = (cloudPwd && pwd === cloudPwd) || (localPwd && pwd === localPwd);
      if (!matched) {
        err.textContent = 'Senha incorreta';
        shakeLoginBox();
        document.getElementById('login-pwd').value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar como Admin';
        return;
      }

      if (cloudPwd && cloudPwd !== localPwd) setAdminPwd(cloudPwd);
      if (localPwd && !cloudPwd) {
        try {
          await sb.from('config').upsert({ user_id: USER_ID, admin_pwd: localPwd }, { onConflict: 'user_id' });
        } catch(e2) {
          await sb.from('config').upsert({ user_id: USER_ID, share_pwd: 'adm:' + localPwd }, { onConflict: 'user_id' });
        }
      }

      setSession('admin');
      revelarApp();
      _safeToast('Bem-vindo, Administrador!');
    } catch(e) {
      const localPwd = getAdminPwd();
      if (!localPwd) {
        err.textContent = 'Sem conexão. Tente novamente.';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar como Admin';
        return;
      }
      if (pwd !== localPwd) {
        err.textContent = 'Senha incorreta';
        shakeLoginBox();
        document.getElementById('login-pwd').value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar como Admin';
        return;
      }
      setSession('admin');
      revelarApp();
      _safeToast('Bem-vindo! (modo offline)');
    }
  } else {
    const loginBtn = document.getElementById('login-btn-label');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verificando...';
    try {
      const { data: configs, error: cfgErr } = await sb.from('config').select('share_pwd').not('share_pwd', 'is', null).neq('share_pwd', '');
      if(cfgErr) throw cfgErr;
      let matched = false;
      if (configs && configs.length > 0) {
        matched = configs.some(c => c.share_pwd === pwd);
      }
      if (!matched) {
        const localPwd = getGuestPwd();
        matched = localPwd && pwd === localPwd;
      }
      if (!matched) {
        err.textContent = 'Senha incorreta';
        shakeLoginBox();
        document.getElementById('login-pwd').value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar como Convidado';
        return;
      }
      setSession('guest');
      revelarApp();
      await loadFromCloud();
      enterGuestMode();
      _safeToast('Bem-vindo, Convidado!');
    } catch(e) {
      const localPwd = getGuestPwd();
      if (!localPwd) { err.textContent = 'Sem conexão e sem senha local.'; loginBtn.disabled=false; loginBtn.textContent='Entrar como Convidado'; return; }
      if (pwd !== localPwd) { err.textContent = 'Senha incorreta'; shakeLoginBox(); document.getElementById('login-pwd').value=''; loginBtn.disabled=false; loginBtn.textContent='Entrar como Convidado'; return; }
      setSession('guest');
      revelarApp();
      enterGuestMode();
      _safeToast('Bem-vindo, Convidado!');
    }
  }
}

function doLogout() {
  var role = getCurrentRole();
  var msg = role === 'guest' ? 'Sair do modo convidado?' : 'Sair do app?';
  if (!confirm(msg)) return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_ROLE);
  localStorage.removeItem('mr_session');
  window.location.href = window.location.href.split('?')[0] + '?logout=' + Date.now();
}

function shakeLoginBox() {
  const box = document.querySelector('.login-box');
  box.style.animation = 'shake .4s';
  setTimeout(() => box.style.animation = '', 400);
}

async function forgotPwd() {
  const ok = confirm('Isso vai redefinir a senha de administrador em TODOS os dispositivos. Continuar?');
  if (!ok) return;
  try {
    await sb.from('config').upsert({ user_id: USER_ID, admin_pwd: null, share_pwd: null }, { onConflict: 'user_id' });
  } catch(e) {}
  localStorage.removeItem(ADMIN_PWD_KEY);
  localStorage.removeItem('mr_user_id');
  localStorage.removeItem('mr_v4_recipes');
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_ROLE);
  location.reload();
}

function enterGuestMode() {
  var hideIds = ['nav-nova', 'nav-confeitaria', 'nav-config'];
  hideIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  loadGuestView();
}

function loadGuestView() {
  const sharedIds = shareConfig.sharedIds || [];
  const sharedRecipes = recipes.filter(r => sharedIds.includes(r.id));
  if (!sharedRecipes.length) {
    const page = document.getElementById('page-receitas');
    page.innerHTML = '<div class="est"><i class="ti ti-book"></i><p>Nenhuma receita compartilhada ainda.</p></div>';
  }
  goPage('receitas');
}

// ═══════════════════════════════════════════
// ESTOQUE — fonte única de preço por ingrediente
// ═══════════════════════════════════════════
// A partir desta versão, o preço de um ingrediente vive SÓ aqui (estoque[key].price).
// As receitas não guardam mais preço próprio — getPrecoIngrediente() é sempre a fonte
// usada pelos cálculos de custo (totIC, calcAt, getCustoTotalReceita, etc. em app-core.js).
let estoque = {};

function loadEstoque() {
  try { estoque = JSON.parse(localStorage.getItem('mr_estoque') || '{}'); } catch(e) { estoque = {}; }
}

function saveEstoque() {
  try { localStorage.setItem('mr_estoque', JSON.stringify(estoque)); } catch(e) {}
  saveEstoqueToCloud();
}

async function saveEstoqueToCloud() {
  try {
    await sb.from('config').upsert({
      user_id: USER_ID,
      estoque: JSON.stringify(estoque)
    }, { onConflict: 'user_id' });
  } catch(e) { console.log('saveEstoqueToCloud erro:', e.message); }
}

async function loadEstoqueFromCloud() {
  try {
    const { data } = await sb.from('config').select('estoque').eq('user_id', USER_ID).limit(1);
    if (data && data.length && data[0].estoque) {
      const cloudEstoque = JSON.parse(data[0].estoque);
      // Nuvem é a fonte de verdade entre dispositivos — mas preserva itens locais que
      // ainda não foram sincronizados (ex: criados offline).
      estoque = {...estoque, ...cloudEstoque};
      saveEstoque();
    }
  } catch(e) { console.log('loadEstoqueFromCloud erro:', e.message); }
}

// Normaliza o nome de um ingrediente para a chave usada no Estoque (mesma convenção já
// usada em todo o app: trim + lowercase).
function normalizarChaveIngrediente(nome) {
  return (nome || '').trim().toLowerCase();
}

// Função central de leitura de preço: TODA leitura de preço de ingrediente no app deve
// passar por aqui (em vez de ler ig.price diretamente). Retorna preço por g/ml (mesma
// convenção interna sempre usada: price = R$ por grama/mililitro, não por kg/L).
// Se o ingrediente ainda não tem preço cadastrado no Estoque, retorna 0.
function getPrecoIngrediente(nome) {
  if (!nome) return 0;
  const key = normalizarChaveIngrediente(nome);
  return (estoque[key] && estoque[key].price) ? estoque[key].price : 0;
}

// Verdadeiro se o ingrediente ainda não tem preço cadastrado no Estoque — usado para
// destacar pendências na tela de Estoque e no aviso da Home.
function ingredienteSemPreco(nome) {
  if (!nome) return false;
  const key = normalizarChaveIngrediente(nome);
  return !estoque[key] || !estoque[key].price || estoque[key].price <= 0;
}

// Garante que todo ingrediente usado em qualquer receita já tenha uma entrada no Estoque
// (mesmo sem preço ainda, para aparecer como pendência) e mantém a lista "usedIn"
// atualizada para exibição. Não sobrescreve preços já existentes.
function syncEstoqueFromRecipes() {
  recipes.forEach(r => {
    (r.ingredients || []).forEach(ig => {
      if (!ig.name) return;
      const key = normalizarChaveIngrediente(ig.name);
      if (!estoque[key]) {
        // Migração: se a receita ainda tiver um preço antigo gravado nela (ig.price, de
        // antes desta mudança), usa esse valor como ponto de partida no Estoque — depois
        // disso, o preço da receita nunca mais é lido diretamente.
        estoque[key] = { name: ig.name.trim(), price: ig.price || 0, unit: ig.unit || 'g', updatedAt: ig.price ? new Date().toISOString() : null, usedIn: [] };
      } else {
        estoque[key].name = ig.name.trim();
      }
      if (!estoque[key].usedIn) estoque[key].usedIn = [];
      if (!estoque[key].usedIn.includes(r.name)) estoque[key].usedIn.push(r.name);
    });
  });
  saveEstoque();
}

// Lista de ingredientes que aparecem em pelo menos uma receita e ainda não têm preço no
// Estoque — usada para o card de pendências na Home e o filtro "Sem preço" no Estoque.
function getIngredientesPendentesDePreco() {
  syncEstoqueFromRecipes();
  return Object.keys(estoque)
    .filter(function(k){ return ingredienteSemPreco(k); })
    .map(function(k){ return estoque[k]; })
    .sort(function(a,b){ return (a.usedIn||[]).length - (b.usedIn||[]).length; }).reverse();
}

const PRAZO_VALIDADE_PRECO_DIAS = 45;

function precoVencido(ig) {
  if (!ig.updatedAt) return true; // nunca atualizado conta como vencido também
  const dias = (Date.now() - new Date(ig.updatedAt).getTime()) / (1000*60*60*24);
  return dias > PRAZO_VALIDADE_PRECO_DIAS;
}

function setEstoqueFiltro(f) {
  window._estoqueFiltro = f;
  renderEstoque();
}

// Normaliza removendo acentos, pra detectar duplicados que só diferem por acentuação
// (ex: "Açúcar" vs "Acucar"). Não usada como chave do Estoque (isso quebraria nomes
// diferentes de fato) — só para a comparação de similaridade abaixo.
function removerAcentos(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Distância de Levenshtein simples (número de edições para transformar uma string na
// outra) — usada só para nomes curtos de ingrediente, então o custo computacional é
// desprezível mesmo comparando todos os pares do Estoque.
function distanciaLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({length: m+1}, () => new Array(n+1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// Similaridade entre dois nomes de ingrediente (0 a 1, onde 1 = idênticos), já
// normalizando acentos e espaços para focar em diferenças de digitação reais.
function similaridadeIngredientes(nomeA, nomeB) {
  const a = removerAcentos(normalizarChaveIngrediente(nomeA));
  const b = removerAcentos(normalizarChaveIngrediente(nomeB));
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return 1 - (distanciaLevenshtein(a, b) / maxLen);
}

const LIMIAR_DUPLICADO = 0.82; // acima disso, consideramos "provável duplicado"

// Procura no Estoque já existente algum ingrediente muito parecido com o nome informado
// (e que NÃO seja o próprio item, no caso de já existir exatamente). Usada antes de criar
// uma entrada nova, para avisar e evitar duplicidade (ex: "Açucar" quando já existe "Açúcar").
function buscarPossivelDuplicado(nome) {
  const keyNovo = normalizarChaveIngrediente(nome);
  if (estoque[keyNovo]) return null; // já existe exatamente — não é duplicado, é o mesmo item
  let melhor = null, melhorScore = 0;
  Object.keys(estoque).forEach(function(key){
    const score = similaridadeIngredientes(estoque[key].name, nome);
    if (score > melhorScore) { melhorScore = score; melhor = estoque[key]; }
  });
  return (melhor && melhorScore >= LIMIAR_DUPLICADO) ? { item: melhor, score: melhorScore } : null;
}

// Varre TODO o Estoque procurando pares de itens parecidos entre si (não com um nome
// novo) — usado para mostrar um aviso geral na tela de Estoque sobre duplicados que já
// possam existir, mesmo sem nenhuma ação do usuário no momento.
function encontrarDuplicadosNoEstoque() {
  const keys = Object.keys(estoque);
  const pares = [];
  const jaPareados = new Set();
  for (let i = 0; i < keys.length; i++) {
    if (jaPareados.has(keys[i])) continue;
    for (let j = i+1; j < keys.length; j++) {
      if (jaPareados.has(keys[j])) continue;
      const score = similaridadeIngredientes(estoque[keys[i]].name, estoque[keys[j]].name);
      if (score >= LIMIAR_DUPLICADO) {
        pares.push({ a: estoque[keys[i]], b: estoque[keys[j]], keyA: keys[i], keyB: keys[j], score: score });
        jaPareados.add(keys[i]); jaPareados.add(keys[j]);
        break;
      }
    }
  }
  return pares;
}

// Funde o ingrediente "origem" dentro do ingrediente "destino": todas as receitas que
// citam o nome de origem passam a citar o nome de destino, o item de origem é removido do
// Estoque, e o preço do destino é preservado (a menos que esteja vazio e a origem tenha
// preço, caso em que herda o preço da origem).
async function fundirIngredientesDuplicados(keyOrigem, keyDestino) {
  if (keyOrigem === keyDestino) return;
  const origem = estoque[keyOrigem], destino = estoque[keyDestino];
  if (!origem || !destino) return;
  if ((!destino.price || destino.price <= 0) && origem.price > 0) {
    destino.price = origem.price;
    destino.updatedAt = origem.updatedAt;
  }
  // Atualiza o nome dentro de cada receita que usa o nome antigo
  recipes.forEach(function(r){
    (r.ingredients||[]).forEach(function(ig){
      if (ig.name && normalizarChaveIngrediente(ig.name) === keyOrigem) ig.name = destino.name;
    });
  });
  // Persiste as receitas alteradas
  const afetadas = recipes.filter(function(r){
    return (r.ingredients||[]).some(function(ig){ return ig.name === destino.name; });
  });
  await Promise.all(afetadas.map(function(r){ return typeof saveToCloud === 'function' ? saveToCloud(r) : Promise.resolve(); }));
  destino.usedIn = Array.from(new Set([...(destino.usedIn||[]), ...(origem.usedIn||[])]));
  delete estoque[keyOrigem];
  saveEstoque();
  renderEstoque();
  toast('✅ "' + origem.name + '" mesclado com "' + destino.name + '"!');
}

function renderEstoque() {
  syncEstoqueFromRecipes();
  const el = document.getElementById('page-estoque');
  const allKeys = Object.keys(estoque).sort((a,b) => a.localeCompare(b));
  const total = allKeys.length;
  const semPreco = allKeys.filter(k => !estoque[k].price || estoque[k].price === 0);
  const vencidos = allKeys.filter(k => (estoque[k].price && estoque[k].price > 0) && precoVencido(estoque[k]));
  const duplicados = encontrarDuplicadosNoEstoque();

  const filtro = window._estoqueFiltro || 'todos';
  const keys = filtro === 'sem_preco' ? semPreco : (filtro === 'vencido' ? vencidos : allKeys);

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:16px;font-weight:700">${total} ingrediente(s)</div>
        <div style="font-size:12px;color:var(--text2)">${semPreco.length} sem preço · ${vencidos.length} com preço vencido (45+ dias) · <span id="sel-count">0</span> selecionado(s)</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btng" id="btn-upd-estoque" onclick="atualizarEstoqueIASelecionados()" style="font-size:12px;padding:8px 12px">
          <i class="ti ti-refresh"></i> Atualizar selecionados (IA)
        </button>
        <button class="btns" onclick="addEstoqueManual()" style="font-size:12px;padding:8px 12px">
          <i class="ti ti-plus"></i> Adicionar
        </button>
      </div>
    </div>
    ${duplicados.length ? `<div class="warn-box" style="margin-bottom:10px;background:rgba(212,162,74,.1);border-color:rgba(212,162,74,.4)"><i class="ti ti-copy" style="flex-shrink:0;margin-top:1px"></i><span><strong>${duplicados.length} possível(is) duplicado(s) encontrado(s)</strong> — pode ser o mesmo ingrediente escrito de formas diferentes. <button onclick="abrirModalDuplicados()" style="background:none;border:none;color:var(--gold);text-decoration:underline;cursor:pointer;font-family:inherit;font-size:inherit;padding:0">Revisar agora</button></span></div>` : ''}
    ${semPreco.length ? `<div class="warn-box" style="margin-bottom:10px"><i class="ti ti-alert-triangle" style="flex-shrink:0;margin-top:1px"></i><span><strong>${semPreco.length} ingrediente(s) sem preço</strong> — o custo das receitas que os usam está incompleto até você preencher o preço aqui.</span></div>` : ''}
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <button class="rb ${filtro==='todos'?'rb-active':''}" onclick="setEstoqueFiltro('todos')" style="font-size:12px">Todos (${total})</button>
      <button class="rb ${filtro==='sem_preco'?'rb-active':''}" onclick="setEstoqueFiltro('sem_preco')" style="font-size:12px;${semPreco.length?'color:#c0392b':''}"><i class="ti ti-alert-circle"></i> Sem preço (${semPreco.length})</button>
      <button class="rb ${filtro==='vencido'?'rb-active':''}" onclick="setEstoqueFiltro('vencido')" style="font-size:12px;${vencidos.length?'color:#c0392b':''}"><i class="ti ti-clock-exclamation"></i> Vencidos 45+ dias (${vencidos.length})</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <button class="rb" onclick="toggleSelectAll(true)" style="font-size:12px"><i class="ti ti-checkbox"></i> Selecionar todos (filtro atual)</button>
      <button class="rb" onclick="toggleSelectAll(false)" style="font-size:12px"><i class="ti ti-square"></i> Desmarcar todos</button>
    </div>
    <div id="ai-estoque-bar" class="ai-bar" style="display:none"><div class="ai-dot pulse"></div><span id="ai-estoque-msg">Buscando preços no ES...</span></div>
    ${!keys.length ? '<div class="est"><i class="ti ti-package"></i><p>' + (filtro==='todos' ? 'Nenhum ingrediente ainda.' : 'Nenhum item neste filtro. 🎉') + '</p></div>' :
      keys.map(k => renderEstoqueItem(k)).join('')
    }`;
}

function renderEstoqueItem(key) {
  const ig = estoque[key];
  const priceKg = ig.price ? (ig.price * 1000).toFixed(2) : '';
  const updStr = ig.updatedAt ? new Date(ig.updatedAt).toLocaleDateString('pt-BR') : null;
  const vencido = (ig.price && ig.price > 0) && precoVencido(ig);
  const semPreco = !ig.price || ig.price <= 0;
  let estoqueSelected = window._estoqueSelected || new Set();
  window._estoqueSelected = estoqueSelected;
  const isChecked = estoqueSelected.has(key);
  return `<div class="estoque-item" id="est-item-${key.replace(/[^a-z0-9]/g,'_')}" style="${isChecked?'border-color:var(--gold);border-width:2px':(semPreco?'border-color:rgba(192,57,43,.4)':'')}">
    <div class="estoque-item-header">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <input type="checkbox" ${isChecked?'checked':''} onchange="toggleEstoqueSelect('${key}',this.checked)"
          style="width:18px;height:18px;accent-color:var(--gold);margin-top:2px;flex-shrink:0;cursor:pointer">
        <div>
          <div class="estoque-item-name">${ig.name}</div>
          <div class="estoque-item-meta">
            <span>${ig.unit || 'g'}</span>
            ${updStr ? `<span><i class="ti ti-clock" style="font-size:10px"></i> ${updStr}</span>` : '<span class="estoque-badge-new">Sem atualização</span>'}
            ${vencido ? `<span class="estoque-badge" style="background:rgba(192,57,43,.15);color:#c0392b;border-color:rgba(192,57,43,.4)"><i class="ti ti-clock-exclamation" style="font-size:10px"></i> Vencido (45+ dias)</span>` : ''}
            ${semPreco ? `<span class="estoque-badge" style="background:rgba(192,57,43,.2);color:#e74c3c;border-color:rgba(192,57,43,.5)"><i class="ti ti-alert-circle" style="font-size:10px"></i> Pendente</span>` : ''}
            ${ig.usedIn && ig.usedIn.length ? `<span class="estoque-badge">${ig.usedIn.length} receita(s)</span>` : ''}
          </div>
          ${ig.usedIn && ig.usedIn.length ? `<div class="estoque-item-recipes"><i class="ti ti-book" style="font-size:10px"></i> ${ig.usedIn.slice(0,3).join(', ')}${ig.usedIn.length > 3 ? '...' : ''}</div>` : ''}
        </div>
      </div>
      <div class="estoque-item-price">${ig.price > 0 ? 'R$ ' + (ig.price * 1000).toFixed(2) + '/kg' : '—'}</div>
    </div>
    <div class="estoque-edit-row">
      <input type="number" value="${priceKg}" placeholder="Preço por kg (R$)" min="0" step="0.01"
        onchange="updateEstoquePrice('${key}', parseFloat(this.value)||0)"
        onblur="updateEstoquePrice('${key}', parseFloat(this.value)||0)"
        onkeydown="if(event.key==='Enter'){updateEstoquePrice('${key}', parseFloat(this.value)||0);this.blur()}">
      <select onchange="updateEstoqueUnit('${key}', this.value)">
        <option value="g" ${ig.unit==='g'?'selected':''}>g</option>
        <option value="kg" ${ig.unit==='kg'?'selected':''}>kg</option>
        <option value="ml" ${ig.unit==='ml'?'selected':''}>ml</option>
        <option value="L" ${ig.unit==='L'?'selected':''}>L</option>
        <option value="un" ${ig.unit==='un'?'selected':''}>un</option>
      </select>
      <button class="db" onclick="removeEstoque('${key}')" title="Remover"><i class="ti ti-trash"></i></button>
    </div>
  </div>`;
}

// Atualiza o preço de um ingrediente no Estoque — única fonte de verdade. As receitas não
// guardam mais preço próprio, então não há nada para "empurrar" para elas: a próxima vez
// que qualquer cálculo de custo rodar (calcAt, getCustoTotalReceita, etc.), ele já lê o
// valor novo direto daqui via getPrecoIngrediente().
function updateEstoquePrice(key, priceKg) {
  if (!estoque[key]) return;
  estoque[key].price = priceKg / 1000;
  estoque[key].updatedAt = new Date().toISOString();
  saveEstoque();
  const itemEl = document.getElementById('est-item-' + key.replace(/[^a-z0-9]/g,'_'));
  if (itemEl) itemEl.outerHTML = renderEstoqueItem(key);
  // Se a tela de Receitas (lista ou visualização) estiver aberta, re-renderiza para
  // refletir o novo custo imediatamente, sem precisar recarregar a página.
  if (typeof renderRecipes === 'function' && document.getElementById('page-receitas')?.classList.contains('act')) renderRecipes();
  if (typeof renderHome === 'function' && document.getElementById('page-home')?.classList.contains('act')) renderHome();
  toast('✅ Preço atualizado! Todas as receitas que usam este ingrediente já refletem o novo valor.');
}

function updateEstoqueUnit(key, unit) {
  if (!estoque[key]) return;
  estoque[key].unit = unit;
  saveEstoque();
}

function removeEstoque(key) {
  if (!confirm('Remover ' + estoque[key].name + ' do estoque?')) return;
  delete estoque[key];
  saveEstoque();
  renderEstoque();
}

function addEstoqueManual() {
  const nome = prompt('Nome do ingrediente:');
  if (!nome || !nome.trim()) return;
  const key = nome.trim().toLowerCase();
  if (estoque[key]) { toast('Ingrediente já existe no estoque!'); return; }
  const possivelDuplicado = buscarPossivelDuplicado(nome);
  if (possivelDuplicado) {
    const confirmar = confirm(
      'Já existe "' + possivelDuplicado.item.name + '" no Estoque, bem parecido com "' + nome.trim() + '".\n\n' +
      'Pode ser o mesmo ingrediente escrito de forma diferente.\n\n' +
      'Clique OK para criar mesmo assim como item separado, ou Cancelar para não criar.'
    );
    if (!confirmar) return;
  }
  estoque[key] = { name: nome.trim(), price: 0, unit: 'g', updatedAt: null, usedIn: [] };
  saveEstoque();
  renderEstoque();
  toast('Ingrediente adicionado!');
}

// ═══ MODAL: revisar e mesclar possíveis duplicados do Estoque ═══
function abrirModalDuplicados() {
  const pares = encontrarDuplicadosNoEstoque();
  document.getElementById('modal-item-titulo').textContent = 'Possíveis ingredientes duplicados';
  if (!pares.length) {
    document.getElementById('modal-item-campos').innerHTML = '<div style="font-size:13px;color:var(--text2)">Nenhum duplicado encontrado. 🎉</div>';
  } else {
    let html = '<div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.5">Estes pares parecem ser o mesmo ingrediente escrito de formas diferentes. Escolha qual nome manter — o outro será removido e suas receitas passam a usar o nome escolhido.</div>';
    pares.forEach(function(par, i){
      html += '<div style="background:var(--bg);border-radius:10px;padding:12px;margin-bottom:10px">'
        + '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">' + Math.round(par.score*100) + '% parecidos</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px">'
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px;border-radius:8px;background:rgba(255,255,255,.03)">'
          + '<input type="radio" name="dup-escolha-' + i + '" value="a" checked style="width:16px;height:16px">'
          + '<span style="font-size:13px;color:#F5EDD8">Manter <strong>"' + par.a.name + '"</strong>' + (par.a.price ? ' (R$ ' + (par.a.price*1000).toFixed(2) + '/kg)' : ' (sem preço)') + '</span>'
        + '</label>'
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px;border-radius:8px;background:rgba(255,255,255,.03)">'
          + '<input type="radio" name="dup-escolha-' + i + '" value="b" style="width:16px;height:16px">'
          + '<span style="font-size:13px;color:#F5EDD8">Manter <strong>"' + par.b.name + '"</strong>' + (par.b.price ? ' (R$ ' + (par.b.price*1000).toFixed(2) + '/kg)' : ' (sem preço)') + '</span>'
        + '</label>'
        + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px;border-radius:8px;background:rgba(255,255,255,.03)">'
          + '<input type="radio" name="dup-escolha-' + i + '" value="none" style="width:16px;height:16px">'
          + '<span style="font-size:13px;color:var(--text2)">Não é duplicado — manter os dois separados</span>'
        + '</label>'
        + '</div>'
        + '<input type="hidden" id="dup-keyA-' + i + '" value="' + par.keyA + '">'
        + '<input type="hidden" id="dup-keyB-' + i + '" value="' + par.keyB + '">'
        + '</div>';
    });
    document.getElementById('modal-item-campos').innerHTML = html;
  }
  document.getElementById('modal-item-btn-confirmar').textContent = pares.length ? 'Aplicar' : 'Fechar';
  document.getElementById('modal-item-btn-confirmar').onclick = async function() {
    if (!pares.length) { fecharModalItemCardapio(); return; }
    for (let i = 0; i < pares.length; i++) {
      const escolha = document.querySelector('input[name="dup-escolha-' + i + '"]:checked')?.value;
      if (escolha === 'none') continue;
      const keyA = document.getElementById('dup-keyA-' + i).value;
      const keyB = document.getElementById('dup-keyB-' + i).value;
      if (escolha === 'a') await fundirIngredientesDuplicados(keyB, keyA);
      else if (escolha === 'b') await fundirIngredientesDuplicados(keyA, keyB);
    }
    fecharModalItemCardapio();
    renderEstoque();
  };
  document.getElementById('modal-item-cardapio').style.display = 'flex';
}

loadEstoque();

// ═══════════════════════════════════════════
// CONFEITARIA — AGENDA DE PEDIDOS
// ═══════════════════════════════════════════
let pedidos = [];
try { pedidos = JSON.parse(localStorage.getItem('mr_pedidos') || '[]'); } catch(e) {}
let editPedidoId = null, curPedido = {};

function savePedidos() {
  try { localStorage.setItem('mr_pedidos', JSON.stringify(pedidos)); } catch(e) {}
}

const ARO_PRICES = { 10: 80, 15: 120, 20: 180, 25: 250, 30: 350 };
const ARO_INFO = {
  10: '~6 fatias · ideal para mini bolos',
  15: '~12 fatias · perfeito para pequenas celebrações',
  20: '~20 fatias · o mais pedido para festas',
  25: '~30 fatias · festas médias e grandes',
  30: '~40 fatias · festas grandes e casamentos'
};

async function savePedidoToCloud(pedido) {
  try {
    const uid = (USER_ID||'herberth_admin').trim();
    await sb.from('pedidos_confeitaria').upsert({
      id: pedido.id, user_id: uid, cliente: pedido.cliente, telefone: pedido.telefone,
      data: pedido.data || null, hora: pedido.hora || null, retira: pedido.retira,
      endereco: pedido.endereco || null, aro: pedido.aro, massa: pedido.massa,
      recheio1: pedido.recheio1 || null, recheio2: pedido.recheio2 || null,
      cobertura: pedido.cobertura, deco: pedido.deco, tema: pedido.tema || null,
      topo: pedido.topo || false, flores: pedido.flores || false,
      obs_deco: pedido.obsDeco || null, inspi_photo: pedido.inspiPhoto || null,
      valor_bolo: pedido.valorBolo || 0, valor_total: pedido.valorTotal || 0,
      sinal: pedido.sinal || 0, pagamento: pedido.pagamento || null,
      status: pedido.status || 'pendente', origem: pedido.origem || 'manual'
    }, {onConflict: 'id'});
  } catch(e) { console.log('Save pedido cloud error:', e.message); }
}

async function updatePedidoStatusCloud(id, status) {
  try { await sb.from('pedidos_confeitaria').update({status}).eq('id', id); } catch(e) {}
}

function renderConfeitaria() {
  const el = document.getElementById('page-confeitaria');
  loadPedidosFromCloud().then(() => { _renderConfeitariaUI(); });
  _renderConfeitariaUI();
}

function calcMetricasConf() {
  const hoje = new Date();
  const mes = pedidos.filter(p => {
    if (!p.data) return false;
    const d = new Date(p.data + 'T12:00:00');
    return d.getMonth()===hoje.getMonth() && d.getFullYear()===hoje.getFullYear() && p.status!=='cancelado';
  });
  const totalVendas = mes.reduce((a,p)=>a+(parseFloat(p.valorTotal)||0),0);
  const custoEst = mes.reduce((a,p)=>a+(parseFloat(p.custoEstimado||0)||(parseFloat(p.valorBolo||0)*0.35)),0);
  const lucroEst = totalVendas - custoEst;
  const recebido = mes.reduce((a,p)=>a+(parseFloat(p.sinal)||0),0);
  const aReceber = mes.reduce((a,p)=>{
    if(p.status==='entregue') return a;
    return a+Math.max(0,(parseFloat(p.valorTotal)||0)-(parseFloat(p.sinal)||0));
  },0);
  return {totalVendas,custoEst,lucroEst,recebido,aReceber};
}

function _renderConfeitariaUI() {
  const el = document.getElementById('page-confeitaria');
  const m = calcMetricasConf();
  const pendentes = pedidos.filter(p => p.status !== 'entregue' && p.status !== 'cancelado');

  el.innerHTML = `
    <div class="g4" style="margin-bottom:6px">
      <div class="met"><div class="ml">Pedidos ativos</div><div class="mv blue">${pendentes.length}</div></div>
      <div class="met"><div class="ml">Total do mês</div><div class="mv coral">R$${m.totalVendas.toFixed(0)}</div></div>
      <div class="met"><div class="ml">Entregues</div><div class="mv green">${pedidos.filter(p=>p.status==='entregue').length}</div></div>
      <div class="met"><div class="ml">Cancelados</div><div class="mv">${pedidos.filter(p=>p.status==='cancelado').length}</div></div>
    </div>
    <div class="g4" style="margin-bottom:14px">
      <div class="met" style="border-top:2px solid #C8503A44"><div class="ml" style="font-size:10px">💸 Custo est.</div><div class="mv" style="font-size:13px;color:#FF8080">R$${m.custoEst.toFixed(0)}</div></div>
      <div class="met" style="border-top:2px solid #0F6E5644"><div class="ml" style="font-size:10px">📈 Lucro est.</div><div class="mv green" style="font-size:13px">R$${m.lucroEst.toFixed(0)}</div></div>
      <div class="met" style="border-top:2px solid #0F6E5644"><div class="ml" style="font-size:10px">✅ Recebido</div><div class="mv green" style="font-size:13px">R$${m.recebido.toFixed(0)}</div></div>
      <div class="met" style="border-top:2px solid #C8A35B44"><div class="ml" style="font-size:10px">⏳ A receber</div><div class="mv coral" style="font-size:13px">R$${m.aReceber.toFixed(0)}</div></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="st" style="margin-bottom:0"><i class="ti ti-calendar"></i> Agenda de pedidos</div>
      <button class="btnp" onclick="openNovoPedido()" style="padding:8px 14px;font-size:13px"><i class="ti ti-plus"></i> Novo pedido</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
      <button class="pm act" id="filter-todos" onclick="filterPedidos('todos')">Todos</button>
      <button class="pm" id="filter-pendente" onclick="filterPedidos('pendente')">⏳ Pendente</button>
      <button class="pm" id="filter-confirmado" onclick="filterPedidos('confirmado')">✅ Confirmado</button>
      <button class="pm" id="filter-producao" onclick="filterPedidos('producao')">🎂 Produção</button>
      <button class="pm" id="filter-pronto" onclick="filterPedidos('pronto')">🎉 Pronto</button>
      <button class="pm" id="filter-entregue" onclick="filterPedidos('entregue')">✔️ Entregue</button>
    </div>
    <div id="pedidos-list">${renderPedidosList('todos')}</div>`;
}

function renderPedidosList(filter) {
  let list = [...pedidos].sort((a,b) => new Date(a.data) - new Date(b.data));
  if (filter !== 'todos') list = list.filter(p => p.status === filter);
  if (!list.length) return '<div class="est"><i class="ti ti-calendar"></i><p>Nenhum pedido' + (filter!=='todos'?' com este status':' ainda') + '.</p></div>';
  return list.map(p => renderPedidoCard(p)).join('');
}

function filterPedidos(f) {
  document.querySelectorAll('[id^="filter-"]').forEach(b => b.classList.remove('act'));
  document.getElementById('filter-' + f)?.classList.add('act');
  document.getElementById('pedidos-list').innerHTML = renderPedidosList(f);
}

function renderPedidoCard(p) {
  const dataFmt = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const statusLabel = {pendente:'⏳ Pendente',confirmado:'✅ Confirmado',producao:'🎂 Em produção',pronto:'🎉 Pronto',entregue:'✔️ Entregue',cancelado:'❌ Cancelado'}[p.status] || p.status;
  const diasRestantes = p.data ? Math.ceil((new Date(p.data + 'T12:00:00') - new Date()) / (1000*60*60*24)) : null;
  const urgente = diasRestantes !== null && diasRestantes <= 2 && p.status !== 'entregue' && p.status !== 'cancelado';
  return `<div class="pedido-card status-${p.status}" onclick="viewPedido('${p.id}')" style="${urgente?'border:2px solid #C8A35B;':''}">
    ${urgente ? `<div style="position:absolute;top:8px;right:8px;background:var(--gold);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">🔥 ${diasRestantes<=0?'HOJE!':diasRestantes+'d'}</div>` : ''}
    <div style="font-size:15px;font-weight:700;margin-bottom:5px;padding-right:${urgente?60:0}px">${p.cliente || 'Sem nome'}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <span class="status-badge sb-${p.status}">${statusLabel}</span>
      <span style="font-size:12px;color:var(--text2)"><i class="ti ti-calendar" style="font-size:11px"></i> ${dataFmt} ${p.hora ? '· ' + p.hora : ''}</span>
      ${p.retira ? '<span style="font-size:11px;background:var(--teal-light);color:var(--teal);padding:1px 7px;border-radius:20px;font-weight:700">Retira</span>' : '<span style="font-size:11px;background:var(--blue-light);color:var(--blue);padding:1px 7px;border-radius:20px;font-weight:700">Entrego</span>'}
    </div>
    <div style="font-size:12px;color:var(--text2);display:flex;gap:8px;flex-wrap:wrap">
      ${p.aro ? `<span>Aro ${p.aro}</span>` : ''}
      ${p.recheio1 ? `<span>🎂 ${p.recheio1}</span>` : ''}
      ${p.recheio2 ? `<span>+ ${p.recheio2}</span>` : ''}
      ${p.cobertura ? `<span>${p.cobertura==='chantininho'?'🍦 Chantininho':p.cobertura==='buttercream'?'🧁 Buttercream':'✨ '+p.cobertura}</span>` : ''}
      ${p.tema ? `<span>🎨 ${p.tema}</span>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--border)">
      <div style="font-size:15px;font-weight:700;color:var(--gold)">R$ ${parseFloat(p.valorTotal||0).toFixed(2)}</div>
      <div style="font-size:12px;color:var(--teal);font-weight:700">${p.sinal > 0 ? 'Sinal: R$ '+parseFloat(p.sinal).toFixed(2) : ''}</div>
      <div style="display:flex;gap:5px">
        <button class="rb" onclick="event.stopPropagation();openEditPedido('${p.id}')" style="font-size:11px;padding:4px 8px"><i class="ti ti-edit"></i></button>
        <button class="rb" style="font-size:11px;padding:4px 8px;color:#A32D2D" onclick="event.stopPropagation();delPedido('${p.id}')"><i class="ti ti-trash"></i></button>
      </div>
    </div>
  </div>`;
}

function stPedido(n) {
  [0,1,2,3].forEach(i => {
    const el = document.getElementById('pt'+i);
    if(el) el.style.display = i===n?'block':'none';
    const tb = document.querySelectorAll('#modal-pedido .tb')[i];
    if(tb) tb.classList.toggle('act', i===n);
  });
  if(n===3) calcPedidoTotal();
}

function setPedidoRetira(val) {
  curPedido.retira = val;
  const sim = document.getElementById('btn-retira-sim');
  const nao = document.getElementById('btn-retira-nao');
  const addr = document.getElementById('entrega-addr-box');
  if(val) {
    sim.style.borderColor='var(--teal)';sim.style.background='var(--teal-light)';sim.style.color='var(--teal)';
    nao.style.borderColor='var(--border)';nao.style.background='var(--bg)';nao.style.color='var(--text)';
    addr.style.display='none';
  } else {
    nao.style.borderColor='var(--coral)';nao.style.background='var(--gold-light)';nao.style.color='var(--gold-dark)';
    sim.style.borderColor='var(--border)';sim.style.background='var(--bg)';sim.style.color='var(--text)';
    addr.style.display='block';
  }
}

function setAro(aro) {
  curPedido.aro = aro;
  document.querySelectorAll('.aro-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById('aro-'+aro)?.classList.add('sel');
  const infoBox = document.getElementById('aro-info-box');
  if(infoBox) { infoBox.style.display='flex'; infoBox.innerHTML = `<i class="ti ti-info-circle" style="flex-shrink:0"></i> <span>Aro ${aro}: ${ARO_INFO[aro]}</span>`; }
  const valorInput = document.getElementById('p-valor-bolo');
  if(valorInput && !valorInput.value) valorInput.value = ARO_PRICES[aro] || '';
  calcPedidoTotal();
}

function setMassa(tipo) {
  curPedido.massa = tipo;
  document.querySelectorAll('.massa-btn').forEach(b => { b.style.borderColor='var(--border)';b.style.background='var(--bg)';b.style.color='var(--text)'; });
  const btn = document.getElementById('massa-'+tipo);
  if(btn){btn.style.borderColor='var(--coral)';btn.style.background='var(--gold-light)';btn.style.color='var(--gold-dark)';}
}

function setCobertura(tipo) {
  curPedido.cobertura = tipo;
  document.querySelectorAll('.cob-btn').forEach(b => { b.style.borderColor='var(--border)';b.style.background='var(--bg)';b.style.color='var(--text)'; });
  const btn = document.getElementById('cob-'+tipo);
  if(btn){btn.style.borderColor='var(--coral)';btn.style.background='var(--gold-light)';btn.style.color='var(--gold-dark)';}
}

function setFlores(val) {
  curPedido.flores = val;
  const sim=document.getElementById('btn-flores-sim'), nao=document.getElementById('btn-flores-nao');
  if(val){
    sim.style.borderColor='var(--teal)';sim.style.background='var(--teal-light)';sim.style.color='var(--teal)';
    nao.style.borderColor='var(--border)';nao.style.background='var(--bg)';nao.style.color='var(--text)';
  } else {
    nao.style.borderColor='var(--coral)';nao.style.background='var(--gold-light)';nao.style.color='var(--gold-dark)';
    sim.style.borderColor='var(--border)';sim.style.background='var(--bg)';sim.style.color='var(--text)';
  }
  calcPedidoTotal();
}

function setPapelaria(val) {
  curPedido.papelaria = val;
  const sim=document.getElementById('btn-papel-sim'), nao=document.getElementById('btn-papel-nao');
  if(val){
    sim.style.borderColor='var(--teal)';sim.style.background='var(--teal-light)';sim.style.color='var(--teal)';
    nao.style.borderColor='var(--border)';nao.style.background='var(--bg)';nao.style.color='var(--text)';
  } else {
    nao.style.borderColor='var(--coral)';nao.style.background='var(--gold-light)';nao.style.color='var(--gold-dark)';
    sim.style.borderColor='var(--border)';sim.style.background='var(--bg)';sim.style.color='var(--text)';
  }
  calcPedidoTotal();
}

function addInspiPhoto(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    curPedido.inspiPhoto = ev.target.result;
    const prev = document.getElementById('p-inspi-preview');
    if(prev) prev.innerHTML = `<img src="${ev.target.result}" style="width:100%;border-radius:var(--radius-sm);max-height:200px;object-fit:cover;margin-top:4px">
      <button class="btns" onclick="curPedido.inspiPhoto=null;document.getElementById('p-inspi-preview').innerHTML=''" style="width:100%;justify-content:center;font-size:12px;margin-top:6px"><i class="ti ti-trash"></i> Remover foto</button>`;
  };
  reader.readAsDataURL(file);
  e.target.value='';
}

function calcCustoOperacional(aro) {
  var d = calcCustoOperacionalDetalhado(aro);
  return d.total;
}

function calcCustoOperacionalDetalhado(aro) {
  var c = sucreeConfig.custos || {};
  var emb  = ((c.embalagemAro||{})[aro] !== undefined ? (c.embalagemAro||{})[aro] : c.embalagem ?? 15);
  var tab  = ((c.tabuaAro||{})[aro]     !== undefined ? (c.tabuaAro||{})[aro]     : c.tabua     ?? 3);
  var acessorios = c.acessorios||2;
  var limpeza = c.limpeza||3;
  var mdo  = (c.maoDeObra||{})[aro] || 0;
  var total = emb + tab + acessorios + limpeza + mdo;
  return { embalagem: emb, tabua: tab, acessorios: acessorios, limpeza: limpeza, maoDeObra: mdo, total: total };
}

// Custo TOTAL de uma receita (ingredientes + indireto + mão de obra do tempo de preparo
// daquela receita específica) — a mesma fórmula usada no card "Custo & Precificação" da
// tela de visualização da receita. Usado no Detalhamento de Custo do pedido para Massa,
// Recheio e Calda, em vez de considerar só o custo de ingredientes.
// Monta o HTML de uma receita "expandida" para um multiplicador específico (ex: 0,818 do
// aro 20), mostrando cada ingrediente já escalado (qtd × multiplicador) com seu custo
// individual, e o fechamento com indireto + mão de obra, batendo com getCustoTotalReceita.
function gerarHtmlReceitaExpandida(rec, mult, camadas) {
  camadas = camadas || 1;
  if (!rec) return '<div style="font-size:12px;color:var(--text3)">Receita não encontrada.</div>';
  var cfg = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
  var valorHora = cfg.valorHora || 25;
  var indiretoPct = cfg.indiretoPct || 15;
  var horas = (rec.time || 60) / 60;
  var ingrs = rec.ingredients || [];
  var custoIngrTotalBase = 0;
  var linhas = ingrs.map(function(ig){
    var qtyBase = parseFloat(ig.qty || 0);
    var qtyEscalada = qtyBase * mult;
    var custoUnit = typeof getPrecoIngrediente === 'function' ? getPrecoIngrediente(ig.name) : parseFloat(ig.price || 0);
    var custoBase = qtyBase * custoUnit;
    var custoEscalado = qtyEscalada * custoUnit * camadas;
    custoIngrTotalBase += custoBase;
    var sufixoCamadas = camadas > 1 ? ' × ' + camadas + ' camadas' : '';
    return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px">'
      + '<span style="color:var(--text2)">' + (ig.isBase?'⭐ ':'') + ig.name + '</span>'
      + '<span style="text-align:right;color:var(--text3)">' + qtyBase.toFixed(0) + (ig.unit||'g') + ' × ' + mult.toFixed(3) + sufixoCamadas + ' = <b style="color:var(--text)">' + (qtyEscalada*camadas).toFixed(1) + (ig.unit||'g')+'</b> · R$ ' + custoEscalado.toFixed(2) + '</span>'
      + '</div>';
  }).join('');
  var custoIndiretoBase = custoIngrTotalBase * indiretoPct / 100;
  var custoMdoBase = horas * valorHora;
  var custoTotalBase = custoIngrTotalBase + custoIndiretoBase + custoMdoBase;
  var custoIngrEscalado = custoIngrTotalBase * mult * camadas;
  var custoIndiretoEscalado = custoIndiretoBase * mult * camadas;
  var custoMdoEscalado = custoMdoBase * mult * camadas;
  var custoTotalEscalado = custoTotalBase * mult * camadas;
  var pesoBase = rec.pesoTotal || rec.yield_qty || 0;
  var pesoEscalado = pesoBase * mult * camadas;
  var tituloCamadas = camadas > 1 ? ' (' + camadas + ' camadas)' : '';
  return '<div style="background:var(--bg);border-radius:8px;padding:12px;margin-top:6px">'
    + '<div style="font-size:11px;font-weight:800;color:var(--gold);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">' + rec.name + ' — multiplicador ' + mult.toFixed(3) + 'x' + tituloCamadas + '</div>'
    + linhas
    + '<div style="display:flex;justify-content:space-between;padding:6px 0 0;margin-top:6px;border-top:1px solid var(--border);font-size:12px;color:var(--text2)">'
      + '<span>Ingredientes</span><span>R$ ' + custoIngrEscalado.toFixed(2) + '</span></div>'
    + '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--text2)">'
      + '<span>Indireto (' + indiretoPct + '%)</span><span>R$ ' + custoIndiretoEscalado.toFixed(2) + '</span></div>'
    + '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--text2)">'
      + '<span>Mão de obra (' + horas.toFixed(2) + 'h × R$' + valorHora + (camadas>1?' × '+camadas:'') + ')</span><span>R$ ' + custoMdoEscalado.toFixed(2) + '</span></div>'
    + '<div style="display:flex;justify-content:space-between;padding:6px 0 0;margin-top:4px;border-top:1px solid var(--border);font-size:13px;font-weight:800;color:var(--gold)">'
      + '<span>Total (peso ' + pesoEscalado.toFixed(0) + 'g)</span><span>R$ ' + custoTotalEscalado.toFixed(2) + '</span></div>'
    + '</div>';
}

// Abre/fecha o painel expandido de uma receita dentro do Detalhamento de Custo.
function toggleReceitaExpandida(idElemento, nomeReceita, mult, camadas) {
  var el = document.getElementById(idElemento);
  if (!el) return;
  if (el.style.display === 'none' || !el.innerHTML) {
    var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === nomeReceita; });
    el.innerHTML = gerarHtmlReceitaExpandida(rec, mult, camadas);
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

function getCustoTotalReceita(rec) {
  if (!rec) return 0;
  var p = typeof calcAt === 'function' ? calcAt(rec, 1) : null;
  if (!p) return 0;
  var cfg = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
  var valorHora = cfg.valorHora || 25;
  var indiretoPct = cfg.indiretoPct || 15;
  var horas = (rec.time || 60) / 60;
  var custoIngr = p.cost;
  var custoIndireto = custoIngr * indiretoPct / 100;
  var custoMdo = horas * valorHora;
  return custoIngr + custoIndireto + custoMdo;
}

// Função genérica de custo por aro, usada por Massa/Recheio/Calda/Cobertura: lê o
// multiplicador cadastrado dentro da própria receita (rec.multiplicadorAro[aro]) e aplica
// sobre o custo TOTAL da receita (ingredientes + indireto + mão de obra do tempo de preparo).
// Substitui as tabelas genéricas antigas de Config (Quantidades reais por aro).
function getCustoReceitaPorAro(receitaNome, aro) {
  if (!receitaNome) return 0;
  var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === receitaNome; });
  if (!rec) return 0;
  var custoTotalReceita = getCustoTotalReceita(rec);
  if (!custoTotalReceita) return 0;
  var mult = (rec.multiplicadorAro || {})[aro];
  if (!mult) return 0;
  return custoTotalReceita * mult;
}

// Peso (g) necessário de um recheio/receita por aro, usado na Ficha Técnica de produção
// (multiplicador × pesoTotal da receita), com o mesmo vínculo de nome usado no custo.
// Peso (g) necessário de uma receita específica por aro (pesoTotal × multiplicador),
// usado na Ficha Técnica de produção para Calda, Cobertura e outras receitas vinculadas.
function getQtdAroDaReceita(receitaNome, aro) {
  if (!receitaNome) return null;
  var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === receitaNome; });
  if (!rec) return null;
  var pesoBase = rec.pesoTotal || rec.yield_qty;
  var mult = (rec.multiplicadorAro || {})[aro];
  if (!pesoBase || !mult) return null;
  return Math.ceil(pesoBase * mult);
}

function getQtdAroDoRecheio(nomeRecheio, aro) {
  var vincs = sucreeConfig.receitasCardapio || {};
  var key = (nomeRecheio||'').replace(/[^a-zA-Z0-9]/g,'_');
  var receitaNome = vincs['recheio_' + key] || nomeRecheio;
  return getQtdAroDaReceita(receitaNome, aro);
}

// Custo de SÓ INGREDIENTES de uma receita, escalado pelo multiplicador do aro — sem
// indireto e sem mão de obra (que na tela de Detalhamento de Custo do pedido passaram a
// ser calculados uma única vez sobre o total do pedido, não por receita individual).
function getCustoIngredientesPorAro(receitaNome, aro) {
  if (!receitaNome) return 0;
  var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === receitaNome; });
  if (!rec) return 0;
  var custoIngr = (typeof totIC === 'function') ? totIC(rec.ingredients || []) : 0;
  if (!custoIngr) return 0;
  var mult = (rec.multiplicadorAro || {})[aro];
  if (!mult) return 0;
  return custoIngr * mult;
}

function getCustoMassaAro(nomeMassa, aro) {
  var vincs = sucreeConfig.receitasCardapio || {};
  var key = (nomeMassa||'').replace(/[^a-zA-Z0-9]/g,'_');
  var receitaNome = vincs['massa_' + key] || nomeMassa;
  return getCustoIngredientesPorAro(receitaNome, aro);
}

// Busca todas as receitas que se aplicam automaticamente a um recheio específico (campo
// recheiosVinculados), por exemplo "Chocolate Nobre Meio Amargo Picado" vinculado ao
// recheio "Brigadeiro Meio Amargo". Pode haver mais de uma receita vinculada ao mesmo recheio.
function getReceitasVinculadasAoRecheio(nomeRecheio) {
  if (!nomeRecheio) return [];
  return (typeof recipes !== 'undefined' ? recipes : []).filter(function(r){
    return Array.isArray(r.recheiosVinculados) && r.recheiosVinculados.indexOf(nomeRecheio) >= 0;
  });
}

// Custo de TODAS as receitas vinculadas a um recheio específico, para 1 camada, no aro
// dado — só ingredientes (mesma regra acima: indireto/mão de obra saíram da conta por
// receita e passaram a ser únicos, sobre o total do pedido).
function getCustosVinculadosAro(nomeRecheio, aro) {
  return getReceitasVinculadasAoRecheio(nomeRecheio).map(function(rec){
    var custoIngr = (typeof totIC === 'function') ? totIC(rec.ingredients || []) : 0;
    var mult = (rec.multiplicadorAro || {})[aro];
    var custo = (custoIngr && mult) ? custoIngr * mult : 0;
    var pesoBase = rec.pesoTotal || rec.yield_qty || 0;
    var qtd = (pesoBase && mult) ? Math.ceil(pesoBase * mult) : 0;
    return { custo: custo, qtd: qtd, nomeReceita: rec.name };
  });
}

function getCustoRecheioAro(nomeRecheio, aro) {
  var vincs = sucreeConfig.receitasCardapio || {};
  var key = (nomeRecheio||'').replace(/[^a-zA-Z0-9]/g,'_');
  var receitaNome = vincs['recheio_' + key] || nomeRecheio;
  return getCustoIngredientesPorAro(receitaNome, aro);
}

// Retorna a receita de Calda vinculada a uma Massa específica (campo caldaVinculada,
// cadastrado dentro da receita de Massa) — relação 1:1, diferente dos recheiosVinculados
// (que podem ter vários itens por recheio). A calda nunca é escolhida pelo cliente; é
// 100% automática a partir do que foi cadastrado na receita de Massa.
function getCaldaVinculadaDaMassa(nomeMassa) {
  if (!nomeMassa) return null;
  var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === nomeMassa; });
  if (!rec || !rec.caldaVinculada) return null;
  return (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === rec.caldaVinculada; }) || null;
}

// Custo da calda vinculada a uma massa, para o aro do pedido — mesmo formato de retorno
// de getCustosVinculadosAro ({custo, qtd, nomeReceita}), para reaproveitar a mesma forma
// de exibição na tela de Detalhamento de Custo e na Ficha Técnica de produção.
function getCustoCaldaVinculadaAro(nomeMassa, aro) {
  var caldaRec = getCaldaVinculadaDaMassa(nomeMassa);
  if (!caldaRec) return null;
  var custoIngr = (typeof totIC === 'function') ? totIC(caldaRec.ingredients || []) : 0;
  var mult = (caldaRec.multiplicadorAro || {})[aro];
  var custo = (custoIngr && mult) ? custoIngr * mult : 0;
  var pesoBase = caldaRec.pesoTotal || caldaRec.yield_qty || 0;
  var qtd = (pesoBase && mult) ? Math.ceil(pesoBase * mult) : 0;
  return { custo: custo, qtd: qtd, nomeReceita: caldaRec.name };
}

function getCustoChantillyAro(aro) {
  var vincs = sucreeConfig.receitasCardapio || {};
  var receitaNome = vincs.chantininho || 'Chantininho';
  return getCustoIngredientesPorAro(receitaNome, aro);
}

function getCustoButtercreamAro(aro) {
  var vincs = sucreeConfig.receitasCardapio || {};
  var receitaNome = vincs.buttercream || 'Buttercream';
  return getCustoIngredientesPorAro(receitaNome, aro);
}

function calcPedidoTotal() {
  const valorBolo = parseFloat(document.getElementById('p-valor-bolo')?.value||0);
  const custoInput = parseFloat(document.getElementById('p-custo')?.value||0);
  const flores = curPedido.flores ? (sucreeConfig.floresValor||50) : 0;
  const papelaria = curPedido.papelaria ? (sucreeConfig.papelariaValor||35) : 0;
  const total = valorBolo + flores + papelaria;
  const sinal = parseFloat(document.getElementById('p-sinal')?.value||0);
  const restante = total - sinal;
  curPedido.valorTotal = total;

  const aro = curPedido.aro || 20;
  const custoOp = calcCustoOperacional(aro);
  var nomeR1 = document.getElementById('p-recheio1')?.value || '';
  var nomeR2 = document.getElementById('p-recheio2')?.value || '';
  var custoRecheio1  = getCustoRecheioAro(nomeR1, aro);
  var custoRecheio2  = getCustoRecheioAro(nomeR2, aro);
  // Calda 100% automática, vinda do vínculo cadastrado na receita de Massa — não há mais
  // escolha manual de calda em lugar nenhum do app.
  var caldaVincPedido = typeof getCustoCaldaVinculadaAro === 'function' ? getCustoCaldaVinculadaAro(curPedido.massa, aro) : null;
  var custoCalda     = caldaVincPedido ? caldaVincPedido.custo : 0;
  var custoChantilly = getCustoChantillyAro(aro);
  var custoCobertura = curPedido.cobertura === 'buttercream' ? (sucreeConfig.buttercream||50) : custoChantilly;
  var custoIngr = custoRecheio1 + custoRecheio2 + custoCalda;
  var custoCalculado = custoOp + custoIngr + custoCobertura;
  const custo = custoInput > 0 ? custoInput : (custoCalculado > 0 ? custoCalculado : valorBolo * 0.35);
  const margemPct = sucreeConfig.custos?.margemLucro || 30;
  const precoMinimo = custo * (1 + margemPct/100);
  const lucro = total - custo;
  curPedido.custoEstimado = custo;

  const box = document.getElementById('pedido-total-box');
  if(!box) return;
  const c = sucreeConfig.custos || {};
  const mdo = (c.maoDeObra||{})[aro] || 0;

  box.innerHTML = `
    <div style="background:rgba(255,255,255,.05);border-radius:var(--radius-sm);padding:14px;margin-bottom:10px">
      <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">💰 Valor ao cliente</div>
      <div class="total-row"><span>🎂 Bolo (Aro ${aro})</span><span>R$ ${valorBolo.toFixed(2)}</span></div>
      ${flores>0?'<div class="total-row"><span>💐 Flores</span><span>R$ '+flores.toFixed(2)+'</span></div>':''}
      ${papelaria>0?'<div class="total-row"><span>🎨 Papelaria</span><span>R$ '+papelaria.toFixed(2)+'</span></div>':''}
      <div class="total-row grand"><span>TOTAL CLIENTE</span><span>R$ ${total.toFixed(2)}</span></div>
      ${sinal>0?'<div class="total-row saldo"><span>✅ Sinal pago</span><span>R$ '+sinal.toFixed(2)+'</span></div>':''}
      ${restante>0&&sinal>0?'<div class="total-row" style="color:var(--gold);font-weight:700"><span>⏳ A receber</span><span>R$ '+restante.toFixed(2)+'</span></div>':''}
    </div>
    <div style="background:rgba(15,110,86,.1);border:1px solid rgba(15,110,86,.3);border-radius:var(--radius-sm);padding:14px">
      <div style="font-size:10px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">📈 Análise de lucro</div>
      <div class="total-row" style="font-size:12px"><span>💸 Custo total estimado</span><span style="color:#FF8080">R$ ${custo.toFixed(2)}</span></div>
      <div class="total-row" style="font-size:12px"><span>Preço mínimo (${margemPct}% lucro)</span><span style="color:var(--teal)">R$ ${precoMinimo.toFixed(2)}</span></div>
      <div class="total-row grand" style="color:${lucro>=0?'var(--teal)':'#FF8080'}">
        <span>${lucro>=0?'✅ Lucro real':'⚠️ Prejuízo'}</span><span>R$ ${Math.abs(lucro).toFixed(2)}</span>
      </div>
      ${total < precoMinimo ? '<div style="font-size:11px;color:#FF8080;margin-top:6px">⚠️ Cobrando abaixo do mínimo! Aumente para R$ '+precoMinimo.toFixed(2)+'</div>' : '<div style="font-size:11px;color:var(--teal);margin-top:4px">✅ Preço acima do mínimo. Margem: '+(((total-custo)/custo)*100).toFixed(0)+'%</div>'}
    </div>`;
}

function isGrupoRecheio(g) {
  if (!g) return false;
  var norm = g.toString().trim().toLowerCase();
  return norm === 'recheio' || norm === 'recheios';
}

function getRecheios() {
  const todos = recipes.filter(r => isGrupoRecheio(r.group)).map(r => r.name);
  return [...new Set(todos)];
}

function populateRecheioSelects() {
  const recheios = getRecheios();
  // Garante que o recheio já salvo no pedido sempre apareça como opção, mesmo que ainda não tenha sido cadastrado em Receitas
  const extras = [curPedido.recheio1, curPedido.recheio2].filter(function(n){ return n && !recheios.includes(n); });
  const todasOpcoes = [...recheios, ...extras];
  const opts = todasOpcoes.map(r => `<option value="${r.replace(/"/g,'&quot;')}">${r}</option>`).join('');
  const sel1 = document.getElementById('p-recheio1');
  const sel2 = document.getElementById('p-recheio2');
  if(sel1) sel1.innerHTML = '<option value="">Selecione o recheio...</option>' + opts;
  if(sel2) sel2.innerHTML = '<option value="">Nenhum / mesmo recheio</option>' + opts;
  if(curPedido.recheio1 && sel1) sel1.value = curPedido.recheio1;
  if(curPedido.recheio2 && sel2) sel2.value = curPedido.recheio2;
}

function openNovoPedido() {
  editPedidoId = null;
  curPedido = { retira: true, flores: false, papelaria: false };
  document.getElementById('pedido-title').textContent = 'Novo Pedido';
  resetPedidoForm();
  populateRecheioSelects();
  stPedido(0);
  document.getElementById('modal-pedido').style.display = 'flex';
}

function resetPedidoForm() {
  ['p-cliente','p-data','p-hora','p-endereco','p-telefone','p-obs-cliente',
   'p-tema','p-obs-deco','p-valor-bolo','p-custo','p-sinal'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  document.getElementById('p-inspi-preview').innerHTML = '';
  document.getElementById('aro-info-box').style.display = 'none';
  document.querySelectorAll('.aro-btn').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('.massa-btn,.cob-btn').forEach(b=>{
    b.style.borderColor='var(--border)';b.style.background='var(--bg)';b.style.color='var(--text)';
  });
  document.getElementById('p-pagamento').value = '';
  document.getElementById('p-status').value = 'pendente';
  setPedidoRetira(true);
  const txtFlores = document.getElementById('txt-flores-valor');
  if (txtFlores) txtFlores.textContent = 'R$ ' + (sucreeConfig.floresValor||50).toFixed(2);
  const txtPapelaria = document.getElementById('txt-papelaria-valor');
  if (txtPapelaria) txtPapelaria.textContent = 'R$ ' + (sucreeConfig.papelariaValor||35).toFixed(2);
  setFlores(false);
  setPapelaria(false);
}

function openEditPedido(id) {
  const p = pedidos.find(x=>x.id===id);if(!p)return;
  editPedidoId = id;
  curPedido = {...p};
  document.getElementById('pedido-title').textContent = 'Editar Pedido';
  resetPedidoForm();
  populateRecheioSelects();
  if(p.cliente) document.getElementById('p-cliente').value = p.cliente;
  if(p.data) document.getElementById('p-data').value = p.data;
  if(p.hora) document.getElementById('p-hora').value = p.hora;
  if(p.endereco) document.getElementById('p-endereco').value = p.endereco;
  if(p.telefone) document.getElementById('p-telefone').value = p.telefone;
  if(p.obsCliente) document.getElementById('p-obs-cliente').value = p.obsCliente;
  if(p.tema) document.getElementById('p-tema').value = p.tema;
  if(p.obsDeco) document.getElementById('p-obs-deco').value = p.obsDeco;
  if(p.valorBolo) document.getElementById('p-valor-bolo').value = p.valorBolo;
  if(p.sinal) document.getElementById('p-sinal').value = p.sinal;
  if(p.pagamento) document.getElementById('p-pagamento').value = p.pagamento;
  if(p.status) document.getElementById('p-status').value = p.status;
  if(p.inspiPhoto) {
    curPedido.inspiPhoto = p.inspiPhoto;
    document.getElementById('p-inspi-preview').innerHTML = `<img src="${p.inspiPhoto}" style="width:100%;border-radius:var(--radius-sm);max-height:200px;object-fit:cover;margin-top:4px">`;
  }
  if(p.aro) setAro(p.aro);
  if(p.massa) setMassa(p.massa);
  if(p.cobertura) setCobertura(p.cobertura);
  setPedidoRetira(p.retira !== false);
  setFlores(p.flores === true);
  setPapelaria(p.papelaria === true);
  stPedido(0);
  document.getElementById('modal-pedido').style.display = 'flex';
}

function savePedido() {
  const cliente = document.getElementById('p-cliente').value.trim();
  if(!cliente) { toast('Informe o nome do cliente'); stPedido(0); return; }
  const valorBolo = parseFloat(document.getElementById('p-valor-bolo').value||0);
  const flores = curPedido.flores ? (sucreeConfig.floresValor||50) : 0;
  const papelaria = curPedido.papelaria ? (sucreeConfig.papelariaValor||35) : 0;
  const total = valorBolo + flores + papelaria;

  const pedido = {
    id: editPedidoId || genId(),
    cliente,
    data: document.getElementById('p-data').value,
    hora: document.getElementById('p-hora').value,
    retira: curPedido.retira !== false,
    endereco: document.getElementById('p-endereco').value,
    telefone: document.getElementById('p-telefone').value,
    obsCliente: document.getElementById('p-obs-cliente').value,
    aro: curPedido.aro,
    massa: curPedido.massa,
    recheio1: document.getElementById('p-recheio1').value,
    recheio2: document.getElementById('p-recheio2').value,
    cobertura: curPedido.cobertura,
    valorBolo,
    custoEstimado: parseFloat(document.getElementById('p-custo')?.value||0) || (valorBolo * 0.35),
    tema: document.getElementById('p-tema').value,
    inspiPhoto: curPedido.inspiPhoto || null,
    flores: curPedido.flores === true,
    papelaria: curPedido.papelaria === true,
    obsDeco: document.getElementById('p-obs-deco').value,
    sinal: parseFloat(document.getElementById('p-sinal').value||0),
    pagamento: document.getElementById('p-pagamento').value,
    status: document.getElementById('p-status').value || 'pendente',
    valorTotal: total,
    createdAt: Date.now()
  };

  if(editPedidoId) { const idx=pedidos.findIndex(p=>p.id===editPedidoId); pedidos[idx]=pedido; }
  else pedidos.unshift(pedido);
  savePedidos();
  savePedidoToCloud(pedido);
  cm('modal-pedido');
  renderConfeitaria();
  toast('Pedido salvo!');
  setTimeout(() => notificarWhatsApp(pedido), 1500);
}

function getDeletedPedidoIds() {
  if (!window._deletedPedidoIds) {
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem('mr_deleted_pedido_ids') || '[]'); } catch(e) {}
    window._deletedPedidoIds = new Set(saved);
  }
  return window._deletedPedidoIds;
}

function persistDeletedPedidoIds() {
  try { localStorage.setItem('mr_deleted_pedido_ids', JSON.stringify(Array.from(getDeletedPedidoIds()))); } catch(e) {}
}

async function delPedido(id) {
  if(!confirm('Excluir este pedido?')) return;

  var res;
  try {
    res = await sb.from('pedidos_confeitaria').delete().eq('id', id);
  } catch(e) {
    toast('❌ Falha ao excluir: ' + (e.message || 'erro de rede') + '. Tente novamente.');
    return;
  }
  if (res && res.error) {
    toast('❌ Falha ao excluir: ' + res.error.message + '. Tente novamente.');
    return;
  }

  getDeletedPedidoIds().add(id);
  persistDeletedPedidoIds();
  pedidos = pedidos.filter(p=>p.id!==id);
  savePedidos();
  renderConfeitaria();
  toast('Pedido excluído!');
}

function viewPedido(id) {
  const p = pedidos.find(x=>x.id===id);if(!p)return;
  document.getElementById('pv-title').textContent = p.cliente || 'Pedido';
  document.getElementById('pv-edit-btn').onclick = ()=>{cm('modal-pedido-view');openEditPedido(id)};
  const dataFmt = p.data ? new Date(p.data+'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const statusLabel = {pendente:'⏳ Pendente',confirmado:'✅ Confirmado',producao:'🎂 Em produção',pronto:'🎉 Pronto',entregue:'✔️ Entregue',cancelado:'❌ Cancelado'}[p.status]||p.status;

  document.getElementById('pv-body').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
      <span class="status-badge sb-${p.status}">${statusLabel}</span>
      <span style="font-size:13px;color:var(--text2)"><i class="ti ti-calendar"></i> ${dataFmt} ${p.hora?'· '+p.hora:''}</span>
      ${p.retira?'<span style="background:var(--teal-light);color:var(--teal);font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">✅ Cliente retira</span>':'<span style="background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px">🚗 Entrego</span>'}
    </div>
    ${p.telefone?`<div style="font-size:13px;margin-bottom:8px"><i class="ti ti-phone" style="font-size:12px"></i> ${p.telefone}</div>`:''}
    ${p.endereco?`<div style="font-size:13px;margin-bottom:8px;color:var(--text2)"><i class="ti ti-map-pin" style="font-size:12px"></i> ${p.endereco}</div>`:''}
    <div class="st" style="margin-top:8px"><i class="ti ti-cake"></i> Detalhes do bolo</div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      ${p.aro?`<div class="total-row"><span>Tamanho</span><span><b>Aro ${p.aro}</b></span></div>`:''}
      ${p.massa?`<div class="total-row"><span>Massa</span><span>${p.massa}</span></div>`:''}
      ${p.recheio1?`<div class="total-row"><span>Recheio 1</span><span>${p.recheio1}</span></div>`:''}
      ${p.recheio2?`<div class="total-row"><span>Recheio 2</span><span>${p.recheio2}</span></div>`:''}
      ${p.cobertura?`<div class="total-row"><span>Cobertura</span><span>${p.cobertura==='chantininho'?'🍦 Chantininho':'🧁 Buttercream'}</span></div>`:''}
      ${p.tema?`<div class="total-row"><span>Tema</span><span>${p.tema}</span></div>`:''}
    </div>
    <div class="st"><i class="ti ti-photo"></i> Fotos do pedido</div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;text-align:center">Sugerida pela cliente</div>
          ${p.inspiPhoto
            ? `<img src="${p.inspiPhoto}" onclick="abrirFotoZoom('${p.inspiPhoto.replace(/'/g,"\\'")}')" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border)">`
            : `<div style="width:100%;aspect-ratio:1;border-radius:8px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:10px;text-align:center;padding:6px">Nenhuma foto enviada</div>`}
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;text-align:center">Confirmada com cliente</div>
          ${p.fotoConfirmada
            ? `<img src="${p.fotoConfirmada}" onclick="abrirFotoZoom('${p.fotoConfirmada.replace(/'/g,"\\'")}')" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border)">`
            : `<label style="width:100%;aspect-ratio:1;border-radius:8px;border:1px dashed var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--gold-dark, var(--gold));font-size:10px;text-align:center;cursor:pointer;gap:4px"><i class="ti ti-upload" style="font-size:18px"></i>Adicionar<input type="file" accept="image/*" style="display:none" onchange="uploadFotoPedido('${p.id}','fotoConfirmada',this)"></label>`}
          ${p.fotoConfirmada ? `<button onclick="uploadFotoPedido('${p.id}','fotoConfirmada',null,true)" style="width:100%;font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer;margin-top:3px"><i class="ti ti-trash"></i> Remover</button>` : ''}
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;text-align:center">Bolo pronto</div>
          ${p.fotoPronto
            ? `<img src="${p.fotoPronto}" onclick="abrirFotoZoom('${p.fotoPronto.replace(/'/g,"\\'")}')" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border)">`
            : `<label style="width:100%;aspect-ratio:1;border-radius:8px;border:1px dashed var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--gold-dark, var(--gold));font-size:10px;text-align:center;cursor:pointer;gap:4px"><i class="ti ti-upload" style="font-size:18px"></i>Adicionar<input type="file" accept="image/*" style="display:none" onchange="uploadFotoPedido('${p.id}','fotoPronto',this)"></label>`}
          ${p.fotoPronto ? `<button onclick="uploadFotoPedido('${p.id}','fotoPronto',null,true)" style="width:100%;font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer;margin-top:3px"><i class="ti ti-trash"></i> Remover</button>` : ''}
        </div>
      </div>
    </div>
    <div class="st"><i class="ti ti-currency-dollar"></i> Financeiro</div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      <div class="total-row grand"><span>TOTAL</span><span>R$ ${parseFloat(p.valorTotal||0).toFixed(2)}</span></div>
      ${p.sinal>0?`<div class="total-row saldo"><span>✅ Sinal pago</span><span>R$ ${parseFloat(p.sinal).toFixed(2)}</span></div>`:''}
      ${p.sinal>0?`<div class="total-row" style="color:var(--gold);font-weight:700"><span>💳 Restante</span><span>R$ ${(parseFloat(p.valorTotal||0)-parseFloat(p.sinal||0)).toFixed(2)}</span></div>`:''}
    </div>
    ${(p.topo || p.flores || p.papelaria) ? `
    <div class="st"><i class="ti ti-receipt"></i> Custo real (topo/flores/papelaria)</div>
    <div style="background:rgba(200,163,91,.08);border:1px solid rgba(200,163,91,.25);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      <p style="font-size:11px;color:var(--text2);margin-bottom:10px">Você cobra um valor fixo do cliente, mas o custo real varia. Informe quanto gastou de fato, para o lucro do pedido ficar correto.</p>
      ${p.topo ? `
      <div class="fg" style="margin-bottom:8px">
        <label>🪄 Custo real do Topo (cobrado R$ ${(sucreeConfig.topoValor||45).toFixed(2)})</label>
        <input type="number" id="custo-real-topo" value="${p.custoRealTopo ?? ''}" min="0" step="0.01" placeholder="Ex: 38.50" onchange="atualizarCustoRealPedido('${p.id}','custoRealTopo',this.value)">
      </div>` : ''}
      ${p.flores ? `
      <div class="fg" style="margin-bottom:${p.papelaria?'8px':'0'}">
        <label>💐 Custo real das Flores (cobrado R$ ${(sucreeConfig.floresValor||50).toFixed(2)})</label>
        <input type="number" id="custo-real-flores" value="${p.custoRealFlores ?? ''}" min="0" step="0.01" placeholder="Ex: 65.00" onchange="atualizarCustoRealPedido('${p.id}','custoRealFlores',this.value)">
      </div>` : ''}
      ${p.papelaria ? `
      <div class="fg" style="margin-bottom:0">
        <label>🎨 Custo real da Papelaria (cobrado R$ ${(sucreeConfig.papelariaValor||35).toFixed(2)})</label>
        <input type="number" id="custo-real-papelaria" value="${p.custoRealPapelaria ?? ''}" min="0" step="0.01" placeholder="Ex: 20.00" onchange="atualizarCustoRealPedido('${p.id}','custoRealPapelaria',this.value)">
      </div>` : ''}
    </div>` : ''}
    <button onclick="imprimirPedidoCozinha('${p.id}')" style="width:100%;padding:12px;background:var(--gold);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:10px">
      <i class="ti ti-printer"></i> 🖨️ Imprimir para a Cozinha
    </button>
    <button onclick="abrirDetalhamentoCusto('${p.id}')" style="width:100%;padding:12px;background:none;border:1.5px solid var(--border);color:var(--text);border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:10px">
      <i class="ti ti-chart-bar"></i> 📊 Detalhamento de custo
    </button>
    <div style="display:flex;gap:8px;margin-top:4px">
      <select onchange="updatePedidoStatus('${p.id}',this.value)" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;background:var(--surface);color:var(--text)">
        <option value="pendente" ${p.status==='pendente'?'selected':''}>⏳ Pendente</option>
        <option value="confirmado" ${p.status==='confirmado'?'selected':''}>✅ Confirmado</option>
        <option value="producao" ${p.status==='producao'?'selected':''}>🎂 Em produção</option>
        <option value="pronto" ${p.status==='pronto'?'selected':''}>🎉 Pronto</option>
        <option value="entregue" ${p.status==='entregue'?'selected':''}>✔️ Entregue</option>
        <option value="cancelado" ${p.status==='cancelado'?'selected':''}>❌ Cancelado</option>
      </select>
    </div>`;

  document.getElementById('modal-pedido-view').style.display = 'flex';
}

function atualizarCustoRealPedido(id, campo, valor) {
  const p = pedidos.find(x => x.id === id);
  if (!p) return;
  p[campo] = parseFloat(valor) || 0;
  savePedidos();
  try {
    const colMap = { custoRealTopo: 'custo_real_topo', custoRealFlores: 'custo_real_flores', custoRealPapelaria: 'custo_real_papelaria' };
    const col = colMap[campo] || campo;
    sb.from('pedidos_confeitaria').update({ [col]: p[campo] }).eq('id', id).then(function(){});
  } catch(e) {}
}

function abrirDetalhamentoCusto(id) {
  const p = pedidos.find(x => x.id === id);
  if (!p) return;
  const aro = parseInt(p.aro) || 0;

  const custoMassa = getCustoMassaAro(p.massa, aro);
  // Resolve o nome real da receita + multiplicador para o botão "ver detalhamento" (lupa).
  function resolverReceitaEMult(nomeCardapio, prefixoVinculo) {
    if (!nomeCardapio) return { nome: null, mult: null };
    var vincs = sucreeConfig.receitasCardapio || {};
    var key = nomeCardapio.replace(/[^a-zA-Z0-9]/g,'_');
    var nomeReal = vincs[prefixoVinculo + '_' + key] || nomeCardapio;
    var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === nomeReal; });
    var mult = (rec && rec.multiplicadorAro) ? rec.multiplicadorAro[aro] : null;
    return { nome: nomeReal, mult: mult };
  }
  const massaResolvida = resolverReceitaEMult(p.massa, 'massa');
  const recheio1Resolvido = resolverReceitaEMult(p.recheio1, 'recheio');
  const recheio2Resolvido = resolverReceitaEMult(p.recheio2, 'recheio');
  // 3 camadas de recheio no total: recheio1, recheio2, e um deles repetido (escolha manual sua, não do cliente).
  const recheioRepetido = p.recheioRepetido || 'recheio1';
  const camadasRecheio1 = p.recheio1 ? (recheioRepetido === 'recheio1' ? 2 : 1) : 0;
  const camadasRecheio2 = p.recheio2 ? (recheioRepetido === 'recheio2' ? 2 : 1) : 0;
  const custoRecheio1Camada = p.recheio1 ? getCustoRecheioAro(p.recheio1, aro) : 0;
  const custoRecheio2Camada = p.recheio2 ? getCustoRecheioAro(p.recheio2, aro) : 0;
  const custoRecheio1 = custoRecheio1Camada * camadasRecheio1;
  const custoRecheio2 = custoRecheio2Camada * camadasRecheio2;
  const vinculados1 = p.recheio1 ? getCustosVinculadosAro(p.recheio1, aro).map(function(v){ return {...v, camadas: camadasRecheio1}; }) : [];
  const vinculados2 = p.recheio2 ? getCustosVinculadosAro(p.recheio2, aro).map(function(v){ return {...v, camadas: camadasRecheio2}; }) : [];
  const itensVinculados = vinculados1.concat(vinculados2);
  const custoVinculados = itensVinculados.reduce(function(a, v){ return a + (v.custo * v.camadas); }, 0);

  // Calda: 100% automática, vinda do vínculo cadastrado na receita de Massa — nunca
  // escolhida pelo cliente nem pelo admin no pedido. Serve só para custo e ficha de cozinha.
  const caldaVinculada = getCustoCaldaVinculadaAro(p.massa, aro);
  const custoCalda = caldaVinculada ? caldaVinculada.custo : 0;

  const custoChantilly = getCustoChantillyAro(aro);
  const custoButtercream = getCustoButtercreamAro(aro);
  const custoCoberturaAuto = p.cobertura === 'chantininho' ? custoChantilly : (p.cobertura === 'buttercream' ? custoButtercream : 0);
  const nomeCoberturaAuto = p.cobertura === 'chantininho' ? 'Chantininho' : (p.cobertura === 'buttercream' ? 'Buttercream' : p.cobertura);

  // Descartáveis (tábua/cakeboard + embalagem), vindos de Config — NÃO inclui mais
  // acessórios/limpeza/mão de obra de finalização aqui, porque a formação de preço nesta
  // tela passou a usar só o indireto de 18% sobre o total de ingredientes (ver mais abaixo).
  const cfgCustos = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
  const tabuaPadrao = ((cfgCustos.tabuaAro||{})[aro] !== undefined ? (cfgCustos.tabuaAro||{})[aro] : (cfgCustos.tabua ?? 3));
  const embalagemPadrao = ((cfgCustos.embalagemAro||{})[aro] !== undefined ? (cfgCustos.embalagemAro||{})[aro] : (cfgCustos.embalagem ?? 15));

  document.getElementById('modal-item-titulo').textContent = 'Detalhamento de custo — ' + (p.cliente||'');
  function linhaAuto(label, valor) {
    return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px"><span style="color:var(--text2)">'+label+'</span><span style="font-weight:700;color:var(--text)">R$ '+valor.toFixed(2)+'</span></div>';
  }
  function linhaAutoExpandivel(label, valor, nomeReceita, mult, idExpand, camadas) {
    if (!nomeReceita || !mult) return linhaAuto(label, valor);
    camadas = camadas || 1;
    return '<div style="border-bottom:1px solid rgba(255,255,255,.06);padding:8px 0">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">'
      + '<span style="color:var(--text2)">'+label+'</span>'
      + '<span style="display:flex;align-items:center;gap:8px">'
      + '<button onclick="toggleReceitaExpandida(\''+idExpand+'\', \''+nomeReceita.replace(/'/g,"\\'")+'\', '+mult+', '+camadas+')" title="Ver detalhamento" style="background:none;border:none;color:var(--gold);cursor:pointer;font-size:14px;padding:2px"><i class="ti ti-search"></i></button>'
      + '<span style="font-weight:700;color:var(--text)">R$ '+valor.toFixed(2)+'</span>'
      + '</span></div>'
      + '<div id="'+idExpand+'" style="display:none"></div>'
      + '</div>';
  }
  function linhaEditavel(label, id_, valor) {
    return '<div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">'+label+'</label>'
      + '<input type="number" id="'+id_+'" value="'+(valor??'')+'" min="0" step="0.01" placeholder="0,00" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px"></div>';
  }

  let html = '<div style="font-size:11px;font-weight:800;color:var(--gold);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Calculado automaticamente (só ingredientes)</div>';
  html += linhaAutoExpandivel('Massa (' + (p.massa||'—') + ')', custoMassa, massaResolvida.nome, massaResolvida.mult, 'expand-massa-'+id);
  if (p.recheio1 && p.recheio2) {
    html += '<div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">Qual sabor repete (3 camadas no total)?</label>'
      + '<select id="dc-recheio-repetido" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px">'
      + '<option value="recheio1"' + (recheioRepetido==='recheio1'?' selected':'') + '>' + p.recheio1 + ' (2x)</option>'
      + '<option value="recheio2"' + (recheioRepetido==='recheio2'?' selected':'') + '>' + p.recheio2 + ' (2x)</option>'
      + '</select></div>';
  }
  if (p.recheio1) html += linhaAutoExpandivel('Recheio 1 (' + p.recheio1 + ')', custoRecheio1Camada, recheio1Resolvido.nome, recheio1Resolvido.mult, 'expand-recheio1-'+id, 1);
  if (p.recheio2) html += linhaAutoExpandivel('Recheio 2 (' + p.recheio2 + ')', custoRecheio2Camada, recheio2Resolvido.nome, recheio2Resolvido.mult, 'expand-recheio2-'+id, 1);
  if (p.recheio1 || p.recheio2) {
    const nomeRepetidoTxt = recheioRepetido === 'recheio2' ? p.recheio2 : p.recheio1;
    const custoRepetidoTxt = recheioRepetido === 'recheio2' ? custoRecheio2Camada : custoRecheio1Camada;
    if (nomeRepetidoTxt) html += linhaAuto('Recheio 3 (repete ' + nomeRepetidoTxt + ')', custoRepetidoTxt);
  }
  itensVinculados.forEach(function(v){
    if (v.custo > 0) html += linhaAuto('Adicional: ' + v.nomeReceita + ' (' + v.camadas + 'x)', v.custo * v.camadas);
  });
  if (caldaVinculada && caldaVinculada.custo > 0) html += linhaAuto('Calda (' + caldaVinculada.nomeReceita + ')', caldaVinculada.custo);
  if (custoCoberturaAuto) html += linhaAuto('Cobertura (' + nomeCoberturaAuto + ')', custoCoberturaAuto);

  const custoIngredientesTotal = custoMassa + custoRecheio1Camada + custoRecheio2Camada
    + (p.recheio1||p.recheio2 ? (recheioRepetido === 'recheio2' ? custoRecheio2Camada : custoRecheio1Camada) : 0)
    + custoVinculados + custoCalda + custoCoberturaAuto;

  html += '<div style="display:flex;justify-content:space-between;padding:8px 0;margin-top:4px;border-top:1.5px solid rgba(212,162,74,.3);font-size:13px;font-weight:800"><span style="color:var(--gold)">Total ingredientes</span><span style="color:var(--gold)">R$ '+custoIngredientesTotal.toFixed(2)+'</span></div>';

  html += '<div style="font-size:11px;font-weight:800;color:var(--gold);letter-spacing:.06em;text-transform:uppercase;margin:18px 0 10px">Descartáveis (Config)</div>';
  html += linhaAuto('Tábua/Cakeboard', tabuaPadrao);
  html += linhaAuto('Embalagem', embalagemPadrao);

  html += '<div style="font-size:11px;font-weight:800;color:var(--gold);letter-spacing:.06em;text-transform:uppercase;margin:18px 0 10px">Decoração — informe manualmente</div>';
  html += linhaEditavel('Diferença no cakeboard/tábua (R$, pode ser negativo — só se diferente do padrão acima)', 'dc-cakeboard', p.custoCakeboard);
  html += linhaEditavel('Diferença na caixa de papel (R$, pode ser negativo)', 'dc-caixa', p.custoCaixa);
  if (p.topo) html += linhaEditavel('Custo real do topo (cobrado R$ ' + (sucreeConfig.topoValor||45).toFixed(2) + ')', 'dc-topo', p.custoRealTopo);
  if (p.flores) html += linhaEditavel('Custo real das flores (cobrado R$ ' + (sucreeConfig.floresValor||50).toFixed(2) + ')', 'dc-flores', p.custoRealFlores);
  if (p.papelaria) html += linhaEditavel('Custo real da papelaria (cobrado R$ ' + (sucreeConfig.papelariaValor||35).toFixed(2) + ')', 'dc-papelaria', p.custoRealPapelaria);
  html += '<div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">Recheio adicional manual (caso especial, além das 3 camadas padrão)</label>'
    + '<input type="text" id="dc-recheio-extra-nome" value="' + (p.recheioExtraNome||'').replace(/"/g,'&quot;') + '" placeholder="Nome do recheio (deixe em branco se não houver)" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px;margin-bottom:6px">'
    + '<div style="display:flex;gap:6px">'
    + '<input type="number" id="dc-recheio-extra-qtd" value="' + (p.recheioExtraQtd??'') + '" min="0" placeholder="Qtd (g)" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px">'
    + '<input type="number" id="dc-recheio-extra-custo" value="' + (p.recheioExtraCusto??'') + '" min="0" step="0.01" placeholder="Custo (R$)" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px">'
    + '</div></div>';

  html += '<div id="dc-resultado" style="margin-top:18px;padding:14px;border-radius:10px;background:rgba(212,162,74,.1);border:1px solid var(--gold)"></div>';

  document.getElementById('modal-item-campos').innerHTML = html;

  // Margem ideal Sucrée fixa em 40%: preço sugerido = custo total ÷ 0,60
  const MARGEM_IDEAL = 0.40;

  function recalcular() {
    const g = function(idc){ const el = document.getElementById(idc); return el ? (parseFloat(el.value)||0) : 0; };
    const custoDescartaveis = tabuaPadrao + embalagemPadrao + g('dc-cakeboard') + g('dc-caixa');
    const custoDecoracao = g('dc-topo') + g('dc-flores') + g('dc-papelaria') + g('dc-recheio-extra-custo');
    // Custo Operacional = 18% sobre o total de ingredientes do pedido (substitui o
    // indireto que antes era calculado individualmente dentro de cada receita).
    const custoOperacional = custoIngredientesTotal * 0.18;
    const custoMaoObraExtra = g('dc-maoobra');
    const custoTotal = custoIngredientesTotal + custoOperacional + custoDescartaveis + custoDecoracao + custoMaoObraExtra;

    const valorTotal = parseFloat(p.valorTotal||0);
    const lucroObtido = valorTotal - custoTotal;
    const precoSugerido = custoTotal / (1 - MARGEM_IDEAL); // custo ÷ 0,60
    const lucroDesejado = precoSugerido - custoTotal; // = precoSugerido × 40%

    document.getElementById('dc-resultado').innerHTML =
      '<div style="font-size:11px;font-weight:800;color:var(--gold);letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Resumo</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--text2)"><span>Custo Ingredientes</span><span>R$ '+custoIngredientesTotal.toFixed(2)+'</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--text2)"><span>Custo Operacional (18%)</span><span>R$ '+custoOperacional.toFixed(2)+'</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--text2)"><span>Custo Descartáveis</span><span>R$ '+custoDescartaveis.toFixed(2)+'</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--text2)"><span>Custo Decoração</span><span>R$ '+custoDecoracao.toFixed(2)+'</span></div>'
      + (custoMaoObraExtra ? '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--text2)"><span>Mão de obra extra</span><span>R$ '+custoMaoObraExtra.toFixed(2)+'</span></div>' : '')
      + '<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;margin-top:4px;border-top:1px solid rgba(212,162,74,.25);font-weight:700"><span style="color:var(--text)">Custo total real</span><span>R$ '+custoTotal.toFixed(2)+'</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--teal)"><span>Preço sugerido (margem 40%)</span><span>R$ '+precoSugerido.toFixed(2)+'</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--teal)"><span>Valor do Lucro Desejado (40%)</span><span>R$ '+lucroDesejado.toFixed(2)+'</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--text2)"><span>Valor cobrado do cliente</span><span style="font-weight:700">R$ '+valorTotal.toFixed(2)+'</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:16px;padding-top:8px;margin-top:4px;border-top:1px solid rgba(212,162,74,.3)"><span style="font-weight:800;color:var(--gold-dark, var(--gold))">Valor do Lucro Obtido</span><span style="font-weight:800;color:'+(lucroObtido>=0?'#5DCAA5':'#E07A7A')+'">R$ '+lucroObtido.toFixed(2)+'</span></div>'
      + (lucroObtido < lucroDesejado ? '<div style="font-size:11px;color:#FF8080;margin-top:6px">⚠️ Abaixo da margem ideal de 40%. Preço sugerido: R$ '+precoSugerido.toFixed(2)+'</div>' : '<div style="font-size:11px;color:var(--teal);margin-top:4px">✅ Dentro ou acima da margem ideal de 40%</div>');
  }
  setTimeout(function(){
    ['dc-cakeboard','dc-caixa','dc-topo','dc-flores','dc-papelaria','dc-recheio-extra-qtd','dc-recheio-extra-custo','dc-maoobra'].forEach(function(idc){
      const el = document.getElementById(idc);
      if (el) el.addEventListener('input', recalcular);
      if (el) el.addEventListener('change', recalcular);
    });
    const elRepetido = document.getElementById('dc-recheio-repetido');
    if (elRepetido) elRepetido.addEventListener('change', function(){
      p.recheioRepetido = elRepetido.value;
      abrirDetalhamentoCusto(id); // reabre recalculando as 3 camadas com a nova escolha
    });
    recalcular();
  }, 0);

  document.getElementById('modal-item-btn-confirmar').textContent = 'Salvar custos';
  document.getElementById('modal-item-btn-confirmar').onclick = function() {
    const g = function(idc){ const el = document.getElementById(idc); return el ? (parseFloat(el.value)||0) : 0; };
    p.recheioRepetido = document.getElementById('dc-recheio-repetido')?.value || p.recheioRepetido || 'recheio1';
    p.custoCakeboard = g('dc-cakeboard');
    p.custoCaixa = g('dc-caixa');
    if (p.topo) p.custoRealTopo = g('dc-topo');
    if (p.flores) p.custoRealFlores = g('dc-flores');
    if (p.papelaria) p.custoRealPapelaria = g('dc-papelaria');
    p.recheioExtraNome = (document.getElementById('dc-recheio-extra-nome')?.value || '').trim() || null;
    p.recheioExtraQtd = g('dc-recheio-extra-qtd') || null;
    p.recheioExtraCusto = g('dc-recheio-extra-custo') || null;
    p.custoMaoObra = g('dc-maoobra');
    savePedidos();
    try {
      sb.from('pedidos_confeitaria').update({
        recheio_repetido: p.recheioRepetido,
        custo_cakeboard: p.custoCakeboard, custo_caixa: p.custoCaixa,
        custo_real_topo: p.custoRealTopo ?? null, custo_real_flores: p.custoRealFlores ?? null,
        custo_real_papelaria: p.custoRealPapelaria ?? null,
        recheio_extra_nome: p.recheioExtraNome, recheio_extra_qtd: p.recheioExtraQtd, recheio_extra_custo: p.recheioExtraCusto,
        custo_mao_obra: p.custoMaoObra
      }).eq('id', id).then(function(){});
    } catch(e) {}
    toast('✅ Custos salvos!');
    fecharModalItemCardapio();
  };
  document.getElementById('modal-item-cardapio').style.display = 'flex';
}

function uploadFotoPedido(id, campo, inputEl, remover) {
  const p = pedidos.find(x => x.id === id);
  if (!p) return;
  const colMap = { fotoConfirmada: 'foto_confirmada', fotoPronto: 'foto_pronto' };
  const col = colMap[campo];
  if (remover) {
    if (!confirm('Remover esta foto?')) return;
    p[campo] = null;
    savePedidos();
    try { sb.from('pedidos_confeitaria').update({ [col]: null }).eq('id', id).then(function(){}); } catch(e) {}
    viewPedido(id);
    return;
  }
  const file = inputEl && inputEl.files && inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    p[campo] = ev.target.result;
    savePedidos();
    try { sb.from('pedidos_confeitaria').update({ [col]: ev.target.result }).eq('id', id).then(function(){}); } catch(e) {}
    toast('✅ Foto adicionada!');
    viewPedido(id);
  };
  reader.readAsDataURL(file);
}

function abrirFotoZoom(src) {
  const win = document.createElement('div');
  win.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  win.onclick = function(){ win.remove(); };
  win.innerHTML = '<img src="' + src + '" style="max-width:100%;max-height:100%;border-radius:8px;object-fit:contain">';
  document.body.appendChild(win);
}

function updatePedidoStatus(id, status) {
  const p = pedidos.find(x=>x.id===id);
  if(!p) return;
  if (status === 'entregue') {
    const faltaTopo = p.topo && (p.custoRealTopo === undefined || p.custoRealTopo === null || p.custoRealTopo === '');
    const faltaFlores = p.flores && (p.custoRealFlores === undefined || p.custoRealFlores === null || p.custoRealFlores === '');
    const faltaPapelaria = p.papelaria && (p.custoRealPapelaria === undefined || p.custoRealPapelaria === null || p.custoRealPapelaria === '');
    if (faltaTopo || faltaFlores || faltaPapelaria) {
      const partes = [];
      if (faltaTopo) partes.push('topo');
      if (faltaFlores) partes.push('flores');
      if (faltaPapelaria) partes.push('papelaria');
      toast('⚠️ Informe o custo real de ' + partes.join(', ') + ' antes de marcar como entregue');
      const sel = document.querySelector('select[onchange*="' + id + '"]');
      if (sel) sel.value = p.status;
      const campo = faltaTopo ? document.getElementById('custo-real-topo') : (faltaFlores ? document.getElementById('custo-real-flores') : document.getElementById('custo-real-papelaria'));
      if (campo) { campo.focus(); campo.style.borderColor = '#A32D2D'; }
      return;
    }
  }
  p.status = status;
  savePedidos();
  updatePedidoStatusCloud(id, status);
  toast('Status atualizado!');
  renderConfeitaria();
}

function copiarLinkCardapio() {
  const link = 'https://herberthg99-prog.github.io/minhas-receitas/cardapio.html';
  navigator.clipboard.writeText(link).then(() => toast('Link copiado!')).catch(() => {
    const el = document.createElement('textarea');
    el.value = link; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    toast('Link copiado!');
  });
}

function compartilharCardapioWhats() {
  const link = 'https://herberthg99-prog.github.io/minhas-receitas/cardapio.html';
  const msg = encodeURIComponent(
    '🎂 *Sucrée Confeitaria*\n\n' +
    'Olá! Que alegria receber você por aqui! ✨\n\n' +
    'Para tornar esse momento ainda mais especial, preparei um cardápio interativo onde você pode montar o bolo dos seus sonhos com toda a calma e carinho que você merece. 🍰\n\n' +
    '👇 Acesse o link abaixo e personalize cada detalhe do seu bolo:\n\n' +
    link + '\n\n' +
    '💛 _Feito com amor e carinho em cada detalhe._\n\n' +
    '— Sucrée Confeitaria'
  );
  window.open('https://wa.me/?text=' + msg, '_blank');
}

function abrirMenuCardapio() {
  document.getElementById('modal-cardapio-share').style.display = 'flex';
}

function abrirCardapioNovAba() {
  window.open('https://herberthg99-prog.github.io/minhas-receitas/cardapio.html', '_blank');
  cm('modal-cardapio-share');
}

// ═══════════════════════════════════════════
// CONFIGURAÇÕES
// ═══════════════════════════════════════════
let sucreeConfig = {
  precos: { 10:{trad:110,prem:140}, 15:{trad:200,prem:240}, 20:{trad:250,prem:280}, 25:{trad:300,prem:335}, 30:{trad:350,prem:390} },
  buttercream: 50, topoValor: 45, floresValor: 50, papelariaValor: 35,
  pixKey: '(27) 9 9521-3194', minDias: 3, sinalPct: 50,
  custos: {
    embalagem:15, tabua:5, acessorios:2, limpeza:3,
    tabuaAro:   { 10:3.95, 15:5.60, 20:7.50, 25:9.75, 30:12.25 },
    embalagemAro:{ 10:4.45, 15:5.37, 20:5.95, 25:6.89, 30:7.87  },
    maoDeObra:  { 10:40,   15:60,   20:80,   25:100,  30:130   },
    margemLucro:30, valorHora:25, indiretoPct:15, margemNegocio:30
  }
};
try {
  const saved = JSON.parse(localStorage.getItem('mr_sucree_config') || 'null');
  if(saved) sucreeConfig = {...sucreeConfig, ...saved};
} catch(e) {}

function saveConfig() {
  localStorage.setItem('mr_sucree_config', JSON.stringify(sucreeConfig));
  try {
    sb.from('config').upsert({
      user_id: USER_ID,
      sucree_config: JSON.stringify(sucreeConfig)
    }, { onConflict: 'user_id' }).then(function(){});
  } catch(e) {}
}

async function loadConfigFromCloud() {
  try {
    const { data } = await sb.from('config').select('sucree_config').eq('user_id', USER_ID).limit(1);
    if (data && data.length && data[0].sucree_config) {
      const cloudCfg = JSON.parse(data[0].sucree_config);
      sucreeConfig = {...sucreeConfig, ...cloudCfg};
      localStorage.setItem('mr_sucree_config', JSON.stringify(sucreeConfig));
    }
  } catch(e) { console.log('loadConfigFromCloud erro:', e.message); }
}

async function trocarSenhaAdmin() {
  var atual   = document.getElementById('cfg-pwd-atual').value;
  var nova    = document.getElementById('cfg-pwd-nova').value;
  var confirma = document.getElementById('cfg-pwd-confirma').value;
  var msg     = document.getElementById('cfg-pwd-msg');
  if (!atual) { msg.style.color='#A32D2D'; msg.textContent='❌ Digite a senha atual.'; return; }
  if (!nova)  { msg.style.color='#A32D2D'; msg.textContent='❌ Digite a nova senha.'; return; }
  if (nova.length < 4) { msg.style.color='#A32D2D'; msg.textContent='❌ Mínimo 4 caracteres.'; return; }
  if (nova !== confirma) { msg.style.color='#A32D2D'; msg.textContent='❌ Senhas não conferem.'; return; }
  var localPwd = getAdminPwd();
  var cloudPwd = '';
  try {
    var res = await sb.from('config').select('admin_pwd').eq('user_id', USER_ID).limit(1);
    if (res.data && res.data.length > 0) cloudPwd = res.data[0].admin_pwd || '';
  } catch(e) {}
  var senhaAtualOk = (localPwd && atual === localPwd) || (cloudPwd && atual === cloudPwd);
  if (!senhaAtualOk) { msg.style.color='#A32D2D'; msg.textContent='❌ Senha atual incorreta.'; document.getElementById('cfg-pwd-atual').value=''; return; }
  msg.style.color='var(--text2)'; msg.textContent='⏳ Salvando...';
  setAdminPwd(nova);
  try {
    await sb.from('config').upsert({ user_id: USER_ID, admin_pwd: nova }, { onConflict: 'user_id' });
    msg.style.color='var(--teal)'; msg.textContent='✅ Senha alterada com sucesso em todos os dispositivos!';
  } catch(e) { msg.style.color='var(--teal)'; msg.textContent='✅ Senha alterada localmente.'; }
  document.getElementById('cfg-pwd-atual').value='';
  document.getElementById('cfg-pwd-nova').value='';
  document.getElementById('cfg-pwd-confirma').value='';
}

async function salvarSenhaConvidado() {
  const p  = document.getElementById('cfg-sp1').value;
  const p2 = document.getElementById('cfg-sp2').value;
  const st = document.getElementById('cfg-pwd-status');
  if (!p) { toast('Informe a senha'); return; }
  if (p !== p2) { toast('Senhas não conferem'); return; }
  if (p.length < 4) { toast('Mínimo 4 caracteres'); return; }
  setGuestPwd(p);
  shareConfig.pwd = p;
  try {
    const uid = (USER_ID||'').trim();
    await sb.from('config').upsert({ user_id: uid, share_pwd: p, admin_pwd: getAdminPwd()||null }, { onConflict: 'user_id' });
    toast('✅ Senha do convidado salva na nuvem!');
  } catch(e) { toast('Senha salva localmente'); }
  if (st) { st.style.color='var(--teal)'; st.innerHTML='<i class="ti ti-lock"></i> Senha definida!'; }
  document.getElementById('cfg-sp1').value='';
  document.getElementById('cfg-sp2').value='';
}

function renderConfigPage() {
  const el = document.getElementById('page-config');
  const p = sucreeConfig.precos;
  el.innerHTML = `
    <div class="st"><i class="ti ti-settings"></i> Configurações da Sucrée</div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btns" style="flex:1;justify-content:center;font-size:13px" onclick="goPage('estoque')"><i class="ti ti-package"></i> Gerenciar Estoque</button>
      <button class="btnp" style="flex:1;justify-content:center;font-size:13px" onclick="goPage('cardapio-cfg')"><i class="ti ti-menu-2"></i> Configurar Cardápio</button>
    </div>

    <div class="card" style="margin-bottom:12px;border:1px solid rgba(163,45,45,.3)">
      <div class="st"><i class="ti ti-shield-lock"></i> Senha do Administrador</div>
      <div class="fg"><label>Senha atual</label><div style="position:relative"><input type="password" id="cfg-pwd-atual" placeholder="Digite sua senha atual" style="width:100%;padding:10px 44px 10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit"><button onclick="var i=document.getElementById('cfg-pwd-atual');i.type=i.type==='password'?'text':'password'" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text2);font-size:18px;cursor:pointer"><i class="ti ti-eye"></i></button></div></div>
      <div class="fg"><label>Nova senha</label><div style="position:relative"><input type="password" id="cfg-pwd-nova" placeholder="Mínimo 4 caracteres" style="width:100%;padding:10px 44px 10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit"><button onclick="var i=document.getElementById('cfg-pwd-nova');i.type=i.type==='password'?'text':'password'" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text2);font-size:18px;cursor:pointer"><i class="ti ti-eye"></i></button></div></div>
      <div class="fg" style="margin-bottom:14px"><label>Confirmar nova senha</label><input type="password" id="cfg-pwd-confirma" placeholder="Repita a nova senha" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit"></div>
      <div id="cfg-pwd-msg" style="font-size:13px;margin-bottom:10px;min-height:18px"></div>
      <button class="btnp" onclick="trocarSenhaAdmin()" style="width:100%;justify-content:center"><i class="ti ti-lock-check"></i> Trocar senha</button>
    </div>

    <div class="card" style="margin-bottom:12px;border:1px solid rgba(200,163,91,.35)">
      <div class="st"><i class="ti ti-lock"></i> Senha do Convidado</div>
      <div class="fg"><label>Nova senha do convidado</label><div style="position:relative"><input type="password" id="cfg-sp1" placeholder="Mínimo 4 caracteres" style="padding-right:44px"><button onclick="var i=document.getElementById('cfg-sp1');i.type=i.type==='password'?'text':'password'" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text2);font-size:18px;cursor:pointer"><i class="ti ti-eye"></i></button></div></div>
      <div class="fg" style="margin-bottom:12px"><label>Confirmar senha</label><input type="password" id="cfg-sp2" placeholder="Repetir senha"></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btnp" onclick="salvarSenhaConvidado()"><i class="ti ti-check"></i> Salvar senha</button>
        <span id="cfg-pwd-status" style="font-size:12px;color:var(--text3)"><i class="ti ti-lock-off"></i> Verificar nas configurações</span>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-table"></i> Tabela de preços dos bolos</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--bg)">
            <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text2)">Aro</th>
            <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text2)">Fatias</th>
            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--teal)">Tradicional</th>
            <th style="padding:8px;text-align:right;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--gold)">Premium</th>
          </tr></thead>
          <tbody>
            ${[[10,'até 3'],[15,'até 10'],[20,'até 20'],[25,'até 30'],[30,'até 45']].map(([aro,fatias]) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid var(--border);font-weight:700">${aro} cm</td>
              <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text2);font-size:12px">${fatias}</td>
              <td style="padding:6px 8px;border-bottom:1px solid var(--border)"><div style="display:flex;align-items:center;gap:4px;justify-content:flex-end"><span style="font-size:12px;color:var(--text2)">R$</span><input type="number" value="${p[aro]?.trad||0}" min="0" step="1" id="preco-${aro}-trad" style="width:70px;padding:5px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-weight:700;text-align:right;font-family:inherit;background:var(--surface);color:var(--teal)" onchange="sucreeConfig.precos[${aro}].trad=parseFloat(this.value)||0"></div></td>
              <td style="padding:6px 8px;border-bottom:1px solid var(--border)"><div style="display:flex;align-items:center;gap:4px;justify-content:flex-end"><span style="font-size:12px;color:var(--text2)">R$</span><input type="number" value="${p[aro]?.prem||0}" min="0" step="1" id="preco-${aro}-prem" style="width:70px;padding:5px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-weight:700;text-align:right;font-family:inherit;background:var(--surface);color:var(--gold)" onchange="sucreeConfig.precos[${aro}].prem=parseFloat(this.value)||0"></div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-hand-finger"></i> Mão de obra de finalização, por aro</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.5">Representa só o trabalho de MONTAR/DECORAR o bolo pronto (não inclui fazer massa, recheio ou calda — isso já está embutido no custo de cada receita).</div>
      <div style="font-size:11px;color:#c0392b;margin-bottom:10px;line-height:1.4">⚠️ Os valores abaixo ainda podem estar com o padrão antigo (R$40 a R$130), que representava o trabalho completo. Revise e diminua para refletir só a finalização.</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--bg)">
            <th style="padding:6px;text-align:left;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;color:var(--text2)">Aro</th>
            <th style="padding:6px;text-align:right;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;color:var(--text2)">Mão de obra (R$)</th>
          </tr></thead>
          <tbody>
            ${[10,15,20,25,30].map(aro => `
            <tr>
              <td style="padding:6px;border-bottom:1px solid var(--border);font-weight:700">${aro} cm</td>
              <td style="padding:4px 6px;border-bottom:1px solid var(--border)"><input type="number" value="${(sucreeConfig.custos.maoDeObra||{})[aro]??''}" min="0" step="0.01" id="qtd-maoobra-${aro}" style="width:72px;padding:5px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:right;font-family:inherit;background:var(--surface);color:var(--text)" placeholder="R$"></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-cash"></i> Valores de adicionais</div>
      <div class="fg"><label>💐 Flores (R$)</label><input type="number" id="cfg-flores-valor" value="${sucreeConfig.floresValor||50}" min="0" step="0.01" style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;background:var(--surface);color:var(--text);width:100%" onchange="sucreeConfig.floresValor=parseFloat(this.value)||50"></div>
      <div class="fg"><label>🎨 Papelaria (R$)</label><input type="number" id="cfg-papelaria-valor" value="${sucreeConfig.papelariaValor||35}" min="0" step="0.01" style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;background:var(--surface);color:var(--text);width:100%" onchange="sucreeConfig.papelariaValor=parseFloat(this.value)||35"></div>
      <div class="fg" style="margin-bottom:0"><label>🪄 Topo (R$)</label><input type="number" id="cfg-topo-valor" value="${sucreeConfig.topoValor||45}" min="0" step="0.01" style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;background:var(--surface);color:var(--text);width:100%" onchange="sucreeConfig.topoValor=parseFloat(this.value)||45"></div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-info-circle"></i> Informações gerais</div>
      <div class="fg"><label>Chave PIX</label><input type="text" id="cfg-pix" value="${sucreeConfig.pixKey}" style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;background:var(--surface);color:var(--text);width:100%" onchange="sucreeConfig.pixKey=this.value"></div>
      <div class="fg" style="margin-bottom:0"><label>Mínimo de dias de antecedência</label><input type="number" id="cfg-dias" value="${sucreeConfig.minDias}" min="1" style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;background:var(--surface);color:var(--text);width:100%" onchange="sucreeConfig.minDias=parseInt(this.value)||3"></div>
    </div>

    <button class="btnp full" onclick="salvarConfig()"><i class="ti ti-device-floppy"></i> Salvar configurações</button>

    <div class="card" style="margin-top:12px;margin-bottom:12px;border:1px solid rgba(200,163,91,.35)">
      <div class="st"><i class="ti ti-link"></i> Link temporário para cliente</div>
      <div class="fg" style="margin-bottom:12px">
        <label>Validade do link</label>
        <select id="cfg-link-validade" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit">
          <option value="6">6 horas</option>
          <option value="12" selected>12 horas</option>
          <option value="24">24 horas (1 dia)</option>
          <option value="48">48 horas (2 dias)</option>
          <option value="72">72 horas (3 dias)</option>
        </select>
      </div>
      <button class="btnp" onclick="gerarLinkTemporario()" style="width:100%;justify-content:center;margin-bottom:10px"><i class="ti ti-link"></i> Gerar link temporário</button>
      <div id="link-gerado-box" style="display:none">
        <div style="background:var(--bg);border:1px solid rgba(200,163,91,.3);border-radius:var(--radius-sm);padding:10px;margin-bottom:8px">
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px">🔗 Link gerado:</div>
          <div id="link-gerado-url" style="font-size:11px;color:var(--gold);word-break:break-all;line-height:1.6"></div>
          <div id="link-gerado-validade" style="font-size:11px;color:var(--teal);margin-top:6px"></div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="copiarLinkTemporario()" class="btnp" style="flex:1;justify-content:center;font-size:13px"><i class="ti ti-copy"></i> Copiar</button>
          <button onclick="compartilharLinkTemporario()" class="btns" style="flex:1;justify-content:center;font-size:13px"><i class="ti ti-brand-whatsapp"></i> Enviar</button>
        </div>
      </div>
    </div>

    <div style="margin-top:10px;text-align:center">
      <button class="btns" style="font-size:12px" onclick="goPage('share')"><i class="ti ti-share"></i> Compartilhar cardápio</button>
    </div>
  `;
}

function salvarConfig() {
  if (!sucreeConfig.custos.maoDeObra) sucreeConfig.custos.maoDeObra = {};
  [10,15,20,25,30].forEach(function(aro){
    var elMaoObra = document.getElementById('qtd-maoobra-'+aro);
    if (elMaoObra) sucreeConfig.custos.maoDeObra[aro] = parseFloat(elMaoObra.value)||0;
  });
  saveConfig();
  localStorage.setItem('mr_sucree_config', JSON.stringify(sucreeConfig));
  toast('Configurações salvas! ✅');
}

// ═══════════════════════════════════════════
// ⚙️ CONFIGURAÇÕES NTFY E WHATSAPP
// ═══════════════════════════════════════════
var NTFY_CANAL      = 'sucree_6a6490b03a94';
var WHATSAPP_SUCREE = '5527995213194'; // ← CORRIGIDO: número fixo

function enviarNotifNtfy(titulo, mensagem, prioridade) {
  try {
    fetch('https://ntfy.sh/' + NTFY_CANAL, {
      method: 'POST',
      headers: {
        'Title': titulo,
        'Priority': prioridade || 'high',
        'Tags': 'cake,moneybag',
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: mensagem
    }).then(function(r){ console.log('Ntfy enviado:', r.status); })
      .catch(function(e){ console.log('Ntfy erro:', e); });
  } catch(e) { console.log('Ntfy erro:', e); }
}

function notificarWhatsApp(p) {
  // 1. Notificação push via Ntfy
  var resumoNtfy = (p.cliente||'Cliente') + ' · Aro ' + (p.aro||'?') + ' · R$ ' + parseFloat(p.valorTotal||0).toFixed(2);
  if (p.data) resumoNtfy += ' · ' + new Date(p.data+'T12:00:00').toLocaleDateString('pt-BR');
  enviarNotifNtfy('Novo Pedido - Sucree', resumoNtfy, 'high');

  // 2. Abrir WhatsApp com detalhes
  try {
    const dataFmt = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const msg = encodeURIComponent(
      '🎂 *NOVO PEDIDO — Sucrée Confeitaria*\n\n'
      + '👤 *Cliente:* ' + (p.cliente||'—') + '\n'
      + '📱 *WhatsApp:* ' + (p.telefone||'—') + '\n'
      + '📅 *Entrega:* ' + dataFmt + (p.hora?' às '+p.hora:'') + '\n'
      + '🚗 *Retirada:* ' + (p.retira?'Sim':'Não — entrego') + '\n'
      + (p.endereco?'📍 *Endereço:* '+p.endereco+'\n':'')
      + '\n🎂 *Bolo:*\n'
      + '• Aro: ' + (p.aro||'—') + '\n'
      + '• Massa: ' + (p.massaNome||p.massa||'—') + '\n'
      + '• Recheio 1: ' + (p.recheio1||'—') + '\n'
      + '• Recheio 2: ' + (p.recheio2||'—') + '\n'
      + '• Cobertura: ' + (p.coberturaNome||p.cobertura||'—') + '\n'
      + (p.tema?'• Tema: '+p.tema+'\n':'')
      + '\n💰 *Financeiro:*\n'
      + '• Total: R$ ' + parseFloat(p.valorTotal||0).toFixed(2) + '\n'
      + '• Sinal: R$ ' + parseFloat(p.sinal||0).toFixed(2) + '\n'
      + '\n🆔 Pedido: ' + p.id
    );
    window.open('https://wa.me/' + WHATSAPP_SUCREE + '?text=' + msg, '_blank');
  } catch(e) { console.log('WhatsApp erro:', e.message); }
}

// Monta a seção HTML da Ficha Técnica de Produção: quanto fazer de massa (e como dividir
// nas 2 formas), recheio por camada (3 camadas, 1 sabor repetido), chocolate nobre
// companheiro, calda total e cobertura final — tudo já calculado para o aro do pedido.
function gerarFichaTecnicaProducaoHtml(p) {
  const aro = parseInt(p.aro) || 0;
  if (!aro) return '';
  function escapeHtml(s){ return String(s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function row(key, val) {
    return '<div class="row"><span class="key">'+escapeHtml(key)+'</span><span class="val">'+escapeHtml(val)+'</span></div>';
  }

  let html = '<div class="sec"><div class="st">🧾 Ficha técnica de produção (aro ' + aro + ')</div>';

  // 1) Massa: quantas vezes fazer a receita + divisão em 2 formas
  const massaNome = (p.massa || '').toLowerCase();
  const ehChiffon = massaNome.indexOf('chiffon') >= 0 || massaNome.indexOf('pão de ló') >= 0 || massaNome.indexOf('fofinha') >= 0;
  const recMassa = p.massa ? (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return (r.name||'').trim().toLowerCase() === p.massa.trim().toLowerCase(); }) : null;
  const vezesReceita = (recMassa && recMassa.multiplicadorAro) ? recMassa.multiplicadorAro[aro] : null;
  const pesoBaseMassa = recMassa ? (recMassa.pesoTotal || recMassa.yield_qty || 0) : 0;
  const massaTotal = (vezesReceita && pesoBaseMassa) ? Math.ceil(vezesReceita * pesoBaseMassa) : 0;
  html += row('Massa total necessária', massaTotal ? (massaTotal + 'g') : '—');
  if (vezesReceita) {
    html += row('Vezes a receita', vezesReceita + 'x' + (ehChiffon ? ' (Chiffon/Pão de Ló)' : ' (Amanteigada)'));
  } else {
    html += '<div style="padding:6px 0;font-size:11px;color:#c0392b;font-style:italic">⚠️ Multiplicador por aro não configurado nesta receita de massa — confira em Receitas → ' + escapeHtml(p.massa||'') + '.</div>';
  }
  if (massaTotal) html += row('Por forma (2 formas)', Math.ceil(massaTotal/2) + 'g cada');
  html += row('Discos após assar', '4 discos (corte cada forma ao meio)');

  // 2) Recheio: 3 camadas, com indicação de qual sabor repete
  if (p.recheio1 || p.recheio2) {
    const recheioRepetido = p.recheioRepetido || 'recheio1';
    const nomeRepetido = recheioRepetido === 'recheio2' ? p.recheio2 : p.recheio1;
    const nomeUnico = recheioRepetido === 'recheio2' ? p.recheio1 : p.recheio2;
    const qtdRecheio1 = p.recheio1 ? getQtdAroDoRecheio(p.recheio1, aro) : null;
    const qtdRecheio2 = p.recheio2 ? getQtdAroDoRecheio(p.recheio2, aro) : null;
    const qtdRepetido = recheioRepetido === 'recheio2' ? qtdRecheio2 : qtdRecheio1;
    const qtdUnico = recheioRepetido === 'recheio2' ? qtdRecheio1 : qtdRecheio2;
    if (nomeRepetido) html += row('Recheio (2 camadas)', nomeRepetido + (qtdRepetido ? ' — ' + qtdRepetido + 'g por camada (' + (qtdRepetido*2) + 'g total)' : ''));
    if (nomeUnico) html += row('Recheio (1 camada)', nomeUnico + (qtdUnico ? ' — ' + qtdUnico + 'g' : ''));

    // Quantas vezes fazer a receita de cada recheio (peso total necessário ÷ pesoTotal da receita)
    [{nome: nomeRepetido, qtdCamada: qtdRepetido, camadas: 2}, {nome: nomeUnico, qtdCamada: qtdUnico, camadas: 1}].forEach(function(item){
      if (!item.nome || !item.qtdCamada) return;
      const recR = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === item.nome; });
      const pesoBaseR = recR ? (recR.pesoTotal || recR.yield_qty) : 0;
      if (!pesoBaseR) return;
      const totalNecessario = item.qtdCamada * item.camadas;
      const vezes = totalNecessario / pesoBaseR;
      html += row('Vezes a receita — ' + item.nome, Number(vezes.toFixed(2)) + 'x (' + totalNecessario + 'g necessários)');
    });

    // Itens vinculados automaticamente a cada recheio (ex: chocolate nobre picado)
    [{nome: p.recheio1, camadas: recheioRepetido==='recheio1'?2:1}, {nome: p.recheio2, camadas: recheioRepetido==='recheio2'?2:1}].forEach(function(item){
      if (!item.nome) return;
      getCustosVinculadosAro(item.nome, aro).forEach(function(v){
        if (v.qtd) html += row(v.nomeReceita + ' (' + item.camadas + 'x)', (v.qtd*item.camadas) + 'g (' + v.qtd + 'g/camada)');
      });
    });
  }

  if (p.recheioExtraNome) {
    html += row('Recheio adicional (caso especial)', p.recheioExtraNome + (p.recheioExtraQtd ? ' — ' + p.recheioExtraQtd + 'g' : ''));
  }

  // 3) Calda total (por disco × 4 discos) — 100% automática, vinda do vínculo cadastrado
  // na receita de Massa (campo caldaVinculada), nunca escolhida pelo cliente.
  const caldaRecFicha = getCaldaVinculadaDaMassa(p.massa);
  const qtdCaldaDisco = caldaRecFicha ? getQtdAroDaReceita(caldaRecFicha.name, aro) : null;
  if (qtdCaldaDisco) {
    html += row('Calda por disco', qtdCaldaDisco + 'g');
    html += row('Calda total (4 discos)', (qtdCaldaDisco*4) + 'g');
  }
  if (caldaRecFicha) html += row('Tipo de calda', caldaRecFicha.name);

  // 4) Cobertura final
  if (p.cobertura) {
    const vincsCobertura = sucreeConfig.receitasCardapio || {};
    const receitaCoberturaNome = p.cobertura === 'chantininho' ? (vincsCobertura.chantininho || 'Chantininho') : (vincsCobertura.buttercream || 'Buttercream');
    const qtdCobertura = getQtdAroDaReceita(receitaCoberturaNome, aro);
    const nomeCobertura = p.cobertura === 'chantininho' ? 'Chantininho' : (p.cobertura === 'buttercream' ? 'Buttercream' : p.cobertura);
    html += row('Cobertura para finalizar', nomeCobertura + (qtdCobertura ? ' — ' + qtdCobertura + 'g' : ''));
  }

  html += '</div>';
  return html;
}

function imprimirPedidoCozinha(id) {
  const p = pedidos.find(x => x.id === id);
  if (!p) return;
  const dataFmt = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const num = '#' + new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getDate()).padStart(2,'0') + '-' + String(Math.floor(Math.random()*999)+1).padStart(3,'0');
  const win = window.open('', '_blank');
  if (!win) { toast('Permita pop-ups para imprimir'); return; }
  const css = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;max-width:400px}.hdr{text-align:center;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #C8A35B}.hdr img{height:60px}.sec{margin-bottom:14px}.st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #eee}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:0.5px solid #f5f5f5}.key{color:#666}.val{font-weight:700;text-align:right;max-width:60%}.ftr{text-align:center;margin-top:16px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#aaa}.receita-box{background:#fafafa;border:1px solid #eee;border-radius:8px;padding:10px 12px;margin-bottom:10px}.receita-nome{font-weight:800;font-size:13px;color:#2C1800;margin-bottom:6px}.receita-ingr{font-size:12px;color:#444;padding:2px 0}.receita-preparo{font-size:11px;color:#555;margin-top:6px;padding-top:6px;border-top:1px dashed #ddd;white-space:pre-wrap;line-height:1.5}@media print{body{padding:0}}';
  let html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pedido — '+p.cliente+'</title><style>'+css+'</style></head><body>';
  html += '<div class="hdr"><img src="https://herberthg99-prog.github.io/minhas-receitas/logo.png" alt="Sucrée"><h1 style="font-size:18px;color:#2C1800;margin-top:6px">Pedido para Cozinha</h1><div style="font-size:11px;color:#888">'+num+' · '+new Date().toLocaleDateString('pt-BR')+'</div></div>';
  html += '<div class="sec"><div class="st">👤 Cliente</div>';
  html += '<div class="row"><span class="key">Nome</span><span class="val">'+(p.cliente||'—')+'</span></div>';
  html += '<div class="row"><span class="key">Entrega</span><span class="val">'+dataFmt+(p.hora?' às '+p.hora:'')+'</span></div>';
  html += '<div class="row"><span class="key">Retirada</span><span class="val">'+(p.retira?'✅ Retira':'🚗 Entrego')+'</span></div>';
  if(p.telefone) html += '<div class="row"><span class="key">Telefone</span><span class="val">'+p.telefone+'</span></div>';
  html += '</div><div class="sec"><div class="st">🎂 Bolo</div>';
  if(p.aro) html += '<div class="row"><span class="key">Tamanho</span><span class="val">Aro '+p.aro+' cm</span></div>';
  if(p.massa) html += '<div class="row"><span class="key">Massa</span><span class="val">'+p.massa+'</span></div>';
  if(p.recheio1) html += '<div class="row"><span class="key">Recheio 1</span><span class="val">'+p.recheio1+'</span></div>';
  if(p.recheio2) html += '<div class="row"><span class="key">Recheio 2</span><span class="val">'+p.recheio2+'</span></div>';
  if(p.cobertura) html += '<div class="row"><span class="key">Cobertura</span><span class="val">'+(p.cobertura==='chantininho'?'🍦 Chantininho':'🧁 Buttercream')+'</span></div>';
  html += '</div>';
  if(p.tema||p.obsDeco) { html += '<div class="sec"><div class="st">🎨 Decoração</div>'; if(p.tema) html += '<div class="row"><span class="key">Tema</span><span class="val">'+p.tema+'</span></div>'; if(p.obsDeco) html += '<div style="padding:8px;background:#fffbe6;border-radius:6px;font-size:12px;font-style:italic;margin-top:6px">'+p.obsDeco+'</div>'; html += '</div>'; }

  // ─── FICHA TÉCNICA DE PRODUÇÃO: quanto fazer de cada coisa para este aro específico ───
  html += gerarFichaTecnicaProducaoHtml(p);

  // ─── RECEITAS: busca pelo nome cadastrado, mostra ingredientes + modo de preparo ───
  function escapeHtml(s){ return String(s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function blocoReceita(nomeBusca) {
    if (!nomeBusca) return '';
    const rec = recipes.find(function(r){ return (r.name||'').trim().toLowerCase() === nomeBusca.trim().toLowerCase(); });
    if (!rec) return '<div class="receita-box"><div class="receita-nome">'+escapeHtml(nomeBusca)+'</div><div class="receita-ingr" style="color:#999;font-style:italic">Receita não encontrada no cadastro — confira com a confeiteira.</div></div>';
    const ingredientesHtml = (rec.ingredients||[]).map(function(ing){
      return '<div class="receita-ingr">• '+escapeHtml(ing.name||'')+' — '+escapeHtml(ing.qty||'')+' '+escapeHtml(ing.unit||'')+'</div>';
    }).join('');
    const preparoHtml = rec.preparo ? '<div class="receita-preparo">'+escapeHtml(rec.preparo)+'</div>' : '';
    return '<div class="receita-box"><div class="receita-nome">'+escapeHtml(rec.name)+'</div>'+ingredientesHtml+preparoHtml+'</div>';
  }
  let receitasHtml = '';
  if (p.massa) receitasHtml += blocoReceita(p.massa);
  if (p.recheio1) receitasHtml += blocoReceita(p.recheio1);
  if (p.recheio2) receitasHtml += blocoReceita(p.recheio2);
  if (receitasHtml) {
    html += '<div class="sec"><div class="st">📖 Receitas</div>' + receitasHtml + '</div>';
  }

  html += '<div class="ftr">Sucrée Confeitaria · Vitória – ES<br><strong>✅ CONFIRMADO PARA PRODUÇÃO</strong></div>';
  html += '<scr'+'ipt>window.onload=()=>window.print()<'+'/scr'+'ipt></body></html>';
  win.document.write(html);
  win.document.close();
}

// ═══════════════════════════════════════════
// LINK TEMPORÁRIO
// ═══════════════════════════════════════════
function gerarLinkTemporario() {
  var horas = parseInt(document.getElementById('cfg-link-validade').value) || 12;
  var agora = Date.now();
  var expira = agora + (horas * 60 * 60 * 1000);
  var token = btoa(String(expira)).replace(/[^a-zA-Z0-9]/g,'').substring(0, 16);
  var base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  var link = base + 'cardapio.html?token=' + token + '&exp=' + expira;
  var tokens = [];
  try { tokens = JSON.parse(localStorage.getItem('mr_tokens_ativos') || '[]'); } catch(e) {}
  tokens = tokens.filter(function(t){ return t.exp > agora; });
  tokens.push({ token: token, exp: expira, horas: horas, criado: agora });
  localStorage.setItem('mr_tokens_ativos', JSON.stringify(tokens));
  var box = document.getElementById('link-gerado-box');
  var urlEl = document.getElementById('link-gerado-url');
  var valEl = document.getElementById('link-gerado-validade');
  if (box) box.style.display = 'block';
  if (urlEl) urlEl.textContent = link;
  var expDate = new Date(expira);
  var expFmt = expDate.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' às ' + expDate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if (valEl) valEl.textContent = '⏰ Válido por ' + horas + 'h — expira em ' + expFmt;
  window._linkTemporario = link;
  window._linkExpira = expFmt;
  window._linkHoras = horas;
}

function copiarLinkTemporario() {
  var link = window._linkTemporario;
  if (!link) { toast('Gere o link primeiro'); return; }
  navigator.clipboard.writeText(link).then(function(){ toast('✅ Link copiado!'); }).catch(function(){
    var el = document.createElement('textarea');
    el.value = link; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    toast('✅ Link copiado!');
  });
}

function compartilharLinkTemporario() {
  var link = window._linkTemporario;
  var horas = window._linkHoras || 12;
  var expira = window._linkExpira || '';
  if (!link) { toast('Gere o link primeiro'); return; }
  var msg = '✨ *Sucrée Confeitaria*\n\nOlá! 💛\n\nPreparei um link exclusivo do nosso cardápio para você:\n\n🎂 *Monte o bolo dos seus sonhos:*\n👉 ' + link + '\n\n⏰ _Válido por ' + horas + 'h_ (até ' + expira + ')\n\n_Com carinho, Sucrée Confeitaria_ 🎂';
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function simularPrecificacao() {
  var c = sucreeConfig.custos || {};
  var ingr = 50, horas = 2;
  var valorHora = c.valorHora || 25;
  var indiretoPct = c.indiretoPct || 15;
  var margem = c.margemNegocio || 30;
  var indireto = ingr * indiretoPct / 100;
  var mdo = horas * valorHora;
  var custoTotal = ingr + indireto + mdo;
  var precoMin = custoTotal / (1 - margem / 100);
  var lucro = precoMin - custoTotal;
  var el = document.getElementById('sim-precificacao');
  if (el) el.innerHTML =
    '💸 Ingredientes: <strong>R$ '+ingr.toFixed(2)+'</strong><br>' +
    '⚡ Indireto ('+indiretoPct+'%): <strong>R$ '+indireto.toFixed(2)+'</strong><br>' +
    '👩‍🍳 Mão de obra ('+horas+'h × R$'+valorHora+'): <strong>R$ '+mdo.toFixed(2)+'</strong><br>' +
    '📊 Custo total: <strong>R$ '+custoTotal.toFixed(2)+'</strong><br>' +
    '💰 <span style="color:var(--gold);font-weight:700">Preço mínimo: R$ '+precoMin.toFixed(2)+'</span><br>' +
    '📈 <span style="color:var(--teal)">Lucro: R$ '+lucro.toFixed(2)+'</span>';
}

function renderVinculoRecheios() {
  var recheiosNomes = [...new Set(
    recipes.filter(function(r){ return isGrupoRecheio(r.group); })
           .map(function(r){ return r.name; })
  )].sort();
  if (!recheiosNomes.length) return '<div style="font-size:12px;color:var(--text3)">Nenhuma receita de recheio cadastrada ainda.</div>';
  var vincs = sucreeConfig.receitasCardapio || {};
  return recheiosNomes.map(function(nome) {
    var cur = vincs['recheio_' + nome] || nome;
    return '<div class="fg" style="margin-bottom:8px">'
      + '<label style="font-size:12px">Recheio cardápio: <strong>' + nome + '</strong></label>'
      + '<select id="cfg-vinc-' + nome.replace(/[^a-zA-Z0-9]/g,'_') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;background:var(--surface);color:var(--text);font-family:inherit">'
      + '<option value="">— Usar esta mesma receita —</option>'
      + recipes.filter(function(r){ return isGrupoRecheio(r.group); })
               .map(function(r){ return '<option value="'+r.name+'"'+(r.name===cur?' selected':'')+'>' + r.name + '</option>'; })
               .join('')
      + '</select></div>';
  }).join('');
}

window._estoqueSelected = new Set();

function toggleEstoqueSelect(key, checked) {
  if(checked) window._estoqueSelected.add(key);
  else window._estoqueSelected.delete(key);
  updateSelCount();
  const item = document.getElementById('est-item-' + key.replace(/[^a-z0-9]/g,'_'));
  if(item) item.style.borderColor = checked ? 'var(--coral)' : '';
  if(item) item.style.borderWidth = checked ? '2px' : '';
}

function updateSelCount() {
  const el = document.getElementById('sel-count');
  if(el) el.textContent = window._estoqueSelected.size;
}

function toggleSelectAll(val) {
  const allKeys = Object.keys(estoque);
  const filtro = window._estoqueFiltro || 'todos';
  const keys = filtro === 'sem_preco' ? allKeys.filter(k => !estoque[k].price || estoque[k].price === 0)
    : (filtro === 'vencido' ? allKeys.filter(k => (estoque[k].price && estoque[k].price > 0) && precoVencido(estoque[k]))
    : allKeys);
  window._estoqueSelected = val ? new Set(keys) : new Set();
  renderEstoque();
}

function selectSemPreco() {
  window._estoqueSelected = new Set(Object.keys(estoque).filter(k => !estoque[k].price || estoque[k].price === 0));
  renderEstoque();
  toast(window._estoqueSelected.size + ' ingrediente(s) sem preço selecionados');
}

// Busca preços via IA para uma lista arbitrária de chaves de estoque (usado tanto pela tela
// Estoque quanto pelo fluxo automático de "ingrediente novo" ao salvar receita).
async function buscarPrecosIAIngredientes(keys) {
  if (!keys || !keys.length) return 0;
  const names = keys.map(k => estoque[k]?.name).filter(Boolean);
  if (!names.length) return 0;
  try {
    const r = await fetch('/api/claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `Pesquise preços atuais de supermercado no Espírito Santo, Brasil para: ${names.join(', ')}. Data: ${new Date().toLocaleDateString('pt-BR')}. Retorne APENAS JSON sem markdown: {"nome_ingrediente": preco_por_kg_em_reais}`,
        maxTokens: 800, useWebSearch: true
      })
    });
    if (!r.ok) {
      toast('⚠️ Busca de preço por IA não disponível agora. Preencha o preço manualmente em Estoque ou na receita.', 5000);
      return 0;
    }
    const d = await r.json();
    const txt = d.resultado || '';
    let map; try { map = JSON.parse(txt.replace(/```json|```/g, '').trim()); } catch { throw new Error('Formato inválido'); }
    let n = 0;
    keys.forEach(key => {
      const igName = (estoque[key]?.name||'').toLowerCase();
      const match = Object.keys(map).find(k => igName.includes(k.toLowerCase()) || k.toLowerCase().includes(igName));
      if (match && map[match] > 0) {
        const priceKg = map[match];
        estoque[key].price = priceKg / 1000;
        estoque[key].updatedAt = new Date().toISOString();
        n++;
      }
    });
    saveEstoque();
    toast(n + ' de ' + keys.length + ' preços estimados por IA!');
    return n;
  } catch(err) {
    toast('⚠️ Busca de preço por IA não disponível agora. Preencha o preço manualmente em Estoque ou na receita.', 5000);
    return 0;

  }
}

async function atualizarEstoqueIASelecionados() {
  const selected = [...window._estoqueSelected];
  if(!selected.length) { toast('Selecione pelo menos um ingrediente'); return; }
  const btn = document.getElementById('btn-upd-estoque');
  const bar = document.getElementById('ai-estoque-bar');
  const msg = document.getElementById('ai-estoque-msg');
  btn.disabled = true; bar.style.display = 'flex';
  msg.textContent = 'Buscando preços para ' + selected.length + ' ingrediente(s) no ES...';
  const names = selected.map(k => estoque[k]?.name).filter(Boolean);
  try {
    const r = await fetch('/api/claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `Pesquise preços atuais de supermercado no Espírito Santo, Brasil para: ${names.join(', ')}. Data: ${new Date().toLocaleDateString('pt-BR')}. Retorne APENAS JSON sem markdown: {"nome_ingrediente": preco_por_kg_em_reais}`,
        maxTokens: 800, useWebSearch: true
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Erro ao buscar preços');
    const txt = d.resultado || '';
    let map; try { map = JSON.parse(txt.replace(/```json|```/g, '').trim()); } catch { throw new Error('Formato inválido'); }
    let n = 0;
    selected.forEach(key => {
      const igName = (estoque[key]?.name||'').toLowerCase();
      const match = Object.keys(map).find(k => igName.includes(k.toLowerCase()) || k.toLowerCase().includes(igName));
      if (match && map[match] > 0) {
        const priceKg = map[match];
        estoque[key].price = priceKg / 1000;
        estoque[key].updatedAt = new Date().toISOString();
        n++;
      }
    });
    saveEstoque();
    msg.textContent = n + ' de ' + selected.length + ' preços atualizados!';
    setTimeout(() => { bar.style.display = 'none'; renderEstoque(); }, 2000);
    toast(n + ' preços atualizados!');
  } catch(err) {
    msg.textContent = 'Erro: ' + err.message;
    setTimeout(() => { bar.style.display = 'none'; }, 3000);
  } finally { btn.disabled = false; }
}

function saveGuestPwd() {
  const p1 = document.getElementById('sp1')?.value;
  const p2 = document.getElementById('sp2')?.value;
  if (!p1) { toast('Informe a senha'); return; }
  if (p1 !== p2) { toast('Senhas não conferem'); return; }
  setGuestPwd(p1);
  shareConfig.pwd = p1;
  saveConfigToCloud();
  const el = document.getElementById('pws');
  if(el) el.style.display = 'inline';
  toast('Senha do convidado salva!');
}

function fecharCozinha() {
  const el = document.getElementById('cozinha-overlay');
  if (el) el.remove();
}

function imprimirReceita() {
  const vt = document.getElementById('vt');
  const id = vt ? vt.dataset.rid : null;
  if (!id) { toast('Erro ao identificar receita'); return; }
  const r = recipes.find(x => x.id === id);
  if (!r) return;
  const ratio = getRatio(r);
  const p = calcAt(r, ratio);
  const pct = p.cost > 0 ? (p.luc / p.cost * 100).toFixed(0) : 0;
  const passos = (r.preparo || '').split('\n').filter(l => l.trim());
  const win = window.open('', '_blank');
  if (!win) { toast('Permita pop-ups para imprimir'); return; }
  const css = "*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;padding:20px}.page{max-width:680px;margin:0 auto}.hdr{background:linear-gradient(135deg,#1A1208,#2C1E0A);padding:28px 36px;text-align:center;border-radius:12px;margin-bottom:20px}.logo{width:110px;height:auto;margin-bottom:10px}.rtitle{font-family:'Georgia',serif;font-size:26px;color:#F0E6CC;margin-bottom:3px}.rsub{font-size:11px;color:#B8972A;letter-spacing:.2em;text-transform:uppercase}.body{padding:0 0 28px}.sec{font-family:'Georgia',serif;font-size:15px;color:#1a1a1a;margin-bottom:12px;padding-bottom:5px;border-bottom:1.5px solid #f0ebe0}table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}th{text-align:left;font-size:9px;font-weight:700;color:#C8A35B;text-transform:uppercase;padding:7px 9px;border-bottom:1.5px solid #f0ebe0}td{padding:7px 9px;border-bottom:0.5px solid #f5f0e8}.passo{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px;padding:11px 13px;background:#FDFAF5;border-radius:8px;border-left:3px solid #C8A35B}.pl{font-family:'Georgia',serif;font-size:17px;font-weight:700;color:#C8A35B;flex-shrink:0;min-width:22px}.pt{font-size:12px;line-height:1.8;color:#333}@media print{body{padding:0}.page{box-shadow:none}}";
  const passosH = passos.map((ln,i) => '<div class="passo"><span class="pl">'+String.fromCharCode(65+i)+'</span><span class="pt">'+ln.trim()+'</span></div>').join('');
  const ingrsH = p.scaled.map(ig => {
    const q = parseFloat(ig.qty||0);
    const sub = q * parseFloat(ig.price||0);
    return '<tr><td>'+(ig.isBase?'⭐ ':'')+ig.name+'</td><td>'+(q>=100?q.toFixed(0):q>=10?q.toFixed(1):q.toFixed(2))+' '+(ig.unit||'')+'</td><td style="text-align:right;color:#C8A35B">'+(sub>0?'R$ '+sub.toFixed(2):'—')+'</td></tr>';
  }).join('');
  let html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>'+r.name+'</title><style>'+css+'</style></head><body>'
    + '<div class="page"><div class="hdr"><img src="https://herberthg99-prog.github.io/minhas-receitas/logo.png" class="logo" alt="Sucrée"><div class="rtitle">'+r.name+'</div><div class="rsub">'+r.cat+(r.group?' · '+r.group:'')+'</div></div>'
    + '<div class="body">'
    + (p.scaled.length?'<div class="sec">Ingredientes</div><table><thead><tr><th>Ingrediente</th><th>Quantidade</th><th style="text-align:right">Custo</th></tr></thead><tbody>'+ingrsH+'</tbody></table>':'')
    + (passos.length?'<div class="sec" style="margin-bottom:12px">Modo de Preparo</div>'+passosH:'')
    + '</div></div>'
    + '<scr'+'ipt>window.onload=()=>window.print()<'+'/scr'+'ipt></body></html>';
  win.document.write(html);
  win.document.close();
}

function toggleFullReceita() {
  const vt = document.getElementById('vt');
  const id = vt ? vt.dataset.rid : null;
  if (!id) return;
  const r = recipes.find(x => x.id === id);
  if (!r) return;
  abrirModoCoZinha(r);
}

function abrirModoCoZinha(r) {
  const ratio = getRatio(r);
  const p = calcAt(r, ratio);
  const passos = (r.preparo || '').split('\n').filter(l => l.trim());
  const ingrsHTML = p.scaled.map(ig => {
    const q = parseFloat(ig.qty||0);
    return '<div style="display:flex;align-items:center;padding:11px 0;border-bottom:0.5px solid rgba(200,163,91,.18)">'
      + '<span style="font-size:17px;font-weight:800;color:#C8A35B;min-width:110px;flex-shrink:0;text-align:right;padding-right:16px;font-family:Georgia,serif">' + fmtQtd(q, ig.unit) + '</span>'
      + '<span style="font-size:16px;color:#F0E6CC;' + (ig.isBase?'font-weight:800':'') + '">' + (ig.isBase?'⭐ ':'') + ig.name + '</span>'
      + '</div>';
  }).join('');
  const passosHTML = passos.map((ln, i) =>
    '<div style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;background:rgba(255,255,255,.05);border-radius:8px;border-left:3px solid #C8A35B;margin-bottom:8px">'
    + '<span style="font-size:18px;font-weight:800;color:#C8A35B;flex-shrink:0;min-width:26px;font-family:Georgia,serif">' + String.fromCharCode(65+i) + ')</span>'
    + '<span style="font-size:15px;line-height:1.8;color:#D4C8A8">' + ln.trim() + '</span>'
    + '</div>'
  ).join('');
  let overlay = document.getElementById('cozinha-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cozinha-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1A1208;z-index:9999;overflow-y:auto;-webkit-overflow-scrolling:touch';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = '<div style="background:rgba(26,18,8,.95);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;border-bottom:1px solid rgba(200,163,91,.25)">'
    + '<div style="font-family:Georgia,serif;font-size:17px;font-weight:700;color:#F5EDD8">' + r.name + '</div>'
    + '<button onclick="fecharCozinha()" style="background:rgba(255,255,255,.08);border:1px solid rgba(200,163,91,.3);color:#C8A35B;width:38px;height:38px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'
    + '</div>'
    + '<div style="padding:20px 18px;max-width:680px;margin:0 auto">'
    + '<div style="margin-bottom:28px"><div style="margin-bottom:14px;font-family:Georgia,serif;font-size:22px;color:#FAF5E8;font-weight:700">Ingredientes</div>' + ingrsHTML + '</div>'
    + (passos.length ? '<div><div style="margin-bottom:14px;font-family:Georgia,serif;font-size:22px;color:#FAF5E8;font-weight:700">Modo de Preparo</div>' + passosHTML + '</div>' : '')
    + '</div>';
  overlay.style.display = 'block';
}
