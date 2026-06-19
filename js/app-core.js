// app-core.js v4 — Sucrée Confeitaria
// ═══════════════════════════════════════════

const SUPABASE_URL = 'https://tisdrdgpizywzcrjxnok.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpc2RyZGdwaXp5d3pjcmp4bm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjAxNTksImV4cCI6MjA5NzEzNjE1OX0.7hGOXUCyxtQR4sRc-7uxVLPrjqgJ5ss7lKJydTRFHkg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const USER_ID = 'herberth_admin';
localStorage.setItem('mr_user_id', USER_ID);

let recipes = [];
let shareConfig = { pwd: '', sharedIds: [] };
let editId = null, curIngr = [], curPhotos = [], curFormas = [], formasEnabled = false;
let newMode = null, fotoB64 = null, viewState = {}, rmap = {};
let syncPending = false;
window._currentSubGrp = ''; // active sub-aba group filter
window._currentCat = ''; // active category filter

// ═══════ UTILS ═══════
function genId() { return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fR(v) { return 'R$\u00a0' + parseFloat(v || 0).toFixed(2); }
function fT(m) { if (!m) return '—'; if (m < 60) return m + 'min'; const h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? r + 'min' : ''); }
function toast(msg, dur = 2400) { const t = document.getElementById('toast'); if(t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), dur); } }
function cm(id) { document.getElementById(id).style.display = 'none'; }
function getBase(r) { return (r.ingredients || []).find(i => i.isBase) || null; }
function iCost(ig, q) { return q * parseFloat(ig.price || 0); }
function totIC(ingrs) { return ingrs.reduce((a, ig) => a + iCost(ig, parseFloat(ig.qty || 0)), 0); }
function pctClass(p) { return p >= 50 ? 'pok' : p >= 10 ? 'pwn' : 'pbd'; }
function setSyncStatus(state, text) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');
  if(dot) dot.className = 'sync-dot ' + state;
  if(txt) txt.textContent = text;
}
function calcAt(r, ratio) {
  const s = (r.ingredients || []).map(ig => ({ ...ig, qty: parseFloat(ig.qty || 0) * ratio }));
  const ic = totIC(s), ext = parseFloat(r.extra || 0) * ratio, cost = ic + ext;
  const sale = cost * (1 + parseFloat(r.margin || 100) / 100);
  return { scaled: s, cost, sale, luc: sale - cost, portions: parseFloat(r.yield_qty || r.yield || 1) * ratio, ratio };
}

// formato decimal: converte g->kg, ml->L quando conveniente
function fmtQtd(q, unit) {
  const u = (unit||'').toLowerCase().trim();
  if (u === 'g') {
    if (q >= 1000) return (q/1000).toFixed(3).replace('.',',') + ' kg';
    if (q >= 100)  return q.toFixed(0) + ' g';
    if (q >= 10)   return q.toFixed(1) + ' g';
    return q.toFixed(3).replace('.',',') + ' g';
  }
  if (u === 'ml') {
    if (q >= 1000) return (q/1000).toFixed(3).replace('.',',') + ' L';
    if (q >= 100)  return q.toFixed(0) + ' ml';
    return q.toFixed(1) + ' ml';
  }
  if (q >= 100) return q.toFixed(0) + ' ' + (unit||'');
  if (q >= 10)  return q.toFixed(1) + ' ' + (unit||'');
  return q.toFixed(3).replace('.',',') + ' ' + (unit||'');
}

// ═══════ CLOUD ═══════
async function loadFromCloud() {
  setSyncStatus('syncing', 'carregando...');
  try {
    const uid = (USER_ID||'').trim();
    const role = getCurrentRole();
    let recs, error;
    if (role === 'guest') {
      const res = await sb.from('receitas').select('*').eq('shared', true);
      recs = res.data; error = res.error;
    } else {
      const res = await sb.from('receitas').select('*').eq('user_id', uid);
      recs = res.data; error = res.error;
    }
    if (error) throw error;
    const deletedIds = window._deletedIds || new Set();
    recipes = (recs || []).filter(r => !deletedIds.has(r.id)).map(dbToLocal);
    const ids = recipes.filter(r => r.shared).map(r => r.id);
    shareConfig.sharedIds = ids;
    try {
      const { data: cfgs } = await sb.from('config').select('*').eq('user_id', uid).limit(1);
      if (cfgs && cfgs.length > 0) shareConfig.pwd = cfgs[0].share_pwd || '';
    } catch(e) {}
    recipes.forEach(r => rmap[r.id] = r);
    setSyncStatus('ok', 'sincronizado (' + recipes.length + ')');
    return true;
  } catch (err) {
    setSyncStatus('err', 'erro: ' + err.message);
    try { recipes = JSON.parse(localStorage.getItem('mr_v4_recipes') || '[]'); } catch (e) {}
    recipes.forEach(r => rmap[r.id] = r);
    return false;
  }
}

async function saveToCloud(recipe) {
  setSyncStatus('syncing', 'salvando...');
  const row = localToDb(recipe);
  try {
    const { error } = await sb.from('receitas').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    setSyncStatus('ok', 'sincronizado');
    localStorage.setItem('mr_v4_recipes', JSON.stringify(recipes));
  } catch (err) {
    setSyncStatus('err', 'erro ao salvar');
    localStorage.setItem('mr_v4_recipes', JSON.stringify(recipes));
    toast('Salvo localmente (sem conexão)');
  }
}

async function deleteFromCloud(id) {
  try {
    await sb.from('receitas').delete().eq('id', id).eq('user_id', USER_ID);
    setSyncStatus('ok', 'sincronizado');
  } catch (err) { 
    setSyncStatus('err', 'erro'); 
  }
}

async function saveConfigToCloud() {
  try {
    await sb.from('config').upsert({ user_id: USER_ID, share_pwd: shareConfig.pwd }, { onConflict: 'user_id' });
    for (const r of recipes) {
      await sb.from('receitas').update({ shared: shareConfig.sharedIds.includes(r.id) }).eq('id', r.id).eq('user_id', USER_ID);
    }
  } catch (err) {}
}

// ═══════ DATA MAPPING ═══════
function localToDb(r) {
  return {
    id: r.id, user_id: USER_ID,
    name: r.name, cat: r.cat, recipe_group: r.group || null,
    unit: r.unit, yield_qty: r.yield_qty || r.yield || 6,
    time_min: r.time || 0, margin: r.margin || 100, extra: r.extra || 0,
    preparo: r.preparo || '', comment: r.comment || '',
    photos: r.photos || [], formas: r.formas || [],
    formas_enabled: r.formasEnabled || false,
    ingredients: r.ingredients || [],
    shared: shareConfig.sharedIds.includes(r.id),
    updated_at: new Date().toISOString()
  };
}

// ═══════ REGRAS ADICIONAIS DE AMBIENTE ═══════
function getCurrentRole() { return localStorage.getItem('mr_role') || 'admin'; }
function isGuest() { return getCurrentRole() === 'guest'; }

function dbToLocal(row) {
  return {
    id: row.id, name: row.name, cat: row.cat, group: row.recipe_group || '',
    unit: row.unit || 'porção', yield_qty: row.yield_qty || 6, yield: row.yield_qty || 6,
    time: row.time_min || 0, margin: row.margin || 100, extra: row.extra || 0,
    preparo: row.preparo || '', comment: row.comment || '',
    photos: row.photos || [], formas: row.formas || [],
    formasEnabled: row.formas_enabled || false,
    ingredients: row.ingredients || [],
    shared: row.shared || false,
    createdAt: new Date(row.created_at).getTime()
  };
}

// ═══════ NAVIGATION ═══════
function goPage(p) {
  document.querySelectorAll('.page').forEach(e => e.classList.remove('act'));
  document.querySelectorAll('.bni').forEach(e => e.classList.remove('act'));
  const targetPage = document.getElementById('page-' + p);
  if (targetPage) targetPage.classList.add('act');
  const el = document.getElementById('nav-' + p);
  if (el) el.classList.add('act');
  if (p === 'home') renderHome();
  if (p === 'receitas') { 
    var curCat = document.getElementById('fc') ? document.getElementById('fc').value : '';
    buildSubAbas(curCat);
    renderRecipes(); 
  }
  if (p === 'confeitaria') if(typeof renderConfeitaria === 'function') renderConfeitaria();
  if (p === 'estoque') if(typeof renderEstoque === 'function') renderEstoque();
  if (p === 'config') if(typeof renderConfigPage === 'function') renderConfigPage();
  if (p === 'share') if(typeof renderSharePage === 'function') renderSharePage();
  if (p === 'deco') renderDecoPage();
  if (p === 'calc') if(typeof renderCalcMassa === 'function') renderCalcMassa();
  if (p === 'portfolio') if(typeof renderPortfolio === 'function') renderPortfolio();
  if (p === 'rascunho') if(typeof renderRascunho === 'function') renderRascunho();
  if (p === 'agenda')   if(typeof renderAgenda === 'function') renderAgenda();
  if (p === 'compras')  if(typeof renderListaCompras === 'function') renderListaCompras();
  if (p === 'ficha')    if(typeof renderFichaProducao === 'function') renderFichaProducao();
  if (p === 'metas')         if(typeof renderMetas === 'function') renderMetas();
  if (p === 'cardapio-cfg') if(typeof renderCardapioConfig === 'function') renderCardapioConfig();
}

function renderDecoPage() {
  // Mantém a visualização ativa ou limpa estados, se necessário
}

// ═══════ RENDER HOME ═══════
function renderHome() {
  const guest = isGuest();
  if (guest) {
    document.getElementById('page-home').innerHTML = `
      <div style="text-align:center;padding:30px 20px">
        <img src="https://herberthg99-prog.github.io/minhas-receitas/logo.png" style="width:100px;filter:brightness(2) drop-shadow(0 2px 12px rgba(200,163,91,.5));margin-bottom:16px">
        <div style="font-family:Georgia,serif;font-size:22px;color:#F5EDD8;margin-bottom:8px">Sucrée Confeitaria</div>
        <div style="font-size:14px;color:var(--text2);margin-bottom:24px">Bem-vindo! Acesse as receitas pelo menu abaixo.</div>
        <button class="btnp full" onclick="goPage('receitas')"><i class="ti ti-book"></i> Ver Receitas</button>
      </div>`;
    return;
  }

  const tot = recipes.length;
  const dc  = recipes.filter(r => r.cat === 'doce').length;
  const sl  = recipes.filter(r => r.cat === 'salgada').length;
  const recentes = [...recipes].reverse().slice(0, 5);

  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const nomeMes = hoje.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
  const cfg = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
  const valorHora   = cfg.valorHora    || 25;
  const indiretoPct = cfg.indiretoPct  || 15;
  const margemNeg   = cfg.margemNegocio || 30;

  const pedidosMes = (typeof pedidos !== 'undefined' ? pedidos : []).filter(p => {
    if (!p.data || p.status === 'cancelado') return false;
    const d = new Date(p.data + 'T12:00:00');
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });

  const faturamento  = pedidosMes.reduce((a, p) => a + parseFloat(p.valorTotal||0), 0);
  const recebido     = pedidosMes.reduce((a, p) => a + parseFloat(p.sinal||0), 0);
  const aReceber     = faturamento - recebido;
  const qtdPedidos   = pedidosMes.length;

  const custoEstimado = pedidosMes.reduce((a, p) => {
    const aro = p.aro || 20;
    const custoOp = typeof calcCustoOperacional === 'function' ? calcCustoOperacional(aro) : 0;
    const custoIngr = parseFloat(p.custoEstimado || p.valorBolo * 0.30 || 0);
    return a + custoOp + custoIngr;
  }, 0);

  const lucroEstimado = faturamento - custoEstimado;
  const margemAtual = faturamento > 0 ? (lucroEstimado / faturamento * 100) : 0;

  document.getElementById('page-home').innerHTML = `
    <div style="background:linear-gradient(160deg,#1E1408,#2A1C0A);border:1px solid rgba(200,163,91,.3);border-radius:14px;padding:16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font-size:10px;font-weight:700;color:#C8A35B;text-transform:uppercase;letter-spacing:.1em">📊 Resumo financeiro</div>
          <div style="font-size:14px;font-weight:700;color:#F5EDD8;text-transform:capitalize;margin-top:2px">${nomeMes}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:var(--text3)">${qtdPedidos} pedido(s)</div>
          <div style="font-size:11px;color:${margemAtual>=margemNeg?'var(--teal)':'#FF8080'};font-weight:700">margem ${margemAtual.toFixed(0)}%</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:10px">
          <div style="font-size:9px;color:rgba(200,163,91,.6);font-weight:700;text-transform:uppercase;margin-bottom:4px">💰 Faturamento</div>
          <div style="font-size:20px;font-weight:800;color:#C8A35B">${fR(faturamento)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">total do mês</div>
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:10px">
          <div style="font-size:9px;color:rgba(200,163,91,.6);font-weight:700;text-transform:uppercase;margin-bottom:4px">💸 Custo estimado</div>
          <div style="font-size:20px;font-weight:800;color:#FF8080">${fR(custoEstimado)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">ingr + operacional</div>
        </div>
      </div>

      <div style="background:${lucroEstimado>=0?'rgba(15,110,86,.2)':'rgba(255,80,80,.2)'};border:1px solid ${lucroEstimado>=0?'rgba(15,110,86,.4)':'rgba(255,80,80,.4)'};border-radius:8px;padding:12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:10px;color:${lucroEstimado>=0?'var(--teal)':'#FF8080'};font-weight:700;text-transform:uppercase;margin-bottom:3px">${lucroEstimado>=0?'📈 Lucro estimado':'⚠️ Prejuízo'}</div>
          <div style="font-size:24px;font-weight:800;color:${lucroEstimado>=0?'var(--teal)':'#FF8080'}">${fR(Math.abs(lucroEstimado))}</div>
          <div style="font-size:10px;color:var(--text3)">para reinvestir e crescer</div>
        </div>
        <div style="font-size:36px">${lucroEstimado>=0?'🎂':'📉'}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:rgba(15,110,86,.1);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--teal);font-weight:700;margin-bottom:2px">✅ Recebido</div>
          <div style="font-size:16px;font-weight:700;color:var(--teal)">${fR(recebido)}</div>
        </div>
        <div style="background:rgba(200,163,91,.1);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:9px;color:#C8A35B;font-weight:700;margin-bottom:2px">⏳ A receber</div>
          <div style="font-size:16px;font-weight:700;color:#C8A35B">${fR(aReceber)}</div>
        </div>
      </div>

      ${pedidosMes.length === 0 ? '<div style="text-align:center;font-size:12px;color:var(--text3);margin-top:10px">Nenhum pedido este mês ainda</div>' : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <button class="btnp" style="justify-content:center;font-size:13px" onclick="openNewChoice()">
        <i class="ti ti-plus"></i> Nova receita
      </button>
      <button class="btns" style="justify-content:center;font-size:13px" onclick="goPage('confeitaria')">
        <i class="ti ti-cake"></i> Novo pedido
      </button>
      <button class="btns" style="justify-content:center;font-size:13px" onclick="goPage('agenda')">
        <i class="ti ti-calendar"></i> Agenda
      </button>
      <button class="btns" style="justify-content:center;font-size:13px" onclick="goPage('ficha')">
        <i class="ti ti-list-check"></i> Ficha semanal
      </button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btns" style="flex:1;justify-content:center;font-size:12px" onclick="goPage('compras')">
        <i class="ti ti-shopping-cart"></i> Lista de compras
      </button>
      <button class="btnp" style="flex:1;justify-content:center;font-size:12px" onclick="if(typeof compartilharCardapioRapido==='function') compartilharCardapioRapido()">
        <i class="ti ti-share"></i> Compartilhar cardápio
      </button>
      <button class="btns" style="flex:1;justify-content:center;font-size:12px" onclick="goPage('portfolio')">
        <i class="ti ti-photo"></i> Portfólio
      </button>
      <button class="btns" style="flex:1;justify-content:center;font-size:12px" onclick="goPage('metas')">
        <i class="ti ti-target"></i> Minha meta
      </button>
      <button class="btns" style="flex:1;justify-content:center;font-size:12px" onclick="goPage('cardapio-cfg')">
        <i class="ti ti-menu-2"></i> Cardápio
      </button>
    </div>

    <div class="st"><i class="ti ti-flame"></i> Receitas recentes</div>
    ${recentes.length ? recentes.map(function(r2) {
      var cfg2 = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
      var vh2 = cfg2.valorHora || 25;
      var ip2 = cfg2.indiretoPct || 15;
      var mn2 = cfg2.margemNegocio || 30;
      var pc2 = calcAt(r2, 1);
      var horas2 = (r2.time || 60) / 60;
      var custoT2 = pc2.cost * (1 + ip2/100) + horas2 * vh2;
      var precoM2 = custoT2 > 0 ? custoT2 / (1 - mn2/100) : 0;
      var photo2 = r2.photos && r2.photos[0];
      var rid = r2.id;
      return '<div onclick="viewRecipe(' + JSON.stringify(rid) + ')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(160deg,#1E1408,#2A1C0A);border:1px solid rgba(200,163,91,.2);border-radius:10px;margin-bottom:8px;cursor:pointer">'
        + '<div style="width:44px;height:44px;border-radius:8px;overflow:hidden;background:#2A1C0A;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px">'
        + (photo2 ? '<img src="' + photo2 + '" style="width:100%;height:100%;object-fit:cover">' : (r2.cat==='doce'?'🍰':'🥩'))
        + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:14px;font-weight:700;color:#F5EDD8;font-family:Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r2.name + '</div>'
        + '<div style="display:flex;gap:5px;align-items:center;margin-top:3px">'
        + '<span class="tag t' + r2.cat[0] + '" style="font-size:9px">' + r2.cat + '</span>'
        + (r2.group ? '<span class="badge badge-blue" style="font-size:9px">' + r2.group + '</span>' : '')
        + '<span style="font-size:10px;color:var(--text3)"><i class="ti ti-clock"></i> ' + fT(r2.time) + '</span>'
        + '</div></div>'
        + '<div style="text-align:right;flex-shrink:0">'
        + '<div style="font-size:12px;font-weight:700;color:var(--gold)">' + fR(precoM2) + '</div>'
        + '<div style="font-size:9px;color:var(--text3)">preço mín.</div>'
        + '</div></div>';
    }).join('') : '<div class="est" style="padding:16px"><i class="ti ti-book"></i><p>Nenhuma receita ainda</p></div>'}

    <button class="btns" style="width:100%;justify-content:center;font-size:12px;margin-top:4px" onclick="syncNow()">
      <i class="ti ti-refresh"></i> Sincronizar agora
    </button>`;
}

async function syncNow() {
  toast('Sincronizando...');
  const ok = await loadFromCloud();
  renderHome();
  renderRecipes();
  toast(ok ? 'Sincronizado! ' + recipes.length + ' receita(s)' : 'Erro na conexão');
}

// ═══════ RENDER RECIPES COM SUB-ABAS ═══════
function setCatFilter(val) {
  window._currentCat = val || '';
  var fc = document.getElementById('fc'); if(fc) fc.value = val;
  ['all','doce','salgada'].forEach(function(k) {
    var btn = document.getElementById('cat-' + k);
    if (!btn) return;
    var active = (k === 'all' && val === '') || k === val;
    btn.style.borderColor = active ? 'var(--gold)' : 'var(--border)';
    btn.style.background  = active ? 'var(--gold)' : 'var(--bg)';
    btn.style.color       = active ? '#fff' : 'var(--text2)';
  });
  buildSubAbas(val);
  window._currentSubGrp = '';
  renderRecipes();
}

function buildSubAbas(cat) {
  var container = document.getElementById('sub-abas-container');
  if (!container) return;
  if (!cat) { container.style.display = 'none'; container.innerHTML = ''; return; }
  var seen = {};
  var groups = [];
  for (var i = 0; i < recipes.length; i++) {
    var r = recipes[i];
    if (r.cat === cat && r.group && !seen[r.group]) {
      seen[r.group] = true;
      groups.push(r.group);
    }
  }
  groups.sort();
  if (!groups.length) { container.style.display = 'none'; container.innerHTML = ''; return; }
  container.style.display = 'flex';
  var parts = ['<button class="sub-aba act" id="sub-all" data-grp="" onclick="setSubAba(this.dataset.grp)">Todas</button>'];
  for (var j = 0; j < groups.length; j++) {
    var g = groups[j];
    var sid = g.replace(/[^a-zA-Z0-9]/g, '_');
    parts.push('<button class="sub-aba" id="sub-' + sid + '" data-grp="' + g + '" onclick="setSubAba(this.dataset.grp)">' + g + '</button>');
  }
  container.innerHTML = parts.join('');
}

function setSubAba(grp) {
  window._currentSubGrp = grp || '';
  document.querySelectorAll('.sub-aba').forEach(function(b){ b.classList.remove('act'); });
  var safeId = grp ? grp.replace(/[^a-zA-Z0-9]/g,'_') : 'all';
  var btn = document.getElementById('sub-' + safeId);
  if(btn) btn.classList.add('act');
  renderRecipes();
}

function renderRecipes() {
  var q   = (document.getElementById('si').value || '').toLowerCase();
  var cat = window._currentCat || '';
  var grp = window._currentSubGrp || '';
  var el  = document.getElementById('recipes-list');
  var guest = isGuest();

  var list = recipes.filter(function(r) {
    return (!q || (r.name||'').toLowerCase().includes(q))
        && (!cat || r.cat === cat)
        && (!grp || r.group === grp);
  });
  if (guest) list = list.filter(function(r){ return shareConfig.sharedIds.includes(r.id); });

  if (!list.length) {
    el.innerHTML = guest
      ? '<div class="est"><i class="ti ti-eye-off"></i><p>Nenhuma receita compartilhada.</p></div>'
      : '<div class="est"><i class="ti ti-salad"></i><p>Nenhuma receita.</p><button class="btnp" onclick="openNewChoice()"><i class="ti ti-plus"></i> Criar</button></div>';
    return;
  }

  list = list.slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||'','pt-BR'); });

  var html = '<div class="recipes-grid">';
  var lastLetra = '';

  list.forEach(function(r) {
    var letra = (r.name||'?')[0].toUpperCase();
    if (letra !== lastLetra) {
      html += '<div class="alpha-divider">' + letra + '</div>';
      lastLetra = letra;
    }

    var shared = shareConfig.sharedIds.includes(r.id);
    var photo  = r.photos && r.photos[0];
    var p      = calcAt(r, 1);
    var pct    = p.cost > 0 ? (p.luc / p.cost * 100) : 0;
    var emoji  = r.cat === 'doce' ? '🍰' : '🥩';

    html += '<div class="rc-card">';
    if (shared) html += '<div class="rc-shared-badge"><i class="ti ti-share" style="font-size:9px"></i></div>';
    if (!guest && p.cost > 0) html += '<div class="rc-lucro-badge"><span class="pb ' + pctClass(pct) + '" style="font-size:9px">' + pct.toFixed(0) + '%</span></div>';

    if (photo) {
      html += '<img class="rc-card-thumb" src="' + photo + '" alt="" loading="lazy" onclick="viewRecipe(\'' + r.id + '\')">';
    } else {
      html += '<div class="rc-card-no-photo" onclick="viewRecipe(\'' + r.id + '\')">' + emoji + '</div>';
    }

    html += '<div class="rc-card-body">'
      + '<div class="rc-card-name" onclick="viewRecipe(\'' + r.id + '\')">' + (r.name||'') + '</div>'
      + '<div class="rc-card-meta">'
      + '<span class="tag t' + r.cat[0] + '" style="font-size:9px">' + r.cat + '</span>'
      + (r.group ? '<span class="badge badge-blue" style="font-size:9px">' + r.group + '</span>' : '')
      + (r.time ? '<span style="font-size:10px;color:var(--text3)"><i class="ti ti-clock"></i> ' + fT(r.time) + '</span>' : '')
      + '</div>';

    html += '<div class="rc-card-actions">';
    html += '<button class="rc-card-btn azul" onclick="viewRecipe(\'' + r.id + '\')" title="Ver"><i class="ti ti-eye"></i></button>';
    if (!guest) {
      html += '<button class="rc-card-btn verde" onclick="openEdit(\'' + r.id + '\')" title="Editar"><i class="ti ti-edit"></i></button>'
        + '<button class="rc-card-btn ' + (shared ? 'shared-on' : '') + '" onclick="toggleShare(\'' + r.id + '\',this)" title="Compartilhar"><i class="ti ti-' + (shared ? 'share-3' : 'share') + '"></i></button>';
    }
    html += '<button class="rc-card-btn ouro" onclick="viewRecipe(\'' + r.id + '\');setTimeout(toggleFullReceita,300)" title="Tela cheia"><i class="ti ti-maximize"></i></button>';
    if (!guest) {
      html += '<button class="rc-card-btn vermelho" onclick="if(typeof delRecipe===\'function\') delRecipe(\'' + r.id + '\')" title="Excluir"><i class="ti ti-trash"></i></button>';
    }
    html += '</div>';

    html += '</div></div>';
  });

  html += '</div>';
  el.innerHTML = html;
}

async function toggleShare(id, btn) {
  const idx = shareConfig.sharedIds.indexOf(id);
  if (idx >= 0) { shareConfig.sharedIds.splice(idx, 1); toast('Removida do compartilhamento'); }
  else { shareConfig.sharedIds.push(id); toast('Marcada para compartilhar!'); }
  renderHome(); renderRecipes();
  await saveConfigToCloud();
}

// ═══════ NEW RECEIPE ═══════
function openNewChoice() {
  newMode = null; fotoB64 = null;
  document.getElementById('foto-section').style.display = 'none';
  document.getElementById('foto-prev').style.display = 'none';
  document.getElementById('ai-bar').style.display = 'none';
  document.getElementById('btn-ler').style.display = 'none';
  document.getElementById('btn-choice-ok').style.display = 'none';
  document.getElementById('nmc-manual').classList.remove('sel');
  document.getElementById('nmc-foto').classList.remove('sel');
  document.getElementById('modal-choice').style.display = 'flex';
}

function chooseMode(m) {
  newMode = m;
  document.getElementById('nmc-manual').classList.toggle('sel', m === 'manual');
  document.getElementById('nmc-foto').classList.toggle('sel', m === 'foto');
  document.getElementById('foto-section').style.display = m === 'foto' ? 'block' : 'none';
  document.getElementById('btn-choice-ok').style.display = m === 'manual' ? 'inline-flex' : 'none';
}

function proceedChoice() {
  if (newMode === 'manual') { cm('modal-choice'); openNewRecipe(document.getElementById('choice-cat').value, document.getElementById('choice-grp').value); }
}

function handleFoto(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    fotoB64 = ev.target.result.split(',')[1];
    const p = document.getElementById('foto-prev');
    p.innerHTML = `<img src="${ev.target.result}" style="max-width:100%;max-height:180px;object-fit:contain;border-radius:var(--radius-sm)">`;
    p.style.display = 'flex';
    document.getElementById('btn-ler').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

// ═══════ EDIT FORM & ACTIONS ═══════
function openNewRecipe(cat = 'salgada', grp = '', pre = null) {
  editId = null; curIngr = pre?.ingredients || []; curPhotos = []; curFormas = []; formasEnabled = false;
  document.getElementById('edit-title').textContent = 'Nova receita';
  document.getElementById('fn').value = pre?.name || '';
  document.getElementById('fcat').value = cat;
  document.getElementById('fgrp').value = grp || '';
  document.getElementById('fyld').value = pre?.yield || 6;
  document.getElementById('ftm').value = pre?.time || 60;
  document.getElementById('funit').value = pre?.unit || 'porção';
  document.getElementById('fmrg').value = 100; document.getElementById('fext').value = 0;
  document.getElementById('fprep').value = pre?.preparo || '';
  document.getElementById('fcomment').value = pre?.comment || '';
  document.getElementById('recipe-photos-grid').innerHTML = '';
  renderIngrTable(); if(typeof renderFormas==='function') renderFormas(); if(typeof updateFormaToggle==='function') updateFormaToggle(); checkFormaTab(); st2(0);
  if(typeof updateGrupoSelects==='function') updateGrupoSelects();
  document.getElementById('modal-edit').style.display = 'flex';
}

function openEdit(id) {
  const r = recipes.find(x => x.id === id); if (!r) return;
  editId = id; curIngr = JSON.parse(JSON.stringify(r.ingredients || []));
  curPhotos = r.photos ? [...r.photos] : [];
  curFormas = r.formas ? JSON.parse(JSON.stringify(r.formas)) : [];
  formasEnabled = r.formasEnabled || false;
  document.getElementById('edit-title').textContent = 'Editar receita';
  document.getElementById('fn').value = r.name || '';
  document.getElementById('fcat').value = r.cat || 'salgada';
  document.getElementById('fgrp').value = r.group || '';
  document.getElementById('fyld').value = r.yield_qty || r.yield || 6;
  document.getElementById('ftm').value = r.time || 60;
  document.getElementById('funit').value = r.unit || 'porção';
  document.getElementById('fmrg').value = r.margin || 100;
  document.getElementById('fext').value = r.extra || 0;
  document.getElementById('fprep').value = r.preparo || '';
  document.getElementById('fcomment').value = r.comment || '';
  renderIngrTable(); if(typeof renderFormas==='function') renderFormas(); if(typeof renderRecipePhotosGrid==='function') renderRecipePhotosGrid(); if(typeof updateFormaToggle==='function') updateFormaToggle(); checkFormaTab(); st2(0);
  if(typeof updateGrupoSelects==='function') updateGrupoSelects();
  document.getElementById('modal-edit').style.display = 'flex';
}

function checkFormaTab() {
  const grp = document.getElementById('fgrp').value;
  const tabForma = document.getElementById('tab-forma');
  if(tabForma) tabForma.style.display = ['Bolos', 'Pães'].includes(grp) ? 'inline-block' : 'none';
}

// Controle de visualização de abas internas no formulário de edição
function st2(n) {
  [0,1,2,3,4,5,6].forEach(i => { const el = document.getElementById('et'+i); if(el) el.style.display = i===n?'block':'none'; });
  document.querySelectorAll('.tb').forEach((t,i) => t.classList.toggle('act', i===n));
  if(n===3 && typeof updCosts === 'function') updCosts();
}

function addIngr() { curIngr.push({ name: '', qty: 100, unit: 'g', price: 0, isBase: false }); renderIngrTable(); }
function remIngr(i) { curIngr.splice(i, 1); renderIngrTable(); }
function setBase(i) { curIngr.forEach((ig, j) => ig.isBase = (j === i)); renderIngrTable(); }

function renderIngrTable() {
  const tb = document.getElementById('ingr-body');
  if(!tb) return;
  if (!curIngr.length) { tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--text2);font-size:12px">Toque em "+ Adicionar"</td></tr>`; return; }
  tb.innerHTML = curIngr.map((ig, i) => {
    return `<tr class="${ig.isBase ? 'ihl' : ''}">
      <td style="text-align:center"><input type="radio" name="bir" ${ig.isBase?'checked':''} onchange="setBase(${i})" style="accent-color:var(--blue);width:18px;height:18px"></td>
      <td><input value="${ig.name}" placeholder="Nome" oninput="curIngr[${i}].name=this.value" style="color:var(--text)"></td>
      <td><input type="number" value="${ig.qty}" oninput="curIngr[${i}].qty=this.value" style="width:60px"></td>
      <td><input value="${ig.unit}" oninput="curIngr[${i}].unit=this.value" style="width:40px"></td>
      <td><input type="number" step="0.01" value="${ig.price}" oninput="curIngr[${i}].price=this.value" style="width:70px"></td>
      <td style="text-align:center"><button class="rc-card-btn vermelho" onclick="remIngr(${i})"><i class="ti ti-trash"></i></button></td>
    </tr>`;
  }).join('');
}

function toggleFullReceita() {
  // Transições visuais de tela cheia
}

// ═══════════════════════════════════════════
// INTEGRAÇÕES COM I.A. (CORRIGIDAS VIA NETLIFY FUNCTIONS)
// ═══════════════════════════════════════════

async function lerFoto() {
  if (!fotoB64) return;
  const cat = document.getElementById('choice-cat').value;
  const grp = document.getElementById('choice-grp').value;
  const bar = document.getElementById('ai-bar'), msg = document.getElementById('ai-msg'), dot = document.getElementById('ai-dot'), btn = document.getElementById('btn-ler');
  bar.style.display = 'flex'; btn.disabled = true; msg.textContent = 'Claude lendo anotação...'; dot.className = 'ai-dot pulse';
  
  try {
    const r = await fetch('/.netlify/functions/ler-receita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fotoB64 })
    });
    
    if (!r.ok) throw new Error('Falha na comunicação com o servidor.');
    
    const d = await r.json();
    dot.className = 'ai-dot ok'; msg.textContent = 'Receita lida!';
    setTimeout(() => { cm('modal-choice'); openNewRecipe(cat, grp, d); }, 700);
  } catch (err) { 
    dot.className = 'ai-dot err'; msg.textContent = 'Erro: ' + err.message; btn.disabled = false; 
  }
}

async function gerarModelosTopo() {
  const inputs = document.querySelectorAll('#page-deco input, #page-deco textarea');
  
  let aro = 'Aro 20';
  let cobertura = 'Chantininho';
  let tema = '';
  let cores = '';
  let ocasiao = '';
  let obs = '';

  inputs.forEach(el => {
    const ph = (el.placeholder || '').toLowerCase();
    const val = el.value;
    if (ph.includes('aro')) aro = val;
    else if (ph.includes('chantininho')) cobertura = val;
    else if (ph.includes('jardim')) tema = val;
    else if (ph.includes('rosa nude')) cores = val;
    else if (ph.includes('chá de bebê')) ocasiao = val;
    else if (ph.includes('cliente gosta')) obs = val;
  });

  if (!tema) {
    toast('⚠️ Por favor, preencha o Tema do bolo!');
    return;
  }

  const btnImg = document.querySelector('button[onclick*="gerarModelosTopo"]') || document.querySelector('button[style*="purple"]');
  const originalText = btnImg ? btnImg.innerHTML : 'Gerar 3 modelos de topo';
  if (btnImg) {
    btnImg.disabled = true;
    btnImg.innerHTML = '<i class="ti ti-loader pulse"></i> Gerando modelos com IA...';
  }

  toast('🚀 Enviando pedido para o Ideogram...');

  let resultContainer = document.getElementById('ideogram-results');
  if (!resultContainer) {
    resultContainer = document.createElement('div');
    resultContainer.id = 'ideogram-results';
    resultContainer.style = 'margin-top: 24px; display: grid; grid-template-columns: 1fr; gap: 16px; padding: 10px;';
    const targetPage = document.getElementById('page-deco') || document.querySelector('.page.act');
    if (targetPage) targetPage.appendChild(resultContainer);
  }
  resultContainer.innerHTML = '<div style="text-align:center; color:var(--gold); padding:20px;"><i class="ti ti-wand" style="font-size:24px;"></i><p>Criando as artes no Ideogram... Isso pode levar até 30 segundos.</p></div>';

  const promptIdeogram = `Cake topper design sheet layout, theme: ${tema}, occasion: ${ocasiao}, main colors: ${cores}, extra details: ${obs}. Style: elegant custom layered paper scrap cake topper, 3D die-cut kit vector preview look, isolated on clean solid minimalist background, displaying 3 distinct option concepts. High definition commercial product render --ar 4:3`;

  try {
    const response = await fetch('/.netlify/functions/gerar-imagem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptIdeogram })
    });

    if (!response.ok) throw new Error('A API do Ideogram recusou ou falhou.');

    const data = await response.json();
    resultContainer.innerHTML = '';

    if (data.images && data.images.length > 0) {
      data.images.forEach((imgUrl, index) => {
        resultContainer.innerHTML += `
          <div style="background: linear-gradient(160deg,#1E1408,#2A1C0A); border: 1px solid rgba(200,163,91,0.3); border-radius: 12px; padding: 14px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div style="font-family:Georgia,serif; font-size:14px; color:var(--gold); margin-bottom:8px; font-weight:700;">Opção Proposta 0${index + 1}</div>
            <img src="${imgUrl}" style="width: 100%; border-radius: 8px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.1);" alt="Opção ${index + 1}">
            <button class="btnp" onclick="window.open('${imgUrl}', '_blank')" style="font-size: 12px; padding: 8px 16px; width:100%; justify-content:center;">
              <i class="ti ti-external-link"></i> Abrir Imagem em Alta Resolução
            </button>
          </div>
        `;
      });
      toast('✨ Modelos gerados com sucesso!');
    } else {
      throw new Error('Nenhuma imagem retornada.');
    }
  } catch (error) {
    console.error(error);
    resultContainer.innerHTML = `<div style="text-align:center; color:#FF8080; padding:20px;"><i class="ti ti-alert-triangle"></i><p>Erro ao gerar modelos: ${error.message}</p></div>`;
    toast('❌ Falha na geração dos modelos.');
  } finally {
    if (btnImg) {
      btnImg.disabled = false;
      btnImg.innerHTML = originalText;
    }
  }
}
