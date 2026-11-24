/* Light/dark switch. Runs in <head> before paint to avoid a flash. */
(function () {
  'use strict';
  const KEY = 'simpleyn.theme';
  const root = document.documentElement;

  function stored() {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function apply(theme) {
    if (theme) root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    const button = document.getElementById('theme-toggle');
    if (button) {
      const dark = (theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap');
      button.title = dark ? 'Tema terang' : 'Tema gelap';
    }
  }

  apply(stored());

  document.addEventListener('DOMContentLoaded', function () {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    apply(stored());
    button.addEventListener('click', function () {
      const dark = root.getAttribute('data-theme') === 'dark' ||
        (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      const next = dark ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (error) { /* storage blocked: still switch for this page */ }
      apply(next);
    });
  });
}());
