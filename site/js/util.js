/* Shared, dependency-free helpers. */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const XLINK = 'http://www.w3.org/1999/xlink';
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const ICONS = ['wallet', 'book', 'cal', 'check', 'up', 'down', 'trash', 'plus', 'search', 'info', 'arrow-l', 'arrow-r', 'pen', 'cart'];
  let toastTimer;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function add(parent, ...children) {
    children.forEach(function (child) {
      if (child !== null && child !== undefined) {
        parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    });
    return parent;
  }

  function icon(name, large) {
    const safeName = ICONS.includes(name) ? name : 'book';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', large ? 'ic ic-lg' : 'ic');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '/img/icons.svg#' + safeName);
    use.setAttributeNS(XLINK, 'href', '/img/icons.svg#' + safeName);
    svg.append(use);
    return svg;
  }

  function rp(amount) {
    return 'Rp' + Math.round(amount).toLocaleString('id-ID');
  }

  function validDate(value) {
    if (typeof value !== 'string') return false;
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) return false;
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function formatDate(value) {
    if (!validDate(value)) return 'Tanggal tidak valid';
    const parts = value.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }

  function dayLabel(value) {
    const parts = value.split('-').map(Number);
    return DAYS[new Date(parts[0], parts[1] - 1, parts[2]).getDay()];
  }

  function localIso(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function offsetDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return localIso(date);
  }

  function textInput(value, required) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (text.length > 100 || (required && text.length === 0)) return null;
    return text;
  }

  function amountInput(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount >= 1000000000) return null;
    return amount;
  }

  function uniqueId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function loadList(key, validate) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      const clean = [];
      parsed.forEach(function (item) {
        const valid = validate(item);
        if (valid && !seen.has(valid.id)) {
          seen.add(valid.id);
          clean.push(valid);
        }
      });
      return clean;
    } catch (error) {
      return [];
    }
  }

  function saveList(key, items) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
      return true;
    } catch (error) {
      return false;
    }
  }

  function toast(message) {
    let node = document.getElementById('toast');
    if (!node) {
      node = el('div', 'toast');
      node.id = 'toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.append(node);
    }
    window.clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.add('show');
    toastTimer = window.setTimeout(function () { node.classList.remove('show'); }, 2600);
  }

  function emptyState(title, body) {
    return add(el('div', 'empty'), el('b', '', title), el('span', '', body));
  }

  async function fetchJson(url) {
    /* Only page-selected, same-origin paths are ever fetched. */
    const target = new URL(url, window.location.href);
    if (target.origin !== window.location.origin) throw new Error('Origin tidak diizinkan.');
    const response = await fetch(target.href, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Data tidak dapat dimuat.');
    return response.json();
  }

  window.SY = Object.freeze({
    el: el, add: add, icon: icon, rp: rp, validDate: validDate, formatDate: formatDate,
    dayLabel: dayLabel, localIso: localIso, offsetDate: offsetDate, textInput: textInput,
    amountInput: amountInput, uniqueId: uniqueId, isRecord: isRecord, loadList: loadList,
    saveList: saveList, toast: toast, emptyState: emptyState, fetchJson: fetchJson,
    MONTHS: MONTHS.slice(), DAYS: DAYS.slice()
  });
}());
