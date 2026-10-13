# NUTRASA — Decision 08: Security, Privacy, Logout & Account Deletion

**Status:** Keputusan desain teknis untuk MVP — disepakati berdasarkan mandat pemilihan solusi sederhana dan aman; **belum ada implementasi**.  
**Stack:** Expo / React Native / TypeScript; Firebase Authentication; Fastify (Node.js) lokal; PostgreSQL lokal; Expo SQLite.  
**Prinsip:** biaya layanan development Rp0; privasi ketat; offline-tolerant; tidak mengorbankan keamanan demi kompatibilitas Expo Go.  
**Tanggal:** 2026-10-13

## 1. Keputusan yang dikunci

1. **Pengguna terautentikasi tidak diwajibkan memverifikasi email untuk fitur utama.** Verifikasi opsional di `Profil > Pengaturan > Data Diri` (Decision 01); operasi sensitif bisa mensyaratkan re-authentication / verifikasi khusus mengikuti aturan Firebase.
2. **Data pribadi lokal wajib dienkripsi saat digunakan pada build yang memuat data nyata.** Rekomendasi: `expo-sqlite` dengan **SQLCipher** via config plugin dan **Expo Development Build** untuk Android/iOS; tidak mengandalkan Expo Go untuk pengujian database terenkripsi. SQLCipher tidak didukung di Expo Go.
3. **Kunci database berentropi tinggi dibuat per instalasi/per ruang akun**, disimpan di `expo-secure-store` (Android Keystore/iOS Keychain), bukan di repo, env publik, AsyncStorage, log, atau PostgreSQL. SecureStore untuk nilai kecil seperti token/kunci, bukan seluruh food log.
4. **Sesi Firebase** menggunakan mekanisme persistensi yang sesuai dengan SDK Expo yang dipilih; kredensial rahasia ditangani di penyimpanan aman dan tidak dicatat di log. Pilihan adapter SDK di-finalkan dan diuji di development build sebelum implementasi auth. Jangan menganggap semua mode persistensi Firebase JS SDK memakai SecureStore secara otomatis.
5. **Backend wajib verifikasi Firebase ID token pada tiap request privat**, validasi issuer/audience/proyek, ambil `uid` terverifikasi sebagai identitas otoritatif dan terapkan authorization pada data milik akun. `user_id` dari body/query tidak boleh dipercaya sebagai penentu pemilik data.
6. **Logout membersihkan semua data pribadi pada perangkat saat logout selesai**: SQLite pribadi, sync queue, draft onboarding, cache pribadi, file pribadi, sesi/token, serta state in-memory. Katalog publik boleh dipertahankan jika benar-benar tidak mengandung data pribadi.
7. **Jika ada perubahan offline belum tersinkron**, tampilkan pilihan: (a) sinkronkan dulu (perlu jaringan, logout setelah sukses); (b) batal; (c) logout dan hapus data lokal dengan peringatan kehilangan data yang belum ada di server. Tidak ada unggah tersembunyi setelah sesi logout.
8. **Hapus akun dilaksanakan melalui workflow backend yang dapat diulang** untuk menghapus/anonymize data terkait di PostgreSQL, menghapus akun Firebase, serta membersihkan data lokal. Status operasi dicatat agar kegagalan parsial dapat dipulihkan. Hindari klaim atomic transaction lintas Firebase-PostgreSQL.
9. **Komunikasi cloud/beta/produksi menggunakan HTTPS** dan tidak memaparkan port PostgreSQL ke Internet. HTTP plaintext hanya boleh untuk development loopback/jaringan tepercaya dengan data dummy, bukan token/data pribadi nyata pada jaringan tak tepercaya.
10. **Belum implementasi kode, SQL migration, maupun endpoint.** Dokumen ini mengikat keputusan desain untuk penyelarasan `database-schema.md`, `api-contract.md`, `offline-sync-spec.md`, `auth-spec.md`, `profile-spec.md`.

## 2. Arsitektur proteksi data

| Data | Lokasi | Perlindungan | Ketentuan |
|---|---|---|---|
| Firebase authentication state / token sensitif | Penyimpanan sesi mobile sesuai adapter | Mekanisme platform dan secure storage yang diuji | Jangan logging token; pastikan logout benar-benar menghapus sesi |
| Kunci enkripsi DB | Expo SecureStore | Android Keystore / iOS Keychain | Kunci acak per instalasi dan ruang akun; tidak di-hardcode |
| Food logs, berat, profil, draft, antrean offline | SQLite terenkripsi SQLCipher | Enkripsi at rest | Hanya dapat dibuka dalam konteks akun yang sesuai |
| Data katalog publik | SQLite cache atau PostgreSQL | Integritas data/revisi | Boleh cached lintas sesi **hanya** jika tidak mengandung personalisasi |
| Data pribadi cloud | PostgreSQL | Otorisasi `firebase_uid`, TLS, query parameterized, kontrol akses | Password DB, Firebase Admin credentials hanya di backend/secrets lokal |
| Firebase Admin service account | Backend developer/hosting | Secret environment / local secret manager | Jangan masuk Git, Expo bundle atau client |

**Catatan Expo:** SQLCipher memerlukan binary native yang dikonfigurasi dan dibangun ulang; tidak tersedia di Expo Go. Periksa kompatibilitas versi Expo pada saat implementasi. `expo-secure-store` dapat kehilangan akses setelah perubahan biometrik jika konfigurasi tertentu dipakai; jangan mewajibkan biometrik untuk membuka kunci DB MVP tanpa rencana pemulihan. Perilaku backup/uninstall Keychain dan Keystore berbeda: desain startup harus aman ketika kunci ada tetapi DB tidak ada, atau sebaliknya.

## 3. Isolasi akun

- Namespace database atau file terenkripsi per akun (`uid` di-hash untuk nama internal, bukan identitas mentah dalam nama file yang tampak publik), atau arsitektur pemisahan setara.
- App startup menunggu Firebase auth state stabil sebelum membuka ruang data pribadi.
- Saat akun diganti, tutup koneksi DB, kosongkan cache memory, dan hentikan sync milik akun sebelumnya sebelum membuka namespace baru.
- Background worker mengikat setiap pekerjaan pada `uid` terverifikasi; dilarang mengirim perubahan akun A menggunakan token akun B.
- Setelah logout, bersihkan ruang data lokal dan kunci yang terkait. Uji pembatalan operasi asynchronous agar tidak menulis ulang cache setelah pembersihan.

## 4. Logout — state machine yang direkomendasikan

1. Tekan `Keluar` → hentikan sementara input baru/sync yang relevan.
2. Periksa jumlah operasi antrean `pending`/`in_flight` dan draft lokal yang belum tersinkron.
3. Jika antrean kosong → sign out; hapus storage personal + file + kunci; kosongkan state; navigasi ke welcome/auth.
4. Jika ada antrean: berikan `Sinkronkan lalu keluar`, `Keluar dan hapus data perangkat`, `Batal`.
5. `Sinkronkan lalu keluar` hanya berhasil setelah ack server untuk semua operasi; bila gagal, tetap login dan tampilkan opsi ulang/batal/hapus.
6. `Keluar dan hapus` memerlukan konfirmasi eksplisit yang menjelaskan risiko hilangnya catatan yang belum tersinkron; hentikan sync lalu hapus ruang data personal dan sign out.
7. Kesalahan pembersihan: lakukan blokir akses ke ruang data lama dan mekanisme cleanup pada startup berikutnya; jangan menyatakan logout bersih jika data masih dapat diakses.

**UX:** tidak perlu dialog untuk logout biasa tanpa antrean; dialog muncul hanya ketika ada risiko kehilangan data.

## 5. Penghapusan akun — workflow aman, bukan satu query

- Pengguna memilih `Hapus akun` dari Pengaturan; dialog menjelaskan konsekuensi dan data yang terdampak.
- Minta **reauthentication** atau autentikasi yang cukup baru untuk aksi sensitif, sesuai Firebase; verifikasi ulang pada backend.
- Endpoint backend membuka status permintaan penghapusan yang idempoten (`request_id`), segera memblokir perubahan pribadi baru untuk akun yang sedang dihapus.
- Backend menghapus data domain pribadi dan referensi terkait secara terurut/transactional di PostgreSQL, mencatat hasil secara minimal; kemudian menghapus identitas Firebase via Admin SDK. Atur retry ketika salah satu tahap gagal.
- Rekonsiliasi wajib tersedia untuk kasus: data DB terhapus tetapi Firebase gagal; Firebase sudah terhapus tetapi cleanup DB belum selesai. Perlu worker/job atau mekanisme administratif retry saat production.
- App baru membersihkan seluruh ruang lokal setelah server menerima permintaan penghapusan dan menandai proses berjalan; jika gagal mengirim permintaan, jangan pura-pura akun cloud sudah dihapus.
- Backup, telemetry, data operasional dan kewajiban retensi mengikuti kebijakan privasi yang harus ditetapkan sebelum peluncuran. Jangan menjanjikan penghapusan seketika dari seluruh backup.

## 6. Hak akses dan keamanan Fastify

- Auth guard default untuk `/v1/me/*`, logs, goals, weight, favorites, recipes, sync, account.
- `verifyIdToken` melalui Firebase Admin; gunakan UID dari token. Untuk operasi keamanan tinggi pertimbangkan pemeriksaan token revoked / status user sesuai tradeoff performa.
- Tinjau rate-limit dan anti-abuse terutama login-adjacent actions, resend verification, account deletion.
- Parameterized SQL; validasi schema request-response; pagination dan size limit; batasi payload sync; tidak menampilkan stack traces/SQL di response.
- `request_id` untuk tracing; filter email, token, food log, berat dan metadata pribadi dari log production; retensi minimal.
- Secrets hanya tersedia pada backend; `.env` tidak di-commit, `.env.example` hanya placeholder.
- CORS tidak menggantikan authorization; terapkan HTTPS ketika API dapat diakses dari luar environment lokal.

## 7. Sinkronisasi, privasi dan Decision 07

- Revisi Decision 07 terakhir: server-ordered LWW, idempotency key, antrean per akun, tombstone dan pengecualian edit-terhadap-data-terhapus.
- Setelah logout, semua operation queue akun terhapus jika pengguna memilih `Keluar dan hapus`.
- Jangan kirim operasi pending menggunakan sesi akun baru.
- Dalam proses penghapusan akun, semua sync request lanjutan harus ditolak agar data yang dihapus tidak dibuat kembali.
- Risiko LWW (perubahan offline lama dapat menimpa edit online baru) harus dijelaskan pada QA; tidak boleh dideskripsikan sebagai *real-world latest action wins* tanpa bukti waktu tepercaya.

## 8. Pengujian wajib sebelum menyimpan data nyata

1. Android dan iOS: DB SQLCipher tidak terbaca tanpa kunci; tes startup kembali.
2. Logout tanpa pending: data pribadi & sesi tidak dapat diakses setelah logout.
3. Logout dengan pending: opsi sinkron/batal/hapus sesuai tindakan, tidak hilang diam-diam.
4. Akun A → logout → akun B: data A tidak muncul; queue A tidak masuk ke akun B.
5. Perangkat offline, request retry, putus internet: operasi idempoten.
6. Ubah/hapus akun saat ada sync: blok penulisan baru dan cegah resurrection.
7. Penghapusan gagal pada Firebase atau PostgreSQL: status operasi dapat diulang tanpa membuat state inkonsisten permanen.
8. Token expired/invalid/wrong project: API mengembalikan unauthorized.
9. Buat dev build; verifikasi SQLCipher yang sebenarnya aktif, bukan sekadar flag config.
10. Uji uninstall/reinstall/restore pada Android dan iOS: tidak membuka kembali data akun yang sudah logout/dihapus.
11. Tidak ada token, secret, berat badan, atau catatan pribadi di log, crash reports, screenshot debug dan repo.
12. Pastikan proteksi transport di lingkungan beta dan produksi.

## 9. Hal yang perlu finalisasi sebelum rilis publik

- Kebijakan Privasi dan Ketentuan Layanan, batas usia 18+, kontak penghapusan dan praktik retensi.
- Penilaian keamanan SDK dan perangkat untuk platform target Android/iOS.
- Kebijakan backup, disaster recovery, dan retensi file/log.
- Verifikasi proses delete account pada jalur store review.
- Review keamanan independen sebelum ada pengguna publik.

## 10. Checklist perubahan dokumen lain

- `docs/02-architecture/system-architecture.md`: tambah SQLCipher dan dev-build requirement.
- `docs/02-architecture/database-schema.md`: deletion request status, per-owner isolation, server blocking flag bila diperlukan.
- `docs/02-architecture/api-contract.md`: logout semantics, DELETE account idempotent endpoint, verification/re-auth, status operation.
- `docs/02-architecture/offline-sync-spec.md` atau `docs/03-features/offline-sync-spec.md`: queue cleanup dan isolation akun, sesuai lokasi aktual.
- `docs/03-features/auth-spec.md`: Firebase verification optional, persistence/session/reauthentication.
- `docs/03-features/profile-spec.md`: tombol verifikasi email di Data Diri, menu hapus akun.
- `docs/04-development/decision-register-v2.md`: Decision 08 technical status final-design, still implementation security QA.

## Referensi teknis

- Expo SQLite SQLCipher: https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/ — SQLCipher native, bukan Expo Go.
- Expo SecureStore: https://docs.expo.dev/versions/v54.0.0/sdk/securestore/ — penyimpanan aman untuk secret kecil, caveat iOS keychain dan biometrik.
- Expo storage guide: https://docs.expo.dev/develop/user-interface/store-data/
- Firebase session management: https://firebase.google.com/docs/auth/admin/manage-sessions

**Kesimpulan:** Decision 08 final dalam desain kebijakan teknis, tetapi belum menyatakan implementasi aman/siap produksi. Tidak ada coding dalam tahap ini.
