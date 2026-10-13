# NUTRASA — API Contract v1.2 (Clean Contract)

**Status:** Draft kontrak engineering konsisten Decision 01–10; bukan OpenAPI machine-readable, belum diimplementasikan. Tanggal 2026-10-13. Menggantikan API Contract v1.0/v1.1 untuk MVP. Referensi: `database-schema.md` v1.2 dan keputusan teknis 03, 07, 08.

## 1. Boundary, autentikasi, otorisasi

- Base `/api/v1`, JSON UTF-8. Fastify menerima `Authorization: Bearer <Firebase ID token>` dan memverifikasi signature, audience/issuer, expiry, status akun; UID digunakan mencari `app_users.id`. Tidak ada route Fastify untuk password, login, Google/Apple OAuth, atau email-verification link: semua via Firebase client SDK.
- **Email verification opsional**: tidak memblokir onboarding, katalog, log, ataupun sync. `email_verified` untuk Data Diri; tindakan sensitif boleh re-auth jika diwajibkan Firebase.
- `owner_user_id` **tidak diterima** dari klien untuk otorisasi; seluruh personal routes user-scoped. Akun `PENDING_DELETION` tidak dapat menulis / sync. HTTPS wajib pada deployment, HTTP lokal hanya jaringan dev tepercaya.
- MVP hanya dewasa 18+ dan profil eligible. Onboarding tidak memberi target untuk yang tidak eligible; jangan fallback ke LOG_ONLY.

## 2. Konvensi wire contract

| Ketentuan | Format |
|---|---|
| Timestamp | RFC3339 dengan offset/UTC, server authoritative; waktu jam perangkat bukan dasar LWW |
| Tanggal | `YYYY-MM-DD` untuk jurnal + `journal_time_zone` IANA tersimpan eksplisit |
| UUID | string UUID untuk entity/operation/device |
| Desimal | **string desimal** (`"75.000"`), agar presisi PostgreSQL tak rusak oleh JSON number |
| Nutrisi | tepat 11 nama key di `database-schema.md`; `string|null` |
| Pagination | `limit` dibatasi server, cursor opaque dan user-scoped |
| Mutasi offline | `operation_id`, `device_id`, `device_sequence`, `entity_type`, `entity_id`, `kind`, `payload` |
| Respon dasar | `{ "data": ..., "meta": { ... } }` |
| Error dasar | `{ "error": { "code": "...", "message": "...", "details": ... }, "request_id": "..." }` |

Tidak ada bentuk berbeda antara endpoint online dengan offline: mutasi online direpresentasikan dengan operation ID dan diproses service domain yang sama agar duplikasi tidak mungkin. Payload nutrisi hanya berasal dari server-resolved food revision dan data komposisi yang valid, bukan client-submitted arbitrary public nutrient calculations.

## 3. Kontrak nutrisi dan coverage

Nutrient object memiliki `energy_kcal`, `protein_g`, `carbohydrate_g`, `fat_g`, `fiber_g`, `sugar_g`, `saturated_fat_g`, `trans_fat_g`, `cholesterol_mg`, `sodium_mg`, `potassium_mg`, masing-masing desimal string atau `null`.

Agregasi per nutrisi:

```json
{
  "nutrient_code": "sodium_mg", "known_sum": "600.00000",
  "known_count": 2, "unknown_count": 1, "coverage_status": "PARTIAL",
  "display_hint": "AT_LEAST"
}
```

`NO_LOGS` secara eksplisit berbeda dengan `LOGGED` dan angka nol; untuk UNKNOWN `known_sum` dapat `null`, UI tampilkan `—`. `COMPLETE` hanya jika semua item tercatat mempunyai nilai untuk nutrisi itu. Status `CONFIRMED_COMPLETE` (selesai mencatat) bukan status nutrient coverage.

## 4. Inventory endpoint MVP dan model post-MVP berlabel

Seluruh endpoint personal membutuhkan Firebase token; response errors tidak mengungkap keberadaan ID milik user lain.

| Area | Method & path | Ringkasan |
|---|---|---|
| Health | `GET /health/live`, `GET /health/ready` | Public liveness tanpa rahasia; readiness tidak membocorkan konfigurasi |
| Session | `POST /me/bootstrap`, `GET /me` | Idempotent create/find akun dari Firebase UID; status verifikasi informasional |
| Onboarding | `GET /me/onboarding`, `PUT /me/onboarding` | Baca/simpan onboarding setelah age+eligibility validation; commit draft lokal |
| Profile | `GET /me/profile`, `PATCH /me/profile` | Baca/edit profil dan trigger recalculation jika input relevan berubah |
| Preferences | `GET /me/preferences`, `PATCH /me/preferences` | Bahasa, unit, zona waktu |
| Catalog | `GET /foods`, `GET /foods/{food_id}`, `GET /foods/{food_id}/servings`, `GET /categories`, `GET /catalog/changes` | Hanya yang published + boleh didistribusikan |
| Private food | `GET /me/custom-foods`, `POST /me/custom-foods`, `PATCH /me/custom-foods/{id}`, `DELETE /me/custom-foods/{id}` | Private, revisi immutable |
| Recipes — POST-MVP, bukan endpoint aktif MVP | `GET /me/recipes`, `POST /me/recipes`, `GET /me/recipes/{id}`, `PATCH /me/recipes/{id}`, `DELETE /me/recipes/{id}` | Desain historis dipertahankan; recipe builder pengguna post-MVP sesuai O-18 |
| Favorites — MVP | `GET /me/favorites`, `PUT /me/favorites/{type}/{id}`, `DELETE /me/favorites/{type}/{id}` | Favorit makanan MVP sesuai O-18; toggle idempotent |
| Saved Meals | `GET /me/saved-meals`, `POST /me/saved-meals`, `POST /me/saved-meals/{id}/copy` | Salin log baru ID unik, snapshot sumber |
| Log | `GET /me/food-logs?date=`, `POST /me/food-logs`, `PATCH /me/food-logs/{id}`, `DELETE /me/food-logs/{id}` | Snapshot versioned, soft-delete, LWW |
| Journal | `PUT /me/journal-days/{date}/completion` | OPEN / CONFIRMED_COMPLETE; user dapat batalkan selesai |
| Weight | `GET /me/weights`, `POST /me/weights`, `PATCH /me/weights/{id}`, `DELETE /me/weights/{id}` | Perubahan acuan valid memicu re-evaluation goals |
| Goals | `GET /me/goals/active`, `GET /me/goals/history`, `POST /me/goals/recalculate` | Hanya AUTO; tidak ada manual proposal |
| Dashboard | `GET /me/dashboard?date=` | Nutrients totals + coverage + target berlaku |
| Progress | `GET /me/progress/nutrition`, `GET /me/progress/weight`, `GET /me/progress/consistency` | NO_LOGS, aktif, selesai, target historis |
| Sync | `POST /me/sync/push`, `GET /me/sync/pull?cursor=` | Operasi idempotent, tombstone, per-owner feed |
| Account | `POST /me/account/deletion-request`, `GET /me/account/deletion-status` | Verifikasi ulang sesuai sensitivitas; durable workflow |

**Tidak ada** `/me/goals/manual-proposal`, akses LOG_ONLY, recipe builder pengguna, atau endpoint publik CRUD katalog untuk klien pada MVP. O-18 menetapkan recent foods, custom food sederhana, favorit makanan, dan salin catatan MVP; scope saved meals terpisah tidak diubah. Editorial import via tooling admin terpisah.

## 5. Permintaan dan respon yang harus dipenuhi

### 5.1 Bootstrap

`POST /me/bootstrap`: body kosong; membuat akun terhubung ke UID dari token. Repeat aman. Response `data.user_id`, `account_status`, `email_verified`, `onboarding_status`; status email tidak membatasi fitur utama.

### 5.2 Onboarding

`PUT /me/onboarding`: field tanggal lahir/age-proof sesuai kebijakan, tinggi, berat awal, activity level (tepat satu), parameter fisiologis, goal, target weight bila diperlukan, body type visual opsional. Server mengecek 18+, eligibility, konsistensi. Commit profil + initial weight + active AUTO goal atomik jika engine valid. Jika engine belum lolos validasi klinis, **jangan aktifkan klaim target siap-produksi**.

### 5.3 Food log

`POST /me/food-logs`: `id` client UUID, `journal_date`, `journal_time_zone`, `meal_type`, `source_kind`, `source_revision_id`, `quantity` string, `unit` yang resolvable. Server resolve versioned nutrients, menulis snapshot. `PATCH` porsi memakai *revisi sumber yang sama*, ganti makanan eksplisit memakai sumber baru. `DELETE` tombstone. Copy menghasilkan entri baru, bukan link yang berubah bersama asal.

### 5.4 Berat dan goal

`POST /me/weights`: `id`, `measured_at`, `journal_date`, `journal_time_zone`, `weight_kg`. Backdated valid tersimpan untuk grafik; ukur terbaru yang aktif berubah → evaluasi dan aktivasi goal dari transaksi server. Edit/hapus latest dapat mengubah acuan. Target efektif mulai aktivasi; historical Progress per tanggal mengacu pada target yang efektif pada akhir tanggal lokal. Optimistic offline preview hanya label `sementara`.

### 5.5 Journal, dashboard dan progress

`PUT /me/journal-days/{date}/completion`: `{ "completion_status": "CONFIRMED_COMPLETE" }` atau `OPEN`. Dashboard menerima `day_status=NO_LOGS|LOGGED`, `completion_status`, 11 nutrient coverage, goal effective. Consistency: `active_days` minimal satu log, `completed_days` user-confirmed; jangan anggap nutrisi lengkap/target tercapai.

### 5.6 Sync — kontrak operasional

`POST /me/sync/push` request (batch terbatas, urutan per-device dijaga):

```json
{
  "device_id": "uuid", "operations": [
    {"operation_id":"uuid", "device_sequence":12, "entity_type":"food_log", "entity_id":"uuid", "kind":"UPDATE", "payload":{"quantity":"200.00000"}}
  ]
}
```

Server untuk setiap operasi melakukan: verifikasi UID/ownership → cek UNIQUE(owner_user_id, operation_id) dan identity/payload kanonis → validasi sequence per-device → transaksi domain+tombstone/versi+receipt+change_feed → return APPLIED|REPLAYED|REJECTED dan cursor. Retry identik mengembalikan receipt tersimpan tanpa mutasi baru; payload berbeda ditolak. Server-ordered LWW memakai urutan penerapan transaksional sukses, bukan jam perangkat. base_revision hanya diagnostik, bukan penolakan stale-edit biasa. UPDATE pada tombstone ditolak dengan ENTITY_DELETED. Cursor berasal dari counter transaksional per pengguna dengan row sync head dikunci sampai commit, bukan identity/sequence biasa.

`GET /me/sync/pull?cursor=opaque`: perubahan user saja, paginated dengan watermark stabil dan cursor terakhir terkirim. Cursor kedaluwarsa memberi HTTP 410 `CURSOR_EXPIRED` dan full resync aman; jangan menghapus unsent local outbox.

**Kondisi penting:** jika operasi gagal permanen akibat perubahan dari perangkat lain, tampilkan status `Perlu perhatian`, bukan klaim tersinkron. Jangan menghapus operasi sebelum server mengakuinya. Urutan perubahan dalam perangkat harus terjaga dalam antrean yang persisten. Retry pakai ID operasi yang sama.

### 5.7 Penghapusan akun

`POST /me/account/deletion-request`: tahan mutasi baru, catat permintaan idempotent, eksekusi pembersihan data PostgreSQL dan Firebase dengan job/retry durable; aplikasi menghapus cache dan kredensial lokal setelah langkah yang aman. `GET deletion-status` hanya menyediakan status aman; jangan berjanji atomic distributed transaction Firebase+PostgreSQL. Incomplete = perlu retry/manual remediation, bukan `DELETED` palsu.

## 6. Kesalahan, validasi, idempotensi

| HTTP | Error code | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body, UUID, decimal, unit, date invalid |
| 401 | `AUTH_REQUIRED` | Firebase token invalid/expired |
| 403 | `NOT_ELIGIBLE` / `ACCOUNT_DELETING` | Eligibility atau akun proses hapus |
| 404 | `NOT_FOUND` | Objek tidak ada atau milik user lain |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Operation ID sama, payload beda; **bukan** stale revision LWW |
| 410 | `CURSOR_EXPIRED` | Perlu full resync aman tanpa kehilangan outbox |
| 422 | `NUTRITION_UNAVAILABLE` | Komposisi/porsi tidak bisa divalidasi |
| 429 | `RATE_LIMITED` | Abuse prevention |
| 500/503 | `SERVER_ERROR` / `DEPENDENCY_UNAVAILABLE` | Jangan bocorkan kredensial atau SQL |

Gunakan request ID untuk log aman tanpa menulis token, kesehatan pribadi, atau payload nutrisi sensitif. Rate limiting login ditangani Firebase untuk autentikasi; route API perlu rate limit terpisah.

## 7. Acceptance & pre-code gates

- Email belum verified dapat onboarding dan sync, tetapi server cek semua private ownership.
- Onboarding under-18 / profil unsupported ditolak tanpa target palsu; fitur manual target tidak terekspos.
- Semua 11 nutrient: known, null, zero, partial; hari NO_LOGS tidak salah menjadi 0.
- Backdated weight dan perubahan latest mengikuti effective version tanpa rewrite histori.
- Retry identity/payload identik pada owner yang sama tidak membuat mutasi baru; key sama payload beda ditolak; two-device server-ordered LWW; UPDATE tombstone memberi ENTITY_DELETED.
- Logout melindungi pending local writes; penghapusan akun menyelesaikan Firebase dan PostgreSQL, termasuk partial-failure recovery.
- Security review: Firebase token verification, TLS, device encryption, multi-account isolation, structured errors, request logging.
- Clinical validation dan food source legal clearance **tetap mandatory sebelum publikasi**, bukan diputuskan oleh schema/API ini.
- Gate teknis OPEN: typed sync payload per entitas, canonical hashing, validasi semantik OpenAPI 3.1/examples/responses, migrasi/constraint/concurrency tests; Firebase SDK/persistensi Expo 57 dan SQLCipher device QA belum terverifikasi.

**Tahap sesudah dokumen ini:** rincikan `openapi.yaml`, `sql-migration-plan.md` (tanpa menjalankan SQL), dan engineering signoff. Jangan mulai coding sampai review kontrak disetujui.
