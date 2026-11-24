/* Money Tracker: this device only, with validated storage and input. */
(function () {
  'use strict';
  function startTool(userId) {
  const U = window.SY;
  if (!U || !userId) return;
  const STORAGE_KEY = 'simpleyn.keuangan.v1.' + userId;
  const CATEGORIES = ['Makan', 'Transport', 'Kuliah', 'Hiburan', 'Lainnya'];
  const COLORS = { Makan: '#B5694A', Transport: '#4F6F52', Kuliah: '#C9A45C', Hiburan: '#6E675C', Lainnya: '#B8AD97' };
  let transactions = U.loadList(STORAGE_KEY, validTransaction);
  const form = document.getElementById('tx-form');
  const clearButton = document.getElementById('clear-data');

  function validTransaction(item) {
    if (!U.isRecord(item) || typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 100) return null;
    const title = U.textInput(item.title, true);
    const type = item.type === 'in' || item.type === 'out' ? item.type : null;
    if (!title || !type || !CATEGORIES.includes(item.cat) || !U.validDate(item.date)) return null;
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0 || item.amount >= 1000000000) return null;
    return {
      id: item.id,
      title: title,
      type: type,
      cat: item.cat,
      amount: item.amount,
      date: item.date,
      created: Number.isSafeInteger(item.created) && item.created >= 0 ? item.created : 0
    };
  }

  function save() {
    if (!U.saveList(STORAGE_KEY, transactions)) {
      U.toast('Catatan tidak dapat disimpan. Periksa penyimpanan browser kamu.');
      return false;
    }
    return true;
  }

  function stat(label, value, className) {
    const node = U.el('div', 'stat');
    U.add(node, U.el('div', 'lbl', label), U.el('div', 'val ' + className, U.rp(value)));
    return node;
  }

  function svgNode(tag, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attributes).forEach(function (key) { node.setAttribute(key, String(attributes[key])); });
    return node;
  }

  function deleteButton(id) {
    const button = U.el('button', 'del-btn');
    button.type = 'button';
    button.setAttribute('aria-label', 'Hapus catatan');
    button.title = 'Hapus';
    button.append(U.icon('trash'));
    button.addEventListener('click', function () {
      const previous = transactions;
      transactions = transactions.filter(function (item) { return item.id !== id; });
      if (save()) {
        render();
        U.toast('Catatan dihapus.');
      } else {
        transactions = previous;
      }
    });
    return button;
  }

  function renderRows() {
    const sorted = transactions.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) || b.created - a.created || a.id.localeCompare(b.id);
    });
    const root = document.getElementById('tx-rows');
    if (sorted.length === 0) {
      root.replaceChildren(U.emptyState('Belum ada catatan keuangan.', 'Tambahkan uang masuk atau pengeluaran pertamamu lewat formulir di atas.'));
    } else {
      const rows = sorted.map(function (item) {
        const row = U.el('div', 'tx');
        const iconBox = U.add(U.el('div', 'tx-ico ' + item.type), U.icon(item.type === 'in' ? 'up' : 'down'));
        const meta = U.add(U.el('span', 'muted'), U.dayLabel(item.date) + ', ' + U.formatDate(item.date) + ' · ' + item.cat);
        const main = U.add(U.el('div', 'tx-main'), U.el('b', '', item.title), meta);
        const amount = U.el('span', 'tx-amt ' + item.type, (item.type === 'in' ? '+' : '−') + U.rp(item.amount));
        return U.add(row, iconBox, main, amount, deleteButton(item.id));
      });
      root.replaceChildren(...rows);
    }
    document.getElementById('tx-count').textContent = transactions.length + ' catatan';
  }

  function renderChart() {
    const totals = {};
    transactions.forEach(function (item) {
      if (item.type === 'out') totals[item.cat] = (totals[item.cat] || 0) + item.amount;
    });
    const entries = Object.entries(totals).sort(function (a, b) { return b[1] - a[1]; });
    const total = entries.reduce(function (sum, pair) { return sum + pair[1]; }, 0);
    const root = document.getElementById('category-content');
    if (!total) {
      root.replaceChildren(U.emptyState('Belum ada pengeluaran.', 'Grafik kategori muncul setelah kamu menambahkan catatan pengeluaran.'));
      return;
    }
    const donut = svgNode('svg', { width: 130, height: 130, viewBox: '0 0 120 120', role: 'img' });
    const chartTitle = svgNode('title', {});
    chartTitle.textContent = 'Grafik pengeluaran per kategori';
    donut.append(chartTitle);
    donut.append(svgNode('circle', { cx: 60, cy: 60, r: 48, fill: '#EAE3D2' }));
    let angle = -90;
    entries.forEach(function (pair) {
      const fraction = pair[1] / total;
      const endAngle = angle + fraction * 360;
      const startX = 60 + 48 * Math.cos(angle * Math.PI / 180);
      const startY = 60 + 48 * Math.sin(angle * Math.PI / 180);
      const endX = 60 + 48 * Math.cos(endAngle * Math.PI / 180);
      const endY = 60 + 48 * Math.sin(endAngle * Math.PI / 180);
      const path = 'M60 60 L' + startX.toFixed(1) + ' ' + startY.toFixed(1) + ' A48 48 0 ' + (fraction > 0.5 ? 1 : 0) + ' 1 ' + endX.toFixed(1) + ' ' + endY.toFixed(1) + ' Z';
      const slice = svgNode('path', { d: path, fill: COLORS[pair[0]] });
      slice.append(svgNode('title', {}));
      slice.lastChild.textContent = pair[0] + ': ' + U.rp(pair[1]);
      donut.append(slice);
      angle = endAngle;
    });
    donut.append(svgNode('circle', { cx: 60, cy: 60, r: 30, fill: '#FBF8F1' }));
    const centerLabel = svgNode('text', { x: 60, y: 58, 'text-anchor': 'middle', class: 'donut-label' });
    centerLabel.textContent = 'total';
    const centerValue = svgNode('text', { x: 60, y: 72, 'text-anchor': 'middle', class: 'donut-center' });
    centerValue.textContent = U.rp(total);
    U.add(donut, centerLabel, centerValue);
    const legend = U.el('div', 'legend');
    entries.forEach(function (pair) {
      const dot = U.el('span', 'leg-dot cat-' + pair[0]);
      const row = U.add(U.el('div', 'leg-row'), dot, U.el('span', '', pair[0]), U.el('span', 'muted', U.rp(pair[1])));
      row.append(U.el('span', 'pct', Math.round(pair[1] / total * 100) + '%'));
      legend.append(row);
    });
    root.replaceChildren(U.add(U.el('div', 'donut-wrap'), donut), legend);
  }

  function renderStats() {
    const income = transactions.reduce(function (sum, item) { return sum + (item.type === 'in' ? item.amount : 0); }, 0);
    const expense = transactions.reduce(function (sum, item) { return sum + (item.type === 'out' ? item.amount : 0); }, 0);
    document.getElementById('stats').replaceChildren(
      stat('Saldo', income - expense, ''),
      stat('Uang masuk', income, 'in'),
      stat('Uang keluar', expense, 'out')
    );
  }

  function render() {
    renderStats();
    renderRows();
    renderChart();
    clearButton.hidden = transactions.length === 0;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const error = document.getElementById('tx-error');
    const type = document.getElementById('tx-type').value;
    const title = U.textInput(document.getElementById('tx-title').value, true);
    const amount = U.amountInput(document.getElementById('tx-amount').value);
    const category = document.getElementById('tx-category').value;
    let message = '';
    if (!title) message = 'Isi keterangan dulu ya, maksimal 100 karakter.';
    else if (amount === null) message = 'Nominal harus berupa angka bulat, lebih dari 0, dan kurang dari Rp1.000.000.000.';
    else if (!CATEGORIES.includes(category) || (type !== 'in' && type !== 'out')) message = 'Jenis atau kategori belum benar.';
    if (message) {
      error.textContent = message;
      error.hidden = false;
      return;
    }
    const record = { id: U.uniqueId(), title: title, amount: amount, cat: category, type: type, date: U.localIso(new Date()), created: Date.now() };
    transactions.push(record);
    if (save()) {
      error.hidden = true;
      form.reset();
      document.getElementById('tx-title').focus();
      render();
      U.toast('Catatan ditambahkan.');
    } else {
      transactions = transactions.filter(function (item) { return item.id !== record.id; });
    }
  });

  clearButton.addEventListener('click', function () {
    if (!window.confirm('Hapus semua catatan Money Tracker di perangkat ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      transactions = [];
      render();
      U.toast('Semua catatan keuangan dihapus.');
    } catch (error) {
      U.toast('Data tidak dapat dihapus. Periksa penyimpanan browser kamu.');
    }
  });

  render();
  }
  if (window.SYAuth) window.SYAuth.requireAccess({ tool: 'money' }).then(function (context) { if (context) startTool(context.user.id); });
}());
