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
const ADMIN_PWD_KEY  = 'mr_admin_pwd';
const GUEST_PWD_KEY  = 'mr_guest_pwd';
const SESSION_KEY    = 'mr_session';
const SESSION_ROLE   = 'mr_role';

let currentLoginRole = 'admin';

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

  if (role === 'admin') {
    adminBtn.style.background = 'var(--coral)';
    adminBtn.style.color = '#fff';
    adminBtn.style.borderColor = 'var(--coral)';
    guestBtn.style.background = 'var(--bg)';
    guestBtn.style.color = 'var(--text2)';
    guestBtn.style.borderColor = 'var(--border)';
    label.textContent = 'Senha do Administrador';
    hint.textContent = 'Acesso completo ao app de receitas';

    const hasPwd = !!getAdminPwd();
    setup.style.display = hasPwd ? 'none' : 'block';
    confirm.style.display = hasPwd ? 'none' : 'block';
    loginBtn.textContent = hasPwd ? 'Entrar como Admin' : 'Criar senha e entrar';
    forgot.style.display = hasPwd ? 'inline-block' : 'none';
    if (!hasPwd) {
      hint.textContent = 'Se já tem senha em outro dispositivo, digite ela aqui.';
      setup.innerHTML = '<p>👋 Primeira vez neste dispositivo?</p><span style="font-size:12px;color:var(--text2)">Se já criou senha em outro dispositivo, basta digitar ela. Se for a primeira vez, crie uma senha nova.</span>';
      confirm.style.display = 'none';
      loginBtn.textContent = 'Entrar / Criar senha';
    }
  } else {
    guestBtn.style.background = 'var(--blue)';
    guestBtn.style.color = '#fff';
    guestBtn.style.borderColor = 'var(--blue)';
    adminBtn.style.background = 'var(--bg)';
    adminBtn.style.color = 'var(--text2)';
    adminBtn.style.borderColor = 'var(--border)';
    label.textContent = 'Senha de Convidado';
    hint.textContent = 'Acesso apenas às receitas compartilhadas';
    setup.style.display = 'none';
    confirm.style.display = 'none';
    loginBtn.textContent = 'Entrar como Convidado';
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
// ESTOQUE
// ═══════════════════════════════════════════
let estoque = {};

function loadEstoque() {
  try { estoque = JSON.parse(localStorage.getItem('mr_estoque') || '{}'); } catch(e) { estoque = {}; }
}

function saveEstoque() {
  try { localStorage.setItem('mr_estoque', JSON.stringify(estoque)); } catch(e) {}
}

function syncEstoqueFromRecipes() {
  recipes.forEach(r => {
    (r.ingredients || []).forEach(ig => {
      if (!ig.name) return;
      const key = ig.name.trim().toLowerCase();
      if (!estoque[key]) {
        estoque[key] = { name: ig.name.trim(), price: ig.price || 0, unit: ig.unit || 'g', updatedAt: null, usedIn: [] };
      } else {
        if (ig.price > 0 && !estoque[key].price) estoque[key].price = ig.price;
        estoque[key].name = ig.name.trim();
      }
      if (!estoque[key].usedIn) estoque[key].usedIn = [];
      if (!estoque[key].usedIn.includes(r.name)) estoque[key].usedIn.push(r.name);
    });
  });
  saveEstoque();
}

function applyEstoqueToRecipes() {
  let updated = 0;
  recipes.forEach(r => {
    (r.ingredients || []).forEach(ig => {
      if (!ig.name) return;
      const key = ig.name.trim().toLowerCase();
      if (estoque[key] && estoque[key].price > 0) { ig.price = estoque[key].price; updated++; }
    });
  });
  return updated;
}

function renderEstoque() {
  syncEstoqueFromRecipes();
  const el = document.getElementById('page-estoque');
  const keys = Object.keys(estoque).sort((a,b) => a.localeCompare(b));
  const total = keys.length;
  const semPreco = keys.filter(k => !estoque[k].price || estoque[k].price === 0).length;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:16px;font-weight:700">${total} ingrediente(s)</div>
        <div style="font-size:12px;color:var(--text2)">${semPreco} sem preço · <span id="sel-count">0</span> selecionado(s)</div>
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
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <button class="rb" onclick="toggleSelectAll(true)" style="font-size:12px"><i class="ti ti-checkbox"></i> Selecionar todos</button>
      <button class="rb" onclick="toggleSelectAll(false)" style="font-size:12px"><i class="ti ti-square"></i> Desmarcar todos</button>
      <button class="rb" onclick="selectSemPreco()" style="font-size:12px"><i class="ti ti-alert-circle"></i> Sem preço</button>
    </div>
    <div id="ai-estoque-bar" class="ai-bar" style="display:none"><div class="ai-dot pulse"></div><span id="ai-estoque-msg">Buscando preços no ES...</span></div>
    ${!keys.length ? '<div class="est"><i class="ti ti-package"></i><p>Nenhum ingrediente ainda.</p></div>' :
      keys.map(k => renderEstoqueItem(k)).join('')
    }`;
}

function renderEstoqueItem(key) {
  const ig = estoque[key];
  const priceKg = ig.price ? (ig.price * 1000).toFixed(2) : '';
  const updStr = ig.updatedAt ? new Date(ig.updatedAt).toLocaleDateString('pt-BR') : null;
  let estoqueSelected = window._estoqueSelected || new Set();
  window._estoqueSelected = estoqueSelected;
  const isChecked = estoqueSelected.has(key);
  return `<div class="estoque-item" id="est-item-${key.replace(/[^a-z0-9]/g,'_')}" style="${isChecked?'border-color:var(--gold);border-width:2px':''}">
    <div class="estoque-item-header">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <input type="checkbox" ${isChecked?'checked':''} onchange="toggleEstoqueSelect('${key}',this.checked)"
          style="width:18px;height:18px;accent-color:var(--gold);margin-top:2px;flex-shrink:0;cursor:pointer">
        <div>
          <div class="estoque-item-name">${ig.name}</div>
          <div class="estoque-item-meta">
            <span>${ig.unit || 'g'}</span>
            ${updStr ? `<span><i class="ti ti-clock" style="font-size:10px"></i> ${updStr}</span>` : '<span class="estoque-badge-new">Sem atualização</span>'}
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

function updateEstoquePrice(key, priceKg) {
  if (!estoque[key]) return;
  estoque[key].price = priceKg / 1000;
  estoque[key].updatedAt = new Date().toISOString();
  saveEstoque();
  recipes.forEach(r => {
    (r.ingredients || []).forEach(ig => {
      if (ig.name && ig.name.trim().toLowerCase() === key) ig.price = priceKg / 1000;
    });
  });
  const itemEl = document.getElementById('est-item-' + key.replace(/[^a-z0-9]/g,'_'));
  if (itemEl) itemEl.outerHTML = renderEstoqueItem(key);
  toast('Preço atualizado em todas as receitas!');
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
  estoque[key] = { name: nome.trim(), price: 0, unit: 'g', updatedAt: null, usedIn: [] };
  saveEstoque();
  renderEstoque();
  toast('Ingrediente adicionado!');
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

async function deletePedidoFromCloud(id) {
  try { await sb.from('pedidos_confeitaria').delete().eq('id', id); } catch(e) {}
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
  var c = sucreeConfig.custos || {};
  var emb  = ((c.embalagemAro||{})[aro] !== undefined ? (c.embalagemAro||{})[aro] : c.embalagem ?? 15);
  var tab  = ((c.tabuaAro||{})[aro]     !== undefined ? (c.tabuaAro||{})[aro]     : c.tabua     ?? 3);
  var fixo = emb + tab + (c.acessorios||2) + (c.energia||8) + (c.gas||5) + (c.limpeza||3);
  var mdo  = (c.maoDeObra||{})[aro] || 0;
  return fixo + mdo;
}

function getCustoRecheioAro(nomeRecheio, aro) {
  var vincs = sucreeConfig.receitasCardapio || {};
  var key = (nomeRecheio||'').replace(/[^a-zA-Z0-9]/g,'_');
  var receitaNome = vincs['recheio_' + key] || nomeRecheio;
  if (!receitaNome) return 0;
  var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === receitaNome; });
  if (!rec) return 0;
  var p = typeof calcAt === 'function' ? calcAt(rec, 1) : null;
  if (!p || !p.cost || !rec.yield_qty) return 0;
  var custoPorGrama = p.cost / rec.yield_qty;
  var qtdAro = (sucreeConfig.custos?.recheioAro || {})[aro] || 0;
  if (!qtdAro) return p.cost;
  return custoPorGrama * qtdAro;
}

function getCustoCaldaAro(tipocalda, aro) {
  var vincs = sucreeConfig.receitasCardapio || {};
  var receitaNome = tipocalda === 'chocolate' ? (vincs.caldaChoco || 'Calda de Chocolate') : (vincs.caldaBranca || 'Calda Branca de Ninho');
  var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === receitaNome; });
  if (!rec) return 0;
  var p = typeof calcAt === 'function' ? calcAt(rec, 1) : null;
  if (!p || !p.cost || !rec.yield_qty) return 0;
  var qtdAro = (sucreeConfig.custos?.caldaAro || {})[aro] || 0;
  if (!qtdAro) return 0;
  return (p.cost / rec.yield_qty) * qtdAro;
}

function getCustoChantillyAro(aro) {
  var qtd = (sucreeConfig.custos?.chantillyAro || {})[aro] || 0;
  return qtd * 0.025;
}

function calcPedidoTotal() {
  const valorBolo = parseFloat(document.getElementById('p-valor-bolo')?.value||0);
  const custoInput = parseFloat(document.getElementById('p-custo')?.value||0);
  const flores = curPedido.flores ? (sucreeConfig.floresValor||50) : 0;
  const papelaria = curPedido.papelaria ? 35 : 0;
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
  var tipoCaldaPed   = curPedido.calda || 'branca';
  var custoCalda     = getCustoCaldaAro(tipoCaldaPed, aro);
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

function getRecheios() {
  const todos = recipes.map(r => r.name);
  return [...new Set(todos)];
}

function populateRecheioSelects() {
  const recheios = getRecheios();
  const opts = recheios.map(r => `<option value="${r}">${r}</option>`).join('');
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
  const flores = curPedido.flores ? 50 : 0;
  const papelaria = curPedido.papelaria ? 35 : 0;
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

async function delPedido(id) {
  if(!confirm('Excluir este pedido?')) return;
  if (!window._deletedPedidoIds) window._deletedPedidoIds = new Set();
  window._deletedPedidoIds.add(id);
  try { await sb.from('pedidos_confeitaria').delete().eq('id', id); } catch(e) {}
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
    <div class="st"><i class="ti ti-currency-dollar"></i> Financeiro</div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      <div class="total-row grand"><span>TOTAL</span><span>R$ ${parseFloat(p.valorTotal||0).toFixed(2)}</span></div>
      ${p.sinal>0?`<div class="total-row saldo"><span>✅ Sinal pago</span><span>R$ ${parseFloat(p.sinal).toFixed(2)}</span></div>`:''}
      ${p.sinal>0?`<div class="total-row" style="color:var(--gold);font-weight:700"><span>💳 Restante</span><span>R$ ${(parseFloat(p.valorTotal||0)-parseFloat(p.sinal||0)).toFixed(2)}</span></div>`:''}
    </div>
    ${(p.topo || p.flores) ? `
    <div class="st"><i class="ti ti-receipt"></i> Custo real (topo/flores)</div>
    <div style="background:rgba(200,163,91,.08);border:1px solid rgba(200,163,91,.25);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      <p style="font-size:11px;color:var(--text2);margin-bottom:10px">Você cobra um valor fixo do cliente, mas o custo real varia. Informe quanto gastou de fato, para o lucro do pedido ficar correto.</p>
      ${p.topo ? `
      <div class="fg" style="margin-bottom:8px">
        <label>🪄 Custo real do Topo (cobrado R$ ${(sucreeConfig.topoValor||45).toFixed(2)})</label>
        <input type="number" id="custo-real-topo" value="${p.custoRealTopo ?? ''}" min="0" step="0.01" placeholder="Ex: 38.50" onchange="atualizarCustoRealPedido('${p.id}','custoRealTopo',this.value)">
      </div>` : ''}
      ${p.flores ? `
      <div class="fg" style="margin-bottom:0">
        <label>💐 Custo real das Flores (cobrado R$ ${(sucreeConfig.floresValor||50).toFixed(2)})</label>
        <input type="number" id="custo-real-flores" value="${p.custoRealFlores ?? ''}" min="0" step="0.01" placeholder="Ex: 65.00" onchange="atualizarCustoRealPedido('${p.id}','custoRealFlores',this.value)">
      </div>` : ''}
    </div>` : ''}
    <button onclick="imprimirPedidoCozinha('${p.id}')" style="width:100%;padding:12px;background:var(--gold);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:10px">
      <i class="ti ti-printer"></i> 🖨️ Imprimir para a Cozinha
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
    const col = campo === 'custoRealTopo' ? 'custo_real_topo' : 'custo_real_flores';
    sb.from('pedidos_confeitaria').update({ [col]: p[campo] }).eq('id', id).then(function(){});
  } catch(e) {}
}

function updatePedidoStatus(id, status) {
  const p = pedidos.find(x=>x.id===id);
  if(!p) return;
  if (status === 'entregue') {
    const faltaTopo = p.topo && (p.custoRealTopo === undefined || p.custoRealTopo === null || p.custoRealTopo === '');
    const faltaFlores = p.flores && (p.custoRealFlores === undefined || p.custoRealFlores === null || p.custoRealFlores === '');
    if (faltaTopo || faltaFlores) {
      toast('⚠️ Informe o custo real do ' + (faltaTopo?'topo':'') + (faltaTopo&&faltaFlores?' e das ':'') + (faltaFlores?'flores':'') + ' antes de marcar como entregue');
      const sel = document.querySelector('select[onchange*="' + id + '"]');
      if (sel) sel.value = p.status;
      const campo = faltaTopo ? document.getElementById('custo-real-topo') : document.getElementById('custo-real-flores');
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
  buttercream: 50, topoValor: 45, floresValor: 50,
  pixKey: '(27) 9 9521-3194', minDias: 3, sinalPct: 50,
  custos: {
    embalagem:15, tabua:5, acessorios:2, energia:8, gas:5, limpeza:3,
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

// ═══════════════════════════════════════════
// GERENCIADOR DE GRUPOS
// ═══════════════════════════════════════════
function getGruposConfig() {
  try { return JSON.parse(localStorage.getItem('mr_grupos') || 'null'); } catch(e) { return null; }
}
function saveGruposConfig(cfg) { localStorage.setItem('mr_grupos', JSON.stringify(cfg)); }

function getGruposParaCat(cat) {
  var saved = getGruposConfig();
  var padrao;
  if (cat === 'doce') { padrao = ['Recheios','Bolos','Caldas','Coberturas','Biscoitos','Sobremesas','Pães','Bebidas']; }
  else if (cat === 'salgada') { padrao = ['Carnes','Aves','Peixes','Massas','Tortas','Lanches','Sopas']; }
  else { padrao = []; }
  var base = (saved && saved[cat] && saved[cat].length) ? saved[cat].slice() : padrao.slice();
  // Garante que os grupos padrão sempre estejam presentes, mesmo em configs salvas antigas
  padrao.forEach(function(g) { if (base.indexOf(g) === -1) base.push(g); });
  for (var i = 0; i < recipes.length; i++) {
    var r = recipes[i];
    if (r.cat === cat && r.group && base.indexOf(r.group) === -1) base.push(r.group);
  }
  base.sort();
  return base;
}

function renderGrupoLists() {
  ['doce','salgada'].forEach(function(cat) {
    const el = document.getElementById('grupos-' + cat + '-list');
    if (!el) return;
    const grupos = getGruposParaCat(cat);
    const recipeGroups = [...new Set(recipes.filter(r=>r.cat===cat&&r.group).map(r=>r.group))];
    const all = [...new Set([...grupos, ...recipeGroups])].sort();
    el.innerHTML = all.map(g => `
      <div style="display:inline-flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:4px 10px;font-size:12px;font-weight:600">
        <span>${g}</span>
        <button onclick="removeGrupo('${cat}','${g}')" style="background:none;border:none;color:#A32D2D;font-size:13px;cursor:pointer;padding:0 2px;line-height:1"><i class="ti ti-x"></i></button>
      </div>`).join('');
  });
}

function addGrupo(cat) {
  const inp = document.getElementById('novo-grupo-' + cat);
  const val = (inp.value || '').trim();
  if (!val) { toast('Digite o nome do grupo'); return; }
  const saved = getGruposConfig() || { doce: getGruposParaCat('doce'), salgada: getGruposParaCat('salgada') };
  if (!saved[cat]) saved[cat] = getGruposParaCat(cat);
  if (!saved[cat].includes(val)) { saved[cat].push(val); saved[cat].sort(); }
  saveGruposConfig(saved);
  inp.value = '';
  renderGrupoLists();
  updateGrupoSelects();
  toast('Grupo "' + val + '" adicionado!');
}

function removeGrupo(cat, grp) {
  const saved = getGruposConfig() || { doce: getGruposParaCat('doce'), salgada: getGruposParaCat('salgada') };
  if (!saved[cat]) saved[cat] = getGruposParaCat(cat);
  saved[cat] = saved[cat].filter(g => g !== grp);
  saveGruposConfig(saved);
  renderGrupoLists();
  updateGrupoSelects();
  toast('Grupo removido');
}

function updateGrupoSelects() {
  ['fgrp','choice-grp'].forEach(function(selId) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const cat = selId === 'fgrp'
      ? (document.getElementById('fcat')?.value || 'salgada')
      : (document.getElementById('choice-cat')?.value || 'salgada');
    const grupos = getGruposParaCat(cat).slice().sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
    const cur = sel.value;
    sel.innerHTML = '<option value="">Sem grupo</option>'
      + grupos.map(g => `<option value="${g}" ${g===cur?'selected':''}>${g}</option>`).join('');
  });
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
    recipes.filter(function(r){ return r.group === 'Recheios' || r.recipe_group === 'Recheios'; })
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
      + recipes.filter(function(r){ return r.group==='Recheios'||r.recipe_group==='Recheios'; })
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
  const keys = Object.keys(estoque);
  window._estoqueSelected = val ? new Set(keys) : new Set();
  renderEstoque();
}

function selectSemPreco() {
  window._estoqueSelected = new Set(Object.keys(estoque).filter(k => !estoque[k].price || estoque[k].price === 0));
  renderEstoque();
  toast(window._estoqueSelected.size + ' ingrediente(s) sem preço selecionados');
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
        recipes.forEach(rec => {
          (rec.ingredients || []).forEach(ig => {
            if (ig.name && ig.name.trim().toLowerCase() === key) ig.price = priceKg / 1000;
          });
        });
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
