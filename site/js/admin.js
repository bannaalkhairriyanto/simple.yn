/* Admin-only publishing and purchase approval, enforced again by Postgres/RLS. */
(function () {
  'use strict';
  const U = window.SY;
  let material = [];
  let generated = null;
  let preparing = false;
  const form = document.getElementById('admin-form');
  const errorNode = document.getElementById('admin-error');
  const output = document.getElementById('output-section');
  const publishButton = document.getElementById('publish-button');

  function error(message) {
    errorNode.textContent = message;
    errorNode.hidden = !message;
  }

  function slug(value) {
    return value.toLocaleLowerCase('id-ID').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/g, '') || 'materi';
  }

  function entry() {
    const course = U.textInput(document.getElementById('summary-course').value, true);
    const title = U.textInput(document.getElementById('summary-title-input').value, true);
    const weekString = document.getElementById('summary-week').value.trim();
    const week = /^\d+$/.test(weekString) ? Number(weekString) : 0;
    const date = document.getElementById('summary-updated').value;
    const type = document.getElementById('summary-type').value;
    if (!course || !title) throw new Error('Mata kuliah dan judul wajib diisi, maksimal 100 karakter.');
    if (!Number.isSafeInteger(week) || week < 1 || week > 52) throw new Error('Minggu harus berupa bilangan bulat antara 1 sampai 52.');
    if (!U.validDate(date)) throw new Error('Pilih tanggal pembaruan yang benar.');
    if (material.some(function (item) { return item.week === week && item.course.toLocaleLowerCase('id-ID') === course.toLocaleLowerCase('id-ID'); })) {
      throw new Error('Mata kuliah dan minggu tersebut sudah ada.');
    }
    const ids = new Set(material.map(function (item) { return item.id; }));
    const base = slug(course) + '-' + week;
    let suffix = 1;
    let id = base;
    while (ids.has(id)) { suffix += 1; id = base.slice(0, 70) + '-' + suffix; }
    return { id: id, course: course, week: week, title: title, type: type, updated_on: date };
  }

  async function content(entry) {
    if (entry.type === 'md') {
      const body = document.getElementById('summary-content').value.trim();
      if (!body || body.length > 200000) throw new Error('Tulis isi Markdown, maksimal 200.000 karakter.');
      return { body: body, file: null };
    }
    const file = document.getElementById('summary-pdf').files[0];
    if (!file || file.size === 0 || file.size > 20971520 || !file.name.toLocaleLowerCase('id-ID').endsWith('.pdf')) throw new Error('Pilih PDF yang tidak kosong dan berukuran maksimal 20 MB.');
    const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (header !== '%PDF-') throw new Error('Berkas tersebut tidak memiliki header PDF yang benar.');
    return { body: null, file: file };
  }

  function preview(entry, data) {
    const root = document.getElementById('markdown-preview');
    const pdf = document.getElementById('pdf-preview');
    if (entry.type === 'md') {
      root.replaceChildren(U.el('h2', '', entry.title));
      const body = U.el('div');
      window.SYMarkdown.render(body, data.body);
      root.append(body);
      root.hidden = false;
      pdf.hidden = true;
    } else {
      root.hidden = true;
      pdf.hidden = false;
      pdf.replaceChildren(U.el('h2', '', entry.title), U.el('p', 'muted', 'PDF berhasil diperiksa. Pilih tombol publikasikan untuk mengunggahnya ke penyimpanan privat.'));
    }
    document.getElementById('content-destination').textContent = entry.course + ' · Minggu ' + entry.week + ' · ' + (entry.type === 'md' ? 'Markdown' : 'PDF privat') + ' · ID: ' + entry.id;
    document.getElementById('json-entry').value = JSON.stringify(entry, null, 2);
    publishButton.disabled = false;
    output.hidden = false;
    document.getElementById('publication-status').textContent = 'Belum dipublikasikan.';
  }

  async function loadMaterial() {
    const result = await window.SYAuth.client.from('summary_metadata').select('id,course,week,title,type,updated_on').order('course').order('week');
    if (result.error) throw new Error('Daftar materi belum dapat dimuat.');
    material = result.data;
    document.getElementById('index-note').textContent = material.length + ' ringkasan sudah dipublikasikan. Mata kuliah yang tersedia muncul sebagai saran.';
    const courses = [...new Set(material.map(function (item) { return item.course; }))];
    document.getElementById('existing-courses').replaceChildren(...courses.map(function (name) {
      const option = U.el('option');
      option.value = name;
      return option;
    }));
  }

  function invalidate() {
    generated = null;
    output.hidden = true;
    publishButton.disabled = true;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (preparing) return;
    preparing = true;
    error('');
    publishButton.disabled = true;
    try {
      const current = entry();
      const data = await content(current);
      generated = { entry: current, data: data };
      preview(current, data);
      output.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (failure) {
      generated = null;
      output.hidden = true;
      error(failure.message || 'Materi belum dapat ditinjau.');
    } finally {
      preparing = false;
    }
  });

  publishButton.addEventListener('click', async function () {
    if (!generated) return;
    publishButton.disabled = true;
    const status = document.getElementById('publication-status');
    status.textContent = 'Menyimpan materi ke Supabase…';
    const entry = generated.entry;
    try {
      if (entry.type === 'pdf') {
        const upload = await window.SYAuth.client.storage.from('summary-private').upload(entry.id + '.pdf', generated.data.file, { upsert: false, contentType: 'application/pdf' });
        if (upload.error) throw new Error('PDF belum dapat diunggah. Periksa koneksi atau nama berkas yang sudah ada.');
      }
      const result = await window.SYAuth.client.rpc('admin_create_summary', {
        summary_id: entry.id, course_name: entry.course, week_number: entry.week,
        summary_title: entry.title, summary_type: entry.type, markdown_body: generated.data.body,
        updated_date: entry.updated_on
      });
      if (result.error) {
        if (entry.type === 'pdf') await window.SYAuth.client.storage.from('summary-private').remove([entry.id + '.pdf']);
        if (result.error.code === '23505') throw new Error('ID atau kombinasi mata kuliah dan minggu sudah digunakan.');
        throw new Error('Ringkasan belum dapat disimpan. Periksa isian dan izin adminmu.');
      }
      const link = U.el('a', '', ' Baca ringkasan yang baru dipublikasikan.');
      link.href = '/app/baca.html?id=' + encodeURIComponent(entry.id);
      status.replaceChildren(document.createTextNode('Berhasil dipublikasikan.'), link);
      generated = null;
      await loadMaterial();
      form.reset();
      updateType();
      document.getElementById('summary-updated').value = U.localIso(new Date());
      U.toast('Ringkasan berhasil dipublikasikan.');
    } catch (failure) {
      status.textContent = failure.message || 'Ringkasan belum dapat dipublikasikan. Coba lagi.';
      publishButton.disabled = false;
    }
  });

  async function markPurchase(id, decision) {
    const prompt = decision === 'paid' ? 'Pastikan dana sudah kamu terima. Tandai pembayaran ini sebagai lunas dan buka alat untuk pembeli?' : 'Tolak permintaan pembayaran ini?';
    if (!window.confirm(prompt)) return;
    const root = document.getElementById('payment-status');
    root.textContent = 'Menyimpan keputusan…';
    try {
      const result = await window.SYAuth.client.rpc('admin_mark_purchase', { request_id: id, decision: decision });
      if (result.error) throw new Error('Keputusan belum dapat disimpan. Periksa izin admin atau status permintaan ini.');
      U.toast(decision === 'paid' ? 'Pembayaran diterima. Akses mahasiswa sudah dibuka.' : 'Permintaan ditolak.');
      await loadPayments();
    } catch (failure) {
      root.textContent = failure.message || 'Keputusan belum dapat disimpan.';
    }
  }

  function paymentCard(item) {
    const card = U.el('article', 'card payment-card');
    card.append(U.el('h3', '', item.plan_id + ' — ' + U.rp(item.amount)));
    card.append(U.el('p', '', item.username + ' · ' + item.email));
    const tool = item.selected_tool ? ' · pilihan alat: ' + item.selected_tool : '';
    const date = new Date(item.created_at).toLocaleString('id-ID');
    card.append(U.el('p', 'muted small', date + tool));
    card.append(U.el('p', 'payment-reference', 'Nomor permintaan: ' + item.id));
    card.append(U.el('span', 'badge ' + (item.status === 'paid' ? 'badge-green' : 'badge-sand'), item.status));
    if (item.status === 'pending') {
      const actions = U.el('div', 'inline-actions payment-actions');
      const approve = U.el('button', 'btn btn-primary', 'Tandai dibayar');
      approve.type = 'button';
      approve.addEventListener('click', function () { markPurchase(item.id, 'paid'); });
      const reject = U.el('button', 'btn btn-danger', 'Tolak');
      reject.type = 'button';
      reject.addEventListener('click', function () { markPurchase(item.id, 'rejected'); });
      actions.append(approve, reject);
      card.append(actions);
    }
    return card;
  }

  async function loadPayments() {
    const filter = document.getElementById('payment-filter').value;
    const root = document.getElementById('payment-status');
    root.textContent = 'Memuat permintaan pembayaran…';
    try {
      const result = await window.SYAuth.client.rpc('admin_purchases', { status_filter: filter });
      if (result.error) throw new Error('Daftar pembayaran belum dapat dibaca dari server.');
      root.textContent = '';
      const items = result.data || [];
      document.getElementById('payment-list').replaceChildren(...(items.length ? items.map(paymentCard) : [U.emptyState('Tidak ada permintaan.', 'Belum ada permintaan dengan status ini.')]));
    } catch (failure) {
      root.textContent = failure.message || 'Daftar pembayaran belum dapat dimuat.';
    }
  }

  function updateType() {
    const isPdf = document.getElementById('summary-type').value === 'pdf';
    document.getElementById('markdown-input-field').hidden = isPdf;
    document.getElementById('pdf-input-field').hidden = !isPdf;
    document.getElementById('summary-content').required = !isPdf;
    document.getElementById('summary-pdf').required = isPdf;
  }

  document.getElementById('summary-type').addEventListener('change', function () { updateType(); invalidate(); });
  form.addEventListener('input', invalidate);
  document.getElementById('summary-pdf').addEventListener('change', invalidate);
  document.getElementById('payment-filter').addEventListener('change', loadPayments);
  document.getElementById('refresh-payments').addEventListener('click', loadPayments);

  if (!window.SYAuth || !window.SYAuth.client) {
    error('Supabase belum dihubungkan oleh pengelola.');
    document.getElementById('generate-button').disabled = true;
    document.getElementById('refresh-payments').disabled = true;
  } else {
    document.getElementById('summary-updated').value = U.localIso(new Date());
    updateType();
    window.SYAuth.requireAccess({ admin: true }).then(async function (context) {
      if (!context) return;
      document.getElementById('payments-section').hidden = false;
      await loadMaterial();
      await loadPayments();
    }).catch(function (failure) { error(failure.message); });
  }
}());
