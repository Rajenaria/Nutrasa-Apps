# NUTRASA — Database Schema v1.2 (Clean Contract)

**Status:** Design baseline untuk engineering review; **bukan SQL DDL dan bukan izin rilis**. Tanggal 2026-10-13. Berlaku menggantikan rancangan v1.0/v1.1 untuk implementasi MVP. Tidak ada klausul lama yang tetap normatif. Stack: Expo + TypeScript; Firebase Authentication; Fastify lokal; PostgreSQL lokal; Expo SQLite + SQLCipher dalam development build. Biaya layanan lokal ditargetkan Rp0.

## 1. Prinsip wajib

1. Firebase UID dari token tervalidasi adalah identitas autentikasi. `app_users.id` UUID adalah identitas internal; email dan `email_verified` **bukan syarat** akses fitur utama. Status verifikasi ditampilkan di Profil > Pengaturan > Data Diri; aksi sensitif mengikuti Firebase reauthentication.
2. Fastify adalah satu-satunya jalur akses data pribadi cloud; kepemilikan diturunkan dari token, tidak dari payload. PostgreSQL authoritative setelah sync; SQLite berisi salinan per akun, draft, dan antrean operasi.
3. Hanya orang dewasa 18+ dengan profil *eligible* yang dapat menyelesaikan onboarding MVP. Tidak ada LOG_ONLY atau penetapan target MANUAL pada MVP; profil tidak eligible ditolak secara ramah dengan penjelasan, tanpa angka target semu.
4. Semua target kalori dan tiga makro dibuat secara **otomatis** oleh engine terversi yang berjalan/tervalidasi di server. Perubahan berat valid terbaru memicu evaluasi ulang, menjaga histori, target baru efektif saat diterapkan (tidak retroaktif).
5. Food log menyimpan nutrisi snapshot serta versi sumber. Publikasi revisi baru makanan tidak mengubah riwayat.
6. Nutrisi katalog publik wajib punya energi, protein, karbohidrat, lemak yang ditinjau. Tujuh metrik lain boleh `NULL`; `NULL` berbeda dari `0`.
7. Offline menggunakan **server-ordered last-applied-write-wins**, bukan jaminan tindakan kronologis pada perangkat. Operasi dalam satu perangkat berurutan, operasi diulang secara idempoten; update tertunda tidak boleh menghidupkan kembali row yang sudah tombstone.
8. Hari tanpa log = tidak ada data, bukan nol; Hari Aktif minimal satu log nondeleted. Selesai Mencatat opsional dan terpisah dari aktivitas serta kelengkapan 11 nutrisi.
9. Data lokal pribadi dibersihkan saat logout setelah pilihan aman bagi antrean tertunda. Penghapusan akun dikoordinasikan dan bisa diulang; penghapusan tidak bisa dibatalkan secara diam-diam dengan sync perangkat lama.

## 2. Tipe, satuan dan presisi

- ID domain: UUID. UTC timestamps: PostgreSQL `timestamptz`, dikirim sebagai RFC3339. Tanggal jurnal: `date` literal `YYYY-MM-DD` + `journal_time_zone` IANA, jangan dipaksa dari UTC perangkat.
- Nutrisi otoritatif memakai `numeric(14,5)` bila cocok dengan data sumber; nilai negatif ditolak, kecuali aturan domain secara eksplisit mengizinkan nilai khusus. Berat `numeric(10,3)` kg; kuantitas `numeric(14,5)` dalam g/ml. Jumlah pada JSON API dikirim sebagai **string desimal** untuk menjaga presisi; adapter UI boleh memformat angka.
- Hitung komposisi dari data sumber tanpa pembulatan antara; pembulatan hanya saat presentasi. Uji presisi dan batas nilai sebelum mengunci migration.
- Nutrient object persis **11 field**, nilai `decimal string | null`, masing-masing unit tetap:

| Field | Unit | Wajib untuk publikasi katalog |
|---|---|---|
| `energy_kcal` | kcal | Ya |
| `protein_g` | g | Ya |
| `carbohydrate_g` | g | Ya |
| `fat_g` | g | Ya |
| `fiber_g` | g | Tidak |
| `sugar_g` | g | Tidak |
| `saturated_fat_g` | g | Tidak |
| `trans_fat_g` | g | Tidak |
| `cholesterol_mg` | mg | Tidak |
| `sodium_mg` | mg | Tidak |
| `potassium_mg` | mg | Tidak |

- Agregasi harian per nutrient: `known_sum`, `known_count`, `unknown_count`, `coverage_status=COMPLETE|PARTIAL|UNKNOWN`. PARTIAL menampilkan `≥known_sum` (nonnegative); UNKNOWN menampilkan `—`. Untuk hari `NO_LOGS`, jangan beri COMPLETE hanya karena penjumlahan himpunan kosong menghasilkan nol.

## 3. Entitas PostgreSQL — kontrak logis

`PK`, `FK`, `UQ`, `NN`, `?` = nullable; `revision` adalah bilangan naik setiap operasi sukses. Seluruh tabel owner-bound mempunyai FK ke `app_users.id`; publik hanya dapat dibaca melalui API sesuai akses.

### 3.1 Identitas, profil, persetujuan

| Tabel | Kolom minimum / ketentuan |
|---|---|
| `app_users` | `id` PK UUID, `firebase_uid` UQ NN, `email_display` ?, `email_verified_cache` ?, `account_status` ACTIVE/PENDING_DELETION/DELETED, timestamps; **tidak mengunci email unverified** |
| `user_profiles` | `user_id` PK/FK, `date_of_birth` atau minimum age-proof sesuai review privasi, `height_cm`, `calculation_parameter`, `activity_level`, `goal_type`, `target_weight_kg` untuk cutting/bulking, `body_type_visual` ? **bukan input engine**, `onboarding_status` NOT_STARTED/IN_PROGRESS/COMPLETED/INELIGIBLE, `onboarding_completed_at`, `profile_revision`, timestamps |
| `privacy_acknowledgements` | `id`, `user_id`, `notice_version`, `ack_type`, `acknowledged_at`; teks dan dasar hukum perlu review |
| `user_preferences` | `user_id` PK/FK, `language_code`, `time_zone` IANA, `preferred_weight_unit`, `updated_at` |

Berat profil saat ini **diturunkan** dari `weight_measurements`, bukan duplikat kolom berat yang tak sinkron. Nama pengguna opsional; Firebase mengelola provider login.

### 3.2 Katalog Nusantara dan provenance

| Tabel | Kolom minimum / ketentuan |
|---|---|
| `food_sources` | `id`, `name`, `source_type`, `edition`, `reference`, `license_status` UNVERIFIED/ALLOWED/RESTRICTED/DENIED, `permission_notes`, `accessed_at` |
| `foods` | `id`, `canonical_name`, `normalized_name`, `food_type`, `region` ?, `publication_status`, `current_published_revision_id` ?, timestamps |
| `food_revisions` | `id`, `food_id` FK, `revision_number` UQ per food, `basis_quantity` positif (umumnya 100), `basis_unit` g/ml, `composition_definition`, `source_id`, `source_method`, `quality_status` DRAFT/REVIEWED/PUBLISHED, `published_at` |
| `food_revision_nutrients` | `food_revision_id`, `nutrient_code` salah satu 11, `value` numeric ?, PK gabungan; nilai wajib publikasi non-NULL |
| `serving_definitions` | `id`, `food_revision_id`, `label`, `base_quantity` positif, `base_unit` kompatibel g/ml, `method`, `review_status`, `sort_order` |
| `categories` | `id`, `parent_id` ?, `slug` UQ, `name`, `sort_order`, `is_active`; cegah siklus |
| `food_categories` | PK `(food_id, category_id)`, `is_primary`; paling banyak satu utama |
| `food_aliases` | `id`, `food_id`, `alias`, `normalized_alias`, `locale` ?, unik `(food_id,normalized_alias)` |
| `catalog_reviews`, `catalog_import_batches` | audit sumber, reviewer, keputusan, hash batch, tanggal; hanya admin |

Revisi PUBLISHED tidak boleh diubah pada bagian komposisi, porsi, dan identitas sumber; terbitkan revisi baru. Publikasi gagal jika izin sumber belum sesuai atau 4 nilai inti tidak ditinjau. Jangan impor permanen konten API yang lisensinya melarang penyimpanan.

### 3.3 Makanan personal, resep, favorit, saved meals

O-18 final: custom food sederhana, favorit makanan, recent dari log, dan salin catatan adalah MVP. Tiga model resep pengguna berikut hanya desain post-MVP; bukan migrasi atau fitur aktif MVP. Scope saved meals terpisah tidak diubah oleh O-18.

| Tabel | Kolom minimum / ketentuan |
|---|---|
| `custom_foods` | `id`, `owner_user_id`, `name`, `current_revision_id`, `revision`, `deleted_at` |
| `custom_food_revisions` | `id`, `custom_food_id`, `revision_number`, `basis_quantity`, `basis_unit`, `nutrient_values` JSONB tepat 11, timestamp; immutable |
| `recipes` (post-MVP) | `id`, `owner_user_id`, `name`, `current_revision_id`, `revision`, `deleted_at` |
| `recipe_revisions` (post-MVP) | `id`, `recipe_id`, `revision_number`, `yield_quantity`, `yield_unit`, `nutrient_total_snapshot` JSONB, `calculation_method`; immutable |
| `recipe_ingredients` (post-MVP) | `id`, `recipe_revision_id`, `position`, `source_kind`, **FK bertipe eksplisit** ke food/custom revision, `resolved_base_quantity`, `ingredient_nutrients_snapshot`; nested-recipe scope belum ditetapkan |
| `favorite_foods` | `id`, `owner_user_id`, typed source reference, `created_at`, `deleted_at`; unik aktif |
| `saved_meals` | `id`, `owner_user_id`, `name`, `revision`, `deleted_at` |
| `saved_meal_items` | `id`, `saved_meal_id`, `position`, `display_name_snapshot`, `source_revision_id`, `quantity`, `unit`, `nutrient_snapshot` |

Semua sumber privat diverifikasi milik user bersangkutan, bukan hanya cocok UUID. Jika fitur resep menuntut konversi berat matang, tampilkan batasan eksplisit, jangan mengarang faktor konversi.

### 3.4 Jurnal, berat, target, sinkronisasi

| Tabel | Kolom minimum / ketentuan |
|---|---|
| `food_log_items` | `id` client UUID, `owner_user_id`, `journal_date`, `journal_time_zone`, `meal_type`, `source_kind`, typed `source_revision_id` ?, `display_name_snapshot`, `quantity`, `unit`, `nutrient_snapshot` JSONB 11 field, `revision`, `created_at`, `updated_at`, `deleted_at` |
| `journal_day_states` | PK `(owner_user_id, journal_date)`, `completion_status` OPEN/CONFIRMED_COMPLETE, `revision`, `updated_at`; status ini **bukan** coverage nutrisi |
| `weight_measurements` | `id` UUID, `owner_user_id`, `measured_at`, `journal_date`, `journal_time_zone`, `weight_kg > 0`, `revision`, timestamps, `deleted_at` |
| `nutrition_goal_versions` | `id`, `owner_user_id`, `goal_mode` = AUTO **saja**, `effective_from`, `effective_to` ?, `calculation_status`, 4 target energi/makro, `calculation_input_snapshot`, `formula_version`, `policy_version`, `trigger_reason` ONBOARDING/WEIGHT_UPDATE/PROFILE_UPDATE, `source_weight_measurement_id`, timestamps |
| `sync_operations` | `operation_id`, `owner_user_id`, `device_id`, `device_sequence`, `entity_type`, `entity_id`, `operation_kind`, `payload_digest`, `result_status`, immutable receipt, `processed_at`; UNIQUE(owner_user_id, operation_id), UNIQUE(owner_user_id, device_id, device_sequence) |
| `change_feed` | `owner_user_id`, `cursor` bigint counter transaksional per pengguna, `entity_type`, `entity_id`, `entity_revision`, `change_type`, `changed_at`, payload snapshot/tombstone; PK(owner_user_id, cursor) |
| `user_sync_heads` | `owner_user_id` PK/FK, `last_cursor` bigint NOT NULL DEFAULT 0; nonnegative, row lock ditahan sampai commit |
| `account_deletion_requests` | `id`, `user_id`, `status`, `requested_at`, `completed_at` ?, `last_error_code` ?, metadata minimal |

Tidak ada `goal_mode=MANUAL`, `LOG_ONLY`, endpoint quick-add, entitas AI/Premium, atau auto-publishing untuk MVP. Simpan masa depan sebagai keputusan terpisah, bukan kontrak aktif.

## 4. Invariant & transaksi

- Ownership ditegakkan server untuk setiap query dan mutasi pribadi. FK dan indeks scope `(owner_user_id, journal_date)` untuk logs, `(owner_user_id, measured_at)` untuk berat, `(owner_user_id, cursor)` untuk feed.
- Buat log → simpan 11-nutrient snapshot dan versi sumber dalam **satu** transaksi; edit porsi → kalkulasi ulang dari revisi komposisi asal. Copy → buat UUID baru dan snapshot tersendiri. Catalog revise tidak mengubah log lama.
- Weight: kandidat acuan adalah pengukuran valid terbaru berdasar `measured_at` (tie-break deterministik ID/created_at). Input backdated disimpan untuk grafik, tidak menimpa acuan lebih baru. Edit/hapus berat acuan memicu hitung ulang. Target baru efektif mulai transaksi aktivasi, histori lama immutable; target daily Progress = yang efektif pada akhir hari lokal. Engine invalid → jangan aktifkan target palsu; tandai status dan pertahankan target valid sebelumnya untuk evaluasi produk/keamanan.
- Serialize target recalculation per user (transaction/advisory lock) sehingga tidak ada rentang `effective_from/effective_to` saling tumpang tindih. Target offline hanya preview, bukan aktif server.
- Sync: **server-ordered LWW** untuk entitas belum terhapus. UNIQUE(owner_user_id, operation_id) dengan identity/payload kanonis identik mengembalikan receipt tersimpan tanpa mutasi kedua; payload berbeda ditolak. Urutan per-device dijaga; domain+feed+receipt satu transaksi atomik. UPDATE pada tombstone ditolak dengan `ENTITY_DELETED`; tidak ada normal `409 STALE_REVISION`.
- Cursor: kunci row `user_sync_heads` per owner sampai commit, alokasikan counter dan feed dalam transaksi yang sama; rollback membatalkan kenaikan. Bukan identity/sequence biasa. Pull memakai watermark stabil dan cursor halaman terakhir terkirim. HTTP 410 `CURSOR_EXPIRED` memicu resync tanpa menghapus outbox. Kebijakan retensi tetap OPEN.
- Privacy: akun PENDING_DELETION menolak mutasi baru dan sync yang akan menghidupkan data kembali. Penghapusan berurutan dan bisa diulang lintas PostgreSQL/Firebase/local; bukti penghapusan disimpan seminimal mungkin menurut kebijakan retensi.

## 5. Indeks & acceptance plan

- `app_users(firebase_uid)` unique; `foods(normalized_name)` dan alias index, pertimbangkan pg_trgm setelah profiling; `food_revisions(food_id, revision_number)` unique; `food_log_items(owner_user_id,journal_date,meal_type)`; `weight_measurements(owner_user_id,measured_at)`; `nutrition_goal_versions(owner_user_id,effective_from)`; `change_feed` PK(owner_user_id,cursor); `sync_operations` UNIQUE(owner_user_id,operation_id), UNIQUE(owner_user_id,device_id,device_sequence).
- Uji: published nutrients wajib; unknown≠zero; multi-user isolation; duplicate outbox; offline delete vs stale update; weight backdate/edit/delete; timezone rollover; historical target; logout pending queue; account deletion partial-failure; rollback migration.

## 6. Batas yang masih memerlukan review

- Parameter clinical Nutrition Engine (koefisien, validasi rumus, guardrails), eligibility profil, lisensi/izin impor makanan, kebijakan privacy-retention, model autentikasi native Google/Apple, SQLCipher EAS/dev-build testing. **Jangan klaim sudah tervalidasi/rilis**.
- Dokumen v1.2 ini adalah baseline bersih untuk merinci OpenAPI, migration plan, dan engineering review. Presisi indeks/DDL, retensi cursor, serta aturan multi-device sequence diuji sebelum kode production.
