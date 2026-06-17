// app-core.js v3 — Sucrée Confeitaria
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

// ═══════ UTILS ═══════
function genId() { return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fR(v) { return 'R$\u00a0' + parseFloat(v || 0).toFixed(2); }
function fT(m) { if (!m) return '—'; if (m < 60) return m + 'min'; const h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? r + 'min' : ''); }
function toast(msg, dur = 2400) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), dur); }
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
  document.getElementById('page-' + p).classList.add('act');
  const el = document.getElementById('nav-' + p);
  if (el) el.classList.add('act');
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
  const avg = tot ? recipes.reduce((a,r) => a + calcAt(r,1).luc, 0) / tot : 0;
  const shCount = shareConfig.sharedIds.length;
  const recentes = [...recipes].reverse().slice(0,5);
  const lucrativas = [...recipes].sort((a,b)=>calcAt(b,1).luc-calcAt(a,1).luc).slice(0,5);

  document.getElementById('page-home').innerHTML = `
    <!-- MÉTRICAS -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
      <div class="met"><div class="ml">📚 Total</div><div class="mv">${tot}</div></div>
      <div class="met"><div class="ml">🍰 Doces</div><div class="mv blue">${dc}</div></div>
      <div class="met"><div class="ml">🥩 Salgadas</div><div class="mv green">${sl}</div></div>
      <div class="met"><div class="ml">📈 Lucro médio</div><div class="mv coral" style="font-size:13px">${fR(avg)}</div></div>
    </div>

    <!-- AÇÕES RÁPIDAS -->
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btnp" style="flex:1;justify-content:center;font-size:13px" onclick="openNewChoice()">
        <i class="ti ti-plus"></i> Nova receita
      </button>
      <button class="btns" style="flex:1;justify-content:center;font-size:13px" onclick="goPage('receitas')">
        <i class="ti ti-book"></i> Ver receitas
      </button>
    </div>

    ${shCount ? `<div class="success-box" style="margin-bottom:14px"><i class="ti ti-share" style="flex-shrink:0"></i> ${shCount} receita(s) marcada(s) para compartilhar</div>` : ''}

    <!-- RECENTES -->
    <div class="st"><i class="ti ti-flame"></i> Adicionadas recentemente</div>
    ${recentes.length ? recentes.map(r => {
      const p = calcAt(r,1);
      const photo = r.photos && r.photos[0];
      return `<div onclick="viewRecipe('${r.id}')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(160deg,#1E1408,#2A1C0A);border:1px solid rgba(200,163,91,.2);border-radius:10px;margin-bottom:8px;cursor:pointer">
        <div style="width:44px;height:44px;border-radius:8px;overflow:hidden;background:#2A1C0A;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px">
          ${photo ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover">` : (r.cat==='doce'?'🍰':'🥩')}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:#F5EDD8;font-family:Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</div>
          <div style="display:flex;gap:5px;align-items:center;margin-top:3px">
            <span class="tag t${r.cat[0]}" style="font-size:9px">${r.cat}</span>
            ${r.group ? `<span class="badge badge-blue" style="font-size:9px">${r.group}</span>` : ''}
            <span style="font-size:11px;color:var(--text3)"><i class="ti ti-clock"></i> ${fT(r.time)}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:12px;font-weight:700;color:var(--teal)">+${fR(p.luc)}</div>
          <div style="font-size:10px;color:var(--text3)">lucro</div>
        </div>
      </div>`;
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
  document.getElementById('fc').value = val;
  ['all','doce','salgada'].forEach(function(k) {
    var btn = document.getElementById('cat-' + k);
    if (!btn) return;
    var active = (k === 'all' && val === '') || k === val;
    btn.style.borderColor = active ? 'var(--gold)' : 'var(--border)';
    btn.style.background  = active ? 'var(--gold)' : 'var(--bg)';
    btn.style.color       = active ? '#fff' : 'var(--text2)';
  });
  // Rebuild sub-abas
  buildSubAbas(val);
  // Reset grupo filter
  var selGrp = document.getElementById('fg2');
  if(selGrp) selGrp.value = '';
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
  var parts = ['<button class="sub-aba act" id="sub-all" onclick="setSubAba(\'\')">Todas</button>'];
  for (var j = 0; j < groups.length; j++) {
    var g = groups[j];
    var sid = g.replace(/[^a-zA-Z0-9]/g, '_');
    parts.push('<button class="sub-aba" id="sub-' + sid + '" onclick="setSubAba(\'' + g + '\')">'+g+'</button>');
  }
  container.innerHTML = parts.join('');
}
function setSubAba(grp) {
  document.querySelectorAll('.sub-aba').forEach(function(b){ b.classList.remove('act'); });
  var safeId = grp ? grp.replace(/[^a-zA-Z0-9]/g,'_') : 'all';
  var btn = document.getElementById('sub-' + safeId);
  if(btn) btn.classList.add('act');
  var selGrp = document.getElementById('fg2');
  if(selGrp) selGrp.value = grp;
  renderRecipes();
}
function renderRecipes() {
  var q   = (document.getElementById('si').value || '').toLowerCase();
  var cat = document.getElementById('fc').value;
  var grp = document.getElementById('fg2').value;
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

    // Ações: admin vê tudo, convidado só maximizar
    html += '<div class="rc-card-actions">';
    html += '<button class="rc-card-btn azul" onclick="viewRecipe(\'' + r.id + '\')" title="Ver"><i class="ti ti-eye"></i></button>';
    if (!guest) {
      html += '<button class="rc-card-btn verde" onclick="openEdit(\'' + r.id + '\')" title="Editar"><i class="ti ti-edit"></i></button>'
        + '<button class="rc-card-btn ' + (shared ? 'shared-on' : '') + '" onclick="toggleShare(\'' + r.id + '\',this)" title="Compartilhar"><i class="ti ti-' + (shared ? 'share-3' : 'share') + '"></i></button>';
    }
    html += '<button class="rc-card-btn ouro" onclick="viewRecipe(\'' + r.id + '\');setTimeout(toggleFullReceita,300)" title="Tela cheia"><i class="ti ti-maximize"></i></button>';
    if (!guest) {
      html += '<button class="rc-card-btn vermelho" onclick="delRecipe(\'' + r.id + '\')" title="Excluir"><i class="ti ti-trash"></i></button>';
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
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1200,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fotoB64 } },
          { type: 'text', text: `Leia esta foto de anotação/rascunho de receita culinária. Retorne APENAS JSON válido sem markdown:\n{"name":"string","time":minutos,"yield":porcoes,"unit":"porção","preparo":"passo a passo","ingredients":[{"name":"string","qty":numero,"unit":"g ou ml","price":0,"isBase":false}],"comment":"observações"}\nisBase=true apenas no ingrediente principal.` }
        ] }]
      })
    });
    const d = await r.json();
    const txt = (d.content || []).find(c => c.type === 'text')?.text || '';
    let parsed; try { parsed = JSON.parse(txt.replace(/```json|```/g, '').trim()); } catch { throw new Error('Foto não clara.'); }
    dot.className = 'ai-dot ok'; msg.textContent = 'Receita lida!';
    setTimeout(() => { cm('modal-choice'); openNewRecipe(cat, grp, parsed); }, 700);
  } catch (err) { dot.className = 'ai-dot err'; msg.textContent = 'Erro: ' + err.message; btn.disabled = false; }
}

// ═══════ EDIT FORM ═══════
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
  renderIngrTable(); renderFormas(); updateFormaToggle(); checkFormaTab(); st2(0);
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
  renderIngrTable(); renderFormas(); renderRecipePhotosGrid(); updateFormaToggle(); checkFormaTab(); st2(0);
  if(typeof updateGrupoSelects==='function') updateGrupoSelects();
  document.getElementById('modal-edit').style.display = 'flex';
}

function checkFormaTab() {
  const grp = document.getElementById('fgrp').value;
  document.getElementById('tab-forma').style.display = ['Bolos', 'Pães'].includes(grp) ? 'inline-block' : 'none';
}

function st2(n) {
  [0,1,2,3,4,5,6].forEach(i => { const el = document.getElementById('et'+i); if(el) el.style.display = i===n?'block':'none'; });
  document.querySelectorAll('.tb').forEach((t,i) => t.classList.toggle('act', i===n));
  if(n===3) updCosts();
}

function addIngr() { curIngr.push({ name: '', qty: 100, unit: 'g', price: 0, isBase: false }); renderIngrTable(); }
function remIngr(i) { curIngr.splice(i, 1); renderIngrTable(); }
function setBase(i) { curIngr.forEach((ig, j) => ig.isBase = (j === i)); renderIngrTable(); }

function renderIngrTable() {
  const tb = document.getElementById('ingr-body');
  if (!curIngr.length) { tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--text2);font-size:12px">Toque em "+ Adicionar"</td></tr>`; return; }
  tb.innerHTML = curIngr.map((ig, i) => {
    const sub = (parseFloat(ig.qty||0) * parseFloat(ig.price||0)).toFixed(2);
    return `<tr class="${ig.isBase ? 'ihl' : ''}">
      <td style="text-align:center"><input type="radio" name="bir" ${ig.isBase?'checked':''} onchange="setBase(${i})" style="accent-color:var(--blue);width:18px;height:18px"></td>
      <td>
        <input value="${ig.name}" placeholder="Nome" oninput="curIngr[${i}].name=this.value" style="margin-bottom:3px;color:var(--text)">
        <input value="${ig.obs||''}" placeholder="Obs: pode substituir por..." oninput="curIngr[${i}].obs=this.value" style="font-size:11px;color:var(--text2);border-color:var(--border);padding:3px 5px;font-style:italic">
      </td>
      <td><input type="number" value="${ig.qty}" min="0" step=".1" oninput="curIngr[${i}].qty=parseFloat(this.value)||0;renderIngrTable()"></td>
      <td><input value="${ig.unit}" placeholder="g" oninput="curIngr[${i}].unit=this.value"></td>
      <td><input type="number" value="${(parseFloat(ig.price||0)*1000).toFixed(2)}" min="0" step=".01" oninput="curIngr[${i}].price=(parseFloat(this.value)||0)/1000;renderIngrTable()"></td>
      <td style="text-align:right;color:var(--text2);font-size:11px;white-space:nowrap">${fR(sub)}</td>
      <td><button class="db" onclick="remIngr(${i})"><i class="ti ti-trash"></i></button></td>
    </tr>`;
  }).join('');
}

async function atualizarPrecos() {
  const names = curIngr.map(ig => ig.name).filter(n => n && !n.toLowerCase().includes('água'));
  if (!names.length) { toast('Adicione ingredientes primeiro'); return; }
  const btn = document.getElementById('btn-upd');
  const bar = document.getElementById('ai-preco-bar');
  const msg = document.getElementById('ai-preco-msg');
  btn.disabled = true; bar.style.display = 'flex'; msg.textContent = 'Buscando preços no ES...';
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
    const txt = (d.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
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
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content: `Para a receita "${nome||'receita'}", escreva 3 dicas curtas em português: variação, armazenamento, acompanhamento. Responda direto.` }] })
    });
    const d = await r.json();
    const txt = d.content?.find(c=>c.type==='text')?.text||'';
    const campo = document.getElementById('fcomment');
    campo.value = (campo.value?campo.value+'\n\n':'')+'\uD83D\uDCA1 '+txt;
  } catch(err) { toast('Erro: '+err.message); }
  finally { bar.style.display='none'; }
}

function addRecipePhoto(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => { curPhotos.push(ev.target.result); renderRecipePhotosGrid(); };
  reader.readAsDataURL(file); e.target.value='';
}
function remRecipePhoto(i) { curPhotos.splice(i,1); renderRecipePhotosGrid(); }
function renderRecipePhotosGrid() {
  document.getElementById('recipe-photos-grid').innerHTML = curPhotos.map((p,i)=>`<div class="photo-grid-item"><img src="${p}"><button class="photo-del" onclick="remRecipePhoto(${i})"><i class="ti ti-x" style="font-size:9px"></i></button></div>`).join('');
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
async function saveRecipe() {
  const name = document.getElementById('fn').value.trim();
  if(!name){toast('Informe o nome da receita');st2(0);return;}
  const data = {
    id: editId||genId(), name,
    cat: document.getElementById('fcat').value,
    group: document.getElementById('fgrp').value,
    unit: document.getElementById('funit').value,
    yield_qty: parseFloat(document.getElementById('fyld').value)||6,
    yield: parseFloat(document.getElementById('fyld').value)||6,
    time: parseFloat(document.getElementById('ftm').value)||60,
    margin: parseFloat(document.getElementById('fmrg').value)||100,
    extra: parseFloat(document.getElementById('fext').value)||0,
    preparo: document.getElementById('fprep').value,
    comment: document.getElementById('fcomment').value,
    ingredients: curIngr, photos: curPhotos,
    formas: curFormas, formasEnabled,
    shared: shareConfig.sharedIds.includes(editId||''),
    createdAt: Date.now()
  };
  if(editId){const idx=recipes.findIndex(r=>r.id===editId);recipes[idx]=data;}
  else recipes.unshift(data);
  rmap[data.id]=data;
  cm('modal-edit'); renderRecipes(); renderHome();
  await saveToCloud(data);
  toast('Receita salva na nuvem!');
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
  document.getElementById('modal-view').style.display='flex';
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

  // Custo (só admin vê)
  const custoSection = !guest ? `
    <div style="margin-bottom:14px;background:rgba(200,163,91,.08);border:1px solid rgba(200,163,91,.25);border-radius:10px;padding:12px">
      <div style="font-size:10px;font-weight:800;color:#C8A35B;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">💰 Custo & Precificação</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:rgba(255,255,255,.05);border-radius:7px;padding:9px;text-align:center"><div style="font-size:10px;color:rgba(200,163,91,.6);margin-bottom:2px">💸 Custo total</div><div style="font-size:16px;font-weight:800;color:#FF8080">${fR(p.cost)}</div></div>
        <div style="background:rgba(255,255,255,.05);border-radius:7px;padding:9px;text-align:center"><div style="font-size:10px;color:rgba(200,163,91,.6);margin-bottom:2px">🍽️ Por porção</div><div style="font-size:16px;font-weight:800;color:#FF8080">${fR(p.cost/Math.max(p.portions,.01))}</div></div>
        <div style="background:rgba(255,255,255,.05);border-radius:7px;padding:9px;text-align:center"><div style="font-size:10px;color:rgba(200,163,91,.6);margin-bottom:2px">💰 Preço venda</div><div style="font-size:16px;font-weight:800;color:#C8A35B">${fR(p.sale)}</div></div>
        <div style="background:rgba(255,255,255,.05);border-radius:7px;padding:9px;text-align:center"><div style="font-size:10px;color:rgba(200,163,91,.6);margin-bottom:2px">📈 Lucro</div><div style="font-size:16px;font-weight:800;color:#9FE1CB">${fR(p.luc)}</div></div>
      </div>
    </div>` : '';

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
      obsDeco:p.obs_deco,inspiPhoto:p.inspi_photo,valorBolo:p.valor_bolo,valorTotal:p.valor_total,
      sinal:p.sinal,pagamento:p.pagamento,status:p.status||'pendente',origem:p.origem,
      createdAt:new Date(p.created_at).getTime()
    }));
    const deletedIds=window._deletedPedidoIds||new Set();
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
  const ok=await loadFromCloud();
  document.getElementById('loading-overlay').style.display='none';
  renderHome();renderRecipes();
  if(!ok)toast('Modo offline',3000);
  else if(recipes.length>0)toast(recipes.length+' receita(s) carregada(s)!');
  setInterval(async()=>{
    try{
      await loadFromCloud();
      if(typeof loadPedidosFromCloud==='function')await loadPedidosFromCloud();
      const curPage=document.querySelector('.page.act')?.id;
      if(curPage==='page-home')renderHome();
      if(curPage==='page-receitas')renderRecipes();
      if(curPage==='page-confeitaria'&&typeof _renderConfeitariaUI==='function')_renderConfeitariaUI();
      setSyncStatus('ok','sincronizado ✓');
    }catch(e){console.log('Auto-sync error:',e.message);}
  },120000);
  if(typeof loadPedidosFromCloud==='function'){
    await loadPedidosFromCloud();
    if(typeof _renderConfeitariaUI==='function')_renderConfeitariaUI();
  }
})();
