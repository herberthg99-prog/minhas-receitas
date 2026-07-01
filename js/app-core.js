// app-core.js v6 — Sucrée Confeitaria (navegação Anterior/Próxima também na Visualização)
// ═══════════════════════════════════════════

const SUPABASE_URL = 'https://tisdrdgpizywzcrjxnok.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpc2RyZGdwaXp5d3pjcmp4bm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjAxNTksImV4cCI6MjA5NzEzNjE1OX0.7hGOXUCyxtQR4sRc-7uxVLPrjqgJ5ss7lKJydTRFHkg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const USER_ID = 'herberth_admin';
localStorage.setItem('mr_user_id', USER_ID);

let recipes = [];
let shareConfig = { pwd: '', sharedIds: [] };
let editId = null, curIngr = [], curPhotos = [], curFormas = [], formasEnabled = false;
let curRecheiosVinculados = []; // seleção do checklist "Aplica-se automaticamente a estes recheios" — guardada aqui, não só no DOM, para nunca perder seleção ao clicar em outro item
let curMultiplicadorAro = {};
let newMode = null, fotoB64 = null, viewState = {}, rmap = {};
let syncPending = false;
window._currentSubGrp = ''; // active sub-aba group filter
window._currentCat = ''; // active category filter

// ═══════ UTILS ═══════
function genId() { return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fR(v) { return 'R$\u00a0' + parseFloat(v || 0).toFixed(2); }
function fT(m) { if (!m) return '—'; if (m < 60) return m + 'min'; const h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? r + 'min' : ''); }
function toast(msg, dur = 2400) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), dur); }
function cm(id) { document.getElementById(id).style.display = 'none'; }
function getBase(r) { return (r.ingredients || []).find(i => i.isBase) || null; }
// Custo de uma quantidade de ingrediente. O preço NUNCA é lido de ig.price — sempre vem
// do Estoque (fonte única de verdade), via getPrecoIngrediente(), definida em
// app-features.js. Isso garante que mudar o preço no Estoque reflita automaticamente em
// toda receita que usa aquele ingrediente, sem precisar editar/salvar cada uma.
function iCost(ig, q) {
  var preco = (typeof getPrecoIngrediente === 'function') ? getPrecoIngrediente(ig.name) : parseFloat(ig.price || 0);
  return q * preco;
}
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
  function semZeroDecimal(n, casas) {
    const s = n.toFixed(casas);
    return s.replace(/\.?0+$/, '').replace('.',',') || '0';
  }
  if (u === 'g') {
    if (q >= 1000) return (q/1000).toFixed(3).replace(/0+$/,'').replace(/\.$/,'').replace('.',',') + ' kg';
    if (q >= 100)  return q.toFixed(0) + ' g';
    if (q >= 10)   return semZeroDecimal(q, 1) + ' g';
    return semZeroDecimal(q, 3) + ' g';
  }
  if (u === 'ml') {
    if (q >= 1000) return (q/1000).toFixed(3).replace(/0+$/,'').replace(/\.$/,'').replace('.',',') + ' L';
    if (q >= 100)  return q.toFixed(0) + ' ml';
    return semZeroDecimal(q, 1) + ' ml';
  }
  if (q >= 100) return q.toFixed(0) + ' ' + (unit||'');
  if (q >= 10)  return semZeroDecimal(q, 1) + ' ' + (unit||'');
  return semZeroDecimal(q, 3) + ' ' + (unit||'');
}

// ═══════ STORAGE (FOTOS) ═══════
// Faz upload de um arquivo de foto para o bucket "receitas-fotos" do Supabase Storage e
// retorna a URL pública (curta, ex: https://...supabase.co/storage/v1/object/public/receitas-fotos/foto_123.jpg).
// Usa nome único por timestamp+random para nunca colidir entre receitas diferentes.
// Substitui o uso de base64 embutido no array `photos`, que causava timeout nas queries.
async function uploadFotoParaStorage(file) {
  const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop().toLowerCase() : 'jpg';
  const nomeArquivo = 'foto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const { data, error } = await sb.storage
    .from('receitas-fotos')
    .upload(nomeArquivo, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: urlData } = sb.storage.from('receitas-fotos').getPublicUrl(nomeArquivo);
  return urlData.publicUrl;
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

// Salva o cache local de receitas SEM as fotos (que já estão seguras no Supabase) — evita
// exceder a quota do localStorage conforme o número de receitas com imagem cresce. As fotos
// continuam carregando normalmente do Supabase ao abrir o app.
function salvarCacheLocalReceitas() {
  try {
    const recipesLeves = recipes.map(function(r){
      const copia = {...r};
      if (copia.photos && copia.photos.length) copia.photos = [];
      return copia;
    });
    localStorage.setItem('mr_v4_recipes', JSON.stringify(recipesLeves));
  } catch(quotaErr) { /* mesmo sem fotos, se ainda exceder a quota, ignora — Supabase é a fonte de verdade */ }
}

async function saveToCloud(recipe) {
  setSyncStatus('syncing', 'salvando...');
  const row = localToDb(recipe);
  try {
    const { error } = await sb.from('receitas').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    setSyncStatus('ok', 'sincronizado');
    salvarCacheLocalReceitas();
    return { ok: true };
  } catch (err) {
    setSyncStatus('err', 'erro ao salvar');
    salvarCacheLocalReceitas();
    return { ok: false, error: err };
  }
}

async function deleteFromCloud(id) {
  try {
    await sb.from('receitas').delete().eq('id', id).eq('user_id', USER_ID);
    setSyncStatus('ok', 'sincronizado');
  } catch (err) { setSyncStatus('err', 'erro'); }
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
    subgrupo: r.subgrupo || null,
    unit: r.unit, yield_qty: r.yield_qty || r.yield || 6,
    peso_total: r.pesoTotal || null,
    multiplicador_aro: r.multiplicadorAro ? JSON.stringify(r.multiplicadorAro) : null,
    recheios_vinculados: (r.recheiosVinculados && r.recheiosVinculados.length) ? JSON.stringify(r.recheiosVinculados) : null,
    calda_vinculada: r.caldaVinculada || null,
    tipo_cardapio: r.tipoCardapio || null,
    subgrupo_cardapio: r.subgrupoCardapio || null,
    embalagem: r.embalagem || null,
    conservacao: r.conservacao || null,
    time_min: r.time || 0, margin: r.margin || 100, extra: r.extra || 0,
    preparo: r.preparo || '', comment: r.comment || '',
    usa_panela_mexedora: r.usaPanelaMexedora || false,
    panela_tempo: r.panelaTempo || null,
    panela_velocidade: r.panelaVelocidade || null,
    photos: r.photos || [], formas: r.formas || [],
    formas_enabled: r.formasEnabled || false,
    ingredients: r.ingredients || [],
    shared: shareConfig.sharedIds.includes(r.id),
    updated_at: new Date().toISOString()
  };
}

function dbToLocal(row) {
  return {
    id: row.id, name: row.name, cat: row.cat, group: row.recipe_group || '',
    subgrupo: row.subgrupo || '',
    unit: row.unit || 'porção', yield_qty: row.yield_qty || 6, yield: row.yield_qty || 6,
    pesoTotal: row.peso_total || null,
    multiplicadorAro: (function(){ try { return row.multiplicador_aro ? JSON.parse(row.multiplicador_aro) : null; } catch(e) { return null; } })(),
    recheiosVinculados: (function(){ try { return row.recheios_vinculados ? JSON.parse(row.recheios_vinculados) : []; } catch(e) { return []; } })(),
    caldaVinculada: row.calda_vinculada || '',
    tipoCardapio: row.tipo_cardapio || '',
    subgrupoCardapio: row.subgrupo_cardapio || '',
    embalagem: row.embalagem || '',
    conservacao: row.conservacao || '',
    time: row.time_min || 0, margin: row.margin || 100, extra: row.extra || 0,
    preparo: row.preparo || '', comment: row.comment || '',
    usaPanelaMexedora: row.usa_panela_mexedora || false,
    panelaTempo: row.panela_tempo || null,
    panelaVelocidade: row.panela_velocidade || null,
    photos: row.photos || [], formas: row.formas || [],
    formasEnabled: row.formas_enabled || false,
    ingredients: row.ingredients || [],
    shared: row.shared || false,
    createdAt: new Date(row.created_at).getTime()
  };
}


// ═══════ NAVIGATION ═══════
// Navega para Receitas já filtrando por um grupo específico (usado pelos itens
// Bolos/Recheios/Massas da sidebar — atalhos para o que já existe em Receitas).
function goPageReceitasGrupo(grupo, navId) {
  goPage('receitas');
  setCatFilter(''); // garante "Todas" categorias antes de aplicar o sub-filtro de grupo
  setTimeout(function(){ setSubAba(grupo); }, 0);
  if (navId) {
    document.querySelectorAll('.bni').forEach(function(e){ e.classList.remove('act'); });
    var el = document.getElementById(navId);
    if (el) el.classList.add('act');
  }
}

// Navega para Config já rolando até a seção de valores/custos (usado pelo item
// "Custos" da sidebar — atalho para a seção que já existe dentro de Config).
function goPageConfigCustos() {
  goPage('config');
  document.querySelectorAll('.bni').forEach(function(e){ e.classList.remove('act'); });
  var navEl = document.getElementById('nav-custos');
  if (navEl) navEl.classList.add('act');
  setTimeout(function(){
    var alvo = [...document.querySelectorAll('#page-config .card')].find(function(c){
      return /pre[çc]o|valor|custo/i.test(c.textContent);
    });
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function goPage(p) {
  document.querySelectorAll('.page').forEach(e => e.classList.remove('act'));
  document.querySelectorAll('.bni, .bni-premium').forEach(e => e.classList.remove('act'));
  document.getElementById('page-' + p).classList.add('act');
  const el = document.getElementById('nav-' + p);
  if (el) el.classList.add('act');
  const elp = document.getElementById('navp-' + p);
  if (elp) elp.classList.add('act');
  if (p === 'home') renderHome();
  if (p === 'receitas') { 
    var curCat = document.getElementById('fc') ? document.getElementById('fc').value : '';
    buildSubAbas(curCat);
    renderRecipes(); 
  }
  if (p === 'confeitaria') renderConfeitaria();
  if (p === 'estoque') renderEstoque();
  if (p === 'config') renderConfigPage();
  if (p === 'share') renderSharePage();
  if (p === 'deco') renderDecoPage();
  if (p === 'calc') renderCalcMassa();
  if (p === 'portfolio') renderPortfolio();
  if (p === 'rascunho') renderRascunho();
  if (p === 'agenda')   renderAgenda();
  if (p === 'compras')  renderListaCompras();
  if (p === 'ficha')    renderFichaProducao();
  if (p === 'metas')         renderMetas();
  if (p === 'cardapio-cfg') { loadCardapioConfigFromCloud().then(renderCardapioConfig); renderCardapioConfig(); }
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

  // ── DASHBOARD FINANCEIRO MENSAL ──
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const nomeMes = hoje.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
  const cfg = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
  const valorHora   = cfg.valorHora    || 25;
  const indiretoPct = cfg.indiretoPct  || 15;
  const margemNeg   = cfg.margemNegocio || 30;

  // Pedidos do mês atual
  const pedidosMes = (typeof pedidos !== 'undefined' ? pedidos : []).filter(p => {
    if (!p.data || p.status === 'cancelado') return false;
    const d = new Date(p.data + 'T12:00:00');
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });

  const faturamento  = pedidosMes.reduce((a, p) => a + parseFloat(p.valorTotal||0), 0);
  const recebido     = pedidosMes.reduce((a, p) => a + parseFloat(p.sinal||0), 0);
  const aReceber     = faturamento - recebido;
  const qtdPedidos   = pedidosMes.length;

  // Custo estimado dos pedidos (ingredientes + operacional + topo/flores reais quando informados)
  const custoEstimado = pedidosMes.reduce((a, p) => {
    const aro = p.aro || 20;
    const custoOp = typeof calcCustoOperacional === 'function' ? calcCustoOperacional(aro) : 0;
    const custoIngr = parseFloat(p.custoEstimado || p.valorBolo * 0.30 || 0);
    const custoTopo = p.topo ? parseFloat(p.custoRealTopo ?? (typeof sucreeConfig!=='undefined'?sucreeConfig.topoValor:45)) : 0;
    const custoFlores = p.flores ? parseFloat(p.custoRealFlores ?? (typeof sucreeConfig!=='undefined'?sucreeConfig.floresValor:50)) : 0;
    return a + custoOp + custoIngr + custoTopo + custoFlores;
  }, 0);

  const lucroEstimado = faturamento - custoEstimado;
  const margemAtual = faturamento > 0 ? (lucroEstimado / faturamento * 100) : 0;

  // ── PENDÊNCIAS DE PREÇO NO ESTOQUE ──
  const pendentesPreco = typeof getIngredientesPendentesDePreco === 'function' ? getIngredientesPendentesDePreco() : [];
  const cardPendenciasHtml = pendentesPreco.length ? `
    <div onclick="goPage('estoque')" style="cursor:pointer;background:rgba(192,57,43,.1);border:1px solid rgba(192,57,43,.35);border-radius:12px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <div style="font-size:28px">⚠️</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:800;color:#e74c3c">${pendentesPreco.length} ingrediente(s) sem preço no Estoque</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">O custo das receitas que usam ${pendentesPreco.length===1?'ele':'eles'} está incompleto. Toque para cadastrar.</div>
      </div>
      <i class="ti ti-chevron-right" style="color:#e74c3c"></i>
    </div>` : '';

  document.getElementById('page-home').innerHTML = `
    ${cardPendenciasHtml}
    <!-- DASHBOARD MENSAL -->
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

      <!-- Faturamento -->
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

      <!-- Lucro destaque -->
      <div style="background:${lucroEstimado>=0?'rgba(15,110,86,.2)':'rgba(255,80,80,.2)'};border:1px solid ${lucroEstimado>=0?'rgba(15,110,86,.4)':'rgba(255,80,80,.4)'};border-radius:8px;padding:12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:10px;color:${lucroEstimado>=0?'var(--teal)':'#FF8080'};font-weight:700;text-transform:uppercase;margin-bottom:3px">${lucroEstimado>=0?'📈 Lucro estimado':'⚠️ Prejuízo'}</div>
          <div style="font-size:24px;font-weight:800;color:${lucroEstimado>=0?'var(--teal)':'#FF8080'}">${fR(Math.abs(lucroEstimado))}</div>
          <div style="font-size:10px;color:var(--text3)">para reinvestir e crescer</div>
        </div>
        <div style="font-size:36px">${lucroEstimado>=0?'🎂':'📉'}</div>
      </div>

      <!-- Recebido / A receber -->
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

      ${qtdPedidos === 0 ? '<div style="text-align:center;font-size:12px;color:var(--text3);margin-top:10px">Nenhum pedido este mês ainda</div>' : ''}
    </div>

    <!-- AÇÕES RÁPIDAS -->
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
      <button class="btnp" style="justify-content:center;font-size:13px" onclick="compartilharCardapioRapido()">
        <i class="ti ti-share"></i> Compartilhar cardápio
      </button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btns" style="flex:1;justify-content:center;font-size:12px" onclick="goPage('compras')">
        <i class="ti ti-shopping-cart"></i> Lista de compras
      </button>
      <button class="btns" style="flex:1;justify-content:center;font-size:12px" onclick="goPage('ficha')">
        <i class="ti ti-list-check"></i> Ficha semanal
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

    <!-- MINI CALENDÁRIO DE PEDIDOS -->
    <div class="st"><i class="ti ti-calendar"></i> Pedidos do mês</div>
    ${buildMiniCalendarHome(hoje)}

    <!-- FATURAMENTO PREVISTO 6 MESES -->
    <div class="st" style="margin-top:14px"><i class="ti ti-chart-bar"></i> Faturamento previsto</div>
    ${buildFaturamento6Meses(hoje)}

    <button class="btns" style="width:100%;justify-content:center;font-size:12px;margin-top:4px" onclick="syncNow()">
      <i class="ti ti-refresh"></i> Sincronizar agora
    </button>`;
}

// ── MINI CALENDÁRIO (HOME) ──
function buildMiniCalendarHome(hoje) {
  var mesRef = hoje.getMonth(), anoRef = hoje.getFullYear();
  var primeiroDia = new Date(anoRef, mesRef, 1);
  var ultimoDia   = new Date(anoRef, mesRef + 1, 0);

  var pedidosPorDia = {};
  (typeof pedidos !== 'undefined' ? pedidos : []).forEach(function(p) {
    if (!p.data || p.status === 'cancelado') return;
    if (!pedidosPorDia[p.data]) pedidosPorDia[p.data] = [];
    pedidosPorDia[p.data].push(p);
  });

  var diasSemana = ['D','S','T','Q','Q','S','S'];
  var grid = '<div style="background:linear-gradient(160deg,#1E1408,#2A1C0A);border:1px solid rgba(200,163,91,.25);border-radius:12px;padding:12px;margin-bottom:4px">';
  grid += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">';
  diasSemana.forEach(function(d) {
    grid += '<div style="text-align:center;font-size:9px;font-weight:700;color:var(--text3);padding:3px">' + d + '</div>';
  });
  grid += '</div>';
  grid += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">';

  var inicio = primeiroDia.getDay();
  for (var e = 0; e < inicio; e++) grid += '<div style="min-height:34px"></div>';

  for (var dia = 1; dia <= ultimoDia.getDate(); dia++) {
    var dateStr = anoRef + '-' + String(mesRef+1).padStart(2,'0') + '-' + String(dia).padStart(2,'0');
    var pedsDia = pedidosPorDia[dateStr] || [];
    var temPed = pedsDia.length > 0;
    var isHoje = dia === hoje.getDate();
    var corDot = pedsDia.some(function(p){ return p.status==='producao'; }) ? 'var(--gold)'
               : pedsDia.some(function(p){ return p.status==='pronto'; }) ? 'var(--blue)'
               : pedsDia.some(function(p){ return p.status==='entregue'; }) ? '#888' : 'var(--teal)';

    grid += '<div onclick="' + (temPed ? "verDiaAgenda('" + dateStr + "')" : '') + '" style="min-height:34px;border-radius:7px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:' +
      (isHoje ? 'rgba(200,163,91,.25)' : 'rgba(255,255,255,.03)') +
      ';border:1px solid ' + (isHoje ? 'var(--gold)' : 'transparent') +
      ';cursor:' + (temPed ? 'pointer' : 'default') + '">';
    grid += '<span style="font-size:11px;font-weight:' + (isHoje?'800':'500') + ';color:' + (isHoje?'var(--gold)':'var(--text2)') + '">' + dia + '</span>';
    if (temPed) grid += '<span style="width:5px;height:5px;border-radius:50%;background:' + corDot + ';margin-top:1px"></span>';
    grid += '</div>';
  }
  grid += '</div>';

  var totalMes = Object.keys(pedidosPorDia).filter(function(d){
    var dd = new Date(d+'T12:00:00'); return dd.getMonth()===mesRef && dd.getFullYear()===anoRef;
  }).reduce(function(a,d){ return a + pedidosPorDia[d].length; }, 0);

  grid += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid rgba(200,163,91,.15)">';
  grid += '<span style="font-size:10px;color:var(--text3)">' + totalMes + ' pedido(s) este mês</span>';
  grid += '<button onclick="goPage(\'agenda\')" style="background:none;border:none;color:var(--gold);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Ver agenda completa →</button>';
  grid += '</div>';
  grid += '</div>';
  return grid;
}

// ── FATURAMENTO PREVISTO 6 MESES (HOME) ──
function buildFaturamento6Meses(hoje) {
  var mesAtual = hoje.getMonth(), anoAtual = hoje.getFullYear();
  var meses = [];
  var maxVal = 1;

  for (var i = 0; i < 6; i++) {
    var d = new Date(anoAtual, mesAtual + i, 1);
    var m2 = d.getMonth(), y2 = d.getFullYear();
    var pMes = (typeof pedidos !== 'undefined' ? pedidos : []).filter(function(p) {
      if (!p.data || p.status === 'cancelado') return false;
      var dd = new Date(p.data + 'T12:00:00');
      return dd.getMonth() === m2 && dd.getFullYear() === y2;
    });
    var fat = pMes.reduce(function(a,p){ return a + parseFloat(p.valorTotal||0); }, 0);
    if (fat > maxVal) maxVal = fat;
    meses.push({ nome: d.toLocaleDateString('pt-BR',{month:'short'}), ano: y2, fat: fat, qtd: pMes.length, isAtual: i===0 });
  }

  var html = '<div style="background:linear-gradient(160deg,#1E1408,#2A1C0A);border:1px solid rgba(200,163,91,.25);border-radius:12px;padding:14px">';
  html += '<div style="display:flex;gap:6px;align-items:flex-end;margin-bottom:8px">';
  meses.forEach(function(mo) {
    var barPct = Math.max((mo.fat / maxVal) * 100, mo.fat > 0 ? 4 : 0);
    var cor = mo.isAtual ? 'var(--gold)' : 'rgba(200,163,91,.55)';
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">';
    html += '<div style="font-size:9px;font-weight:700;color:' + cor + '">' + (mo.fat > 0 ? fR(mo.fat).replace('R$\u00a0','') : '—') + '</div>';
    html += '<div style="width:100%;height:64px;background:rgba(255,255,255,.05);border-radius:5px;position:relative;overflow:hidden">';
    html += '<div style="position:absolute;bottom:0;left:0;right:0;height:' + barPct + '%;background:' + cor + ';border-radius:4px;transition:height .3s"></div>';
    html += '</div>';
    html += '<div style="font-size:9px;color:var(--text3);text-transform:capitalize">' + mo.nome + '</div>';
    html += '</div>';
  });
  html += '</div>';

  var totalPrevisto = meses.reduce(function(a,m){ return a+m.fat; }, 0);
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(200,163,91,.15)">';
  html += '<span style="font-size:10px;color:var(--text3)">Total previsto (6 meses)</span>';
  html += '<span style="font-size:13px;font-weight:800;color:var(--gold)">' + fR(totalPrevisto) + '</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

async function syncNow() {
  toast('Sincronizando...');
  const ok = await loadFromCloud();
  renderHome();
  renderRecipes();
  toast(ok ? 'Sincronizado! ' + recipes.length + ' receita(s)' : 'Erro na conexão');
}

// ═══════ ESTRUTURA DE GRUPOS/SUBGRUPOS (editável) ═══════
// Estrutura padrão usada quando o usuário ainda não personalizou nada — replica os
// grupos fixos que já existiam antes desta feature, sem subgrupos.
var GRUPOS_PADRAO = {
  doce: ['Recheios','Bolos','Caldas','Coberturas','Biscoitos','Sobremesas','Pães','Bebidas','Massas','Tortas'],
  salgada: ['Recheios','Bolos','Caldas','Coberturas','Biscoitos','Pães','Bebidas','Carnes','Aves','Peixes','Massas','Lanches','Sopas']
};
// window._gruposEstrutura = { doce: [{nome, subgrupos:[]}], salgada: [...] }
window._gruposEstrutura = null;

function getGruposEstruturaPadrao() {
  var out = { doce: [], salgada: [] };
  Object.keys(GRUPOS_PADRAO).forEach(function(cat){
    out[cat] = GRUPOS_PADRAO[cat].map(function(nome){ return { nome: nome, subgrupos: [] }; });
  });
  return out;
}

async function loadGruposEstruturaFromCloud() {
  try {
    const { data } = await sb.from('config').select('grupos_estrutura').eq('user_id', USER_ID).limit(1);
    if (data && data.length && data[0].grupos_estrutura) {
      window._gruposEstrutura = JSON.parse(data[0].grupos_estrutura);
    } else {
      window._gruposEstrutura = getGruposEstruturaPadrao();
    }
  } catch(e) {
    window._gruposEstrutura = getGruposEstruturaPadrao();
  }
  // Garante que toda receita já cadastrada com um Grupo "avulso" (criado antes desta
  // feature, ou direto no banco) apareça na lista de grupos, mesmo que o usuário nunca
  // tenha aberto o gerenciador — assim nenhuma receita antiga "desaparece" dos filtros.
  ['doce','salgada'].forEach(function(cat){
    var nomesExistentes = window._gruposEstrutura[cat].map(function(g){ return g.nome; });
    recipes.forEach(function(r){
      if (r.cat === cat && r.group && nomesExistentes.indexOf(r.group) === -1) {
        window._gruposEstrutura[cat].push({ nome: r.group, subgrupos: [] });
        nomesExistentes.push(r.group);
      }
    });
  });
}

async function saveGruposEstruturaToCloud() {
  try {
    await sb.from('config').upsert({
      user_id: USER_ID,
      grupos_estrutura: JSON.stringify(window._gruposEstrutura)
    }, { onConflict: 'user_id' });
  } catch(e) {}
}

function getGruposDaCategoria(cat) {
  if (!window._gruposEstrutura) window._gruposEstrutura = getGruposEstruturaPadrao();
  return window._gruposEstrutura[cat] || [];
}

function getSubgruposDoGrupo(cat, grupoNome) {
  var lista = getGruposDaCategoria(cat);
  var g = lista.find(function(x){ return x.nome === grupoNome; });
  return g ? (g.subgrupos || []) : [];
}

// Preenche o <select id="fgrp"> do formulário de receita com os grupos da categoria
// escolhida (mantendo o valor atual selecionado quando possível), e atualiza o campo
// de Subgrupo de acordo.
function updateGrupoSelects() {
  var cat = document.getElementById('fcat') ? document.getElementById('fcat').value : 'doce';
  var elGrp = document.getElementById('fgrp');
  if (!elGrp) return;
  var valorAtual = elGrp.value;
  var grupos = getGruposDaCategoria(cat);
  var html = '<option value="">Sem grupo</option>';
  grupos.forEach(function(g){
    html += '<option value="' + g.nome.replace(/"/g,'&quot;') + '">' + g.nome + '</option>';
  });
  elGrp.innerHTML = html;
  // tenta manter o grupo selecionado se ele ainda existir nessa categoria
  if (grupos.some(function(g){ return g.nome === valorAtual; })) elGrp.value = valorAtual;
  updateSubgrupoSelect();
}

// Preenche o <select id="fsubgrp"> com os subgrupos do grupo atualmente selecionado.
// Esconde o campo inteiro quando o grupo não tiver nenhum subgrupo cadastrado.
function updateSubgrupoSelect() {
  var cat = document.getElementById('fcat') ? document.getElementById('fcat').value : 'doce';
  var grpNome = document.getElementById('fgrp') ? document.getElementById('fgrp').value : '';
  var elSubBox = document.getElementById('fsubgrp-box');
  var elSub = document.getElementById('fsubgrp');
  if (!elSubBox || !elSub) return;
  var subgrupos = grpNome ? getSubgruposDoGrupo(cat, grpNome) : [];
  if (!subgrupos.length) {
    elSubBox.style.display = 'none';
    elSub.innerHTML = '<option value="">Sem subgrupo</option>';
    return;
  }
  var valorAtual = elSub.value;
  var html = '<option value="">Sem subgrupo</option>';
  subgrupos.forEach(function(s){
    html += '<option value="' + s.replace(/"/g,'&quot;') + '">' + s + '</option>';
  });
  elSub.innerHTML = html;
  if (subgrupos.indexOf(valorAtual) !== -1) elSub.value = valorAtual;
  elSubBox.style.display = 'block';
}

// ═══════ MODAL: GERENCIAR GRUPOS E SUBGRUPOS ═══════
window._gerenciarGruposCatAtiva = 'doce';

function abrirModalGerenciarGrupos() {
  window._gerenciarGruposCatAtiva = window._currentCat || 'doce';
  renderModalGerenciarGrupos();
  document.getElementById('modal-grupos').style.display = 'flex';
}

function fecharModalGerenciarGrupos() {
  document.getElementById('modal-grupos').style.display = 'none';
  // Reaplica os filtros da tela de Receitas, já refletindo qualquer alteração feita
  var catAtual = document.getElementById('fc') ? document.getElementById('fc').value : '';
  buildSubAbas(catAtual);
  renderRecipes();
}

function setGerenciarGruposCat(cat) {
  window._gerenciarGruposCatAtiva = cat;
  renderModalGerenciarGrupos();
}

function renderModalGerenciarGrupos() {
  var cat = window._gerenciarGruposCatAtiva;
  var grupos = getGruposDaCategoria(cat);
  var body = document.getElementById('modal-grupos-body');
  if (!body) return;

  var html = '<div style="display:flex;gap:8px;margin-bottom:14px">';
  ['doce','salgada'].forEach(function(c){
    var ativo = c === cat;
    html += '<button onclick="setGerenciarGruposCat(\'' + c + '\')" style="flex:1;padding:10px;border-radius:8px;border:2px solid ' + (ativo?'var(--gold)':'var(--border)') + ';background:' + (ativo?'var(--gold)':'var(--bg)') + ';color:' + (ativo?'#020B18':'var(--text2)') + ';font-weight:700;font-family:inherit;cursor:pointer">' + (c==='doce'?'🍰 Doce':'🥩 Salgada') + '</button>';
  });
  html += '</div>';

  html += '<div style="margin-bottom:14px">'
    + '<input type="text" id="novo-grupo-nome" placeholder="Nome do novo grupo (ex: Compotas)" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px;margin-bottom:8px">'
    + '<button onclick="criarGrupoNovo()" class="btnp full"><i class="ti ti-plus"></i> Criar grupo</button>'
    + '</div>';

  if (!grupos.length) {
    html += '<div style="font-size:13px;color:var(--text2);text-align:center;padding:16px">Nenhum grupo cadastrado nesta categoria ainda.</div>';
  } else {
    grupos.forEach(function(g, gi){
      html += '<div style="background:var(--bg);border-radius:10px;padding:12px;margin-bottom:10px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
      html += '<span style="flex:1;font-weight:700;color:#F5EDD8;font-size:14px">' + g.nome + '</span>';
      html += '<button onclick="renomearGrupo(' + gi + ')" title="Renomear" style="background:none;border:none;color:var(--text2);font-size:15px;cursor:pointer;padding:4px"><i class="ti ti-pencil"></i></button>';
      html += '<button onclick="excluirGrupo(' + gi + ')" title="Excluir grupo" style="background:none;border:none;color:#A32D2D;font-size:15px;cursor:pointer;padding:4px"><i class="ti ti-trash"></i></button>';
      html += '</div>';

      // Subgrupos existentes, como chips
      if (g.subgrupos && g.subgrupos.length) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">';
        g.subgrupos.forEach(function(s, si){
          html += '<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(212,162,74,.12);border:1px solid rgba(212,162,74,.3);border-radius:20px;padding:5px 6px 5px 12px;font-size:12px;color:var(--gold)">'
            + s
            + '<button onclick="excluirSubgrupo(' + gi + ',' + si + ')" title="Excluir subgrupo" style="background:none;border:none;color:#A32D2D;font-size:12px;cursor:pointer;padding:2px 6px"><i class="ti ti-x"></i></button>'
            + '</span>';
        });
        html += '</div>';
      }

      // Campo para adicionar subgrupo a este grupo
      html += '<div style="display:flex;gap:6px">'
        + '<input type="text" id="novo-subgrupo-' + gi + '" placeholder="Novo subgrupo (ex: Compotas)" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-family:inherit;font-size:13px">'
        + '<button onclick="criarSubgrupoNovo(' + gi + ')" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(212,162,74,.4);background:none;color:var(--gold);font-family:inherit;cursor:pointer;font-size:13px;white-space:nowrap"><i class="ti ti-plus"></i> Subgrupo</button>'
        + '</div>';

      html += '</div>';
    });
  }

  body.innerHTML = html;
}

function criarGrupoNovo() {
  var input = document.getElementById('novo-grupo-nome');
  var nome = (input.value || '').trim();
  if (!nome) { toast('⚠️ Informe o nome do grupo'); return; }
  var cat = window._gerenciarGruposCatAtiva;
  var grupos = getGruposDaCategoria(cat);
  if (grupos.some(function(g){ return g.nome.toLowerCase() === nome.toLowerCase(); })) {
    toast('⚠️ Já existe um grupo com esse nome'); return;
  }
  grupos.push({ nome: nome, subgrupos: [] });
  window._gruposEstrutura[cat] = grupos;
  saveGruposEstruturaToCloud();
  input.value = '';
  renderModalGerenciarGrupos();
  toast('✅ Grupo "' + nome + '" criado!');
}

function criarSubgrupoNovo(gi) {
  var input = document.getElementById('novo-subgrupo-' + gi);
  var nome = (input.value || '').trim();
  if (!nome) { toast('⚠️ Informe o nome do subgrupo'); return; }
  var cat = window._gerenciarGruposCatAtiva;
  var grupos = getGruposDaCategoria(cat);
  var g = grupos[gi];
  if (!g) return;
  if (!g.subgrupos) g.subgrupos = [];
  if (g.subgrupos.some(function(s){ return s.toLowerCase() === nome.toLowerCase(); })) {
    toast('⚠️ Já existe um subgrupo com esse nome neste grupo'); return;
  }
  g.subgrupos.push(nome);
  saveGruposEstruturaToCloud();
  renderModalGerenciarGrupos();
  toast('✅ Subgrupo "' + nome + '" criado em "' + g.nome + '"!');
}

function renomearGrupo(gi) {
  var cat = window._gerenciarGruposCatAtiva;
  var grupos = getGruposDaCategoria(cat);
  var g = grupos[gi];
  if (!g) return;
  var novoNome = prompt('Novo nome para o grupo "' + g.nome + '":', g.nome);
  if (!novoNome || !novoNome.trim() || novoNome.trim() === g.nome) return;
  novoNome = novoNome.trim();
  var nomeAntigo = g.nome;
  g.nome = novoNome;
  saveGruposEstruturaToCloud();
  // Atualiza todas as receitas que já usavam o nome antigo, para não ficarem "soltas"
  var afetadas = recipes.filter(function(r){ return r.cat === cat && r.group === nomeAntigo; });
  if (afetadas.length) {
    afetadas.forEach(function(r){ r.group = novoNome; });
    Promise.all(afetadas.map(function(r){ return saveToCloud(r); })).then(function(){
      toast('✅ Grupo renomeado e ' + afetadas.length + ' receita(s) atualizada(s)!');
    });
  } else {
    toast('✅ Grupo renomeado!');
  }
  renderModalGerenciarGrupos();
}

function excluirGrupo(gi) {
  var cat = window._gerenciarGruposCatAtiva;
  var grupos = getGruposDaCategoria(cat);
  var g = grupos[gi];
  if (!g) return;
  var qtdReceitas = recipes.filter(function(r){ return r.cat === cat && r.group === g.nome; }).length;
  var msg = 'Excluir o grupo "' + g.nome + '"?';
  if (qtdReceitas > 0) msg += ' ' + qtdReceitas + ' receita(s) ficarão sem grupo (não serão excluídas).';
  if (!confirm(msg)) return;
  grupos.splice(gi, 1);
  saveGruposEstruturaToCloud();
  var afetadas = recipes.filter(function(r){ return r.cat === cat && r.group === g.nome; });
  if (afetadas.length) {
    afetadas.forEach(function(r){ r.group = ''; r.subgrupo = ''; });
    Promise.all(afetadas.map(function(r){ return saveToCloud(r); }));
  }
  renderModalGerenciarGrupos();
  toast('Grupo excluído.');
}

function excluirSubgrupo(gi, si) {
  var cat = window._gerenciarGruposCatAtiva;
  var grupos = getGruposDaCategoria(cat);
  var g = grupos[gi];
  if (!g || !g.subgrupos) return;
  var nomeSub = g.subgrupos[si];
  if (!confirm('Excluir o subgrupo "' + nomeSub + '"?')) return;
  g.subgrupos.splice(si, 1);
  saveGruposEstruturaToCloud();
  var afetadas = recipes.filter(function(r){ return r.cat === cat && r.group === g.nome && r.subgrupo === nomeSub; });
  if (afetadas.length) {
    afetadas.forEach(function(r){ r.subgrupo = ''; });
    Promise.all(afetadas.map(function(r){ return saveToCloud(r); }));
  }
  renderModalGerenciarGrupos();
  toast('Subgrupo excluído.');
}

// ═══════ RENDER RECIPES COM SUB-ABAS ═══════
function setCatFilter(val) {
  window._currentCat = val || '';
  var fc = document.getElementById('fc'); if(fc) fc.value = val;
  ['all','doce','salgada'].forEach(function(k) {
    var btn = document.getElementById('cat-' + k);
    if (!btn) return;
    var active = (k === 'all' && val === '') || k === val;
    btn.classList.toggle('act', active);
  });
  // Rebuild sub-abas
  buildSubAbas(val);
  // Reset sub-group filter
  window._currentSubGrp = '';
  window._currentSubSubGrp = '';
  renderRecipes();
}

// Constrói as sub-abas de Grupo (1º nível). Mostra apenas grupos que têm pelo menos uma
// receita na categoria ativa OU que foram cadastrados manualmente no gerenciador (para o
// usuário poder cadastrar a primeira receita dentro de um grupo recém-criado, mesmo vazio).
function buildSubAbas(cat) {
  var container = document.getElementById('sub-abas-container');
  if (!container) return;
  if (!cat) { container.style.display = 'none'; container.innerHTML = ''; document.getElementById('sub-subabas-container') && (document.getElementById('sub-subabas-container').style.display = 'none'); return; }

  var gruposCadastrados = getGruposDaCategoria(cat).map(function(g){ return g.nome; });
  var seen = {};
  var groups = [];
  gruposCadastrados.forEach(function(nome){ if (!seen[nome]) { seen[nome] = true; groups.push(nome); } });
  for (var i = 0; i < recipes.length; i++) {
    var r = recipes[i];
    if (r.cat === cat && r.group && !seen[r.group]) {
      seen[r.group] = true;
      groups.push(r.group);
    }
  }
  if (!groups.length) { container.style.display = 'none'; container.innerHTML = ''; return; }
  container.style.display = 'flex';
  var parts = ['<button class="sub-aba act" id="sub-all" data-grp="" onclick="setSubAba(this.dataset.grp)">Todas</button>'];
  for (var j = 0; j < groups.length; j++) {
    var g = groups[j];
    var sid = g.replace(/[^a-zA-Z0-9]/g, '_');
    parts.push('<button class="sub-aba" id="sub-' + sid + '" data-grp="' + g + '" onclick="setSubAba(this.dataset.grp)">' + g + '</button>');
  }
  container.innerHTML = parts.join('');
  buildSubSubAbas(cat, ''); // sem grupo selecionado ainda
}

// Constrói as sub-sub-abas de Subgrupo (2º nível), exibidas só quando o grupo escolhido
// tiver pelo menos um subgrupo cadastrado.
function buildSubSubAbas(cat, grupoNome) {
  var container = document.getElementById('sub-subabas-container');
  if (!container) return;
  var subgrupos = grupoNome ? getSubgruposDoGrupo(cat, grupoNome) : [];
  if (!grupoNome || !subgrupos.length) { container.style.display = 'none'; container.innerHTML = ''; return; }
  container.style.display = 'flex';
  var parts = ['<button class="sub-aba act" id="subsub-all" data-sgrp="" onclick="setSubSubAba(this.dataset.sgrp)">Todos</button>'];
  subgrupos.forEach(function(s){
    var sid = s.replace(/[^a-zA-Z0-9]/g, '_');
    parts.push('<button class="sub-aba" id="subsub-' + sid + '" data-sgrp="' + s.replace(/"/g,'&quot;') + '" onclick="setSubSubAba(this.dataset.sgrp)">' + s + '</button>');
  });
  container.innerHTML = parts.join('');
}

function setSubAba(grp) {
  window._currentSubGrp = grp || '';
  window._currentSubSubGrp = '';
  document.querySelectorAll('#sub-abas-container .sub-aba').forEach(function(b){ b.classList.remove('act'); });
  var safeId = grp ? grp.replace(/[^a-zA-Z0-9]/g,'_') : 'all';
  var btn = document.getElementById('sub-' + safeId);
  if(btn) btn.classList.add('act');
  buildSubSubAbas(window._currentCat || '', grp);
  renderRecipes();
}

function setSubSubAba(sgrp) {
  window._currentSubSubGrp = sgrp || '';
  document.querySelectorAll('#sub-subabas-container .sub-aba').forEach(function(b){ b.classList.remove('act'); });
  var safeId = sgrp ? sgrp.replace(/[^a-zA-Z0-9]/g,'_') : 'all';
  var btn = document.getElementById('subsub-' + safeId);
  if(btn) btn.classList.add('act');
  renderRecipes();
}

// Atualiza os números (Receitas/Bolos/Recheios) exibidos no card "Plano Premium" da sidebar.
function atualizarStatsSidebarPremium() {
  var elR = document.getElementById('sidebar-stat-receitas');
  var elB = document.getElementById('sidebar-stat-bolos');
  var elC = document.getElementById('sidebar-stat-recheios');
  if (!elR) return; // sidebar premium não está visível (mobile) — não precisa calcular
  var total = recipes.length;
  var bolos = recipes.filter(function(r){ return r.group === 'Bolos'; }).length;
  var recheiosCount = recipes.filter(function(r){ return typeof isGrupoRecheio === 'function' ? isGrupoRecheio(r.group) : r.group === 'Recheios'; }).length;
  elR.textContent = total;
  elB.textContent = bolos;
  elC.textContent = recheiosCount;
}


function renderRecipes() {
  atualizarStatsSidebarPremium();
  var q   = (document.getElementById('si').value || '').toLowerCase();
  var cat = window._currentCat || '';
  var grp = window._currentSubGrp || '';
  var sgrp = window._currentSubSubGrp || '';
  var el  = document.getElementById('recipes-list');
  var guest = isGuest();

  var list = recipes.filter(function(r) {
    if (!(!q || (r.name||'').toLowerCase().includes(q))) return false;
    if (!(!cat || r.cat === cat)) return false;
    if (!(!grp || r.group === grp)) return false;
    if (sgrp) {
      // Subgrupo específico selecionado: mostra só quem tem exatamente esse subgrupo.
      return r.subgrupo === sgrp;
    }
    if (grp) {
      // Aba "Todos" dentro de um grupo: esconde receitas que já têm subgrupo definido,
      // para não repetir a mesma receita aqui e também dentro da aba do subgrupo dela.
      return !r.subgrupo;
    }
    return true;
  });
  if (guest) list = list.filter(function(r){ return shareConfig.sharedIds.includes(r.id); });

  if (!list.length) {
    el.innerHTML = guest
      ? '<div class="est"><i class="ti ti-eye-off"></i><p>Nenhuma receita compartilhada.</p></div>'
      : '<div class="est"><i class="ti ti-salad"></i><p>Nenhuma receita.</p><button class="btnp" onclick="openNewChoice()"><i class="ti ti-plus"></i> Criar</button></div>';
    return;
  }

  list = list.slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||'','pt-BR'); });

  // Disponibiliza a lista (já filtrada e na mesma ordem exibida) para a navegação
  // Anterior/Próxima do modal de edição — sem isso, abrir o modal não saberia quais são
  // os vizinhos da receita atual dentro do recorte de filtro em uso.
  window._listaReceitasFiltradaAtual = list.map(function(r){ return r.id; });

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

    // Custo médio: custo total ÷ peso (g→kg) se pesoTotal existir, senão ÷ rendimento em porções.
    var custoMedioTxt = null;
    if (p.cost > 0) {
      if (r.pesoTotal) { custoMedioTxt = 'R$ ' + (p.cost / (r.pesoTotal/1000)).toFixed(2) + ' /kg'; }
      else if (r.yield_qty) { custoMedioTxt = 'R$ ' + (p.cost / r.yield_qty).toFixed(2) + ' /' + (r.unit||'un'); }
    }
    var rendimentoTxt = r.pesoTotal ? (r.pesoTotal >= 1000 ? (r.pesoTotal/1000).toFixed(1).replace('.0','') + 'kg' : r.pesoTotal + 'g')
      : (r.yield_qty ? r.yield_qty + ' ' + (r.unit||'un') : null);
    var descricao = (r.comment||'').trim();
    if (descricao.length > 110) descricao = descricao.slice(0,107) + '...';

    html += '<div class="rc-card rc-card-premium" style="animation-delay:' + Math.min(360, (html.match(/rc-card-premium/g)||[]).length * 40) + 'ms">';
    html += '<div class="rcp-media">';
    if (photo) {
      html += '<img class="rcp-media-img" src="' + photo + '" alt="" loading="lazy" onclick="viewRecipe(\'' + r.id + '\')">';
    } else {
      html += '<div class="rcp-media-empty" onclick="viewRecipe(\'' + r.id + '\')">' + emoji + '</div>';
    }
    if (!guest && p.cost > 0) html += '<div class="rcp-badge-pct ' + (pct>=0?'pos':'neg') + '">' + pct.toFixed(0) + '%</div>';
    if (!guest) html += '<button class="rcp-badge-share ' + (shared?'on':'') + '" onclick="toggleShare(\'' + r.id + '\',this)" title="Compartilhar"><i class="ti ti-' + (shared?'share-3':'share') + '"></i></button>';
    html += '</div>';

    html += '<div class="rcp-info">';
    html += '<div class="rcp-tag-row"><span class="rcp-tag-main">' + emoji + ' ' + r.cat.toUpperCase() + '</span></div>';
    html += '<div class="rcp-name" onclick="viewRecipe(\'' + r.id + '\')">' + (r.name||'') + '</div>';
    if (descricao) html += '<div class="rcp-desc">' + descricao + '</div>';
    html += '<div class="rcp-chips">'
      + '<span class="rcp-chip">' + r.cat + '</span>'
      + (r.group ? '<span class="rcp-chip rcp-chip-blue">' + r.group + '</span>' : '')
      + (r.time ? '<span class="rcp-chip-time"><i class="ti ti-clock"></i> ' + fT(r.time) + '</span>' : '')
      + '</div>';

    if (custoMedioTxt || rendimentoTxt) {
      html += '<div class="rcp-metrics">';
      if (custoMedioTxt) html += '<div class="rcp-metric"><i class="ti ti-currency-dollar"></i><div><div class="rcp-metric-lbl">Custo médio</div><div class="rcp-metric-val">' + custoMedioTxt + '</div></div></div>';
      if (rendimentoTxt) html += '<div class="rcp-metric"><i class="ti ti-scale"></i><div><div class="rcp-metric-lbl">Rendimento</div><div class="rcp-metric-val">' + rendimentoTxt + '</div></div></div>';
      html += '</div>';
    }

    html += '<button class="rcp-btn-main" onclick="viewRecipe(\'' + r.id + '\')"><i class="ti ti-eye"></i> Ver receita <i class="ti ti-chevron-right"></i></button>';

    html += '<div class="rcp-actions">';
    if (!guest) {
      html += '<button class="rcp-action-btn" onclick="openEdit(\'' + r.id + '\')" title="Editar"><i class="ti ti-edit"></i><span>Editar</span></button>';
      html += '<button class="rcp-action-btn" onclick="abrirSeletorFotoCard(\'' + r.id + '\')" title="Adicionar foto"><i class="ti ti-camera-plus"></i><span>Foto</span></button>';
      html += '<button class="rcp-action-btn" onclick="duplicarReceitaPorId(\'' + r.id + '\')" title="Duplicar"><i class="ti ti-copy"></i><span>Duplicar</span></button>';
    }
    html += '<button class="rcp-action-btn" onclick="viewRecipe(\'' + r.id + '\');setTimeout(toggleFullReceita,300)" title="Tela cheia"><i class="ti ti-maximize"></i><span>Ampliar</span></button>';
    if (!guest) {
      html += '<button class="rcp-action-btn danger" onclick="delRecipe(\'' + r.id + '\')" title="Excluir"><i class="ti ti-trash"></i><span>Excluir</span></button>';
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

// ═══════ NEW RECIPE ═══════
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

async function lerFoto() {
  if (!fotoB64) return;
  const cat = document.getElementById('choice-cat').value;
  const grp = document.getElementById('choice-grp').value;
  const bar = document.getElementById('ai-bar'), msg = document.getElementById('ai-msg'), dot = document.getElementById('ai-dot'), btn = document.getElementById('btn-ler');
  bar.style.display = 'flex'; btn.disabled = true; msg.textContent = 'Claude lendo anotação...'; dot.className = 'ai-dot pulse';
  try {
    const r = await fetch('/api/ler-foto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fotoB64 })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Erro ao processar requisição no servidor.');
    const parsed = d.resultado;
    dot.className = 'ai-dot ok'; msg.textContent = 'Receita lida!';
    setTimeout(() => { cm('modal-choice'); openNewRecipe(cat, grp, parsed); }, 700);
  } catch (err) { dot.className = 'ai-dot err'; msg.textContent = 'Erro: ' + err.message; btn.disabled = false; }
}

// Sincroniza visibilidade dos dois botões "Duplicar" (header + footer) — ambos chamam a
// mesma ação, e o app agora tem dois lugares onde o botão pode aparecer no layout novo.
function mostrarBotaoDuplicar(visivel) {
  const btnHeader = document.getElementById('btn-duplicar-receita');
  const btnFooter = document.getElementById('btn-duplicar-receita-footer');
  if (btnHeader) btnHeader.style.display = visivel ? '' : 'none';
  if (btnFooter) btnFooter.style.display = visivel ? '' : 'none';
}

// ═══════ NAVEGAÇÃO ANTERIOR/PRÓXIMA NO MODAL DE EDIÇÃO ═══════
// Compara o estado atual do formulário com o snapshot tirado quando o modal foi aberto
// (em openEdit/openNewRecipe), para decidir se há alterações não salvas. Cobre os campos
// editáveis mais comuns; ingredientes/fotos/formas entram via JSON.stringify para detectar
// qualquer alteração nessas listas sem precisar comparar campo a campo.
function capturarSnapshotFormularioReceita() {
  function v(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function checked(id) { var el = document.getElementById(id); return el ? el.checked : false; }
  return JSON.stringify({
    nome: v('fn'), cat: v('fcat'), grp: v('fgrp'), subgrp: v('fsubgrp'),
    yld: v('fyld'), pesoTotal: v('fpesoTotal'), tempo: v('ftm'), unit: v('funit'),
    embalagem: v('fembalagem'), conservacao: v('fconservacao'),
    panela: checked('fpanela'), panelaTempo: v('fpanela-tempo'), panelaVel: v('fpanela-vel'),
    margem: v('fmrg'), extra: v('fext'), preparo: v('fprep'), comment: v('fcomment'),
    tipoCardapio: v('ftipocardapio'),
    ingredientes: curIngr, fotos: curPhotos, formas: curFormas, formasEnabled: formasEnabled,
    multiplicadorAro: curMultiplicadorAro, recheiosVinculados: curRecheiosVinculados
  });
}

// Retorna true se o formulário do modal de edição tiver alterações não salvas em relação
// ao snapshot tirado na abertura. Se o modal não estiver aberto (sem snapshot), retorna false.
function formularioReceitaTemAlteracoes() {
  if (!window._editSnapshotInicial) return false;
  return capturarSnapshotFormularioReceita() !== window._editSnapshotInicial;
}

// Calcula a lista de navegação (IDs ordenados, mesma ordenação alfabética usada em
// renderRecipes) para os botões Anterior/Próxima do modal de edição.
//
// Primeiro tenta usar a lista já exibida na tela de Receitas (window._listaReceitasFiltradaAtual,
// preenchida por renderRecipes()) — útil porque respeita filtros de busca por texto que não dá
// para inferir a partir da receita sozinha. Mas se a receita que está sendo editada não pertence
// a essa lista (ex: o usuário abriu por outro caminho — Ver Receita, Configurar Cardápio, etc. —
// enquanto a tela de Receitas estava com um filtro de grupo diferente), reconstrói a lista do
// zero com base no próprio recorte (categoria + grupo + subgrupo) da receita aberta, garantindo
// que a navegação sempre funcione dentro do conjunto de receitas "irmãs" dela.
function getListaNavegacaoReceita() {
  var listaAtual = window._listaReceitasFiltradaAtual || [];
  if (editId && listaAtual.indexOf(editId) !== -1) return listaAtual;

  var atual = recipes.find(function(r){ return r.id === editId; });
  if (!atual) return listaAtual; // sem receita de referência (ex: receita nova), nada a fazer

  var guest = (typeof isGuest === 'function') ? isGuest() : false;
  var lista = recipes.filter(function(r){
    if (r.cat !== atual.cat) return false;
    if ((r.group || '') !== (atual.group || '')) return false;
    if (atual.subgrupo) return r.subgrupo === atual.subgrupo;
    return !r.subgrupo;
  });
  if (guest) lista = lista.filter(function(r){ return shareConfig.sharedIds.includes(r.id); });
  lista = lista.slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||'','pt-BR'); });
  return lista.map(function(r){ return r.id; });
}

// Navega para a receita anterior/próxima dentro do mesmo recorte (grupo/subgrupo/categoria)
// da receita atual. Se houver alterações não salvas, pergunta antes de descartar — e se a
// resposta for "salvar", tenta salvar primeiro (respeitando a validação de nome obrigatório)
// e só então navega.
async function navegarReceitaAdjacente(direcao) {
  var lista = getListaNavegacaoReceita();
  if (!lista.length || !editId) return;
  var idxAtual = lista.indexOf(editId);
  if (idxAtual === -1) return;
  var idxAlvo = idxAtual + direcao;
  if (idxAlvo < 0 || idxAlvo >= lista.length) {
    toast(direcao < 0 ? 'Esta já é a primeira receita da lista' : 'Esta já é a última receita da lista');
    return;
  }
  var idAlvo = lista[idxAlvo];

  if (formularioReceitaTemAlteracoes()) {
    var quer = confirm('Você tem alterações não salvas nesta receita. Salvar antes de continuar?\n\nOK = Salvar e continuar\nCancelar = Permanecer aqui');
    if (!quer) return; // permanece no formulário atual, sem navegar
    var nomeAtual = (document.getElementById('fn').value || '').trim();
    if (!nomeAtual) {
      toast('Informe o nome da receita antes de salvar');
      st2(0);
      document.getElementById('fn').focus();
      return; // cancela a navegação e mantém o foco no formulário atual
    }
    await saveRecipe();
    // Se saveRecipe não conseguiu seguir adiante (ex: ingrediente novo pendindo de preço
    // no modal intermediário), o usuário ainda está no formulário — não navega.
    if (formularioReceitaTemAlteracoes()) return;
  }

  openEdit(idAlvo);
}

// ═══════ EDIT FORM ═══════
function togglePanelaMexedora() {
  const checked = document.getElementById('fpanela').checked;
  document.getElementById('panela-mexedora-box').style.display = checked ? 'block' : 'none';
}

// Atualiza o nome e os chips (Categoria/Grupo/Rendimento) no header do modal de edição,
// em tempo real conforme o usuário digita/escolhe — só estética, não afeta nada salvo.
function atualizarHeaderReceita() {
  const elNome = document.getElementById('edit-title-nome');
  const elChipCat = document.getElementById('chip-cat');
  const elChipGrp = document.getElementById('chip-grp');
  const elChipYld = document.getElementById('chip-yld');
  if (elNome) {
    const nome = document.getElementById('fn')?.value?.trim();
    elNome.textContent = nome || 'Sem nome';
  }
  if (elChipCat) {
    const cat = document.getElementById('fcat')?.value;
    elChipCat.innerHTML = '<i class="ti ti-tag"></i> ' + (cat === 'doce' ? 'Doce' : cat === 'salgada' ? 'Salgada' : '—');
  }
  if (elChipGrp) {
    const grp = document.getElementById('fgrp')?.value;
    elChipGrp.innerHTML = '<i class="ti ti-folder"></i> ' + (grp || 'Sem grupo');
  }
  if (elChipYld) {
    const yld = document.getElementById('fyld')?.value;
    const unit = document.getElementById('funit')?.value || '';
    elChipYld.innerHTML = '<i class="ti ti-scale"></i> ' + (yld || '—') + (unit ? ' ' + unit : '');
  }
  // Sincroniza o botão "Duplicar" duplicado (header + footer) — ambos chamam a mesma
  // função, só precisam mostrar/escender juntos.
  const btnHeader = document.getElementById('btn-duplicar-receita');
  const btnFooter = document.getElementById('btn-duplicar-receita-footer');
  if (btnHeader && btnFooter) btnFooter.style.display = btnHeader.style.display;
}

// Filtro visual rápido na tabela/cards de ingredientes (aba Ingredientes & Preparo) —
// não remove nada de curIngr, só esconde linhas/cards que não combinam com a busca.
function filtrarLinhasIngrTabela(termo) {
  const t = (termo || '').trim().toLowerCase();
  document.querySelectorAll('#ingr-body tr').forEach(function(tr){
    const nomeInput = tr.querySelector('input[type="text"]');
    const nome = nomeInput ? nomeInput.value.toLowerCase() : '';
    tr.style.display = (!t || nome.includes(t)) ? '' : 'none';
  });
  document.querySelectorAll('#ingr-mobile-cards .rcp-edit-ingr-mobile-card').forEach(function(card){
    const nome = (card.dataset.nome || '').toLowerCase();
    card.style.display = (!t || nome.includes(t)) ? '' : 'none';
  });
}

// Aplica uma marcação simples de formatação de texto no textarea de Preparo, inserindo
// a sintaxe no cursor (ou ao redor do texto selecionado). É formatação leve em texto
// puro (sem HTML/rich-text) para não complicar o que é salvo no banco — o texto final
// continua sendo a mesma string simples que sempre foi salva em r.preparo.
function aplicarFormatoPreparo(tipo) {
  const ta = document.getElementById('fprep');
  if (!ta) return;
  const inicio = ta.selectionStart, fim = ta.selectionEnd;
  const selecionado = ta.value.slice(inicio, fim);
  let novoTrecho = selecionado;
  if (tipo === 'negrito') novoTrecho = '**' + (selecionado || 'texto') + '**';
  else if (tipo === 'italico') novoTrecho = '_' + (selecionado || 'texto') + '_';
  else if (tipo === 'sublinhado') novoTrecho = '__' + (selecionado || 'texto') + '__';
  else if (tipo === 'numerada') novoTrecho = (selecionado || 'Novo passo').split('\n').map(function(l,i){ return (i+1) + '. ' + l; }).join('\n');
  else if (tipo === 'lista') novoTrecho = (selecionado || 'Novo item').split('\n').map(function(l){ return '• ' + l; }).join('\n');
  else if (tipo === 'link') novoTrecho = '[' + (selecionado || 'texto do link') + '](url)';
  ta.value = ta.value.slice(0, inicio) + novoTrecho + ta.value.slice(fim);
  ta.focus();
  ta.selectionStart = inicio;
  ta.selectionEnd = inicio + novoTrecho.length;
  atualizarContadorPreparo();
}

function atualizarContadorPreparo() {
  const ta = document.getElementById('fprep');
  const el = document.getElementById('preparo-char-count');
  if (ta && el) el.textContent = ta.value.length + ' caracteres';
}

// Renderiza a tabela de "Multiplicador por aro" dentro do formulário de receita,
// calculando peso (pesoTotal × multiplicador) e custo (custo da receita × multiplicador)
// em tempo real, a partir dos valores já digitados em curMultiplicadorAro.
// Renderiza a lista de recheios cadastrados (group === 'Recheios') como checkboxes, para
// vincular automaticamente um item (ex: Chocolate Nobre picado) a um ou mais recheios.
// Renderiza a lista de recheios disponíveis como chips clicáveis. A seleção fica guardada
// em curRecheiosVinculados (variável JS), NÃO depende do estado nativo do checkbox — isso
// evita qualquer comportamento estranho de desmarcação ao clicar em outro item. Itens já
// selecionados aparecem em destaque dourado com um "X" para remover rapidamente.
function renderRecheiosVinculadosChecklist(recheiosSelecionados) {
  const el = document.getElementById('recheios-vinculados-checklist');
  if (!el) return;
  curRecheiosVinculados = Array.isArray(recheiosSelecionados) ? [...recheiosSelecionados] : [];
  const recheiosDisponiveis = (typeof recipes !== 'undefined' ? recipes : [])
    .filter(function(r){ return typeof isGrupoRecheio === 'function' ? isGrupoRecheio(r.group) : (r.group === 'Recheios'); })
    .map(function(r){ return r.name; })
    .sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
  if (!recheiosDisponiveis.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px">Nenhum recheio cadastrado ainda.</div>';
    return;
  }
  renderizarChipsRecheiosVinculados(recheiosDisponiveis);
}

// Lista em cache dos recheios disponíveis no momento da última renderização — usada
// pelo toggle por índice, para nunca depender de nomes com caracteres especiais
// (parênteses, aspas, etc.) embutidos em atributos onclick, que causavam o bug de chips
// não refletirem visualmente a seleção real quando o nome tinha esses caracteres.
let _recheiosVinculadosCache = [];

function renderizarChipsRecheiosVinculados(recheiosDisponiveis) {
  const el = document.getElementById('recheios-vinculados-checklist');
  if (!el) return;
  _recheiosVinculadosCache = recheiosDisponiveis;
  el.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:6px">' + recheiosDisponiveis.map(function(nome, i){
    const selecionado = curRecheiosVinculados.indexOf(nome) !== -1;
    const nomeEscapado = nome.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if (selecionado) {
      return '<span onclick="toggleRecheioVinculadoPorIndice(' + i + ')" style="display:inline-flex;align-items:center;gap:6px;background:var(--gold);color:#020B18;border-radius:20px;padding:6px 6px 6px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">'
        + nomeEscapado
        + '<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.25);font-size:11px;line-height:1">✕</span>'
        + '</span>';
    }
    return '<span onclick="toggleRecheioVinculadoPorIndice(' + i + ')" style="display:inline-flex;align-items:center;background:var(--bg);border:1px solid var(--border);color:var(--text2);border-radius:20px;padding:6px 12px;font-size:12px;cursor:pointer;white-space:nowrap">'
      + nomeEscapado + '</span>';
  }).join('') + '</div>';
}

// Alterna a seleção de um recheio pelo seu índice na lista cacheada (não pelo nome
// embutido em HTML) — evita qualquer problema de escaping com parênteses, aspas ou
// outros caracteres especiais no nome do recheio (ex: "Compota de Banana (Banoffee)").
function toggleRecheioVinculadoPorIndice(i) {
  const nome = _recheiosVinculadosCache[i];
  if (!nome) return;
  const idx = curRecheiosVinculados.indexOf(nome);
  if (idx === -1) curRecheiosVinculados.push(nome);
  else curRecheiosVinculados.splice(idx, 1);
  renderizarChipsRecheiosVinculados(_recheiosVinculadosCache);
}

// Mantida por compatibilidade (não é mais usada internamente, mas algum código externo
// pode ter referência a ela) — encontra o índice do nome e delega para a versão por índice.
function toggleRecheioVinculado(nome) {
  const i = _recheiosVinculadosCache.indexOf(nome);
  if (i !== -1) toggleRecheioVinculadoPorIndice(i);
}

function getRecheiosVinculadosSelecionados() {
  return [...curRecheiosVinculados];
}

// Preenche o <select id="fcaldavinc"> com as receitas de grupo "Caldas" cadastradas,
// para o usuário escolher qual calda acompanha automaticamente esta receita de Massa.
// Diferente do checklist de recheios vinculados (que permite vários), aqui é só 1
// calda por massa — o cliente nunca escolhe isso, é sempre automático no pedido.
function renderCaldaVinculadaSelect(caldaSelecionada) {
  const el = document.getElementById('fcaldavinc');
  if (!el) return;
  const caldasDisponiveis = (typeof recipes !== 'undefined' ? recipes : [])
    .filter(function(r){ return typeof isGrupoCalda === 'function' ? isGrupoCalda(r.group) : (r.group||'').trim().toLowerCase() === 'caldas'; })
    .map(function(r){ return r.name; })
    .sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
  let html = '<option value="">Sem calda vinculada</option>';
  caldasDisponiveis.forEach(function(nome){
    html += '<option value="' + nome.replace(/"/g,'&quot;') + '"' + (nome === caldaSelecionada ? ' selected' : '') + '>' + nome + '</option>';
  });
  el.innerHTML = html;
  if (!caldasDisponiveis.length) {
    el.innerHTML = '<option value="">Nenhuma calda cadastrada ainda</option>';
  }
}

// Mostra/escode os dois blocos de vínculo de calda de acordo com o Grupo da receita
// atual: quem está editando uma Massa vê o select "Calda vinculada" (1 calda); quem está
// editando uma Calda vê o checklist "Massas que usam esta calda" (várias massas podem
// apontar para a mesma calda). Chamada sempre que o Grupo do formulário muda.
function atualizarBlocosCaldaPorGrupo() {
  const grpValor = document.getElementById('fgrp')?.value || '';
  const ehMassa = typeof isGrupoMassa === 'function' ? isGrupoMassa(grpValor) : ['bolos','massas'].includes(grpValor.trim().toLowerCase());
  const ehCalda = typeof isGrupoCalda === 'function' ? isGrupoCalda(grpValor) : grpValor.trim().toLowerCase() === 'caldas';
  const ehRecheio = typeof isGrupoRecheio === 'function' ? isGrupoRecheio(grpValor) : grpValor.trim().toLowerCase() === 'recheios';
  const boxSelect = document.getElementById('fcaldavinc-box');
  const boxChecklist = document.getElementById('massas-vinculadas-box');
  const boxClassificacao = document.getElementById('classificacao-recheio-box');
  if (boxSelect) boxSelect.style.display = ehMassa ? 'block' : 'none';
  if (boxChecklist) boxChecklist.style.display = ehCalda ? 'block' : 'none';
  if (boxClassificacao) boxClassificacao.style.display = ehRecheio ? 'block' : 'none';
  if (ehCalda) renderMassasVinculadasChecklist();
}

// Coleta todos os subgrupos de cardápio já em uso — tanto das receitas já migradas
// (campo subgrupoCardapio) quanto das categorias antigas cadastradas em
// Configurar Cardápio (cfg.recheios[].categoria), de antes desta mudança. Isso evita que
// subgrupos já usados (ex: "Leites", "Chocolates", "Frutas Nobres") fiquem "perdidos" e
// precisem ser recriados manualmente só porque a receita correspondente ainda não foi
// reaberta e salva com o campo novo. Alimenta o <select id="fsubgrupocardapio"> do bloco
// "Classificação do Recheio".
function getSubgruposCardapioExistentes() {
  const vistos = new Set();
  const lista = [];
  function adicionar(sg) {
    const limpo = (sg || '').trim();
    if (limpo && !vistos.has(limpo.toLowerCase())) { vistos.add(limpo.toLowerCase()); lista.push(limpo); }
  }
  (typeof recipes !== 'undefined' ? recipes : []).forEach(function(r){ adicionar(r.subgrupoCardapio); });
  try {
    const cfgCardapio = (typeof getCardapioConfig === 'function') ? getCardapioConfig() : null;
    if (cfgCardapio && cfgCardapio.recheios) {
      cfgCardapio.recheios.forEach(function(r){ adicionar(r.categoria); });
    }
  } catch(e) {}
  return lista.sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
}

// Preenche o select de Subgrupo no cardápio com os já existentes + opção de criar novo,
// e marca o valor atual da receita (selecionando "+ Novo subgrupo..." automaticamente se
// o valor salvo ainda não estiver na lista, por exemplo logo após ser digitado).
function renderSubgrupoCardapioSelect(subgrupoAtual) {
  const el = document.getElementById('fsubgrupocardapio');
  if (!el) return;
  const existentes = getSubgruposCardapioExistentes();
  const atual = (subgrupoAtual || '').trim();
  const ehNovo = atual && existentes.indexOf(atual) === -1;
  let html = '<option value="">Sem subgrupo</option>';
  existentes.forEach(function(s){
    html += '<option value="' + s.replace(/"/g,'&quot;') + '">' + s + '</option>';
  });
  html += '<option value="__novo__">+ Novo subgrupo...</option>';
  el.innerHTML = html;
  el.value = ehNovo ? '__novo__' : atual;
  const boxNovo = document.getElementById('fsubgrupocardapio-novo-box');
  const inputNovo = document.getElementById('fsubgrupocardapio-novo');
  if (boxNovo) boxNovo.style.display = ehNovo ? 'block' : 'none';
  if (inputNovo) inputNovo.value = ehNovo ? atual : '';
}

// Mostra/escode o campo de texto "Nome do novo subgrupo" conforme a opção escolhida
// no select — mesmo padrão usado na Categoria do cardápio.
function onSubgrupoCardapioChange() {
  const el = document.getElementById('fsubgrupocardapio');
  const box = document.getElementById('fsubgrupocardapio-novo-box');
  if (box) box.style.display = (el && el.value === '__novo__') ? 'block' : 'none';
}

// Lê o valor final do subgrupo de cardápio a partir do formulário, considerando se o
// usuário escolheu "+ Novo subgrupo..." e digitou um nome no campo de texto.
function getSubgrupoCardapioDoFormulario() {
  const el = document.getElementById('fsubgrupocardapio');
  if (!el) return '';
  if (el.value === '__novo__') {
    const inputNovo = document.getElementById('fsubgrupocardapio-novo');
    return inputNovo ? inputNovo.value.trim() : '';
  }
  return el.value || '';
}

// Dentro do cadastro de uma receita de CALDA: lista todas as Massas, marcando como
// selecionadas as que já têm esta calda como caldaVinculada. Marcar/desmarcar aqui
// escreve diretamente no campo caldaVinculada da Massa correspondente (relação 1
// calda por massa — marcar nesta lista substitui qualquer vínculo anterior daquela massa).
function renderMassasVinculadasChecklist() {
  const el = document.getElementById('massas-vinculadas-checklist');
  if (!el) return;
  const nomeCaldaAtual = document.getElementById('fn')?.value?.trim() || '';
  const massas = (typeof recipes !== 'undefined' ? recipes : [])
    .filter(function(r){ return typeof isGrupoMassa === 'function' ? isGrupoMassa(r.group) : ['bolos','massas'].includes((r.group||'').trim().toLowerCase()); })
    .filter(function(r){ return r.id !== editId; }) // não lista a própria receita sendo editada (não se aplica aqui, mas por segurança)
    .sort(function(a,b){ return a.name.localeCompare(b.name, 'pt-BR'); });
  if (!massas.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px">Nenhuma receita de Massa/Bolo cadastrada ainda.</div>';
    return;
  }
  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:2px">' + massas.map(function(m, i){
    const marcado = !!(nomeCaldaAtual && m.caldaVinculada === nomeCaldaAtual);
    const textoExtra = (m.caldaVinculada && m.caldaVinculada !== nomeCaldaAtual) ? ' <span style="color:var(--text3);font-size:11px">(hoje: ' + m.caldaVinculada + ')</span>' : '';
    if (marcado) {
      return '<div onclick="toggleMassaVinculadaPorIndice(' + i + ')" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(212,162,74,.15);cursor:pointer;font-size:13px">'
        + '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;background:var(--gold);color:#020B18;font-size:12px;flex-shrink:0">✓</span>'
        + '<span style="color:#F5EDD8;font-weight:600">' + m.name + '</span>' + textoExtra
        + '</div>';
    }
    return '<div onclick="toggleMassaVinculadaPorIndice(' + i + ')" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:13px">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;border:1px solid var(--border);flex-shrink:0"></span>'
      + '<span style="color:var(--text2)">' + m.name + '</span>' + textoExtra
      + '</div>';
  }).join('') + '</div>';
  window._massasVinculadasCache = massas;
}

// Alterna o vínculo de uma massa com a calda atual pelo ÍNDICE na lista renderizada (não
// depende do estado nativo "checked" de checkbox, que combinado com a re-renderização
// assíncrona após salvar na nuvem causava o bug de "marca mas não aparece marcado até o
// segundo clique"). Atualiza o visual IMEDIATAMENTE, e só depois salva na nuvem.
async function toggleMassaVinculadaPorIndice(i) {
  const massas = window._massasVinculadasCache || [];
  const massa = massas[i];
  if (!massa) return;
  const nomeCaldaAtual = document.getElementById('fn')?.value?.trim() || '';
  const vaiVincular = massa.caldaVinculada !== nomeCaldaAtual;
  massa.caldaVinculada = vaiVincular ? nomeCaldaAtual : '';
  renderMassasVinculadasChecklist(); // atualiza o visual JÁ, antes de esperar a rede
  const resultado = await saveToCloud(massa);
  if (resultado.ok) {
    toast('✅ "' + massa.name + '" ' + (vaiVincular ? 'vinculada a esta calda!' : 'desvinculada.'));
  } else {
    toast('⚠️ Erro ao salvar vínculo: ' + (resultado.error?.message || 'sem conexão'));
  }
}

function atualizarMultiplicadorAroPreview() {
  const tbody = document.getElementById('multiplicador-aro-tbody');
  if (!tbody) return;
  const pesoTotal = parseFloat(document.getElementById('fpesoTotal')?.value) || 0;
  const custoIngr = typeof totIC === 'function' ? totIC(curIngr) : 0;
  const cfg = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
  const valorHora = cfg.valorHora || 25;
  const indiretoPct = cfg.indiretoPct || 15;
  const horas = (parseFloat(document.getElementById('ftm')?.value) || 60) / 60;
  const custoReceita = custoIngr ? (custoIngr + custoIngr * indiretoPct / 100 + horas * valorHora) : 0;
  tbody.innerHTML = [10,15,20,25,30].map(function(aro){
    const mult = curMultiplicadorAro[aro];
    const peso = (mult && pesoTotal) ? (pesoTotal * mult) : null;
    const custo = (mult && custoReceita) ? (custoReceita * mult) : null;
    return '<tr>'
      + '<td style="padding:5px;border-bottom:1px solid var(--border);font-weight:700">'+aro+' cm</td>'
      + '<td style="padding:4px;border-bottom:1px solid var(--border);text-align:center">'
        + '<input type="number" value="'+(mult??'')+'" min="0" step="0.1" placeholder="x" id="fmult-'+aro+'" '
        + 'style="width:56px;padding:5px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:center;font-family:inherit;background:var(--surface);color:var(--text)" '
        + 'oninput="multiplicadorAro_porMultiplicador('+aro+', this.value)"></td>'
      + '<td style="padding:4px;border-bottom:1px solid var(--border);text-align:center">'
        + '<input type="number" value="'+(peso!=null?Math.ceil(peso):'')+'" min="0" step="1" placeholder="g" id="fpeso-aro-'+aro+'" '
        + 'style="width:66px;padding:5px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:center;font-family:inherit;background:var(--surface);color:var(--text)" '
        + 'oninput="multiplicadorAro_porPeso('+aro+', this.value)"></td>'
      + '<td id="fcusto-aro-'+aro+'" style="padding:4px;border-bottom:1px solid var(--border);text-align:right;font-size:12px;color:var(--gold)">'+(custo!=null?'R$ '+custo.toFixed(2):'—')+'</td>'
      + '<td style="padding:4px;border-bottom:1px solid var(--border);text-align:center">'
        + (mult ? '<button onclick="toggleReceitaExpandidaForm('+aro+')" title="Ver detalhamento" style="background:none;border:none;color:var(--gold);cursor:pointer;font-size:14px;padding:2px"><i class="ti ti-search"></i></button>' : '')
      + '</td>'
      + '</tr><tr id="fexpand-aro-'+aro+'" style="display:none"><td colspan="5" style="padding:0;border-bottom:1px solid var(--border)"></td></tr>';
  }).join('');
}

// Expande o detalhamento de ingredientes para um aro específico, usando os dados em
// memória da receita sendo editada (curIngr, peso, tempo) — funciona mesmo antes de salvar.
function toggleReceitaExpandidaForm(aro) {
  const row = document.getElementById('fexpand-aro-' + aro);
  if (!row) return;
  const cell = row.querySelector('td');
  if (row.style.display === 'none' || !cell.innerHTML) {
    const recVirtual = {
      name: document.getElementById('fn')?.value || 'Receita',
      ingredients: curIngr,
      pesoTotal: parseFloat(document.getElementById('fpesoTotal')?.value) || null,
      yield_qty: parseFloat(document.getElementById('fyld')?.value) || null,
      time: parseFloat(document.getElementById('ftm')?.value) || 60
    };
    const mult = curMultiplicadorAro[aro];
    cell.innerHTML = (typeof gerarHtmlReceitaExpandida === 'function') ? gerarHtmlReceitaExpandida(recVirtual, mult, 1) : '<div style="font-size:12px;color:var(--text3);padding:8px">Função de detalhamento não disponível.</div>';
    row.style.display = 'table-row';
  } else {
    row.style.display = 'none';
  }
}

// Usuário digitou o multiplicador diretamente — recalcula só o preview (peso/custo).
// Atualiza só a célula de Custo (R$) de um aro, sem recriar nenhum input — preserva foco/cursor.
function atualizarCustoCelulaAro(aro) {
  const custoReceita = typeof totIC === 'function' ? totIC(curIngr) : 0;
  const cfg = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
  const valorHora = cfg.valorHora || 25;
  const indiretoPct = cfg.indiretoPct || 15;
  const horas = (parseFloat(document.getElementById('ftm')?.value) || 60) / 60;
  const custoTotal = custoReceita ? (custoReceita + custoReceita * indiretoPct / 100 + horas * valorHora) : 0;
  const mult = curMultiplicadorAro[aro];
  const custo = (mult && custoTotal) ? custoTotal * mult : null;
  const elCusto = document.getElementById('fcusto-aro-' + aro);
  if (elCusto) elCusto.textContent = custo != null ? 'R$ ' + custo.toFixed(2) : '—';
}

// Usuário digitou o multiplicador diretamente — atualiza só o campo de peso e o custo desse
// aro (sem recriar a tabela inteira), preservando o foco e o cursor de digitação.
function multiplicadorAro_porMultiplicador(aro, valor) {
  const mult = parseFloat(valor);
  curMultiplicadorAro[aro] = mult || null;
  const pesoTotal = parseFloat(document.getElementById('fpesoTotal')?.value) || 0;
  const elPeso = document.getElementById('fpeso-aro-' + aro);
  if (elPeso && document.activeElement !== elPeso) {
    elPeso.value = (mult && pesoTotal) ? Math.ceil(mult * pesoTotal) : '';
  }
  atualizarCustoCelulaAro(aro);
}

// Usuário digitou o peso (g) desejado para aquele aro — calcula o multiplicador
// automaticamente (peso ÷ pesoTotal da receita) e atualiza só o campo de multiplicador e o
// custo desse aro (sem recriar a tabela inteira), preservando o foco e o cursor de digitação.
function multiplicadorAro_porPeso(aro, valorPeso) {
  const peso = parseFloat(valorPeso);
  const pesoTotal = parseFloat(document.getElementById('fpesoTotal')?.value) || 0;
  curMultiplicadorAro[aro] = (peso && pesoTotal) ? (peso / pesoTotal) : null;
  const elMult = document.getElementById('fmult-' + aro);
  if (elMult && document.activeElement !== elMult) {
    elMult.value = curMultiplicadorAro[aro] ? Number(curMultiplicadorAro[aro].toFixed(3)) : '';
  }
  atualizarCustoCelulaAro(aro);
}

// Transforma a receita que está sendo editada em uma NOVA receita (cópia), preservando
// tudo que já está preenchido na tela (incluindo ajustes ainda não salvos). Usuário só
// precisa trocar o nome (já sugerido com "(cópia)") e clicar em Salvar.
// Abre uma receita (pelo ID) já no modo de duplicação — usado pelo botão "Duplicar" do
// card na lista de Receitas, sem precisar passar pela tela de edição primeiro.
// Abre o seletor de arquivo direto do card de Receitas, sem precisar abrir o formulário de
// edição completo. Faz upload da foto escolhida para o Supabase Storage (em vez de
// converter para base64) e adiciona a URL pública à lista de fotos da receita — a primeira
// foto vira capa automaticamente. Salva direto no Supabase ao final do upload.
function abrirSeletorFotoCard(id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const r = recipes.find(function(x){ return x.id === id; });
    if (!r) return;

    toast('Enviando foto...');
    uploadFotoParaStorage(file).then(async function(url) {
      if (!r.photos) r.photos = [];
      r.photos.push(url);
      const resultado = await saveToCloud(r);
      if (resultado.ok) {
        renderRecipes();
        toast('✅ Foto adicionada!' + (r.photos.length === 1 ? ' Já é a capa do card.' : ''));
      } else {
        toast('⚠️ Erro ao salvar foto: ' + (resultado.error?.message || 'sem conexão'));
      }
    }).catch(function(err) {
      toast('⚠️ Erro ao enviar foto: ' + (err.message || 'sem conexão'), 4000);
    });
  };
  input.click();
}

function duplicarReceitaPorId(id) {
  openEdit(id);
  setTimeout(duplicarReceitaAtual, 0);
}

function duplicarReceitaAtual() {
  if (!editId) return;
  editId = null; // próximo "Salvar" cria uma receita nova, em vez de sobrescrever a original
  const elNome = document.getElementById('fn');
  if (elNome) elNome.value = (elNome.value || 'Receita') + ' (cópia)';
  document.getElementById('edit-title').textContent = 'Nova receita (duplicada)';
  mostrarBotaoDuplicar(false);
  toast('Receita duplicada — ajuste o que precisar e clique em Salvar.', 4000);
}

function openNewRecipe(cat = 'salgada', grp = '', pre = null) {
  editId = null; curIngr = pre?.ingredients || []; curPhotos = []; curFormas = []; formasEnabled = false;
  document.getElementById('edit-title').textContent = 'Nova receita';
  mostrarBotaoDuplicar(false);
  document.getElementById('fn').value = pre?.name || '';
  document.getElementById('fcat').value = cat;
  document.getElementById('fgrp').value = grp || '';
  document.getElementById('fyld').value = pre?.yield || 6;
  document.getElementById('fpesoTotal').value = pre?.pesoTotal || '';
  document.getElementById('ftm').value = pre?.time || 60;
  document.getElementById('funit').value = pre?.unit || 'porção';
  document.getElementById('fmrg').value = 100; document.getElementById('fext').value = 0;
  document.getElementById('fprep').value = pre?.preparo || '';
  document.getElementById('fcomment').value = pre?.comment || '';
  document.getElementById('fembalagem').value = pre?.embalagem || '';
  document.getElementById('fconservacao').value = pre?.conservacao || '';
  document.getElementById('fpanela').checked = false;
  document.getElementById('fpanela-tempo').value = '';
  document.getElementById('fpanela-vel').value = '';
  document.getElementById('panela-mexedora-box').style.display = 'none';
  document.getElementById('ftipocardapio').value = pre?.tipoCardapio || 'trad';
  renderSubgrupoCardapioSelect(pre?.subgrupoCardapio || '');
  document.getElementById('recipe-photos-grid').innerHTML = '';
  curMultiplicadorAro = pre?.multiplicadorAro ? {...pre.multiplicadorAro} : {};
  renderIngrTable(); renderFormas(); updateFormaToggle(); checkFormaTab(); st2(0);
  atualizarMultiplicadorAroPreview();
  renderRecheiosVinculadosChecklist(pre?.recheiosVinculados);
  renderCaldaVinculadaSelect(pre?.caldaVinculada);
  atualizarBlocosCaldaPorGrupo();
  if(typeof updateGrupoSelects==='function') updateGrupoSelects();
  // Mesma lógica resiliente usada em openEdit — define o subgrupo recebendo cat/grupo
  // diretamente como parâmetros, sem depender do timing de updateGrupoSelects() acima.
  aplicarSubgrupoNoFormulario(cat, grp || '', pre?.subgrupo || '');
  atualizarHeaderReceita();
  if (typeof atualizarContadorPreparo === 'function') atualizarContadorPreparo();
  atualizarBotoesNavegacaoReceita();
  document.getElementById('modal-edit').style.display = 'flex';
  window._editSnapshotInicial = capturarSnapshotFormularioReceita();
}


function openEdit(id) {
  const r = recipes.find(x => x.id === id); if (!r) return;
  editId = id; curIngr = JSON.parse(JSON.stringify(r.ingredients || []));
  curPhotos = r.photos ? [...r.photos] : [];
  curFormas = r.formas ? JSON.parse(JSON.stringify(r.formas)) : [];
  formasEnabled = r.formasEnabled || false;
  document.getElementById('edit-title').textContent = 'Editar receita';
  mostrarBotaoDuplicar(true);
  document.getElementById('fn').value = r.name || '';
  document.getElementById('fcat').value = r.cat || 'salgada';
  document.getElementById('fgrp').value = r.group || '';
  document.getElementById('fyld').value = r.yield_qty || r.yield || 6;
  document.getElementById('fpesoTotal').value = r.pesoTotal || '';
  document.getElementById('ftm').value = r.time || 60;
  document.getElementById('funit').value = r.unit || 'porção';
  document.getElementById('fmrg').value = r.margin || 100;
  document.getElementById('fext').value = r.extra || 0;
  document.getElementById('fprep').value = r.preparo || '';
  document.getElementById('fcomment').value = r.comment || '';
  document.getElementById('fembalagem').value = r.embalagem || '';
  document.getElementById('fconservacao').value = r.conservacao || '';
  document.getElementById('fpanela').checked = !!r.usaPanelaMexedora;
  document.getElementById('fpanela-tempo').value = r.panelaTempo || '';
  document.getElementById('fpanela-vel').value = r.panelaVelocidade || '';
  document.getElementById('panela-mexedora-box').style.display = r.usaPanelaMexedora ? 'block' : 'none';
  document.getElementById('ftipocardapio').value = r.tipoCardapio || 'trad';
  renderSubgrupoCardapioSelect(r.subgrupoCardapio || '');
  curMultiplicadorAro = r.multiplicadorAro ? {...r.multiplicadorAro} : {};
  renderIngrTable(); renderFormas(); renderRecipePhotosGrid(); updateFormaToggle(); checkFormaTab(); st2(0);
  atualizarMultiplicadorAroPreview();
  renderRecheiosVinculadosChecklist(r.recheiosVinculados);
  renderCaldaVinculadaSelect(r.caldaVinculada);
  atualizarBlocosCaldaPorGrupo();
  if(typeof updateGrupoSelects==='function') updateGrupoSelects();
  // Define o subgrupo desta receita explicitamente, com os mesmos valores de cat/grupo
  // que acabamos de aplicar — não depende do timing de updateGrupoSelects() acima, que em
  // alguns casos rodava antes do <select> de categoria refletir o valor já atribuído.
  aplicarSubgrupoNoFormulario(r.cat || 'salgada', r.group || '', r.subgrupo || '');
  atualizarHeaderReceita();
  if (typeof atualizarContadorPreparo === 'function') atualizarContadorPreparo();
  atualizarBotoesNavegacaoReceita();
  document.getElementById('modal-edit').style.display = 'flex';
  window._editSnapshotInicial = capturarSnapshotFormularioReceita();
}

// Mostra/esconde e habilita/desabilita os botões "Receita anterior"/"Próxima receita" do
// rodapé do modal de edição, de acordo com a posição da receita atual dentro da lista de
// navegação (ver getListaNavegacaoReceita — usa a listagem filtrada quando a receita está
// nela, ou reconstrói pelo recorte categoria+grupo+subgrupo da própria receita quando não).
// Em receita nova (editId nulo) os botões ficam escondidos, já que não há uma posição na
// lista para navegar a partir dela.
function atualizarBotoesNavegacaoReceita() {
  const btnAnt = document.getElementById('btn-receita-anterior');
  const btnProx = document.getElementById('btn-receita-proxima');
  if (!btnAnt || !btnProx) return;
  const lista = editId ? getListaNavegacaoReceita() : [];
  const idx = editId ? lista.indexOf(editId) : -1;
  const mostrar = idx !== -1 && lista.length > 1;
  btnAnt.style.display = mostrar ? '' : 'none';
  btnProx.style.display = mostrar ? '' : 'none';
  if (mostrar) {
    btnAnt.disabled = idx <= 0;
    btnProx.disabled = idx >= lista.length - 1;
  }
}

// Garante que o campo Subgrupo do formulário fique corretamente populado e com o valor
// certo selecionado, recebendo cat/grupo/subgrupo diretamente como parâmetros — em vez de
// reler do DOM, que pode não estar 100% sincronizado no exato instante desta chamada.
function aplicarSubgrupoNoFormulario(cat, grpNome, subgrupoAtual) {
  var elSubBox = document.getElementById('fsubgrp-box');
  var elSub = document.getElementById('fsubgrp');
  if (!elSubBox || !elSub) return;
  var subgrupos = grpNome ? getSubgruposDoGrupo(cat, grpNome) : [];
  if (!subgrupos.length) {
    elSubBox.style.display = 'none';
    elSub.innerHTML = '<option value="">Sem subgrupo</option>';
    return;
  }
  var html = '<option value="">Sem subgrupo</option>';
  subgrupos.forEach(function(s){
    html += '<option value="' + s.replace(/"/g,'&quot;') + '">' + s + '</option>';
  });
  elSub.innerHTML = html;
  if (subgrupos.indexOf(subgrupoAtual) !== -1) elSub.value = subgrupoAtual;
  elSubBox.style.display = 'block';
}


function checkFormaTab() {
  const grp = document.getElementById('fgrp').value;
  document.getElementById('tab-forma').style.display = ['Bolos', 'Pães'].includes(grp) ? 'inline-block' : 'none';
}


function st2(n) {
  [0,1,2,3,4,5,6].forEach(i => { const el = document.getElementById('et'+i); if(el) el.classList.toggle('act', i===n); });
  // Mapeia o índice da aba clicada para a posição visual correta na barra de abas nova
  // (Dados=0, Ingredientes&Preparo=1, Custos=3, Notas=4, Fotos=5, Formas=6 — o índice 2
  // não existe mais como aba própria, foi fundido em "1").
  document.querySelectorAll('.rcp-edit-tab').forEach(function(t){
    const onclickAttr = t.getAttribute('onclick') || '';
    const match = onclickAttr.match(/st2\((\d+)\)/);
    const tabIndex = match ? parseInt(match[1]) : -1;
    t.classList.toggle('act', tabIndex === n);
  });
  if(n===3) updCosts();
  if(n===1 && typeof atualizarContadorPreparo === 'function') atualizarContadorPreparo();
}

function addIngr() { curIngr.push({ name: '', qty: 100, unit: 'g', isBase: false }); renderIngrTable(); atualizarMultiplicadorAroPreview(); }
function remIngr(i) { curIngr.splice(i, 1); renderIngrTable(); atualizarMultiplicadorAroPreview(); }
function setBase(i) { curIngr.forEach((ig, j) => ig.isBase = (j === i)); renderIngrTable(); }

// O preço (coluna R$/kg) é SOMENTE LEITURA aqui — vem sempre do Estoque, fonte única de
// verdade. Para mudar o preço de um ingrediente, edite-o na tela de Estoque; a mudança
// já reflete automaticamente em todas as receitas que o usam. Ingredientes ainda sem
// preço cadastrado aparecem com "—" e um aviso, em vez de um campo digitável.
function renderIngrTable() {
  const tb = document.getElementById('ingr-body');
  const mobileWrap = document.getElementById('ingr-mobile-cards');
  if (!curIngr.length) {
    tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--text2);font-size:12px">Toque em "+ Adicionar"</td></tr>`;
    if (mobileWrap) mobileWrap.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text2);font-size:12px">Toque em "+ Adicionar"</div>`;
    return;
  }
  tb.innerHTML = curIngr.map((ig, i) => {
    const preco = typeof getPrecoIngrediente === 'function' ? getPrecoIngrediente(ig.name) : 0;
    const semPreco = typeof ingredienteSemPreco === 'function' ? ingredienteSemPreco(ig.name) : !preco;
    const sub = (parseFloat(ig.qty||0) * preco).toFixed(2);
    const precoCell = (ig.name && semPreco)
      ? `<span style="color:#e74c3c;font-size:11px;cursor:pointer" onclick="goPage('estoque')" title="Cadastrar preço no Estoque"><i class="ti ti-alert-circle"></i> sem preço</span>`
      : `<span style="color:var(--text2);font-size:12px">${preco>0 ? (typeof formatPrecoIngrediente === 'function' ? formatPrecoIngrediente(ig.name) : 'R$ '+(preco*1000).toFixed(2)) : '—'}</span>`;
    return `<tr class="${ig.isBase ? 'ihl' : ''}">
      <td style="text-align:center"><input type="radio" name="bir" ${ig.isBase?'checked':''} onchange="setBase(${i})" style="accent-color:var(--blue);width:18px;height:18px"></td>
      <td>
        <input value="${ig.name}" placeholder="Nome" autocomplete="off"
          oninput="curIngr[${i}].name=this.value;showIngrSugestoes(${i},this.value)"
          onfocus="showIngrSugestoes(${i},this.value)"
          onblur="setTimeout(()=>{hideIngrSugestoes(${i});atualizarPrecoExibidoIngr(${i})},200)"
          style="margin-bottom:3px;color:var(--text)">
        <div id="ingr-sug-${i}" class="ingr-sug-chips" style="display:none"></div>
        <input value="${ig.obs||''}" placeholder="Obs: pode substituir por..." oninput="curIngr[${i}].obs=this.value" style="font-size:11px;color:var(--text2);border-color:var(--border);padding:3px 5px;font-style:italic">
      </td>
      <td><input type="number" inputmode="decimal" value="${ig.qty}" min="0" step=".1" oninput="curIngr[${i}].qty=parseFloat(this.value)||0;updateIngrSubtotal(${i})"></td>
      <td><input value="${ig.unit}" placeholder="g" oninput="curIngr[${i}].unit=this.value"></td>
      <td style="text-align:center">${precoCell}</td>
      <td style="text-align:right;color:var(--text2);font-size:11px;white-space:nowrap" id="ingr-sub-${i}">${fR(sub)}</td>
      <td><button class="db" onclick="remIngr(${i})"><i class="ti ti-trash"></i></button></td>
    </tr>`;
  }).join('');

  // Cards mobile equivalentes — mesmos campos e eventos da tabela, em layout vertical.
  // IDs com sufixo "-m" para nunca colidir com os elementos da tabela (ambos existem no
  // DOM ao mesmo tempo; o CSS decide qual fica visível conforme o tamanho de tela).
  if (mobileWrap) {
    mobileWrap.innerHTML = curIngr.map((ig, i) => {
      const preco = typeof getPrecoIngrediente === 'function' ? getPrecoIngrediente(ig.name) : 0;
      const semPreco = typeof ingredienteSemPreco === 'function' ? ingredienteSemPreco(ig.name) : !preco;
      const sub = (parseFloat(ig.qty||0) * preco).toFixed(2);
      const precoTxt = (ig.name && semPreco) ? '⚠️ sem preço' : (preco>0 ? (typeof formatPrecoIngrediente === 'function' ? formatPrecoIngrediente(ig.name) : 'R$ '+(preco*1000).toFixed(2)+'/kg') : '—');
      const nomeEscapado = (ig.name||'').replace(/"/g,'&quot;');
      return `<div class="rcp-edit-ingr-mobile-card" data-nome="${nomeEscapado}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <input type="radio" name="bir-m" ${ig.isBase?'checked':''} onchange="setBase(${i})" style="accent-color:var(--blue);width:18px;height:18px;flex-shrink:0">
          <input value="${ig.name}" placeholder="Nome do ingrediente" autocomplete="off"
            oninput="curIngr[${i}].name=this.value"
            onblur="atualizarPrecoExibidoIngr(${i})"
            style="flex:1;background:rgba(2,11,24,.5);border:1px solid rgba(248,247,244,.14);color:#F8F7F4;border-radius:7px;padding:8px 10px;font-size:14px;font-family:inherit">
          <button class="db" onclick="remIngr(${i})" style="flex-shrink:0"><i class="ti ti-trash"></i></button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px">
          <div class="rcp-edit-ingr-mobile-row"><span>Quantidade</span></div>
          <div class="rcp-edit-ingr-mobile-row"><span>Unidade</span></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input type="number" inputmode="decimal" value="${ig.qty}" min="0" step=".1" oninput="curIngr[${i}].qty=parseFloat(this.value)||0;updateIngrSubtotal(${i})" style="background:rgba(2,11,24,.5);border:1px solid rgba(248,247,244,.14);color:#F8F7F4;border-radius:7px;padding:8px 10px;font-size:14px;font-family:inherit">
          <input value="${ig.unit}" placeholder="g" oninput="curIngr[${i}].unit=this.value" style="background:rgba(2,11,24,.5);border:1px solid rgba(248,247,244,.14);color:#F8F7F4;border-radius:7px;padding:8px 10px;font-size:14px;font-family:inherit">
        </div>
        <div class="rcp-edit-ingr-mobile-row"><span>Custo</span><b id="ingr-sub-m-${i}">${precoTxt} · ${fR(sub)}</b></div>
      </div>`;
    }).join('');
  }
}

// Re-renderiza só a linha de um ingrediente para mostrar o preço atual do Estoque (que
// agora é a única fonte de preço) assim que o nome é digitado/confirmado — não "copia"
// mais nada para dentro da receita, só atualiza a exibição em tela.
//
// Também corrige automaticamente diferenças de capitalização/acento contra um nome já
// existente no Estoque (ex: digitou "Creme de leite" mas já existe "Creme de Leite"
// cadastrado) — evita criar duas entradas separadas no Estoque para o mesmo ingrediente
// só por causa de letra maiúscula/minúscula ou acentuação diferente.
function atualizarPrecoExibidoIngr(i) {
  const ig = curIngr[i];
  if (ig && ig.name && ig.name.trim()) {
    const nomeCorrigido = encontrarGrafiaExistente(ig.name.trim());
    if (nomeCorrigido && nomeCorrigido !== ig.name.trim()) {
      ig.name = nomeCorrigido;
    }
  }
  renderIngrTable();
  atualizarMultiplicadorAroPreview();
}

// Procura, entre os ingredientes já cadastrados no Estoque, um nome que seja IDÊNTICO ao
// informado uma vez removidos acentos e diferenças de maiúscula/minúscula — e retorna a
// grafia já existente (a "oficial"), para padronizar automaticamente. Retorna null se não
// encontrar nenhum igual (nomes diferentes de verdade não são tocados).
function encontrarGrafiaExistente(nome) {
  if (typeof estoque === 'undefined' || !nome) return null;
  const normalizar = function(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  };
  const alvo = normalizar(nome);
  const keys = Object.keys(estoque);
  for (let k = 0; k < keys.length; k++) {
    const item = estoque[keys[k]];
    if (item && item.name && normalizar(item.name) === alvo && item.name !== nome) {
      return item.name;
    }
  }
  return null;
}

function updateIngrSubtotal(i) {
  const ig = curIngr[i];
  if (!ig) return;
  const preco = typeof getPrecoIngrediente === 'function' ? getPrecoIngrediente(ig.name) : 0;
  const semPreco = typeof ingredienteSemPreco === 'function' ? ingredienteSemPreco(ig.name) : !preco;
  const sub = (parseFloat(ig.qty||0) * preco).toFixed(2);
  const el = document.getElementById('ingr-sub-' + i);
  if (el) el.textContent = fR(sub);
  const elM = document.getElementById('ingr-sub-m-' + i);
  if (elM) {
    const precoTxt = (ig.name && semPreco) ? '⚠️ sem preço' : (preco>0 ? (typeof formatPrecoIngrediente === 'function' ? formatPrecoIngrediente(ig.name) : 'R$ '+(preco*1000).toFixed(2)+'/kg') : '—');
    elM.textContent = precoTxt + ' · ' + fR(sub);
  }
  atualizarMultiplicadorAroPreview();
}

// Lista de nomes de ingredientes já usados em todas as receitas, para autocomplete
function getNomesIngredientesConhecidos() {
  const set = new Set();
  recipes.forEach(r => (r.ingredients||[]).forEach(ig => { if (ig.name) set.add(ig.name.trim()); }));
  return Array.from(set).sort((a,b) => a.localeCompare(b,'pt-BR'));
}

function showIngrSugestoes(i, val) {
  const box = document.getElementById('ingr-sug-' + i);
  if (!box) return;
  const termo = (val||'').trim().toLowerCase();
  if (!termo) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const conhecidos = getNomesIngredientesConhecidos();
  const filtrados = conhecidos.filter(n => n.toLowerCase().includes(termo) && n.toLowerCase() !== termo).slice(0, 6);
  if (!filtrados.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.innerHTML = filtrados.map((n, idx) =>
    `<span class="ingr-sug-chip" data-nome="${n.replace(/"/g,'&quot;')}" onmousedown="event.preventDefault();selectIngrSugestao(${i},this.getAttribute('data-nome'))">${n}</span>`
  ).join('');
  box.style.display = 'flex';
}


function hideIngrSugestoes(i) {
  const box = document.getElementById('ingr-sug-' + i);
  if (box) box.style.display = 'none';
}

function selectIngrSugestao(i, nome) {
  curIngr[i].name = nome;
  renderIngrTable();
}

async function atualizarPrecos() {
  const names = curIngr.map(ig => ig.name).filter(n => n && !n.toLowerCase().includes('água'));
  if (!names.length) { toast('Adicione ingredientes primeiro'); return; }
  const btn = document.getElementById('btn-upd');
  const bar = document.getElementById('ai-preco-bar');
  const msg = document.getElementById('ai-preco-msg');
  btn.disabled = true; bar.style.display = 'flex'; msg.textContent = 'Buscando preços no ES...';
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
    let map; try { map = JSON.parse(txt.replace(/```json|```/g,'').trim()); } catch { throw new Error('Formato inválido'); }
    let n = 0;
    curIngr.forEach(ig => {
      const k = Object.keys(map).find(k => ig.name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(ig.name.toLowerCase()));
      if (k && map[k] > 0) { ig.price = map[k] / 1000; n++; }
    });
    renderIngrTable(); updCosts(); msg.textContent = n + ' preços atualizados!';
    setTimeout(() => { bar.style.display='none'; }, 2500);
  } catch (err) { msg.textContent = 'Erro: ' + err.message; setTimeout(() => { bar.style.display='none'; }, 3000); }
  finally { btn.disabled = false; }
}

function updCosts() {
  const yld = parseFloat(document.getElementById('fyld').value||1);
  const mrg = parseFloat(document.getElementById('fmrg').value||0);
  const ext = parseFloat(document.getElementById('fext').value||0);
  const ic = totIC(curIngr); const tot = ic + ext; const sale = tot * (1 + mrg/100);
  const b = curIngr.find(i => i.isBase); const unit = document.getElementById('funit').value||'porção';
  const cp = document.getElementById('cost-prev');
  if(cp) cp.innerHTML = `
    <div class="cr"><span>Ingredientes</span><span>${fR(ic)}</span></div>
    <div class="cr"><span>Embalagem/fixos</span><span>${fR(ext)}</span></div>
    <div class="cr tot"><span>Custo total (${yld} ${unit})</span><span>${fR(tot)}</span></div>
    ${b?`<div class="cr" style="font-size:12px"><span>Por 100${b.unit||'g'} de ${b.name}</span><span>${fR(tot/(parseFloat(b.qty||1)/100))}</span></div>`:''}`;
  const sp = document.getElementById('sale-prev');
  if(sp) sp.innerHTML = `
    <div class="cr sal"><span>Preço sugerido (${yld} ${unit})</span><span style="font-size:15px;font-weight:700">${fR(sale)}</span></div>
    <div class="cr sal"><span>Por ${unit}</span><span>${fR(sale/yld)}</span></div>
    <div class="cr" style="color:var(--teal)"><span><i class="ti ti-trending-up"></i> Lucro</span><span>${fR(sale-tot)}</span></div>`;
}

async function pedirComentario() {
  const nome = document.getElementById('fn').value;
  const bar = document.getElementById('ai-comment-bar'); bar.style.display = 'flex';
  try {
    const r = await fetch('/api/claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Para a receita "${nome||'receita'}", escreva 3 dicas curtas em português: variação, armazenamento, acompanhamento. Responda direto.`, maxTokens: 300 })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Erro ao gerar comentário');
    const txt = d.resultado || '';
    const campo = document.getElementById('fcomment');
    campo.value = (campo.value?campo.value+'\n\n':'')+'\uD83D\uDCA1 '+txt;
  } catch(err) { toast('Erro: '+err.message); }
  finally { bar.style.display='none'; }
}

// Faz upload da foto escolhida para o Supabase Storage (bucket receitas-fotos) e adiciona
// a URL pública retornada à lista de fotos em memória da receita sendo editada. Substitui
// o uso de FileReader/base64, que deixava o array `photos` pesado o suficiente para causar
// timeout nas queries de listagem de receitas.
function addRecipePhoto(e) {
  const file = e.target.files[0]; if(!file) return;
  e.target.value = ''; // libera o input já, antes do upload terminar

  toast('Enviando foto...');
  uploadFotoParaStorage(file).then(function(url) {
    curPhotos.push(url);
    renderRecipePhotosGrid();
    toast('✅ Foto enviada!');
  }).catch(function(err) {
    toast('⚠️ Erro ao enviar foto: ' + (err.message || 'sem conexão'), 4000);
  });
}
function remRecipePhoto(i) { curPhotos.splice(i,1); renderRecipePhotosGrid(); }
function renderRecipePhotosGrid() {
  document.getElementById('recipe-photos-grid').innerHTML = curPhotos.map((p,i)=>`<div class="photo-grid-item">
    <img src="${p}">
    ${i===0 ? '<div style="position:absolute;top:3px;left:3px;background:var(--gold);color:#020B18;font-size:9px;font-weight:800;padding:2px 6px;border-radius:10px">⭐ Capa</div>' : '<button onclick="tornarFotoCapa('+i+')" title="Tornar capa" style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:10px;font-size:9px;font-weight:700;padding:2px 6px;cursor:pointer">⭐ Tornar capa</button>'}
    <button class="photo-del" onclick="remRecipePhoto(${i})"><i class="ti ti-x" style="font-size:9px"></i></button>
  </div>`).join('');
}

// Move a foto do índice indicado para a posição 0 (capa), preservando a ordem das demais.
function tornarFotoCapa(i) {
  if (i <= 0 || i >= curPhotos.length) return;
  const foto = curPhotos.splice(i, 1)[0];
  curPhotos.unshift(foto);
  renderRecipePhotosGrid();
}

function toggleFormas() { formasEnabled=!formasEnabled; updateFormaToggle(); }
function updateFormaToggle() {
  const sw = document.getElementById('forma-toggle-sw');
  const sec = document.getElementById('formas-section');
  if(sw) sw.classList.toggle('on', formasEnabled);
  if(sec) sec.classList.toggle('visible', formasEnabled);
}
function addForma() { curFormas.push({id:genId(),nome:'',tamanho:'',qtdMassa:'',unMassa:'g',img:null}); renderFormas(); }
function remForma(i) { curFormas.splice(i,1); renderFormas(); }
function addFormaFoto(i,e) {
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{curFormas[i].img=ev.target.result;renderFormas();};
  reader.readAsDataURL(file);e.target.value='';
}
function renderFormas() {
  const el=document.getElementById('formas-list');if(!el)return;
  if(!curFormas.length){el.innerHTML='<p class="text-sm" style="margin-bottom:10px">Nenhuma forma adicionada.</p>';return;}
  el.innerHTML=curFormas.map((f,i)=>`
    <div class="forma-card">
      <div class="flex-row" style="margin-bottom:10px">
        <div class="forma-img" onclick="document.getElementById('fimg${i}').click()">
          ${f.img?`<img src="${f.img}">`:'<i class="ti ti-cake"></i>'}
        </div>
        <input type="file" id="fimg${i}" accept="image/*" capture="environment" style="display:none" onchange="addFormaFoto(${i},event)">
        <div style="flex:1;margin-left:8px">
          <div class="fg" style="margin-bottom:6px"><label>Nome</label><input type="text" value="${f.nome}" placeholder="Ex: Redonda" oninput="curFormas[${i}].nome=this.value"></div>
          <div class="fg" style="margin-bottom:0"><label>Tamanho</label><input type="text" value="${f.tamanho}" placeholder="Ex: 25cm" oninput="curFormas[${i}].tamanho=this.value"></div>
        </div>
        <button class="db" style="align-self:flex-start;margin-left:4px" onclick="remForma(${i})"><i class="ti ti-trash"></i></button>
      </div>
      <div class="fr">
        <div class="fg" style="margin-bottom:0"><label>Qtd de massa</label><input type="number" value="${f.qtdMassa}" placeholder="Ex: 800" oninput="curFormas[${i}].qtdMassa=this.value" min="0"></div>
        <div class="fg" style="margin-bottom:0"><label>Unidade</label><select onchange="curFormas[${i}].unMassa=this.value"><option value="g" ${f.unMassa==='g'?'selected':''}>g</option><option value="kg" ${f.unMassa==='kg'?'selected':''}>kg</option><option value="ml" ${f.unMassa==='ml'?'selected':''}>ml</option><option value="L" ${f.unMassa==='L'?'selected':''}>L</option></select></div>
      </div>
    </div>`).join('');
}

// ═══════ SAVE RECIPE ═══════
function getIngredientesNovosSemPreco() {
  // Ingredientes da receita atual que não existem no Estoque (por nome normalizado)
  if (typeof estoque === 'undefined') return [];
  const vistos = new Set();
  const novos = [];
  curIngr.forEach(ig => {
    if (!ig.name || !ig.name.trim()) return;
    const key = ig.name.trim().toLowerCase();
    if (vistos.has(key)) return;
    vistos.add(key);
    if (!estoque[key]) novos.push({ key: key, nome: ig.name.trim(), unit: ig.unit || 'g' });
  });
  return novos;
}

async function saveRecipe() {
  const name = document.getElementById('fn').value.trim();
  if(!name){toast('Informe o nome da receita');st2(0);return;}
  const novos = getIngredientesNovosSemPreco();
  if (novos.length) {
    abrirModalIngredientesNovos(novos);
    return;
  }
  await saveRecipeFinal();
}

function abrirModalIngredientesNovos(novos) {
  document.getElementById('modal-item-titulo').textContent = 'Ingrediente(s) novo(s) no Estoque';
  let html = '<div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.5">'
    + (novos.length===1 ? 'Este ingrediente ainda não está no Estoque.' : 'Estes ' + novos.length + ' ingredientes ainda não estão no Estoque.')
    + ' Informe o preço por kg/L agora, ou deixe em branco e cadastre depois — vai aparecer como pendência em Estoque e na Home até você preencher.</div>';
  novos.forEach(function(n, i){
    html += '<div style="margin-bottom:12px">'
      + '<label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">' + n.nome + ' <span style="color:var(--text3)">(R$ por kg/L)</span></label>'
      + '<input type="number" id="ni-preco-' + i + '" min="0" step="0.01" placeholder="Ex: 12.50" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px">'
      + '</div>';
  });
  document.getElementById('modal-item-campos').innerHTML = html;
  document.getElementById('modal-item-btn-confirmar').textContent = 'Salvar receita';
  document.getElementById('modal-item-btn-confirmar').onclick = async function() {
    await confirmarIngredientesNovos(novos);
  };
  document.getElementById('modal-item-cardapio').style.display = 'flex';
}

async function confirmarIngredientesNovos(novos) {
  if (typeof estoque === 'undefined') window.estoque = {};
  const semPreco = [];
  novos.forEach(function(n, i){
    const el = document.getElementById('ni-preco-' + i);
    const precoKg = el ? parseFloat(el.value) : NaN;
    // Cria a entrada no Estoque (mesmo sem preço ainda, para aparecer como pendência)
    estoque[n.key] = estoque[n.key] || { name: n.nome, price: 0, unit: n.unit || 'g', updatedAt: null, usedIn: [] };
    if (!isNaN(precoKg) && precoKg > 0) {
      const precoUnit = precoKg / 1000; // mesma convenção usada em atualizarEstoqueIASelecionados (preço por g/ml)
      estoque[n.key].price = precoUnit;
      estoque[n.key].updatedAt = new Date().toISOString();
      // Não copia o preço para dentro de curIngr — o Estoque já é a única fonte de
      // verdade, e iCost()/getPrecoIngrediente() já leem direto de lá.
    } else {
      semPreco.push(n);
    }
  });
  if (typeof saveEstoque === 'function') saveEstoque();
  fecharModalItemCardapio();

  await saveRecipeFinal();
  renderIngrTable(); // reflete os preços recém-cadastrados na tabela, se o formulário ainda estiver aberto

  if (semPreco.length) {
    toast('⚠️ ' + semPreco.length + ' ingrediente(s) ficaram sem preço — veja a pendência em Estoque ou na Home.', 5000);
  }
}

async function saveRecipeFinal() {
  const name = document.getElementById('fn').value.trim();
  if(!name){toast('Informe o nome da receita');st2(0);return;}
  // Última correção de grafia antes de salvar: garante que nenhum ingrediente fique
  // duplicado no Estoque só por diferença de maiúscula/acento em relação a um nome já
  // cadastrado (mesma lógica aplicada ao sair do campo, repetida aqui como segurança caso
  // o usuário clique em Salvar sem antes tirar o foco do último campo editado).
  curIngr.forEach(function(ig){
    if (!ig.name || !ig.name.trim()) return;
    const corrigido = encontrarGrafiaExistente(ig.name.trim());
    if (corrigido) ig.name = corrigido;
  });
  const data = {
    id: editId||genId(), name,
    cat: document.getElementById('fcat').value,
    group: document.getElementById('fgrp').value,
    subgrupo: document.getElementById('fsubgrp') ? document.getElementById('fsubgrp').value : '',
    unit: document.getElementById('funit').value,
    yield_qty: parseFloat(document.getElementById('fyld').value)||6,
    yield: parseFloat(document.getElementById('fyld').value)||6,
    pesoTotal: parseFloat(document.getElementById('fpesoTotal').value)||null,
    multiplicadorAro: Object.keys(curMultiplicadorAro).length ? {...curMultiplicadorAro} : null,
    recheiosVinculados: getRecheiosVinculadosSelecionados(),
    caldaVinculada: document.getElementById('fcaldavinc') ? (document.getElementById('fcaldavinc').value || null) : null,
    tipoCardapio: document.getElementById('ftipocardapio') ? (document.getElementById('ftipocardapio').value || 'trad') : 'trad',
    subgrupoCardapio: (typeof getSubgrupoCardapioDoFormulario === 'function') ? getSubgrupoCardapioDoFormulario() : '',
    time: parseFloat(document.getElementById('ftm').value)||60,
    margin: parseFloat(document.getElementById('fmrg').value)||100,
    extra: parseFloat(document.getElementById('fext').value)||0,
    preparo: document.getElementById('fprep').value,
    comment: document.getElementById('fcomment').value,
    embalagem: document.getElementById('fembalagem') ? document.getElementById('fembalagem').value : '',
    conservacao: document.getElementById('fconservacao') ? document.getElementById('fconservacao').value : '',
    usaPanelaMexedora: document.getElementById('fpanela').checked,
    panelaTempo: document.getElementById('fpanela').checked ? (parseFloat(document.getElementById('fpanela-tempo').value)||0) : null,
    panelaVelocidade: document.getElementById('fpanela').checked ? (document.getElementById('fpanela-vel').value||'') : null,
    ingredients: curIngr, photos: curPhotos,
    formas: curFormas, formasEnabled,
    shared: shareConfig.sharedIds.includes(editId||''),
    createdAt: Date.now()
  };
  if(editId){const idx=recipes.findIndex(r=>r.id===editId);recipes[idx]=data;}
  else recipes.unshift(data);
  rmap[data.id]=data;
  renderRecipes(); renderHome();
  const resultado = await saveToCloud(data);
  if (resultado.ok) {
    editId = data.id; // garante que próximos cliques em Salvar continuem editando esta mesma receita
    window._editSnapshotInicial = capturarSnapshotFormularioReceita(); // recaptura o snapshot pós-salvamento, para não acusar alterações pendentes indevidamente
    atualizarBotoesNavegacaoReceita();
    toast('Receita salva na nuvem! ✅');
  } else {
    toast('⚠️ Salvo só localmente (erro: ' + (resultado.error?.message || 'sem conexão') + '). Tente Salvar de novo.', 6000);
  }
}

async function delRecipe(id) {
  if(!confirm('Excluir esta receita?'))return;
  if(!window._deletedIds)window._deletedIds=new Set();
  window._deletedIds.add(id);
  try{await sb.from('receitas').delete().eq('id',id).eq('user_id',USER_ID);}catch(e){}
  recipes=recipes.filter(r=>r.id!==id);
  shareConfig.sharedIds=shareConfig.sharedIds.filter(x=>x!==id);
  delete rmap[id];delete viewState[id];
  renderRecipes();renderHome();
  toast('Receita excluída!');
}

// ═══════ VIEW RECIPE ═══════
function viewRecipe(id) {
  const r=recipes.find(x=>x.id===id);if(!r)return;
  rmap[id]=r;
  const b=getBase(r);
  if(!viewState[id])viewState[id]={mode:b?'base':'prop',baseVal:b?parseFloat(b.qty):1,propMode:'pct',pct:100,fracN:1,fracD:1,mult:1,helperN:1,helperD:1};
  document.getElementById('vt').textContent=r.name;document.getElementById('vt').dataset.rid=r.id;
  document.getElementById('veb').onclick=()=>{cm('modal-view');openEdit(id);};
  // hide edit button for guests
  const veb = document.getElementById('veb');
  if(veb) veb.style.display = isGuest() ? 'none' : '';
  renderViewBody(r);
  atualizarBotoesNavegacaoReceitaView(id);
  document.getElementById('modal-view').style.display='flex';
}

// Calcula a lista de navegação para o modal de Visualização — mesma lógica usada na edição
// (getListaNavegacaoReceita), mas referenciando o id passado como parâmetro em vez de editId,
// já que o modal de visualização não usa a variável global editId do formulário de edição.
function getListaNavegacaoReceitaView(id) {
  var listaAtual = window._listaReceitasFiltradaAtual || [];
  if (id && listaAtual.indexOf(id) !== -1) return listaAtual;

  var atual = recipes.find(function(r){ return r.id === id; });
  if (!atual) return listaAtual;

  var guest = (typeof isGuest === 'function') ? isGuest() : false;
  var lista = recipes.filter(function(r){
    if (r.cat !== atual.cat) return false;
    if ((r.group || '') !== (atual.group || '')) return false;
    if (atual.subgrupo) return r.subgrupo === atual.subgrupo;
    return !r.subgrupo;
  });
  if (guest) lista = lista.filter(function(r){ return shareConfig.sharedIds.includes(r.id); });
  lista = lista.slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||'','pt-BR'); });
  return lista.map(function(r){ return r.id; });
}

// Mostra/esconde e habilita/desabilita os botões "‹"/"›" do cabeçalho do modal de
// Visualização, de acordo com a posição da receita atual dentro da lista de navegação.
function atualizarBotoesNavegacaoReceitaView(id) {
  const btnAnt = document.getElementById('btn-receita-view-anterior');
  const btnProx = document.getElementById('btn-receita-view-proxima');
  if (!btnAnt || !btnProx) return;
  const lista = getListaNavegacaoReceitaView(id);
  const idx = id ? lista.indexOf(id) : -1;
  const mostrar = idx !== -1 && lista.length > 1;
  btnAnt.style.display = mostrar ? '' : 'none';
  btnProx.style.display = mostrar ? '' : 'none';
  if (mostrar) {
    btnAnt.disabled = idx <= 0;
    btnProx.disabled = idx >= lista.length - 1;
  }
}

// Navega para a receita anterior/próxima no modal de Visualização. Diferente da edição, aqui
// não há formulário/alterações pendentes para checar — é só trocar de receita exibida.
function navegarReceitaAdjacenteView(direcao) {
  const idAtual = document.getElementById('vt')?.dataset.rid;
  if (!idAtual) return;
  const lista = getListaNavegacaoReceitaView(idAtual);
  const idxAtual = lista.indexOf(idAtual);
  if (idxAtual === -1) return;
  const idxAlvo = idxAtual + direcao;
  if (idxAlvo < 0 || idxAlvo >= lista.length) {
    toast(direcao < 0 ? 'Esta já é a primeira receita da lista' : 'Esta já é a última receita da lista');
    return;
  }
  viewRecipe(lista[idxAlvo]);
}

function vs(id,key,val){
  if(!viewState[id])viewState[id]={mode:'prop',baseVal:1,propMode:'pct',pct:100,fracN:1,fracD:1,mult:1,helperN:1,helperD:1};
  viewState[id][key]=val;rmap[id]=recipes.find(x=>x.id===id);
}

function getRatio(r){
  const s=viewState[r.id];if(!s)return 1;
  const b=getBase(r);
  if(s.mode==='base'&&b){
    const baseQty=parseFloat(b.qty||1);
    const inputVal=parseWeightInput(s.baseVal+(b.unit||'g'),b.unit||'g');
    return(inputVal>0?inputVal:parseFloat(s.baseVal)||1)/baseQty;
  }
  const pm=s.propMode;
  if(pm==='pct')return(parseFloat(s.pct)||100)/100;
  if(pm==='frac'){const n=parseFloat(s.fracN)||1,d=parseFloat(s.fracD)||1;return n/d;}
  if(pm==='mult')return parseFloat(s.mult)||1;
  return 1;
}

function applyReceitas(id,val){
  var frac=parseFractionInput(val);
  if(frac>0){vs(id,'receitasVal',val);vs(id,'mult',frac);vs(id,'mode','prop');vs(id,'propMode','mult');renderViewBody(rmap[id]);}
}
function applyPct(id,val){
  var p=parseFloat(val)||100;
  vs(id,'pct',p);vs(id,'mode','prop');vs(id,'propMode','pct');vs(id,'receitasVal',String(p/100));
  renderViewBody(rmap[id]);
}
function applyBaseWeight(id,unit,val){
  var parsed=parseWeightInput(val,unit);
  if(!parsed)parsed=parseFloat(val)||0;
  if(parsed>0){vs(id,'baseVal',parsed);vs(id,'mode','base');renderViewBody(rmap[id]);}
}
function updateHelper(id){
  var n=parseFloat(document.getElementById('inp-hn-'+id)?.value)||1;
  var d=parseFloat(document.getElementById('inp-hd-'+id)?.value)||1;
  vs(id,'helperN',n);vs(id,'helperD',d);
  var pct=d>0?((n/d)*100).toFixed(1):'—';
  var el=document.getElementById('helper-result-'+id);
  if(el)el.textContent=pct+'%';
}
function useHelper(id){
  var n=parseFloat(document.getElementById('inp-hn-'+id)?.value)||1;
  var d=parseFloat(document.getElementById('inp-hd-'+id)?.value)||1;
  var pct=d>0?(n/d)*100:100;
  applyPct(id,pct.toFixed(1));
}
function parseWeightInput(val,baseUnit){
  val=(val||'').toString().replace(',','.').trim().toLowerCase();
  var kg=val.match(/^([\d.]+)\s*kg$/);var g=val.match(/^([\d.]+)\s*g$/);
  var ml=val.match(/^([\d.]+)\s*ml$/);var l=val.match(/^([\d.]+)\s*l$/);
  if(kg)return parseFloat(kg[1])*1000;if(g)return parseFloat(g[1]);
  if(l)return parseFloat(l[1])*1000;if(ml)return parseFloat(ml[1]);
  return parseFloat(val)||0;
}
function parseFractionInput(val){
  val=(val||'').toString().replace(',','.').trim();
  var frac=val.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
  if(frac)return parseFloat(frac[1])/parseFloat(frac[2]);
  return parseFloat(val)||1;
}

function renderViewBody(r) {
  const s=viewState[r.id];const ratio=getRatio(r);
  const p=calcAt(r,ratio);const b=getBase(r);
  const pct2=p.cost>0?(p.luc/p.cost*100):0;
  const helperPct=s.helperD>0?((s.helperN/s.helperD)*100).toFixed(1):'—';
  const guest=isGuest();

  // Seção cálculo
  const calcSection = `
    ${b ? `
    <div class="bclc">
      <div class="bcl"><i class="ti ti-star"></i> Calcular por <strong>${b.name}</strong></div>
      <div class="bcrow" style="gap:8px;flex-wrap:wrap">
        <label style="font-size:13px;color:var(--blue)">Quantidade:</label>
        <input type="text" id="inp-base-${r.id}"
          value="${parseFloat(s.mode==='base'?s.baseVal:parseFloat(b.qty)*ratio).toFixed(0)}${b.unit||'g'}"
          placeholder="500g · 1kg"
          style="width:130px;padding:8px 10px;border:1.5px solid var(--blue-mid);border-radius:var(--radius-sm);font-size:16px;font-weight:700;text-align:center;background:var(--surface);color:var(--text);font-family:inherit"
          onchange="applyBaseWeight('${r.id}','${b.unit||'g'}',this.value)"
          onblur="applyBaseWeight('${r.id}','${b.unit||'g'}',this.value)"
          onkeydown="if(event.key==='Enter'){applyBaseWeight('${r.id}','${b.unit||'g'}',this.value);this.blur();}">
        <span class="bcratio">× ${ratio.toFixed(3)}</span>
      </div>
      <div style="font-size:11px;color:var(--blue);opacity:.7;margin-top:4px">Digite e pressione Enter ou toque fora do campo</div>
    </div>` : `<div class="warn-box"><i class="ti ti-info-circle" style="flex-shrink:0;margin-top:1px"></i> Sem ingrediente principal — use proporção abaixo.</div>`}

    <div class="prop-box">
      <div class="prop-title"><i class="ti ti-adjustments-horizontal"></i> Calcular por proporção da receita</div>
      <div style="margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:7px"><i class="ti ti-copy"></i> Quantas receitas quero fazer?</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="text" id="inp-receitas-${r.id}" value="${s.receitasVal||'1'}" placeholder="1 · 2 · 1/2"
            style="width:120px;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-weight:700;text-align:center;background:var(--surface);color:var(--text);font-family:inherit"
            onchange="applyReceitas('${r.id}',this.value)" onblur="applyReceitas('${r.id}',this.value)"
            onkeydown="if(event.key==='Enter'){applyReceitas('${r.id}',this.value);this.blur();}">
          <span style="font-size:13px;color:var(--text2)">× receita base</span>
          <span class="prbdg">${ratio.toFixed(3)}×</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:5px">Ex: <b>1</b> = inteira · <b>2</b> = dobro · <b>1/2</b> = metade · <b>1,5</b> = uma e meia</div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:10px">
        <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:7px"><i class="ti ti-percent"></i> Ou informe a porcentagem:</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <input type="number" id="inp-pct-${r.id}" value="${s.pct||100}" min="1" step="5"
            style="width:80px;padding:7px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;font-weight:700;text-align:center;background:var(--surface);color:var(--text);font-family:inherit"
            onchange="applyPct('${r.id}',this.value)" onblur="applyPct('${r.id}',this.value)"
            onkeydown="if(event.key==='Enter'){applyPct('${r.id}',this.value);this.blur();}">
          <span style="font-size:14px;color:var(--text2)">% da receita</span>
          <span class="prbdg">${ratio.toFixed(3)}×</span>
        </div>
        <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px 12px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:7px"><i class="ti ti-calculator"></i> Converter fração em %:</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <input type="number" id="inp-hn-${r.id}" value="${s.helperN||1}" min="1"
              style="width:54px;padding:6px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;font-weight:700;text-align:center;font-family:inherit;background:var(--surface);color:var(--text)"
              onchange="updateHelper('${r.id}')" onblur="updateHelper('${r.id}')" onkeydown="if(event.key==='Enter')updateHelper('${r.id}')">
            <span style="font-size:20px;font-weight:700;color:var(--text2)">/</span>
            <input type="number" id="inp-hd-${r.id}" value="${s.helperD||1}" min="1"
              style="width:54px;padding:6px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;font-weight:700;text-align:center;font-family:inherit;background:var(--surface);color:var(--text)"
              onchange="updateHelper('${r.id}')" onblur="updateHelper('${r.id}')" onkeydown="if(event.key==='Enter')updateHelper('${r.id}')">
            <span style="font-size:13px;color:var(--text2)">da receita =</span>
            <span class="pct-result" id="helper-result-${r.id}">${helperPct}%</span>
            <button class="use-pct" onclick="useHelper('${r.id}')">Usar</button>
          </div>
          <p style="font-size:11px;color:var(--text3);margin-top:5px">4/3 → 133% · 3/2 → 150% · 1/2 → 50%</p>
        </div>
      </div>
    </div>`;

  // Custo completo (só admin vê)
  var custoSection = '';
  if (!guest) {
    var cfg = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
    var valorHora    = cfg.valorHora    || 25;
    var indiretoPct  = cfg.indiretoPct  || 15;
    var margemNeg    = cfg.margemNegocio || 30;
    var horas        = (r.time || 60) / 60;
    var custoIngr    = p.cost;
    var custoIndireto = custoIngr * indiretoPct / 100;
    var custoMdo     = horas * valorHora;
    var custoTotal   = custoIngr + custoIndireto + custoMdo;
    var precoMin     = custoTotal / (1 - margemNeg / 100);
    var lucroMin     = precoMin - custoTotal;
    var precoAtual   = p.sale;
    var lucroAtual   = precoAtual - custoTotal;
    var margemAtual  = custoTotal > 0 ? ((lucroAtual / custoTotal) * 100) : 0;
    var porcao = Math.max(p.portions, 0.01);

    custoSection = `
    <div style="margin-bottom:14px;background:rgba(200,163,91,.06);border:1px solid rgba(200,163,91,.2);border-radius:12px;padding:14px">
      <div style="font-size:10px;font-weight:800;color:#C8A35B;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px">💰 Custo & Precificação</div>

      <!-- Breakdown de custos -->
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:0.5px solid rgba(200,163,91,.15)">
          <span style="color:var(--text2)">🛒 Ingredientes</span>
          <span style="font-weight:700;color:#FF8080">${fR(custoIngr)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:0.5px solid rgba(200,163,91,.15)">
          <span style="color:var(--text2)">⚡ Indireto (${indiretoPct}% sobre ingr.)</span>
          <span style="font-weight:700;color:#FF8080">${fR(custoIndireto)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:0.5px solid rgba(200,163,91,.15)">
          <span style="color:var(--text2)">👩‍🍳 Mão de obra (${horas.toFixed(1)}h × R$${valorHora})</span>
          <span style="font-weight:700;color:#FF8080">${fR(custoMdo)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid rgba(200,163,91,.3);font-weight:700">
          <span style="color:var(--text)">📊 Custo total real</span>
          <span style="color:#FF8080">${fR(custoTotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0">
          <span style="color:var(--text2)">🍽️ Custo por porção</span>
          <span style="font-weight:700;color:var(--text2)">${fR(custoTotal/porcao)}</span>
        </div>
      </div>

      <!-- Preço sugerido vs atual -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:rgba(15,110,86,.15);border:1px solid rgba(15,110,86,.3);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:9px;color:var(--teal);font-weight:700;text-transform:uppercase;margin-bottom:4px">💡 Preço mínimo (${margemNeg}% lucro)</div>
          <div style="font-size:18px;font-weight:800;color:var(--teal)">${fR(precoMin)}</div>
          <div style="font-size:10px;color:var(--teal);opacity:.7">${fR(precoMin/porcao)} / porção</div>
        </div>
        <div style="background:rgba(200,163,91,.1);border:1px solid rgba(200,163,91,.3);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:9px;color:#C8A35B;font-weight:700;text-transform:uppercase;margin-bottom:4px">🏷️ Preço cadastrado</div>
          <div style="font-size:18px;font-weight:800;color:#C8A35B">${fR(precoAtual)}</div>
          <div style="font-size:10px;color:#C8A35B;opacity:.7">${fR(precoAtual/porcao)} / porção</div>
        </div>
      </div>

      <!-- Análise de lucro -->
      <div style="background:${lucroAtual>=lucroMin?'rgba(15,110,86,.1)':'rgba(255,80,80,.1)'};border:1px solid ${lucroAtual>=lucroMin?'rgba(15,110,86,.3)':'rgba(255,80,80,.3)'};border-radius:8px;padding:10px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:11px;color:var(--text2)">Lucro real por lote</div>
            <div style="font-size:20px;font-weight:800;color:${lucroAtual>=0?'var(--teal)':'#FF8080'}">${fR(Math.abs(lucroAtual))}</div>
            <div style="font-size:10px;color:var(--text3)">${fR(lucroAtual/porcao)} / porção · margem ${margemAtual.toFixed(0)}%</div>
          </div>
          <div style="font-size:28px">${lucroAtual>=lucroMin?'✅':'⚠️'}</div>
        </div>
        ${lucroAtual < precoMin - custoTotal ? '<div style="font-size:11px;color:#FF8080;margin-top:6px">Cobrando abaixo do mínimo para '+margemNeg+'% de lucro. Preço ideal: '+fR(precoMin)+'</div>' : '<div style="font-size:11px;color:var(--teal);margin-top:4px">Preço acima do mínimo necessário ✓</div>'}
      </div>
    </div>`;
  }

  // Ingredientes com quantidade ANTES do nome e decimal correto
  const ingredSection = p.scaled.length ? `
    <div style="margin-bottom:12px">
      <div class="st"><i class="ti ti-list"></i> Ingredientes ajustados</div>
      ${p.scaled.map(ig => {
        const q = parseFloat(ig.qty||0);
        const sub = iCost(ig,q);
        const qtdStr = fmtQtd(q, ig.unit);
        const isBase = ig.isBase;
        return `<div style="display:flex;align-items:flex-start;padding:9px 0;border-bottom:0.5px solid rgba(200,163,91,.15)">
          <span style="font-size:14px;font-weight:800;color:#C8A35B;min-width:100px;flex-shrink:0;padding-right:12px;font-family:Georgia,serif">${qtdStr}</span>
          <div style="flex:1">
            <span style="font-size:14px;font-weight:${isBase?'800':'400'};color:#F0E6CC">${isBase?'⭐ ':''}${ig.name||'-'}</span>
            ${ig.obs?`<div style="font-size:11px;color:var(--text2);font-style:italic;margin-top:2px"><i class="ti ti-info-circle" style="font-size:10px"></i> ${ig.obs}</div>`:''}
          </div>
          ${!guest&&sub>0?`<span style="font-size:11px;color:var(--text3);flex-shrink:0;margin-left:8px">${fR(sub)}</span>`:''}
        </div>`;
      }).join('')}
    </div>` : '';

  const preparoSection = r.preparo ? `
    <div style="margin-bottom:16px">
      <div class="st"><i class="ti ti-notes"></i> Modo de preparo</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${r.preparo.split('\n').filter(l=>l.trim()).map((linha,i)=>{
          const letra=String.fromCharCode(65+i);
          return '<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:rgba(200,163,91,.08);border-radius:8px;border-left:3px solid rgba(200,163,91,.4)">'
            +'<span style="font-size:13px;font-weight:800;color:#C8A35B;flex-shrink:0;min-width:20px">'+letra+')</span>'
            +'<span style="font-size:13px;line-height:1.7">'+linha.trim()+'</span>'
            +'</div>';
        }).join('')}
      </div>
    </div>` : '';

  const panelaSection = r.usaPanelaMexedora ? `
    <div style="margin-bottom:16px;background:rgba(200,163,91,.1);border:1px solid rgba(200,163,91,.3);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:14px">
      <span style="font-size:26px">🥘</span>
      <div style="flex:1">
        <div style="font-size:11px;font-weight:800;color:#C8A35B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Panela Mexedora</div>
        <div style="font-size:13px;color:#F0E6CC">
          ${r.panelaTempo ? '⏱️ ' + r.panelaTempo + ' min' : ''}
          ${r.panelaTempo && r.panelaVelocidade ? ' · ' : ''}
          ${r.panelaVelocidade ? '⚙️ Velocidade ' + r.panelaVelocidade : ''}
          ${!r.panelaTempo && !r.panelaVelocidade ? 'Sem tempo/velocidade definidos' : ''}
        </div>
      </div>
    </div>` : '';

  const formasSection = r.formasEnabled&&r.formas&&r.formas.length ? `
    <div style="margin-bottom:12px">
      <div class="st"><i class="ti ti-cake"></i> Formas</div>
      ${r.formas.map(f=>`<div class="forma-card" style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div class="forma-img">${f.img?`<img src="${f.img}">`:'<i class="ti ti-cake"></i>'}</div>
        <div><div style="font-weight:700;font-size:13px">${f.nome||'Forma'} ${f.tamanho?`(${f.tamanho})`:''}</div>${f.qtdMassa?`<div style="font-size:12px;color:var(--text2)">Massa: <strong>${f.qtdMassa} ${f.unMassa}</strong></div>`:''}</div>
      </div>`).join('')}
    </div>` : '';

  const commentSection = r.comment ? `
    <div style="margin-bottom:12px">
      <div class="st"><i class="ti ti-message"></i> Comentários</div>
      <div style="font-size:13px;line-height:1.8;color:var(--text2)">${r.comment.replace(/\n/g,'<br>')}</div>
    </div>` : '';

  const shareBtn = !guest ? `
    <button class="btns" style="width:100%;justify-content:center;margin-top:4px" onclick="toggleShareFromView('${r.id}')">
      <i class="ti ti-${shareConfig.sharedIds.includes(r.id)?'share-3':'share'}" id="siv-${r.id}"></i>
      <span id="svt-${r.id}">${shareConfig.sharedIds.includes(r.id)?'Remover do compartilhamento':'Marcar para compartilhar'}</span>
    </button>` : '';

  // Layout: fotos e tags no topo
  // Desktop: 2 colunas (cálculo+custo | receita)
  document.getElementById('vb').innerHTML = `
    ${r.photos&&r.photos.length?r.photos.map(ph=>`<img src="${ph}" style="width:100%;border-radius:var(--radius);margin-bottom:6px;max-height:200px;object-fit:cover">`).join(''):''}
    <div class="flex-row" style="margin-bottom:12px;flex-wrap:wrap;gap:6px">
      <span class="tag t${r.cat[0]}">${r.cat}</span>
      ${r.group?`<span class="badge badge-blue">${r.group}</span>`:''}
      <span style="font-size:12px;color:var(--text2)"><i class="ti ti-clock"></i> ${fT(r.time)}</span>
      ${!guest?`<span class="pb ${pctClass(pct2)}">${pct2.toFixed(0)}% lucro</span>`:''}
    </div>

    <div class="view-layout">
      <div class="view-col-calc">
        ${calcSection}
        ${custoSection}
      </div>
      <div class="view-col-receita">
        ${ingredSection}
        ${panelaSection}
        ${preparoSection}
        ${formasSection}
        ${commentSection}
        ${shareBtn}
      </div>
    </div>`;
}

async function toggleShareFromView(id) {
  const idx=shareConfig.sharedIds.indexOf(id);
  if(idx>=0)shareConfig.sharedIds.splice(idx,1);else shareConfig.sharedIds.push(id);
  const shared=shareConfig.sharedIds.includes(id);
  const icon=document.getElementById('siv-'+id);const txt=document.getElementById('svt-'+id);
  if(icon)icon.className='ti ti-'+(shared?'share-3':'share');
  if(txt)txt.textContent=shared?'Remover do compartilhamento':'Marcar para compartilhar';
  toast(shared?'Marcada para compartilhar!':'Removida');
  renderHome();renderRecipes();
  await saveConfigToCloud();
}

// ═══════ SHARE PAGE ═══════
function renderSharePage() {
  document.getElementById('page-share').innerHTML = `
    <div style="background:linear-gradient(135deg,#2C2416,#4A3A1A);border-radius:var(--radius);padding:18px 16px;margin-bottom:14px;color:#fff;position:relative;overflow:hidden">
      <div style="font-size:11px;letter-spacing:.2em;color:#B8972A;font-weight:700;text-transform:uppercase;margin-bottom:4px">Sucrée Confeitaria</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:4px">🎂 Cardápio de Pedidos</div>
      <div style="font-size:12px;color:#C8B89A;margin-bottom:14px">Envie o link para seus clientes</div>
      <div style="background:rgba(255,255,255,.1);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px;font-size:12px;color:#F5EDD0;word-break:break-all">herberthg99-prog.github.io/minhas-receitas/cardapio.html</div>
      <div style="display:flex;gap:8px">
        <button onclick="copiarLinkCardapio()" style="flex:1;padding:10px;background:#B8972A;color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px"><i class="ti ti-copy"></i> Copiar link</button>
        <button onclick="compartilharCardapioWhats()" style="flex:1;padding:10px;background:#25D366;color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px"><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>
      </div>
    </div>
    <div class="share-info-box"><i class="ti ti-info-circle" style="flex-shrink:0;margin-top:1px"></i> Marque receitas com o botão Compartilhar. Configure a senha do convidado abaixo.</div>
    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-user"></i> Senha do Convidado</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:10px">O convidado usa esta senha para acessar as receitas compartilhadas.</p>
      <div class="fg"><label>Nova senha</label><input type="password" id="sp1" placeholder="••••••"></div>
      <div class="fg" style="margin-bottom:0"><label>Confirmar</label><input type="password" id="sp2" placeholder="••••••"></div>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
        <button class="btnp" onclick="saveGuestPwd()"><i class="ti ti-check"></i> Salvar senha</button>
        <span id="pws" style="font-size:12px;color:var(--teal);display:none"><i class="ti ti-check"></i> Salva!</span>
        <span id="spws2" style="font-size:12px;color:var(--text3)">Verificar senha nas configurações</span>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-eye"></i> Receitas marcadas (${shareConfig.sharedIds.length})</div>
      ${shareConfig.sharedIds.length
        ?recipes.filter(r=>shareConfig.sharedIds.includes(r.id)).map(r=>`<div class="rci"><i class="ti ti-check" style="color:var(--teal)"></i><span class="tag t${r.cat[0]}">${r.cat}</span>${r.group?`<span style="font-size:11px;color:var(--text2)">[${r.group}]</span>`:''}<span>${r.name}</span></div>`).join('')
        :'<p style="font-size:13px;color:var(--text2)">Nenhuma marcada ainda.</p>'}
    </div>`;
}

// ═══════ INIT ═══════
async function loadPedidosFromCloud() {
  try {
    const uid=(USER_ID||'herberth_admin').trim();
    const res=await sb.from('pedidos_confeitaria').select('*').eq('user_id',uid).order('created_at',{ascending:false});
    if(res.error)throw res.error;
    const cloudPedidos=(res.data||[]).map(p=>({
      id:p.id,cliente:p.cliente,telefone:p.telefone,data:p.data,hora:p.hora,retira:p.retira,
      endereco:p.endereco,aro:p.aro,massa:p.massa,recheio1:p.recheio1,recheio2:p.recheio2,
      cobertura:p.cobertura,deco:p.deco,tema:p.tema,topo:p.topo,flores:p.flores,
      custoRealTopo:p.custo_real_topo ?? null, custoRealFlores:p.custo_real_flores ?? null,
      custoRealPapelaria:p.custo_real_papelaria ?? null, recheioRepetido:p.recheio_repetido || null,
      recheioExtraNome:p.recheio_extra_nome ?? null, recheioExtraQtd:p.recheio_extra_qtd ?? null, recheioExtraCusto:p.recheio_extra_custo ?? null,
      obsDeco:p.obs_deco,inspiPhoto:p.inspi_photo,fotoConfirmada:p.foto_confirmada,fotoPronto:p.foto_pronto,
      tipoCalda:p.tipo_calda,custoCakeboard:p.custo_cakeboard,custoCaixa:p.custo_caixa,custoMaoObra:p.custo_mao_obra,
      valorBolo:p.valor_bolo,valorTotal:p.valor_total,
      sinal:p.sinal,pagamento:p.pagamento,status:p.status||'pendente',origem:p.origem,
      createdAt:new Date(p.created_at).getTime()
    }));
    const deletedIds=(typeof getDeletedPedidoIds==='function')?getDeletedPedidoIds():(window._deletedPedidoIds||new Set());
    const cloudIds=new Set(cloudPedidos.map(p=>p.id));
    const localOnly=pedidos.filter(p=>!cloudIds.has(p.id)&&!deletedIds.has(p.id));
    pedidos=[...cloudPedidos.filter(p=>!deletedIds.has(p.id)),...localOnly];
    savePedidos();
  } catch(e){ console.log('Pedidos cloud error:',e.message); }
}

(async function(){
  let _w=0;
  while(typeof getCurrentRole==='undefined'&&_w<20){await new Promise(r=>setTimeout(r,100));_w++;}
  document.getElementById('loading-text').textContent='Conectando à nuvem...';
  if(typeof loadConfigFromCloud==='function') await loadConfigFromCloud();
  if(typeof loadEstoqueFromCloud==='function') await loadEstoqueFromCloud(); // preços (fonte única) entre dispositivos
  const ok=await loadFromCloud();
  await loadGruposEstruturaFromCloud(); // depende de "recipes" já carregado, para detectar grupos avulsos
  document.getElementById('loading-overlay').style.display='none';
  renderHome();renderRecipes();
  if(!ok)toast('Modo offline',3000);
  else if(recipes.length>0)toast(recipes.length+' receita(s) carregada(s)!');
  setInterval(async()=>{
    try{
      await loadFromCloud();
      if(typeof loadEstoqueFromCloud==='function')await loadEstoqueFromCloud();
      if(typeof loadPedidosFromCloud==='function')await loadPedidosFromCloud();
      const curPage=document.querySelector('.page.act')?.id;
      if(curPage==='page-home')renderHome();
      if(curPage==='page-receitas')renderRecipes();
      if(curPage==='page-estoque')renderEstoque();
      if(curPage==='page-confeitaria'&&typeof _renderConfeitariaUI==='function')_renderConfeitariaUI();
      setSyncStatus('ok','sincronizado ✓');
    }catch(e){console.log('Auto-sync error:',e.message);}
  },120000);
  if(typeof loadPedidosFromCloud==='function'){
    await loadPedidosFromCloud();
    if(typeof _renderConfeitariaUI==='function')_renderConfeitariaUI();
  }
})();


// ═══════════════════════════════════════════
// GERADOR DE DECORAÇÃO DE BOLO (IA)
// ═══════════════════════════════════════════
function renderDecoPage() {
  document.getElementById('page-deco').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-family:Georgia,serif;font-size:20px;color:#F5EDD8;margin-bottom:4px">✨ Gerador de Decoração</div>
      <div style="font-size:13px;color:var(--text2)">Preencha os dados do bolo e copie o prompt para o ChatGPT gerar 3 propostas de decoração para o seu cliente.</div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-cake"></i> Dados do bolo</div>
      <div class="fr">
        <div class="fg">
          <label>Aro do bolo</label>
          <select id="deco-aro" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit">
            <option value="10">Aro 10 (até 6 fatias)</option>
            <option value="15">Aro 15 (até 12 fatias)</option>
            <option value="20" selected>Aro 20 (até 20 fatias)</option>
            <option value="25">Aro 25 (até 30 fatias)</option>
            <option value="30">Aro 30 (até 40 fatias)</option>
          </select>
        </div>
        <div class="fg">
          <label>Cobertura</label>
          <select id="deco-cobertura" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit">
            <option value="chantininho espatulado">🍦 Chantininho</option>
            <option value="buttercream espatulado">🧁 Buttercream</option>
          </select>
        </div>
      </div>
      <div class="fg">
        <label>Tema do bolo</label>
        <input type="text" id="deco-tema" placeholder="Ex: Jardim encantado, Safari, Minimalista floral..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit">
      </div>
      <div class="fg">
        <label>Cores principais</label>
        <input type="text" id="deco-cores" placeholder="Ex: Rosa nude, dourado e branco..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit">
      </div>
      <div class="fg">
        <label>Ocasião / evento</label>
        <input type="text" id="deco-ocasiao" placeholder="Ex: Chá de bebê, aniversário 1 ano, casamento..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit">
      </div>
      <div class="fg" style="margin-bottom:0">
        <label>Observações extras (opcional)</label>
        <textarea id="deco-obs" placeholder="Ex: Cliente gosta de flores naturais, não quer muito dourado..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit;min-height:70px;resize:vertical"></textarea>
      </div>
    </div>

    <button class="btnp full" onclick="gerarPromptDeco()" style="margin-bottom:10px">
      <i class="ti ti-sparkles"></i> Gerar prompt para ChatGPT
    </button>

    <div id="deco-resultado" style="display:none">
      <div class="success-box" style="margin-bottom:12px">
        <i class="ti ti-check" style="flex-shrink:0"></i>
        Prompt gerado! Copie e cole no ChatGPT para receber 3 propostas de decoração.
      </div>
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:14px;margin-bottom:10px;font-size:12px;color:var(--text2);line-height:1.8;white-space:pre-wrap;border:1px solid var(--border)" id="deco-prompt-text"></div>
      <button class="deco-copy-btn" onclick="copiarPromptDeco()">
        <i class="ti ti-copy"></i> Copiar prompt
      </button>
      <button onclick="abrirChatGPT()" style="width:100%;margin-top:8px;padding:10px;background:#10a37f;color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
        <i class="ti ti-external-link"></i> Abrir ChatGPT
      </button>
    </div>
  `;
}

function gerarPromptDeco() {
  var aro      = document.getElementById('deco-aro').value;
  var cob      = document.getElementById('deco-cobertura').value;
  var tema     = document.getElementById('deco-tema').value.trim();
  var cores    = document.getElementById('deco-cores').value.trim();
  var ocasiao  = document.getElementById('deco-ocasiao').value.trim();
  var obs      = document.getElementById('deco-obs').value.trim();

  if (!tema) { toast('Informe o tema do bolo'); return; }
  if (!cores) { toast('Informe as cores'); return; }

  var prompt = 'PROJETO DE BOLO + PAPELARIA SCRAP\n\n';
  prompt += 'DADOS DO BOLO:\n';
  prompt += '• Tamanho: Aro ' + aro + '\n';
  prompt += '• Cobertura: ' + cob + '\n';
  prompt += '• Tema: ' + tema + '\n';
  prompt += '• Cores principais: ' + cores + '\n';
  if (ocasiao) prompt += '• Ocasião: ' + ocasiao + '\n';
  if (obs) prompt += '• Observações: ' + obs + '\n';
  prompt += '\nREGRAS OBRIGATÓRIAS:\n';
  prompt += '• Manter exatamente o formato e proporção do bolo informado (Aro ' + aro + ')\n';
  prompt += '• Manter acabamento em ' + cob + '\n';
  prompt += '• Não utilizar trabalhos complexos de bico\n';
  prompt += '• Utilizar corante quando for preciso\n';
  prompt += '• Priorizar papelaria scrap como elemento principal da decoração\n';
  prompt += '• Pode utilizar: papelaria personalizada, esferas comestíveis discretas, sprinkles, elementos decorativos relacionados ao tema\n';
  prompt += '\nOBJETIVO:\n';
  prompt += 'Crie 03 propostas DIFERENTES para apresentar ao cliente.\n';
  prompt += 'Cada proposta deve conter:\n';
  prompt += '1. Nome da proposta\n';
  prompt += '2. Paleta de cores sugerida\n';
  prompt += '3. Descrição completa da decoração\n';
  prompt += '4. Descrição do topo de bolo\n';
  prompt += '5. Descrição dos apliques laterais\n';
  prompt += '6. Sugestão de elementos extras\n';
  prompt += '7. Justificativa de venda para o cliente\n';
  prompt += '\nApós o cliente escolher uma opção:\n';
  prompt += '• Gerar imagem realista profissional do bolo\n';
  prompt += '• Criar arte gráfica da papelaria scrap pronta para impressão\n';
  prompt += '• Organizar os elementos em folha A4 para recorte\n';
  prompt += '• Informar medidas recomendadas de cada peça\n';

  document.getElementById('deco-prompt-text').textContent = prompt;
  document.getElementById('deco-resultado').style.display = 'block';
  document.getElementById('deco-resultado').scrollIntoView({ behavior: 'smooth' });
}

function copiarPromptDeco() {
  var txt = document.getElementById('deco-prompt-text').textContent;
  navigator.clipboard.writeText(txt).then(function() {
    toast('✅ Prompt copiado! Cole no ChatGPT.');
  }).catch(function() {
    var el = document.createElement('textarea');
    el.value = txt;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    toast('✅ Prompt copiado!');
  });
}

function abrirChatGPT() {
  window.open('https://chat.openai.com', '_blank');
}

// ═══════════════════════════════════════════
// CALCULADORA DE MASSA POR ARO
// ═══════════════════════════════════════════

// Receitas base (rendimento = 900g de massa crua)
var MASSAS_BASE = {
  paodelo: {
    nome: 'Pão de Ló Fofinha',
    emoji: '🍥',
    rendimento: 590,
    ingredientes: [
      { nome: 'Ovos inteiros',        qty: 160, unit: 'g'  },
      { nome: 'Açúcar refinado',      qty: 150, unit: 'g'  },
      { nome: 'Óleo',                 qty: 50,  unit: 'ml' },
      { nome: 'Pitada de sal',        qty: 1,   unit: 'g'  },
      { nome: 'Leite integral morno', qty: 110, unit: 'ml' },
      { nome: 'Farinha de trigo',     qty: 175, unit: 'g'  },
      { nome: 'Fermento químico',     qty: 10,  unit: 'g'  },
    ],
    obs: 'Forno 180°C por ~35 min. 2 formas de 15x5cm na receita base.'
  },
  branca: {
    nome: 'Massa Branca (Amanteigada)',
    emoji: '🍰',
    rendimento: 900,
    ingredientes: [
      { nome: 'Açúcar',                   qty: 200, unit: 'g' },
      { nome: 'Margarina',                qty: 200, unit: 'g' },
      { nome: 'Ovos',                     qty: 4,   unit: 'un' },
      { nome: 'Farinha de trigo s/ ferm.',qty: 200, unit: 'g' },
      { nome: 'Fermento em pó',           qty: 10,  unit: 'g' },
      { nome: 'Creme de leite',           qty: 100, unit: 'g' }
    ],
    obs: 'Pode acrescentar pasta ou essência de baunilha a gosto.'
  },
  chocolate: {
    nome: 'Massa Chocolate (Amanteigada)',
    emoji: '🍫',
    rendimento: 900,
    ingredientes: [
      { nome: 'Açúcar',                   qty: 200, unit: 'g' },
      { nome: 'Margarina',                qty: 200, unit: 'g' },
      { nome: 'Ovos',                     qty: 4,   unit: 'un' },
      { nome: 'Farinha de trigo s/ ferm.',qty: 180, unit: 'g' },
      { nome: 'Cacau em pó 100%',         qty: 30,  unit: 'g' },
      { nome: 'Chocolate em pó 50%',      qty: 20,  unit: 'g' },
      { nome: 'Fermento em pó',           qty: 10,  unit: 'g' },
      { nome: 'Creme de leite',           qty: 100, unit: 'g' }
    ],
    obs: ''
  }
};

// Multiplicador por aro (quantas receitas base de 900g)
// Multiplicadores Pão de Ló = mesmos do amanteigado (por área)
var ARO_MULTIPLICADOR_PAODELO = {
  10: 0.5, 15: 1.0, 20: 1.75, 25: 2.75, 30: 4.0
};
var ARO_MULTIPLICADOR = {
  10: 0.25,   // 1/4 da receita (1 ovo)
  15: 1,      // 1 receita
  18: 1.5,    // 1 e meia
  20: 1.5,    // 1 e meia
  25: 2.5,    // 2 e meia
  30: 3.5     // 3 e meia
};

// Massa necessária em gramas por aro
var ARO_MASSA_G = {
  10: 225,    // ~1/4 da receita
  15: 900,
  18: 1350,
  20: 1350,
  25: 2250,
  30: 3150
};
try {
  var savedAroMassa = JSON.parse(localStorage.getItem('mr_aro_massa_g') || 'null');
  if (savedAroMassa) ARO_MASSA_G = {...ARO_MASSA_G, ...savedAroMassa};
} catch(e) {}

function renderCalcMassa() {
  document.getElementById('page-calc').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-family:Georgia,serif;font-size:20px;color:#F5EDD8;margin-bottom:4px">⚖️ Calculadora de Massa</div>
      <div style="font-size:13px;color:var(--text2)">Selecione o tipo de massa e o aro do bolo para calcular os ingredientes.</div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="st"><i class="ti ti-cake"></i> Configuração</div>
      <div class="fr">
        <div class="fg">
          <label>Tipo de massa</label>
          <select id="calc-tipo" onchange="calcularMassa()"
            style="width:100%;padding:11px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit">
            <option value="branca">🍰 Massa Branca (Amanteigada)</option>
            <option value="chocolate">🍫 Massa Chocolate (Amanteigada)</option>
            <option value="paodelo">🍥 Pão de Ló Fofinha</option>
          </select>
        </div>
        <div class="fg">
          <label>Aro do bolo</label>
          <select id="calc-aro" onchange="calcularMassa()"
            style="width:100%;padding:11px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text);font-family:inherit">
            <option value="10">Aro 10 cm</option>
            <option value="15">Aro 15 cm</option>
            <option value="18">Aro 18 cm</option>
            <option value="20" selected>Aro 20 cm</option>
            <option value="25">Aro 25 cm</option>
            <option value="30">Aro 30 cm</option>
          </select>
        </div>
      </div>
    </div>

    <div id="calc-resultado"></div>

    <div class="card" style="margin-top:12px">
      <div class="st"><i class="ti ti-scale"></i> Peso de massa padrão por aro (g)</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.5">Usado na Ficha Técnica de Produção para calcular a massa total necessária e a divisão por forma.</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px">
        ${[10,15,20,25,30].map(aro => `
        <div><label style="display:block;font-size:10px;color:var(--text3);margin-bottom:3px;text-align:center">Aro ${aro}</label>
          <input type="number" value="${ARO_MASSA_G[aro]||''}" min="0" id="aro-massa-g-${aro}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:center;font-family:inherit;background:var(--surface);color:var(--text)" placeholder="g"></div>`).join('')}
      </div>
      <button class="btnp" style="width:100%;justify-content:center" onclick="salvarAroMassaG()"><i class="ti ti-device-floppy"></i> Salvar pesos por aro</button>
    </div>
  `;
  calcularMassa();
}

function salvarAroMassaG() {
  [10,15,20,25,30].forEach(function(aro){
    var el = document.getElementById('aro-massa-g-'+aro);
    if (el && el.value) ARO_MASSA_G[aro] = parseFloat(el.value)||0;
  });
  try { localStorage.setItem('mr_aro_massa_g', JSON.stringify(ARO_MASSA_G)); } catch(e) {}
  toast('Pesos por aro salvos! ✅');
}

function calcularMassa() {
  var tipo = document.getElementById('calc-tipo').value;
  var aro  = parseInt(document.getElementById('calc-aro').value);
  var massa = MASSAS_BASE[tipo];
  var mult  = (tipo === 'paodelo' ? ARO_MULTIPLICADOR_PAODELO : ARO_MULTIPLICADOR)[aro] || 1;
  var massaTotal = ARO_MASSA_G[aro] || 900;

  var ingrsHTML = massa.ingredientes.map(function(ig) {
    var qtd = ig.qty * mult;
    var unit = ig.unit;
    // Format nicely
    var qtdStr;
    if (unit === 'un') {
      qtdStr = qtd % 1 === 0 ? qtd.toFixed(0) : qtd.toFixed(1);
      if (qtd < 1) qtdStr = '1/4 (aproximado)';
      else if (qtd === 0.5) qtdStr = '½';
    } else {
      qtdStr = qtd % 1 === 0 ? qtd.toFixed(0) + 'g' : qtd.toFixed(0) + 'g';
    }
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid rgba(200,163,91,.15)">'
      + '<span style="font-size:14px;color:#F0E6CC">' + ig.nome + '</span>'
      + '<span style="font-size:16px;font-weight:800;color:#C8A35B;min-width:80px;text-align:right">' + qtdStr + ' ' + (unit !== 'g' ? unit : '') + '</span>'
      + '</div>';
  }).join('');

  var multDesc = mult === 0.25 ? '¼ de receita (1 ovo)' :
                 mult === 0.5  ? '½ receita' :
                 mult === 1    ? '1 receita inteira' :
                 mult === 1.5  ? '1½ receitas' :
                 mult === 2.5  ? '2½ receitas' :
                 mult === 3.5  ? '3½ receitas' : mult + 'x';

  document.getElementById('calc-resultado').innerHTML = `
    <div style="background:linear-gradient(160deg,#1E1408,#2A1C0A);border:1px solid rgba(200,163,91,.3);border-radius:12px;padding:16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-family:Georgia,serif;font-size:17px;font-weight:700;color:#F5EDD8">${massa.emoji} ${massa.nome}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">Para Aro ${aro} cm — ${multDesc}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:var(--text3)">Massa total</div>
          <div style="font-size:18px;font-weight:800;color:var(--gold)">${massaTotal}g</div>
        </div>
      </div>
      ${ingrsHTML}
      ${massa.obs ? '<div style="margin-top:10px;padding:8px 10px;background:rgba(200,163,91,.08);border-radius:7px;font-size:12px;color:var(--text2);font-style:italic">💡 '+massa.obs+'</div>' : ''}
    </div>

    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;font-size:12px;color:var(--text2)">
      <div style="font-weight:700;color:var(--text);margin-bottom:6px">📋 Referência de rendimento</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center">
        ${Object.keys(ARO_MULTIPLICADOR).map(function(a) {
          var m = ARO_MULTIPLICADOR[a];
          var mStr = m === 0.25 ? '¼' : m === 0.5 ? '½' : m === 1 ? '1' : m === 1.5 ? '1½' : m === 2.5 ? '2½' : m === 3.5 ? '3½' : m;
          var isActive = parseInt(a) === aro;
          return '<div style="background:'+(isActive?'var(--gold)':'rgba(255,255,255,.05)')+';border-radius:6px;padding:6px">'
            + '<div style="font-size:11px;font-weight:700;color:'+(isActive?'#fff':'var(--text2)')+'">Aro '+a+'</div>'
            + '<div style="font-size:13px;font-weight:800;color:'+(isActive?'#fff':'var(--gold)')+'">'+mStr+'x</div>'
            + '</div>';
        }).join('')}
      </div>
    </div>

    <button class="btnp full" onclick="imprimirCalcMassa('${tipo}', ${aro})">
      <i class="ti ti-printer"></i> Imprimir ficha de produção
    </button>
  `;
}

function imprimirCalcMassa(tipo, aro) {
  var massa = MASSAS_BASE[tipo];
  var mult  = (tipo === 'paodelo' ? ARO_MULTIPLICADOR_PAODELO : ARO_MULTIPLICADOR)[aro] || 1;
  var massaTotal = ARO_MASSA_G[aro] || 900;
  var multDesc = mult === 0.25 ? '¼ de receita' : mult === 1 ? '1 receita' : mult + ' receitas';
  var win = window.open('', '_blank');
  if (!win) { toast('Permita pop-ups'); return; }
  var ingrsH = massa.ingredientes.map(function(ig) {
    var qtd = ig.qty * mult;
    var qtdStr = ig.unit === 'un' ? (qtd < 1 ? '1' : qtd.toFixed(qtd%1?1:0)) : qtd.toFixed(0) + 'g';
    return '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:15px">' + ig.nome + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:16px;font-weight:700;color:#C8A35B;text-align:right">' + qtdStr + '</td></tr>';
  }).join('');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ficha de Produção</title>'
    + '<style>body{font-family:sans-serif;padding:20px;max-width:400px;margin:0 auto}'
    + 'h1{font-size:20px;color:#2C1800}h2{font-size:14px;color:#C8A35B;font-weight:400}'
    + 'table{width:100%;border-collapse:collapse}.ftr{text-align:center;color:#aaa;font-size:11px;margin-top:20px}'
    + '@media print{body{padding:0}}</style></head><body>'
    + '<div style="text-align:center;margin-bottom:16px">'
    + '<img src="https://herberthg99-prog.github.io/minhas-receitas/logo.png" style="height:60px">'
    + '<h1>' + massa.emoji + ' ' + massa.nome + '</h1>'
    + '<h2>Aro ' + aro + ' cm &nbsp;·&nbsp; ' + multDesc + ' &nbsp;·&nbsp; ' + massaTotal + 'g total</h2></div>'
    + '<table>' + ingrsH + '</table>'
    + (massa.obs ? '<p style="font-size:12px;color:#666;font-style:italic;margin-top:10px">💡 ' + massa.obs + '</p>' : '')
    + '<div class="ftr">Sucrée Confeitaria · ' + new Date().toLocaleDateString("pt-BR") + '</div>'
    + '<script>window.onload=function(){window.print()}</' + 'script></body></html>');
  win.document.close();
}


// ═══════════════════════════════════════════
// PORTFÓLIO DE BOLOS
// ═══════════════════════════════════════════
function renderPortfolio() {
  var fotos = [];
  try { fotos = JSON.parse(localStorage.getItem('mr_portfolio') || '[]'); } catch(e) {}

  document.getElementById('page-portfolio').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-family:Georgia,serif;font-size:20px;color:#F5EDD8;margin-bottom:4px">📸 Portfólio Sucrée</div>
      <div style="font-size:13px;color:var(--text2)">Suas fotos de bolos para mostrar aos clientes.</div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btnp" style="flex:1;justify-content:center" onclick="document.getElementById('portfolio-input').click()">
        <i class="ti ti-camera-plus"></i> Adicionar foto
      </button>
      <a href="https://www.instagram.com/" target="_blank"
        style="flex:1;padding:12px;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none">
        <i class="ti ti-brand-instagram"></i> Instagram
      </a>
    </div>
    <input type="file" id="portfolio-input" accept="image/*" multiple style="display:none" onchange="addPortfolioFotos(event)">

    ${fotos.length === 0
      ? '<div class="est"><i class="ti ti-photo"></i><p>Nenhuma foto ainda.</p><p style="font-size:12px">Adicione fotos dos seus bolos para criar seu portfólio!</p></div>'
      : '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px" id="portfolio-grid">'
        + fotos.map(function(f, i) {
            return '<div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#2A1C0A">'
              + '<img src="' + f.src + '" style="width:100%;height:100%;object-fit:cover" onclick="verFotoPortfolio(' + i + ')">'
              + (f.titulo ? '<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.7));padding:8px;font-size:11px;font-weight:700;color:#fff">' + f.titulo + '</div>' : '')
              + '<button onclick="removerFotoPortfolio(' + i + ')" style="position:absolute;top:5px;right:5px;background:rgba(0,0,0,.6);border:none;color:#fff;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center"><i class="ti ti-x"></i></button>'
              + '</div>';
          }).join('')
        + '</div>'
    }
  `;
}

function addPortfolioFotos(e) {
  var files = Array.from(e.target.files);
  if (!files.length) return;
  var fotos = [];
  try { fotos = JSON.parse(localStorage.getItem('mr_portfolio') || '[]'); } catch(e2) {}
  var count = 0;
  files.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      fotos.push({ src: ev.target.result, titulo: '', data: new Date().toLocaleDateString('pt-BR') });
      count++;
      if (count === files.length) {
        localStorage.setItem('mr_portfolio', JSON.stringify(fotos));
        renderPortfolio();
        toast(files.length + ' foto(s) adicionada(s)!');
      }
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function removerFotoPortfolio(idx) {
  if (!confirm('Remover esta foto?')) return;
  var fotos = [];
  try { fotos = JSON.parse(localStorage.getItem('mr_portfolio') || '[]'); } catch(e) {}
  fotos.splice(idx, 1);
  localStorage.setItem('mr_portfolio', JSON.stringify(fotos));
  renderPortfolio();
}

function verFotoPortfolio(idx) {
  var fotos = [];
  try { fotos = JSON.parse(localStorage.getItem('mr_portfolio') || '[]'); } catch(e) {}
  var f = fotos[idx];
  if (!f) return;
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column';
  overlay.onclick = function() { document.body.removeChild(overlay); };
  overlay.innerHTML = '<img src="' + f.src + '" style="max-width:95vw;max-height:85vh;object-fit:contain;border-radius:8px">'
    + (f.titulo ? '<div style="color:#fff;font-size:14px;margin-top:10px">' + f.titulo + '</div>' : '')
    + '<button onclick="this.parentElement.remove()" style="margin-top:14px;background:rgba(255,255,255,.2);border:none;color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;cursor:pointer">Fechar</button>';
  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════
// BLOCO DE RASCUNHO
// ═══════════════════════════════════════════
function getRascunhos() {
  try { return JSON.parse(localStorage.getItem('mr_rascunhos') || '[]'); } catch(e) { return []; }
}
function saveRascunhos(list) {
  localStorage.setItem('mr_rascunhos', JSON.stringify(list));
}

function renderRascunho() {
  var list = getRascunhos();
  document.getElementById('page-rascunho').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-family:Georgia,serif;font-size:20px;color:#F5EDD8">📝 Rascunhos</div>
        <div style="font-size:12px;color:var(--text2)">Anote enquanto testa, converta em receita depois.</div>
      </div>
      <button class="btnp" onclick="novoRascunho()" style="padding:10px 14px;font-size:13px">
        <i class="ti ti-plus"></i> Novo
      </button>
    </div>

    ${list.length === 0
      ? '<div class="est"><i class="ti ti-pencil"></i><p>Nenhum rascunho ainda.</p><p style="font-size:12px">Toque em "+ Novo" para começar a anotar sua receita em teste.</p></div>'
      : list.map(function(r, i) {
          var data = r.data ? new Date(r.data).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
          var preview = (r.notas||'').split('\n')[0].substring(0,60);
          return '<div style="background:linear-gradient(160deg,#1E1408,#2A1C0A);border:1px solid rgba(200,163,91,.22);border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer" onclick="abrirRascunho('+i+')">'
            + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:15px;font-weight:700;color:#F5EDD8;font-family:Georgia,serif;margin-bottom:4px">'+(r.nome||'Sem título')+'</div>'
            + (preview ? '<div style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+preview+'</div>' : '')
            + '<div style="font-size:10px;color:var(--text3);margin-top:6px">'+data+'</div>'
            + '</div>'
            + '<div style="display:flex;gap:6px;flex-shrink:0">'
            + '<button onclick="event.stopPropagation();converterEmReceita('+i+')" title="Converter em receita" style="background:rgba(15,110,86,.2);border:1px solid rgba(15,110,86,.4);color:var(--teal);border-radius:7px;padding:6px 8px;cursor:pointer;font-size:12px;font-family:inherit;display:flex;align-items:center;gap:4px"><i class="ti ti-arrow-right"></i> Receita</button>'
            + '<button onclick="event.stopPropagation();excluirRascunho('+i+')" style="background:none;border:none;color:#A32D2D;font-size:18px;cursor:pointer;padding:4px"><i class="ti ti-trash"></i></button>'
            + '</div></div></div>';
        }).join('')
    }
  `;
}

function novoRascunho() {
  var list = getRascunhos();
  var novo = {
    id: 'rasc_' + Date.now(),
    nome: 'Receita ' + new Date().toLocaleDateString('pt-BR'),
    data: new Date().toISOString(),
    cat: 'doce',
    notas: '',
    ingredientes: [],  // [{nome, qty, unit, obs}]
    versoes: []        // histórico de ajustes
  };
  list.unshift(novo);
  saveRascunhos(list);
  abrirRascunho(0);
}

function abrirRascunho(idx) {
  var list = getRascunhos();
  var r = list[idx];
  if (!r) return;

  document.getElementById('page-rascunho').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button onclick="renderRascunho()" style="background:none;border:none;color:var(--text2);font-size:22px;cursor:pointer;padding:4px"><i class="ti ti-arrow-left"></i></button>
      <input type="text" value="${r.nome||''}" placeholder="Nome da receita em teste..."
        onchange="atualizarRascunho(${idx},'nome',this.value)"
        style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;font-weight:700;background:var(--surface);color:var(--text);font-family:Georgia,serif">
      <select onchange="atualizarRascunho(${idx},'cat',this.value)"
        style="padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;background:var(--surface);color:var(--text);font-family:inherit">
        <option value="doce" ${r.cat==='doce'?'selected':''}>🍰 Doce</option>
        <option value="salgada" ${r.cat==='salgada'?'selected':''}>🥩 Salgada</option>
      </select>
    </div>

    <!-- INGREDIENTES EM TESTE -->
    <div style="background:var(--surface);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">
        ⚖️ Ingredientes testados
      </div>
      <div id="rasc-ingrs-${idx}">
        ${renderIngrsRascunho(r.ingredientes, idx)}
      </div>
      <button onclick="addIngrRascunho(${idx})"
        style="width:100%;margin-top:8px;padding:9px;border:1.5px dashed var(--border);border-radius:var(--radius-sm);background:none;color:var(--text2);font-size:13px;font-family:inherit;cursor:pointer">
        <i class="ti ti-plus"></i> Adicionar ingrediente
      </button>
    </div>

    <!-- ANOTAÇÕES LIVRES -->
    <div style="background:var(--surface);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">
        📋 Anotações e observações
      </div>
      <textarea
        placeholder="Anote tudo aqui: temperatura do forno, tempo, ajustes que fez, o que funcionou, o que mudou..."
        onchange="atualizarRascunho(${idx},'notas',this.value)"
        style="width:100%;min-height:160px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--bg);color:var(--text);font-family:inherit;resize:vertical;line-height:1.7"
      >${r.notas||''}</textarea>
    </div>

    <!-- HISTÓRICO DE VERSÕES -->
    <div style="background:var(--surface);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.05em">🕐 Histórico de ajustes</div>
        <button onclick="salvarVersao(${idx})" style="background:rgba(200,163,91,.15);border:1px solid rgba(200,163,91,.3);color:var(--gold);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer">
          <i class="ti ti-bookmark"></i> Salvar versão
        </button>
      </div>
      ${(r.versoes||[]).length === 0
        ? '<div style="font-size:12px;color:var(--text3)">Nenhuma versão salva. Toque em "Salvar versão" para guardar o estado atual antes de fazer ajustes.</div>'
        : (r.versoes||[]).slice().reverse().map(function(v,vi) {
            return '<div style="padding:8px 10px;border-bottom:0.5px solid rgba(200,163,91,.12);font-size:12px">'
              + '<div style="display:flex;align-items:center;justify-content:space-between">'
              + '<span style="font-weight:700;color:var(--text2)">v' + (r.versoes.length - vi) + ' — ' + new Date(v.data).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) + '</span>'
              + '<button onclick="restaurarVersao('+idx+','+vi+')" style="background:none;border:none;color:var(--blue);font-size:11px;cursor:pointer;font-family:inherit">Restaurar</button>'
              + '</div>'
              + (v.nota ? '<div style="color:var(--text3);margin-top:3px">'+v.nota+'</div>' : '')
              + '</div>';
          }).join('')
      }
    </div>

    <!-- CONVERTER EM RECEITA -->
    <button onclick="converterEmReceita(${idx})" class="btnp full" style="margin-bottom:10px">
      <i class="ti ti-arrow-right"></i> Converter em receita oficial
    </button>
    <button onclick="renderRascunho()" class="btns" style="width:100%;justify-content:center;font-size:13px">
      <i class="ti ti-arrow-left"></i> Voltar para rascunhos
    </button>
  `;
}

function renderIngrsRascunho(ingrs, idx) {
  if (!ingrs || !ingrs.length) return '<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">Nenhum ingrediente ainda</div>';
  var html = '';
  ingrs.forEach(function(ig, i) {
    html += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">';
    html += '<input type="text" value="' + (ig.nome||'') + '" placeholder="Ingrediente" data-idx="'+idx+'" data-i="'+i+'" data-campo="nome" onblur="atualizarIngrBlur(this)" style="flex:2;min-width:100px;padding:7px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;background:var(--bg);color:var(--text);font-family:inherit">';
    html += '<input type="number" value="' + (ig.qty||0) + '" placeholder="Qtd" data-idx="'+idx+'" data-i="'+i+'" data-campo="qty" onblur="atualizarIngrBlur(this)" style="width:70px;padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;background:var(--bg);color:var(--text);font-family:inherit;text-align:center">';
    html += '<input type="text" value="' + (ig.unit||'g') + '" placeholder="g/ml" data-idx="'+idx+'" data-i="'+i+'" data-campo="unit" onblur="atualizarIngrBlur(this)" style="width:50px;padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;background:var(--bg);color:var(--text);font-family:inherit;text-align:center">';
    html += '<input type="text" value="' + (ig.obs||'') + '" placeholder="Obs..." data-idx="'+idx+'" data-i="'+i+'" data-campo="obs" onblur="atualizarIngrBlur(this)" style="flex:2;min-width:80px;padding:7px 9px;border:1px dashed var(--border);border-radius:var(--radius-sm);font-size:11px;background:var(--bg);color:var(--text2);font-family:inherit;font-style:italic">';
    html += '<button onclick="remIngrRascunho(' + idx + ',' + i + ')" style="background:none;border:none;color:#A32D2D;font-size:18px;cursor:pointer;padding:2px"><i class="ti ti-trash"></i></button>';
    html += '</div>';
  });
  return html;
}

function atualizarIngrBlur(el) {
  var idx   = parseInt(el.dataset.idx);
  var i     = parseInt(el.dataset.i);
  var campo = el.dataset.campo;
  var val   = campo === 'qty' ? (parseFloat(el.value)||0) : el.value;
  atualizarIngr(idx, i, campo, val);
}


function addIngrRascunho(idx) {
  var list = getRascunhos();
  if (!list[idx].ingredientes) list[idx].ingredientes = [];
  list[idx].ingredientes.push({ nome:'', qty:0, unit:'g', obs:'' });
  saveRascunhos(list);
  var el = document.getElementById('rasc-ingrs-'+idx);
  if (el) el.innerHTML = renderIngrsRascunho(list[idx].ingredientes, idx);
}

function remIngrRascunho(idx, i) {
  var list = getRascunhos();
  list[idx].ingredientes.splice(i, 1);
  saveRascunhos(list);
  var el = document.getElementById('rasc-ingrs-'+idx);
  if (el) el.innerHTML = renderIngrsRascunho(list[idx].ingredientes, idx);
}

function atualizarIngr(idx, i, campo, val) {
  var list = getRascunhos();
  list[idx].ingredientes[i][campo] = val;
  saveRascunhos(list);
}

function atualizarRascunho(idx, campo, val) {
  var list = getRascunhos();
  list[idx][campo] = val;
  list[idx].data = new Date().toISOString();
  saveRascunhos(list);
}

function salvarVersao(idx) {
  var nota = prompt('Descreva o ajuste feito (opcional):') || '';
  var list = getRascunhos();
  if (!list[idx].versoes) list[idx].versoes = [];
  list[idx].versoes.push({
    data: new Date().toISOString(),
    nota: nota,
    ingredientes: JSON.parse(JSON.stringify(list[idx].ingredientes||[])),
    notas: list[idx].notas || ''
  });
  saveRascunhos(list);
  toast('✅ Versão salva!');
  abrirRascunho(idx);
}

function restaurarVersao(idx, vIdx) {
  if (!confirm('Restaurar esta versão? As informações atuais serão substituídas.')) return;
  var list = getRascunhos();
  var versoes = list[idx].versoes || [];
  var v = versoes[versoes.length - 1 - vIdx]; // reversed display
  if (!v) return;
  list[idx].ingredientes = JSON.parse(JSON.stringify(v.ingredientes||[]));
  list[idx].notas = v.notas || '';
  saveRascunhos(list);
  toast('✅ Versão restaurada!');
  abrirRascunho(idx);
}

function excluirRascunho(idx) {
  if (!confirm('Excluir este rascunho?')) return;
  var list = getRascunhos();
  list.splice(idx, 1);
  saveRascunhos(list);
  renderRascunho();
}

function converterEmReceita(idx) {
  var list = getRascunhos();
  var r = list[idx];
  if (!r) return;
  // Pre-fill the new recipe form with rascunho data
  cm('page-rascunho'); // not a modal, just navigate
  openNewRecipe(r.cat || 'doce', '', {
    name:     r.nome || '',
    preparo:  r.notas || '',
    time:     60,
    yield:    6,
    unit:     'porção',
    comment:  'Convertido do rascunho em ' + new Date().toLocaleDateString('pt-BR'),
    ingredients: (r.ingredientes||[]).filter(function(ig){ return ig.nome; }).map(function(ig){
      return { name: ig.nome, qty: ig.qty||0, unit: ig.unit||'g', price: 0, isBase: false, obs: ig.obs||'' };
    })
  });
  toast('📝 Rascunho carregado! Revise e salve como receita.');
}


// ═══ COMPARTILHAMENTO RÁPIDO DO CARDÁPIO ═══
function compartilharCardapioRapido() {
  // Get saved link config
  var horas = 12; // default
  var agora = Date.now();
  var expira = agora + (horas * 60 * 60 * 1000);
  var token = btoa(String(expira)).replace(/[^a-zA-Z0-9]/g,'').substring(0, 16);
  var base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  var link = base + 'cardapio.html?token=' + token + '&exp=' + expira;

  // Save token
  var tokens = [];
  try { tokens = JSON.parse(localStorage.getItem('mr_tokens_ativos') || '[]'); } catch(e) {}
  tokens = tokens.filter(function(t){ return t.exp > agora; });
  tokens.push({ token: token, exp: expira, horas: horas, criado: agora });
  localStorage.setItem('mr_tokens_ativos', JSON.stringify(tokens));

  var expDate = new Date(expira);
  var expFmt = expDate.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) + ' às ' + expDate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  var nl = '\n';
  var msg = '✨ *Sucrée Confeitaria*' + nl + nl
    + 'Olá! Fico muito feliz em atendê-la(o)! 💛' + nl + nl
    + 'Preparei um link exclusivo do nosso cardápio especialmente para você:' + nl + nl
    + '🎂 *Acesse aqui e monte o bolo dos seus sonhos:*' + nl
    + '👉 ' + link + nl + nl
    + '⏰ _Este link é válido por ' + horas + ' horas_ (até ' + expFmt + ')' + nl + nl
    + 'Escolha sua massa, recheios e cobertura com calma.' + nl
    + 'Estou à disposição para qualquer dúvida! 🥣' + nl + nl
    + '_Com carinho,_' + nl
    + '_Sucrée Confeitaria — feito com amor e dedicação_ 🎂';

  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// ═══════════════════════════════════════════
// 1. AGENDA VISUAL — CALENDÁRIO MENSAL
// ═══════════════════════════════════════════
function renderAgenda() {
  var hoje = new Date();
  var mesRef = window._agendaMes || { m: hoje.getMonth(), y: hoje.getFullYear() };
  window._agendaMes = mesRef;

  var primeiroDia = new Date(mesRef.y, mesRef.m, 1);
  var ultimoDia   = new Date(mesRef.y, mesRef.m + 1, 0);
  var nomeMes = primeiroDia.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});

  // Map pedidos by date
  var pedidosPorDia = {};
  (typeof pedidos !== 'undefined' ? pedidos : []).forEach(function(p) {
    if (!p.data) return;
    var d = p.data; // YYYY-MM-DD
    if (!pedidosPorDia[d]) pedidosPorDia[d] = [];
    pedidosPorDia[d].push(p);
  });

  // Build calendar grid
  var diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var grid = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">';
  diasSemana.forEach(function(d) {
    grid += '<div style="text-align:center;font-size:10px;font-weight:700;color:var(--text2);padding:4px">' + d + '</div>';
  });
  grid += '</div>';
  grid += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">';

  // Empty cells before first day
  var inicio = primeiroDia.getDay();
  for (var e = 0; e < inicio; e++) {
    grid += '<div style="min-height:52px"></div>';
  }

  // Day cells
  for (var dia = 1; dia <= ultimoDia.getDate(); dia++) {
    var dateStr = mesRef.y + '-' + String(mesRef.m+1).padStart(2,'0') + '-' + String(dia).padStart(2,'0');
    var pedsDia = pedidosPorDia[dateStr] || [];
    var isHoje = dia === hoje.getDate() && mesRef.m === hoje.getMonth() && mesRef.y === hoje.getFullYear();
    var temPed = pedsDia.length > 0;
    var urgente = pedsDia.some(function(p){ return p.status !== 'entregue' && p.status !== 'cancelado'; });

    grid += '<div onclick="verDiaAgenda(\'' + dateStr + '\')" style="min-height:52px;border-radius:8px;padding:4px;background:' +
      (isHoje ? 'rgba(200,163,91,.25)' : temPed ? 'rgba(30,20,8,.9)' : 'rgba(30,20,8,.5)') +
      ';border:1px solid ' + (isHoje ? 'var(--gold)' : temPed ? 'rgba(200,163,91,.3)' : 'rgba(200,163,91,.1)') +
      ';cursor:' + (temPed ? 'pointer' : 'default') + '">';
    grid += '<div style="font-size:12px;font-weight:' + (isHoje?'800':'600') + ';color:' + (isHoje?'var(--gold)':'var(--text2)') + ';margin-bottom:2px">' + dia + '</div>';
    if (temPed) {
      pedsDia.slice(0,2).forEach(function(p) {
        var cor = p.status==='entregue'?'#888': p.status==='producao'?'var(--gold)':p.status==='pronto'?'var(--blue)':'var(--teal)';
        grid += '<div style="font-size:9px;font-weight:700;color:' + cor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(0,0,0,.3);border-radius:3px;padding:1px 4px;margin-bottom:1px">' + (p.cliente||'?').split(' ')[0] + '</div>';
      });
      if (pedsDia.length > 2) grid += '<div style="font-size:9px;color:var(--text3)">+' + (pedsDia.length-2) + '</div>';
    }
    grid += '</div>';
  }
  grid += '</div>';

  document.getElementById('page-agenda').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <button onclick="mudarMesAgenda(-1)" style="background:none;border:none;color:var(--text2);font-size:22px;cursor:pointer;padding:4px"><i class="ti ti-chevron-left"></i></button>
      <div style="font-family:Georgia,serif;font-size:17px;font-weight:700;color:#F5EDD8;text-transform:capitalize">${nomeMes}</div>
      <button onclick="mudarMesAgenda(1)" style="background:none;border:none;color:var(--text2);font-size:22px;cursor:pointer;padding:4px"><i class="ti ti-chevron-right"></i></button>
    </div>

    <!-- Legenda -->
    <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-size:10px;color:var(--teal)">● Confirmado</span>
      <span style="font-size:10px;color:var(--gold)">● Produção</span>
      <span style="font-size:10px;color:var(--blue)">● Pronto</span>
      <span style="font-size:10px;color:#888">● Entregue</span>
    </div>

    ${grid}

    <!-- Pedidos do mês -->
    <div style="margin-top:14px">
      <div class="st"><i class="ti ti-list"></i> Pedidos do mês (${Object.values(pedidosPorDia).flat().length})</div>
      ${Object.keys(pedidosPorDia).sort().map(function(d) {
        var peds = pedidosPorDia[d];
        var dtFmt = new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});
        return '<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:4px;text-transform:capitalize">📅 ' + dtFmt + '</div>'
          + peds.map(function(p) {
              return '<div onclick="openEditPedido(\'' + p.id + '\')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface);border-radius:8px;margin-bottom:4px;cursor:pointer;border-left:3px solid var(--teal)">'
                + '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:#F5EDD8">' + (p.cliente||'?') + '</div>'
                + '<div style="font-size:11px;color:var(--text2)">Aro ' + (p.aro||'?') + ' · R$ ' + parseFloat(p.valorTotal||0).toFixed(2) + '</div></div>'
                + '<span class="status-badge sb-' + p.status + '" style="font-size:9px">' + p.status + '</span>'
                + '</div>';
            }).join('')
          + '</div>';
      }).join('') || '<div style="font-size:13px;color:var(--text3);text-align:center;padding:20px">Nenhum pedido este mês</div>'}
    </div>
  `;
}

function mudarMesAgenda(delta) {
  var ref = window._agendaMes || { m: new Date().getMonth(), y: new Date().getFullYear() };
  ref.m += delta;
  if (ref.m > 11) { ref.m = 0; ref.y++; }
  if (ref.m < 0)  { ref.m = 11; ref.y--; }
  window._agendaMes = ref;
  renderAgenda();
}

function verDiaAgenda(dateStr) {
  var pedsDia = (typeof pedidos !== 'undefined' ? pedidos : []).filter(function(p){ return p.data === dateStr; });
  if (!pedsDia.length) return;
  if (pedsDia.length === 1) { openEditPedido(pedsDia[0].id); return; }
  // Multiple — show list
  var dtFmt = new Date(dateStr+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  toast(pedsDia.length + ' pedidos em ' + dtFmt);
}


// ═══════════════════════════════════════════
// 2. LISTA DE COMPRAS AUTOMÁTICA
// ═══════════════════════════════════════════
function renderListaCompras() {
  var pedidosPendentes = (typeof pedidos !== 'undefined' ? pedidos : [])
    .filter(function(p){ return p.status !== 'entregue' && p.status !== 'cancelado'; })
    .sort(function(a,b){ return (a.data||'') < (b.data||'') ? -1 : 1; });

  document.getElementById('page-compras').innerHTML = `
    <div style="font-family:Georgia,serif;font-size:20px;color:#F5EDD8;margin-bottom:4px">🛒 Lista de Compras</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px">Selecione os pedidos e gere a lista de ingredientes automaticamente.</div>

    ${pedidosPendentes.length === 0
      ? '<div class="est"><i class="ti ti-shopping-cart"></i><p>Nenhum pedido ativo.</p></div>'
      : `<div class="card" style="margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="st" style="margin-bottom:0"><i class="ti ti-cake"></i> Pedidos ativos</div>
            <button onclick="selecionarTodosCompras()" class="btns" style="font-size:11px;padding:5px 10px">Todos</button>
          </div>
          ${pedidosPendentes.map(function(p) {
            var dtFmt = p.data ? new Date(p.data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—';
            return '<label style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;cursor:pointer">'
              + '<input type="checkbox" class="compra-check" data-id="'+p.id+'" style="width:18px;height:18px;accent-color:var(--gold)">'
              + '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:#F5EDD8">'+p.cliente+'</div>'
              + '<div style="font-size:11px;color:var(--text2)">'+dtFmt+' · Aro '+(p.aro||'?')+'</div></div>'
              + '<span style="font-size:12px;font-weight:700;color:var(--gold)">R$ '+parseFloat(p.valorTotal||0).toFixed(2)+'</span>'
              + '</label>';
          }).join('')}
        </div>
        <button class="btnp full" onclick="gerarListaCompras()" style="margin-bottom:12px">
          <i class="ti ti-list-check"></i> Gerar lista de ingredientes
        </button>`
    }
    <div id="lista-compras-resultado"></div>
  `;
}

function selecionarTodosCompras() {
  document.querySelectorAll('.compra-check').forEach(function(cb){ cb.checked = true; });
}

function gerarListaCompras() {
  var ids = [];
  document.querySelectorAll('.compra-check:checked').forEach(function(cb){ ids.push(cb.dataset.id); });
  if (!ids.length) { toast('Selecione pelo menos um pedido'); return; }

  var pedsSel = (typeof pedidos !== 'undefined' ? pedidos : []).filter(function(p){ return ids.includes(p.id); });

  // Aggregate ingredients from recipes
  var mapa = {}; // key: nome_unit → {nome, qty, unit}

  pedsSel.forEach(function(p) {
    // Find recipes for recheio1, recheio2
    [p.recheio1, p.recheio2].forEach(function(nomeRec) {
      if (!nomeRec) return;
      var rec = recipes.find(function(r){ return r.name === nomeRec; });
      if (!rec) return;
      (rec.ingredients||[]).forEach(function(ig) {
        if (!ig.name) return;
        var key = ig.name.toLowerCase() + '_' + (ig.unit||'g');
        if (!mapa[key]) mapa[key] = { nome: ig.name, qty: 0, unit: ig.unit||'g' };
        mapa[key].qty += parseFloat(ig.qty||0);
      });
    });
  });

  var itens = Object.values(mapa).sort(function(a,b){ return a.nome.localeCompare(b.nome,'pt-BR'); });

  // Also add operational items
  var extras = [
    { nome: 'Caixas para bolo', qty: pedsSel.length, unit: 'un' },
    { nome: 'Tábuas MDF', qty: pedsSel.length, unit: 'un' },
    { nome: 'Papel manteiga', qty: pedsSel.length * 2, unit: 'folhas' }
  ];

  var el = document.getElementById('lista-compras-resultado');
  if (!el) return;

  el.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-sm);padding:14px;margin-bottom:10px">
      <div class="st"><i class="ti ti-carrot"></i> Ingredientes (${pedsSel.length} pedido(s))</div>
      ${itens.length ? itens.map(function(ig) {
        var qtdFmt = ig.qty >= 1000 && ig.unit === 'g' ? (ig.qty/1000).toFixed(2).replace('.',',') + ' kg' :
                     ig.qty >= 1000 && ig.unit === 'ml' ? (ig.qty/1000).toFixed(2).replace('.',',') + ' L' :
                     ig.qty.toFixed(0) + ' ' + ig.unit;
        return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid rgba(200,163,91,.12);align-items:center">'
          + '<div style="display:flex;align-items:center;gap:8px">'
          + '<input type="checkbox" style="width:16px;height:16px;accent-color:var(--gold)">'
          + '<span style="font-size:14px;color:#F0E6CC">'+ig.nome+'</span></div>'
          + '<span style="font-size:14px;font-weight:700;color:var(--gold)">'+qtdFmt+'</span>'
          + '</div>';
      }).join('') : '<div style="font-size:12px;color:var(--text3)">Nenhum ingrediente mapeado. Cadastre os ingredientes nas receitas de recheios.</div>'}

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(200,163,91,.2)">
        <div class="st" style="font-size:10px"><i class="ti ti-package"></i> Materiais</div>
        ${extras.map(function(e) {
          return '<div style="display:flex;justify-content:space-between;padding:6px 0;align-items:center">'
            + '<div style="display:flex;align-items:center;gap:8px"><input type="checkbox" style="width:16px;height:16px;accent-color:var(--gold)"><span style="font-size:13px;color:var(--text2)">'+e.nome+'</span></div>'
            + '<span style="font-size:13px;font-weight:700;color:var(--text2)">'+e.qty+' '+e.unit+'</span>'
            + '</div>';
        }).join('')}
      </div>
    </div>
    <button onclick="imprimirListaCompras()" class="btnp full">
      <i class="ti ti-printer"></i> Imprimir lista
    </button>
  `;
  el.scrollIntoView({behavior:'smooth'});
}

function imprimirListaCompras() {
  var win = window.open('','_blank');
  if (!win) { toast('Permita pop-ups'); return; }
  var conteudo = document.getElementById('lista-compras-resultado').innerHTML;
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lista de Compras</title>'
    + '<style>body{font-family:sans-serif;padding:20px;max-width:400px}h1{font-size:18px}@media print{body{padding:0}}</style></head><body>'
    + '<h1>🛒 Lista de Compras — Sucrée</h1>'
    + '<p style="color:#666;font-size:12px">' + new Date().toLocaleDateString('pt-BR') + '</p>'
    + conteudo
    + '<script>window.onload=function(){window.print()}</' + 'script></body></html>');
  win.document.close();
}


// ═══════════════════════════════════════════
// 3. FICHA DE PRODUÇÃO SEMANAL
// ═══════════════════════════════════════════
function renderFichaProducao() {
  var hoje = new Date();
  var diaSemana = hoje.getDay();
  var segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  var domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);

  var toISO = function(d) { return d.toISOString().split('T')[0]; };
  var inicioSem = toISO(segunda);
  var fimSem    = toISO(domingo);

  var pedsSemana = (typeof pedidos !== 'undefined' ? pedidos : [])
    .filter(function(p){ return p.data >= inicioSem && p.data <= fimSem && p.status !== 'cancelado'; })
    .sort(function(a,b){ return a.data < b.data ? -1 : 1; });

  var diasNomes = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
  var diasFmt = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(segunda);
    d.setDate(segunda.getDate() + i);
    diasFmt.push({ iso: toISO(d), nome: diasNomes[i], num: d.getDate(), mes: d.toLocaleDateString('pt-BR',{month:'short'}) });
  }

  document.getElementById('page-ficha').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-family:Georgia,serif;font-size:20px;color:#F5EDD8">📋 Ficha Semanal</div>
        <div style="font-size:12px;color:var(--text2)">${segunda.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} a ${domingo.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
      </div>
      <button onclick="imprimirFichaProducao()" class="btnp" style="padding:10px 14px;font-size:13px">
        <i class="ti ti-printer"></i> Imprimir
      </button>
    </div>

    ${pedsSemana.length === 0
      ? '<div class="est"><i class="ti ti-calendar-off"></i><p>Nenhum pedido esta semana.</p></div>'
      : diasFmt.map(function(dia) {
          var pedsDia = pedsSemana.filter(function(p){ return p.data === dia.iso; });
          if (!pedsDia.length) return '';
          return '<div style="margin-bottom:14px">'
            + '<div style="font-size:12px;font-weight:800;color:var(--gold);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">'
            + '📅 ' + dia.nome + ', ' + dia.num + ' de ' + dia.mes + '</div>'
            + pedsDia.map(function(p) {
                var recheios = (p.recheios||[]).map(function(r){return r.nome;}).join(' + ') || p.recheio1 || '—';
                var statusCor = p.status==='entregue'?'#888':p.status==='pronto'?'var(--blue)':p.status==='producao'?'var(--gold)':'var(--teal)';
                return '<div style="background:var(--surface);border-radius:10px;padding:12px;margin-bottom:8px;border-left:4px solid '+statusCor+'">'
                  + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
                  + '<div><div style="font-size:15px;font-weight:700;color:#F5EDD8;font-family:Georgia,serif">'+p.cliente+'</div>'
                  + '<div style="font-size:11px;color:var(--text2)">'+p.hora+' · '+(p.retira?'Retira':'Entrega')+'</div></div>'
                  + '<span style="font-size:10px;font-weight:700;padding:3px 8px;background:'+statusCor+';color:#fff;border-radius:10px">'+p.status+'</span>'
                  + '</div>'
                  + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">'
                  + '<div><span style="color:var(--text3)">Aro</span> <strong style="color:#F5EDD8">'+p.aro+'cm</strong></div>'
                  + '<div><span style="color:var(--text3)">Massa</span> <strong style="color:#F5EDD8">'+(p.massaNome||'—')+'</strong></div>'
                  + '<div style="grid-column:1/-1"><span style="color:var(--text3)">Recheios</span> <strong style="color:#F5EDD8">'+recheios+'</strong></div>'
                  + '<div><span style="color:var(--text3)">Cobertura</span> <strong style="color:#F5EDD8">'+(p.coberturaNome||'—')+'</strong></div>'
                  + '<div><span style="color:var(--text3)">Total</span> <strong style="color:var(--gold)">R$ '+parseFloat(p.valorTotal||0).toFixed(2)+'</strong></div>'
                  + (p.tema ? '<div style="grid-column:1/-1"><span style="color:var(--text3)">Tema</span> <strong style="color:#F5EDD8">'+p.tema+'</strong></div>' : '')
                  + (p.obs ? '<div style="grid-column:1/-1;margin-top:4px;padding:6px 8px;background:rgba(200,163,91,.08);border-radius:6px;font-style:italic;color:var(--text2)">💬 '+p.obs+'</div>' : '')
                  + '</div></div>';
              }).join('')
            + '</div>';
        }).join('')
    }

    <div style="background:var(--surface);border-radius:var(--radius-sm);padding:12px;margin-top:4px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">📊 Resumo da semana</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
        <div><div style="font-size:10px;color:var(--text3)">Pedidos</div><div style="font-size:20px;font-weight:800;color:var(--gold)">${pedsSemana.length}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">Faturamento</div><div style="font-size:14px;font-weight:800;color:var(--teal)">R$ ${pedsSemana.reduce(function(a,p){return a+parseFloat(p.valorTotal||0);},0).toFixed(2)}</div></div>
        <div><div style="font-size:10px;color:var(--text3)">A entregar</div><div style="font-size:20px;font-weight:800;color:#F5EDD8">${pedsSemana.filter(function(p){return p.status!=='entregue';}).length}</div></div>
      </div>
    </div>
  `;
}

function imprimirFichaProducao() {
  var win = window.open('','_blank');
  if (!win) { toast('Permita pop-ups'); return; }
  var conteudo = document.getElementById('page-ficha').innerHTML;
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ficha de Produção</title>'
    + '<style>body{font-family:sans-serif;padding:20px;max-width:500px;color:#222}'
    + '.btnp,.btns,button{display:none!important}'
    + '@media print{body{padding:0}}</style></head><body>'
    + conteudo
    + '<script>window.onload=function(){window.print()}</' + 'script></body></html>');
  win.document.close();
}


// ═══════════════════════════════════════════
// PAINEL DE METAS — SONHO CLT → PJ
// ═══════════════════════════════════════════
function getMetas() {
  try { return JSON.parse(localStorage.getItem('mr_metas') || 'null'); } catch(e) { return null; }
}
function saveMetas(m) {
  localStorage.setItem('mr_metas', JSON.stringify(m));
}

function renderMetas() {
  var metas = getMetas() || {
    metaMensal: 5000,
    descricao: 'Renda líquida mensal após custos',
    historico: []
  };

  var hoje = new Date();
  var mes = hoje.getMonth();
  var ano = hoje.getFullYear();
  var nomeMes = hoje.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});

  // Calcular lucro real do mês atual (dos pedidos)
  var cfg = (typeof sucreeConfig !== 'undefined' && sucreeConfig.custos) ? sucreeConfig.custos : {};
  var pedidosMes = (typeof pedidos !== 'undefined' ? pedidos : []).filter(function(p) {
    if (!p.data || p.status === 'cancelado') return false;
    var d = new Date(p.data + 'T12:00:00');
    return d.getMonth() === mes && d.getFullYear() === ano;
  });

  var faturamento = pedidosMes.reduce(function(a,p){ return a + parseFloat(p.valorTotal||0); }, 0);
  var custoTotal  = pedidosMes.reduce(function(a,p){
    var aro = p.aro || 20;
    var op  = typeof calcCustoOperacional === 'function' ? calcCustoOperacional(aro) : 0;
    return a + op + parseFloat(p.custoEstimado||0);
  }, 0);
  var lucroMes    = faturamento - custoTotal;
  var meta        = metas.metaMensal || 5000;
  var pct         = meta > 0 ? Math.min((lucroMes / meta) * 100, 100) : 0;
  var falta       = Math.max(meta - lucroMes, 0);
  var lucroMedio  = pedidosMes.length ? (lucroMes / pedidosMes.length) : 0;
  var bolosNecessarios = lucroMedio > 0 ? Math.ceil(falta / lucroMedio) : '—';

  // Build histórico dos últimos 6 meses
  var historicoHTML = '';
  var maxLucro = 0;
  var historico6 = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(ano, mes - i, 1);
    var m2 = d.getMonth(), y2 = d.getFullYear();
    var pMes = (typeof pedidos !== 'undefined' ? pedidos : []).filter(function(p) {
      if (!p.data || p.status === 'cancelado') return false;
      var dd = new Date(p.data + 'T12:00:00');
      return dd.getMonth() === m2 && dd.getFullYear() === y2;
    });
    var fat2 = pMes.reduce(function(a,p){ return a+parseFloat(p.valorTotal||0); },0);
    var cust2 = pMes.reduce(function(a,p){
      var ar = p.aro||20;
      var op = typeof calcCustoOperacional==='function'?calcCustoOperacional(ar):0;
      return a+op+parseFloat(p.custoEstimado||0);
    },0);
    var luc2 = fat2 - cust2;
    if (luc2 > maxLucro) maxLucro = luc2;
    historico6.push({ mes: d.toLocaleDateString('pt-BR',{month:'short'}), ano: y2, lucro: luc2, fat: fat2, qtd: pMes.length });
  }
  maxLucro = Math.max(maxLucro, meta, 1);

  historicoHTML = historico6.map(function(h) {
    var barPct = Math.max((h.lucro / maxLucro) * 100, 0);
    var metaPct = (meta / maxLucro) * 100;
    var cor = h.lucro >= meta ? 'var(--teal)' : h.lucro > 0 ? 'var(--gold)' : 'rgba(200,163,91,.2)';
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">'
      + '<div style="font-size:10px;font-weight:700;color:' + cor + '">' + (h.lucro > 0 ? 'R$' + Math.round(h.lucro/1000) + 'k' : '—') + '</div>'
      + '<div style="width:100%;height:80px;background:rgba(255,255,255,.05);border-radius:6px;position:relative;overflow:hidden">'
      + '<div style="position:absolute;bottom:0;left:0;right:0;height:' + barPct + '%;background:' + cor + ';border-radius:4px;transition:height .3s"></div>'
      + '<div style="position:absolute;left:0;right:0;bottom:' + metaPct + '%;border-top:1px dashed rgba(200,163,91,.5)"></div>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--text3)">' + h.mes + '</div>'
      + '</div>';
  }).join('');

  document.getElementById('page-metas').innerHTML = `
    <div style="font-family:Georgia,serif;font-size:20px;color:#F5EDD8;margin-bottom:4px">🎯 Minha Meta</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:16px">Sua jornada do CLT para o PJ pelos bolos.</div>

    <!-- META PRINCIPAL -->
    <div style="background:linear-gradient(160deg,#1E1408,#2A1C0A);border:1px solid rgba(200,163,91,.35);border-radius:14px;padding:16px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <div style="font-size:10px;font-weight:700;color:#C8A35B;text-transform:uppercase;letter-spacing:.1em">🎯 Meta mensal</div>
          <div style="font-size:28px;font-weight:800;color:#C8A35B;margin-top:2px">R$ ${meta.toLocaleString('pt-BR')}</div>
          <div style="font-size:11px;color:var(--text3)">${metas.descricao||'Renda líquida após custos'}</div>
        </div>
        <button onclick="editarMeta()" style="background:rgba(200,163,91,.15);border:1px solid rgba(200,163,91,.3);color:var(--gold);border-radius:8px;padding:8px 12px;font-size:12px;font-family:inherit;cursor:pointer"><i class="ti ti-pencil"></i></button>
      </div>

      <!-- Barra de progresso -->
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:6px">
          <span>Lucro este mês</span>
          <span style="font-weight:700;color:${pct>=100?'var(--teal)':'var(--gold)'}">${pct.toFixed(0)}%</span>
        </div>
        <div style="height:14px;background:rgba(255,255,255,.08);border-radius:7px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--teal)':'linear-gradient(90deg,var(--gold),#E8C97A)'};border-radius:7px;transition:width .5s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:4px">
          <span>R$ 0</span>
          <span>R$ ${meta.toLocaleString('pt-BR')}</span>
        </div>
      </div>

      <!-- Números -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:9px;color:var(--text3);margin-bottom:3px">💰 Lucro</div>
          <div style="font-size:16px;font-weight:800;color:${lucroMes>=0?'var(--teal)':'#FF8080'}">${fR(lucroMes)}</div>
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:9px;color:var(--text3);margin-bottom:3px">⏳ Falta</div>
          <div style="font-size:16px;font-weight:800;color:${falta===0?'var(--teal)':'#C8A35B'}">${falta===0?'✅':fR(falta)}</div>
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:9px;color:var(--text3);margin-bottom:3px">🎂 Bolos</div>
          <div style="font-size:16px;font-weight:800;color:#F5EDD8">${pedidosMes.length}</div>
        </div>
      </div>
    </div>

    <!-- QUANTO FALTA -->
    ${falta > 0 ? `
    <div style="background:rgba(200,163,91,.08);border:1px solid rgba(200,163,91,.2);border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:#C8A35B;margin-bottom:8px">📊 O que falta para a meta?</div>
      <div style="font-size:13px;color:var(--text2);line-height:2">
        ${lucroMedio > 0 ? `Seu lucro médio por bolo este mês é <strong style="color:#F5EDD8">${fR(lucroMedio)}</strong>.<br>
        Você precisa vender mais <strong style="color:var(--gold)">${bolosNecessarios} bolo(s)</strong> para atingir sua meta.<br>` : ''}
        Faltam <strong style="color:var(--gold)">${fR(falta)}</strong> para os R$ ${meta.toLocaleString('pt-BR')}.
      </div>
    </div>` : `
    <div style="background:rgba(15,110,86,.15);border:1px solid rgba(15,110,86,.4);border-radius:12px;padding:14px;margin-bottom:14px;text-align:center">
      <div style="font-size:28px;margin-bottom:8px">🎉</div>
      <div style="font-size:16px;font-weight:700;color:var(--teal)">Meta atingida este mês!</div>
      <div style="font-size:13px;color:var(--text2);margin-top:4px">Parabéns! Você está construindo seu sonho! 🎂</div>
    </div>`}

    <!-- HISTÓRICO 6 MESES -->
    <div class="card" style="margin-bottom:14px">
      <div class="st"><i class="ti ti-chart-bar"></i> Evolução — últimos 6 meses</div>
      <div style="display:flex;gap:6px;align-items:flex-end;padding:8px 0">
        ${historicoHTML}
      </div>
      <div style="text-align:center;font-size:10px;color:var(--text3);margin-top:4px">
        — linha pontilhada = sua meta de R$ ${meta.toLocaleString('pt-BR')}
      </div>
    </div>

    <!-- MOTIVAÇÃO -->
    <div style="background:linear-gradient(135deg,rgba(200,163,91,.1),rgba(200,163,91,.05));border:1px solid rgba(200,163,91,.2);border-radius:12px;padding:16px;text-align:center;margin-bottom:14px">
      <div style="font-size:20px;margin-bottom:8px">💛</div>
      <div style="font-family:Georgia,serif;font-size:14px;color:#F5EDD8;line-height:1.8;font-style:italic">
        "Cada bolo que você faz é um passo para a sua liberdade.<br>Continue — você está construindo algo lindo!"
      </div>
      <div style="font-size:11px;color:#C8A35B;margin-top:8px">— Sucrée Confeitaria</div>
    </div>

    <button class="btns" style="width:100%;justify-content:center;font-size:13px" onclick="syncNow()">
      <i class="ti ti-refresh"></i> Atualizar dados
    </button>
  `;
}

function editarMeta() {
  var metas = getMetas() || { metaMensal: 5000, descricao: 'Renda líquida mensal após custos', historico: [] };
  var nova = prompt('Qual é a sua meta mensal de lucro líquido? (R$)', metas.metaMensal);
  if (nova === null) return;
  var valor = parseFloat(nova);
  if (isNaN(valor) || valor <= 0) { toast('Valor inválido'); return; }
  var desc = prompt('Descreva sua meta (opcional):', metas.descricao) || metas.descricao;
  metas.metaMensal = valor;
  metas.descricao  = desc;
  saveMetas(metas);
  toast('🎯 Meta atualizada!');
  renderMetas();
}

// ═══════════════════════════════════════════
// CONFIGURAÇÃO DO CARDÁPIO
// ═══════════════════════════════════════════
function getCardapioConfig() {
  var def = {
    massas: [
      {id:'fofinha',          nome:'Massa Fofinha',             icon:'☁️', desc:'Pão de ló — leve, suave e aerada', img:'massa-fofinha.jpg'},
      {id:'fofinha-chocolate',nome:'Massa Fofinha Chocolate',   icon:'🍫', desc:'Pão de ló de chocolate — leve e aerada', img:'massa-fofinha-chocolate.jpg'},
      {id:'classica',         nome:'Massa Clássica',            icon:'🧈', desc:'Amanteigada — macia, úmida e saborosa', img:'massa-classica.jpg'},
      {id:'classica-chocolate',nome:'Massa Clássica Chocolate', icon:'🍫🧈',desc:'Amanteigada de chocolate — encorpada', img:'massa-classica-chocolate.jpg'},
    ],
    recheios: [
      {nome:'Brigadeiro',               tipo:'trad', categoria:'Chocolates'},
      {nome:'Brigadeiro Branco',        tipo:'trad', categoria:'Chocolates'},
      {nome:'Chocolate',                tipo:'trad', categoria:'Chocolates'},
      {nome:'Chocolate Branco',         tipo:'trad', categoria:'Chocolates'},
      {nome:'Leite Ninho',              tipo:'trad', categoria:'Leites'},
      {nome:'Doce de Leite',            tipo:'trad', categoria:'Leites'},
      {nome:'Abacaxi',                  tipo:'trad', categoria:'Frutas'},
      {nome:'Maracujá',                 tipo:'trad', categoria:'Frutas'},
      {nome:'Coco',                     tipo:'trad', categoria:'Frutas'},
      {nome:'Ameixa',                   tipo:'trad', categoria:'Frutas'},
      {nome:'Morango Fresco',           tipo:'prem', categoria:'Frutas Nobres'},
      {nome:'Frutas Vermelhas',         tipo:'prem', categoria:'Frutas Nobres'},
      {nome:'Pistache',                 tipo:'prem', categoria:'Oleaginosas'},
      {nome:'Nozes',                    tipo:'prem', categoria:'Oleaginosas'},
      {nome:'Avelã',                    tipo:'prem', categoria:'Oleaginosas'},
      {nome:'Amêndoas',                 tipo:'prem', categoria:'Oleaginosas'},
      {nome:'Ferrero Rocher',           tipo:'prem', categoria:'Chocolates Gourmet'},
      {nome:'Trufa Belga',              tipo:'prem', categoria:'Chocolates Gourmet'},
      {nome:'Chocolate Belga',          tipo:'prem', categoria:'Chocolates Gourmet'},
      {nome:'Kinder Bueno',             tipo:'prem', categoria:'Chocolates Gourmet'},
      {nome:'Caramelo Salgado',         tipo:'prem', categoria:'Especiais'},
      {nome:'Doce de Leite Argentino',  tipo:'prem', categoria:'Especiais'},
      {nome:'Baunilha Bourbon',         tipo:'prem', categoria:'Especiais'},
    ],
    combinacoes: [
      {a:'Abacaxi', b:'Coco', destaque:false},
      {a:'Doce de Leite', b:'Ameixa', destaque:false},
      {a:'Brigadeiro', b:'Brigadeiro Branco', destaque:false},
      {a:'Leite Ninho', b:'Brigadeiro Branco', destaque:false},
      {a:'Chocolate', b:'Coco', destaque:false},
      {a:'Maracujá', b:'Chocolate Branco', destaque:false},
      {a:'Leite Ninho', b:'Morango Fresco', destaque:true, medalha:'🥇'},
      {a:'Pistache', b:'Morango Fresco', destaque:true, medalha:'🥈'},
      {a:'Pistache', b:'Frutas Vermelhas', destaque:true, medalha:'🏅'},
      {a:'Nozes', b:'Doce de Leite Argentino', destaque:true, medalha:'🥉'},
      {a:'Ferrero Rocher', b:'Chocolate Belga', destaque:true, medalha:'🏅'},
      {a:'Trufa Belga', b:'Caramelo Salgado', destaque:false},
      {a:'Avelã', b:'Chocolate Belga', destaque:false},
      {a:'Morango Fresco', b:'Chocolate Branco', destaque:false},
    ],
    coberturas: [
      {id:'chantininho',    nome:'Chantininho',           icon:'🍦', desc:'Cobertura espatulada suave', preco:0, img:'cobertura-chantininho.jpg'},
      {id:'buttercream',    nome:'Buttercream',           icon:'🧈', desc:'Cobertura firme e elegante', preco:50, img:'cobertura-buttercream.jpg'},
      {id:'ganache',        nome:'Ganache de Chocolate',  icon:'🍫', desc:'Cobertura de chocolate', preco:0},
    ],
    tamanhos: [
      {aro:10, fatias:'até 6 fatias'},
      {aro:15, fatias:'até 12 fatias'},
      {aro:20, fatias:'até 20 fatias'},
      {aro:25, fatias:'até 30 fatias'},
      {aro:30, fatias:'até 45 fatias'},
    ]
  };
  try {
    var saved = JSON.parse(localStorage.getItem('mr_cardapio_config') || 'null');
    var resultado = saved || def;
    if (saved && !saved.combinacoes) resultado.combinacoes = def.combinacoes;
    // cfg.recheios SEMPRE é derivado das receitas classificadas (grupo Recheios com
    // Tipo + Subgrupo preenchidos), nunca mais lido do array salvo manualmente — isso
    // elimina por completo a possibilidade de duplicidade entre "o que está classificado
    // na receita" e "o que está cadastrado aqui". Funções que dependem de cfg.recheios
    // (Combinações sugeridas, cardápio do cliente) sempre recebem a lista atualizada.
    resultado.recheios = (typeof getRecheiosCardapioDerivados === 'function') ? getRecheiosCardapioDerivados() : (saved ? saved.recheios : def.recheios);
    return resultado;
  } catch(e) { return def; }
}

// Gera a lista de recheios do cardápio a partir das receitas reais do grupo "Recheios"
// que já têm Tipo + Subgrupo preenchidos (Classificação do Recheio). Substitui por
// completo o antigo array editado manualmente em cfg.recheios.
function getRecheiosCardapioDerivados() {
  if (typeof recipes === 'undefined' || !recipes.length) return [];
  return recipes
    .filter(function(r){ return typeof isGrupoRecheio === 'function' ? isGrupoRecheio(r.group) : (r.group||'').trim().toLowerCase() === 'recheios'; })
    .filter(function(r){ return r.tipoCardapio && r.subgrupoCardapio; })
    .map(function(r){ return { nome: r.name, tipo: r.tipoCardapio, categoria: r.subgrupoCardapio }; })
    .sort(function(a,b){ return a.nome.localeCompare(b.nome, 'pt-BR'); });
}

function saveCardapioConfig(cfg) {
  localStorage.setItem('mr_cardapio_config', JSON.stringify(cfg));
  // Sync to Supabase
  try {
    sb.from('config').upsert({
      user_id: USER_ID,
      cardapio_config: JSON.stringify(cfg)
    }, { onConflict: 'user_id' }).then(function(){});
  } catch(e) {}
}

async function loadCardapioConfigFromCloud() {
  try {
    const { data } = await sb.from('config').select('cardapio_config').eq('user_id', USER_ID).limit(1);
    if (data && data.length && data[0].cardapio_config) {
      localStorage.setItem('mr_cardapio_config', data[0].cardapio_config);
    }
  } catch(e) { console.log('loadCardapioConfigFromCloud erro:', e.message); }
}

function renderCardapioConfig() {
  var cfg = getCardapioConfig();
  document.getElementById('page-cardapio-cfg').innerHTML = `
    <div style="font-family:Georgia,serif;font-size:20px;color:#F5EDD8;margin-bottom:4px">🍰 Configurar Cardápio</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:16px">Gerencie o que aparece para o seu cliente no cardápio.</div>

    <!-- MASSAS -->
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="st" style="margin-bottom:0"><i class="ti ti-bread"></i> Massas</div>
        <button onclick="addItemCardapio('massas')" class="btnp" style="padding:7px 12px;font-size:12px"><i class="ti ti-plus"></i> Adicionar</button>
      </div>
      ${cfg.massas.map(function(m,i) {
        var imgInfo = m.img ? ('📷 ' + m.img) : '🎭 sem foto (usando emoji)';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px">'
          + '<span style="font-size:22px">' + m.icon + '</span>'
          + '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:#F5EDD8">' + m.nome + '</div>'
          + '<div style="font-size:11px;color:var(--text2)">' + (m.desc||'') + '</div>'
          + '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + imgInfo + '</div></div>'
          + '<button onclick="editarItemCardapio(\'massas\',' + i + ')" style="background:none;border:none;color:var(--text2);font-size:16px;cursor:pointer"><i class="ti ti-pencil"></i></button>'
          + '<button onclick="removerItemCardapio(\'massas\',' + i + ')" style="background:none;border:none;color:#A32D2D;font-size:16px;cursor:pointer"><i class="ti ti-trash"></i></button>'
          + '</div>';
      }).join('')}
    </div>

    <!-- RECHEIOS -->
    <div class="card" style="margin-bottom:12px">
      ${(function(){
        // cfg.recheios já vem derivado das receitas classificadas (ver
        // getRecheiosCardapioDerivados) — esta função só monta o visual a partir dele.
        var pendentes = (typeof recipes !== 'undefined' ? recipes : [])
          .filter(function(r){ return typeof isGrupoRecheio === 'function' ? isGrupoRecheio(r.group) : (r.group||'').trim().toLowerCase() === 'recheios'; })
          .filter(function(r){ return !r.tipoCardapio || !r.subgrupoCardapio; });

        var porTipo = {trad:{}, prem:{}};
        cfg.recheios.forEach(function(r){
          var t = r.tipo || 'trad';
          var c = r.categoria || 'Outros';
          if (!porTipo[t][c]) porTipo[t][c] = [];
          porTipo[t][c].push(r);
        });

        function renderColuna(tipoKey, label, badgeClass) {
          var cats = porTipo[tipoKey];
          var catKeys = Object.keys(cats).sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });
          var totalNaColuna = catKeys.reduce(function(a,k){ return a + cats[k].length; }, 0);
          var corpo;
          if (!catKeys.length) {
            corpo = '<div class="rch-empty"><i class="ti ti-cherry"></i>Nenhum recheio ' + label.toLowerCase() + ' classificado ainda.</div>';
          } else {
            corpo = catKeys.map(function(catName){
              var itens = cats[catName].sort(function(a,b){ return a.nome.localeCompare(b.nome, 'pt-BR'); }).map(function(r){
                var receitaReal = (typeof recipes !== 'undefined' ? recipes : []).find(function(rec){ return rec.name === r.nome; });
                return '<div class="rch-card">'
                  + '<span class="rch-card-name">' + r.nome + '</span>'
                  + '<div class="rch-card-actions">'
                  + (receitaReal ? '<button class="rch-card-btn" onclick="openEdit(\'' + receitaReal.id + '\')" title="Editar receita"><i class="ti ti-pencil"></i></button>' : '')
                  + '</div></div>';
              }).join('');
              return '<div class="rch-group-label">' + catName + '</div>' + itens;
            }).join('');
          }
          return '<div class="rch-type-card">'
            + '<div class="rch-type-header">'
            + '<span class="rch-type-badge ' + badgeClass + '">' + label + '</span>'
            + '<span class="rch-type-count">' + totalNaColuna + ' recheio(s)</span>'
            + '</div>'
            + corpo
            + '</div>';
        }

        var pendentesHtml = pendentes.length ? (
          '<div style="margin-top:14px;background:rgba(212,162,74,.08);border:1px solid rgba(212,162,74,.3);border-radius:12px;padding:12px 14px">'
          + '<div style="font-size:11.5px;font-weight:700;color:var(--gold);margin-bottom:8px;display:flex;align-items:center;gap:6px"><i class="ti ti-alert-circle"></i> ' + pendentes.length + ' recheio(s) ainda sem classificação (não aparecem na vitrine)</div>'
          + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
          + pendentes.map(function(r){
              return '<span onclick="openEdit(\'' + r.id + '\')" style="cursor:pointer;font-size:12px;color:var(--text2);background:rgba(255,255,255,.05);border-radius:20px;padding:5px 12px" title="Classificar esta receita">' + r.name + '</span>';
            }).join('')
          + '</div></div>'
        ) : '';

        return '<div class="rch-section-header">'
          + '<div class="rch-section-title">'
          + '<div class="rch-section-icon"><i class="ti ti-cherry"></i></div>'
          + '<div>'
          + '<div class="rch-section-eyebrow">Recheios no cardápio</div>'
          + '<div class="rch-section-subtitle">' + cfg.recheios.length + ' recheio(s) classificado(s) — gerado automaticamente das receitas</div>'
          + '</div></div></div>'
          + '<div class="rch-cols">' + renderColuna('trad', 'Tradicional', 'trad') + renderColuna('prem', 'Premium', 'prem') + '</div>'
          + pendentesHtml;
      })()}
      <div style="font-size:11px;color:var(--text3);margin-top:14px;line-height:1.5"><i class="ti ti-info-circle"></i> Para adicionar um recheio novo na vitrine, cadastre a receita em Receitas (grupo Recheios) e preencha "Classificação do Recheio". Para remover da vitrine, apague o Tipo/Subgrupo na receita.</div>
    </div>

    <!-- COMBINAÇÕES DE RECHEIO -->
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="st" style="margin-bottom:0"><i class="ti ti-bulb"></i> Combinações sugeridas</div>
        <button onclick="addCombinacaoCardapio()" class="btnp" style="padding:7px 12px;font-size:12px"><i class="ti ti-plus"></i> Adicionar</button>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:14px">Quando o cliente escolher o recheio base, é perguntado se ele quer ajuda — se sim, vê os recheios sugeridos abaixo.</div>
      ${(function(){
        var porBase = {};
        (cfg.combinacoes||[]).forEach(function(c, i) {
          if (!porBase[c.a]) porBase[c.a] = [];
          porBase[c.a].push({ b: c.b, destaque: c.destaque, medalha: c.medalha, idx: i });
        });
        var bases = Object.keys(porBase);
        if (!bases.length) return '<div style="font-size:13px;color:var(--text2)">Nenhuma combinação cadastrada ainda.</div>';
        return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">' +
          bases.map(function(base) {
            var itens = porBase[base].map(function(it) {
              return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
                + '<span style="font-size:13px;color:#F5EDD8">' + (it.destaque ? (it.medalha||'⭐')+' ' : '') + it.b + '</span>'
                + '<button onclick="removerCombinacaoCardapio(' + it.idx + ')" style="background:none;border:none;color:#A32D2D;font-size:14px;cursor:pointer;padding:2px 6px"><i class="ti ti-trash"></i></button>'
                + '</div>';
            }).join('');
            return '<div style="background:var(--bg);border-radius:10px;padding:12px">'
              + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
              + '<div style="font-size:12px;font-weight:800;color:var(--gold);letter-spacing:.04em">' + base + '</div>'
              + '<button onclick="addCombinacaoCardapio(\'' + base.replace(/'/g,"\\'") + '\')" style="background:none;border:1px solid rgba(212,162,74,.4);border-radius:6px;color:var(--gold);font-size:13px;cursor:pointer;padding:2px 7px;line-height:1.4"><i class="ti ti-plus"></i></button>'
              + '</div>'
              + itens
              + '</div>';
          }).join('') +
        '</div>';
      })()}
    </div>

    <!-- COBERTURAS -->
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="st" style="margin-bottom:0"><i class="ti ti-droplet"></i> Coberturas</div>
        <button onclick="addItemCardapio('coberturas')" class="btnp" style="padding:7px 12px;font-size:12px"><i class="ti ti-plus"></i> Adicionar</button>
      </div>
      ${cfg.coberturas.map(function(cb,i) {
        var precoTxt = cb.preco ? ('+ R$ ' + parseFloat(cb.preco).toFixed(2).replace('.',',')) : 'Incluso';
        var imgInfo = cb.img ? ('📷 ' + cb.img) : '🎭 sem foto (usando emoji)';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px">'
          + '<span style="font-size:22px">' + cb.icon + '</span>'
          + '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:#F5EDD8">' + cb.nome + '</div>'
          + '<div style="font-size:11px;color:var(--text2)">' + (cb.desc||'') + ' · <b style="color:var(--gold)">' + precoTxt + '</b></div>'
          + '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + imgInfo + '</div></div>'
          + '<button onclick="editarItemCardapio(\'coberturas\',' + i + ')" style="background:none;border:none;color:var(--text2);font-size:16px;cursor:pointer"><i class="ti ti-pencil"></i></button>'
          + '<button onclick="removerItemCardapio(\'coberturas\',' + i + ')" style="background:none;border:none;color:#A32D2D;font-size:16px;cursor:pointer"><i class="ti ti-trash"></i></button>'
          + '</div>';
      }).join('')}
    </div>

    <!-- TAMANHOS -->
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="st" style="margin-bottom:0"><i class="ti ti-ruler"></i> Tamanhos de bolo</div>
        <button onclick="addItemCardapio('tamanhos')" class="btnp" style="padding:7px 12px;font-size:12px"><i class="ti ti-plus"></i> Adicionar</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
        ${cfg.tamanhos.map(function(t,i) {
          return '<div style="background:var(--bg);border-radius:8px;padding:8px;text-align:center;position:relative">'
            + '<div style="font-size:12px;font-weight:700;color:var(--gold)">Aro ' + t.aro + '</div>'
            + '<div style="font-size:10px;color:var(--text2)">' + t.fatias + '</div>'
            + '<button onclick="removerItemCardapio(\'tamanhos\',' + i + ')" style="position:absolute;top:2px;right:2px;background:none;border:none;color:#A32D2D;font-size:12px;cursor:pointer"><i class="ti ti-x"></i></button>'
            + '</div>';
        }).join('')}
      </div>
    </div>

    <button class="btnp full" onclick="salvarCardapioConfig()">
      <i class="ti ti-device-floppy"></i> Salvar e publicar no cardápio
    </button>
  `;
}

var _modalItemState = null; // { tipo, idx (null=novo), item }

function abrirModalItemCardapio(tipo, idx) {
  var cfg = getCardapioConfig();
  var item = (idx != null) ? cfg[tipo][idx] : {};
  _modalItemState = { tipo: tipo, idx: idx, item: item };

  var btnConfirmar = document.getElementById('modal-item-btn-confirmar');
  btnConfirmar.textContent = 'Salvar';
  btnConfirmar.onclick = salvarModalItemCardapio;

  var titulo = (idx != null ? 'Editar ' : 'Adicionar ') +
    (tipo === 'massas' ? 'massa' : tipo === 'coberturas' ? 'cobertura' : tipo === 'recheios' ? 'recheio' : 'tamanho');
  document.getElementById('modal-item-titulo').textContent = titulo;

  var campos = '';
  function field(label, id, value, placeholder, maxlen) {
    var maxAttr = maxlen ? (' maxlength="' + maxlen + '"') : '';
    return '<div style="margin-bottom:12px">'
      + '<label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">' + label + '</label>'
      + '<input id="' + id + '" type="text" value="' + (value||'').toString().replace(/"/g,'&quot;') + '" placeholder="' + (placeholder||'') + '"' + maxAttr + ' '
      + 'style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px">'
      + '</div>';
  }
  function selectField(label, id, options, selected) {
    var opts = options.map(function(o){
      return '<option value="' + o.value + '"' + (o.value === selected ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');
    return '<div style="margin-bottom:12px">'
      + '<label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">' + label + '</label>'
      + '<select id="' + id + '" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px">' + opts + '</select>'
      + '</div>';
  }

  if (tipo === 'tamanhos') {
    campos += field('Aro (cm)', 'mi-aro', item.aro, 'ex: 18');
    campos += field('Descrição de fatias', 'mi-fatias', item.fatias, 'ex: até 15 fatias');
  } else if (tipo === 'recheios') {
    // O nome do recheio vem de um SELECT com as receitas reais já cadastradas em
    // Receitas (grupo "Recheios") — não é mais texto livre. Isso evita o problema de
    // digitar um nome que não corresponde exatamente a nenhuma receita cadastrada
    // (ex: "Chocolate Meio Amargo" no cardápio quando a receita real se chama
    // "Brigadeiro Meio Amargo"), que fazia o custo no Detalhamento de Custo do pedido
    // vir zerado por não encontrar correspondência.
    var receitasRecheioObjs = (typeof recipes !== 'undefined' ? recipes : [])
      .filter(function(r){ return typeof isGrupoRecheio === 'function' ? isGrupoRecheio(r.group) : (r.group||'').trim().toLowerCase() === 'recheios'; })
      .sort(function(a,b){ return a.name.localeCompare(b.name, 'pt-BR'); });
    var receitasRecheio = receitasRecheioObjs.map(function(r){ return r.name; });
    var optsRecheio = [{value:'', label:'— Selecione a receita —'}].concat(
      receitasRecheio.map(function(n){ return {value:n, label:n}; })
    );
    campos += selectField('Receita do recheio', 'mi-nome', optsRecheio, item.nome || '');
    if (!receitasRecheio.length) {
      campos += '<div style="font-size:11px;color:#e74c3c;margin-bottom:8px;line-height:1.4">⚠️ Nenhuma receita cadastrada no grupo "Recheios" ainda. Cadastre a receita primeiro em Receitas → Nova receita.</div>';
    }

    // Tipo e Subgrupo deixaram de ser editáveis aqui — vêm direto do bloco "Classificação
    // do Recheio" cadastrado na própria receita (Receitas → editar receita → aba Dados).
    // Isso evita ter o mesmo dado guardado em dois lugares que podem ficar
    // desincronizados; aqui é só uma exibição de conferência.
    var recheioSelecionadoObj = receitasRecheioObjs.find(function(r){ return r.name === (item.nome || ''); });
    var tipoExibicao = recheioSelecionadoObj ? (recheioSelecionadoObj.tipoCardapio === 'prem' ? 'Premium' : 'Tradicional') : '—';
    var subgrupoExibicao = (recheioSelecionadoObj && recheioSelecionadoObj.subgrupoCardapio) ? recheioSelecionadoObj.subgrupoCardapio : 'Sem subgrupo';
    campos += '<div id="mi-recheio-classificacao-preview" style="margin-bottom:12px;background:rgba(255,255,255,.03);border:1px solid rgba(212,162,74,.2);border-radius:8px;padding:10px 12px">'
      + '<div style="font-size:11px;color:var(--text2);margin-bottom:6px">Classificação (definida na receita)</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<span style="font-size:12px;font-weight:700;color:var(--gold);background:rgba(212,162,74,.12);border-radius:20px;padding:4px 11px" id="mi-recheio-tipo-preview">' + tipoExibicao + '</span>'
      + '<span style="font-size:12px;font-weight:700;color:var(--text2);background:rgba(255,255,255,.06);border-radius:20px;padding:4px 11px" id="mi-recheio-subgrupo-preview">' + subgrupoExibicao + '</span>'
      + '</div>'
      + '<div style="font-size:10.5px;color:var(--text3);margin-top:6px">Para mudar, edite a receita em Receitas → "' + (item.nome || 'esta receita') + '" → Classificação do Recheio.</div>'
      + '</div>';
    campos += '<div style="font-size:11px;color:var(--text2);margin-bottom:8px;line-height:1.4">💡 O nome vem direto da receita cadastrada — assim o custo no Detalhamento de Custo do pedido sempre encontra a receita certa. Categoria e Tipo são só para organizar a vitrine do cardápio.</div>';

  } else {
    campos += field('Nome', 'mi-nome', item.nome, 'ex: Massa Fofinha');
    campos += field('Emoji (usado se não houver foto)', 'mi-icon', item.icon || '🎂', '', 4);
    campos += field('Descrição breve', 'mi-desc', item.desc, 'opcional');
    if (tipo === 'massas' || tipo === 'coberturas') {
      campos += field('Nome do arquivo de foto', 'mi-img', item.img, 'ex: massa-fofinha.jpg — deixe em branco para usar emoji');
    }
    if (tipo === 'coberturas') {
      campos += field('Valor adicional (R$)', 'mi-preco', item.preco || 0, '0 se incluso');
    }
  }
  document.getElementById('modal-item-campos').innerHTML = campos;
  var elIcon = document.getElementById('mi-icon');
  if (elIcon) {
    elIcon.addEventListener('input', function() {
      if (/\.(jpg|jpeg|png|webp|gif)$/i.test(elIcon.value.trim())) {
        var elImg = document.getElementById('mi-img');
        if (elImg && !elImg.value.trim()) {
          elImg.value = elIcon.value.trim();
          elIcon.value = '🎂';
          toast('⚠️ Movido para o campo de foto automaticamente');
        }
      }
    });
  }
  var elCategoriaSelect = document.getElementById('mi-categoria-select');
  if (elCategoriaSelect) {
    elCategoriaSelect.addEventListener('change', function() {
      var box = document.getElementById('mi-categoria-nova-box');
      if (box) box.style.display = (elCategoriaSelect.value === '__nova__') ? 'block' : 'none';
    });
  }
  // Quando o usuário troca a receita escolhida no select de recheio, atualiza a preview
  // de Tipo/Subgrupo em tempo real, lendo direto dos dados já carregados em `recipes`.
  if (tipo === 'recheios') {
    var elNomeRecheio = document.getElementById('mi-nome');
    if (elNomeRecheio) {
      elNomeRecheio.addEventListener('change', function() {
        var rec = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === elNomeRecheio.value; });
        var elTipoPreview = document.getElementById('mi-recheio-tipo-preview');
        var elSubgrupoPreview = document.getElementById('mi-recheio-subgrupo-preview');
        if (elTipoPreview) elTipoPreview.textContent = rec ? (rec.tipoCardapio === 'prem' ? 'Premium' : 'Tradicional') : '—';
        if (elSubgrupoPreview) elSubgrupoPreview.textContent = (rec && rec.subgrupoCardapio) ? rec.subgrupoCardapio : 'Sem subgrupo';
      });
    }
  }
  document.getElementById('modal-item-cardapio').style.display = 'flex';
}

function fecharModalItemCardapio() {
  document.getElementById('modal-item-cardapio').style.display = 'none';
  const modalContainer = document.getElementById('modal-item-container');
  if (modalContainer) modalContainer.style.maxWidth = '420px';
  _modalItemState = null;
}

function salvarModalItemCardapio() {
  if (!_modalItemState) return;
  var tipo = _modalItemState.tipo, idx = _modalItemState.idx, itemAntigo = _modalItemState.item;
  var cfg = getCardapioConfig();
  var g = function(id){ var el = document.getElementById(id); return el ? el.value : ''; };

  if (tipo === 'tamanhos') {
    var aro = parseInt(g('mi-aro'));
    if (!aro) { toast('⚠️ Informe um aro válido'); return; }
    var novoTamanho = { aro: aro, fatias: g('mi-fatias') || '—' };
    if (idx != null) cfg.tamanhos[idx] = novoTamanho; else cfg.tamanhos.push(novoTamanho);
    cfg.tamanhos.sort(function(a,b){ return a.aro - b.aro; });
  } else if (tipo === 'recheios') {
    var nome = g('mi-nome').trim() || itemAntigo.nome;
    if (!nome) { toast('⚠️ Selecione a receita do recheio'); return; }
    // Tipo e Categoria não são mais digitados aqui — vêm direto do bloco "Classificação
    // do Recheio" cadastrado na própria receita (campos tipoCardapio/subgrupoCardapio).
    // Isso garante uma única fonte de verdade: editar a receita já reflete aqui também.
    var recSelecionada = (typeof recipes !== 'undefined' ? recipes : []).find(function(r){ return r.name === nome; });
    var categoriaFinal = (recSelecionada && recSelecionada.subgrupoCardapio) ? recSelecionada.subgrupoCardapio : 'Outros';
    var tipoFinal = (recSelecionada && recSelecionada.tipoCardapio) ? recSelecionada.tipoCardapio : 'trad';
    var nomeAntigo = itemAntigo.nome;
    var novoRecheio = { nome: nome, tipo: tipoFinal, categoria: categoriaFinal };
    if (idx != null) {
      cfg.recheios[idx] = novoRecheio;
      if (nomeAntigo && nomeAntigo !== nome && cfg.combinacoes) {
        cfg.combinacoes.forEach(function(c) {
          if (c.a === nomeAntigo) c.a = nome;
          if (c.b === nomeAntigo) c.b = nome;
        });
      }
    } else {
      cfg.recheios.push(novoRecheio);
    }
  } else {
    var nome = g('mi-nome').trim() || itemAntigo.nome;
    if (!nome) { toast('⚠️ Informe o nome'); return; }
    var id = itemAntigo.id || nome.toLowerCase().replace(/[^a-z0-9]/g,'');
    var iconValue = (g('mi-icon')||'').trim();
    var imgValue = (tipo === 'massas' || tipo === 'coberturas') ? (g('mi-img')||'').trim() : '';
    // Proteção: se o campo emoji recebeu por engano um nome de arquivo de imagem, e o campo de foto está vazio, corrige automaticamente
    var pareceArquivoImagem = /\.(jpg|jpeg|png|webp|gif)$/i.test(iconValue);
    if (pareceArquivoImagem && !imgValue) {
      imgValue = iconValue;
      iconValue = '🎂';
      toast('⚠️ Nome de arquivo estava no campo errado — corrigido automaticamente');
    }
    var novoItem = { id: id, nome: nome, icon: iconValue || '🎂', desc: g('mi-desc')||'' };
    if (tipo === 'massas' || tipo === 'coberturas') {
      novoItem.img = imgValue;
    }
    if (tipo === 'coberturas') {
      novoItem.preco = parseFloat((g('mi-preco')||'0').replace(',','.')) || 0;
    }
    if (idx != null) cfg[tipo][idx] = novoItem; else cfg[tipo].push(novoItem);
  }

  saveCardapioConfig(cfg);
  toast('✅ Salvo com sucesso!');
  fecharModalItemCardapio();
  renderCardapioConfig();
}

function addItemCardapio(tipo) {
  abrirModalItemCardapio(tipo, null);
}

function editarItemCardapio(tipo, idx) {
  abrirModalItemCardapio(tipo, idx);
}

var _confirmCallback = null;

function abrirModalConfirmacao(mensagem, callback) {
  document.getElementById('modal-item-titulo').textContent = 'Confirmar';
  document.getElementById('modal-item-campos').innerHTML = '<p style="color:#F5EDD8;font-size:14px;line-height:1.6">' + mensagem + '</p>';
  document.getElementById('modal-item-btn-confirmar').textContent = 'Confirmar';
  document.getElementById('modal-item-btn-confirmar').onclick = function() {
    fecharModalItemCardapio();
    callback();
  };
  document.getElementById('modal-item-cardapio').style.display = 'flex';
}

function addCombinacaoCardapio(baseFixa) {
  var cfg = getCardapioConfig();
  var opts = cfg.recheios.map(function(r){ return '<option value="' + r.nome.replace(/"/g,'&quot;') + '">' + r.nome + '</option>'; }).join('');
  document.getElementById('modal-item-titulo').textContent = baseFixa ? ('Adicionar combinação para ' + baseFixa) : 'Adicionar combinação';
  var campoBase = baseFixa
    ? ('<div style="margin-bottom:12px"><label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">Recheio base</label>'
       + '<input type="text" value="' + baseFixa.replace(/"/g,'&quot;') + '" disabled style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--gold);background:#1a1208;color:#F5EDD8;font-family:inherit;font-size:14px">'
       + '<select id="mc-a" style="display:none"><option value="' + baseFixa.replace(/"/g,'&quot;') + '" selected>' + baseFixa + '</option></select></div>')
    : ('<div style="margin-bottom:12px"><label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">Recheio base (quem o cliente escolhe primeiro)</label>'
       + '<select id="mc-a" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px"><option value="">Selecione...</option>' + opts + '</select></div>');
  document.getElementById('modal-item-campos').innerHTML =
    campoBase
    + '<div style="margin-bottom:12px"><label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">Recheio sugerido (combina com o base)</label>'
    + '<select id="mc-b" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px"><option value="">Selecione...</option>' + opts + '</select></div>'
    + '<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">'
    + '<input type="checkbox" id="mc-bidirecional" checked style="width:18px;height:18px">'
    + '<label for="mc-bidirecional" style="font-size:13px;color:#F5EDD8">Também sugerir o caminho inverso (B → A)</label></div>'
    + '<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">'
    + '<input type="checkbox" id="mc-destaque" style="width:18px;height:18px">'
    + '<label for="mc-destaque" style="font-size:13px;color:#F5EDD8">Marcar como "mais vendida" (destaque com medalha)</label></div>'
    + '<div id="mc-medalha-wrap" style="display:none;margin-bottom:12px"><label style="display:block;font-size:12px;color:var(--text2);margin-bottom:5px">Medalha</label>'
    + '<select id="mc-medalha" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--gold);background:#0F0A05;color:#F5EDD8;font-family:inherit;font-size:14px">'
    + '<option value="🥇">🥇 Ouro</option><option value="🥈">🥈 Prata</option><option value="🥉">🥉 Bronze</option><option value="🏅">🏅 Medalha</option></select></div>';
  var elDestaque = document.getElementById('mc-destaque');
  elDestaque.addEventListener('change', function() {
    document.getElementById('mc-medalha-wrap').style.display = elDestaque.checked ? 'block' : 'none';
  });
  document.getElementById('modal-item-btn-confirmar').textContent = 'Adicionar';
  document.getElementById('modal-item-btn-confirmar').onclick = function() {
    var a = document.getElementById('mc-a').value;
    var b = document.getElementById('mc-b').value;
    if (!a || !b) { toast('⚠️ Selecione os dois recheios'); return; }
    if (a === b) { toast('⚠️ Selecione recheios diferentes'); return; }
    var destaque = document.getElementById('mc-destaque').checked;
    var medalha = destaque ? document.getElementById('mc-medalha').value : '';
    var bidirecional = document.getElementById('mc-bidirecional').checked;
    if (!cfg.combinacoes) cfg.combinacoes = [];
    cfg.combinacoes.push({ a: a, b: b, destaque: destaque, medalha: medalha });
    if (bidirecional) {
      cfg.combinacoes.push({ a: b, b: a, destaque: destaque, medalha: medalha });
    }
    saveCardapioConfig(cfg);
    toast('✅ Combinação adicionada!');
    fecharModalItemCardapio();
    renderCardapioConfig();
  };
  document.getElementById('modal-item-cardapio').style.display = 'flex';
}

function removerCombinacaoCardapio(idx) {
  var cfg = getCardapioConfig();
  var c = cfg.combinacoes[idx];
  abrirModalConfirmacao('Remover a combinação "' + c.a + ' + ' + c.b + '"?', function() {
    cfg.combinacoes.splice(idx, 1);
    saveCardapioConfig(cfg);
    renderCardapioConfig();
  });
}

function removerItemCardapio(tipo, idx) {
  var cfg = getCardapioConfig();
  var item = cfg[tipo][idx];
  abrirModalConfirmacao('Remover "' + (item.nome||'Aro '+item.aro) + '" do cardápio?', function() {
    var cfg2 = getCardapioConfig();
    if (tipo === 'recheios' && cfg2.combinacoes) {
      var antes = cfg2.combinacoes.length;
      cfg2.combinacoes = cfg2.combinacoes.filter(function(c) {
        return c.a !== item.nome && c.b !== item.nome;
      });
      if (cfg2.combinacoes.length < antes) {
        toast('⚠️ ' + (antes - cfg2.combinacoes.length) + ' combinação(ões) com este recheio também foram removidas');
      }
    }
    cfg2[tipo].splice(idx, 1);
    saveCardapioConfig(cfg2);
    renderCardapioConfig();
  });
}

function salvarCardapioConfig() {
  var cfg = getCardapioConfig();
  saveCardapioConfig(cfg);
  toast('✅ Cardápio atualizado! Seus clientes já veem as alterações.');
}

// Carrega as estatísticas reais (total de receitas/bolos/recheios) para exibir na tela
// de LOGIN, antes de qualquer autenticação. Usa só sb (anon key), consultando apenas as
// colunas necessárias para contagem — não expõe conteúdo de receitas antes do login.
async function carregarStatsLogin() {
  try {
    const { data, error } = await sb.from('receitas').select('"group"').eq('user_id', USER_ID);
    if (error || !data) return;
    const total = data.length;
    const bolos = data.filter(function(r){ return r.group === 'Bolos'; }).length;
    const recheios = data.filter(function(r){ return typeof isGrupoRecheio === 'function' ? isGrupoRecheio(r.group) : r.group === 'Recheios'; }).length;
    document.querySelectorAll('.login-stat-receitas').forEach(function(el){ el.textContent = '+' + total; });
    document.querySelectorAll('.login-stat-bolos').forEach(function(el){ el.textContent = '+' + bolos; });
    document.querySelectorAll('.login-stat-recheios').forEach(function(el){ el.textContent = '+' + recheios; });
  } catch(e) { /* mantém os números padrão do HTML se a consulta falhar */ }
}
carregarStatsLogin();
