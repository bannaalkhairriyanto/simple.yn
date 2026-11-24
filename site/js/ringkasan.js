/* Summary library generated from the JSON course fields. */
(function () {
  'use strict';
  const U = window.SY;
  let summaries = [];
  const root = document.getElementById('courses');
  const search = document.getElementById('search');

  function folded(value) {
    return value.toLocaleLowerCase('id-ID').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function courseBlock(course, entries) {
    const block = U.el('section', 'course-block');
    block.setAttribute('aria-labelledby', 'course-' + course.slug);
    const title = U.el('h2', '', course.name);
    title.id = 'course-' + course.slug;
      const latest = entries.map(function (entry) { return entry.updated_on; }).sort().reverse()[0];
    const meta = U.add(U.el('div', 'course-meta'), U.icon('pen'), document.createTextNode('Diperbarui oleh tim kami · terakhir ' + U.formatDate(latest)));
    const grid = U.el('div', 'sum-grid');
    entries.forEach(function (entry) {
      const link = U.el('a', 'sum-card');
      link.href = '/app/baca.html?id=' + encodeURIComponent(entry.id);
      U.add(link,
        U.el('span', 'wk', 'Minggu ' + entry.week),
        U.el('b', '', entry.title),
        U.el('span', 'muted', 'Diperbarui ' + U.formatDate(entry.updated_on)),
        U.el('span', 'small', entry.type === 'pdf' ? 'Buka PDF' : 'Baca ringkasan')
      );
      grid.append(link);
    });
    U.add(block, title, meta, grid);
    return block;
  }

  function render() {
    const query = folded(search.value.trim().slice(0, 100));
    const grouped = [];
    summaries.forEach(function (entry) {
      const haystack = folded(entry.title + ' ' + entry.course + ' minggu ' + entry.week);
      if (query && !haystack.includes(query)) return;
      let group = grouped.find(function (item) { return folded(item.name) === folded(entry.course); });
      if (!group) {
        group = { name: entry.course, slug: U.uniqueId(), entries: [] };
        grouped.push(group);
      }
      group.entries.push(entry);
    });
    grouped.forEach(function (group) { group.entries.sort(function (a, b) { return a.week - b.week || a.id.localeCompare(b.id); }); });
    if (grouped.length === 0) {
      root.replaceChildren(U.emptyState('Tidak ada materi yang cocok.', 'Coba kata kunci lain atau hapus pencarian untuk melihat semua kursus.'));
    } else {
      root.replaceChildren(...grouped.map(function (group) { return courseBlock(group, group.entries); }));
    }
  }

  search.addEventListener('input', render);
  document.getElementById('clear-search').addEventListener('click', function () {
    search.value = '';
    render();
    search.focus();
  });

  if (!window.SYAuth || !window.SYAuth.client) {
    root.replaceChildren(U.emptyState('Supabase belum dihubungkan.', 'Pengelola perlu mengisi konfigurasi proyek agar materi dapat dimuat.'));
    return;
  }
  window.SYAuth.requireAccess({}).then(async function (context) {
    if (!context) return;
    const result = await window.SYAuth.client.from('summary_metadata').select('id,course,week,title,type,updated_on').order('course').order('week');
    if (result.error) throw new Error('Daftar materi belum dapat dibaca dari database.');
    summaries = result.data;
    if (!context.access.tools.summaries) {
      root.prepend(U.emptyState('Belum punya akses penuh?', 'Daftar materi dapat kamu lihat. Materi minggu pertama tersedia sebagai pratinjau; sisanya memerlukan pembelian yang sudah dikonfirmasi.'));
    }
    if (summaries.length === 0) {
      root.replaceChildren(U.emptyState('Belum ada ringkasan.', 'Pengelola belum menambahkan ringkasan materi.'));
    } else {
      render();
    }
  }).catch(function () {
    root.replaceChildren(U.emptyState('Ringkasan belum dapat dimuat.', 'Coba muat ulang halaman atau hubungi pengelola jika masalah berlanjut.'));
  });
}());
