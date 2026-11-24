# Simple.yn — Supabase Auth, pembayaran manual, dan materi privat

Simple.yn tetap memakai tampilan dan alat yang sama, tetapi sekarang memiliki otentikasi sungguhan, pemeriksaan pembelian, peran admin, dan penyimpanan materi privat.

## Cara kerja untuk pengguna

1. Pengunjung membuat akun dengan **username**, **email**, dan **kata sandi** di `/login.html`. Login selanjutnya menggunakan **email dan kata sandi**; username ditampilkan pada akun.
2. Pada `harga.html`, pengguna memilih paket. Paket Plus meminta satu alat tambahan: Money Tracker atau Study Planner.
3. Tombol konfirmasi WhatsApp membuat permintaan dengan status **`pending`** di Supabase, lalu menyusun pesan WhatsApp berisi nomor permintaan dan paket. Tidak ada pembayaran otomatis dan tidak ada akses yang diberikan oleh frontend.
4. Admin membuka **Kelola materi → Persetujuan pembayaran**, memeriksa bukti transfer, lalu menekan **Tandai dibayar**.
5. Trigger database memberikan `entitlements` sesuai paket. Akun mahasiswa kemudian dapat membuka alat yang sudah dibayar.
6. **Akun admin selalu memiliki seluruh alat secara gratis tanpa permintaan pembayaran.** Hal ini ditentukan oleh fungsi `get_access()` di database, bukan tanda `isAdmin` di browser.

Catatan Money Tracker dan Study Planner tetap disimpan hanya di perangkat pengguna. Tidak disinkronkan atau dikirim ke Supabase.

## Struktur

- `site/` — berkas frontend yang diterbitkan oleh Cloudflare Pages.
- `site/js/vendor/supabase.min.js` — klien resmi Supabase untuk browser, disimpan secara lokal beserta lisensinya.
- `site/js/auth.js` — sesi PKCE, auto-refresh, email/password auth, dan pemeriksaan akses ke server.
- `supabase/migrations/001_auth_payments_summaries.sql` — seluruh tabel, trigger, fungsi RPC, RLS, dan kebijakan Storage yang wajib diterapkan.
- `examples/` — dua format materi yang digunakan sebelum migrasi, tidak ikut dipublikasikan.
- `README.md`, `SECURITY.md`, `demo-backup/` — di luar folder deploy, tidak perlu ikut naik ke hosting.

## Persiapan Supabase

### 1. Buat proyek

Buat proyek baru di Supabase. Pada bagian Auth, aktifkan penyedia **Email**. Untuk produksi, aktifkan konfirmasi email dan tetapkan minimum password **12 karakter**. Gunakan juga MFA pada akun pengelola yang tersedia.

### 2. Terapkan migrasi database

Buka **SQL Editor** lalu jalankan berkas berikut **sesuai urutan**:

```text
supabase/migrations/001_auth_payments_summaries.sql
supabase/migrations/002_pending_purchase_limit.sql
supabase/migrations/003_harden_grants.sql
```

`001` membuat skema dan kebijakan, `002` membatasi jumlah permintaan `pending`, dan `003` mencabut izin bawaan Supabase yang terlalu luas. **Jangan lewati `003`:** tanpa berkas itu, pengguna yang login masih dapat mengubah peran atau status pembayarannya sendiri. Kamu juga dapat menggunakan workflow migrasi `supabase db push` jika Supabase CLI sudah dipasang dan terhubung ke proyek. Migrasi ini akan membuat:

- `profiles`: email, username, dan peran tepercaya (`student` atau `admin`).
- `plans`: harga serta isi paket yang menjadi acuan pembayaran.
- `purchase_requests`: permintaan pembelian berstatus `pending`, `paid`, atau `rejected`.
- `entitlements`: alat yang benar-benar dapat diakses mahasiswa.
- `summary_metadata` dan `summary_contents`: materi dan isi yang diproteksi terpisah.
- Bucket privat **`summary-private`**: PDF maksimum 20 MB, hanya untuk admin pengunggah dan pembaca berhak.
- RLS, trigger harga server, trigger grant alat setelah pembayaran, dan fungsi `get_access`/`read_summary`.

Jangan menonaktifkan RLS. Jangan memberikan izin INSERT/UPDATE langsung untuk merubah `entitlements`, peran pengguna, atau isi materi kepada semua pengguna authenticated.

### 3. Tambahkan identifier proyek ke frontend

Ubah dua nilai di `site/js/config.js`:

```js
supabaseUrl: 'https://PROJECT_ID.supabase.co',
supabaseAnonKey: 'ISI_PUBLISHABLE_KEY_DARI_SUPABASE',
```

Gunakan URL proyek serta **publishable key** yang memang ditujukan untuk browser. Publishable key bukan service-role secret, tetapi hanya aman karena RLS aktif.

**Jangan pernah memasukkan `service_role`, secret key, database password, API token, atau kredensial Cloudflare ke `config.js` atau berkas `site/` lainnya.**

Di `site/_headers`, ganti `https://YOUR_PROJECT.supabase.co` pada `connect-src` dengan origin proyekmu yang sama. Biarkan `script-src 'self'` agar JavaScript vendor lokal dapat dimuat tanpa CDN.

### 4. Buat akun admin pertama

Buat akun melalui halaman Daftar terlebih dahulu agar profil otomatis dibuat oleh trigger. Sebagai pemilik database, di **SQL Editor** jalankan:

```sql
update public.profiles
set role = 'admin'
where email = 'email-admin-kalian@example.com';
```

Gunakan email admin yang sudah didaftarkan. Verifikasi hasilnya hanya satu baris yang berubah. Peran ini tidak dapat dipilih saat pendaftaran dan tidak bisa diubah mahasiswa lewat browser.

Akun admin bisa langsung membuka ketiga alat, mengunggah Markdown/PDF, serta memproses permintaan pembayaran. Nilai nominal harga pada formulir pembelian juga diperiksa ulang dan ditimpa oleh nilai pada tabel `plans`.

### 5. Tambahkan materi pertama

Database materi sengaja **kosong pada awal setup**; tidak ada data akademik contoh otomatis yang dibuat.

1. Masuk sebagai admin.
2. Buka **Kelola materi** di sidebar.
3. Isi mata kuliah, minggu, judul, tanggal pembaruan, dan jenis berkas.
4. Tulis Markdown atau pilih PDF, lalu tekan **Tinjau & siapkan berkas**.
5. Setelah pratinjau benar, tekan **Publikasikan ringkasan**.

Kini tidak perlu membuat file JSON ataupun redeploy untuk menambahkan materi. Ringkasan Markdown langsung disimpan di database, sedangkan PDF diunggah ke bucket privat setelah tombol publikasikan ditekan. Jika transaksi database gagal setelah unggahan PDF, panel mencoba menghapus berkas tersebut agar tidak bercampur dengan entri lain.

`examples/summaries/` berisi dua berkas format lama (`statistika-1.md` dan `akuntansi-1.pdf` bertanda **CONTOH – hapus saya**) yang dapat dipakai sebagai referensi isi atau percobaan pengelola. Keduanya tidak dipublikasikan lagi sebagai berkas statis yang bisa mem-bypass pembayaran.

### Menambah admin berikutnya

Daftarkan akun baru terlebih dahulu, lalu lakukan langkah SQL yang sama seperti admin pertama. Jangan berbagi satu kata sandi admin. Hapus peran orang yang sudah bukan pengelola melalui SQL Editor:

```sql
update public.profiles set role = 'student' where email = 'alamat-anggota@example.com';
```

Perubahan peran akan terlihat saat akses berikutnya diperiksa ke server.

## Menyetujui pembayaran

1. Student memilih paket dan login jika belum memiliki sesi.
2. Supabase membuat nomor UUID permintaan dan menetapkan harga dari `plans`. Client tidak bisa mengubah `status`, `user_id`, `amount`, atau daftar alat untuk mempromosikan aksesnya.
3. Admin memilih status **Menunggu konfirmasi** pada panel admin. Daftar berisi username/email pembeli, plan, alat tambahan Plus, harga, waktu, dan nomor permintaan untuk dicocokkan dengan WhatsApp.
4. Periksa nominal dan bukti transfer pada rekening tujuan. Jangan menerima hanya karena pesan mengaku sudah membayar.
5. Tekan **Tandai dibayar** atau **Tolak**. Admin login juga tetap diperiksa oleh fungsi RPC; menyalin tombol/HTML admin ke halaman mahasiswa tidak akan memberi izin.
6. Daftar diperbarui dari server. Setelah status berhasil menjadi `paid`, trigger memberikan entitlements secara otomatis.

Permintaan yang telah selesai tidak dapat diubah dari panel untuk menjaga catatan persetujuan sederhana dan konsisten. Koreksi luar biasa harus dilakukan administrator database secara sadar; jangan menghapus `purchase_requests` hanya untuk mengatur ulang akses.

## Mengubah harga dan paket

Tampilan harga berada di `site/js/config.js`; harga yang menjadi acuan transaksi berada di tabel `plans`. Ubah **keduanya secara selaras**:

```sql
-- Contoh penggantian harga dan alat paket
update public.plans set price = 10000, tools = array['money', 'planner']
where id = 'hemat';
```

Jangan menurunkan atau menaikkan harga hanya di HTML/konfigurasi frontend. `prepare_purchase()` menyalin harga dari database, sedangkan `grant_purchase_tools()` menggunakan `tools` milik database. Jika isi Plus diubah, perhatikan bahwa Plus tetap membutuhkan satu `selected_tool` bernilai `money` atau `planner`.

Untuk nomor WhatsApp dan jalur pembayaran, edit `site/js/config.js`. Satu-satunya metode pembayaran adalah QRIS: ganti `site/img/qris.png` dengan QRIS resmi. Data ini bersifat publik, tetapi jangan menaruh PIN atau password layanan pembayaran di sana.

## Hosting: GitHub → Cloudflare Pages

Repo GitHub: `bannaalkhairriyanto/simple.yn` (publik). Cloudflare Pages terhubung ke repo itu sehingga setiap push ke `main` otomatis deploy.

1. Di Cloudflare Dashboard, buka **Workers & Pages → Create → Pages → Connect to Git**, lalu pilih repo.
2. Isi pengaturan build:
   - **Production branch**: `main`
   - **Root directory**: kosong (root repo)
   - **Build command**: `node --test tests/security.test.mjs`
   - **Build output directory**: `site`
3. Simpan. Cloudflare Pages hanya menerbitkan isi `site/`; `supabase/`, `examples/`, dokumentasi, dan backup tidak ikut terpublikasi.
4. Setiap push ke `main` memicu deploy produksi; pull request mendapat preview URL.
5. `site/_headers` dibaca apa adanya oleh Cloudflare Pages. Jangan menghapus CSP/HSTS dari berkas itu atau memindahkannya hanya ke dashboard.
6. Build command menjalankan tes keamanan; jika tes gagal, deploy dibatalkan. Alur yang sama juga berjalan di GitHub Actions (`.github/workflows/ci.yml`).
7. Repo bersifat **publik**, jadi jangan pernah commit `.env`, token, atau `service_role`. Publishable key di `site/js/config.js` memang untuk publik; pengamanan sebenarnya ada pada RLS dan fungsi server-side.

Setelah deploy, buka URL `*.pages.dev` lalu periksa header `content-security-policy` dan `strict-transport-security` di tab Network agar yakin `_headers` benar-benar diterapkan.

- `site/login.html` harus dapat diakses oleh pendaftar/login.
- Cloudflare Access pada `/app/*` boleh dipakai sebagai **lapisan tambahan** untuk kelompok kelas, tetapi bukan dasar pemeriksaan pembayaran. Cakupannya tidak boleh menghalangi calon pengguna yang perlu mendaftar; selesaikan alur Access lalu auth Supabase.
- Keamanan asli berada pada Auth + RLS + fungsi server-side di migrasi. Menyembunyikan tombol atau menambahkan aturan robot bukan pengamanan.
- Pengguna yang sudah login tetapi punya hak terbatas akan dialihkan ke halaman harga ketika membuka alat yang belum aktif. Admin mendapat `role: admin` dan semua tools `true` dari server.

## Testing lokal

Jalankan tes keamanan dan integritas:

```powershell
node --test tests/security.test.mjs
```

Pratinjau situs:

```powershell
cd site
python -m http.server 8000
```

Buka `http://localhost:8000/`. Jangan buka file langsung lewat `file://` karena JavaScript modul/fetch dan konfigurasi hosting tidak berperilaku sama.

Isi `config.js` dan `_headers` terlebih dahulu untuk pengujian fungsi penuh. Gunakan proyek Supabase terpisah untuk test bila memungkinkan. Jika `YOUR_PROJECT`/`PASTE_` masih ada, login dan pembelian memang berhenti; sistem tidak menyediakan akun demo atau bypass produksi.

Sebelum deploy, buat satu akun siswa uji dan satu admin uji:

- Siswa baru harus melihat akses belum aktif pada alat berbayar.
- `pending` baru hanya dapat dibuat saat login.
- Tombol admin tidak boleh dapat mengubah status dari akun siswa, meskipun dipanggil lewat REST secara langsung.
- Setelah admin menandai `paid`, periksa `entitlements` pada SQL Editor dan buka kembali dashboard siswa.
- Admin harus dapat membuka semua alat tanpa permintaan pembelian.
- Akses URL `baca.html?id=../../...` harus ditolak. Data PDF berbayar tidak boleh dapat diambil tanpa token sesi yang valid.

## Sesi

Simple.yn memakai klien resmi Supabase, PKCE, auto-refresh token, dan sign-out Supabase. Sesi browser standar disimpan oleh klien agar reload tetap login; token tidak dicetak, disalin ke JSON materi, atau disimpan bersama transaksi keuangan/tugas perangkat. Kegagalan memeriksa akses tidak diasumsikan sebagai pembayaran berhasil.

Batas penting: situs statis tidak dapat membuat cookie session HttpOnly sendiri. Lindungi XSS dengan CSP dan jangan menanam script pihak ketiga lain tanpa audit. Masa hidup sesi/revocation/MFA dikonfigurasi di Supabase. Baca `SECURITY.md` untuk ancaman yang masih harus ditangani di Supabase, Cloudflare, dan hosting.
