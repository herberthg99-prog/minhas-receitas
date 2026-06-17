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

  // Rodar checklist 2 segundos após carregar (dá tempo do app inicializar)
  setTimeout(_runChecklist, 2000);
});

// ─── Checklist de regressão ────────────────────────────────────────────────────
// Cada teste retorna { ok: bool, msg: string }
const _CHECKS = [
  {
    name: 'Supabase conectado',
    fn: () => ({ ok: typeof sb !== 'undefined' && sb !== null, msg: 'sb (Supabase client)' })
  },
  {
    name: 'Estado global (recipes)',
    fn: () => ({ ok: Array.isArray(window.recipes !== undefined ? recipes : null), msg: `recipes = ${typeof recipes}` })
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
      const r = c.fn();
      return { name: c.name, ...r };
    } catch(e) {
      return { name: c.name, ok: false, msg: 'ERRO: ' + e.message };
    }
  });

  const failed = results.filter(r => !r.ok);
  const passed = results.filter(r => r.ok);

  if (failed.length === 0) {
    console.log(`✅ Sucrée v${APP_VERSION} — todos os ${passed.length} testes passaram`);
  } else {
    console.warn(`⚠️ Sucrée v${APP_VERSION} — ${failed.length} PROBLEMA(S) DETECTADO(S):`);
    failed.forEach(r => console.error(`  ❌ ${r.name}: ${r.msg}`));
    console.log(`  ✅ Passaram: ${passed.length}/${results.length}`);
  }

  // Salvar resultado no sessionStorage para o painel de testes
  sessionStorage.setItem('sucree_test_results', JSON.stringify({ version: APP_VERSION, results, ts: Date.now() }));
}

// ─── Painel de testes oculto ───────────────────────────────────────────────────
// Acessado pelo admin: digitar "teste" no console ou pressionar Ctrl+Shift+T
function mostrarPainelTestes() {
  const raw = sessionStorage.getItem('sucree_test_results');
  if (!raw) { alert('Rode os testes primeiro: _runChecklist()'); return; }
  const { version, results } = JSON.parse(raw);
  const failed = results.filter(r => !r.ok);
  const lines = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}: ${r.msg}`).join('\n');
  alert(`🎂 Sucrée v${version} — Checklist de Regressão\n\n${lines}\n\n${failed.length === 0 ? '🎉 TUDO OK!' : `⚠️ ${failed.length} problema(s)!`}`);
}

// Atalho de teclado Ctrl+Shift+T para abrir painel (só admin)
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'T') {
    if (typeof getCurrentRole === 'function' && getCurrentRole() === 'admin') {
      mostrarPainelTestes();
    }
  }
});

// Expor globalmente para uso no console
window.sucreeTeste = _runChecklist;
window.sucreePanel = mostrarPainelTestes;
window.APP_VERSION = APP_VERSION;
