/* Dashboard access status comes from the RLS-backed get_access function. */
(function () {
  'use strict';
  const U = window.SY;
  if (!window.SYAuth || !window.SYAuth.client) {
    const greeting = document.getElementById('dashboard-greeting');
    if (greeting) greeting.textContent = 'Supabase belum dihubungkan oleh pengelola.';
    return;
  }
  window.SYAuth.requireAccess({}).then(function (context) {
    if (!context) return;
    document.getElementById('dashboard-greeting').textContent = 'Halo, ' + context.username + '. Pilih alat yang ingin kamu pakai hari ini.';
    const isAdmin = context.access.role === 'admin';
    if (isAdmin) U.toast('Semua alat terbuka gratis untuk akun admin.');
    const tools = [
      { id: 'money', href: '/app/keuangan.html', plan: 'hemat' },
      { id: 'summaries', href: '/app/ringkasan.html', plan: 'plus' },
      { id: 'planner', href: '/app/planner.html', plan: 'hemat' }
    ];
    document.querySelectorAll('.tool-card').forEach(function (card) {
      const tool = tools.find(function (item) { return card.getAttribute('href') === item.href; });
      if (!tool) return;
      const allowed = isAdmin || context.access.tools[tool.id];
      const badge = U.el('span', 'badge ' + (allowed ? 'badge-green' : 'badge-sand'), allowed ? 'Aktif' : 'Belum aktif');
      if (allowed && isAdmin) badge.textContent = 'Aktif gratis untuk admin';
      card.querySelector('h2').insertAdjacentElement('afterend', badge);
      const action = card.querySelector('.tool-card-go');
      if (!allowed) {
        action.textContent = isAdmin ? 'Buka alat' : 'Lihat harga untuk membuka';
        card.href = '/harga.html?paket=' + tool.plan;
      }
    });
  });
}());
