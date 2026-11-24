/* Read protected summary records; private PDF URLs expire after five minutes. */
(function () {
  'use strict';
  const U = window.SY;
  const status = document.getElementById('reader-status');
  const title = document.getElementById('summary-title');
  const content = document.getElementById('markdown');
  const pdf = document.getElementById('pdf');
  const requestedId = new URLSearchParams(window.location.search).get('id');

  function error(message) {
    status.hidden = false;
    status.textContent = message;
    title.hidden = true;
    content.replaceChildren(U.emptyState('Materi belum tersedia.', 'Kembali ke daftar materi dan pilih ringkasan lain, atau coba lagi nanti.'));
    pdf.hidden = true;
  }

  async function showPdf(entry) {
    const result = await window.SYAuth.client.storage.from('summary-private').createSignedUrl(entry.pdf_path, 300);
    const signedUrl = result.data && (result.data.signedUrl || result.data.signedURL);
    if (result.error || !signedUrl) throw new Error('Tautan PDF belum dapat dibuat.');
    const target = new URL(signedUrl);
    const project = new URL(window.SIMPLEYN_CONFIG.supabaseUrl);
    if (target.origin !== project.origin || !['https:', 'http:'].includes(target.protocol)) throw new Error('Tautan PDF tidak valid.');
    const box = U.el('div', 'card');
    box.append(U.el('h2', '', entry.title));
    box.append(U.el('p', 'muted', 'Tautan ini khusus untuk akun yang memiliki akses dan berlaku selama lima menit.'));
    const link = U.el('a', 'btn btn-primary');
    link.href = target.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Buka PDF';
    box.append(link);
    pdf.replaceChildren(box);
    pdf.hidden = false;
  }

  async function start() {
    if (!/^[a-z0-9-]{1,80}$/.test(requestedId || '')) {
      error('Materi dengan ID tersebut tidak ditemukan.');
      return;
    }
    if (!window.SYAuth || !window.SYAuth.client) {
      error('Supabase belum dihubungkan oleh pengelola.');
      return;
    }
    const context = await window.SYAuth.requireAccess({});
    if (!context) return;
    const result = await window.SYAuth.client.rpc('read_summary', { summary_id: requestedId });
    if (result.error) throw new Error('Materi belum dapat dimuat. Coba lagi nanti.');
    const entry = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!entry) {
      error('Materi tidak tersedia atau kamu belum memiliki akses penuh. Minggu pertama dapat dibaca sebagai pratinjau.');
      return;
    }
    /* Query parameters select an ID only; payload paths come from the protected database. */
    title.textContent = entry.title;
    title.hidden = false;
    document.title = entry.title + ' — Simple.yn';
    document.getElementById('summary-meta').replaceChildren(
      U.el('span', 'chip', entry.course),
      U.el('span', 'chip', 'Minggu ' + entry.week),
      U.el('span', 'badge badge-sand', 'Diperbarui oleh tim kami · ' + U.formatDate(entry.updated_on))
    );
    status.hidden = true;
    if (entry.type === 'pdf') {
      await showPdf(entry);
    } else {
      window.SYMarkdown.render(content, entry.body_md || '');
    }
  }

  start().catch(function (failure) {
    error(failure.message || 'Materi belum dapat dimuat. Coba muat ulang halaman.');
  });
}());
