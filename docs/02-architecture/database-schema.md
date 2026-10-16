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
- Identity M03-01A APPROVED: tinggi `numeric(8,2)` cm dan berat `numeric(10,3)` kg. Backend menolak presisi input berlebih sebelum coercion PostgreSQL, overflow, nilai non-finite (`NaN`/infinity), serta antropometri nonpositif; jangan membulatkan input otoritatif diam-diam. Validasi usia dinamis dilakukan server, bukan CHECK dengan `CURRENT_DATE`.
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

`PK`, `FK`, `UQ`, `NN`, `?` = nullable; `revision` adalah bilangan naik setiap operasi sukses. Kepemilikan tabel owner-bound mengacu ke `app_users.id` langsung atau melalui relasi yang ditetapkan; `user_preferences` hanya melalui `user_profiles`, tanpa FK langsung duplikat ke akun. Publik hanya dapat dibaca melalui API sesuai akses.

### 3.1 Identitas, profil, persetujuan

| Tabel | Kolom minimum / ketentuan |
|---|---|
| `app_users` | `id uuid` PK NN; `firebase_uid text` UQ NN, tidak kosong dan case-sensitive; `email_display text` ?, `email_verified_cache boolean` ?; `account_status text` NN CHECK ACTIVE/PENDING_DELETION/DELETED; `created_at`, `updated_at timestamptz` NN; **tidak mengunci email unverified** |
| `user_profiles` | `user_id uuid` PK/FK NN ke `app_users.id` ON DELETE CASCADE; `date_of_birth date`, `height_cm numeric(8,2)`, `calculation_parameter text`, `activity_level text`, `goal_type text`, `onboarding_completed_at timestamptz`, `profile_revision integer`, `created_at`, `updated_at timestamptz` semuanya NN; `target_weight_kg numeric(10,3)` ? wajib untuk cutting/bulking; `body_type_visual text` ? **bukan input engine**; **tanpa kolom `onboarding_status`** |
| `privacy_acknowledgements` | `id uuid` PK NN; `user_id uuid` FK NN ke `app_users.id` ON DELETE RESTRICT; `notice_version text`, `ack_type text`, `acknowledged_at timestamptz` NN; versi/type tidak kosong; UQ `(user_id, notice_version, ack_type)`; timestamp server tepercaya, retry identik mempertahankan record awal |
| `user_preferences` | `user_id uuid` PK/FK NN ke `user_profiles.user_id` ON DELETE CASCADE, tanpa FK langsung ke `app_users`; `language_code text`, `time_zone text`, `preferred_weight_unit text`, `updated_at timestamptz` NN; unit CHECK kg/lb; zona waktu IANA divalidasi backend |

**APPROVED M03-01A — lifecycle identity:** draft onboarding hanya lokal, terenkripsi dan scoped ke akun terautentikasi. Backend tidak menyimpan profil parsial. Buat `user_profiles` dan `user_preferences` bersama dalam transaksi setelah onboarding lengkap dan valid. API menurunkan `NOT_STARTED` bila belum ada profil selesai, dan `COMPLETED` bila ada profil tervalidasi; `IN_PROGRESS` milik draft lokal. Input tidak eligible tidak menghasilkan profil selesai atau target AUTO. Status API bukan kolom database; keberadaan profil tidak otomatis membuktikan rekomendasi nutrisi aktif.

**APPROVED — vocabulary struktural:** `goal_type` = `maintenance|cutting|bulking|muscle_gain`; `activity_level` = `very_low|light|moderate|high|very_high`. `calculation_parameter` adalah kode terstruktur tidak kosong; enum klinis/kompatibilitasnya **OPEN**, bukan konstanta fallback. Backend wajib menolak kode yang belum disetujui. Nilai antropometri terisi harus positif dan finite; `profile_revision > 0`. Target berat yang diberikan untuk goal lain tetap harus valid; target berat bukan target kalori manual.

**APPROVED UX / OPEN legal:** satu tindakan persetujuan privasi dalam alur registrasi/onboarding; notice penjelas boleh muncul tanpa meminta persetujuan berulang untuk tujuan yang sama. Ini tidak memberi izin hukum tanpa batas. Simpan bukti berversi, jangan menimpa timestamp atau menggandakan record saat retry identik. `ONBOARDING_PRIVACY` hanya nama kode **PROPOSED**; vocabulary final, dasar hukum, withdrawal, retensi dan backup-deletion **OPEN**. Arah kebijakan: bukti ikut dihapus saat penghapusan akun selesai kecuali review legal menetapkan kewajiban retensi yang sah. CASCADE saja bukan workflow penghapusan akun.

**APPROVED final DDL M03-01A:** FK dan default teknis telah ditetapkan pada [schema fisik](postgres-physical-schema-v1.5.md#kontrak-identity-m03-01a). FK preferensi mencegah preferensi tanpa profil, tetapi tidak menjamin setiap profil mempunyai preferensi; pembuatan keduanya tetap wajib atomik di backend. `account_status` tidak mempunyai default; backend berotorisasi harus mengisinya eksplisit. Cache email tetap nullable. Waktu completion diisi backend tanpa default; waktu acknowledgement DEFAULT now() mencatat penerimaan server, bukan bukti waktu interaksi perangkat. `updated_at` default INSERT tidak otomatis memperbarui row lama.

**APPROVED deletion FK / OPEN legal:** PENDING_DELETION adalah status logis, bukan DELETE fisik. Aksi ON DELETE hanya berlaku saat penghapusan fisik. RESTRICT mewajibkan workflow menyelesaikan record acknowledgement secara eksplisit sebelum menghapus app_users. Bila legal mengharuskan bukti dipertahankan setelah akun dihapus, arsitektur retensi harus direview sebelum implementasi; jangan menyimpan data pribadi diam-diam tanpa dasar hukum. Legal retention/withdrawal/backups tetap OPEN, tetapi FK struktural di atas bukan lagi keputusan OPEN.

**READY untuk penulisan/pengujian struktural M03-01B:** `backend/migrations/0001_identity.sql` boleh dirancang sebelum domain berat/goal dan backend onboarding lengkap tersedia; file belum dibuat pada task ini. Kontrak completion preferensi/acknowledgement/eligibility serta batas transaksi dengan initial weight dan AUTO goal tetap **OPEN untuk implementasi completion**, bukan blocker struktur empat tabel identity. Jangan membuat profil produksi dengan parameter klinis belum disetujui, berat/target palsu, kolom identity tambahan, atau menandai rekomendasi aktif sebelum engine dan persistence siap. Bootstrap ledger tetap terpisah dari domain 0001.

**OPEN referensi di luar penyelarasan ini:** [API Contract §5.2](api-contract.md#52-onboarding) masih memuat alternatif age-proof; keputusan M03-01A di sini dan OpenAPI menetapkan full DOB DATE, bukan membuka ulang pilihan usia. [Nutrition Engine §3](nutrition-engine-spec.md#3-data-input-kontrak-konseptual-bukan-skema-sql) masih memakai alias konseptual formula_sex_parameter/primary_goal/daily_activity_level; nama public/database tetap calculation_parameter/goal_type/activity_level. Mapping adapter dan review klinis tetap OPEN; alias tersebut bukan izin menambah field identity atau enum klinis.

Berat profil saat ini **diturunkan** dari `weight_measurements`, bukan duplikat kolom berat yang tak sinkron. Nama pengguna opsional; Firebase mengelola provider login.

### 3.2 Katalog Nusantara dan provenance

| Tabel | Kolom minimum / ketentuan |
|---|---|
| `food_sources` | `id`, `name`, `source_type`, `reference`, `license_status` wajib; `edition`, `permission_notes`, `accessed_at` nullable. Status hanya UNVERIFIED/ALLOWED/RESTRICTED/DENIED; [kontrak fisik final M03-01](postgres-physical-schema-v1.5.md#kontrak-food_sources-m03-01). |
| `foods` | `id` PK, `canonical_name`, `normalized_name`, `food_type`, `publication_status`, `created_at`, `updated_at` wajib; `region`, `current_published_revision_id` nullable. Tidak ada UNIQUE global nama; [kontrak struktural final](postgres-physical-schema-v1.5.md#kontrak-katalog-struktural-m03-01). |
| `food_revisions` | Baseline 0003: `id` PK, `food_id` FK, `revision_number` UQ per food dan > 0, `source_id` FK wajib, `basis_quantity` positif finite tanpa default 100, `basis_unit` g/ml, `composition_definition`, `source_method`, `quality_status` wajib; `published_at` nullable sesuai status. Satu sumber utama per revisi. Kontrak lanjutan menyetujui penambahan `source_record_reference` dan `source_reference_snapshot` nullable melalui migration baru, keduanya NULL atau keduanya nonblank; SQL 0005 diterapkan/diuji pada target disposable yang disetujui; suite gabungan 24/24 PASS, exit 0. |
| `food_revision_nutrients` | `food_revision_id` FK dan `nutrient_code` wajib, PK gabungan; kode salah satu 11 kanonis; `value numeric(14,5)` nullable, finite/nonnegatif jika diketahui. CHECK tidak menggantikan review publikasi. |
| `serving_definitions` | Sepuluh kolom APPROVED: `id`, `food_revision_id`, `label`, `base_quantity` positif finite, `method`, `reviewed`, `sort_order`, `source_id`, `source_record_reference`, `source_reference_snapshot`; seluruhnya wajib. `base_unit` diturunkan dari revisi, bukan kolom tersimpan; `reviewed` boolean menggantikan rancangan lama `review_status`. |
| `categories` | Enam kolom APPROVED: `id`, `parent_id` ?, `slug` UQ, `name`, `sort_order` nonnegatif, `is_active` eksplisit; CHECK menolak self-parent, enforcement siklus lintas baris tetap OPEN. |
| `food_categories` | PK `(food_id, category_id)`, `is_primary`; paling banyak satu utama |
| `food_aliases` | `id`, `food_id`, `alias`, `normalized_alias`, `locale` ?, unik `(food_id,normalized_alias)` |
| `catalog_reviews`, `catalog_review_sources`, `catalog_import_batches` | Kontrak audit/governance APPROVED, belum diimplementasikan; target FK nyata, keputusan append-only, permission evidence, batch terminal dan relasi review-sumber. [Kontrak governance](#governance-katalog-m03-01). |

**APPROVED M03-01 — food_sources contract alignment:** pemilik proyek menyetujui delapan kolom registry sumber di atas, termasuk nullability, DEFAULT UUID, CHECK teks tidak blank dan timestamp finite. Matriks tipe/default/CHECK serta arti kolom hanya dirinci pada kontrak fisik tertaut. `source_type` adalah teks tanpa enum yang ditetapkan; `reference` menerima referensi bibliografis, tidak dibatasi URL. `license_status` dan `accessed_at` tanpa default; unknown pada kolom nullable tidak diganti nilai buatan.

Sesuai [D05](../04-development/decision-register-v2.md), `ALLOWED` tetap memerlukan bukti sah atas hak penggunaan/penyimpanan/redistribusi dan atribusi per sumber. Registry metadata bukan legal clearance atau audit publikasi lengkap. Approval awal hanya kontrak dokumentasi; penulisan SQL dan pengujian PostgreSQL berikutnya disetujui terpisah. `0002_food_sources.sql` kini lulus **13/13 integration tests, exit code 0**, termasuk constraint dan lifecycle pada target disposable yang disetujui; lihat [status migration](sql-migration-plan.md#food-sources-m03-01). Tidak ada izin seed/import sumber nyata, endpoint, atau publikasi. Kontrak traceability lain dan review legal/nutrisi tetap OPEN. **M03-01 belum DONE.**

**APPROVED M03-01 — food catalog structural contract:** pemilik proyek menyetujui matriks lengkap `foods`, `food_revisions`, `food_revision_nutrients`, default teknis, CHECK, indeks minimum serta FK pada [kontrak fisik tunggal](postgres-physical-schema-v1.5.md#kontrak-katalog-struktural-m03-01). Approval ini melengkapi riwayat food_sources di atas; tidak mengesahkan seluruh proposal [Food Database Specification](Food-Database-spec.md). Persetujuan lanjutan mengizinkan penulisan `0003_food_catalog.sql`, kemudian satu target disposable dan satu invocation suite PostgreSQL. Hasil terminal pemilik proyek: **18/18 PASS, 0 fail/skip, exit code 0**, termasuk 17 checkpoint dan satu parent test; [bukti dan kondisi akhir](../../backend/tests/integration/README.md#food-catalog-m03-01).

**APPROVED M03-01 — remaining catalog structural contract alignment:** persetujuan pemilik sesudah checkpoint `7bd2dd1` menetapkan empat tabel categories/food_categories/food_aliases/serving_definitions serta dua kolom provenance tambahan pada food_revisions. [Matriks fisik final](postgres-physical-schema-v1.5.md#kontrak-katalog-lanjutan-m03-01) menjadi sumber tipe, nullability, default, constraint dan indeks; approval lanjutan mengizinkan penulisan [dua migration dan persiapan tests](sql-migration-plan.md#katalog-lanjutan-m03-01). File 0004/0005 telah diuji pada satu target disposable: [suite gabungan 24/24 PASS, exit 0](../../backend/tests/integration/README.md#katalog-lanjutan-m03-01). Tidak ada default baru selain UUID yang tercantum; FK paket RESTRICT untuk DELETE/UPDATE dan NOT DEFERRABLE. Kolom tambahan tidak mengubah file/kontrak historis 0003; setelah 0005 UP, food_revisions menjadi 12 kolom sebagaimana final state terverifikasi. Bukti ini berlaku pada database disposable yang disetujui, bukan nutrasa_dev/nutrasa_test atau fitur aplikasi operasional.

- **Normalisasi konseptual APPROVED, implementasi belum ada:** Unicode NFC -> trim/collapse whitespace -> lowercase -> NFC. Satu implementasi backend reusable kelak menurunkan foods.normalized_name dari canonical_name, food_aliases.normalized_alias dari alias, serta query pencarian ternormalisasi. Teks tampilan asli tetap dipertahankan; CHECK nonblank tidak menjamin algoritme ini sudah dijalankan. Tidak ada generated column, trigger, perubahan data, vocabulary sinonim atau implementasi normalisasi baru pada tahap dokumentasi.
- **Porsi dan provenance:** kuantitas porsi selalu dalam basis_unit revisi terkait; DTO ServingDefinition tetap menyediakan base_unit melalui JOIN dan reviewed boolean sesuai OpenAPI. Bukti porsi wajib mempunyai source_id/locator/snapshot sendiri dan boleh berasal dari sumber berbeda dari komposisi, tanpa mengubah aturan satu sumber utama komposisi atau mengklaim provenance campuran per nutrien. Snapshot referensi menyimpan bukti sebenarnya, bukan legal clearance atau histori izin lengkap. Log historis kelak memakai revisi/konversi asal dan snapshot, bukan porsi terbaru; penetapan referensi porsi pada input log tetap OPEN sebelum implementasi logging.

- Identitas makanan terpisah dari komposisi dan nilai nutrisi berversi. Rantai relasi minimum: `food_sources -> food_revisions -> food_revision_nutrients`; satu sumber utama berlaku untuk seluruh komposisi revisi, tanpa klaim provenance campuran per nutrien. `food_revisions.source_id` bukan referensi polimorfik food/custom pada log atau favorit.
- Status makanan `DRAFT/IN_REVIEW/APPROVED/PUBLISHED/ARCHIVED` mengatur antrean publikasi/visibilitas; status revisi `DRAFT/REVIEWED/PUBLISHED` mengatur review versi komposisi. Keduanya tanpa default. CHECK lokal mewajibkan pointer pada makanan PUBLISHED dan `published_at` terisi tepat ketika revisi PUBLISHED; label status bukan bukti review atau izin sumber.
- Pointer gabungan memastikan revisi milik makanan yang sama. Empat FK paket baseline 0003 memakai ON DELETE RESTRICT, ON UPDATE RESTRICT, NOT DEFERRABLE; pointer memakai MATCH SIMPLE agar NULL sah sebelum publikasi. Enam FK baru pada kontrak lanjutan mengikuti kebijakan aksi/deferrability yang sama. Tidak ada CASCADE atau UNIQUE nama global.
- Draft mempunyai 0-11 baris nutrisi; sebelum publikasi wajib tepat 11 kode kanonis, empat inti diketahui dan ditinjau, tujuh lainnya boleh NULL. Pemeriksaan lintas tabel dan bukti review ini tetap OPEN untuk implementasi; PK/CHECK hanya membatasi kode, duplikasi dan nilai pada baris yang ada. Nutrient object API tetap tepat 11 field decimal-string/null, diambil dari revisi terpilih tanpa menduplikasi komposisi pada foods.

**Publikasi tetap diblokir:** revisi PUBLISHED tidak boleh diubah pada bagian komposisi, porsi, dan identitas sumber; terbitkan revisi baru. Enforcement immutability, validasi target pointer PUBLISHED, kelengkapan/review nutrisi, bukti izin per sumber, identitas reviewer/editorial authorization, runtime privileges, siklus kategori lintas baris dan concurrency editorial tetap OPEN. RESTRICT melindungi referensi, bukan menjamin append-only atau melarang perubahan langsung pada nilai nutrisi. Locator/snapshot telah diuji secara struktural pada suite gabungan 0004/0005; algoritme normalisasi disetujui tetapi belum diimplementasikan; riwayat bukti izin, vocabulary operasional food_type/source_method/method, implementasi audit editorial dan import batches tetap OPEN; kontrak fisiknya kini APPROVED pada bagian governance. Pada checkpoint 0004/0005 catalog_reviews/catalog_import_batches ditunda dari dua paket tersebut; kini kontrak governance APPROVED di bawah, implementasi/pengujian dan owner/legal gates tetap OPEN dalam scope M03-01 sebelum import/publikasi. Endpoint publikasi, import, editorial dan modifikasi hierarki tidak boleh diaktifkan sebelum mekanismenya disetujui. Jangan impor permanen konten API yang lisensinya melarang penyimpanan. Tiga tabel struktural 0003 sudah dibentuk dan diuji pada target disposable yang disetujui, bukan pada database dev/test utama; approval dokumentasi lanjutan tidak mengubah bukti tersebut. Hasil ini bukan izin publikasi, seed atau import dan **M03-01 belum DONE**.

### Governance katalog M03-01

**APPROVED CONTRACT — owner sesudah checkpoint 75e43c7; enforcement belum diimplementasikan.** SQL struktur 0006 telah diuji pada target disposable yang disetujui: [16/16 integration PASS, 0 fail/skip, exit 0](../../backend/tests/integration/README.md#catalog-audit-foundation-m03-01), termasuk upgrade, failure rollback, empty DOWN/UP/re-run dan populated DOWN refusal. Enforcement operasional tetap OPEN. [Matriks fisik governance](postgres-physical-schema-v1.5.md#kontrak-governance-katalog-m03-01) adalah satu sumber tipe/nullability/default/constraint/indeks; tidak menggandakan matriks atau mengubah file historis 0001-0005. Status sebelum approval ini bahwa field audit belum dirinci adalah riwayat keputusan; kontrak berikut kini disetujui untuk dokumentasi saja.

- catalog_reviews: 21 kolom; keputusan append-only SOURCE_PERMISSION/NUTRITION/PUBLICATION/WITHDRAWAL dengan target sumber atau revisi melalui FK nyata, actor terverifikasi, bukti dan digest berversi.
- catalog_review_sources: tiga kolom; hubungan review nutrisi dengan keputusan izin tiap sumber, termasuk sumber porsi berbeda. PK(review_id,source_id), FK gabungan permission_review_id/source_id memastikan sumber keputusan cocok; bukan UUID array/JSON tanpa FK.
- catalog_import_batches: 13 kolom; hasil terminal IMPORTED/REJECTED satu percobaan, satu sumber utama komposisi, identitas/hash artefak, parser/mapping, operator dan hasil validasi. Tidak menyimpan payload sumber secara otomatis.
- food_revisions.import_batch_id nullable tanpa default; FK gabungan (import_batch_id,source_id) memastikan sumber batch sesuai. Kolom belum ada pada schema teruji 0005 (12 kolom), bukan perubahan migration lama.
- Audit lama tetap tersedia tetapi efektivitasnya diperiksa ulang setelah perubahan konten, keputusan izin, kondisi/tanggal atau review. Hash tidak membuktikan kebenaran nutrisi/izin; decision ACCEPTED tidak menggantikan bukti. Digest tidak bergantung pada ID review yang sedang dibuat.
- Semua writer domain/audit mengikuti transaction-level advisory lock editorial; event_number bukan sync cursor atau pengganti concurrency control. Audit REJECTED setelah rollback impor dicatat melalui transaksi baru yang diotorisasi dan memegang lock, bukan diklaim bertahan dari transaksi gagal.
- Runtime tanpa DML katalog; restricted entrypoints, SECURITY DEFINER minimal, immutable published content, gate publikasi dan hierarchy checks mengikuti [arsitektur keamanan](system-architecture.md#catalog-governance-m03-01). Belum ada fungsi/grant/security test baru yang berjalan.
- [Migration plan dan acceptance](sql-migration-plan.md#governance-katalog-m03-01) memisahkan scanner tanpa DB, audit structure dan governance, kemudian pengujian role/concurrency/rollback pada target baru setelah approval. Tidak ada file migration atau nomor baru yang ditetapkan.

**OPEN owner/legal/clinical:** pihak berwenang, self-review, jumlah/kualifikasi reviewer, identitas lokal versus Firebase, bukti/scope/atribusi/expiry/revocation/retensi sumber dan privasi reviewer. Capability matrix bukan grant ke manusia tertentu. Append-only bukan retensi permanen; histori saat hak dicabut tidak boleh dijanjikan otomatis disimpan atau dihapus. **DEFERRED:** coding, SQL, provisioning/testing dan aktivasi menunggu approval/gate masing-masing. Tidak ada publikasi/import/editorial aktif; M03-01 belum DONE.

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
