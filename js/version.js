// version.js — Sucrée v2.0.0
const APP_VERSION = '2.0.0';
const APP_BUILD = new Date().toISOString().slice(0,10);

window.addEventListener('load', function() {
  var key = 'sucree_last_ok_version';
  try {
    if (localStorage.getItem(key) !== APP_VERSION) {
      console.log('Sucree v' + APP_VERSION + ' (' + APP_BUILD + ') — nova versao');
      localStorage.setItem(key, APP_VERSION);
    }
  } catch(e) {}
  var attempts = 0;
  function waitAndCheck() {
    attempts++;
    if (Array.isArray(window.recipes) || attempts >= 15) {
      runChecklist();
    } else {
      setTimeout(waitAndCheck, 1000);
    }
  }
  setTimeout(waitAndCheck, 2000);
});

var CHECKS = [
  { name: 'Supabase', fn: function() { return typeof sb !== 'undefined'; } },
  { name: 'Recipes array', fn: function() { return Array.isArray(recipes); } },
  { name: 'getCurrentRole', fn: function() { return typeof getCurrentRole === 'function'; } },
  { name: 'doLogin', fn: function() { return typeof doLogin === 'function'; } },
  { name: 'saveRecipe', fn: function() { return typeof saveRecipe === 'function'; } },
  { name: 'savePedido', fn: function() { return typeof savePedido === 'function'; } },
  { name: 'renderEstoque', fn: function() { return typeof renderEstoque === 'function'; } },
  { name: 'goPage', fn: function() { return typeof goPage === 'function'; } },
  { name: 'loadFromCloud', fn: function() { return typeof loadFromCloud === 'function'; } },
  { name: 'notificarWhatsApp', fn: function() { return typeof notificarWhatsApp === 'function'; } },
  { name: 'HTML loading-overlay', fn: function() { return !!document.getElementById('loading-overlay'); } },
];

function runChecklist() {
  var failed = [];
  var passed = 0;
  for (var i = 0; i < CHECKS.length; i++) {
    try {
      if (CHECKS[i].fn()) { passed++; }
      else { failed.push(CHECKS[i].name); }
    } catch(e) { failed.push(CHECKS[i].name + ' (erro)'); }
  }
  if (failed.length === 0) {
    console.log('Sucree v' + APP_VERSION + ' — todos os ' + passed + ' testes passaram');
  } else {
    console.warn('Sucree v' + APP_VERSION + ' — ' + failed.length + ' problema(s): ' + failed.join(', '));
    console.log('Passaram: ' + passed + '/' + CHECKS.length);
  }
  try { sessionStorage.setItem('sucree_tests', JSON.stringify({ v: APP_VERSION, failed: failed, passed: passed })); } catch(e) {}
}

function mostrarPainelTestes() {
  try {
    var raw = sessionStorage.getItem('sucree_tests');
    if (!raw) { alert('Rode primeiro: runChecklist()'); return; }
    var r = JSON.parse(raw);
    alert('Sucree v' + r.v + '\nPassaram: ' + r.passed + '/' + CHECKS.length + (r.failed.length ? '\nProblemas: ' + r.failed.join(', ') : '\nTUDO OK!'));
  } catch(e) { alert('Erro ao ler resultados'); }
}

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.shiftKey && e.key === 'T') {
    if (typeof getCurrentRole === 'function' && getCurrentRole() === 'admin') {
      mostrarPainelTestes();
    }
  }
});

window.sucreeTeste = runChecklist;
window.sucreePanel = mostrarPainelTestes;
window.APP_VERSION = APP_VERSION;
