# NUTRASA — Authentication & Account Access Specification

**Versi:** Draft v1.3  
**Status:** Planning / developer handoff; belum disetujui untuk produksi  
**Lokasi:** [docs/03-features/auth-spec.md](auth-spec.md)\
**Platform:** React Native + Expo + TypeScript + Expo Router  
**Dependency:** [onboarding-spec.md](../01-design/onboarding-spec.md), [profile-spec.md](profile-spec.md), [offline-sync-spec.md](../02-architecture/offline-sync-spec.md) (akan dibuat), kebijakan privasi, pemilihan backend/auth provider.

## 1. Tujuan

Menyediakan identitas akun dan akses aman untuk data personal NUTRASA (profil tubuh, tujuan nutrisi, food logs, dan histori) sambil menjaga onboarding bisa dilanjutkan, kondisi offline aman, serta tidak mencampurkan data antar-akun.

**Prinsip:** Auth provider mengelola pembuktian identitas; backend memverifikasi token dan memberlakukan otorisasi berbasis user ID. Proteksi rute di Expo Router hanya untuk UX, bukan kontrol keamanan server.

## 2. Keputusan produk yang SUDAH DISEPAKATI

- Autentikasi dilakukan **sebelum onboarding**.
- MVP menawarkan email/password, Google, dan Apple (implementasi platform disesuaikan).
- Pendaftaran email belum terverifikasi **boleh melanjutkan onboarding**, dengan pembatasan operasi akun tertentu.
- Nama tampilan/username **opsional**, diatur kemudian melalui Profil; username tidak menjadi metode login MVP.
- Draft onboarding **disimpan lokal** dan baru dikirim ke server setelah onboarding selesai, sesuai validasi dan kebijakan verifikasi.
- Pemberitahuan pemrosesan data saat pendaftaran dan pemberitahuan lebih spesifik sebelum pengisian data tubuh.
- Saat target nutrisi layak dihitung, target awal **aktif otomatis**; bila tidak layak, log-only/needs-review mengikuti Nutrition Engine.
- Pengguna lama dengan sesi aktif dan onboarding lengkap masuk langsung ke Home.
- Pengguna dengan profil tidak didukung kalkulator tetap boleh menggunakan mode pencatatan tanpa rekomendasi otomatis.
- Mode offline-tolerant; perubahan lokal harus terlindungi dan tidak bocor saat akun berganti.

## 3. Batasan dan bukan cakupan MVP

Tidak mengembangkan sistem password atau OAuth dari nol, tidak menjadikan username credential, tidak menyediakan login tamu anonim kecuali diputuskan kemudian, tidak mencakup 2FA khusus aplikasi, passkeys, login nomor telepon, social login tambahan, atau akun keluarga. Premium/AI tidak dibahas di spesifikasi ini.

## 4. Provider terpilih dan detail integrasi yang belum final

**Stack terpilih:** Firebase Authentication sebagai identity provider; Fastify lokal memverifikasi token dan mengelola API aplikasi, PostgreSQL lokal menyimpan data domain, dan Expo SQLite mendukung cache/outbox. Lihat [architecture-decisions.md](../02-architecture/architecture-decisions.md). Pilihan SDK Firebase JS/native, integrasi email/Google/Apple, sesi mobile, linking, reset, verification, deletion, platform/build dan biaya layanan sesuai batas plan masih memerlukan review. Pemilihan vendor tidak berarti SDK sudah dipasang atau alur login sudah berjalan.

Backend menyimpan data pengguna dengan `user_id` internal stabil; simpan mapping `provider + provider_subject_id` bila perlu. Jangan jadikan alamat email sebagai primary key karena dapat berubah atau disembunyikan (Apple relay).

## 5. Status akun, session, dan onboarding — dipisahkan

### 5.1 Session state

- `INITIALIZING`: membaca credential aman dan memeriksa status sesi.
- `SIGNED_OUT`: belum mempunyai sesi valid.
- `SIGNED_IN`: sesi valid dan identitas user diketahui.
- `REFRESHING`: memperbarui credential saat memungkinkan.
- `OFFLINE_SESSION_UNVERIFIED`: identitas lokal sebelumnya diketahui tetapi server tidak bisa dihubungi; hanya kemampuan offline yang aman.
- `SESSION_EXPIRED`: refresh gagal atau sesi dicabut; perlu login ulang.

### 5.2 Email state

- `NOT_APPLICABLE`: login dari provider yang tidak memakai alur verifikasi email aplikasi yang sama.
- `UNVERIFIED`: email/password belum memverifikasi alamat.
- `VERIFIED`: verifikasi telah dikonfirmasi server/provider.
- `PENDING_CHANGE`: perubahan alamat sedang diverifikasi.

Jangan menyimpulkan semua identitas sosial memiliki alamat email yang selalu tersedia; Apple dapat memberi relay email dan data profil awal terbatas.

### 5.3 Onboarding state

`NOT_STARTED`, `IN_PROGRESS`, `CALCULATING`, `NEEDS_REVIEW`, `LOG_ONLY`, `COMPLETED` — mengikuti [onboarding-spec.md](../01-design/onboarding-spec.md).

### 5.4 Akun operasional

`ACTIVE`, `RESTRICTED`, `SUSPENDED`, `DELETION_PENDING`, `DELETED` (status final masih perlu review legal/backend).

## 6. Routing / akses

| Kondisi | Tujuan rute | Catatan |
|---|---|---|
| Sesi belum diperiksa | Splash/loading minimal | Tidak boleh flicker ke Home |
| Signed out | Welcome / Sign in / Sign up | Rute publik |
| Signed in + onboarding belum selesai | Onboarding step terakhir | Draft lokal bila tersedia |
| Signed in + onboarding completed | Home | Termasuk log-only |
| Email/password belum verified | Banner / pengingat verifikasi | Pembatasan aksi diputuskan server |
| Offline dan sesi sebelumnya dikenal | Data lokal milik user tersebut | Jangan klaim server session valid |
| Sesi revoked | Login ulang | Hindari menampilkan data user lain |
| Akun suspended/deleting | Status akun + support | Jangan lanjut sync normal |

**Konflik yang perlu diselesaikan:** Diskusi sebelumnya pernah mengusulkan *profil final ditahan sampai email diverifikasi*. Hal ini **belum disetujui pengguna**. Default rancangan sekarang adalah onboarding lokal dapat selesai, sedangkan operasi server yang sensitif dapat dibatasi sampai verifikasi. Daftar aksi yang diizinkan/ditahan harus disahkan setelah pemilihan auth provider dan threat model.

## 7. User flows

### 7.1 Email registration

1. Input email + password dan persetujuan yang diwajibkan.
2. Validasi format/aturan password pada klien dan server; hindari pesan yang membocorkan keberadaan akun.
3. Backend/provider membuat identitas dan mengirim verification link/OTP sesuai penyedia.
4. Aplikasi menyimpan sesi menggunakan penyimpanan aman jika sesi diberikan.
5. Pengguna boleh melanjutkan onboarding sebagai `UNVERIFIED` sesuai pembatasan.
6. Verifikasi dilakukan melalui tautan aman; deep link diperiksa dan diverifikasi di server/provider.
7. Perbarui status setelah fetch/refresh klaim dari server, bukan hanya mengandalkan parameter URL.

### 7.2 Email sign in

1. User memasukkan email/password.
2. Provider memvalidasi dan menerbitkan sesi.
3. Sistem melakukan session bootstrap dan memuat identitas/profile.
4. Arahkan ke onboarding atau Home berdasarkan status backend yang valid.
5. Jika offline, login pertama kali tidak dijanjikan tersedia; sesi sebelumnya dapat membuka data lokal secara terbatas sesuai kebijakan.

### 7.3 Google sign in

1. Pengguna menekan tombol Google.
2. Login melalui alur native/browser yang direkomendasikan provider; gunakan PKCE/state/nonce sesuai jenis flow.
3. Verifikasi token oleh backend/provider; jangan mempercayai email/ID yang hanya dikirim dari klien.
4. Buat/temukan user internal dan arahkan sesuai status onboarding.
5. Tangani user cancel, credential kedaluwarsa, provider error, dan aplikasi kembali dari browser.

### 7.4 Apple sign in

1. Tampilkan tombol Apple pada platform yang didukung dan menurut persyaratan review toko.
2. Dapatkan credential dari alur resmi, termasuk nonce bila diperlukan.
3. Validasi identity token di backend/provider (issuer, audience, expiry, nonce, signature).
4. Simpan identitas provider stabil; nama/email dapat hanya diberikan pertama kali, dan email dapat berupa relay.
5. Tangani user cancel dan pencabutan akses.

### 7.5 Forgot/reset password

1. Pengguna memasukkan email.
2. Aplikasi menampilkan pesan generik tanpa mengonfirmasi keberadaan akun.
3. Provider mengirim tautan reset singkat dengan expiry dan single-use / invalidasi sesuai kemampuan.
4. Tautan dibuka aman, password baru divalidasi.
5. Setelah reset, terapkan kebijakan rotasi/pencabutan sesi sesuai auth provider; jangan otomatis mengasumsikan sesi lama tetap aman.
6. Sediakan feedback keberhasilan/kegagalan dan mekanisme retry yang dibatasi.

### 7.6 Sign out / switch account

- Tampilkan peringatan jika ada operasi lokal belum tersinkron; tawarkan pilihan yang aman sesuai kebijakan.
- Cabut sesi/credential dari perangkat; opsi server-side revoke saat tersedia.
- Reset state in-memory, subscription, query cache, dan UI terkait pengguna.
- Data lokal terenkripsi/terisolasi per user, tidak boleh muncul pada akun berikutnya.
- Jika logout offline, jangan mempertahankan akses akun lama secara tidak sengaja melalui refresh otomatis.

### 7.7 Delete account

- Masuk lewat Profil > Privasi & Data > Hapus Akun.
- Minta reauthentication untuk tindakan sensitif jika relevan.
- Jelaskan dampak dan kebijakan retensi; cek sync queue, file lokal, data backend, data provider dan akun tertaut.
- Backend memproses penghapusan dengan audit minimal yang diizinkan; klien menghapus credential/cache milik akun terkait.
- Kebijakan penghapusan, masa tenggang, ekspor, dan mekanisme pembatalan: **legal review required**.

## 8. Account linking dan duplicate identity — usulan

- Satu akun internal dapat mempunyai lebih dari satu provider identity setelah linked secara eksplisit.
- **Jangan auto-link berdasarkan kesamaan email saja**, terutama email belum terverifikasi atau Apple relay.
- Jika akun dengan email serupa sudah ada, tampilkan alur pemulihan/link yang aman setelah pengguna membuktikan kepemilikan kedua identitas.
- Jangan membuat dua profil tubuh atau menggabungkan food logs otomatis tanpa review keputusan dan migrasi yang aman.
- Saat unlink provider, pastikan setidaknya ada cara login lain yang valid.
- Fitur linking dapat ditunda dari MVP bila auth provider dan desain keamanan belum siap; tetap rencanakan data modelnya.

## 9. Validasi input & keamanan

### Email/password
- Normalisasi email untuk pencarian sesuai provider, jangan mengubah alamat secara tidak aman.
- Panjang/format email dengan validasi yang tidak terlalu membatasi alamat valid.
- Password mengikuti kebijakan penyedia dan praktik modern: dukung frasa sandi panjang, hindari aturan komposisi rumit tanpa alasan, dan gunakan mekanisme server-side untuk kompromi/rate limits jika tersedia.
- Tidak ada password tersimpan di app logs, analytics, crash reports, database lokal, maupun source control.
- Validasi ulang seluruh input dan authorization di backend.

### Proteksi server/provider
- TLS untuk seluruh operasi akun dan data privat.
- Rate limiting terhadap login, signup, forgot password, resend verification.
- Proteksi enumerasi akun dan brute force; pertimbangkan CAPTCHA/risk detection hanya jika dibutuhkan.
- Token diverifikasi untuk setiap operasi privat; cek akses ke resource (`owner_user_id`).
- Reauthentication untuk perubahan email, password, penghapusan akun, dan link/unlink penyedia.
- Penyimpanan token di storage aman, misalnya `expo-secure-store`, jika kompatibel dengan SDK auth pilihan; bukan AsyncStorage biasa.
- Jangan memasukkan secret server atau client secret OAuth ke aplikasi mobile.
- Rotasi/revokasi credential mengikuti kemampuan provider dan ancaman.

## 10. Offline behavior

- Signup, first sign-in, reset password, verifikasi email, dan provider login membutuhkan koneksi.
- Jika sudah pernah login dan kunci lokal tersedia, aplikasi boleh menampilkan **data cache milik akun yang diketahui** sesuai kebijakan perlindungan lokal, tanpa mengklaim server masih mengizinkan operasi privat.
- Food logs offline memakai user identity lokal stabil, queue operations, dan status sync.
- Ketika reconnect: refresh/revalidate sesi dahulu, lalu sinkronisasi.
- Jika akun dicabut selama offline, sinkronisasi ditolak dan UI meminta reauthentication; queue tetap diamankan dan perlu kebijakan retensi.
- Jangan mengirim operasi akun A ketika sedang login sebagai akun B.
- Logout, delete account, uninstall, dan device sharing adalah skenario keamanan utama.

## 11. Error, loading, dan empty states

| State | UI/action |
|---|---|
| Provider loading | Disable submit ganda, tampilkan progress |
| Wrong credentials | Error generik, retry yang wajar |
| Email unverified | Banner jelas + resend dengan cooldown |
| Verification expired | Request link baru |
| Reset link expired/used | Kirim ulang permintaan reset |
| Social login canceled | Kembali ke layar awal tanpa error menyeramkan |
| Browser redirect failed | Safe fallback + retry |
| Network offline | Penjelasan operasi online yang dibutuhkan |
| Rate limited | Retry setelah cooldown tanpa mengungkap detail sensitif |
| Session refresh failed | Reauthenticate, jangan hapus queue sembarangan |
| Account conflict | Alur linking/recovery, tidak auto-merge |
| Account deleted/suspended | Halaman status, hentikan data sync |
| Server error | Pesan generik + retry; log aman tanpa PII/token |

## 12. Data contracts konseptual (belum skema SQL)

**Auth identity**: `user_id`, `provider`, `provider_subject_id`, `email?`, `email_verified`, `linked_at`, `last_used_at`.

**User account**: `user_id`, `account_status`, `created_at`, `updated_at`, `deleted_at?`.

**Profile**: menggunakan user ID stabil untuk data tubuh; jangan menaruh data kesehatan dalam payload token kecuali perlu dan aman.

**Onboarding**: `user_id`, `status`, `completed_at?`, `profile_version`, `nutrition_plan_id?`, `log_only_reason?`.

**Client session**: token hanya lewat SDK/provider secure store; status bootstrap lokal, bukan penyimpanan manual password.

**Audit events**: kode kejadian dan waktu tanpa password/token/data tubuh; masa simpan perlu review.

## 13. Saran pembagian modul di Expo

```text
app/
  (auth)/
    sign-in.tsx
    sign-up.tsx
    forgot-password.tsx
  (onboarding)/
  (tabs)/
  _layout.tsx
src/features/auth/
  components/       # Hanya bila diperlukan
  hooks/            # State/perilaku fitur
  services/         # Adapter ke provider (setelah dipilih)
  schemas/          # Validasi input
  types/            # Kontrak auth internal
src/lib/            # Konfigurasi provider yang dipakai lintas fitur
```

Folder contoh, **jangan membuat semuanya kosong** saat implementasi. Route groups tidak masuk sebagai bagian URL. Pemisahan navigator tidak boleh menggantikan otorisasi API.

## 14. Matriks pengujian acceptance

| ID | Skenario | Expected |
|---|---|---|
| AU-01 | Daftar email sah | Akun tercipta, status verifikasi benar |
| AU-02 | Email tidak valid | Pesan field, tak melakukan request sukses |
| AU-03 | Password tidak memenuhi kebijakan | Ditolak dengan feedback yang jelas |
| AU-04 | Email sudah terdaftar | Response tidak membocorkan info lebih dari kebijakan |
| AU-05 | Login berhasil | Sesi aman, route sesuai onboarding |
| AU-06 | Login gagal | Tidak ada sesi, rate limiting berlaku |
| AU-07 | Verifikasi email terlambat | Bisa resend sesuai cooldown |
| AU-08 | Email belum verified | Onboarding diperbolehkan sesuai aturan; aksi terbatas diuji |
| AU-09 | Link verifikasi kedaluwarsa | Error aman + resend |
| AU-10 | Forgot password email tidak dikenal | Pesan generik |
| AU-11 | Reset password sukses | Password baru diterima, kebijakan sesi dijalankan |
| AU-12 | Google login berhasil | Satu user internal terpetakan |
| AU-13 | Google login cancel | Tidak membuat user secara tak sengaja |
| AU-14 | Apple login berhasil | Provider subject ID stabil, email opsional |
| AU-15 | Apple menolak/menutup alur | Aplikasi kembali aman |
| AU-16 | Aplikasi dibuka ulang, sesi valid | Langsung ke Home atau onboarding sesuai status |
| AU-17 | Refresh gagal | Login ulang, queue lokal tidak bocor |
| AU-18 | Sign out saat queue kosong | Sesi dan state pengguna terhapus dari UI |
| AU-19 | Sign out dengan queue pending | Peringatan/penanganan sesuai kebijakan |
| AU-20 | User A logout, User B login | Data A tak terlihat/tersinkron ke B |
| AU-21 | Dua provider memakai email sama | Tidak auto-link tanpa bukti kepemilikan |
| AU-22 | Unlink provider terakhir | Ditolak sampai tersedia alternatif login |
| AU-23 | Offline setelah pernah login | Hanya data lokal terotorisasi yang tersedia |
| AU-24 | Offline first login | Pesan perlu koneksi |
| AU-25 | Session dicabut saat offline | Server menolak sync ketika reconnect |
| AU-26 | Deep link reset dimanipulasi | Token tidak diterima tanpa validasi server |
| AU-27 | API memanggil data akun lain | Server menolak akses |
| AU-28 | Resend berulang | Rate limit/cooldown |
| AU-29 | Delete account | Data dan sesi dibersihkan sesuai kebijakan |
| AU-30 | Logging/crash | Tidak mengandung password, token, atau informasi kesehatan |
| AU-31 | Onboarding draft saat logout | Tidak muncul di akun lain |
| AU-32 | Email diubah | Verifikasi ulang dan reauth sesuai kebijakan |

## 15. Acceptance criteria sebelum implementasi selesai

- Seluruh provider yang termasuk scope platform telah diuji pada development build/perangkat yang sesuai.
- Route guard benar untuk signed-out, signed-in, incomplete onboarding, log-only, dan restricted account.
- Backend memverifikasi credential dan kepemilikan seluruh data privat.
- Tidak ada password/token di logs, analytics, crash reports, atau penyimpanan tak aman.
- Pengguna email belum verified menjalani flow yang jelas dan konsisten dengan kebijakan pembatasan.
- Pengguna dapat reset password, resend verifikasi, logout, serta kembali login.
- Draft onboarding lokal dan offline cache terisolasi per akun.
- Test AU-01..AU-32 lulus; dokumentasi risiko tersisa tercatat.
- Audit legal/privacy dan store policy selesai sebelum rilis.

## 16. Decision register (BELUM FINAL)

| ID | Pertanyaan | Rekomendasi awal | Perlu review |
|---|---|---|---|
| ADR-A01 | Provider auth utama | Firebase Authentication dipilih — ADR-001 | Pilihan provider selesai; detail SDK/platform dan cost limits masih perlu review |
| ADR-A02 | Email belum verified: fitur mana dibatasi | Batasi operasi berisiko, bukan seluruh onboarding | Product + security |
| ADR-A03 | Berapa lama sesi bertahan | Mengikuti kebijakan provider dan threat model | Security |
| ADR-A04 | Apakah account linking tersedia MVP | Bisa tunda UI, siapkan model | Product + security |
| ADR-A05 | Strategi pengamanan data offline | Enkripsi/isolasi sesuai threat model dan perangkat | Security |
| ADR-A06 | Username unik atau hanya display name | Display name opsional, unik nanti | Product |
| ADR-A07 | Alur delete, ekspor, dan retensi | Ditinjau berdasarkan kewajiban yang berlaku | Legal |
| ADR-A08 | Verifikasi email saat transfer draft lokal | Tentukan status finalisasi server secara tegas | Product + security |
| ADR-A09 | Login ulang setelah akun dihapus/suspended | Block token dan queue sesuai kebijakan | Technical |
| ADR-A10 | Penanganan email yang tidak tersedia dari Apple | Gunakan provider subject ID | Technical |
| ADR-A11 | Tautan/deep link, domain, redirect | Whitelist dan verifikasi sesuai SDK provider | Technical |
| ADR-A12 | Akun yang berganti identitas/login method | Linking eksplisit setelah reauth | Security |

## 17. Review gates

- **LEGAL REVIEW:** ketentuan akun dan privasi, dasar pemrosesan data tubuh, umur dan kelompok khusus, retensi/hapus/ekspor, ketentuan Apple/Google dan app stores.
- **SECURITY REVIEW:** identitas provider, token/session/refresh/revocation, rate limit, linking, logout multi-akun, secure store, device-sharing, data cache, backend authorization.
- **TECHNICAL REVIEW:** Expo SDK/provider SDK kompatibel, development builds, native capabilities, callback/deep-link, Android/iOS, RLS/API and auth provider support.
- **PRODUCT REVIEW:** pembatasan email unverified, copywriting, flow recovery, login provider availability dan fallback.

## 18. Referensi resmi untuk implementasi (cek lagi versi saat coding)

- Expo authentication overview: https://docs.expo.dev/develop/authentication/
- Expo authentication SDKs: https://docs.expo.dev/guides/using-authentication/
- Expo Apple authentication: https://docs.expo.dev/versions/latest/sdk/apple-authentication/
- Expo Google authentication: https://docs.expo.dev/guides/google-authentication/
- Expo secure storage and OAuth: https://docs.expo.dev/guides/authentication/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

**Status akhir:** Firebase Authentication sudah dipilih, tetapi **belum ada implementasi auth produksi**. Detail integrasi provider/SDK, pembatasan email, serta review keamanan/legal masih terbuka.
