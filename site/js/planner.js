/* Study Planner: weekly view and validated local tasks. */
(function () {
  'use strict';
  function startTool(userId) {
  const U = window.SY;
  if (!U || !userId) return;
  const STORAGE_KEY = 'simpleyn.planner.v1.' + userId;
  const COURSES = ['Statistika', 'Pengantar Akuntansi', 'Pemasaran', 'Ekonomi Mikro', 'Lainnya'];
  const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  let tasks = U.loadList(STORAGE_KEY, validTask);
  const today = U.localIso(new Date());
  const form = document.getElementById('task-form');
  const clearButton = document.getElementById('clear-data');

  function validTask(item) {
    if (!U.isRecord(item) || typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 100) return null;
    const title = U.textInput(item.title, true);
    if (!title || !COURSES.includes(item.course) || !U.validDate(item.date) || typeof item.done !== 'boolean') return null;
    return {
      id: item.id,
      title: title,
      course: item.course,
      date: item.date,
      done: item.done,
      created: Number.isSafeInteger(item.created) && item.created >= 0 ? item.created : 0
    };
  }

  function save(previous) {
    if (U.saveList(STORAGE_KEY, tasks)) return true;
    tasks = previous;
    U.toast('Tugas tidak dapat disimpan. Periksa penyimpanan browser kamu.');
    return false;
  }

  function weekDays() {
    const now = new Date();
    const sinceMonday = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday);
    return Array.from({ length: 7 }, function (_, index) {
      const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
      return U.localIso(day);
    });
  }

  function deleteButton(id) {
    const button = U.el('button', 'del-btn t-del');
    button.type = 'button';
    button.title = 'Hapus';
    button.setAttribute('aria-label', 'Hapus tugas');
    button.append(U.icon('trash'));
    button.addEventListener('click', function () {
      const previous = tasks;
      tasks = tasks.filter(function (task) { return task.id !== id; });
      if (save(previous)) {
        render();
        U.toast('Tugas dihapus.');
      }
    });
    return button;
  }

  function renderWeek(days) {
    const root = document.getElementById('week');
    const columns = days.map(function (date, index) {
      const cell = U.el('div', 'day-col' + (date === today ? ' today' : ''));
      const dateParts = U.formatDate(date).split(' ');
      cell.append(U.el('div', 'day-name', DAY_NAMES[index]), U.el('div', 'day-date', dateParts[0] + ' ' + dateParts[1].slice(0, 3)));
      const list = U.el('div', 'day-tasks');
      tasks.filter(function (task) { return task.date === date; }).sort(function (a, b) { return a.created - b.created; }).forEach(function (task) {
        const late = !task.done && task.date < today;
        list.append(U.el('div', 'task-chip' + (task.done ? ' done' : '') + (late ? ' overdue' : ''), task.title));
      });
      cell.append(list);
      return cell;
    });
    root.replaceChildren(...columns);
  }

  function taskRow(task) {
    const row = U.el('div', 't-row' + (task.done ? ' done' : ''));
    const checkbox = U.el('input', 't-check');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', 'Tandai tugas ' + task.title);
    checkbox.addEventListener('change', function () {
      const previous = tasks.map(function (item) { return Object.assign({}, item); });
      const current = tasks.find(function (item) { return item.id === task.id; });
      if (!current) return;
      current.done = checkbox.checked;
      if (save(previous)) {
        render();
        if (current.done) U.toast('Satu tugas selesai. Kerja bagus!');
      }
    });
    const late = !task.done && task.date < today;
    const details = U.dayLabel(task.date) + ', tenggat ' + U.formatDate(task.date) + (late ? ' — terlambat' : '');
    const main = U.add(U.el('div', 't-main'), U.el('b', '', task.title), U.el('span', 'muted', task.course + ' · ' + details));
    row.append(checkbox, main, deleteButton(task.id));
    return row;
  }

  function render() {
    const days = weekDays();
    document.getElementById('week-range').textContent = U.formatDate(days[0]) + ' – ' + U.formatDate(days[6]);
    renderWeek(days);
    const root = document.getElementById('task-rows');
    const sorted = tasks.slice().sort(function (a, b) { return a.date.localeCompare(b.date) || a.created - b.created; });
    if (sorted.length === 0) {
      root.replaceChildren(U.emptyState('Belum ada tugas.', 'Tambahkan tugas dan tenggat pertamamu lewat formulir. Semuanya hanya tersimpan di perangkat ini.'));
    } else {
      root.replaceChildren(...sorted.map(taskRow));
    }
    const open = tasks.filter(function (task) { return !task.done; });
    const late = open.filter(function (task) { return task.date < today; }).length;
    document.getElementById('planner-status').textContent = tasks.length === 0 ? 'Mulai dengan satu tugas kecil. Kamu pasti bisa.' : open.length + ' tugas belum selesai' + (late ? ', ' + late + ' sudah lewat tenggat' : '') + '. Ayo dimulai dari yang paling dekat tenggatnya.';
    document.getElementById('task-count').textContent = tasks.length + ' tugas';
    clearButton.hidden = tasks.length === 0;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const error = document.getElementById('task-error');
    const title = U.textInput(document.getElementById('task-title').value, true);
    const course = document.getElementById('task-course').value;
    const date = document.getElementById('task-date').value;
    let message = '';
    if (!title) message = 'Isi kegiatan dulu ya, maksimal 100 karakter.';
    else if (!COURSES.includes(course)) message = 'Pilih mata kuliah yang tersedia.';
    else if (!U.validDate(date)) message = 'Pilih tanggal tenggat yang benar.';
    if (message) {
      error.textContent = message;
      error.hidden = false;
      return;
    }
    const record = { id: U.uniqueId(), title: title, course: course, date: date, done: false, created: Date.now() };
    const previous = tasks;
    tasks = tasks.concat(record);
    if (save(previous)) {
      error.hidden = true;
      form.reset();
      document.getElementById('task-date').value = U.offsetDate(3);
      document.getElementById('task-title').focus();
      render();
      U.toast('Tugas ditambahkan.');
    }
  });

  clearButton.addEventListener('click', function () {
    if (!window.confirm('Hapus semua tugas di perangkat ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      tasks = [];
      render();
      U.toast('Semua tugas dihapus.');
    } catch (error) {
      U.toast('Data tidak dapat dihapus. Periksa penyimpanan browser kamu.');
    }
  });

  document.getElementById('task-date').value = U.offsetDate(3);
  render();
  }
  if (window.SYAuth) window.SYAuth.requireAccess({ tool: 'planner' }).then(function (context) { if (context) startTool(context.user.id); });
}());
