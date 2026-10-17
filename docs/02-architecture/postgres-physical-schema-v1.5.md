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
| `food_revisions` | Baseline 0003 sepuluh kolom; dua kolom provenance nullable disetujui pada [kontrak lanjutan](#kontrak-katalog-lanjutan-m03-01), diterapkan/diuji pada target disposable (suite gabungan 24/24 PASS, exit 0) | PK; UNIQUE(food_id,revision_number), UNIQUE(food_id,id); FK food/source RESTRICT; CHECK basis, teks dan status/waktu; CHECK pasangan provenance teruji pada 0005 |
| `food_revision_nutrients` | Tiga kolom pada kontrak katalog struktural; value numeric(14,5) NULL | PK(food_revision_id,nutrient_code), FK revisi RESTRICT; CHECK 11 kode, nonnegatif dan finite; enforcement publikasi OPEN |
| `serving_definitions` | Sepuluh kolom pada [kontrak lanjutan](#kontrak-katalog-lanjutan-m03-01); unit diturunkan dari revisi, reviewed boolean | FK revision/source RESTRICT; CHECK positive/finite/nonblank/sort; index(food_revision_id,sort_order); diuji pada disposable: suite gabungan 24/24 PASS, exit 0 |
| `categories` | Enam kolom pada kontrak lanjutan | PK, UNIQUE(slug), FK parent; self-parent ditolak CHECK, siklus lintas baris OPEN; diuji pada disposable: suite gabungan 24/24 PASS, exit 0 |
| `food_categories` | Tiga kolom pada kontrak lanjutan | PK(food_id,category_id); partial UNIQUE(food_id) WHERE is_primary; index(category_id,food_id); diuji pada disposable: suite gabungan 24/24 PASS, exit 0 |
| `food_aliases` | Lima kolom pada kontrak lanjutan, termasuk locale nullable | PK, UNIQUE(food_id,normalized_alias), B-tree normalized_alias; tanpa trigram; diuji pada disposable: suite gabungan 24/24 PASS, exit 0 |
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
- **OPEN terpisah pada approval registry:** vocabulary sumber, provenance per nilai/revisi dan source food code, struktur `catalog_reviews` / `catalog_import_batches`, editorial authorization serta review publikasi dan hak data. Approval dokumentasi berikutnya menetapkan locator/snapshot revisi dan porsi pada [kontrak lanjutan](#kontrak-katalog-lanjutan-m03-01), SQL telah diuji pada target disposable melalui suite gabungan 24/24 PASS, exit 0; provenance campuran per nutrien dan implementasi audit tetap OPEN. Kontrak fisik audit kini APPROVED pada [governance](#kontrak-governance-katalog-m03-01), tanpa mengesahkan keputusan legal/editorial. [Food Database Specification](Food-Database-spec.md) tetap memuat proposal lainnya; persetujuan registry ini tidak mengesahkan seluruh proposal atau sumber tertentu.

## Kontrak katalog struktural M03-01

**APPROVED — pemilik proyek, task FOOD CATALOG STRUCTURAL CONTRACT.** Kontrak PostgreSQL 18 untuk tepat tiga tabel di bawah, melengkapi [schema logis §3.2](database-schema.md#32-katalog-nusantara-dan-provenance). Riwayat proposal pada matriks ringkas sebelumnya mencantumkan partial published index dan kemungkinan deferred pointer; keputusan final memakai indeks minimum dan FK langsung seperti di bawah. Approval lanjutan mengizinkan penulisan `0003_food_catalog.sql`, lalu HBA/provisioning satu target disposable dan satu kali integration suite. Hasil terminal pemilik proyek pada 17 Oktober 2026: **18/18 PASS, 0 fail/skip, exit code 0**, termasuk rollback batch, constraint dan DOWN/UP/re-run; [bukti dan kondisi akhir](../../backend/tests/integration/README.md#food-catalog-m03-01). Matriks final tidak berubah. Registry delapan kolom food_sources dan migration 0001/0002 tetap utuh; hasil bukan bukti penerapan pada database dev/test utama atau kesiapan publikasi. **M03-01 belum DONE.**

NN = NOT NULL. "Tidak ada" berarti tanpa klausa DEFAULT; pada kolom nullable nilai yang tidak diberikan tetap NULL. Selain default teknis yang tercantum, seluruh nilai NN wajib diberikan eksplisit.

Matriks berikut mempertahankan baseline 0003 (9/10/3 kolom) yang telah diuji. Dua kolom provenance lanjutan dirinci terpisah dan hanya boleh ditambahkan melalui migration baru setelah approval implementasi; tidak mengedit file historis 0003.

| Tabel / kolom | Tipe / nullability | DEFAULT | Makna dan constraint |
|---|---|---|---|
| `foods.id` | `uuid NN` | `pg_catalog.gen_random_uuid()` | PRIMARY KEY identitas makanan. |
| `foods.canonical_name` | `text NN` | Tidak ada | Nama tampilan; tidak blank, tidak UNIQUE. |
| `foods.normalized_name` | `text NN` | Tidak ada | Nama pencarian tidak blank; tidak UNIQUE atau generated; algoritme konseptual disetujui pada kontrak lanjutan, implementasi belum ada. |
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
- Traceability struktural minimum food_sources -> food_revisions -> food_revision_nutrients. Satu source_id wajib berlaku untuk seluruh komposisi revisi; tidak ada dukungan provenance campuran per nutrien atau rantai derivasi bahan/yield yang diklaim. Baseline 0003 belum menyimpan source record locator; desain tambahannya kini disetujui pada kontrak lanjutan. Riwayat bukti izin tetap OPEN.
- **Publikasi/import tetap diblokir:** enforcement immutable, target pointer PUBLISHED, kelengkapan/review 11 nutrien, bukti hak sumber/atribusi, identitas reviewer/editorial authorization dan runtime privileges tetap OPEN. food_sources.license_status = ALLOWED tetap membutuhkan bukti sah per sumber sesuai D05, bukan legal clearance dari CHECK. Vocabulary food_type/source_method tetap OPEN; kontrak catalog_reviews/catalog_import_batches kini APPROVED pada governance, implementasi dan pengujiannya tetap OPEN. Normalisasi konseptual disetujui di bawah, belum diimplementasikan; tidak ada perubahan data atau aktivasi editorial.
- Pada approval struktural 0003 belum ada trigger/stored procedure yang disetujui. Desain restricted functions kini APPROVED untuk dokumentasi pada [kontrak governance](#kontrak-governance-katalog-m03-01); implementasi belum diizinkan. Runner existing masih menolak token BEGIN/END termasuk dalam komentar/literal; rencana kompatibilitas harus diverifikasi sebelum coding DDL fungsi. Struktur kosong tidak memberi izin endpoint publikasi, seed/import, data nyata atau klaim kesiapan editorial produksi.
- **UP yang disetujui secara desain:** foods tanpa FK pointer -> food_revisions dengan UNIQUE pendukung -> food_revision_nutrients -> ADD FK pointer setelah kedua tabel ada. Constraint diperiksa langsung; INSERT kelak dapat membuat foods dengan pointer NULL, lalu revisi/nutrisi, validasi dan pemasangan pointer secara transaksional.
- **DOWN disetujui dan teruji:** DROP FK pointer eksplisit -> DROP food_revision_nutrients -> DROP food_revisions -> DROP foods, tanpa CASCADE. Tidak menyentuh identity, food_sources, schema atau metadata engine secara langsung; preservasi OID, owner, definisi dan data kedua domain terdahulu lulus pada suite disposable. Dependensi dari migration lebih baru harus dilepas melalui DOWN terbalik, bukan dihapus paksa. Eksekusi berikutnya memerlukan approval baru; [status implementasi dan tests](sql-migration-plan.md#katalog-struktural-m03-01).

## Kontrak katalog lanjutan M03-01

**APPROVED — pemilik proyek, REMAINING CATALOG STRUCTURAL CONTRACT ALIGNMENT, sesudah checkpoint `7bd2dd1`.** Kontrak PostgreSQL 18 untuk empat tabel baru (6/3/5/10 kolom) dan dua kolom nullable tambahan pada food_revisions. Ini menggantikan ringkasan lama porsi dengan base_unit tersimpan/review_status dan opsi trigram alias. Approval lanjutan FOOD TAXONOMY & SERVINGS/PROVENANCE MIGRATIONS mengizinkan penulisan 0004/0005 serta persiapan tests; SQL kini diterapkan/diuji pada target disposable melalui [suite gabungan 24/24 PASS, exit 0](../../backend/tests/integration/README.md#katalog-lanjutan-m03-01). Migration 0001/0002/0003 tetap utuh dan matriks berikut tidak berubah. Rujukan logis [§3.2](database-schema.md#32-katalog-nusantara-dan-provenance); urutan dan approval pengujian berikutnya pada [migration plan](sql-migration-plan.md#katalog-lanjutan-m03-01). **M03-01 belum DONE.**

### Aturan bersama katalog lanjutan

- NN = NOT NULL; setiap kolom di bawah tanpa DEFAULT kecuali id UUID yang tercantum. Khusus paket lanjutan ini tidak ada default boolean, sort_order, timestamp, review, metode atau bukti sumber; default historis 0001-0003 tetap utuh.
- CHECK teks memakai pola existing `kolom ~ '[^[:space:]]'`; nullable memakai `kolom IS NULL OR kolom ~ '[^[:space:]]'`. Empty/whitespace-only ditolak, isi sah tidak di-trim. CHECK tidak membuktikan normalisasi, review atau kebenaran bukti.
- Enam FK baru di bawah semuanya ON DELETE RESTRICT, ON UPDATE RESTRICT, NOT DEFERRABLE. FK sumber komposisi existing tetap dipakai, tidak diduplikasi. Tidak ada CASCADE, trigger, stored procedure, enum atau extension baru.
- PK/UNIQUE menyediakan indeks implisit; hanya indeks tambahan yang disebutkan disetujui. Tidak ada UNIQUE global nama/alias/label, indeks trigram, indeks source_id tambahan, atau UNIQUE locator sumber.

### categories (enam kolom)

| Kolom | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `id` | `uuid NN` | `pg_catalog.gen_random_uuid()` | PRIMARY KEY kategori. |
| `parent_id` | `uuid NULL` | Tidak ada | FK ke categories.id; NULL untuk akar; CHECK `parent_id IS NULL OR parent_id <> id`. |
| `slug` | `text NN` | Tidak ada | Nonblank, UNIQUE; tidak mengarang vocabulary kategori atau algoritme slug. |
| `name` | `text NN` | Tidak ada | Nonblank; nama tampilan asli, tanpa UNIQUE global. |
| `sort_order` | `integer NN` | Tidak ada | CHECK >= 0; urutan diberikan eksplisit. |
| `is_active` | `boolean NN` | Tidak ada | Nilai wajib eksplisit; bukan status publikasi makanan. |

Indeks hanya PK(id) dan UNIQUE(slug). FK/self-parent CHECK **tidak mencegah siklus lintas baris**. Pemeriksaan leluhur dan serialisasi perubahan hierarki masih OPEN untuk implementasi; endpoint modifikasi hierarki tidak boleh diaktifkan sebelum mekanismenya disetujui. Daftar/kuota kategori tidak ditetapkan oleh kontrak ini.

### food_categories (tiga kolom)

| Kolom | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `food_id` | `uuid NN` | Tidak ada | FK ke foods.id; bagian PRIMARY KEY. |
| `category_id` | `uuid NN` | Tidak ada | FK ke categories.id; bagian PRIMARY KEY. |
| `is_primary` | `boolean NN` | Tidak ada | Wajib eksplisit; paling banyak satu kategori utama per makanan. |

PRIMARY KEY(food_id,category_id), partial UNIQUE index(food_id) WHERE is_primary, dan B-tree(category_id,food_id) untuk filter makanan berdasarkan kategori. Partial UNIQUE tidak mewajibkan setiap makanan mempunyai kategori utama. Klasifikasi melekat pada identitas makanan, bukan salinan komposisi atau kepemilikan akun.

### food_aliases (lima kolom)

| Kolom | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `id` | `uuid NN` | `pg_catalog.gen_random_uuid()` | PRIMARY KEY alias. |
| `food_id` | `uuid NN` | Tidak ada | FK ke foods.id. |
| `alias` | `text NN` | Tidak ada | Nonblank; teks asli untuk nama daerah/sinonim/variasi yang benar-benar tersedia. |
| `normalized_alias` | `text NN` | Tidak ada | Nonblank; hasil normalisasi backend kelak, bukan generated column. |
| `locale` | `text NULL` | Tidak ada | Nonblank jika terisi; tidak ada vocabulary locale baru. |

UNIQUE(food_id,normalized_alias) berlaku tanpa memasukkan locale; satu alias ternormalisasi tidak digandakan per locale untuk makanan sama. Alias sama boleh dimiliki makanan berbeda, tidak boleh otomatis menggabungkan identitasnya. Selain PK/UQ, satu B-tree(normalized_alias) mendukung lookup lintas makanan; UNIQUE berawalan food_id tidak menggantikannya. Tidak mengklaim B-tree mendukung seluruh substring/fuzzy search.

### serving_definitions (sepuluh kolom)

| Kolom | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `id` | `uuid NN` | `pg_catalog.gen_random_uuid()` | PRIMARY KEY porsi; label bukan identifier. |
| `food_revision_id` | `uuid NN` | Tidak ada | FK ke food_revisions.id; porsi selalu terkait revisi tertentu. |
| `label` | `text NN` | Tidak ada | Nonblank; menjelaskan ukuran/bagian yang dimaksud, tanpa UNIQUE buatan. |
| `base_quantity` | `numeric(14,5) NN` | Tidak ada | Positif dan finite, menolak NaN; kuantitas satu porsi dalam basis_unit revisi terkait. |
| `method` | `text NN` | Tidak ada | Nonblank; metode pengukuran yang sebenarnya, tanpa enum operasional buatan. |
| `reviewed` | `boolean NN` | Tidak ada | Nilai eksplisit sesuai DTO OpenAPI; bukan bukti identitas/otorisasi reviewer. |
| `sort_order` | `integer NN` | Tidak ada | CHECK >= 0. |
| `source_id` | `uuid NN` | Tidak ada | FK ke food_sources.id untuk bukti porsi; boleh berbeda dari sumber utama komposisi. |
| `source_record_reference` | `text NN` | Tidak ada | Nonblank; kode/halaman/tabel/record pengukuran yang benar-benar dirujuk, bukan URL-only. |
| `source_reference_snapshot` | `text NN` | Tidak ada | Nonblank; salinan referensi bibliografis bukti porsi, termasuk edisi bila diketahui; bukan bukti izin legal. |

- CHECK kuantitas: `base_quantity > 0 AND base_quantity NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)`, mengikuti pola 0003. Infinity/overflow dapat ditolak tipe NUMERIC sebelum CHECK; backend kelak menolak presisi input berlebih sebelum coercion. Tidak menyimpan nilai nutrisi baru atau mengubah NULL menjadi nol.
- Indeks hanya PK(id) dan B-tree(food_revision_id,sort_order); indeks berawalan revisi juga melayani lookup FK/per-revisi tanpa indeks revision-only duplikat.
- **Tidak ada kolom base_unit:** unit g/ml diturunkan dari food_revisions.basis_unit. DTO [ServingDefinition](openapi.yaml) tetap memiliki id, label, base_quantity decimal string, base_unit hasil JOIN, dan reviewed boolean. Rancangan review_status digantikan reviewed; tidak mengarang vocabulary review baru atau mengubah bentuk API.
- Konversi harus spesifik makanan/revisi dan berbukti. Tidak ada konversi global ukuran rumah tangga, asumsi g = ml, atau faktor density/yield baru. Porsi dengan sumber pengukuran berbeda tidak mengubah aturan satu sumber utama komposisi dan tidak berarti provenance campuran per nutrien sudah didukung.
- Porsi terbit termasuk invariant immutable revisi: perubahan memerlukan revisi baru, enforcement tetap OPEN. Tanpa konversi sah, API/food logging kelak hanya menawarkan basis g/ml yang didukung. Edit log historis memakai revisi/konversi asal dan snapshot, bukan porsi versi terbaru; referensi porsi pada input log masih perlu kontrak sebelum implementasi M03-02/M07.

### Tambahan provenance pada food_revisions (dua kolom)

| Kolom tambahan | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `source_record_reference` | `text NULL` | Tidak ada | Nonblank jika terisi; locator kode/halaman/tabel/record komposisi dari source_id utama yang sudah ada. |
| `source_reference_snapshot` | `text NULL` | Tidak ada | Nonblank jika terisi; salinan referensi bibliografis nyata pada revisi, mempertahankan referensi saat registry sumber berubah. |

CHECK pasangan: `(source_record_reference IS NULL) = (source_reference_snapshot IS NULL)`. Keduanya boleh NULL pada draft, atau keduanya terisi dan nonblank; tidak ada backfill/bukti buatan. CHECK pasangan tidak mewajibkan keduanya terisi ketika quality_status = PUBLISHED. Kelengkapan provenance tetap syarat sebelum publikasi; enforcement gate publikasi tetap OPEN. Paket 0005 tidak menambah source_id, PK/FK/UQ/indeks atau tabel provenance baru; relasi batch pada approval governance berikutnya dirinci terpisah. Setelah 0005 UP pada target disposable yang diuji, food_revisions mempunyai 12 kolom; baseline SQL 0003 tetap sepuluh kolom dan tidak diedit. Dua kolom bukan histori izin lengkap atau pengganti catalog_reviews/import_batches.

### Normalisasi, API dan batas aktivasi katalog lanjutan

- **Algoritme konseptual APPROVED:** Unicode NFC -> trim/collapse whitespace -> lowercase -> NFC. Satu implementasi reusable backend kelak digunakan untuk canonical_name -> foods.normalized_name, alias -> food_aliases.normalized_alias, dan query pencarian. Nama tampilan asli, diakritik, tanda baca dan kata pembeda olahan dipertahankan. Tidak membuat implementasi atau mengubah data pada task dokumentasi; CHECK nonblank tidak menjamin normalisasi. Tidak ada normalizer/slug vocabulary tambahan.
- [OpenAPI](openapi.yaml) Category tetap id/name/slug/parent_id; kolom internal sort_order/is_active tidak otomatis menambah DTO. ServingDefinition tetap lima field public existing; bukti sumber tidak otomatis menjadi field public baru. Tidak mengubah endpoint atau OpenAPI.
- **OPEN:** pencegahan siklus kategori lintas baris; immutable published revisions/nutrients/servings/provenance; pointer ke revisi PUBLISHED dan kelengkapan/review nutrisi; bukti legal penggunaan sumber/atribusi; identitas reviewer dan authorization; runtime privileges teruji; audit import lengkap; concurrency editorial. Status PUBLISHED, reviewed = true atau license_status = ALLOWED bukan bukti gate ini terpenuhi.
- Endpoint publikasi, import, editorial dan modifikasi hierarki tetap dilarang aktif sebelum mekanisme terkait disetujui. Tidak ada data kategori, nutrient value, seed, konversi atau sumber/izin baru. Pada approval 0004/0005 catalog_reviews/catalog_import_batches ditunda dari kedua migration tersebut; kontrak governance kini APPROVED, implementasi tetap pekerjaan M03-01 sebelum import/publikasi. Provenance campuran per nutrien belum didukung; crash recovery saat commit tetap OPEN. **M03-01 belum DONE.**

## Kontrak governance katalog M03-01

**APPROVED CONTRACT — pemilik proyek, GOVERNANCE CONTRACT DOCUMENTATION ALIGNMENT, sesudah checkpoint `75e43c7`.** Persetujuan ini memfinalisasi dokumentasi proposal governance, bukan izin coding, SQL, perubahan scanner, role/privilege atau PostgreSQL. Matriks ini adalah sumber kontrak fisik audit; [schema logis](database-schema.md#governance-katalog-m03-01), [batas keamanan](system-architecture.md#catalog-governance-m03-01) dan [rencana implementasi/tests](sql-migration-plan.md#governance-katalog-m03-01) merujuk ke sini. Migration 0001-0005 tetap immutable; hasil integration sebelumnya tidak membuktikan governance berikut sudah bekerja. **M03-01 belum DONE.**

**Status coding setelah approval berikutnya:** SQL struktur 0006_catalog_audit.sql telah diuji pada disposable PostgreSQL 18.6: [16/16 integration PASS, 0 fail/skip, exit 0](../../backend/tests/integration/README.md#catalog-audit-foundation-m03-01). Metadata 21/13/3 kolom, link revisi nullable, 9 FK, 37 CHECK dan 13 indeks sesuai kontrak; rollback serta empty/populated DOWN teruji. Scanner leksikal subset awal tersedia; functions/governance grants, actor verification dan canonical review digest belum diimplementasikan. [Scope aktual dan batas scanner](../../backend/README.md#catalog-audit-foundation-m03-01--postgresql-integration-pass). Struktur tidak dianggap menjamin append-only.

### Konvensi audit

- NN = NOT NULL. Semua kolom tanpa DEFAULT kecuali UUID, timestamp teknis dan identity yang disebut eksplisit. Teks NN nonblank; teks nullable harus nonblank jika terisi, mengikuti pola existing `[^[:space:]]`. Teks tidak di-trim diam-diam.
- Hash bertipe text: tepat 64 karakter hex lowercase, bukan char(64). Timestamp terisi harus finite; tidak menerima infinity. Tidak ada nilai bisnis fallback.
- Seluruh FK baru ON DELETE RESTRICT, ON UPDATE RESTRICT, NOT DEFERRABLE. Relasi lintas jenis/target yang tak dibuktikan FK harus diperiksa restricted entrypoint, bukan diklaim sebagai CHECK lintas tabel.
- Audit append-only untuk role operasional; UUID, event_number, aktor, waktu, keputusan, bukti dan link tidak diubah setelah transaksi selesai. Koreksi menambah event. Append-only bukan kebijakan retensi permanen; owner/legal retention dan penghapusan sah tetap OPEN.
- `event_number` merupakan urutan audit di bawah protokol satu transaction-level advisory lock editorial. Nilainya positif dan boleh bergap; bukan sync cursor/per-owner counter. Semua jalur penulisan audit, termasuk REJECTED setelah rollback, harus mengambil lock yang sama sebelum DML.
- Capability/role adalah desain; belum ada nama role baru, provisioning atau grant operasional yang disetujui.

### catalog_reviews (21 kolom)

| Kolom | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `id` | `uuid NN` | `pg_catalog.gen_random_uuid()` | PRIMARY KEY event keputusan. |
| `event_number` | `bigint NN` | GENERATED ALWAYS AS IDENTITY | UNIQUE, CHECK positif; bukan otoritas concurrency sendiri. |
| `review_kind` | `text NN` | Tidak ada | CHECK SOURCE_PERMISSION, NUTRITION, PUBLICATION, WITHDRAWAL. |
| `decision` | `text NN` | Tidak ada | CHECK ACCEPTED, REJECTED, REVOKED; kombinasi dibatasi di bawah. |
| `source_id` | `uuid NULL` | Tidak ada | FK food_sources.id; target SOURCE_PERMISSION saja. |
| `food_revision_id` | `uuid NULL` | Tidak ada | FK food_revisions.id; target ketiga jenis lainnya. |
| `actor_subject` | `text NN` | Tidak ada | Subject minimum dari konteks autentikasi yang disetujui; bukan parameter bebas. |
| `recorded_at` | `timestamptz NN` | `pg_catalog.clock_timestamp()` | Finite; dicatat entrypoint, tidak menerima waktu otoritatif caller. |
| `reason` | `text NN` | Tidak ada | Alasan aman tanpa token, credential atau payload pribadi/sumber terlarang. |
| `evidence_reference` | `text NULL` | Tidak ada | Locator bukti nonblank; wajib untuk SOURCE_PERMISSION dan NUTRITION. |
| `evidence_sha256` | `text NULL` | Tidak ada | Hash artefak bukti jika tersedia dan boleh diproses; bukan bukti izin legal. |
| `canonical_version` | `smallint NN` | Tidak ada | Awalnya CHECK = 1; perubahan format memerlukan revisi kontrak. |
| `content_digest` | `text NN` | Tidak ada | SHA-256 representasi konten/snapshot yang diperiksa. |
| `approval_review_id` | `uuid NULL` | Tidak ada | Self-FK catalog_reviews.id; link keputusan sebelumnya untuk PUBLICATION/WITHDRAWAL. |
| `source_snapshot` | `jsonb NULL` | Tidak ada | Object snapshot metadata sumber, wajib untuk SOURCE_PERMISSION. |
| `license_status` | `text NULL` | Tidak ada | CHECK UNVERIFIED, ALLOWED, RESTRICTED, DENIED; wajib hanya untuk SOURCE_PERMISSION. |
| `permission_scope` | `jsonb NULL` | Tidak ada | Object berisi tepat store, redistribute, offline_cache, masing-masing JSON boolean; bukan string atau JSON null. |
| `attribution_required` | `boolean NULL` | Tidak ada | Wajib eksplisit pada keputusan sumber ACCEPTED. |
| `attribution_text` | `text NULL` | Tidak ada | Wajib nonblank bila attribution_required=true. |
| `valid_from` | `timestamptz NULL` | Tidak ada | Finite; wajib untuk keputusan sumber ACCEPTED. |
| `valid_until` | `timestamptz NULL` | Tidak ada | Finite jika terisi, valid_from harus terisi dan valid_until > valid_from. |

CHECK lokal dan batas fungsi:

- SOURCE_PERMISSION mewajibkan source_id terisi dan food_revision_id NULL; NUTRITION/PUBLICATION/WITHDRAWAL mewajibkan kebalikannya. Tepat satu target melalui FK nyata, bukan UUID polimorfik.
- PUBLICATION hanya ACCEPTED; WITHDRAWAL hanya REVOKED. SOURCE_PERMISSION/NUTRITION memakai vocabulary decision di atas; efektivitas keputusan sumber tetap memerlukan ALLOWED dan semua gate, bukan label decision saja.
- SOURCE_PERMISSION mewajibkan source_snapshot object, license_status dan evidence_reference terisi. Saat ACCEPTED, license_status harus ALLOWED dan permission_scope, attribution_required serta valid_from wajib terisi. Penolakan/pencabutan tidak perlu mengarang scope atau tanggal izin yang tak diketahui; scope jika terisi tetap memenuhi bentuk object tersebut.
- source_snapshot, license_status, permission_scope, attribution_required, attribution_text, valid_from dan valid_until wajib SQL NULL untuk jenis non-sumber. JSON null tidak menggantikan SQL NULL pada kolom yang wajib object.
- attribution_required=true mewajibkan attribution_text nonblank; NULL attribution_text tidak berarti tidak ada kewajiban atribusi. valid_until NULL tidak otomatis membuktikan izin permanen.
- NUTRITION mewajibkan evidence_reference; PUBLICATION/WITHDRAWAL wajib approval_review_id. SOURCE_PERMISSION/NUTRITION tidak memakai approval_review_id. Self-reference langsung ditolak CHECK; fungsi memastikan link menunjuk event lebih awal dan target sesuai, sehingga tidak membentuk siklus.
- PUBLICATION menunjuk keputusan NUTRITION/ACCEPTED pada revisi yang sama; WITHDRAWAL menunjuk event PUBLICATION yang ditarik. Tipe/decision/target hubungan ini adalah validasi fungsi yang harus diuji.
- CHECK kondisional wajib menolak field wajib yang NULL secara eksplisit, bukan bergantung pada ekspresi UNKNOWN yang dianggap lolos CHECK.
- Snapshot sumber mempertahankan metadata bibliografis yang benar-benar diperiksa dan diizinkan disimpan. Struktur canonical dijelaskan di bawah; tidak memasukkan dokumen lisensi penuh atau payload nutrisi mentah secara otomatis.

Indeks minimum: PK(id); UNIQUE(event_number); UNIQUE(id,source_id) sebagai target FK gabungan; B-tree(source_id,event_number); B-tree(food_revision_id,review_kind,event_number); B-tree(approval_review_id). Tidak ada UNIQUE digest: keputusan berbeda atas konten identik tetap tercatat. Pemilihan keputusan efektif menggunakan event terbaru yang relevan di bawah lock, tidak mencari approval lama sambil mengabaikan REJECTED/REVOKED terbaru.

### catalog_review_sources (tiga kolom)

| Kolom | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `review_id` | `uuid NN` | Tidak ada | FK catalog_reviews.id, untuk review NUTRITION. |
| `source_id` | `uuid NN` | Tidak ada | FK food_sources.id. |
| `permission_review_id` | `uuid NN` | Tidak ada | FK gabungan bersama source_id ke catalog_reviews(id,source_id). |

PRIMARY KEY(review_id,source_id); indeks tambahan B-tree(permission_review_id,source_id). FK gabungan memastikan event izin berasal dari sumber yang sama; fungsi memastikan review_id NUTRITION dan permission_review_id SOURCE_PERMISSION yang efektif. Kumpulan sumber harus tepat sumber komposisi ditambah semua sumber servings, tanpa sumber hilang atau tambahan yang tidak diperiksa. Review dan link ditulis atomik lalu append-only. Sumber porsi yang berbeda tetap didukung tanpa mengklaim provenance campuran per nutrien.

### catalog_import_batches (13 kolom)

| Kolom | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `id` | `uuid NN` | `pg_catalog.gen_random_uuid()` | PRIMARY KEY satu hasil terminal percobaan impor. |
| `source_id` | `uuid NN` | Tidak ada | FK food_sources.id; satu sumber komposisi utama per batch. |
| `permission_review_id` | `uuid NN` | Tidak ada | FK gabungan bersama source_id ke catalog_reviews(id,source_id). |
| `artifact_reference` | `text NN` | Tidak ada | Locator aman; bukan payload atau URL berkredensial. |
| `artifact_sha256` | `text NN` | Tidak ada | SHA-256 byte artefak input asli yang sah untuk diproses. |
| `parser_version` | `text NN` | Tidak ada | Versi parser yang sebenarnya. |
| `mapping_version` | `text NN` | Tidak ada | Versi pemetaan identitas, field/unit dan konversi. |
| `actor_subject` | `text NN` | Tidak ada | Operator terverifikasi. |
| `recorded_at` | `timestamptz NN` | `pg_catalog.clock_timestamp()` | Finite; waktu server entrypoint. |
| `outcome` | `text NN` | Tidak ada | CHECK IMPORTED atau REJECTED; tidak ada status RUNNING mutable. |
| `accepted_revision_count` | `integer NN` | Tidak ada | CHECK >= 0; REJECTED mewajibkan 0. |
| `rejected_record_count` | `integer NN` | Tidak ada | CHECK >= 0; tidak mengarang jumlah bila parser belum mengidentifikasi record. |
| `result_reference` | `text NN` | Tidak ada | Ringkasan/locator laporan validasi aman; bukan seluruh baris sumber. |

Indeks minimum: PK(id); UNIQUE(id,source_id) untuk FK revisi; B-tree(permission_review_id,source_id); B-tree(source_id,artifact_sha256) nonunique. Tidak ada UNIQUE global artefak: input yang semula ditolak boleh memiliki percobaan baru setelah prasyarat dibenahi. Ini bukan izin retry otomatis atau deduplikasi makanan berdasarkan nama.

Entrypoint memeriksa jenis/target/efektivitas permission_review_id, hak memproses artefak dan kecocokan count dengan revisi hasil batch. Batch IMPORTED dan revisinya commit bersama. Bila transaksi impor gagal, rollback membatalkan batch/domain terkait; pencatatan hasil REJECTED berasal dari transaksi baru setelah rollback, memegang lock editorial yang sama dan memverifikasi kembali izin. Jangan mengklaim audit bertahan dalam transaksi gagal. Bila pencatatan kegagalan juga tidak dapat diotorisasi, laporkan kegagalan tanpa bukti sukses palsu.

### Tambahan import_batch_id pada food_revisions

| Kolom tambahan | Tipe / nullability | DEFAULT | Constraint dan makna |
|---|---|---|---|
| `import_batch_id` | `uuid NULL` | Tidak ada | FK gabungan (import_batch_id,source_id) -> catalog_import_batches(id,source_id), MATCH SIMPLE. |

Indeks B-tree(import_batch_id,source_id). NULL mempertahankan revisi manual/historis; tidak ada backfill batch buatan. source_id existing tetap NOT NULL dan FK sumber tetap utuh. Saat import_batch_id terisi, sumber revisi harus sama dengan sumber batch. Fungsi hanya menghubungkan revisi ke batch IMPORTED dan tidak mengubah asal revisi terbit. Setelah migration ini kelak diterapkan, revisi menjadi 13 kolom; **keadaan teruji 0005 tetap 12 kolom**, tidak ada migration baru saat dokumentasi ini.

### Digest konten dan canonicalization v1

**APPROVED DESIGN; helper SQL dan enam fixed vectors teruji PostgreSQL 18.6, enforcement operasional OPEN.** Database PostgreSQL 18 adalah satu otoritas serializer dan digest review; backend tidak membuat implementasi hashing konten kedua dan tidak mengotorisasi digest kiriman caller.

- Representasi berupa JSONB berskema tetap dengan penanda canonical_version=1 serta jenis payload SOURCE_PERMISSION atau REVISION_CONTENT. Byte yang di-hash adalah UTF-8 dari representasi jsonb::text PostgreSQL 18, tanpa pretty-print. Ini kontrak internal berversi, bukan klaim RFC 8785, urutan key JSON client atau portabilitas lintas versi database.
- Payload SOURCE_PERMISSION memuat source_snapshot, license_status, permission_scope, attribution_required, attribution_text, valid_from, valid_until, evidence_reference dan evidence_sha256. source_snapshot memuat metadata registry yang diperiksa (id, name, source_type, edition, reference, license_status, permission_notes, accessed_at), hanya sejauh sah disimpan; tidak menyalin artefak sumber penuh. Bukti yang tidak boleh disimpan tetap melalui locator aman dan keputusan legal, bukan diisi data buatan.
- Payload REVISION_CONTENT memuat id/food_id/revision_number, basis_quantity/basis_unit, composition_definition/source_method, source_id, source_record_reference/source_reference_snapshot dan import_batch_id bila ada. Nutrients adalah daftar kode/nilai menurut urutan 11 kode pada [schema logis §2](database-schema.md#2-tipe-satuan-dan-presisi); draft boleh kurang lengkap dan harus dibedakan dari baris bernilai NULL. Servings memuat sepuluh kolom bermakna sesuai matriks, diurutkan UUID deterministik, bukan urutan query kebetulan.
- Payload revisi juga memuat daftar sumber terurut UUID: source_id, permission_review_id dan content_digest event izin yang telah ada. Isi daftar sesuai catalog_review_sources. ID keputusan sumber yang sudah ada boleh digunakan; **id/event_number dari review yang sedang dibuat dan review_id penghubung tidak boleh masuk payload**, sehingga tidak ada dependensi melingkar.
- Untuk PUBLICATION gunakan representasi revisi yang sama dengan NUTRITION yang dirujuk; approval_review_id adalah link audit, bukan input yang mengubah digest revisi. WITHDRAWAL mempertahankan referensi publikasi/bukti historis yang ditarik, tidak menulis ulang digest keputusan lama.
- Semua key yang didefinisikan format hadir; NULL eksplisit, bukan dihilangkan atau diganti nol. Decimal berupa string skala lima, tidak melalui float/Number. UUID lowercase; boolean tetap boolean. Timestamp konten UTC dengan presisi mikrodetik yang ditetapkan. Array memiliki urutan eksplisit; object mengikuti representasi JSONB PostgreSQL 18.
- Teks mengikuti nilai tersimpan; tidak di-trim/NFC diam-diam ketika hashing. Normalizer pencarian tetap satu implementasi backend NFC -> trim/collapse whitespace -> lowercase -> NFC, bukan serializer kedua.
- quality_status, published_at, created_at/updated_at, actor_subject, reason, recorded_at, event_number dan ID review baru tidak menjadi bagian payload revisi. Status review/publikasi dan metadata waktu tidak boleh membuat siklus invalidasi saat review/publikasi sendiri. Identitas/nama tampilan foods berada di workflow identitas terpisah; komposisi tetap revision-bound.
- Review menghitung digest di bawah lock atas konten yang benar-benar diperiksa. Operator membawa expected digest/versi untuk mendeteksi perubahan sejak pembacaan; nilai caller bukan otoritas. Perubahan draft atau keputusan izin efektif membuat keputusan lama tidak lagi cukup untuk gate, walaupun audit lama tetap tersedia.
- PostgreSQL 18 menyediakan sha256(bytea); encode hex menghasilkan format hash di atas tanpa pgcrypto. Golden vectors harus mengunci hasil untuk NULL/nol, decimal, Unicode, urutan input, timestamp/timezone dan sumber porsi berbeda. Upgrade yang mengubah representasi memerlukan versi kontrak baru dan review kompatibilitas.
- Hash membuktikan kesamaan representasi, bukan akurasi nutrisi, identitas manusia, kebenaran dokumen atau legalitas hak sumber.

### Implementasi digest v1 internal setelah approval coding

SQL `0007_catalog_digest.sql` telah diuji pada target disposable yang disetujui: [15/15 integration PASS, 0 fail/skip, exit 0](../../backend/tests/integration/README.md#catalog-digest-v1-m03-01), termasuk enam fixed vectors, helper ACL, rollback, DOWN/UP/re-run dan final state PASS. Tidak mengubah 0001-0006. Tidak ada role/grant operasional, SECURITY DEFINER, writer, autentikasi aktor atau aktivasi publikasi. Helper SECURITY INVOKER dimiliki migrator; EXECUTE PUBLIC dicabut dalam transaksi migration yang sama.

| Helper | Input dan output | Batas |
|---|---|---|
| `catalog_source_permission_payload_v1` | source_id UUID; license_status; scope JSONB; attribution boolean/text; valid_from/valid_until timestamptz; evidence_reference/hash -> JSONB | Snapshot diambil dari food_sources saat pemanggilan, bukan merekonstruksi metadata historis yang sudah berubah. Tidak mencatat event atau memutuskan hak sumber. |
| `catalog_revision_payload_v1` | revision_id UUID dan permission_review_ids UUID[] -> JSONB | Tepat satu event SOURCE_PERMISSION per sumber komposisi/porsi; menolak sumber hilang/tambahan, ID hilang/NULL/duplikat. Pemilihan event efektif/berwenang tetap tugas entrypoint mendatang. |
| `catalog_payload_digest_v1` | Envelope JSONB version 1/kind SOURCE_PERMISSION atau REVISION_CONTENT -> hex SHA-256 | Helper hashing tidak membuktikan payload berasal dari pembacaan otoritatif. Writer mendatang wajib membentuk payload sendiri di bawah lock; tidak mempercayai payload/hash caller. |

Format SOURCE_PERMISSION mempunyai key root canonical_version, payload_kind, source_snapshot, license_status, permission_scope, attribution_required, attribution_text, valid_from, valid_until, evidence_reference, evidence_sha256. Snapshot mempunyai tepat delapan field registry yang telah disetujui. Format REVISION_CONTENT mempunyai root canonical_version, payload_kind, revision, nutrients, servings, sources. revision memuat sebelas field konten yang disebut kontrak; nutrients memakai objek nutrient_code/value untuk baris yang benar-benar ada, bukan sebelas baris buatan. servings memuat sepuluh kolom existing, sources memuat source_id/permission_review_id/content_digest. Array sumber dan porsi diurut UUID, nutrients mengikuti urutan sebelas kode kanonis.

Timestamp memakai UTC `YYYY-MM-DDTHH24:MI:SS.USZ` (enam digit mikrodetik); semua key nullable tetap hadir. Decimal selalu string lima angka desimal. Teks tersimpan tidak di-trim/NFC. SQL NULL input/target tidak ditemukan/daftar sumber tidak lengkap menghasilkan SQL NULL, bukan digest fallback; entrypoint mendatang wajib menolaknya. Kesalahan tipe PostgreSQL tetap error. Tidak ada parameter kosong yang diubah menjadi izin legal atau nutrisi nol.

STABLE digunakan pada dua pembaca tabel; hash JSONB murni IMMUTABLE. Perhitungan revisi memakai satu statement/snapshot. Tidak memperoleh lock editorial atau menilai expiry/revocation, clinical review atau publication gate. Event REJECTED sintetis boleh direpresentasikan; hal itu bukan izin publikasi. Future writer harus mengulang validasi state setelah lock dan tidak memakai helper sebagai authorization.

Verifikasi non-database batch: focused scanner 11/11 dan full backend unit tests 76/76 PASS; backend/mobile typecheck/lint PASS. Pada tahap coding sebelumnya belum ada PostgreSQL yang dijalankan; sesudah approval database, satu suite integration telah PASS 15/15 pada PostgreSQL 18.6. Enam frozen golden vectors terverifikasi: permission dengan NULL, permission Unicode/mikrodetik, revisi NULL, missing nutrient, nutrient nol, serta dua sumber/porsi. Byte/hash dipatok; tidak ada serializer backend kedua. Hash byte fixture diuji tanpa database; kecocokan dengan JSONB PostgreSQL 18.6 kini juga terbukti melalui integration test satu kali pada target fresh yang disetujui. Serializer lintas major version tetap memerlukan review.

### Efektivitas keputusan dan batas aktivasi governance

Gate memakai keputusan relevan terbaru menurut event_number di bawah lock; audit REJECTED/REVOKED tidak boleh dilewati dengan memilih ACCEPTED lama. Izin harus cocok dengan sumber/scope penggunaan, bukti, valid_from, valid_until dan kondisi distribusi. Rentang berlaku dimulai pada valid_from dan berakhir sebelum valid_until bila ada; NULL expiry tidak menggantikan bukti hak yang sah. Pemeriksaan saat publikasi tidak menjamin izin berlaku selamanya: distribusi/read/cache harus mengevaluasi kondisi izin terkini dan tidak otomatis menghidupkan kembali distribusi setelah pencabutan.

State machine, matriks role dan publication transaction dijelaskan pada [system architecture](system-architecture.md#catalog-governance-m03-01). Tidak ada grant, entrypoint atau API baru yang sudah diimplementasikan. Struktur ini tidak menjamin immutability atau append-only tanpa enforcement yang diuji.

**OPEN owner/legal/clinical:** pihak berwenang, self-review, jumlah reviewer wajib, kualifikasi nutrisi, binding Firebase/Fastify hingga SQL (pilihan local/Firebase historis sudah superseded), bukti/scope/atribusi per sumber, expiry/revocation/retention dan privasi reviewer. Hak menyimpan locator/hash pun mengikuti kebijakan yang sah; tidak otomatis menyimpan dokumen mentah, token atau data pribadi reviewer. Kebijakan histori saat izin dicabut tetap membutuhkan keputusan legal; tidak ada janji penghapusan otomatis atau retensi tanpa batas. **DEFERRED:** implementasi sampai approval coding, provisioning/tests sampai approval database, aktivasi sampai gate owner/legal/clinical ditutup. Restricted functions disetujui sebagai desain, tetapi tidak ada fungsi SQL/trigger yang dibuat atau diizinkan untuk dieksekusi; nama file migration baru belum ditetapkan.

## Capability persistence foundation M03-01 (PROPOSED)

**CANDIDATE SQL PREPARED, NOT APPLIED OR OPERATIONAL.** Owner menyetujui penulisan struktur 10/4 kolom dan scope nonblank tanpa vocabulary tetap. backend/migrations/0008_catalog_capabilities.sql serta unit/static dan integration suite disiapkan; belum dijalankan pada PostgreSQL. Kontrak identity 0001 tetap utuh. Tidak ada fungsi administrative, runtime lookup PostgreSQL atau grant baru. Matriks ini satu sumber proposal fisik; [trust/transaction boundary](system-architecture.md#capability-persistence-contract---desain-belum-ddl) dan [test plan](sql-migration-plan.md#capability-persistence-foundation-test-plan) melengkapinya.

### Binding dan state minimum

app_users.id dipakai sebagai subject internal; firebase_uid existing sudah NOT NULL, UNIQUE dan COLLATE C. Lookup exact dari verified UID, tidak trim/lowercase atau mencocokkan email. Tidak perlu tabel principal/editor tambahan atau user_profiles untuk binding editorial. Subject missing/PENDING_DELETION/DELETED ditolak; ACTIVE hanya prasyarat, bukan capability. Satu deployment terikat satu project Firebase yang disetujui; perpindahan project memerlukan review binding terpisah. Jangan mengubah 0001 untuk menambah project atau status editor secara spekulatif.

Rekomendasi dua tabel: catalog_capability_events menyimpan transisi immutable; catalog_capability_assignments hanya menunjuk event efektif per key. State GRANT/REVOKE dibaca dari event, sehingga tidak ada boolean revoked atau timestamp duplikat yang dapat bertentangan. Event lama tetap ada ketika assignment dicabut/diberikan kembali. Tidak memakai catalog_reviews sebagai histori hak dan tidak menambah role hierarchy, tabel role atau SQL enum.

### catalog_capability_events (sepuluh kolom, PROPOSED)

| Kolom | Tipe / nullability | Default | Constraint / arti |
|---|---|---|---|
| id | uuid NOT NULL | pg_catalog.gen_random_uuid() | PK; identitas event. |
| event_number | bigint NOT NULL | GENERATED ALWAYS AS IDENTITY | UNIQUE dan > 0; urutan diagnostik, boleh gap, bukan pengganti lock atau cursor sync. |
| subject_id | uuid NOT NULL | Tidak ada | FK app_users(id), subjek penerima/perubahan hak. |
| capability | text COLLATE C NOT NULL | Tidak ada | Nonblank; kode exact server. Vocabulary operasional tetap OPEN; CHECK nonblank tidak memberi hak atau menerima capability tak dikenal pada evaluator. |
| scope | text COLLATE C NOT NULL | Tidak ada | APPROVED scope adjustment: CHECK nonblank; tanpa enum, hierarchy atau normalisasi. Vocabulary tetap OPEN; unknown scope wajib ditolak authorization. |
| action | text NOT NULL | Tidak ada | PROPOSED CHECK GRANT/REVOKE; transisi teknis, bukan role bisnis. |
| actor_subject_id | uuid NOT NULL | Tidak ada | FK app_users(id), actor authenticated yang telah diotorisasi proses administrative. Tidak boleh NULL, UID input bebas atau akun SYSTEM buatan. |
| reason | text NOT NULL | Tidak ada | Nonblank; alasan tanpa credential/token/dokumen sensitif. |
| request_id | text NOT NULL | Tidak ada | Nonblank; correlation server, bukan bukti actor atau idempotency key. Tidak UNIQUE karena satu request dapat mempunyai beberapa event. |
| recorded_at | timestamptz NOT NULL | pg_catalog.clock_timestamp() | Finite; waktu pencatatan server, bukan waktu keputusan dari client. |

Nonblank memakai konvensi existing ~ '[^[:space:]]'; tidak mengubah teks valid secara diam-diam. Semua FK ON DELETE RESTRICT, ON UPDATE RESTRICT, NOT DEFERRABLE. Tambahkan UNIQUE(subject_id,capability,scope,id) hanya sebagai target FK gabungan projection. Tiga indeks B-tree pendukung saja: PK(id), UNIQUE(event_number), UNIQUE(subject_id,capability,scope,id). Prefix indeks terakhir melayani lookup riwayat satu assignment dan referensi subject; tidak menambah indeks speculative. FK actor belum membutuhkan indeks terpisah untuk foundation kecil; evaluasi dengan query plan sebelum aktivasi/beban audit meningkat.

### catalog_capability_assignments (empat kolom, PROPOSED)

| Kolom | Tipe / nullability | Default | Constraint / arti |
|---|---|---|---|
| subject_id | uuid NOT NULL | Tidak ada | Bagian PK; subject sama dengan event efektif. |
| capability | text COLLATE C NOT NULL | Tidak ada | Bagian PK; nonblank dan exact code. |
| scope | text COLLATE C NOT NULL | Tidak ada | Bagian PK; APPROVED scope adjustment: CHECK nonblank, tanpa fixed vocabulary atau normalisasi. |
| last_event_id | uuid NOT NULL | Tidak ada | Pointer ke event efektif, bukan cache izin terpisah. |

PK(subject_id,capability,scope). Satu FK gabungan (subject_id,capability,scope,last_event_id) menuju catalog_capability_events(subject_id,capability,scope,id), RESTRICT UPDATE/DELETE dan NOT DEFERRABLE. Tidak menambah FK subject duplikat karena relasi melalui event sudah memastikan subject valid. Hanya indeks PK; tidak perlu indeks last_event_id tersendiri sebelum ada consumer/query yang membutuhkannya. Parent event key sudah indexed. Histori event untuk key sama tidak dapat dipindahkan ke subject/capability/scope lain tanpa melanggar FK, tetapi FK tidak membuktikan pointer menunjuk event terbaru.

### Transisi, lifecycle dan batas enforcement

- PROPOSED: GRANT awal membuat event dan projection; GRANT pada state aktif ditolak sebagai duplicate tanpa event baru. REVOKE memerlukan assignment aktif; missing/already-revoked ditolak sebagai no-op, bukan bukti pencabutan baru. Regrant sesudah REVOKE membuat event baru dan memindahkan pointer. Retry sesudah hasil commit tidak diketahui harus membaca state/audit, bukan otomatis mengulang grant. Request ID tidak diklaim sebagai protokol idempotensi.
- Satu transaksi mengunci katalog, membaca ulang authority/subject/state, INSERT event dan INSERT/UPDATE pointer. Event+projection wajib commit/rollback bersama. Rekomendasi memakai lock katalog dua-int (1314214994,1) yang sudah PROPOSED agar grant/revoke, writer editorial dan perubahan status actor memakai urutan yang sama. Bukan lock migration. Semua state read setelah lock pada statement terpisah, READ COMMITTED; tidak mengambil row lock dahulu. Kebutuhan isolation level lain tetap OPEN/testing.
- Tidak ada writer sekarang. Pointer terbaru, actor sah, duplicate policy dan append-only tidak dijamin CHECK/FK saja. Future restricted entrypoint harus memvalidasi seluruhnya, termasuk larangan UPDATE/DELETE/TRUNCATE event oleh caller operasional. Migrator/superuser tetap batas administratif tepercaya.
- Proposed initial policy melarang self-approval/self-publication: subject pembuat perubahan tidak boleh menjadi approver/publisher perubahan itu. Empat fungsi konseptual draft, rights review, nutrition review dan publish tidak otomatis saling memberi hak. Ini PROPOSED policy, bukan keputusan owner final atau larangan seluruh orang memegang dua capability. Riwayat actor pembuat/reviewer yang cukup untuk membuktikan separation per konten masih perlu dirinci sebelum writer; dua kolom actor pada audit saja belum membuktikan seluruh provenance manusia.
- Account deletion: RESTRICT mempertahankan referensi subject/actor, sehingga physical DELETE terblokir sampai kebijakan legal retensi/anonymization disetujui. PENDING_DELETION/DELETED logis tetap dimungkinkan dan harus segera ditolak evaluator. Tidak mengklaim retensi tanpa batas atau pemulihan hak otomatis ketika Firebase diaktifkan kembali. Lifecycle disable/delete/re-enable membutuhkan keputusan dan workflow tersendiri; tidak mengubah status akun existing.
- UP berikutnya: events lalu assignments, default ACL/owner diperiksa agar tidak ada akses operasional; tidak ada assignment bootstrap/seed, function writer, trigger atau grant. DOWN: hanya jika kedua tabel kosong, drop assignments lalu events/sequence owned tanpa CASCADE; populated audit harus menolak DOWN atomik. Struktur/history/checksum mengikuti runner existing. Candidate bernomor 0008_catalog_capabilities.sql mengikuti discovery aktual; tidak mengubah 0001-0007.

**Owner gates sebelum coding/aktivasi bagian terkait:** authority/grantor nyata dan initial bootstrap, vocabulary/scope, separation of duties dan reviewer qualification, binding actor hingga restricted SQL, reactivation policy, retensi/deletion. Approval struktur kosong dan static tests dapat dipisah dari aktivasi, tetapi belum menyelesaikan gate tersebut. SQL kandidat hanya menerapkan struktur yang diizinkan; administrative trust boundary dan activation tetap OPEN. CHECK/FK tidak menolak duplicate GRANT events, inactive subject atau audit UPDATE oleh migrator. Writer harus menegakkan policy tersebut sebelum activation.

## Migration dependency order (planning only)

1. Manual prerequisites: schema/role provisioning dan ledger bootstrap terpisah, bukan domain migration 0001; tidak ada dummy foundation migration.
2. First domain file yang disetujui: `backend/migrations/0001_identity.sql` untuk app_users, profiles, preferences, privacy acknowledgements; belum dibuat/dijalankan pada M03-01A.
3. Catalog base: food_sources sudah diuji (13/13 PASS); foods, food_revisions dan food_revision_nutrients telah diimplementasikan pada 0003 dan diuji (18/18 PASS). FK pointer ditambahkan setelah kedua tabel ada dalam migration yang sama, tanpa deferral. Kontrak categories/food_categories/food_aliases dan servings/provenance disetujui di atas; [dua migration terpisah](sql-migration-plan.md#katalog-lanjutan-m03-01) sudah diuji pada satu target disposable: suite gabungan 24/24 PASS, exit 0; failure rollback, DOWN/UP/re-run dan preservasi baseline terverifikasi. Kontrak audit/governance kini APPROVED pada bagian governance; implementasi/pengujian dan keputusan owner/legal/clinical tetap OPEN. Urutan milestone M03-01/M03-02/M03-03 tidak berubah.
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
