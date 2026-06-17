// version.js — Controle de versão e testes de regressão
// ⛔ ZONA CRÍTICA — NÃO EDITAR
// ═══════════════════════════════════════════

const APP_VERSION = '2.0.0';
const APP_BUILD   = new Date().toISOString().slice(0,10);

window.addEventListener('load', () => {
  const key = 'sucree_last_ok_version';
  try {
    const last = localStorage.getItem(key);
    if (last !== APP_VERSION) {
      console.log(`🎂 Sucrée v${APP_VERSION} (${APP_BUILD}) — nova versão detectada`);
      localStorage.setItem(key, APP_VERSION);
    }
  } catch(e) {}

  // Aguarda recipes carregar antes de rodar o checklist (até 10s)
  let _checkAttempts = 0;
  const _waitAndCheck = () => {
    _checkAttempts++;
    if (Array.isArray(window.recipes) || _checkAttempts >= 10) {
      _runChecklist();
    } else {
      setTimeout(_waitAndCheck, 1000);
    }
  };
  setTimeout(_waitAndCheck, 2000);
});

const _CHECKS = [
  { name: 'Supabase conectado', fn: () => ({ ok: typeof sb !== 'undefined' && sb !== null, msg: 'sb (Supabase client)' }) },
  { name: 'Estado global (recipes)', fn: () => { const ok = Array.isArray(recipes); return { ok, msg: ok ? `OK (${recipes.length} receitas)` : `recipes = ${typeof recipes}` }; } },
  { name: 'Funções de autenticação', fn: () => { const ok = typeof getCurrentRole === 'function' && typeof isLoggedIn === 'function' && typeof doLogin === 'function'; return { ok, msg: ok ? 'OK' : 'FALTANDO: getCurrentRole / isLoggedIn / doLogin' }; } },
  { name: 'Funções de receitas', fn: () => { const ok = typeof saveRecipe === 'function' && typeof viewRecipe === 'function' && typeof openEdit === 'function'; return { ok, msg: ok ? 'OK' : 'FALTANDO: saveRecipe / viewRecipe / openEdit' }; } },
  { name: 'Funções de pedidos', fn: () => { const ok = typeof savePedido === 'function' && typeof openNovoPedido === 'function' && typeof renderPedidosList === 'function'; return { ok, msg: ok ? 'OK' : 'FALTANDO: savePedido / openNovoPedido / renderPedidosList' }; } },
  { name: 'Funções de estoque', fn: () => { const ok = typeof renderEstoque === 'function' && typeof syncEstoqueFromRecipes === 'function'; return { ok, msg: ok ? 'OK' : 'FALTANDO: renderEstoque / syncEstoqueFromRecipes' }; } },
  { name: 'Navegação', fn: () => { const ok = typeof goPage === 'function' && typeof renderHome === 'function' && typeof renderRecipes === 'function';
