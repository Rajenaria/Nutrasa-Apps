# NUTRASA — MASTER DEVELOPMENT ROADMAP

**Jenis dokumen:** Panduan eksekusi developer, dari ide sampai aplikasi digunakan pengguna  
**Status:** Living document — perbarui sepanjang pengembangan  
**Strategi:** MVP vertical slice, contract-first, iteratif; hindari membuat seluruh frontend lalu seluruh backend  
**Konteks terverifikasi, 13 Oktober 2026:** Repository memiliki fondasi Expo + TypeScript + Expo Router dan satu route placeholder di `src/app/index.tsx`. Belum ada implementasi fitur tambah makanan, dashboard nutrisi, autentikasi, atau progress. Approval visual bukan bukti fitur telah berfungsi.

### Status rencana, desain, dan implementasi

| Area | Status | Bukti / batasan |
|---|---|---|
| Fondasi mobile | IMPLEMENTED — struktur dan route placeholder | `src/app/_layout.tsx`, `src/app/index.tsx`, dan konfigurasi Expo tersedia; tidak menunjukkan fitur bisnis sudah berjalan |
| Enam kelompok layar | DESIGN — provisionally approved | [UI approval summary](../01-design/ui-approval-summary.md); bukan approval implementasi pixel-perfect |
| Auth, onboarding, katalog, food log, nutrition goals, dashboard, progress, profile, sync | PLANNED / spesifikasi draft | Dokumen tersedia; belum diimplementasikan dalam kode aplikasi |
| Fastify, PostgreSQL, Firebase Auth, Expo SQLite | SELECTED STACK / integrasi direncanakan | [Architecture decisions](../02-architecture/architecture-decisions.md); pemilihan stack bukan instalasi atau layanan yang sudah berjalan |
| Favorit makanan, recent foods, custom food sederhana, salin catatan makanan; resep buatan pengguna | RESOLVED — scope O-18; implementasi PLANNED | [O-18](../04-development/decision-register.md#o-18--prioritas-rilis-resep-dan-favorit): empat fitur pertama MVP; resep buatan pengguna Post-MVP. Seluruh fitur tersebut belum dibangun |

Status ini berasal dari pemeriksaan file repository, bukan uji runtime perangkat. Checklist milestone berikut adalah rencana, bukan laporan pekerjaan selesai. Perbarui status implementasi hanya dengan bukti kode dan validasi yang relevan.

---

## 0. Cara Menggunakan Dokumen Ini

- [x] Dokumen utama disimpan di [docs/00-overview/master-roadmap.md](master-roadmap.md); path lama memiliki file pengarah.
- [ ] Gunakan [indeks dokumentasi](../README.md) dan dokumen spesifikasi yang sudah ada; tambahkan dokumen turunan hanya bila dibutuhkan.
- [ ] Tandai item: `[ ]` belum, `[~]` sedang, `[x]` selesai, `[!]` terhambat.
- [ ] Untuk setiap tugas, catat owner, estimasi, dependensi, link issue/PR, dan bukti pengujian.
- [ ] Jangan pindah milestone hanya karena kode tampak selesai; gunakan **Exit Criteria**.
- [ ] Bila pekerjaan saat ini sudah lebih maju dari roadmap, **petakan hasil existing → pertahankan → refactor seperlunya**.

### Aturan kerja inti

1. **Putuskan kebutuhan dan aturan produk lebih dulu** (apa, siapa, mengapa, apa batasannya).
2. **Rancang perjalanan pengguna dan data secara bersamaan** sebelum implementasi besar.
3. **Definisikan kontrak API serta validasi** sebelum frontend/backend dikembangkan secara paralel.
4. **Bangun satu fitur end-to-end**: UI → state → API/service → database → test, baru lanjut fitur berikutnya.
5. **Gunakan perubahan kecil dan dapat diuji**; bukan rewrite besar.
6. **Tunda optimasi berlebihan, fitur AI, gamifikasi, dan integrasi kompleks** sampai fondasi dan alur inti stabil.

### Alur makro paling efisien

`Audit existing → Scope MVP → User flow & aturan bisnis → Desain UI + model data → Arsitektur + kontrak → Infrastruktur dasar → Vertical slice fitur inti → QA → Beta → Produksi → Evaluasi/iterasi`

**Bukan:** `Semua frontend → semua backend → baru pikirkan database/API`. Urutan seperti itu cenderung menimbulkan rework saat kebutuhan data/validasi muncul.

---

# FASE A — DISCOVERY & BLUEPRINT

## Milestone 0 — Audit Proyek yang Sudah Ada dan Baseline

**Tujuan:** Mengetahui kondisi nyata aplikasi sebelum membuat keputusan baru.

### 0.1 Inventaris repository
- [ ] Identifikasi framework frontend, backend, DB, ORM, bahasa, package manager, serta layanan eksternal.
- [ ] Daftar struktur folder, entry point, dependensi utama, script build/test/lint.
- [ ] Petakan modul dan fungsi reusable yang sudah ada; cari duplikasi nyata, bukan sekadar kesamaan nama.
- [ ] Petakan environment variables, konfigurasi deployment, secret handling, serta skema migrasi.
- [ ] Catat test yang tersedia dan hasil menjalankan aplikasi saat ini.

### 0.2 Audit fitur dan UI sekarang
- [ ] Saat fitur tambah makanan tersedia, rekam alur nyata dari input hingga penyimpanan; saat ini belum diimplementasikan.
- [ ] Saat indikator progress tersedia, rekam sumber/perhitungannya (satuan, pembulatan, timezone, reset harian); saat ini belum diimplementasikan.
- [ ] Audit halaman, komponen, interaksi, loading, empty/error state, dan navigasi.
- [ ] Periksa status autentikasi, data per-user, dan kemungkinan akses silang antarakun.
- [ ] Daftar bug/blocker, technical debt, dan ketidaksesuaian desain.

### 0.3 Kelompokkan hasil
- [ ] **Keep:** berjalan baik dan sesuai rencana.
- [ ] **Fix:** bug atau masalah keamanan/akurasi.
- [ ] **Refactor:** perlu dirapikan dengan manfaat nyata.
- [ ] **Build:** belum dibuat tetapi wajib untuk MVP.
- [ ] **Defer:** tidak mendesak atau hanya nice-to-have.

**Deliverables direncanakan:** audit implementasi existing (belum ada file audit implementasi terpisah), feature inventory, architecture map sederhana, daftar issue prioritas. Audit dokumentasi yang tersedia ada di [docs/04-development/documentation-audit.md](../04-development/documentation-audit.md), berbeda dari pengujian implementasi.\
**Exit Criteria:** Dapat menjelaskan apa yang telah berfungsi, komponen mana yang belum, dan risiko teknis terbesar.

---

## Milestone 1 — Strategi Produk dan Scope MVP

**Tujuan:** Mendefinisikan NUTRASA secara operasional, bukan hanya daftar ide.

### 1.1 Definisi produk
- [ ] Tuliskan masalah inti pengguna (mis. ingin mencatat makanan dan memahami asupan harian secara sederhana).
- [ ] Tentukan persona/segmen awal, konteks penggunaan, pembeda, dan janji produk.
- [ ] Tentukan platform pertama: web responsif/PWA, Android, iOS, atau lintas platform.
- [ ] Tentukan pasar, bahasa, satuan, zona waktu, privasi, dan kebutuhan aksesibilitas.
- [ ] Tentukan metrik keberhasilan: onboarding completion, pengguna yang berhasil mencatat makanan, retention, crash-free sessions, keakuratan data.

### 1.2 Klasifikasi fitur

| Kategori | Usulan untuk NUTRASA | Catatan |
|---|---|---|
| MVP wajib | Registrasi/login bila sinkronisasi akun diperlukan; onboarding kebutuhan dasar; target kalori/makro; cari/pilih makanan; input porsi; log makanan harian; edit/hapus log; ringkasan dan progress harian; riwayat sederhana; profil & pengaturan | Validasi lagi terhadap implementasi sekarang dan kebutuhan target user |
| MVP bersyarat (usulan historis) | Database makanan internal/admin sederhana, pengukuran berat badan, guest mode | Lihat feature-list terbaru; guest mode belum disetujui dan login tetap sebelum onboarding. Custom food sederhana sudah ditetapkan MVP oleh O-18 |
| Scope O-18 RESOLVED | Favorit makanan, recent foods, custom food sederhana, salin catatan makanan: MVP; resep buatan pengguna: Post-MVP | Keputusan final owner dalam [O-18](../04-development/decision-register.md#o-18--prioritas-rilis-resep-dan-favorit) menggantikan usulan historis roadmap/scope/API. Status implementasi: PLANNED, belum dibangun |
| Setelah MVP (usulan historis) | Barcode, meal template, target mikro nutrien detail, visualisasi mingguan, reminder | Bukan prioritas final; gunakan feature-list dan decision-register untuk cakupan terkini |
| Ekspansi | Rekomendasi AI, foto makanan, wearables, komunitas, gamifikasi, subscription | Butuh evaluasi biaya, akurasi, privasi, serta legal |

### 1.3 Definisikan aturan bisnis secara eksplisit

Tabel di atas berasal dari roadmap umum dan tidak mengalahkan keputusan eksplisit dalam [feature-list](feature-list.md), [business-rules](business-rules.md), serta [decision-register](../04-development/decision-register.md). O-18 berstatus RESOLVED: favorit makanan, recent foods, custom food sederhana dan salin catatan makanan MVP; resep buatan pengguna Post-MVP. Keputusan scope bukan bukti implementasi; seluruh fitur tersebut masih direncanakan, belum dibangun. Scope saved meals terpisah tidak diubah.
- [ ] Apakah kalori memakai nilai dari sumber makanan atau dihitung dari makro? Putuskan prioritas dan toleransi perbedaan.
- [ ] Makro MVP: protein, karbohidrat, lemak; tetapkan kebutuhan serat, gula, sodium, dll. sebagai opsional.
- [ ] Tentukan unit penyimpanan dasar: gram, ml, per sajian; konversi porsi dan pembulatan.
- [ ] Tentukan aturan target berdasarkan kebutuhan pengguna dan disclaimer (bukan diagnosis/preskripsi medis).
- [ ] Tentukan kategori waktu makan, tanggal lokal, perilaku mengubah timezone, serta hari yang melintasi tengah malam.
- [ ] Tentukan konsekuensi ketika makanan dari katalog diubah/dihapus setelah pernah dicatat (mis. snapshot nutrisi di log).
- [ ] Tetapkan kondisi akun baru, tanpa target, tanpa makanan, entri duplikat, data tidak lengkap.

### 1.4 Prioritas rilis
- [ ] Beri setiap fitur: nilai pengguna, kompleksitas, risiko, dependensi, prioritas P0/P1/P2.
- [ ] Freeze **scope MVP v1**; perubahan sesudah ini harus punya alasan dan dampak terukur.
- [ ] Definisikan acceptance criteria per fitur dengan format Given–When–Then.

**Dokumen draft tersedia:** [product-brief.md](product-brief.md), [feature-list.md](feature-list.md), [business-rules.md](business-rules.md). **Deliverables direncanakan:** finalisasi scope MVP dan product backlog; file `mvp-scope.md` terpisah belum tersedia dan tidak wajib dibuat jika feature-list mencukupi.\
**Exit Criteria:** Developer dapat menjawab 'fitur apa, perilaku tepatnya bagaimana, dan kapan dianggap selesai' tanpa menebak.

---

## Milestone 2 — Information Architecture, UX Flow, dan Design System

**Tujuan:** Mengunci pengalaman inti sebelum banyak kode UI dibuat.

### 2.1 Struktur navigasi dan alur pengguna
- [ ] Buat sitemap: auth/onboarding, dashboard, food search, add log, history, profile/settings.
- [ ] Gambar user flow utama: pertama masuk → atur target → tambah makanan → lihat progress → edit/hapus → lihat riwayat.
- [ ] Buat flow pengecualian: login gagal, offline, hasil pencarian kosong, validasi gagal, data gagal disimpan.
- [ ] Buat wireframe low fidelity untuk setiap screen utama termasuk modal, bottom sheet, dan states.
- [ ] Uji wireframe pada 2–5 calon pengguna; catat bagian yang membingungkan.

### 2.2 Visual identity NUTRASA
- [ ] Tetapkan positioning visual (modern, elegan, hangat, memorable; hindari tampilan template).
- [ ] Pilih palet lengkap: brand, surface, text, border, accent, success, warning, error + mode gelap bila perlu.
- [ ] Uji kontras, keterbacaan, dan fungsi warna untuk progress nutrisi.
- [ ] Tentukan font, typography scale, spacing grid, radius, shadow, dan iconography.
- [ ] Finalisasi ikon aplikasi dan panduan maskot (fungsi, pose, konteks, dan aturan agar tidak mengganggu UX).
- [ ] Bentuk design tokens agar implementasi mudah konsisten dan dapat diganti terpusat.

### 2.3 Spesifikasi interaksi
- [ ] Definisikan komponen: button, input, card, food item, progress indicator, tabs, dialogs, toast, skeleton.
- [ ] Buat spesifikasi per-screen: tujuan, sumber data, aksi, validasi, loading/empty/error/success.
- [ ] Definisikan keyboard, fokus, touch target, screen reader, format angka, dan responsive breakpoints.
- [ ] Siapkan high-fidelity screen khusus alur MVP; hindari memoles fitur masa depan.

**Deliverables direncanakan:** `ux-flows.md` dan `screen-specs.md` jika dibutuhkan (belum tersedia), Figma/wireframe, finalisasi [design-system.md](../01-design/design-system.md), komponen UI baseline. Mockup approval sudah tersedia, tetapi komponen/layar aplikasi belum diimplementasikan.\
**Exit Criteria:** Alur utama dan error states dapat disimulasikan tanpa backend; tidak ada kebingungan besar pada navigasi.

---

## Milestone 3 — Arsitektur, Tech Stack, Database Schema, dan API Contract

**Tujuan:** Mencegah frontend/backend berbeda asumsi dan meminimalkan migrasi besar.

### 3.1 Pilihan teknis (sesuaikan dengan stack existing)
- [ ] Evaluasi **reuse stack saat ini** sebelum mengusulkan migrasi.
- [ ] Tentukan frontend + state management + form validation + server state strategy.
- [ ] Tentukan backend (monolith modular biasanya lebih sederhana untuk MVP), DB relasional bila datanya terstruktur, ORM/migrasi.
- [ ] Tentukan pola authentication/authorization; hosted auth vs implementasi sendiri.
- [ ] Tentukan file storage, hosting, CI/CD, monitoring, analytics, error tracking, dan test framework.
- [ ] Buat ADR singkat untuk keputusan penting, alasan, trade-off, dan kondisi revisinya.

### 3.2 Domain dan database
- [ ] Gambar entity relationship diagram: `users`, `profiles`, `nutrition_goals`, `foods`, `food_servings` (jika dibutuhkan), `food_logs`, `weight_entries` (opsional).
- [ ] Pilih field, data type, nullable, default, enum, unique constraint, foreign key, index, deletion policy.
- [ ] Putuskan apakah `food_logs` menyimpan snapshot nama, porsi, kalori, makro agar history stabil.
- [ ] Pastikan semua data privat memiliki owner ID, aturan akses per user, dan kebijakan penghapusan.
- [ ] Tentukan timestamps (UTC di penyimpanan, tanggal lokal untuk agregasi), precision numeric, serta rounding.
- [ ] Rancang migrations + seed contoh yang tidak berisi data sensitif.
- [ ] Catat sumber dan lisensi data nutrisi serta strategi update katalog.

### 3.3 Kontrak service/API
- [ ] Daftar use case lalu rancang endpoint atau server actions: auth/profile, goals, foods search/detail, food logs CRUD, daily summary, history.
- [ ] Tulis request/response types, status codes, pagination, sorting, filtering, dan error structure yang konsisten.
- [ ] Definisikan validasi **client untuk UX, server sebagai sumber kebenaran**, dan constraint DB untuk integritas.
- [ ] Tentukan idempotency/anti-double-submit pada aksi penting serta strategi optimistic update/rollback.
- [ ] Buat mock contract fixtures; uji edge cases sebelum implementasi API lengkap.
- [ ] Bentuk matriks permission: siapa boleh membaca, membuat, mengubah, menghapus objek apa.

### 3.4 Keamanan dan data pribadi sejak desain
- [ ] Terapkan HTTPS, secret management, password/token handling menggunakan solusi teruji, anti-abuse/rate limiting, kebijakan session.
- [ ] Audit data pribadi dan kesehatan/kebiasaan: minimisasi collection, consent bila diperlukan, retention, export/delete.
- [ ] Rancang backup/restore DB, migrasi aman, audit log minimum, dan kebijakan akses admin.
- [ ] Verifikasi ketentuan privasi dan regulasi yang relevan sebelum mengumpulkan data pengguna nyata.

**Draft tersedia:** [docs/02-architecture/architecture-decisions.md](../02-architecture/architecture-decisions.md), [docs/02-architecture/system-architecture.md](../02-architecture/system-architecture.md), ERD konseptual dalam [docs/02-architecture/database-schema.md](../02-architecture/database-schema.md), serta [api-contract.md](../02-architecture/api-contract.md). **Deliverables direncanakan:** OpenAPI dan validation/threat checklist; file `architecture.md`, `erd.md`, dan `validation-matrix.md` terpisah belum tersedia.\
**Exit Criteria:** Frontend dapat dibuat memakai mock API stabil; backend dapat diimplementasi dari kontrak yang sama; ownership dan validasi jelas.

---

# FASE B — FOUNDATION & IMPLEMENTATION

## Milestone 4 — Fondasi Repository dan Engineering Workflow

**Tujuan:** Mengurangi risiko akumulasi tech debt sejak awal.

- [ ] Siapkan branching strategy sederhana, issue template, conventions penamaan, dan Definition of Done.
- [ ] Atur lint, formatter, type checking, unit test, commit/PR review; jangan paksa abstraksi prematur.
- [ ] Pisahkan environments local/dev/staging/production; buat contoh `.env.example` tanpa rahasia.
- [ ] Siapkan database dev + migration runner + seed data, lalu cek rollback/backup restore dasar.
- [ ] Bangun app shell, routing, design tokens, reusable UI primitives, API client dan error boundary.
- [ ] Buat CI otomatis untuk install, typecheck, lint, test, build; proteksi agar build rusak tidak masuk main.
- [ ] Hubungkan logging, error monitoring minimum, analytics events untuk core funnel (tanpa PII sensitif).

**Deliverables:** Dev environment reproducible, CI pass, base app UI dan DB siap migrasi.  
**Exit Criteria:** Anggota tim baru dapat menjalankan proyek dari README; perubahan sederhana dapat diuji sebelum merge.

---

## Milestone 5 — Autentikasi, Profil dan Onboarding sebagai Vertical Slice Pertama

**Tujuan:** Identitas pengguna, session, target, dan akses data aman siap dipakai fitur nutrisi.

### Urutan pengerjaan fitur
1. [ ] Pastikan screen flow dan kriteria acceptance disepakati.
2. [ ] Buat/migrasikan tabel dan constraints untuk user/profile/goal.
3. [ ] Implementasikan backend auth/permission/server validation.
4. [ ] Integrasikan frontend nyata ke kontrak API; gunakan komponen UI design system.
5. [ ] Bangun loading/error/empty/retry behavior.
6. [ ] Tambahkan unit, integration, dan E2E test untuk happy & failure paths.
7. [ ] Uji staging dan tandai fitur selesai.

### Checklist penting
- [ ] Login, register, logout, session expiry/recovery, forgot password jika sesuai strategi auth.
- [ ] Form onboarding hanya meminta data yang benar-benar diperlukan.
- [ ] Profil dan target nutrisi dapat dibaca/diubah, disimpan, dan muncul konsisten di dashboard.
- [ ] Periksa unauthorized/forbidden, akun A tidak bisa membaca/mengubah milik B.
- [ ] Tentukan status guest dan migrasi ke akun (hanya jika didukung MVP).

**Deliverables:** Alur akun hingga target nutrisi stabil end-to-end.  
**Exit Criteria:** Pengguna baru masuk, menetapkan target, logout/login kembali, dan melihat data miliknya dengan benar.

---

## Milestone 6 — Katalog Makanan dan Pencarian

**Tujuan:** Pengguna menemukan makanan dengan data nutrisi yang bisa dipercaya.

- [ ] Putuskan sumber data (katalog internal, dataset legal, API pihak ketiga) dan strategi fallback.
- [ ] Struktur food, serving size, brand/sumber, energy, protein, carbs, fat, serta metadata kualitas data.
- [ ] Seed katalog minimum makanan relevan target pasar; dokumentasikan asal nutrisi.
- [ ] Implementasikan search & food detail dengan pagination/filter yang masuk akal.
- [ ] Tambahkan unit/porsi dan aturan konversi yang konsisten, termasuk gram/ml/sajian.
- [ ] Implementasikan custom food sederhana (MVP sesuai O-18), termasuk create/edit dan pemisahan dari katalog publik; fitur belum dibangun.
- [ ] Test empty query, typo, duplicate names, incomplete macro, angka ekstrem, serta sumber eksternal gagal.
- [ ] Optimasi indeks/response time hanya berdasar profil query nyata.

**Deliverables:** Pencarian → pilih makanan → lihat data nutrisi & porsi, selesai end-to-end.  
**Exit Criteria:** Hasil yang benar dapat ditemukan, sumber data diketahui, dan konversi porsi teruji.

---

## Milestone 7 — Food Logging, Dashboard, dan Progress Bar

**Tujuan:** Menyelesaikan loop produk utama: catat → lihat hasil → koreksi.

**Status perencanaan:** Fitur tambah makanan dan progress bar belum dibangun. Pertahankan fondasi Expo dan route placeholder yang tersedia; implementasikan food logging/dashboard sesuai spesifikasi dan verifikasi setelah implementasi.

- [ ] Verifikasi model `food_logs`: user ID, food reference/snapshot, quantity, unit, meal, local date/time, nutrients snapshot.
- [ ] Implement/rapikan create, read, edit, delete; cegah submit ganda dan update terlambat.
- [ ] Pastikan kalkulasi asupan dan progress harian berasal dari aturan domain **satu sumber kebenaran**.
- [ ] Tegaskan perilaku progress >100%, target 0/kosong, data nutrisi tidak lengkap, decimal rounding, dan timezone.
- [ ] Sinkronkan state frontend setelah mutation; optimistik bila aman dan ada rollback.
- [ ] Buat dashboard current day, daftar makanan, ringkasan kalori & makro, dan pesan progress yang jelas.
- [ ] Tambahkan loading/empty/error/success, offline handling dasar bila MVP memerlukan.
- [ ] Test create → refresh → edit → delete → recalculate; test pergantian hari & per-user isolation.

**Deliverables:** Loop food tracking stabil tanpa angka berbeda antar-screen.  
**Exit Criteria:** Pengguna dapat mencatat makanan, melihat perubahan target secara benar, mengoreksi entri, dan hasil tetap benar setelah reload/login ulang.

---

## Milestone 8 — History, Pengaturan, dan Kelengkapan MVP

- [ ] History berdasarkan tanggal dengan filter/navigasi kalender sederhana.
- [ ] Pastikan agregasi historical tetap benar jika target user berubah (jelaskan target historis vs target terkini).
- [ ] Sediakan update profil/goal, preferensi satuan dan timezone jika dibutuhkan.
- [ ] Sediakan kebijakan privasi, terms, kontak dukungan, alur hapus akun/data bila relevan.
- [ ] Implementasikan accessibility polish dan responsive layout untuk perangkat prioritas.
- [ ] Buat admin/content workflow minimum hanya jika diperlukan untuk katalog makanan.
- [ ] Periksa semua acceptance criteria MVP; pindahkan nice-to-have ke backlog post-MVP.

**Deliverables:** Semua fitur MVP terhubung; aplikasi bisa dipakai dari awal sampai akhir tanpa langkah manual developer.  
**Exit Criteria:** E2E onboarding → logging → progress → history → pengaturan lolos.

---

# FASE C — QUALITY, RELEASE & OPERATIONS

## Milestone 9 — Audit Integrasi, Kualitas, Akurasi, dan Keamanan

### 9.1 Pengujian berlapis
- [ ] Unit: konversi porsi, kalkulasi nutrisi, agregasi harian, validasi schema.
- [ ] Integration: API+DB, migration, auth guard, permission, transaksi.
- [ ] E2E: user baru, log food CRUD, history, session, gagal jaringan, empty states.
- [ ] Visual regression/manual: mobile ukuran kecil/besar, desktop jika didukung, dark mode jika ada.
- [ ] Data migration: pastikan data existing aman dan kompatibel.

### 9.2 Non-functional
- [ ] Cek performance: loading pertama, daftar makanan, pencarian, dashboard, query DB.
- [ ] Cek reliability: retry aman, crash handling, rate limits, service outage.
- [ ] Cek security: authorization per-resource, injection, XSS/CSRF sesuai stack, secret leaks, dependencies.
- [ ] Cek privasi: data minimization, analytics no sensitive payload, hak user delete/export sesuai kebutuhan hukum.
- [ ] Backup nyata, restore drill, observability alerts, disaster rollback.
- [ ] Audit copywriting, satuan nutrisi, disclaimer, serta accessibility.

**Deliverables:** QA report, daftar defect terprioritas, release candidate, security/privacy checklist.  
**Exit Criteria:** Tidak ada blocker P0/P1, alur kritis lolos, akurasi nutrisi diuji, proses restore/rollback siap.

---

## Milestone 10 — Closed Beta & Validasi Pengguna

- [ ] Siapkan staging hampir setara produksi, akun uji, dataset realistis, dan build candidate.
- [ ] Rekrut kelompok beta kecil yang sesuai persona; jelaskan bahwa ini masih beta.
- [ ] Uji task: buat akun, tetapkan target, tambah makanan, ubah porsi, koreksi log, lihat progress/history.
- [ ] Ukur completion rate, waktu tugas, error, titik bingung, dan laporan bug.
- [ ] Tinjau analytics tanpa mengoleksi data sensitif secara tidak perlu.
- [ ] Prioritaskan temuan: blocker sebelum launch; improvement non-kritis setelah launch.
- [ ] Jalankan regression testing tiap perbaikan.

**Deliverables:** Beta feedback report, prioritized bug list, go/no-go recommendation.  
**Exit Criteria:** Pengguna beta menyelesaikan core journey tanpa bantuan langsung, risiko utama telah ditangani.

---

## Milestone 11 — Deployment dan Launch Production

- [ ] Siapkan domain, DNS, TLS, hosting, DB production, environment secrets, observability.
- [ ] Tetapkan release version dan migration plan, backup sebelum deploy, rollback procedure.
- [ ] Pastikan pemisahan staging vs production dan tidak ada test secrets/keys bocor.
- [ ] Jalankan smoke test produksi: signup/login, foods, save/edit/delete log, daily summary, history.
- [ ] Publikasikan privacy policy, terms, support channel; siapkan store listing jika aplikasi mobile.
- [ ] Konfigurasi analytics dasar untuk activation/retention/error monitoring.
- [ ] Rilis bertahap (mis. invite-only/limited rollout) bila ada risiko operasional.
- [ ] Monitor error/crash, availability, response time, dan ketepatan log setelah release.

**Deliverables:** Aplikasi produksi yang dapat diakses pengguna, runbook deployment & rollback, dashboard monitoring.  
**Exit Criteria:** Pengguna nyata dapat mengakses dan memakai core journey; data persist, dapat dipulihkan, dan insiden bisa ditangani.

---

## Milestone 12 — Maintenance, Iterasi, dan Post-MVP

- [ ] Jalankan rutin bug triage, update dependencies, backup verification, log review, privacy/security review.
- [ ] Ukur funnel: registrasi → onboarding → log pertama → log berulang → retention.
- [ ] Wawancarai pengguna; lihat apakah angka progress membantu keputusan mereka.
- [ ] Prioritaskan fitur lanjutan berdasar evidence, bukan hanya ide menarik.
- [ ] Setiap fitur baru kembali ke mini-siklus: requirement → UX/data/API delta → vertical slice → test → rollout.
- [ ] Uji biaya layanan/API/hosting dan lakukan optimasi ketika bottleneck terbukti.
- [ ] Pertimbangkan resep buatan pengguna (Post-MVP sesuai O-18), barcode, foto/AI, integrasi wearable, dan subscription satu per satu; favorit makanan sudah ditetapkan MVP dan belum dibangun.

**Deliverables:** Release cadence, changelog, metric review, backlog post-MVP.  
**Exit Criteria:** Produk mempunyai ritme peningkatan, monitoring, dan proses support yang berkelanjutan.

---

# TEMPLATE EKSEKUSI FITUR (Ulangi di Milestone 5–8 dan setelah Launch)

Contoh fitur: **Tambah Makanan**

1. **User story:** Sebagai pengguna, saya ingin menambah makanan dan porsi ke hari tertentu agar asupan tercatat.
2. **Acceptance criteria:** Tambah berhasil, data tetap ada setelah reload, total harian terupdate; gagal input tidak menyimpan data; tidak bisa mengubah milik orang lain.
3. **UX contract:** Screen entry, search result, portion modal, confirmation, loading, empty/error states.
4. **Data contract:** `food_id`/snapshot, gram/serving, food log owner, timezone/date, macro nutrient numeric.
5. **API/service contract:** Endpoint/server action + request/response validation + error code + permission.
6. **Implement vertical slice:** migration → service logic → UI integration → cache/state sync.
7. **Testing:** unit calculation, API with DB, E2E create/edit/delete, timezone and negative cases.
8. **Review:** Typecheck/lint/test pass, no needless abstraction/duplicate logic, document important trade-offs.
9. **Ship:** staging smoke test, feature release, monitor results.

**Definition of Done untuk semua fitur:** acceptance criteria lolos, validasi server dan permission tepat, state UI lengkap, test relevan lulus, observability cukup, tidak merusak alur existing, dokumentasi kontrak diperbarui.

---

# PETA DEPENDENSI (Kapan Frontend, Backend, DB, API Dikerjakan?)

| Tahap | Prioritas utama | Kenapa |
|---|---|---|
| A0–A1 | Audit + kebutuhan | Hindari rewrite & scope creep |
| A2 | UX flow/wireframe | Deteksi masalah perjalanan user saat perubahan masih murah |
| A3 | ERD + API contract + validation | Frontend dan backend menyepakati bentuk data |
| B4 | Setup repo, CI, migrasi, UI primitives | Infrastruktur minimum agar fitur berkembang konsisten |
| B5–B8 | **Per fitur**: DB → backend domain/API → frontend integrasi → test | Setiap loop menghasilkan fitur benar-benar bekerja |
| C9–C10 | QA integrasi & beta | Temukan failure yang tak terlihat pada pengujian terpisah |
| C11–C12 | Release, monitor, iterasi | Siap dipakai dan dapat dioperasikan |

**Penting:** Urutan DB → API → frontend pada tabel di atas berlaku di dalam setiap *slice* setelah spesifikasi UI selesai. Boleh frontend menggunakan mock terlebih dahulu untuk mempercepat kerja UI, tetapi jangan mengubah kontrak diam-diam. Bila stack memakai backend-as-a-service atau server actions, lapisan API bisa lebih tipis; prinsip kontrak, permission, dan validasi tetap sama.

---

# DOKUMEN TURUNAN YANG SEBAIKNYA DIBUAT

Blok berikut dipertahankan sebagai **contoh penamaan historis dari roadmap sumber**, bukan struktur repository saat ini atau daftar file yang sudah tersedia. Dokumen final menggunakan subfolder bernomor sesuai indeks; jangan membuat salinan baru dari nama contoh. Test plan, release runbook, dan metrik pascarilis masih direncanakan.

```text
docs/
  00-master-roadmap.md              ← contoh nama lama; canonical: 00-overview/master-roadmap.md
  01-audit-existing.md              ← kondisi kode dan fitur saat ini
  02-product-brief-and-mvp.md       ← target user, scope, prioritas
  03-business-rules.md              ← nutrisi, satuan, pembulatan, tanggal
  04-ux-flows-and-screen-specs.md   ← navigasi dan state layar
  05-design-system.md               ← identitas, tokens, komponen
  06-architecture-and-stack.md      ← keputusan arsitektur/ADR
  07-database-schema.md             ← ERD, constraints, migration
  08-api-contract.md                ← endpoint, payload, auth, errors
  09-validation-and-security.md     ← schema, permission, privasi
  10-mvp-feature-backlog.md         ← issue kecil per vertical slice
  11-test-plan.md                   ← unit/integration/E2E dan QA
  12-release-runbook.md             ← deploy, backup, rollback
  13-post-launch-metrics.md         ← funnel, feedback, iterasi
```

# PETA PRIORITAS MULAI HARI INI (Khusus NUTRASA)

**Pertahankan fondasi yang tersedia; jangan menyebut fitur berfungsi tanpa bukti implementasi.** Lakukan urutan berikut:

- [ ] **Langkah 1:** Catat baseline placeholder saat ini. Audit tambah makanan/progress setelah ada implementasi; mockup bukan screenshot aplikasi yang sudah berjalan.
- [ ] **Langkah 2:** Tetapkan scope MVP minimum, terutama sumber makanan, porsi, target, auth, history, dan aturan kalkulasi.
- [ ] **Langkah 3:** Buat screen specs & design tokens untuk UI yang ada; rapikan komponen secara bertahap.
- [ ] **Langkah 4:** Cocokkan DB + API current dengan target schema, buat migration incremental (jangan langsung drop/recreate).
- [ ] **Langkah 5:** Bangun vertical slice food logging yang belum tersedia sampai CRUD + persistence + progress akurat; pertahankan fondasi repository yang sudah ada.
- [ ] **Langkah 6:** Tambahkan auth/onboarding atau fitur dependen yang belum ada sesuai gap audit; urutan bisa digeser untuk menghindari mengulang kode existing.
- [ ] **Langkah 7:** Tutup celah history/settings, lalu QA → beta → production.

## Hal yang sengaja tidak ditentukan sebelum audit

- Framework/layanan vendor spesifik, karena sebaiknya mempertahankan stack existing jika masih cocok.
- Deadline dan estimasi durasi, karena bergantung kompleksitas aplikasi dan jumlah developer.
- Formula target nutrisi personal, karena memerlukan keputusan produk dan kehati-hatian terhadap klaim kesehatan.
- Desain palet, icon, dan maskot final, karena perlu dipilih dalam eksplorasi visual terpisah.

---

**Checkpoint tiap akhir milestone:**  
`Apa yang selesai?` · `Bukti (screenshot/test/PR)?` · `Apa yang belum?` · `Risiko yang tersisa?` · `Apakah boleh lanjut?`
