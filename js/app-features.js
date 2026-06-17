// app-features.js — Login, estoque, pedidos, configurações
// ⛔ ZONA CRÍTICA: não editar funções de login sem cuidado
// ═══════════════════════════════════════════
// MÓDULOS INCLUÍDOS:
//   SERVICE WORKER | LOGIN/AUTH | ESTOQUE | PEDIDOS CONFEITARIA | CONFIGURAÇÕES
// ═══════════════════════════════════════════




// ═══════════════════════════════════════════
// LOGIN / USUÁRIOS
// ═══════════════════════════════════════════
const ADMIN_PWD_KEY  = 'mr_admin_pwd';
const GUEST_PWD_KEY  = 'mr_guest_pwd';
const SESSION_KEY    = 'mr_session';
const SESSION_ROLE   = 'mr_role'; // 'admin' or 'guest'

let currentLoginRole = 'admin';

function getAdminPwd() { return localStorage.getItem(ADMIN_PWD_KEY) || ''; }
function getGuestPwd() { return localStorage.getItem(GUEST_PWD_KEY) || ''; }
function setAdminPwd(p) { localStorage.setItem(ADMIN_PWD_KEY, p); }
function setGuestPwd(p) { localStorage.setItem(GUEST_PWD_KEY, p); }
function isLoggedIn() { return sessionStorage.getItem(SESSION_KEY) === 'ok'; }
function getCurrentRole() { return sessionStorage.getItem(SESSION_ROLE) || 'admin'; }
function setSession(role) {
  sessionStorage.setItem(SESSION_KEY, 'ok');
  sessionStorage.setItem(SESSION_ROLE, role);
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
    if (!hasPwd) {
      setup.style.display = 'block';
      confirm.style.display = 'block';
      loginBtn.textContent = 'Criar senha e entrar';
      forgot.style.display = 'none';
    } else {
      setup.style.display = 'none';
      confirm.style.display = 'none';
      loginBtn.textContent = 'Entrar como Admin';
      forgot.style.display = 'inline-block';
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
    const hasPwd = !!getAdminPwd();
    if (!hasPwd) {
      const pwd2 = document.getElementById('login-pwd2').value;
      if (!pwd2) { err.textContent = 'Confirme a senha'; return; }
      if (pwd !== pwd2) { err.textContent = 'As senhas não conferem'; return; }
      if (pwd.length < 4) { err.textContent = 'Mínimo 4 caracteres'; return; }
      setAdminPwd(pwd);
      setSession('admin');
      revelarApp();
      toast('Senha criada! Bem-vindo, Administrador!');
    } else {
      if (pwd !== getAdminPwd()) {
        err.textContent = 'Senha incorreta';
        shakeLoginBox();
        document.getElementById('login-pwd').value = '';
        return;
      }
      setSession('admin');
      revelarApp();
      toast('Bem-vindo, Administrador!');
    }
  } else {
    // Guest login - check Supabase first, fallback to local
    const loginBtn = document.getElementById('login-btn-label');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verificando...';
    try {
      // Fetch all configs to find matching guest password
      const { data: configs, error: cfgErr } = await sb.from('config').select('share_pwd').not('share_pwd', 'is', null).neq('share_pwd', '');
      if(cfgErr) throw cfgErr;
      let matched = false;
      if (configs && configs.length > 0) {
        matched = configs.some(c => c.share_pwd === pwd);
      }
      // Also check local as fallback
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
      // Load shared recipes from cloud
      await loadFromCloud();
      enterGuestMode();
      toast('Bem-vindo, Convidado!');
    } catch(e) {
      // Fallback to local check
      const localPwd = getGuestPwd();
      if (!localPwd) { err.textContent = 'Sem conexão e sem senha local.'; loginBtn.disabled=false; loginBtn.textContent='Entrar como Convidado'; return; }
      if (pwd !== localPwd) { err.textContent = 'Senha incorreta'; shakeLoginBox(); document.getElementById('login-pwd').value=''; loginBtn.disabled=false; loginBtn.textContent='Entrar como Convidado'; return; }
      setSession('guest');
      revelarApp();
      enterGuestMode();
      toast('Bem-vindo, Convidado!');
    }
  }
}


function doLogout() {
  const role = getCurrentRole();
  const msg = role === 'guest' ? 'Sair do modo convidado?' : 'Sair do app?';
  if (!confirm(msg)) return;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_ROLE);
  location.reload();
}
function shakeLoginBox() {
  const box = document.querySelector('.login-box');
  box.style.animation = 'shake .4s';
  setTimeout(() => box.style.animation = '', 400);
}

function forgotPwd() {
  const ok = confirm('Isso vai redefinir a senha de administrador e apagar os dados locais. Continuar?');
  if (!ok) return;
  localStorage.removeItem(ADMIN_PWD_KEY);
  localStorage.removeItem('mr_user_id');
  localStorage.removeItem('mr_v4_recipes');
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_ROLE);
  location.reload();
}

function enterGuestMode() {
  // Hide admin-only elements
  const bottomnav = document.querySelector('.bottomnav');
  if (bottomnav) {
    // Hide Nova and Share buttons for guests
    const btns = bottomnav.querySelectorAll('.bni');
    btns.forEach(btn => {
      if (btn.textContent.includes('Nova') || btn.textContent.includes('Compartilhar')) {
        btn.style.display = 'none';
      }
    });
  }
  // Go to shared recipes view
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
let estoque = {}; // { ingredientName_lower: { name, price, unit, updatedAt, usedIn: [] } }

function loadEstoque() {
  try { estoque = JSON.parse(localStorage.getItem('mr_estoque') || '{}'); } catch(e) { estoque = {}; }
}

function saveEstoque() {
  try { localStorage.setItem('mr_estoque', JSON.stringify(estoque)); } catch(e) {}
}

function syncEstoqueFromRecipes() {
  // Collect all unique ingredients from all recipes
  recipes.forEach(r => {
    (r.ingredients || []).forEach(ig => {
      if (!ig.name) return;
      const key = ig.name.trim().toLowerCase();
      if (!estoque[key]) {
        estoque[key] = {
          name: ig.name.trim(),
          price: ig.price || 0,
          unit: ig.unit || 'g',
          updatedAt: null,
          usedIn: []
        };
      } else {
        // Update price if ingredient has one and estoque doesn't
        if (ig.price > 0 && !estoque[key].price) {
          estoque[key].price = ig.price;
        }
        // Update name with latest casing
        estoque[key].name = ig.name.trim();
      }
      // Track which recipes use this ingredient
      if (!estoque[key].usedIn) estoque[key].usedIn = [];
      if (!estoque[key].usedIn.includes(r.name)) {
        estoque[key].usedIn.push(r.name);
      }
    });
  });
  saveEstoque();
}

function applyEstoqueToRecipes() {
  // Update all recipe ingredient prices from estoque
  let updated = 0;
  recipes.forEach(r => {
    (r.ingredients || []).forEach(ig => {
      if (!ig.name) return;
      const key = ig.name.trim().toLowerCase();
      if (estoque[key] && estoque[key].price > 0) {
        ig.price = estoque[key].price;
        updated++;
      }
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
    ${!keys.length ? '<div class="est"><i class="ti ti-package"></i><p>Nenhum ingrediente ainda.<br>Crie receitas para popular o estoque automaticamente.</p></div>' :
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
  // Apply to all recipes
  recipes.forEach(r => {
    (r.ingredients || []).forEach(ig => {
      if (ig.name && ig.name.trim().toLowerCase() === key) {
        ig.price = priceKg / 1000;
      }
    });
  });
  // Re-render price display
  const el = document.getElementById('page-estoque');
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

async function atualizarEstoqueIA() {
  const keys = Object.keys(estoque);
  if (!keys.length) { toast('Estoque vazio'); return; }
  const btn = document.getElementById('btn-upd-estoque');
  const bar = document.getElementById('ai-estoque-bar');
  const msg = document.getElementById('ai-estoque-msg');
  btn.disabled = true;
  bar.style.display = 'flex';
  msg.textContent = 'Buscando preços no ES...';

  const names = keys.map(k => estoque[k].name);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Pesquise preços atuais de supermercado no Espírito Santo, Brasil para estes ingredientes: ${names.join(', ')}. Data: ${new Date().toLocaleDateString('pt-BR')}. Retorne APENAS JSON sem markdown: {"nome_exato_do_ingrediente": preco_por_kg_em_reais}` }]
      })
    });
    const d = await r.json();
    const txt = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    let map;
    try { map = JSON.parse(txt.replace(/```json|```/g, '').trim()); } catch { throw new Error('Formato inválido'); }

    let n = 0;
    keys.forEach(key => {
      const igName = estoque[key].name.toLowerCase();
      const match = Object.keys(map).find(k =>
        igName.includes(k.toLowerCase()) || k.toLowerCase().includes(igName)
      );
      if (match && map[match] > 0) {
        const priceKg = map[match];
        estoque[key].price = priceKg / 1000;
        estoque[key].updatedAt = new Date().toISOString();
        // Update all recipes
        recipes.forEach(rec => {
          (rec.ingredients || []).forEach(ig => {
            if (ig.name && ig.name.trim().toLowerCase() === key) {
              ig.price = priceKg / 1000;
            }
          });
        });
        n++;
      }
    });

    saveEstoque();
    msg.textContent = n + ' preços atualizados!';
    setTimeout(() => { bar.style.display = 'none'; renderEstoque(); }, 2000);
    toast(n + ' preços atualizados no estoque e nas receitas!');
  } catch(err) {
    msg.textContent = 'Erro: ' + err.message;
    setTimeout(() => { bar.style.display = 'none'; }, 3000);
  } finally {
    btn.disabled = false;
  }
}


loadEstoque();


// ═══════════════════════════════════════════
// CONFEITARIA — AGENDA DE PEDIDOS
// ═══════════════════════════════════════════
let pedidos = [];
try { pedidos = JSON.parse(localStorage.getItem('mr_pedidos') || '[]'); } catch(e) {}
let editPedidoId = null;
let curPedido = {};

function savePedidos() {
  try { localStorage.setItem('mr_pedidos', JSON.stringify(pedidos)); } catch(e) {}
}

// ARO prices base (you can adjust)
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
      id: pedido.id,
      user_id: uid,
      cliente: pedido.cliente,
      telefone: pedido.telefone,
      data: pedido.data || null,
      hora: pedido.hora || null,
      retira: pedido.retira,
      endereco: pedido.endereco || null,
      aro: pedido.aro,
      massa: pedido.massa,
      recheio1: pedido.recheio1 || null,
      recheio2: pedido.recheio2 || null,
      cobertura: pedido.cobertura,
      deco: pedido.deco,
      tema: pedido.tema || null,
      topo: pedido.topo || false,
      flores: pedido.flores || false,
      obs_deco: pedido.obsDeco || null,
      inspi_photo: pedido.inspiPhoto || null,
      valor_bolo: pedido.valorBolo || 0,
      valor_total: pedido.valorTotal || 0,
      sinal: pedido.sinal || 0,
      pagamento: pedido.pagamento || null,
      status: pedido.status || 'pendente',
      origem: pedido.origem || 'manual'
    }, {onConflict: 'id'});
  } catch(e) {
    console.log('Save pedido cloud error:', e.message);
  }
}

async function deletePedidoFromCloud(id) {
  try {
    await sb.from('pedidos_confeitaria').delete().eq('id', id);
  } catch(e) {}
}

async function updatePedidoStatusCloud(id, status) {
  try {
    await sb.from('pedidos_confeitaria').update({status}).eq('id', id);
  } catch(e) {}
}

function renderConfeitaria() {
  const el = document.getElementById('page-confeitaria');
  // Load from cloud first
  loadPedidosFromCloud().then(() => {
    _renderConfeitariaUI();
  });
  _renderConfeitariaUI(); // show immediately with local data
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
      <button class="btnp" onclick="openNovoPedido()" style="padding:8px 14px;font-size:13px">
        <i class="ti ti-plus"></i> Novo pedido
      </button>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
      <button class="pm act" id="filter-todos" onclick="filterPedidos('todos')">Todos</button>
      <button class="pm" id="filter-pendente" onclick="filterPedidos('pendente')">⏳ Pendente</button>
      <button class="pm" id="filter-confirmado" onclick="filterPedidos('confirmado')">✅ Confirmado</button>
      <button class="pm" id="filter-producao" onclick="filterPedidos('producao')">🎂 Produção</button>
      <button class="pm" id="filter-pronto" onclick="filterPedidos('pronto')">🎉 Pronto</button>
      <button class="pm" id="filter-entregue" onclick="filterPedidos('entregue')">✔️ Entregue</button>
    </div>

    <div id="pedidos-list">
      ${renderPedidosList('todos')}
    </div>`;
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
  return `<div class="pedido-card status-${p.status} ${urgente?'':''}' onclick="viewPedido('${p.id}')" style="${urgente?'border:2px solid #C8A35B;':''}">
    ${urgente ? `<div style="position:absolute;top:8px;right:8px;background:var(--gold);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">🔥 ${diasRestantes<=0?'HOJE!':diasRestantes+'d'}</div>` : ''}
    <div style="font-size:15px;font-weight:700;margin-bottom:5px;padding-right:${urgente?60:0}px">${p.cliente || 'Sem nome'}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <span class="status-badge sb-${p.status}">${statusLabel}</span>
      <span style="font-size:12px;color:var(--text2)"><i class="ti ti-calendar" style="font-size:11px"></i> ${dataFmt} ${p.hora ? '· ' + p.hora : ''}</span>
      ${p.retira ? '<span style="font-size:11px;background:var(--teal-light);color:var(--teal);padding:1px 7px;border-radius:20px;font-weight:700">Retira</span>' : '<span style="font-size:11px;background:var(--blue-light);color:var(--blue);padding:1px 7px;border-radius:20px;font-weight:700">Entrego</span>'}
    </div>
    <div style="font-size:12px;color:var(--text2);display:flex;gap:8px;flex-wrap:wrap">
      ${p.aro ? `<span>Aro ${p.aro}</span>` : ''}
      ${p.massa ? `<span>${p.massa === 'amanteigada' ? '🧈 Amanteigada' : '🍰 Pão de Ló'}</span>` : ''}
      ${p.recheio1 ? `<span>🎂 ${p.recheio1}</span>` : ''}
      ${p.cobertura ? `<span>${p.cobertura === 'chantininho' ? '🍦 Chantininho' : '🧁 Buttercream'}</span>` : ''}
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
  if(infoBox) {
    infoBox.style.display='flex';
    infoBox.innerHTML = `<i class="ti ti-info-circle" style="flex-shrink:0"></i> <span>Aro ${aro}: ${ARO_INFO[aro]}</span>`;
  }
  // Auto-fill bolo price if empty
  const valorInput = document.getElementById('p-valor-bolo');
  if(valorInput && !valorInput.value) valorInput.value = ARO_PRICES[aro] || '';
  calcPedidoTotal();
}

function setMassa(tipo) {
  curPedido.massa = tipo;
  document.querySelectorAll('.massa-btn').forEach(b => {
    b.style.borderColor='var(--border)';b.style.background='var(--bg)';b.style.color='var(--text)';
  });
  const btn = document.getElementById('massa-'+tipo);
  if(btn){btn.style.borderColor='var(--coral)';btn.style.background='var(--gold-light)';btn.style.color='var(--gold-dark)';}
}

function setCobertura(tipo) {
  curPedido.cobertura = tipo;
  document.querySelectorAll('.cob-btn').forEach(b => {
    b.style.borderColor='var(--border)';b.style.background='var(--bg)';b.style.color='var(--text)';
  });
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

function calcPedidoTotal() {
  const valorBolo = parseFloat(document.getElementById('p-valor-bolo')?.value||0);
  const custoInput = parseFloat(document.getElementById('p-custo')?.value||0);
  const custo = custoInput > 0 ? custoInput : valorBolo * 0.35;
  const flores = curPedido.flores ? 50 : 0;
  const papelaria = curPedido.papelaria ? 35 : 0;
  const total = valorBolo + flores + papelaria;
  const lucro = total - custo;
  const sinal = parseFloat(document.getElementById('p-sinal')?.value||0);
  const restante = total - sinal;
  curPedido.valorTotal = total;
  curPedido.custoEstimado = custo;

  const box = document.getElementById('pedido-total-box');
  if(!box) return;
  box.innerHTML = `
    <div style="background:rgba(255,255,255,.05);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px">
      <div class="total-row"><span>🎂 Valor do bolo</span><span>R$ ${valorBolo.toFixed(2)}</span></div>
      ${flores>0?'<div class="total-row"><span>💐 Flores</span><span>R$ '+flores.toFixed(2)+'</span></div>':''}
      ${papelaria>0?'<div class="total-row"><span>🎨 Papelaria</span><span>R$ '+papelaria.toFixed(2)+'</span></div>':''}
      <div class="total-row grand"><span>TOTAL</span><span>R$ ${total.toFixed(2)}</span></div>
      <div class="total-row" style="color:#FF8080"><span>💸 Custo est.</span><span>R$ ${custo.toFixed(2)}</span></div>
      <div class="total-row" style="color:#9FE1CB;font-weight:700"><span>📈 Lucro est.</span><span>R$ ${lucro.toFixed(2)}</span></div>
      ${sinal>0?'<div class="total-row saldo"><span>✅ Sinal pago</span><span>R$ '+sinal.toFixed(2)+'</span></div>':''}
      ${restante>0&&sinal>0?'<div class="total-row" style="color:#C8A35B;font-weight:700"><span>⏳ A receber</span><span>R$ '+restante.toFixed(2)+'</span></div>':''}
    </div>`;
}

function getRecheios() {
  // Get all recipes from "Doces" or "Sobremesas" group to use as recheios
  const recheios = recipes
    .filter(r => r.cat === 'doce' || ['Bolos','Sobremesas','Biscoitos'].includes(r.group))
    .map(r => r.name);
  // Also allow any recipe to be a recheio
  const todos = recipes.map(r => r.name);
  return [...new Set([...recheios, ...todos])];
}

function populateRecheioSelects() {
  const recheios = getRecheios();
  const opts = recheios.map(r => `<option value="${r}">${r}</option>`).join('');
  const sel1 = document.getElementById('p-recheio1');
  const sel2 = document.getElementById('p-recheio2');
  if(sel1) sel1.innerHTML = '<option value="">Selecione o recheio...</option>' + opts;
  if(sel2) sel2.innerHTML = '<option value="">Nenhum / mesmo recheio</option>' + opts;
  // Restore values if editing
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
  // Default: retira = true, flores = false, papelaria = false
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

  // Restore values
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
  // Guardar ID para não restaurar no próximo sync
  if (!window._deletedPedidoIds) window._deletedPedidoIds = new Set();
  window._deletedPedidoIds.add(id);
  // Excluir na nuvem primeiro
  try { await sb.from('pedidos_confeitaria').delete().eq('id', id); } catch(e) {}
  // Depois localmente
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
    ${p.obsCliente?`<div style="font-size:13px;margin-bottom:12px;padding:9px 11px;background:var(--bg);border-radius:var(--radius-sm);font-style:italic">${p.obsCliente}</div>`:''}

    <div class="st" style="margin-top:8px"><i class="ti ti-cake"></i> Detalhes do bolo</div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      ${p.aro?`<div class="total-row"><span>Tamanho</span><span><b>Aro ${p.aro}</b> · ${ARO_INFO[p.aro]||''}</span></div>`:''}
      ${p.massa?`<div class="total-row"><span>Massa</span><span>${p.massa==='amanteigada'?'🧈 Amanteigada':'🍰 Pão de Ló'}</span></div>`:''}
      ${p.recheio1?`<div class="total-row"><span>Recheio 1</span><span>${p.recheio1}</span></div>`:''}
      ${p.recheio2?`<div class="total-row"><span>Recheio 2</span><span>${p.recheio2}</span></div>`:''}
      ${p.cobertura?`<div class="total-row"><span>Cobertura</span><span>${p.cobertura==='chantininho'?'🍦 Chantininho':'🧁 Buttercream'}</span></div>`:''}
    </div>

    ${p.tema||p.flores||p.papelaria?`
    <div class="st"><i class="ti ti-palette"></i> Decoração</div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      ${p.tema?`<div class="total-row"><span>Tema</span><span>${p.tema}</span></div>`:''}
      ${p.flores?`<div class="total-row"><span>💐 Flores</span><span>R$ 50,00</span></div>`:''}
      ${p.papelaria?`<div class="total-row"><span>🎨 Papelaria</span><span>R$ 35,00</span></div>`:''}
      ${p.obsDeco?`<div style="font-size:12px;font-style:italic;color:var(--text2);margin-top:6px">${p.obsDeco}</div>`:''}
    </div>`:''}

    ${p.inspiPhoto?`<div style="margin-bottom:12px"><div class="st"><i class="ti ti-photo"></i> Inspiração</div><img src="${p.inspiPhoto}" style="width:100%;border-radius:var(--radius);max-height:220px;object-fit:cover"></div>`:''}

    <div class="st"><i class="ti ti-currency-dollar"></i> Financeiro</div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
      <div class="total-row"><span>🎂 Valor do bolo</span><span>R$ ${parseFloat(p.valorBolo||0).toFixed(2)}</span></div>
      ${p.flores?`<div class="total-row"><span>💐 Flores</span><span>R$ 50,00</span></div>`:''}
      ${p.papelaria?`<div class="total-row"><span>🎨 Papelaria</span><span>R$ 35,00</span></div>`:''}
      <div class="total-row grand"><span>TOTAL</span><span>R$ ${parseFloat(p.valorTotal||0).toFixed(2)}</span></div>
      ${p.sinal>0?`<div class="total-row saldo"><span>✅ Sinal pago</span><span>R$ ${parseFloat(p.sinal).toFixed(2)}</span></div>`:''}
      ${p.sinal>0?`<div class="total-row" style="color:var(--gold);font-weight:700"><span>💳 Restante</span><span>R$ ${(parseFloat(p.valorTotal||0)-parseFloat(p.sinal||0)).toFixed(2)}</span></div>`:''}
      ${p.pagamento?`<div class="total-row" style="margin-top:6px"><span>Pagamento</span><span>${{pix:'PIX',dinheiro:'Dinheiro',cartao_credito:'Cartão Crédito',cartao_debito:'Cartão Débito'}[p.pagamento]||p.pagamento}</span></div>`:''}
    </div>

    <div style="padding:10px 12px;background:rgba(255,255,255,.05);border-radius:8px;margin-bottom:10px">
      <div class="total-row" style="color:#FF8080"><span>💸 Custo estimado</span><span>R$ ${(parseFloat(p.custoEstimado||0)||(parseFloat(p.valorBolo||0)*0.35)).toFixed(2)}</span></div>
      <div class="total-row" style="color:#9FE1CB;font-weight:700"><span>📈 Lucro estimado</span><span>R$ ${(parseFloat(p.valorTotal||0)-(parseFloat(p.custoEstimado||0)||(parseFloat(p.valorBolo||0)*0.35))).toFixed(2)}</span></div>
    </div>
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

function updatePedidoStatus(id, status) {
  const p = pedidos.find(x=>x.id===id);
  if(!p) return;
  p.status = status;
  savePedidos();
  updatePedidoStatusCloud(id, status);
  toast('Status atualizado!');
  renderConfeitaria();
}


function setPagamentoStatus(id, status) {
  const p = pedidos.find(x=>x.id===id);
  if(!p) return;
  p.pagamentoStatus = status;
  savePedidos();
  savePedidoToCloud(p);
  toast(status==='sinal'?'Sinal marcado como pago!':status==='total'?'Pagamento total confirmado!':'Pagar na entrega registrado!');
  viewPedido(id);
}

function addComprovante(id, e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const p = pedidos.find(x=>x.id===id);
    if(!p) return;
    p.comprovante = ev.target.result;
    savePedidos();
    savePedidoToCloud(p);
    toast('Comprovante salvo!');
    viewPedido(id);
  };
  reader.readAsDataURL(file);
  e.target.value='';
}

function abrirConfirmacao(id) {
  window.open('confirmacao.html?id='+id, '_blank');
}

function enviarConfirmacaoWhats(id, tel) {
  const link = 'https://herberthg99-prog.github.io/minhas-receitas/confirmacao.html?id='+id;
  const texto = encodeURIComponent('🎂 *Confirmação do seu pedido — Sucrée Confeitaria*\n\nOlá! Segue o link com todos os detalhes do seu pedido:\n\n'+link+'\n\nQualquer dúvida é só nos chamar! 🤍');
  const phone = tel ? tel.replace(/\D/g,'') : '';
  const url = phone ? 'https://wa.me/55'+phone+'?text='+texto : 'https://wa.me/?text='+texto;
  window.open(url,'_blank');
}


function copiarLinkCardapio() {
  const link = 'https://herberthg99-prog.github.io/minhas-receitas/cardapio.html';
  navigator.clipboard.writeText(link).then(() => {
    toast('Link copiado!');
  }).catch(() => {
    // fallback
    const el = document.createElement('textarea');
    el.value = link;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
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
    '🌸 Escolha o tamanho, a massa, os recheios, a cobertura e a decoração.\n\n' +
    'Após finalizar, seu pedido chega diretamente para mim e entro em contato para confirmar todos os detalhes.\n\n' +
    '💛 _Feito com amor e carinho em cada detalhe._\n\n' +
    '— Sucrée Confeitaria'
  );
  window.open('https://wa.me/?text=' + msg, '_blank');
}


// ═══════════════════════════════════════════
// CONFIGURAÇÕES — TABELA DE PREÇOS
// ═══════════════════════════════════════════
let sucreeConfig = {
  precos: {
    10: {trad: 110, prem: 140},
    15: {trad: 200, prem: 240},
    20: {trad: 250, prem: 280},
    25: {trad: 300, prem: 335},
    30: {trad: 350, prem: 390}
  },
  buttercream: 50,
  topoValor: 45,
  floresValor: 50,
  pixKey: '(27) 9 9521-3194',
  minDias: 3,
  sinalPct: 50
};
try {
  const saved = JSON.parse(localStorage.getItem('mr_sucree_config') || 'null');
  if(saved) sucreeConfig = {...sucreeConfig, ...saved};
} catch(e) {}

function saveConfig() {
  localStorage.setItem('mr_sucree_config', JSON.stringify(sucreeConfig));
}

function renderConfigPage() {
  const el = document.getElementById('page-config');
  const p = sucreeConfig.precos;
  el.innerHTML = `
    <div class="st"><i class="ti ti-settings"></i> Configurações da Sucrée</div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-table"></i> Tabela de preços dos bolos</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px">Altere os valores e clique em Salvar. O cardápio dos clientes será atualizado automaticamente.</p>

      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--bg)">
              <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text2)">Aro</th>
              <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text2)">Fatias</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--teal)">Tradicional</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--gold)">Premium</th>
            </tr>
          </thead>
          <tbody>
            ${[[10,'até 3'],[15,'até 10'],[20,'até 20'],[25,'até 30'],[30,'até 45']].map(([aro,fatias]) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid var(--border);font-weight:700">${aro} cm</td>
              <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text2);font-size:12px">${fatias}</td>
              <td style="padding:6px 8px;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
                  <span style="font-size:12px;color:var(--text2)">R$</span>
                  <input type="number" value="${p[aro]?.trad||0}" min="0" step="1"
                    id="preco-${aro}-trad"
                    style="width:70px;padding:5px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-weight:700;text-align:right;font-family:inherit;background:var(--surface);color:var(--teal)"
                    onchange="sucreeConfig.precos[${aro}].trad=parseFloat(this.value)||0">
                </div>
              </td>
              <td style="padding:6px 8px;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
                  <span style="font-size:12px;color:var(--text2)">R$</span>
                  <input type="number" value="${p[aro]?.prem||0}" min="0" step="1"
                    id="preco-${aro}-prem"
                    style="width:70px;padding:5px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-weight:700;text-align:right;font-family:inherit;background:var(--surface);color:var(--gold)"
                    onchange="sucreeConfig.precos[${aro}].prem=parseFloat(this.value)||0">
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-plus"></i> Adicionais e acréscimos</div>
      <div class="fr" style="margin-bottom:10px">
        <div class="fg" style="margin-bottom:0">
          <label>Buttercream (acréscimo)</label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:13px;color:var(--text2)">R$</span>
            <input type="number" id="cfg-buttercream" value="${sucreeConfig.buttercream}" min="0" step="1"
              style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;background:var(--surface);color:var(--text)"
              onchange="sucreeConfig.buttercream=parseFloat(this.value)||0">
          </div>
        </div>
        <div class="fg" style="margin-bottom:0">
          <label>Topo do bolo</label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:13px;color:var(--text2)">R$</span>
            <input type="number" id="cfg-topo" value="${sucreeConfig.topoValor}" min="0" step="1"
              style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;background:var(--surface);color:var(--text)"
              onchange="sucreeConfig.topoValor=parseFloat(this.value)||0">
          </div>
        </div>
      </div>
      <div class="fr">
        <div class="fg" style="margin-bottom:0">
          <label>Flores naturais</label>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:13px;color:var(--text2)">R$</span>
            <input type="number" id="cfg-flores" value="${sucreeConfig.floresValor}" min="0" step="1"
              style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;background:var(--surface);color:var(--text)"
              onchange="sucreeConfig.floresValor=parseFloat(this.value)||0">
          </div>
        </div>
        <div class="fg" style="margin-bottom:0">
          <label>Sinal mínimo (%)</label>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" id="cfg-sinal" value="${sucreeConfig.sinalPct}" min="0" max="100" step="5"
              style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;background:var(--surface);color:var(--text)"
              onchange="sucreeConfig.sinalPct=parseFloat(this.value)||50">
            <span style="font-size:13px;color:var(--text2)">%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-info-circle"></i> Informações gerais</div>
      <div class="fg">
        <label>Chave PIX</label>
        <input type="text" id="cfg-pix" value="${sucreeConfig.pixKey}"
          style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;background:var(--surface);color:var(--text);width:100%"
          onchange="sucreeConfig.pixKey=this.value">
      </div>
      <div class="fg" style="margin-bottom:0">
        <label>Mínimo de dias de antecedência</label>
        <input type="number" id="cfg-dias" value="${sucreeConfig.minDias}" min="1"
          style="padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit;background:var(--surface);color:var(--text);width:100%"
          onchange="sucreeConfig.minDias=parseInt(this.value)||3">
      </div>
    </div>

    <button class="btnp full" onclick="salvarConfig()"><i class="ti ti-device-floppy"></i> Salvar configurações</button>
    <div style="margin-top:10px;text-align:center">
      <button class="btns" style="font-size:12px" onclick="goPage('share')"><i class="ti ti-share"></i> Compartilhar cardápio</button>
    </div>
  `;
}

function salvarConfig() {
  saveConfig();
  // Update cardapio prices via localStorage so cardapio.html can read them
  localStorage.setItem('mr_sucree_config', JSON.stringify(sucreeConfig));
  toast('Configurações salvas! ✅');
  // If cardapio is open in another tab, it will pick up on next load
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
  if(!selected.length) {
    toast('Selecione pelo menos um ingrediente');
    return;
  }
  const btn = document.getElementById('btn-upd-estoque');
  const bar = document.getElementById('ai-estoque-bar');
  const msg = document.getElementById('ai-estoque-msg');
  btn.disabled = true; bar.style.display = 'flex';
  msg.textContent = 'Buscando preços para ' + selected.length + ' ingrediente(s) no ES...';

  const names = selected.map(k => estoque[k]?.name).filter(Boolean);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: `Pesquise preços atuais de supermercado no Espírito Santo, Brasil para: ${names.join(', ')}. Data: ${new Date().toLocaleDateString('pt-BR')}. Retorne APENAS JSON sem markdown: {"nome_ingrediente": preco_por_kg_em_reais}` }]
      })
    });
    const d = await r.json();
    const txt = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    let map; try { map = JSON.parse(txt.replace(/\`\`\`json|\`\`\`/g, '').trim()); } catch { throw new Error('Formato inválido'); }
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
    toast(n + ' preços atualizados no ES!');
  } catch(err) {
    msg.textContent = 'Erro: ' + err.message;
    setTimeout(() => { bar.style.display = 'none'; }, 3000);
  } finally { btn.disabled = false; }
}


function abrirMenuCardapio() {
  document.getElementById('modal-cardapio-share').style.display = 'flex';
}

function abrirCardapioNovAba() {
  window.open('https://herberthg99-prog.github.io/minhas-receitas/cardapio.html', '_blank');
  cm('modal-cardapio-share');
}


function notificarWhatsApp(p) {
  try {
    const dataFmt = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const recheios = (p.recheios||[]).map(r=>r.nome).join(', ') || '—';
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
      + '• Cobertura: ' + (p.coberturaNome||p.cobertura||'—') + '\n'
      + (p.tema?'• Tema: '+p.tema+'\n':'')
      + '\n💰 *Financeiro:*\n'
      + '• Total: R$ ' + parseFloat(p.valorTotal||0).toFixed(2) + '\n'
      + '• Sinal: R$ ' + parseFloat(p.sinal||0).toFixed(2) + '\n'
      + '\n🆔 Pedido: ' + p.id
    );
    window.open('https://wa.me/5527995213194?text=' + msg, '_blank');
  } catch(e) { console.log('WhatsApp erro:', e.message); }
}

function fecharCozinha() {
  const el = document.getElementById('cozinha-overlay');
  if (el) el.remove();
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

  function fmtQtd(q, unit) {
    const u = (unit||'').toLowerCase();
    if (u === 'g') return (q/1000).toFixed(3).replace('.',',') + ' kg';
    if (u === 'ml') return (q/1000).toFixed(3).replace('.',',') + ' L';
    return (q>=100?q.toFixed(0):q>=10?q.toFixed(1):q.toFixed(3)).replace('.',',') + ' ' + (unit||'');
  }

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

  const fotoHTML = (r.photos && r.photos[0])
    ? '<div style="position:relative;margin-bottom:28px;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.6)">'
      + '<img src="' + r.photos[0] + '" style="width:100%;max-height:380px;object-fit:contain;display:block;background:#1A1208">'
      + '<div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:linear-gradient(transparent,#1A1208)"></div>'
      + '<div style="position:absolute;bottom:14px;left:20px;right:20px">'
        + '<div style="font-size:9px;font-weight:800;color:#C8A35B;letter-spacing:.2em;text-transform:uppercase;margin-bottom:4px">' + (r.cat||'') + (r.group?' · '+r.group:'') + '</div>'
        + '<div style="font-family:Georgia,serif;font-size:26px;font-weight:700;color:#FAF5E8;text-shadow:0 2px 10px rgba(0,0,0,.6)">' + r.name + '</div>'
      + '</div>'
    + '</div>'
    : '<div style="margin-bottom:24px;padding:24px 0;text-align:center;border-bottom:1px solid rgba(200,163,91,.25)">'
      + '<div style="font-size:9px;font-weight:800;color:#C8A35B;letter-spacing:.2em;text-transform:uppercase;margin-bottom:6px">' + (r.cat||'') + (r.group?' · '+r.group:'') + '</div>'
      + '<div style="font-family:Georgia,serif;font-size:30px;font-weight:700;color:#FAF5E8">' + r.name + '</div>'
    + '</div>';

  let overlay = document.getElementById('cozinha-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cozinha-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1A1208;z-index:9999;overflow-y:auto;-webkit-overflow-scrolling:touch';
    document.body.appendChild(overlay);
  }

  let html = '<div style="background:rgba(26,18,8,.95);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;border-bottom:1px solid rgba(200,163,91,.25)">'
    + '<div style="display:flex;align-items:center;gap:10px">'
      + '<img src="https://herberthg99-prog.github.io/minhas-receitas/logo.png" style="height:30px;filter:drop-shadow(0 1px 6px rgba(200,163,91,.5))">'
      + '<div>'
        + '<div style="font-size:11px;color:#B8972A;text-transform:uppercase;letter-spacing:.15em">' + (r.cat||'') + (r.group?' · '+r.group:'') + '</div>'
      + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px">'
      + '<div style="background:rgba(200,163,91,.12);border:1px solid rgba(200,163,91,.25);border-radius:8px;padding:6px 12px;text-align:center"><div style="font-size:9px;color:#B8972A;text-transform:uppercase">Rendimento</div><div style="font-size:14px;font-weight:800;color:#F0E6CC">' + (r.yield_qty||r.yield||6) + ' ' + (r.unit||'porções') + '</div></div>'
      + '<div style="background:rgba(200,163,91,.12);border:1px solid rgba(200,163,91,.25);border-radius:8px;padding:6px 12px;text-align:center"><div style="font-size:9px;color:#B8972A;text-transform:uppercase">Tempo</div><div style="font-size:14px;font-weight:800;color:#F0E6CC">' + (r.time?(r.time<60?r.time+'min':Math.floor(r.time/60)+'h'+(r.time%60?r.time%60+'min':'')):'—') + '</div></div>'
      + '<button onclick="fecharCozinha()" style="background:rgba(255,255,255,.08);border:1px solid rgba(200,163,91,.3);color:#C8A35B;width:38px;height:38px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'
    + '</div>'
  + '</div>'
  + '<div style="padding:20px 18px;max-width:680px;margin:0 auto">'
    + fotoHTML
    + '<div style="margin-bottom:28px">'
      + '<div style="margin-bottom:14px;display:flex;align-items:center;gap:12px"><span style="display:inline-block;width:4px;height:28px;background:linear-gradient(180deg,#C8A35B,#8A6A20);border-radius:2px"></span><span style="font-family:Georgia,serif;font-size:22px;color:#FAF5E8;font-weight:700">Ingredientes</span></div>'
      + ingrsHTML
    + '</div>'
    + (passos.length ? '<div><div style="margin-bottom:14px;display:flex;align-items:center;gap:12px"><span style="display:inline-block;width:4px;height:28px;background:linear-gradient(180deg,#C8A35B,#8A6A20);border-radius:2px"></span><span style="font-family:Georgia,serif;font-size:22px;color:#FAF5E8;font-weight:700">Modo de Preparo</span></div>' + passosHTML + '</div>' : '')
  + '</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'block';
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
  const css = "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lato:wght@300;400;700&display=swap');"
    + "*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#120D05;color:var(--text);font-size:15px;min-height:100vh}"
    + ".page{max-width:680px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,.08)}"
    + ".hdr{background:linear-gradient(135deg,#1A1208,#2C1E0A);padding:28px 36px;text-align:center}"
    + ".logo{width:110px;height:auto;margin-bottom:10px;filter:drop-shadow(0 2px 12px rgba(200,163,91,.4))}"
    + ".rtitle{font-family:'Playfair Display',serif;font-size:26px;color:#F0E6CC;margin-bottom:3px}"
    + ".rsub{font-size:11px;color:#B8972A;letter-spacing:.2em;text-transform:uppercase}"
    + ".body{padding:28px 36px}"
    + ".info-row{display:flex;border:1px solid #f0ebe0;border-radius:10px;overflow:hidden;margin-bottom:24px}"
    + ".info-item{flex:1;padding:12px;text-align:center;border-right:1px solid #f0ebe0}"
    + ".info-item:last-child{border-right:none}"
    + ".il{font-size:9px;font-weight:700;color:#C8A35B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px}"
    + ".iv{font-size:14px;font-weight:700}"
    + ".sec{font-family:'Playfair Display',serif;font-size:15px;color:#1a1a1a;margin-bottom:12px;padding-bottom:5px;border-bottom:1.5px solid #f0ebe0;display:flex;align-items:center;gap:7px}"
    + ".sec::before{content:'';width:3px;height:16px;background:#C8A35B;border-radius:2px;flex-shrink:0}"
    + "table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}"
    + "th{text-align:left;font-size:9px;font-weight:700;color:#C8A35B;text-transform:uppercase;letter-spacing:.08em;padding:7px 9px;border-bottom:1.5px solid #f0ebe0}"
    + "td{padding:7px 9px;border-bottom:0.5px solid #f5f0e8;color:#333}"
    + "tr:nth-child(even) td{background:#FDFAF5}"
    + ".passo{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px;padding:11px 13px;background:#FDFAF5;border-radius:8px;border-left:3px solid #C8A35B}"
    + ".pl{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:#C8A35B;flex-shrink:0;min-width:22px}"
    + ".pt{font-size:12px;line-height:1.8;color:#333}"
    + ".custo-box{background:linear-gradient(135deg,#1A1208,#2C1E0A);border-radius:10px;padding:18px;margin-top:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center}"
    + ".cl2{font-size:9px;color:#B8972A;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px}"
    + ".cv2{font-size:15px;font-weight:700;color:#F0E6CC}"
    + ".ftr{background:#FDFAF5;padding:14px 36px;text-align:center;border-top:1px solid #f0ebe0;font-size:10px;color:#aaa}"
    + ".ftr strong{color:#C8A35B}"
    + "@media print{body{padding:0}.page{box-shadow:none;border-radius:0}@page{margin:0}}";

  const passosH = passos.map((ln,i) => '<div class="passo"><span class="pl">'+String.fromCharCode(65+i)+'</span><span class="pt">'+ln.trim()+'</span></div>').join('');
  const ingrsH = p.scaled.map(ig => {
    const q = parseFloat(ig.qty||0);
    const sub = q * parseFloat(ig.price||0);
    return '<tr><td>'+(ig.isBase?'⭐ ':'')+ig.name+'</td><td>'+(q>=100?q.toFixed(0):q>=10?q.toFixed(1):q.toFixed(2))+' '+(ig.unit||'')+'</td><td style="text-align:right;color:#C8A35B">'+(sub>0?'R$ '+sub.toFixed(2):'—')+'</td></tr>';
  }).join('');

  let html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>'+r.name+'</title><style>'+css+'</style></head><body>'
    + '<div class="page">'
    + '<div class="hdr"><img src="https://herberthg99-prog.github.io/minhas-receitas/logo.png" class="logo" alt="Sucrée"><div class="rtitle">'+r.name+'</div><div class="rsub">'+r.cat+(r.group?' · '+r.group:'')+'</div></div>'
    + '<div class="body">'
    + '<div class="info-row"><div class="info-item"><div class="il">Rendimento</div><div class="iv">'+(r.yield_qty||r.yield||6)+' '+(r.unit||'porções')+'</div></div><div class="info-item"><div class="il">Tempo</div><div class="iv">'+(r.time?(r.time<60?r.time+'min':Math.floor(r.time/60)+'h'+(r.time%60?r.time%60+'min':'')):'—')+'</div></div><div class="info-item"><div class="il">Custo</div><div class="iv" style="color:#C8503A">R$ '+p.cost.toFixed(2)+'</div></div><div class="info-item"><div class="il">Venda</div><div class="iv" style="color:#C8A35B">R$ '+p.sale.toFixed(2)+'</div></div></div>'
    + (p.scaled.length?'<div class="sec">Ingredientes</div><table><thead><tr><th>Ingrediente</th><th>Quantidade</th><th style="text-align:right">Custo</th></tr></thead><tbody>'+ingrsH+'</tbody></table>':'')
    + (passos.length?'<div class="sec" style="margin-bottom:12px">Modo de Preparo</div>'+passosH:'')
    + '<div class="custo-box"><div><div class="cl2">Custo total</div><div class="cv2">R$ '+p.cost.toFixed(2)+'</div></div><div><div class="cl2">Por porção</div><div class="cv2">R$ '+(p.cost/Math.max(p.portions,.01)).toFixed(2)+'</div></div><div><div class="cl2">Preço venda</div><div class="cv2">R$ '+p.sale.toFixed(2)+'</div></div><div><div class="cl2">Lucro '+pct+'%</div><div class="cv2" style="color:#9FE1CB">R$ '+p.luc.toFixed(2)+'</div></div></div>'
    + '</div>'
    + '<div class="ftr"><strong>Sucrée Confeitaria</strong> · Vitória – ES · Receita exclusiva</div>'
    + '</div>'
    + '<scr'+'ipt>window.onload=()=>window.print()<'+'/scr'+'ipt></body></html>';
  win.document.write(html);
  win.document.close();
}


function imprimirPedidoCozinha(id) {
  const p = pedidos.find(x => x.id === id);
  if (!p) return;
  const dataFmt = p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const num = '#' + new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getDate()).padStart(2,'0') + '-' + String(Math.floor(Math.random()*999)+1).padStart(3,'0');
  const win = window.open('', '_blank');
  if (!win) { toast('Permita pop-ups para imprimir'); return; }
  const custo = parseFloat(p.custoEstimado||0) || (parseFloat(p.valorBolo||0)*0.35);
  const lucro = parseFloat(p.valorTotal||0) - custo;
  const css = '*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#120D05;color:var(--text);font-size:15px;min-height:100vh}.hdr{text-align:center;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #C8A35B}.hdr img{width:110px;height:auto;margin-bottom:6px}.hdr h1{font-size:18px;color:#2C1800}.num{font-size:11px;color:#888}.sec{margin-bottom:14px}.st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #eee}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:0.5px solid #f5f5f5}.key{color:#666}.val{font-weight:700;text-align:right;max-width:60%}.inspi{width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-top:6px}.obs{background:#f9f9f9;border-left:3px solid #C8A35B;padding:7px 10px;font-size:12px;color:#555;font-style:italic;border-radius:0 6px 6px 0;margin-top:6px}.tbox{background:#2C1800;color:#C8A35B;border-radius:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;margin-top:10px}.ftr{text-align:center;margin-top:16px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#aaa}@media print{body{padding:0}}';
  let html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido — '+p.cliente+'</title><style>'+css+'</style></head><body>';
  html += '<div class="hdr"><img src="https://herberthg99-prog.github.io/minhas-receitas/logo.png" alt="Sucrée"><h1>Pedido para Cozinha</h1><div class="num">'+num+' · '+new Date().toLocaleDateString('pt-BR')+'</div></div>';
  html += '<div class="sec"><div class="st">👤 Cliente</div>';
  html += '<div class="row"><span class="key">Nome</span><span class="val">'+(p.cliente||'—')+'</span></div>';
  html += '<div class="row"><span class="key">Entrega</span><span class="val">'+dataFmt+(p.hora?' às '+p.hora:'')+'</span></div>';
  html += '<div class="row"><span class="key">Retirada</span><span class="val">'+(p.retira?'✅ Retira':'🚗 Entrego')+'</span></div>';
  if(p.endereco) html += '<div class="row"><span class="key">Endereço</span><span class="val">'+p.endereco+'</span></div>';
  if(p.telefone) html += '<div class="row"><span class="key">Telefone</span><span class="val">'+p.telefone+'</span></div>';
  html += '</div><div class="sec"><div class="st">🎂 Bolo</div>';
  if(p.aro) html += '<div class="row"><span class="key">Tamanho</span><span class="val">Aro '+p.aro+' cm</span></div>';
  if(p.massa) html += '<div class="row"><span class="key">Massa</span><span class="val">'+(p.massa==='amanteigada'?'🧈 Amanteigada':'🍰 Pão de Ló')+'</span></div>';
  if(p.recheio1) html += '<div class="row"><span class="key">Recheio 1</span><span class="val">'+p.recheio1+'</span></div>';
  if(p.recheio2) html += '<div class="row"><span class="key">Recheio 2</span><span class="val">'+p.recheio2+'</span></div>';
  if(p.cobertura) html += '<div class="row"><span class="key">Cobertura</span><span class="val">'+(p.cobertura==='chantininho'?'🍦 Chantininho':'🧁 Buttercream')+'</span></div>';
  html += '</div>';
  if(p.tema||p.flores||p.obsDeco){
    html += '<div class="sec"><div class="st">🎨 Decoração</div>';
    if(p.tema) html += '<div class="row"><span class="key">Tema</span><span class="val">'+p.tema+'</span></div>';
    if(p.flores) html += '<div class="row"><span class="key">Flores</span><span class="val">✅ Sim (R$ 50,00)</span></div>';
    if(p.papelaria) html += '<div class="row"><span class="key">Papelaria</span><span class="val">✅ Sim (R$ 35,00)</span></div>';
    if(p.obsDeco) html += '<div class="obs">'+p.obsDeco+'</div>';
    html += '</div>';
  }
  if(p.inspiPhoto) html += '<div class="sec"><div class="st">📸 Inspiração</div><img src="'+p.inspiPhoto+'" class="inspi"></div>';
  if(p.obsCliente) html += '<div class="sec"><div class="st">📝 Obs. do cliente</div><div class="obs">'+p.obsCliente+'</div></div>';
  html += '<div class="tbox"><span style="font-size:11px;letter-spacing:1px">TOTAL</span><span style="font-size:19px;font-weight:700">R$ '+parseFloat(p.valorTotal||0).toFixed(2)+'</span></div>';
  if(p.sinal>0) html += '<div style="text-align:center;margin-top:6px;font-size:12px;color:#555">✅ Sinal: R$ '+parseFloat(p.sinal).toFixed(2)+' · A receber: R$ '+(parseFloat(p.valorTotal||0)-parseFloat(p.sinal||0)).toFixed(2)+'</div>';
  html += '<div style="background:#f9f9f9;border-radius:8px;padding:10px 12px;margin-top:10px;font-size:12px;color:#555">💸 Custo est: <strong>R$ '+custo.toFixed(2)+'</strong> &nbsp;·&nbsp; 📈 Lucro: <strong style="color:#0F6E56">R$ '+lucro.toFixed(2)+'</strong></div>';
  html += '<div class="ftr">Sucrée Confeitaria · Vitória – ES<br><strong style="color:#2C1800">✅ CONFIRMADO PARA PRODUÇÃO</strong></div>';
  html += '<scr'+'ipt>window.onload=()=>window.print()<'+'/scr'+'ipt></body></html>';
  win.document.write(html);
  win.document.close();
}
