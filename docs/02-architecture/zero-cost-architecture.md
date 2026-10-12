# NUTRASA — Zero-Cost Development Architecture

**Status:** Stack development dipilih: React Native + Expo + TypeScript + Expo Router, Firebase Authentication, Fastify lokal, PostgreSQL lokal, Expo SQLite; target pengeluaran layanan Rp0. Detail implementasi tetap draft.\
**Belum disetujui:** Strategi cloud beta/provider hosting, ORM/migration tool, proteksi penyimpanan lokal, dan detail konflik sync. Stack data/backend lokal sudah dipilih menurut ADR-001.\
**Tujuan:** mengembangkan aplikasi dengan arsitektur yang dapat ditingkatkan tanpa membayar layanan bulanan selama tahap lokal dan prototipe.

## 1. Prinsip

1. Tidak mengaktifkan billing pay-as-you-go tanpa persetujuan eksplisit. Mulai Firebase **Spark** dan evaluasi kuota autentikasi yang relevan.
2. Semua layanan data/backend berjalan lokal pada fase awal; tidak ada jaminan akses publik 24/7.
3. Pisahkan UI, domain logic, data repository, penyimpanan lokal dan remote API.
4. Seluruh migrasi skema di-version-control; setiap fitur mengikuti vertical slice.
5. Nutrisi yang tidak diketahui ditulis `null`, bukan nol. Catatan konsumsi menyimpan snapshot yang tidak ditulis ulang oleh perubahan katalog.
6. Dokumentasi yang disetujui adalah referensi; parameter nutrisi/keamanan yang belum direview **tidak dianggap tervalidasi**.

## 2. Stack lokal yang dipilih dan detail yang masih diusulkan

| Layer | Pilihan | Alasan | Biaya awal |
|---|---|---|---|
| Mobile | Expo + React Native + TypeScript + Expo Router | Sudah ditetapkan | Rp0 |
| Auth | Firebase Authentication Spark | Project sudah dimiliki; email/password, Google, Apple sesuai dukungan platform | Rp0 dalam batas plan |
| App local storage | expo-sqlite | Cache katalog, food log lokal dan antrean sinkronisasi | Rp0 |
| Sensitive token storage | Solusi aman sesuai panduan SDK Auth/Expo | Jangan taruh token di plain AsyncStorage tanpa pertimbangan risiko | Rp0 |
| Backend | Node.js + Fastify + TypeScript | REST API sederhana dan dapat di-host sendiri | Rp0 secara lokal |
| Server database | PostgreSQL lokal | Relasi food/recipe/serving/log yang kompleks; cloud nanti | Rp0 secara lokal |
| DB migrations | Migration tool yang dipilih bersama ORM/query layer nanti | Versi skema dan rollback terkontrol | Rp0 |
| Test | Unit + integration + emulator | Menemukan masalah lebih awal | Rp0* |
| Source control | Git + GitHub Free | Histori dan review perubahan | Rp0 dalam batas plan |

\* Tidak menghitung listrik, koneksi internet, perangkat, kemungkinan biaya akun distribusi store, maupun waktu kerja. Hindari mengasumsikan semua fitur cloud gratis selamanya.

## 3. Arsitektur data & trust boundaries

```text
[Mobile Expo]
   ├─ UI / routes / features
   ├─ Pure Nutrition Engine (aturan deterministik; versi parameter)
   ├─ SQLite (cache, food logs, outbox, per-user isolation)
   └─ Firebase Authentication (SDK)
           │ Firebase ID token
           ▼
[Fastify API, local during development]
   ├─ verify Firebase ID token via Admin SDK
   ├─ authorization: enforce caller.uid === resource.owner_uid
   ├─ validate requests & apply idempotency
   ├─ sync and conflict handling
   └─ database layer (no DB credentials in app)
           ▼
[PostgreSQL local]
   ├─ curated food catalog, aliases, categories, servings
   ├─ food nutrients and provenance
   ├─ recipes + ingredients
   ├─ profiles, goals + historical versions
   ├─ food log + immutable nutrition snapshots
   └─ sync metadata, revisions and tombstones
```

**Catatan:** local API diuji via simulator/emulator/piranti yang bisa menjangkau host; `localhost` pada telepon bukan localhost komputer. Siapkan `.env.example`, tanpa secret asli. Firebase Admin credentials hanya di backend. Enforce kepemilikan data server-side tanpa bergantung pada route guard Expo.

## 4. Fase pengembangan dengan exit criteria

### Fase A — Persiapan (Rp0)
- [ ] Pastikan repo Expo berjalan dengan dev build yang relevan.
- [ ] Audit Firebase Project: plan Spark, provider enabled, platform registrations, OAuth redirect, email verification, billing status; **jangan unggah credentials** ke repo.
- [ ] Inisialisasi `apps/api` bila API dipisah; pertahankan paket mobile mengikuti struktur Expo yang sudah ada.
- [ ] Instal PostgreSQL secara lokal (native atau Docker, jika Docker tersedia).
- [ ] Buat `.env.example`, `.gitignore`, migration dan seed **dummy**, bukan data nutrisi tanpa sumber.
- [ ] Dokumentasikan cara menjalankan app, API dan DB secara lokal.
**Exit:** app, API health endpoint, DB connection, dan Firebase sign-in test berjalan; tidak ada secret ter-commit.

### Fase B — Database & contract
- [ ] Finalisasi ERD dan aturan katalog, resep, porsi, source metadata.
- [ ] Tentukan UID Firebase sebagai foreign identity (string), tanpa menduplikasi password di database.
- [ ] Buat migration yang dapat diulang, index yang relevan, constraint dan data ownership.
- [ ] Tulis OpenAPI contract untuk auth-gated endpoints.
- [ ] Tetapkan idempotency key, entity revision, sync cursor, deleted tombstone, dan conflict policy.
**Exit:** integration tests skema dan API contract lolos.

### Fase C — Vertical slices
- [ ] Auth → onboarding → nutrition goal (hanya output eligible/approved) → food search → food detail → log meal → home → progress/profile.
- [ ] Setiap slice mencakup UI, validasi, API/data access, local cache, sync, error/empty/offline states, tests.
- [ ] Gunakan katalog pilot 20 entri yang provenance dan izin penggunaannya telah diperiksa, kemudian 100.
**Exit:** skenario online dan offline end-to-end lolos; data user tidak bercampur.

### Fase D — Beta/cloud (masih mengutamakan Rp0)
- [ ] Baru saat membutuhkan tester luar jaringan, pilih cloud Postgres free tier (misalnya Neon) dan penyedia hosting API sesuai batas gratis TERKINI.
- [ ] Uji apakah free hosting mensyaratkan kartu, sleep, egress, dan kemungkinan kehilangan akses/limit.
- [ ] Backup dan prosedur pemulihan; uji migrasi dari database lokal ke cloud.
- [ ] Evaluasi privacy/legal, parameter klinis, OAuth provider, dan kebutuhan store release.
**Exit:** dapat diakses tester, error dipantau, security checklist lulus, biaya yang disetujui tetap Rp0.

## 5. Ketika perlu scale

- Ubah `DATABASE_URL` backend ke managed PostgreSQL, jalankan migrasi, restore seed/catalog melalui proses terkontrol.
- Deploy API stateless dan simpan Firebase Admin secrets hanya di server; aplikasi mengganti `API_BASE_URL` sesuai environment.
- Sinkronisasi SQLite tidak dihapus; periksa volume, konflik multi-perangkat, query latency, backups, logging dan alert quota.
- Biaya mulai muncul bila melewati paket gratis, butuh uptime lebih baik, backup terkelola, kapasitas tambahan, notifikasi/AI berbayar atau distribusi store.

## 6. Struktur folder disarankan (tidak perlu dibuat semua sekarang)

```text
nutrasa/
├── src/
│   ├── app/                      # Expo Router sesuai struktur repository
│   ├── features/                 # auth, onboarding, foods, food-log, goals, progress
│   ├── components/ui/            # shared components
│   ├── theme/                    # colors, typography, sizes
│   └── lib/                      # Firebase, SQLite, API adapters
├── server/                       # Contoh lokasi API; struktur backend belum ditetapkan
│   ├── src/modules/
│   ├── src/middleware/
│   └── tests/
├── database/
│   ├── migrations/
│   └── seeds/                     # only reviewed/mock data
├── assets/branding/
├── docs/00-overview/
├── docs/01-design/
├── docs/02-architecture/
│   └── zero-cost-architecture.md
├── docs/03-features/
├── AGENTS.md
├── README.md
└── .env.example
```

## 7. Risiko yang harus eksplisit

- **Firebase Spark:** fitur tertentu dan kuota berbeda; email send limits; beberapa produk memerlukan Blaze. Jangan aktifkan SMS auth berbayar tanpa persetujuan.
- **Google / Apple sign-in:** provider-specific OAuth/capabilities dan build configuration; Apple sign-in untuk iOS memerlukan pengujian native dan persyaratan akun developer saat distribusi. Tidak dijamin seluruh alur dapat diuji di Expo Go.
- **Offline:** SQLite menyediakan penyimpanan, tetapi tidak otomatis mengimplementasikan sync/conflict resolution. Enkripsi database dan kebijakan logout membutuhkan desain lanjutan.
- **Local dev:** backend tidak bisa diakses umum bila mesin mati; jangan expose endpoint dev tanpa pengamanan.
- **Data kesehatan:** simpan seminimal mungkin; tinjau perlindungan privasi, legal, hak penghapusan dan dasar pemrosesan.
- **Nutrition:** safety thresholds dan personalisasi preskriptif belum layak disebut tervalidasi tanpa review ahli gizi.
- **Cloud free tiers:** dapat berubah, dapat pause/throttle, dan mungkin bukan opsi production yang andal.

## 8. Decision register

| ID | Keputusan | Status |
|---|---|---|
| ARC-01 | Expo + TypeScript + Expo Router | Diputuskan |
| ARC-02 | Firebase Authentication | Diputuskan |
| ARC-03 | Target pengeluaran layanan Rp0 dalam development | Diputuskan |
| ARC-04 | PostgreSQL lokal untuk data utama | Dipilih — ADR-001; schema/DDL tetap draft |
| ARC-05 | Fastify Node.js backend lokal | Dipilih — ADR-001; belum diimplementasikan |
| ARC-06 | Expo SQLite untuk cache dan offline outbox | Dipilih — ADR-001; detail sync/proteksi masih terbuka |
| ARC-07 | Postgres lokal dahulu, deployment cloud nanti | Fase lokal dipilih; provider/waktu deployment cloud belum diputuskan |
| ARC-08 | Cloud provider/hosting saat beta | Belum dipilih |
| ARC-09 | Auth linking & eligibility scopes | Review teknis/legal |
| ARC-10 | Preset nutrition engine/safety | Review ahli gizi |

## 9. Referensi sumber dan biaya (dicek Oktober 2026)

Tanggal cek dan angka kuota berikut berasal dari dokumen sumber. Merge dokumentasi ini tidak memverifikasi harga/kuota eksternal; jangan menganggapnya jaminan biaya untuk deployment berikutnya.

- Firebase Spark dan billing: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firebase Auth limits: https://firebase.google.com/docs/auth/limits
- Neon Free, storage 1 GB/project (pengumuman 2 Oktober 2026): https://neon.com/blog/neon-free-plan-1-gb-per-project
- Supabase Free 500 MB / project: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase Free pausing: https://supabase.com/docs/guides/platform/free-project-pausing

**Dokumen ini bukan instruksi untuk langsung menginstal atau mengaktifkan layanan berbayar.** Stack lokal sudah dipilih; review draft [database-schema.md](database-schema.md), [api-contract.md](api-contract.md), dan development task board sebelum task implementasi eksplisit. Belum ada backend atau database yang dijalankan melalui tugas merge ini.
