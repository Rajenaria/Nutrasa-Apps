# NUTRASA — Rancangan Skema Fisik PostgreSQL v1.5

**Status:** spesifikasi review, belum SQL DDL. Mengikuti Database Schema v1.2 dan Decision 01–10. Tidak boleh digunakan sebagai klaim migration sudah siap.

## Konvensi umum

- PK UUID dengan `gen_random_uuid()`; UUID buatan klien dipertahankan untuk entity offline. `timestamptz` untuk waktu peristiwa server, `date` + `journal_time_zone` IANA untuk jurnal lokal. Nullable mempunyai arti eksplisit.
- Numeric energi/nutrisi `numeric(14,5) CHECK(value >= 0)`; berat `numeric(10,3) CHECK(weight_kg > 0)`; kuantitas `numeric(14,5) CHECK(quantity > 0)`. Pembulatan di UI saja.
- Private FK `owner_user_id → app_users.id`, indeks owner-first. Semua query private mewajibkan `owner_user_id` dari token Firebase tervalidasi.
- Mutable entities use positive revision and deleted_at tombstones; delayed UPDATE returns ENTITY_DELETED. Audit timestamps do not establish sync ordering: use the transactional per-user counter locked through commit.
- JSONB nutrisi harus memenuhi tepat 11 nama kanonis dengan nilai berupa decimal-string atau null; validasi ketat di Fastify dan CHECK/trigger di database bila dipilih. **Jangan menyimpan JSONB tanpa schema validation.**

## Matriks tabel inti (kolom kunci, constraint, indeks wajib)

| Tabel | Kolom inti dan jenis | Constraint dan indeks |
|---|---|---|
| `app_users` | `id uuid` PK NN; `firebase_uid text` NN; `email_display text NULL`, `email_verified_cache boolean NULL`; `account_status text`, `created_at timestamptz`, `updated_at timestamptz` NN | UNIQUE(firebase_uid) case-sensitive, tanpa case-folding; CHECK UID tidak kosong; CHECK ACTIVE/PENDING_DELETION/DELETED; index(account_status) direncanakan untuk deletion workflow |
| `user_profiles` | `user_id uuid`, `date_of_birth date`, `height_cm numeric(8,2)`, `calculation_parameter text`, `activity_level text`, `goal_type text`, `onboarding_completed_at timestamptz`, `profile_revision integer`, `created_at timestamptz`, `updated_at timestamptz` NN; `target_weight_kg numeric(10,3) NULL`, `body_type_visual text NULL`; tanpa onboarding_status | PK(user_id), FK user_id ke app_users.id ON DELETE CASCADE; CHECK positif finite, revision > 0, kode tidak kosong, enum goal/activity, target wajib cut/bulk |
| `user_preferences` | `user_id uuid`, `language_code text`, `time_zone text`, `preferred_weight_unit text`, `updated_at timestamptz` semuanya NN | PK(user_id), FK user_id ke user_profiles.user_id ON DELETE CASCADE; tanpa FK langsung ke app_users; CHECK unit kg/lb, language/time_zone tidak kosong; IANA divalidasi server |
| `privacy_acknowledgements` | `id uuid`, `user_id uuid`, `notice_version text`, `ack_type text`, `acknowledged_at timestamptz` semuanya NN | PK(id), FK user_id ke app_users.id ON DELETE RESTRICT; UNIQUE(user_id,notice_version,ack_type); CHECK versi/type tidak kosong |
| `food_sources` | Delapan kolom, tipe/nullability/default final pada [kontrak food_sources M03-01](#kontrak-food_sources-m03-01) | PK; CHECK nonblank, status izin, timestamp finite; metadata bukan legal clearance |
| `foods` | Sembilan kolom pada [kontrak katalog struktural M03-01](#kontrak-katalog-struktural-m03-01) | PK; index(normalized_name); FK gabungan pointer MATCH SIMPLE, NOT DEFERRABLE; tanpa UNIQUE nama atau partial index tambahan |
| `food_revisions` | Sepuluh kolom pada kontrak katalog struktural; source_id wajib | PK; UNIQUE(food_id,revision_number), UNIQUE(food_id,id); FK food/source RESTRICT; CHECK basis, teks dan status/waktu |
| `food_revision_nutrients` | Tiga kolom pada kontrak katalog struktural; value numeric(14,5) NULL | PK(food_revision_id,nutrient_code), FK revisi RESTRICT; CHECK 11 kode, nonnegatif dan finite; enforcement publikasi OPEN |
| `serving_definitions` | `id uuid`, `food_revision_id uuid`, `label text`, `base_quantity numeric(14,5)`, `base_unit text` | FK revision; CHECK positive; index(food_revision_id) |
| `categories` | `id uuid`, `parent_id uuid NULL`, `slug text`, `name text` | UNIQUE(slug), FK parent; prevent hierarchy cycles via service/recursive check |
| `food_categories` | `food_id uuid`, `category_id uuid`, `is_primary bool` | PK(food,category); partial UNIQUE(food_id) WHERE is_primary |
| `food_aliases` | `id uuid`, `food_id uuid`, `normalized_alias text`, `alias text` | UNIQUE(food_id,normalized_alias); trigram index if pg_trgm enabled |
| `custom_foods` | `id uuid`, `owner_user_id uuid`, `current_revision_id uuid NULL`, `revision integer`, `deleted_at timestamptz` | FK owner; index(owner,deleted_at); revisions immutable |
| `custom_food_revisions` | `id uuid`, `custom_food_id uuid`, `revision_number integer`, `nutrient_values jsonb`, `basis_quantity numeric(14,5)` | UNIQUE(custom_food_id,revision_number); validate 11 keys |
| `recipes` — post-MVP | `id uuid`, `owner_user_id uuid`, `current_revision_id uuid NULL`, `revision integer`, `deleted_at timestamptz` | Future user recipe model; not active MVP |
| `recipe_revisions` — post-MVP | `id uuid`, `recipe_id uuid`, `revision_number integer`, `yield_quantity numeric(14,5)`, `nutrient_total_snapshot jsonb` | UNIQUE(recipe_id,revision_number); immutable; future model |
| `recipe_ingredients` — post-MVP | `id uuid`, `recipe_revision_id uuid`, `position integer`, `source_kind text`, `source_revision_id uuid`, `resolved_base_quantity numeric(14,5)`, `ingredient_nutrients_snapshot jsonb` | Future model; FK strategy remains OPEN, no fake polymorphic FK |
| `favorite_foods` | `id uuid`, `owner_user_id uuid`, `source_kind text`, `source_id uuid`, `deleted_at timestamptz` | partial UNIQUE(owner,source_kind,source_id) WHERE deleted_at IS NULL |
| `saved_meals` | `id uuid`, `owner_user_id uuid`, `name text`, `revision integer`, `deleted_at timestamptz` | FK owner, index(owner,deleted_at) |
| `saved_meal_items` | `id uuid`, `saved_meal_id uuid`, `position integer`, `nutrient_snapshot jsonb`, `quantity numeric(14,5)` | FK saved meal; UNIQUE(saved_meal_id,position) |
| `food_log_items` | `id uuid`, `owner_user_id uuid`, `journal_date date`, `journal_time_zone text`, `meal_type text`, `source_kind text`, `source_revision_id uuid NULL`, `nutrient_snapshot jsonb`, `revision integer`, `deleted_at timestamptz` | index(owner,journal_date,deleted_at), FK owner; source typed reference validation |
| `journal_day_states` | `owner_user_id uuid`, `journal_date date`, `completion_status text`, `revision integer` | PK(owner,journal_date); CHECK OPEN/CONFIRMED_COMPLETE |
| `weight_measurements` | `id uuid`, `owner_user_id uuid`, `measured_at timestamptz`, `weight_kg numeric(10,3)`, `deleted_at timestamptz` | index(owner,measured_at DESC) WHERE deleted_at IS NULL |
| `nutrition_goal_versions` | `id uuid`, `owner_user_id uuid`, `effective_from timestamptz`, `effective_to timestamptz NULL`, `goal_mode text`, `formula_version text`, four targets, `source_weight_measurement_id uuid NULL` | CHECK goal_mode=AUTO; CHECK end > start; per-user non-overlap enforced by transaction lock/exclusion constraint |
| `sync_operations` | `operation_id uuid`, `owner_user_id uuid`, `device_id uuid`, `device_sequence bigint`, `payload_digest text`, immutable receipt, `processed_at timestamptz` | UNIQUE(owner_user_id,operation_id), UNIQUE(owner_user_id,device_id,device_sequence); identical retry returns receipt, payload mismatch rejected |
| `change_feed` | `owner_user_id uuid`, `cursor bigint` allocated transactionally from user sync head, `entity_type text`, `entity_id uuid`, snapshot/tombstone payload, `change_type text`, `changed_at timestamptz` | PK(owner_user_id,cursor); row lock held through commit, domain/feed/receipt atomic; no ordinary identity/sequence |
| `user_sync_heads` | `owner_user_id uuid PRIMARY KEY`, `last_cursor bigint NOT NULL DEFAULT 0` | FK app_users; cursor >= 0; serializes feed writers for each owner until commit |
| `account_deletion_requests` | `id uuid`, `user_id uuid`, `status text`, `requested_at timestamptz`, `completed_at timestamptz NULL` | UNIQUE active request per user; workflow retries and audit minimization |

## Kontrak identity M03-01A

- **APPROVED:** empat tabel identity di atas mengikuti [kontrak logis §3.1](database-schema.md#31-identitas-profil-persetujuan). Tidak ada row profil parsial, kolom status onboarding, current_weight, atau password/token Firebase. Profil dan preferensi dibuat atomik setelah validasi backend. Status API diturunkan, bukan persistensi draft server.
- **PostgreSQL:** PK/UNIQUE/FK/NOT NULL dan CHECK mengunci struktur. Goal CHECK `maintenance|cutting|bulking|muscle_gain`; activity CHECK `very_low|light|moderate|high|very_high`; calculation parameter hanya kode terstruktur tidak kosong pada tingkat schema, bukan enum klinis buatan. Target berat wajib non-NULL untuk cutting/bulking; bila terisi selalu positif finite. CHECK tinggi/berat harus menolak NaN secara eksplisit; `> 0` saja tidak cukup. Jangan memakai CHECK usia dengan CURRENT_DATE.
- **Fastify:** verifikasi Firebase token lalu UID ke UUID; ownership bukan owner ID klien. Validasi DOB/usia 18+/eligibility, IANA timezone, parameter klinis yang disetujui, presisi desimal sebelum coercion (tinggi maksimal 2, berat maksimal 3 digit pecahan), overflow dan non-finite. CHECK pada NUMERIC yang sudah dibulatkan tidak dapat mendeteksi presisi input asli yang berlebih. Jangan membulatkan input otoritatif atau mengaktifkan parameter/target yang belum direview. Body-type tidak masuk engine.
- **APPROVED DEFAULT:** kebijakan final ada pada matriks di bawah; tidak ada default status akun, input klinis, completion, bahasa, timezone atau unit. UUID mengikuti konvensi existing `gen_random_uuid()` (PostgreSQL 18, tanpa extension UUID tambahan). Cache email NULL tidak dipaksa menjadi false.
- **Index:** PK/UQ sudah mengindeks UID, owner profil/preferensi dan prefix user acknowledgement. Jangan menambah index duplikat; index account_status untuk workflow deletion tetap perlu konfirmasi kebutuhan query.
- **APPROVED FK:** profiles → app_users CASCADE; preferences → user_profiles CASCADE tanpa FK langsung duplikat ke akun; acknowledgement → app_users RESTRICT. FK preferensi mencegah orphan preferences, tetapi tidak memaksa row preferensi untuk setiap profil: pembuatan keduanya wajib atomik di backend.
- **APPROVED deletion boundary:** PENDING_DELETION adalah status logis; ON DELETE hanya berlaku pada DELETE fisik. Workflow harus menyelesaikan acknowledgement secara eksplisit sebelum app_users dihapus. Jika bukti wajib dipertahankan setelah penghapusan akun, review arsitektur retensi dahulu; jangan menyimpan data pribadi tanpa dasar hukum. Retensi/withdrawal/backups tetap OPEN; CASCADE bukan pengganti workflow lintas Firebase/PostgreSQL/perangkat.
- **READY struktural M03-01B:** FK/default telah disetujui; `0001_identity.sql` siap ditulis dan diuji pada database disposable setelah review pemilik. Ini bukan bukti SQL sudah dibuat/lulus atau onboarding operasional. Initial weight/goal, transport completion, review klinis/legal serta Firebase/Fastify tetap OPEN untuk fitur nyata. Jangan membuat profil produksi dengan parameter belum disetujui atau target/berat palsu untuk mengatasi urutan migration.
- Privilege app role atas tabel baru harus diuji; jangan menganggap default privileges provisioning sudah terbukti untuk DDL baru. Role aplikasi tidak mendapat DDL atau akses metadata `nutrasa_migrations`. Ownership pengguna tetap ditegakkan backend walaupun FK valid.

### DEFAULT identity final (APPROVED)

| Tabel | DEFAULT teknis | Tanpa DEFAULT / nullability |
|---|---|---|
| `app_users` | `id = gen_random_uuid()`; `created_at`, `updated_at = now()` pada INSERT | `firebase_uid`, `account_status` NN tanpa default; status diisi backend berotorisasi. `email_display`, `email_verified_cache` nullable, tanpa nilai pengganti untuk unknown. |
| `user_profiles` | `profile_revision = 1` dengan CHECK > 0; `created_at`, `updated_at = now()` pada INSERT | `user_id`, `date_of_birth`, `height_cm`, `calculation_parameter`, `activity_level`, `goal_type`, `onboarding_completed_at` NN tanpa default. Target berat nullable kecuali cutting/bulking; body_type_visual nullable; keduanya tanpa default nilai. Tidak ada onboarding_status. |
| `user_preferences` | `updated_at = now()` pada INSERT | `user_id`, `language_code`, `time_zone`, `preferred_weight_unit` NN tanpa default; unit hanya kg/lb. |
| `privacy_acknowledgements` | `id = gen_random_uuid()`; `acknowledged_at = now()` | `user_id`, `notice_version`, `ack_type` NN tanpa default; seluruh kolom tabel NN. |

`onboarding_completed_at` wajib diberikan backend sebagai waktu completion tepercaya. DEFAULT acknowledgement adalah waktu pencatatan server, bukan bukti waktu tepat pengguna berinteraksi di perangkat. DEFAULT `updated_at` hanya saat INSERT; backend nanti wajib memperbaruinya eksplisit saat UPDATE, tanpa asumsi trigger otomatis. Tidak ada fungsi/trigger atau index duplikat baru yang disetujui oleh matriks ini.

## Kontrak food_sources M03-01

**APPROVED — pemilik proyek, task FOOD_SOURCES CONTRACT ALIGNMENT.** Kontrak dokumentasi untuk PostgreSQL 18, melengkapi ringkasan empat kolom pada matriks fisik sebelumnya dengan delapan kolom yang sudah ada di [schema logis §3.2](database-schema.md#32-katalog-nusantara-dan-provenance). Persetujuan lanjutan mengizinkan penulisan `0002_food_sources.sql`, lalu approval FOOD_SOURCES POSTGRESQL INTEGRATION mengizinkan satu kali eksekusi pada target disposable khusus. Hasil aktual pemilik proyek: **13/13 PASS, exit code 0**, termasuk constraint, rollback batch, preservasi identity dan DOWN/UP; [bukti dan kondisi akhir](../../backend/tests/integration/README.md#food-sources-m03-01). Kontrak delapan kolom di bawah tidak berubah. Hasil tidak menyatakan migration diterapkan pada database dev/test utama atau katalog siap publikasi.

| Kolom | Tipe / nullability | DEFAULT | Makna dan constraint |
|---|---|---|---|
| `id` | `uuid NOT NULL`, PRIMARY KEY | `pg_catalog.gen_random_uuid()` | Identitas registry sumber; mengikuti konvensi UUID existing tanpa extension tambahan. |
| `name` | `text NOT NULL` | Tidak ada | Nama sumber/provider/publikasi; harus mengandung karakter selain whitespace. |
| `source_type` | `text NOT NULL` | Tidak ada | Keterangan jenis sumber; tidak blank. Tidak ada enum atau controlled vocabulary yang disetujui. |
| `edition` | `text NULL` | Tidak ada | Edisi/versi sumber bila diketahui; NULL berarti tidak tersedia. Jika terisi tidak boleh blank. |
| `reference` | `text NOT NULL` | Tidak ada | Referensi sumber yang dapat ditelusuri; tidak blank. Referensi bibliografis diperbolehkan; tidak ada CHECK URL-only. |
| `license_status` | `text NOT NULL` | Tidak ada | CHECK hanya `UNVERIFIED`, `ALLOWED`, `RESTRICTED`, `DENIED`; status harus diberikan eksplisit. Tidak memakai tipe enum PostgreSQL baru. |
| `permission_notes` | `text NULL` | Tidak ada | Catatan izin/pembatasan/atribusi dan rujukan bukti bila tersedia; jika terisi tidak boleh blank. NULL bukan bukti izin. |
| `accessed_at` | `timestamptz NULL` | Tidak ada | Waktu akses sumber bila diketahui, bukan waktu INSERT otomatis; hanya timestamp finite. |

- **CHECK teks:** gunakan konvensi existing `kolom ~ '[^[:space:]]'` untuk `name`, `source_type`, `reference`. Pada `edition` dan `permission_notes`, NULL diizinkan; bila terisi wajib memenuhi kondisi nonblank yang sama. String kosong, spasi saja, tab/newline saja ditolak; constraint ini tidak melakukan trim atau mengubah isi yang sah.
- **CHECK waktu:** `accessed_at IS NULL OR pg_catalog.isfinite(accessed_at)`; NULL diizinkan, `infinity` dan `-infinity` ditolak. Tidak ada default `now()` atau waktu akses buatan.
- **Batas struktur:** tepat delapan kolom tersebut; selain indeks implisit PRIMARY KEY, tidak ada indeks tambahan, UNIQUE nama/referensi, FK, trigger, tabel atau kolom baru yang disetujui. Relasi sumber dengan revisi makanan dan audit ditetapkan pada kontrak terkait, bukan ditebak dari registry ini.
- **Batas D05/legal:** `license_status = ALLOWED` tidak membuktikan hak pakai dengan sendirinya. Bukti sah per sumber serta kewajiban atribusi/penyimpanan/redistribusi tetap wajib diverifikasi sebelum import/publikasi. CHECK hanya membatasi nilai status, bukan memverifikasi legalitas, menyeleksi sumber, atau mengizinkan nutrisi dipublikasikan.
- **OPEN terpisah:** vocabulary sumber bila kelak diperlukan, provenance per nilai/revisi dan source food code, struktur `catalog_reviews` / `catalog_import_batches`, editorial authorization serta review publikasi dan hak data. [Food Database Specification](Food-Database-spec.md) tetap memuat proposal tersebut; persetujuan registry ini tidak mengesahkan seluruh proposal atau sumber tertentu.

## Kontrak katalog struktural M03-01

**APPROVED — pemilik proyek, task FOOD CATALOG STRUCTURAL CONTRACT.** Kontrak PostgreSQL 18 untuk tepat tiga tabel di bawah, melengkapi [schema logis §3.2](database-schema.md#32-katalog-nusantara-dan-provenance). Riwayat proposal pada matriks ringkas sebelumnya mencantumkan partial published index dan kemungkinan deferred pointer; keputusan final memakai indeks minimum dan FK langsung seperti di bawah. Approval lanjutan mengizinkan penulisan `0003_food_catalog.sql`, lalu HBA/provisioning satu target disposable dan satu kali integration suite. Hasil terminal pemilik proyek pada 17 Oktober 2026: **18/18 PASS, 0 fail/skip, exit code 0**, termasuk rollback batch, constraint dan DOWN/UP/re-run; [bukti dan kondisi akhir](../../backend/tests/integration/README.md#food-catalog-m03-01). Matriks final tidak berubah. Registry delapan kolom food_sources dan migration 0001/0002 tetap utuh; hasil bukan bukti penerapan pada database dev/test utama atau kesiapan publikasi. **M03-01 belum DONE.**

NN = NOT NULL. "Tidak ada" berarti tanpa klausa DEFAULT; pada kolom nullable nilai yang tidak diberikan tetap NULL. Selain default teknis yang tercantum, seluruh nilai NN wajib diberikan eksplisit.

| Tabel / kolom | Tipe / nullability | DEFAULT | Makna dan constraint |
|---|---|---|---|
| `foods.id` | `uuid NN` | `pg_catalog.gen_random_uuid()` | PRIMARY KEY identitas makanan. |
| `foods.canonical_name` | `text NN` | Tidak ada | Nama tampilan; tidak blank, tidak UNIQUE. |
| `foods.normalized_name` | `text NN` | Tidak ada | Nama pencarian tidak blank; tidak UNIQUE atau generated; algoritme normalisasi OPEN. |
| `foods.food_type` | `text NN` | Tidak ada | Jenis makanan tidak blank; vocabulary operasional OPEN, tanpa enum buatan. |
| `foods.region` | `text NULL` | Tidak ada | Daerah bila diketahui; jika terisi tidak blank. |
| `foods.publication_status` | `text NN` | Tidak ada | CHECK tepat DRAFT, IN_REVIEW, APPROVED, PUBLISHED, ARCHIVED; antrean penerbitan dan visibilitas makanan. |
| `foods.current_published_revision_id` | `uuid NULL` | Tidak ada | Pointer revisi makanan itu sendiri; wajib terisi jika publication_status = PUBLISHED. |
| `foods.created_at` | `timestamptz NN` | `pg_catalog.now()` | CHECK finite; waktu pencatatan server. |
| `foods.updated_at` | `timestamptz NN` | `pg_catalog.now()` | CHECK finite; default hanya INSERT, pembaruan eksplisit backend nanti. |
| `food_revisions.id` | `uuid NN` | `pg_catalog.gen_random_uuid()` | PRIMARY KEY versi komposisi. |
| `food_revisions.food_id` | `uuid NN` | Tidak ada | FK ke foods.id. |
| `food_revisions.revision_number` | `integer NN` | Tidak ada | CHECK > 0; UNIQUE per makanan, tanpa default nomor. |
| `food_revisions.source_id` | `uuid NN` | Tidak ada | FK ke food_sources.id; satu sumber utama untuk seluruh komposisi revisi. |
| `food_revisions.basis_quantity` | `numeric(14,5) NN` | Tidak ada | Positif dan finite; tidak otomatis 100. |
| `food_revisions.basis_unit` | `text NN` | Tidak ada | CHECK tepat g atau ml. |
| `food_revisions.composition_definition` | `text NN` | Tidak ada | Tidak blank; menjelaskan komposisi/kondisi/bagian yang direpresentasikan. |
| `food_revisions.source_method` | `text NN` | Tidak ada | Metode tidak blank, berbeda dari jenis registry sumber; vocabulary operasional OPEN. |
| `food_revisions.quality_status` | `text NN` | Tidak ada | CHECK tepat DRAFT, REVIEWED, PUBLISHED; tahap review/penerbitan revisi. |
| `food_revisions.published_at` | `timestamptz NULL` | Tidak ada | CHECK finite jika terisi; terisi tepat ketika quality_status = PUBLISHED. |
| `food_revision_nutrients.food_revision_id` | `uuid NN` | Tidak ada | FK ke food_revisions.id; bagian PRIMARY KEY. |
| `food_revision_nutrients.nutrient_code` | `text NN` | Tidak ada | Salah satu 11 kode kanonis; bagian PRIMARY KEY. |
| `food_revision_nutrients.value` | `numeric(14,5) NULL` | Tidak ada | Unknown tetap NULL; nilai diketahui finite dan >= 0, nol sah. |

### CHECK dan relasi final

- **Teks:** canonical_name, normalized_name, food_type, composition_definition dan source_method memakai `kolom ~ '[^[:space:]]'`; region memakai `region IS NULL OR region ~ '[^[:space:]]'`. Tidak melakukan trim atau mengubah isi yang sah; tidak ada UNIQUE global nama, enum food_type/source_method atau fallback bisnis.
- **Numerik:** CHECK basis_quantity memakai `basis_quantity > 0 AND basis_quantity NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`; CHECK value memakai `value IS NULL OR (value >= 0 AND value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))`. PostgreSQL membandingkan NaN lebih tinggi dari angka biasa, sehingga > 0 atau >= 0 saja tidak cukup. NUMERIC(14,5) juga menolak infinity pada tingkat tipe; pengujian membedakan penolakan tipe dari CHECK. Ini batas representasi teknis, bukan ambang klinis. Backend wajib menolak input presisi berlebih sebelum coercion PostgreSQL; CHECK setelah coercion tidak memulihkan presisi asli.
- **Kode nutrisi:** energy_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, sugar_g, saturated_fat_g, trans_fat_g, cholesterol_mg, sodium_mg, potassium_mg. Unit mengikuti [kamus kanonis §2](database-schema.md#2-tipe-satuan-dan-presisi); tidak ada kolom unit tambahan atau total_sugar_g aktif.
- **Waktu:** created_at dan updated_at memakai CHECK `pg_catalog.isfinite(kolom)`; published_at memakai `published_at IS NULL OR pg_catalog.isfinite(published_at)`. Tidak ada trigger otomatis untuk updated_at atau default published_at.
- **Hubungan lokal:** CHECK `publication_status <> 'PUBLISHED' OR current_published_revision_id IS NOT NULL`; CHECK `(quality_status = 'PUBLISHED') = (published_at IS NOT NULL)`. DRAFT/REVIEWED harus memiliki published_at NULL; label status bukan bukti review atau izin sumber.
- **PK/UNIQUE:** foods PK(id), food_revisions PK(id), UNIQUE(food_id,revision_number), UNIQUE(food_id,id); food_revision_nutrients PK(food_revision_id,nutrient_code). UNIQUE pendukung (food_id,id) non-deferrable diperlukan sebagai target FK gabungan walaupun id sudah unik secara logis.
- **Empat FK:** food_revisions.food_id -> foods.id; food_revisions.source_id -> food_sources.id; food_revision_nutrients.food_revision_id -> food_revisions.id; (foods.id,current_published_revision_id) -> food_revisions(food_id,id). Seluruhnya ON DELETE RESTRICT, ON UPDATE RESTRICT, NOT DEFERRABLE. Pointer memakai MATCH SIMPLE agar id makanan terisi dengan pointer NULL tetap sah; tidak memakai MATCH FULL. FK pointer membuktikan kepemilikan makanan, belum membuktikan quality_status target PUBLISHED.
- **Indeks minimum:** enam indeks pada tiga tabel baru: tiga indeks PK, dua indeks UNIQUE revisi, satu B-tree foods(normalized_name). Tidak ada indeks tambahan untuk pointer/source_id, partial published, DESC duplikat, atau trigram. Kebutuhan optimasi berikutnya harus berdasarkan query/profiling; B-tree bukan jaminan pencarian substring. Indeks existing food_sources tidak diubah.

### Lifecycle struktural dan batas publikasi

- Status makanan mengatur visibilitas/antrean penerbitan; status revisi mengatur versi komposisi. Backend nanti memberi DRAFT eksplisit pada awal pencatatan. Revisi baru mendapat nomor baru per makanan dengan serialisasi transaksi, bukan MAX + 1 tanpa pengamanan; draft baru tidak otomatis mengganti pointer versi aktif. Persetujuan vocabulary bukan implementasi state machine editorial lengkap.
- Draft dapat memiliki 0-11 baris nutrisi. Aturan sebelum publikasi: tepat 11 kode, empat inti diketahui dan ditinjau, tujuh lainnya boleh NULL. PK/CHECK hanya membatasi baris yang ada, tidak memaksa jumlah 11 atau membuktikan review. API publik tetap proyeksi foods + revisi terpilih + 11 nilai decimal-string/null, bukan komposisi duplikat di foods.
- Revisi PUBLISHED harus immutable pada komposisi, porsi dan identitas sumber; perubahan membutuhkan revisi baru. published_at dipertahankan dan revisi tidak dikembalikan ke DRAFT untuk membuka edit. Pengarsipan makanan menghentikan visibilitas tanpa menghapus versi historis. Ini invariant yang disetujui, **enforcement masih OPEN**: RESTRICT tidak melarang perubahan/hapus langsung pada baris nutrisi atau menjamin append-only.
- Traceability struktural minimum food_sources -> food_revisions -> food_revision_nutrients. Satu source_id wajib berlaku untuk seluruh komposisi revisi; tidak ada dukungan provenance campuran per nutrien atau rantai derivasi bahan/yield yang diklaim. Source record locator dan riwayat bukti izin belum direpresentasikan sebagai kontrak terstruktur.
- **Publikasi/import tetap diblokir:** enforcement immutable, target pointer PUBLISHED, kelengkapan/review 11 nutrien, bukti hak sumber/atribusi, editorial authorization dan runtime privileges tetap OPEN. food_sources.license_status = ALLOWED tetap membutuhkan bukti sah per sumber sesuai D05, bukan legal clearance dari CHECK. Vocabulary food_type/source_method, normalisasi nama, catalog_reviews dan catalog_import_batches tetap OPEN; tidak ditambah kolom spekulatif.
- Tidak ada trigger/stored procedure yang disetujui. Runner existing menolak token BEGIN/END termasuk dalam komentar/literal; enforcement berikutnya memerlukan review kompatibilitas terpisah. Struktur kosong tidak memberi izin endpoint publikasi, seed/import, data nyata atau klaim kesiapan editorial produksi.
- **UP yang disetujui secara desain:** foods tanpa FK pointer -> food_revisions dengan UNIQUE pendukung -> food_revision_nutrients -> ADD FK pointer setelah kedua tabel ada. Constraint diperiksa langsung; INSERT kelak dapat membuat foods dengan pointer NULL, lalu revisi/nutrisi, validasi dan pemasangan pointer secara transaksional.
- **DOWN disetujui dan teruji:** DROP FK pointer eksplisit -> DROP food_revision_nutrients -> DROP food_revisions -> DROP foods, tanpa CASCADE. Tidak menyentuh identity, food_sources, schema atau metadata engine secara langsung; preservasi OID, owner, definisi dan data kedua domain terdahulu lulus pada suite disposable. Dependensi dari migration lebih baru harus dilepas melalui DOWN terbalik, bukan dihapus paksa. Eksekusi berikutnya memerlukan approval baru; [status implementasi dan tests](sql-migration-plan.md#katalog-struktural-m03-01).

## Migration dependency order (planning only)

1. Manual prerequisites: schema/role provisioning dan ledger bootstrap terpisah, bukan domain migration 0001; tidak ada dummy foundation migration.
2. First domain file yang disetujui: `backend/migrations/0001_identity.sql` untuk app_users, profiles, preferences, privacy acknowledgements; belum dibuat/dijalankan pada M03-01A.
3. Catalog base: food_sources sudah diuji (13/13 PASS); foods, food_revisions dan food_revision_nutrients telah diimplementasikan pada 0003 dan diuji (18/18 PASS). FK pointer ditambahkan setelah kedua tabel ada dalam migration yang sama, tanpa deferral. Categories, servings, aliases, joins serta audit editorial tetap memerlukan kontrak terperinci; tidak ada izin migration lain dan urutan milestone M03-01/M03-02/M03-03 tidak berubah.
4. Simple custom foods & revisions and food favorites are MVP; recent derives from logs and copying logs uses new IDs/snapshots. User recipes/revisions/ingredients post-MVP (O-18 final); separate saved-meal scope is unchanged.
5. Food logs, journal states, weights, versioned nutrition goals.
6. Sync operation ledger, change feed/cursors, deletion workflow.
7. Pointer katalog memakai kontrak gabungan langsung pada langkah 3. Pointer domain lain, enforcement publikasi, trigger dan indeks tambahan memerlukan keputusan terkait; tidak otomatis termasuk approval struktural katalog. Load reviewed seed data hanya setelah izin sumber, review kualitas dan approval terpisah.
8. Migration smoke-test clean install + forward upgrade + constraints + rollback strategy in disposable local DB.

## Implementation traps / unresolved (must close before executable migration)

1. **Commit-ordered cursor:** use the transactional per-user `user_sync_heads` row lock through commit, with feed/receipt/domain atomic. Rollback also rolls back the counter. Pull uses a stable watermark and last-delivered cursor; ordinary identity/bigserial/phone timestamps are not the canonical mechanism. Concurrency tests remain OPEN; see [sync-protocol-final-design.md](sync-protocol-final-design.md).
2. **Typed foreign keys:** `source_kind + source_revision_id` cannot be enforced by a single FK. Prefer separate nullable typed FKs with exactly-one CHECK in physical DDL or validated triggers; owner checks still enforced in Fastify.
3. **Goal non-overlap:** use serialized user-scoped transaction plus exclusion constraint if acceptable; confirm timezone boundaries in integration tests.
4. **Deletion vs receipt history:** define retention of sync/idempotency receipts and account deletion evidence; cannot promise complete retention or immediate deletion of audit artifacts without policy.
5. **Nutrition**: engine values and eligible profile conditions need professional review; never seed unsupported or asserted medically validated target values.
6. **Source rights**: each imported source must be approved for storage and redistribution.
