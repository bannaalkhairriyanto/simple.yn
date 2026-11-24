/* Registration and sign-in wired to Supabase Auth only. */
(function () {
  'use strict';
  const A = window.SYAuth;
  const U = window.SY;
  let mode = 'masuk';
  let busy = false;
  const form = document.getElementById('login-form');
  form.hidden = false;

  function selectMode(next) {
    mode = next;
    const register = mode === 'daftar';
    document.getElementById('tab-masuk').classList.toggle('on', !register);
    document.getElementById('tab-masuk').setAttribute('aria-selected', String(!register));
    document.getElementById('tab-daftar').classList.toggle('on', register);
    document.getElementById('tab-daftar').setAttribute('aria-selected', String(register));
    document.getElementById('username-field').hidden = !register;
    document.getElementById('confirm-field').hidden = !register;
    document.getElementById('password-note').hidden = !register;
    document.getElementById('register-username').required = register;
    document.getElementById('register-confirm').required = register;
    document.getElementById('auth-password').autocomplete = register ? 'new-password' : 'current-password';
    document.getElementById('auth-submit').textContent = register ? 'Daftar' : 'Masuk';
    error('');
    document.getElementById('login-notice').textContent = '';
  }

  function error(message) {
    const node = document.getElementById('login-error');
    node.textContent = message;
    node.hidden = !message;
  }

  document.getElementById('tab-masuk').addEventListener('click', function () { selectMode('masuk'); });
  document.getElementById('tab-daftar').addEventListener('click', function () { selectMode('daftar'); });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    error('');
    const username = document.getElementById('register-username').value.trim().toLowerCase();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (mode === 'daftar' && document.getElementById('register-confirm').value !== password) {
      error('Kata sandi yang diulang belum sama.');
      return;
    }
    busy = true;
    const submit = document.getElementById('auth-submit');
    submit.disabled = true;
    submit.textContent = mode === 'daftar' ? 'Mendaftarkan…' : 'Memeriksa akun…';
    try {
      if (mode === 'daftar') {
        const result = await window.SYAuth.signUp(username, email, password);
        if (!result.session) {
          document.getElementById('login-notice').textContent = 'Akun dibuat. Buka email konfirmasi dari Supabase, lalu kembali untuk masuk.';
          form.reset();
          selectMode('masuk');
          document.getElementById('login-notice').textContent = 'Akun dibuat. Buka email konfirmasi dari Supabase, lalu kembali untuk masuk.';
        } else {
          window.location.assign(window.SYAuth.safeNext());
        }
      } else {
        await window.SYAuth.signIn(email, password);
        window.location.assign(window.SYAuth.safeNext());
      }
    } catch (failure) {
      error(failure.message || 'Belum dapat masuk. Periksa kembali isianmu.');
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = mode === 'daftar' ? 'Daftar' : 'Masuk';
    }
  });

  if (A.missingProject || !A.client) {
    error('Supabase belum dihubungkan. Pengelola perlu mengisi konfigurasi proyek sebelum login dapat digunakan.');
    document.getElementById('auth-submit').disabled = true;
  } else {
    A.currentUser().then(function (user) {
      if (user) window.location.assign(A.safeNext());
    }).catch(function () {
      /* Remain on the form until valid credentials or corrected configuration exist. */
    });
  }
}());
