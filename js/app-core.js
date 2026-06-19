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
