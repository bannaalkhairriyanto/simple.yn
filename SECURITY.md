# Keamanan Simple.yn dengan Supabase

Simple.yn sekarang menggunakan login sungguhan dan pemeriksaan akses di backend. Jangan menganggap status yang terlihat di html sebagai pembatas keamanan. Otorisasi diterapkan pada tabel dan fungsi SQL di `supabase/migrations/`. Terapkan `001`, `002`, `003`, `004`, lalu `005` sesuai urutan; `003` mencabut izin tabel bawaan Supabase yang tidak boleh dimiliki `anon`/`authenticated`, `004` menutup celah batas permintaan serta memperbaiki persetujuan admin, dan `005` memperbaiki trigger pembuatan profil yang membuat pembuatan akun lewat dashboard gagal.

## Model akses yang digunakan

### Otentikasi

- Registrasi mengambil username, email, dan password. Login menggunakan email dan password.
- Password dikirim oleh klien resmi Supabase langsung ke Supabase Auth. Tidak disimpan di `localStorage` aplikasi, JSON, tabel `profiles`, repository, atau panel admin. Field password tidak dikirim ke hosting statis: formulir login baru diaktifkan setelah JavaScript berhasil dimuat.
- Riwayat username hanya berisi 3–24 karakter huruf kecil, angka, dan garis bawah. Email dibatasi 100 karakter. Password baru dibatasi 12–72 karakter dan ada pengulangan password di pendaftaran.
- Pesan gagal login tidak menjelaskan apakah email terdaftar atau bagian mana yang salah. Kebijakan konfirmasi email, minimum password, MFA, dan durasi sesi harus dikonfigurasi di Supabase.

### Sesi browser

- Client resmi dikonfigurasi dengan **PKCE**, **auto-refresh token**, dan penyimpanan sesi browser Supabase agar reload tetap masuk.
- `getUser()` memeriksa user ke server sebelum pemeriksaan hak akses. UI tidak mengandalkan `user_metadata` untuk membuktikan identitas maupun hak.
- Sign-out memakai `supabase.auth.signOut()`. Listener sesi mengembalikan halaman app ke form login ketika sesi berakhir.
- Kegagalan membaca sesi/access RPC menghasilkan pesan gagal, bukan `owned = true` atau akses fallback gratis.
- Redirect pasca-login dibatasi ke path absolut situs sendiri; URL eksternal pada parameter `berikut` ditolak.

**Batas:** situs statis tidak dapat membuat cookie HttpOnly sendiri. Supabase JS menyimpan token sesi di browser sesuai konfigurasi klien standard. XSS extension/browser yang sudah dikompromikan tetap berisiko terhadap token tersebut. Gunakan HTTPS, CSP ketat, dependency minimum / vendor lokal, dan jangan memuat script pihak ketiga tanpa peninjauan baru. Jika nantinya kamu memerlukan token yang tidak pernah tersentuh JavaScript, pindahkan sesi ke aplikasi server/SSR dengan cookie HttpOnly.

### Peran dan pembayaran

- Trigger registrasi membuat profil `student`; metadata pendaftar tidak boleh menentukan peran. Admin pertama dibuat lewat SQL Editor oleh database owner, lalu role admin berikutnya dikelola lewat database.
- Mahasiswa hanya bisa memperbarui username dirinya sendiri. Tidak ada input frontend untuk menulis `role` atau `entitlements`.
- `get_access()` menghitung hak dari server. Admin mendapatkan `money`, `planner`, dan `summaries = true` tanpa purchase request. Selain itu, setiap tool memerlukan entri `entitlements` untuk user yang sama.
- Hanya siswa login yang bisa membuat permintaan untuk dirinya. Trigger menghapus klaim `paid` dari insert baru, menetapkan `pending`, menyalin user ID dari JWT, dan mengambil harga langsung dari tabel `plans`.
- Permintaan Plus tanpa `selected_tool` yang sah ditolak. Tools pada entitlements berasal dari katalog database, bukan dari isi pesan WhatsApp.
- `admin_purchases()` dan `admin_mark_purchase()` mengecek `is_admin(auth.uid())` setiap kali dipanggil. Mahasiswa tidak bisa mengganti status atau menyetujui dirinya cukup dengan memanggil REST secara manual.
- Setelah admin menandai `paid`, trigger grants memakai `ON CONFLICT DO NOTHING` agar idempoten. Permintaan berstatus selesai tidak boleh diubah oleh panel sehingga tidak terjadi pembayaran yang stabiliza secara implisit.

## Materi privat

### Struktur dan akses

- Materi tidak lagi disediakan dari `/app/data/`. File contoh lama dipindah ke folder `examples/` yang tidak ikut di-deploy sehingga tidak ada URL publik alternatif ke isi materi.
- Metadata dipisahkan dari `body_md` dan `pdf_path`. Material yang dibeli tetap membaca judul/daftar, tetapi isi berbayar tidak dapat diambil hanya dengan menebak URL record.
- Metadata dapat dibaca user authenticated. Isi Markdown/PDF dilindungi RLS dan hanya tersedia kepada role admin, pemilik akses summaries, atau pembaca materi **minggu 1** sebagai pratinjau. `read_summary()` menerapkan aturan yang sama saat menggabungkan metadata dan isi.
- Bucket `summary-private` bersifat privat, membatasi PDF ke `application/pdf` maksimal 20 MB, dan hanya menerima upload admin. Nama PDF diturunkan dari ID materi tervalidasi.
- Reader PDF meminta signed URL dengan masa berlaku **300 detik**, membukanya di tab baru dan tidak memakai `<embed>`/`<object>`. Origin signed URL harus cocok dengan origin Supabase yang dikonfigurasi.

Aturan Storage mengizinkan admin penuh atas objek bucket tersebut. User lain perlu akses summaries atau objek yang tepat cocok metadata minggu 1. Bot/crawlers tanpa login seharusnya menerima penolakan dari RLS/Storage.

**Batas link:** siapa pun yang diberi signed URL secara sengaja dapat membacanya hingga lima menit selesai, bahkan dari browser lain. Ini membatasi jendela eksposur, bukan DRM. Jangan mengunggah data pribadi/rahasia pada materi dan jangan membagikan link berbayar ke luar kelompok.

### Admin upload

- Pratinjau Markdown menggunakan renderer aman yang sama dengan reader. HTML mentah menjadi teks; engine hanya membuat paragraf, heading, daftar, emphasis, code, dan tautan dengan DOM dan `textContent`.
- Link Markdown hanya mendukung `http`, `https`, `mailto`, dengan `rel="noopener noreferrer"`; link web diberi `target="_blank"`. Raw HTML tidak dijalankan dan tidak ada evaluasi isi sebagai JavaScript.
- Admin publish memanggil fungsi SQL yang tetap memeriksa `is_admin`. Nilai course/title walid sampai 100 karakter, minggu 1–52, ID huruf kecil/angka/tanda hubung, tanggal nyata, serta tipe md/pdf.
- PDF diperiksa ekstension dan header `%PDF-` di browser. Batasin ukuran dan MIME juga diterapkan oleh bucket. **Pemeriksaan header bukan pemindai malware**; upload hanya dari admin tepercaya, dan gunakan prosedur antivirus organisasi bila dibutuhkan.
- PDF baru dikirim setelah tombol publikasikan ditekan, dengan `upsert: false` agar tidak menimpa materi lain. Jika rekaman database gagal setelah unggahan, panel mencoba menghapus file tersebut.
- `read_summary(id)` tetap mencari ID pada database; tidak membangun path server berdasarkan parameter peramban. Untuk PDF, signed URL tetap mengandalkan policy Storage di backend.

## Frontend dan header

- Tidak ada inline `<script>`, atribut `style="..."`, event-handler inline, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, atau `new Function` pada kode aplikasi.
- Data dinamis dibuat melalui DOM, bukan HTML string. Vendor Supabase hanya dipakai untuk integrasi auth/data resmi. Versi bundle disimpan lokal di `site/js/vendor/` dengan lisensi MIT; runtime tidak mengambil SDK dari CDN.
- `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, dan `form-action 'self'` dipertahankan.
- `connect-src` harus berisi origin situs dan **hanya** origin proyek Supabase yang dipakai. Ganti placeholder pada `_headers` agar Supabase dapat melayani auth/REST/Storage. Jangan ubah menjadi `*` atau `unsafe-inline`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, serta permissions policy yang mematikan kamera/mikrofon/geolocation juga dipertahankan.
- Tidak ada analytics/tracker bakal disembunyikan dalam login, checkout, maupun tool. Google Fonts tetap menjadi pengecualian resource statis demi desain, sedangkan WA hanya dibuka lewat tindakan pengguna.
- `_headers` otomatis berlaku di Cloudflare Pages; di hosting lain seluruh aturan harus disetel manual pada server. Verifikasi header response yang sesungguhnya.

## Data mahasiswa dan hal-hal yang perlu disetel di luar kode

Supabase sekarang menyimpan identitas akun (email, username), role, serta permintaan pembelian (plan, nominal, waktu, status, user ID). Itu perlu untuk akun dan verifikasi pembayaran manual. Informasikan anggota kelompok tentang tujuan serta retensinya:

- Batasi siapa admin yang dapat membaca seluruh profil permintaan, dan hapus data akun yang tidak lagi dipakai menurut aturan kelompok.
- Catatan Money Tracker/Planner tetap hanya di `localStorage` masing-masing perangkat dan diberi akhiran ID user terverifikasi, misalnya `simpleyn.keuangan.v1.<uuid>`. Data lama yang tidak bernama-user tidak dimigrasikan agar tidak berpindah pemilik secara keliru. Catatan tidak disalin ke Supabase. Validasi skema JSON, panjang text max 100, amount bulat positif < Rp1 miliar, dan tanggal nyata tetap diterapkan serta ada fallback daftar kosong.

**Batas alat statis:** pemeriksaan akses Money Tracker dan Study Planner terjadi sebelum UI inisialisasi dan menggunakan hasil server. Namun, seluruh kode alat tetap merupakan JavaScript statis yang bisa dibaca/dimodifikasi pengguna; pembatas tersebut bukan pengamanan komputasi server. Tidak ada catatan mahasiswa lain yang terekspos lewat fungsi itu dalam alur normal, tetapi script devtools dan akses ke profil browser lokal tidak dapat dicegah oleh UI. Jangan menaruh rahasia atau algoritma berbayar sensitif pada alat lokal tersebut. Jika pembatasan pembayaran harus memproteksi fungsinya secara kuat, pindahkan eksekusinya ke backend atau kirim fungsi melalui layanan yang menyetujui klaim server. Materi privat, role, permintaan pembayaran, dan tindakan admin di atas sudah diproteksi server melalui RLS.
- Penghapusan seluruh catatan keuangan/tugas meminta konfirmasi. Tidak ada sinkronisasi, server export, maupun halaman admin untuk memata-matai catatan personal tersebut.
- Supabase/dashboard owner dan Cloudflare administrator wajib memakai **2FA/MFA** dan izin minimum. Database password, service-role key, access token, secret webhook, dan recovery code tidak boleh masuk repo maupun `site/`.
- Jika memakai Cloudflare Access untuk `/app/*`, pahami itu hanya lapisan tambahan untuk kelompok. Allowed identity policy dan sesi Cloudflare bukan pengganti pembayaran Supabase. `/login.html` harus tetap mampu melayani pendaftaran/login sesuai alur yang dipilih.
- Lakukan HTTPS, backup dan review RLS/policy yang teratur, serta rotasi credential sesuai panduan Supabase/Cloudflare.
- Sebelum produksi, uji RLS dengan dua akun nyata: siswa tanpa bayar, siswa setelah dibayar, admin, serta pemanggilan REST tanpa token. Ini tidak dapat digantikan oleh pengujian UI saja.

## Pengujian yang disarankan

1. Tanpa login, membuka alat harus diarahkan ke login dan metadata/private content tidak bisa diambil secara unauthorized.
2. Mahasiswa tidak dapat memilih role admin lewat metadata registration, profile update, REST, maupun entitlements direct insert.
3. Insert request dengan `status = paid` dan harga palsu harus menjadi `pending` dengan nominal dari `plans`.
4. RPC `admin_mark_purchase` dari mahasiswa harus ditolak, walaupun user mengganti parameter ID permintaan.
5. Admin bisa upload preview berbentuk HTML/raw markdown tanpa menjalankan script dan hanya admin yang dapat menyetujui transaksi.
6. Admin tanpa purchase request memperoleh semua tools gratis. Pembeli tunggal hanya mendapat tool tersebut; paket Plus mendapat summaries + alat pilihannya.
7. Signed URL PDF kedaluwarsa dan berawalan proyek Supabase yang benar. Path traversal `baca.html?id=../../...` tetap gagal.
8. Cek log browser/developer tools agar password, access token, isi transaksi keuangan, tugas, dan materi privat tidak dicetak ke console.
