/* Supabase authentication and server-derived access checks. */
(function () {
  'use strict';
  const config = window.SIMPLEYN_CONFIG;
  const U = window.SY || null;
  let client = null;
  let missingProject = false;
  try {
    const url = new URL(config.supabaseUrl);
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:';
    const keyMissing = !config.supabaseAnonKey || config.supabaseAnonKey.includes('PASTE_');
    if ((url.protocol !== 'https:' && !isLocal) || url.hostname.includes('YOUR_PROJECT') || keyMissing) missingProject = true;
    else client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
  } catch (error) {
    missingProject = true;
  }

  function projectError() {
    return new Error('Supabase belum dihubungkan. Pengelola perlu mengisi URL proyek dan publishable key pada js/config.js serta connect-src pada _headers.');
  }

  function goLogin() {
    const next = window.location.pathname + window.location.search;
    if (window.location.pathname !== '/login.html') window.location.assign('/login.html?berikut=' + encodeURIComponent(next));
  }

  function safeNext() {
    const value = new URLSearchParams(window.location.search).get('berikut') || '/app/';
    /* Do not allow external redirects after sign-in. */
    return /^\/(?!\/)[a-zA-Z0-9_./-]*(?:\?[a-zA-Z0-9_=&%.-]*)?$/.test(value) ? value : '/app/';
  }

  async function currentUser() {
    if (!client) throw projectError();
    const sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw new Error('Sesi belum dapat dibaca. Coba muat ulang halaman.');
    if (!sessionResult.data.session) return null;
    const result = await client.auth.getUser();
    if (result.error || !result.data.user) {
      await client.auth.signOut();
      return null;
    }
    return result.data.user;
  }

  function accessError(title, message) {
    const payments = document.getElementById('payments-section');
    if (payments) payments.hidden = true;
    const preview = document.getElementById('output-section');
    if (preview) preview.hidden = true;
    const main = document.querySelector('main');
    if (!main || !U) return;
    const panel = U.el('section', 'card');
    panel.append(U.el('h2', '', title), U.el('p', 'muted', message));
    const link = U.el('a', 'btn btn-primary', title.includes('admin') ? 'Kembali ke dashboard' : 'Lihat harga');
    link.href = title.includes('admin') ? '/app/' : '/harga.html';
    panel.append(link);
    main.replaceChildren(panel);
  }

  function setGate(state) {
    document.documentElement.setAttribute('data-gate', state);
  }

  async function requireAccess(options) {
    options = options || {};
    try {
      const user = await currentUser();
      if (!user) {
        setGate('blocked');
        goLogin();
        return null;
      }
      const result = await client.rpc('get_access');
      if (result.error || !result.data || !result.data.tools) throw new Error('Hak akses belum dapat dibaca dari server. Coba muat ulang halaman.');
      const access = result.data;
      setGate('open');
      if (options.admin && access.role !== 'admin') {
        accessError('Halaman khusus admin', 'Akunmu masuk sebagai mahasiswa. Hanya akun dengan peran admin di database yang dapat mengelola materi dan pembayaran.');
        return null;
      }
      if (options.tool && !access.tools[options.tool]) {
        accessError('Akses belum aktif', 'Alat ini terbuka setelah paket yang sesuai dibayar dan dikonfirmasi admin. Admin selalu mendapat akses ke semua alat.');
        return null;
      }
      const profile = await client.from('profiles').select('username').eq('id', user.id).maybeSingle();
      const logout = document.getElementById('logout-button');
      if (logout) logout.addEventListener('click', async function () {
        logout.disabled = true;
        try { await signOut(); }
        catch (error) { logout.disabled = false; if (U) U.toast(error.message); }
      }, { once: true });
      return { user, access, username: profile.data ? profile.data.username : user.email.split('@')[0] };
    } catch (error) {
      setGate('blocked');
      accessError('Akses belum dapat diperiksa', error.message || 'Terjadi kesalahan koneksi. Coba muat ulang halaman.');
      return null;
    }
  }

  async function signIn(email, password) {
    if (!client) throw projectError();
    const result = await client.auth.signInWithPassword({ email: email.trim(), password: password });
    if (result.error) throw new Error('Email atau kata sandi belum benar, atau emailmu belum dikonfirmasi.');
    return result.data;
  }

  async function signUp(username, email, password) {
    if (!client) throw projectError();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Username harus 3–24 karakter: huruf kecil, angka, atau garis bawah.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) throw new Error('Masukkan email yang benar, maksimal 100 karakter.');
    if (password.length < 12 || password.length > 72) throw new Error('Kata sandi harus 12–72 karakter.');
    const result = await client.auth.signUp({
      email: email.trim(), password: password,
      options: { data: { username: username }, emailRedirectTo: new URL('/login.html', window.location.href).href }
    });
    if (result.error) throw new Error('Pendaftaran belum berhasil. Email atau username mungkin sudah digunakan.');
    return result.data;
  }

  async function signOut() {
    if (!client) throw projectError();
    const result = await client.auth.signOut();
    if (result.error) throw new Error('Sesi belum dapat ditutup. Coba lagi.');
    window.location.assign('/login.html');
  }

  /* No client: app pages stay closed and show why. */
  if (!client && /^\/app\//.test(window.location.pathname)) {
    setGate('blocked');
    const showNotice = function () {
      const notice = document.querySelector('.gate-msg');
      if (notice) notice.textContent = projectError().message;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showNotice);
    else showNotice();
  }

  window.SYAuth = Object.freeze({
    client: client, missingProject: missingProject, requireAccess: requireAccess,
    signIn: signIn, signUp: signUp, signOut: signOut, safeNext: safeNext, currentUser: currentUser
  });
  if (client) client.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT' && /^\/app\//.test(window.location.pathname)) goLogin();
  });
}());
