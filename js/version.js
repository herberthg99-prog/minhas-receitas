// version.js — Controle de versão e testes de regressão
// ⛔ ZONA CRÍTICA — NÃO EDITAR
// ═══════════════════════════════════════════
// Carregado por último. Registra versão e roda checklist.

const APP_VERSION = '2.0.0';
const APP_BUILD   = new Date().toISOString().slice(0,10);

// ─── Backup automático no localStorage ────────────────────────────────────────
window.addEventListener('load', () => {
  const key = 'sucree_last_ok_version';
  try {
    const last = localStorage.getItem(key);
    if (last !== APP_VERSION) {
      console.log(`🎂 Sucrée v${APP_VERSION} (${APP_BUILD}) — nova versão detectada`);
      localStorage.setItem(key, APP_VERSION);
    }
  } catch(e) {}

  // Rodar checklist 4 segundos após carregar (dá tempo do Supabase inicializar)
  setTimeout(_runChecklist, 4000);
});

// ─── Checklist de regressão ────────────────────────────────────────────────────
const _CHECKS = [
  {
    name: 'Supabase conectado',
    fn: () => ({ ok: typeof sb !== 'undefined' && sb !== null, msg: 'sb (Supabase client)' })
  },
  {
    name: 'Estado global (recipes)',
    fn: () => {
      const ok = Array.isArray(recipes);
      return { ok, msg: ok ? `OK (${recipes.length} receitas)` : `recipes = ${typeof recipes} (ainda carregando?)` };
    }
  },
  {
    name: 'Funções de autenticação',
    fn: () => {
      const ok = typeof getCurrentRole === 'function' && typeof isLoggedIn === 'function' && typeof doLogin === 'function';
      return { ok, msg: ok ? 'OK' : 'FALTANDO: getCurrentRole / isLoggedIn / doLogin' };
    }
  },
  {
    name: 'Funções de receitas',
    fn: () => {
      const ok = typeof saveRecipe === 'function' && typeof viewRecipe === 'function' && typeof openEdit === 'function';
      return { ok, msg: ok ? 'OK' : 'FALTANDO: saveRecipe / viewRecipe / openEdit' };
    }
  },
  {
    name: 'Funções de pedidos',
    fn: () => {
      const ok = typeof savePedido === 'function' && typeof openNovoPedido === 'function' && typeof renderPedidosList === 'function';
      return { ok, msg: ok ? 'OK' : 'FALTANDO: savePedido / openNovoPedido / renderPedidosList' };
    }
  },
  {
    name: 'Funções de estoque',
    fn: () => {
      const ok = typeof renderEstoque === 'function' && typeof syncEstoqueFromRecipes === 'function';
      return { ok, msg: ok ? 'OK' : 'FALTANDO: renderEstoque / syncEstoqueFromRecipes' };
    }
  },
  {
    name: 'Navegação',
    fn: () => {
      const ok = typeof goPage === 'function' && typeof renderHome === 'function' && typeof renderRecipes === 'function';
      return { ok, msg: ok ? 'OK' : 'FALTANDO: goPage / renderHome / renderRecipes' };
    }
  },
  {
    name: 'Cloud (Supabase funções)',
    fn: () => {
      const ok = typeof loadFromCloud === 'function' && typeof saveToCloud === 'function';
      return { ok, msg: ok ? 'OK' : 'FALTANDO: loadFromCloud / saveToCloud' };
    }
  },
  {
    name: 'WhatsApp notificação',
    fn: () => {
      const ok = typeof notificarWhatsApp === 'function';
      return { ok, msg: ok ? 'OK' : 'FALTANDO: notificarWhatsApp' };
    }
  },
  {
    name: 'Elementos HTML críticos',
    fn: () => {
      const ids = ['loading-overlay','login-overlay','toast','sync-dot'];
      const missing = ids.filter(id => !document.getElementById(id));
      return { ok: missing.length === 0, msg: missing.length ? `FALTANDO: ${missing.join(', ')}` : 'OK' };
    }
  },
];

function _runChecklist() {
  const results = _CHECKS.map(c => {
    try {
