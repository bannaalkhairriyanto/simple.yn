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
- `supabase/migrations/` — empat migrasi berurutan; `001` berisi tabel, trigger, fungsi RPC, RLS, dan kebijakan Storage, lalu `002`–`004` adalah perbaikan yang wajib ikut diterapkan.
- `tests/security.test.mjs` — tes keamanan dan integritas statis (CSP, inline script, tautan rusak, halaman terkunci, origin Supabase).
- `.github/workflows/ci.yml` — menjalankan tes yang sama pada setiap push dan pull request.
- `site/_headers` — CSP dan HSTS yang dibaca langsung oleh Cloudflare Pages.
- `site/404.html` — halaman untuk alamat yang tidak ada. Tanpa berkas ini Cloudflare Pages membalas `200` berisi beranda untuk setiap path salah, sehingga berkas yang seharusnya tidak terbit tampak "ada".
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
supabase/migrations/004_fix_pending_limit_and_approval.sql
```

`001` membuat skema dan kebijakan, `002` membatasi jumlah permintaan `pending`, `003` mencabut izin bawaan Supabase yang terlalu luas, dan `004` memperbaiki dua cacat yang ditemukan lewat uji end-to-end: batas 3 permintaan yang sebelumnya bisa dilewati, serta persetujuan admin yang gagal dengan `permission denied` setelah `003` mencabut izin `UPDATE`. **Jangan lewati `003` dan `004`:** tanpa `003`, pengguna yang login dapat mengubah peran atau status pembayarannya sendiri; tanpa `004`, admin tidak dapat menekan **Tandai dibayar**. Kamu juga dapat menggunakan workflow migrasi `supabase db push` jika Supabase CLI sudah dipasang dan terhubung ke proyek. Migrasi ini akan membuat:

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

**Membuat admin pertama tanpa menunggu email konfirmasi:** buka **Authentication → Users → Add user**, isi email dan kata sandi, lalu centang **Auto Confirm User**. Akun langsung aktif walau SMTP belum diisi. Setelah itu promosikan lewat SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'alamat-pengelola@example.com';
```

Akun dengan `role = 'admin'` mendapat semua alat dan tautan **Kelola materi**; tautan itu tetap hanya tampil setelah server mengonfirmasi peran, dan halaman admin tetap menolak akses di sisi RLS.

### Mengatur URL Auth, konfirmasi email, dan SMTP

Halaman `login.html` mengirim `emailRedirectTo` ke `/login.html` pada origin yang sedang dibuka. Supabase hanya mau mengarahkan ke origin yang terdaftar:

1. Buka **Authentication → URL Configuration**.
2. **Site URL**: origin produksi. Untuk proyek ini `https://simple-yn.pages.dev` (ganti bila memakai domain sendiri). Jangan biarkan `http://localhost:3000` saat rilis.
3. **Redirect URLs**: tambahkan `https://simple-yn.pages.dev/login.html`. Tambahkan juga URL preview `https://<hash>.simple-yn.pages.dev/login.html` bila preview dipakai untuk uji coba.
4. Buka **Authentication → Providers → Email**: aktifkan **Confirm email** dan tetapkan **minimum password length 12** agar sama dengan aturan di `auth.js` (12–72 karakter).

**Konfirmasi email wajib punya SMTP sendiri sebelum rilis. Ini bukan sekadar soal limit.** Tanpa SMTP kustom, Supabase hanya mau mengirim ke alamat yang terdaftar sebagai anggota tim organisasi; alamat pengguna lain ditolak dengan pesan *Email address not authorized*. Batasnya juga hanya **2 email per jam**, dan saat pengujian email konfirmasi ketiga memang ditolak `429 too many requests`. Artinya pendaftaran mahasiswa lain akan gagal total sebelum SMTP diisi.

Isi di **Authentication → SMTP Settings** (`/project/_/auth/smtp`):

| Kolom | Isi |
|---|---|
| Enable Custom SMTP | aktif |
| Sender email | alamat pengirim yang **sudah diverifikasi** di penyedia, mis. `simpleyn@gmail.com` |
| Sender name | `Simple.yn` |
| Host | host SMTP penyedia, mis. `smtp-relay.brevo.com` |
| Port | `587` (STARTTLS) atau `465` (TLS) |
| Username | login SMTP dari halaman SMTP penyedia, bukan selalu email akun |
| Password | SMTP key / app password, bukan kata sandi akun |

Pilihan penyedia untuk proyek tanpa domain sendiri:

- **Gmail SMTP (paling andal tanpa domain)** — host `smtp.gmail.com`, port `587`, username = alamat Gmail lengkap, password harus **App Password 16 karakter** (aktifkan verifikasi 2 langkah dulu), bukan kata sandi Gmail biasa. Pesan dikirim oleh server Google sendiri sehingga SPF dan DKIM `gmail.com` valid; batasnya sekitar 500 penerima per hari. Cukup untuk satu kelompok kelas.
- **Brevo** — gratis 300 email/hari dan tidak perlu domain, tetapi **jangan memakai alamat `@gmail.com` sebagai Sender di Brevo**: Brevo tidak termasuk SPF `gmail.com` dan tidak bisa menandatangani DKIM untuk domain itu, jadi pesan akan sering masuk spam atau ditolak. Brevo baru masuk akal setelah punya domain sendiri (verifikasi domain, lalu SPF/DKIM diatur di DNS).
- **Resend / ZeptoMail / SendGrid** — wajib domain terverifikasi beserta DKIM/SPF/DMARC. Ini jalur terbaik untuk jangka panjang, tetapi harus menunggu domain.

Kesimpulan praktis: pakai **Gmail App Password** sekarang agar konfirmasi email sampai ke mahasiswa, lalu pindah ke Brevo/Resend saat domain sudah ada. Jangan memakai Gmail sebagai pengirim lewat Brevo.

Setelah tersimpan, naikkan **Authentication → Rate Limits → Emails sent by Supabase Auth** (default 30 per jam) sesuai kebutuhan. Jangan mematikan **Confirm email** untuk menembus limit: itu membuka pendaftaran palsu oleh bot dan merusak reputasi domain pengirim.

Uji dengan alamat email sungguhan di luar tim: daftar di `https://simple-yn.pages.dev/login.html`, pastikan email masuk (periksa folder spam), klik tautannya, dan pastikan mendarat di halaman login situs, bukan `localhost`.

Perlindungan kata sandi bocor (*leaked password protection*) hanya tersedia pada paket berbayar Supabase. Selama proyek memakai paket gratis, fitur itu tetap nonaktif; ini keputusan pemilik proyek, bukan kelalaian konfigurasi.

### Checklist sebelum rilis

Beberapa hal sengaja dibiarkan sebagai placeholder agar tidak menampilkan data palsu. Ganti sebelum situs dipublikasikan:

- `site/privasi.html` dan `site/syarat.html` masih memuat `[TANGGAL]` serta `[PENGELOLA: ...]`. Isi tanggal berlaku, nama/alamat/kontak pengelola, dan kebijakan pengembalian dana. Halaman itu juga berlabel **DRAFT**.
- `site/img/qris.png` masih gambar contoh; ganti dengan QRIS resmi milikmu.
- `site/js/config.js`: `payment.whatsAppNumber` sudah diisi nomor asli; jangan ganti dengan nomor contoh. Pastikan juga harga di `bundles`/`singles` sama dengan tabel `plans`.
- Buat akun admin pertama (bagian 4) dan pastikan **Kelola materi** serta **Persetujuan pembayaran** terbuka.
- Selesaikan **URL Auth + SMTP** di atas, lalu daftarkan satu akun sungguhan dari perangkat lain untuk memastikan email konfirmasi sampai.

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

Repo GitHub: `bannaalkhairriyanto/simple.yn` (publik). Cloudflare Pages terhubung ke repo itu sehingga setiap push ke `main` otomatis deploy. Situs produksi: **https://simple-yn.pages.dev**

1. Di Cloudflare Dashboard, buka **Workers & Pages → Create → Pages → Connect to Git**, lalu pilih repo.
2. Isi pengaturan build:
   - **Production branch**: `main`
   - **Root directory**: kosong (root repo)
   - **Build command**: `node --test tests/security.test.mjs`
   - **Build output directory**: `site`
   - **Environment variable** (opsional): `NODE_VERSION` = `22`
3. Simpan. Cloudflare Pages hanya menerbitkan isi `site/`; `supabase/`, `examples/`, dokumentasi, dan backup tidak ikut terpublikasi.
4. Setiap push ke `main` memicu deploy produksi; pull request mendapat preview URL.
5. `site/_headers` dibaca apa adanya oleh Cloudflare Pages. Jangan menghapus CSP/HSTS dari berkas itu atau memindahkannya hanya ke dashboard. Berkas itu juga menetapkan `Cache-Control: max-age=0, must-revalidate` untuk `/js/*` dan `/css/*` agar perubahan skrip langsung terpakai setelah deploy, bukan tertahan cache browser.
6. Build command menjalankan tes keamanan; jika tes gagal, deploy dibatalkan. Alur yang sama juga berjalan di GitHub Actions (`.github/workflows/ci.yml`).
7. Repo bersifat **publik**, jadi jangan pernah commit `.env`, token, atau `service_role`. Publishable key di `site/js/config.js` memang untuk publik; pengamanan sebenarnya ada pada RLS dan fungsi server-side.

> **Jangan memakai alur Workers untuk situs ini.** Form "Import a Git repository" versi Workers menjalankan `npx wrangler deploy` dan menebak folder aset sendiri. Saat dicoba, Wrangler memilih `demo-backup/` sehingga yang terbit hanya tiga halaman stub lama tanpa CSP. Tanda-tandanya: ada isian **Deploy command**, muncul `wrangler.jsonc`, dan URL berakhiran `*.workers.dev`. Hapus Worker seperti itu, lalu buat proyek lewat tab **Pages**.

Setelah deploy, buka URL `*.pages.dev` lalu periksa header `content-security-policy` dan `strict-transport-security` di tab Network agar yakin `_headers` benar-benar diterapkan. Uji juga bahwa path di luar `site/` benar-benar `404`, bukan `200`:

```powershell
curl.exe -sI https://simple-yn.pages.dev/
curl.exe -sI https://simple-yn.pages.dev/js/auth.js   # harus ada cache-control: max-age=0, must-revalidate
curl.exe -s -o NUL -w "%{http_code}`n" https://simple-yn.pages.dev/README.md          # 404
curl.exe -s -o NUL -w "%{http_code}`n" https://simple-yn.pages.dev/supabase/migrations/001_auth_payments_summaries.sql  # 404
```

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

`site/js/config.js` sudah menunjuk ke proyek produksi `pwshbnunqzgsqhidadse`, jadi **tes manual akan menulis ke database produksi**. Tidak ada proyek staging di repo ini. Untuk uji alur pembelian, pakai akun uji sekali pakai lalu hapus lewat SQL Editor (`auth.users`, `profiles`, `purchase_requests`, `entitlements`). Jangan menguji dengan akun asli pengguna.

Jika `YOUR_PROJECT`/`PASTE_` masih ada, login dan pembelian memang berhenti; sistem tidak menyediakan akun demo atau bypass produksi.

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
