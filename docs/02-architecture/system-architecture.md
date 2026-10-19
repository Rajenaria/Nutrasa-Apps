# NUTRASA — System Architecture & Database Decision

**Version:** 1.0-draft\
**Status:** Historical architecture analysis, updated with selected local-development stack; technical implementation remains draft\
**Platform:** React Native + Expo + TypeScript\
**Confirmed:** Firebase Authentication, Indonesian food catalog, offline-tolerant sync, personal nutrition diary.

**Selected stack, 2026-10-13:** Firebase Authentication + Fastify local + PostgreSQL local + Expo SQLite, with React Native/Expo/TypeScript and Expo Router. ADR-001 is authoritative. Managed database/Firestore comparisons below are historical alternatives and future context, not a request to reopen the chosen development stack. Hosting/scaling decisions remain open for a later phase.

## 1. Executive decision

- **Confirmed:** Firebase Authentication remains the single identity provider.
- **Selected:** PostgreSQL local as the server source of truth, Fastify local as backend API, and Expo SQLite for offline data.
- **Historical alternative, not selected:** Cloud Firestore. Retained below for comparison, not an approved replacement.
- **Still open:** future hosting/budget, Firebase SDK compatibility with Expo 57 and security/integration tests. Sync design is server-ordered LWW per final v1.6; SQLCipher protection is selected in Decision 08 but untested. Development service-cost target is Rp0.
- No production nutrition calculation policy is approved merely by selecting this architecture; clinical and legal reviews remain required.

## 2. Requirements / non-functional goals

1. Support 100 curated food items expanding to 500 and beyond with category/alias/region and provenance.
2. Support 11 nutrient fields; unknown values must be `null`, not `0`.
3. Support food-specific serving units and catalogue composition; user recipe/version functionality is post-MVP (O-18).
4. Snapshot logged nutrients so catalog changes do not rewrite users' histories.
5. Support date-aware day journals, nutrition targets, goal history, weight measurements, and trends.
6. Allow basic logging offline, with user-visible local/pending/synced states.
7. Keep food logs, health data and preferences isolated by authenticated user.
8. Avoid unnecessary infrastructure for the first 100–500 foods and early user base.

## 3. Firestore vs PostgreSQL

| Criteria | Cloud Firestore | PostgreSQL |
|---|---|---|
| Initial app setup | Fast with Firebase SDK, fewer services | Needs managed DB + API |
| Food catalog 100–500 | Good | Good |
| Recipes and ingredients | Nested/denormalized documents, extra reads for relationships | Normalized join tables, FK constraints |
| Multi-category foods & alias search | Possible, query/index planning; sophisticated full-text often needs other service | Joins, indexes, full-text/trigram search available |
| Daily journal | Good with per-user/date document modeling | Good with indexed records and aggregations |
| Historical analytics | Aggregates/materialized summaries required for some workloads | Flexible SQL window/aggregate queries |
| Offline | Native Firestore mobile SDK attractive; validate SDK/runtime behavior in Expo | Implement with SQLite + custom sync protocol |
| Cost | Operations + index reads + bandwidth + storage | Provider/compute/storage/bandwidth; often baseline monthly fee |
| Authorization | Firestore Security Rules | Backend verifies Firebase token, authorizes each request |
| Migration and reporting | Document exports/custom transformations | SQL tooling, migrations, well-established analytics |

**Historical rationale:** this comparison informed the PostgreSQL decision. PostgreSQL local is now selected; choosing another data source would require a separate owner-approved architecture change.

## 4. Proposed architecture

```text
Expo mobile app (Expo Router + feature modules)
  ├── Firebase Auth SDK (identity and session)
  ├── local SQLite database (catalog cache, food logs, sync outbox)
  ├── nutrition engine (pure versioned calculations, no made-up presets)
  ├── UI / state selectors (Home, Food, Progress, Profile)
  └── API client + sync coordinator
         │ HTTPS + Firebase ID token
         ▼
  Authenticated Backend API
  ├── Firebase Admin verifyIdToken + revocation/session policy
  ├── authorize user ownership for every operation
  ├── request schema and numeric validation
  ├── owner-scoped idempotency + server-ordered LWW
  ├── food publishing and curation admin boundary
  └── transactional persistence
         │
         ▼
  PostgreSQL local (managed hosting considered later)
  ├── identity mapping / user profiles / consents
  ├── catalog foods/categories/aliases/nutrients/sources/servings
  ├── recipes, ingredients, immutable versions (post-MVP user recipes)
  ├── food logs + nutrient snapshots
  ├── weight entries + goal versions
  └── sync bookkeeping and audit events
```

### Auth boundary
- Client obtains Firebase ID token after authentication and sends it as Bearer token over HTTPS.
- Backend verifies token signature, issuer, audience, expiration and required account state using Firebase Admin SDK; derive user UID from verified token only.
- On all user-specific writes/reads, derive owner identity from token; never trust owner UID supplied as a free-form client field.
- PostgreSQL credentials and Firebase Admin service-account secrets never ship to mobile app.
- Email verification is optional: authenticated eligible users retain onboarding, profile persistence, sync and main features. Sensitive actions follow Firebase controls/reauthentication (Decision 01).

### Local/offline boundary
- Local SQLite is for durable app data; secure credential storage uses platform-appropriate secure storage instead.
- SQLite is not automatically encrypted. Decision 08 selects SQLCipher protection; native development-build, key/backup and encryption tests remain OPEN.
- Outbox operations use the final v1.6 envelope: immutable operation identity/payload and persistent device sequence. Typed mutation DTOs and canonical hashing remain OPEN; follow [sync protocol](sync-protocol-final-design.md).
- Save record + outbox event in one local transaction. Render local state immediately.
- Sync when app is active and network is available. Authenticate, upload bounded batches, confirm IDs/revisions, then acknowledge local queue.
- Deduplicate retries with UNIQUE(owner_user_id, operation_id); retry identity/payload must match and return the stored receipt. Connectivity is not server persistence.
- Server-ordered LWW follows the last valid transactional server application; device time is not authority. Allocate change cursor through the locked per-owner transactional counter. HTTP 410 `CURSOR_EXPIRED` triggers rebootstrap while preserving outbox; account data stays isolated and private local data is cleaned on logout per Decision 08.
- Catalog updates must be versioned; logged nutrient snapshots immutable unless user explicitly edits that log.

## 5. Suggested data domains (NOT final SQL schema)

Historical conceptual names below are not physical table contracts. Current [database schema](database-schema.md), [database decisions v1.6](database-implementation-decisions-v1.6.md) and [sync protocol v1.6](sync-protocol-final-design.md) override old names; table/model presence does not establish MVP scope.

**Catalog (managed/admin-published):** foods, food_aliases, categories, food_categories, nutrient_values, food_sources, serving_units, food_servings, catalog_versions.

**User recipes (post-MVP conceptual model):** recipes, recipe_versions, recipe_ingredients, recipe_servings; ownership, source method and cooked yield require explicit future design.

**Users:** users (Firebase UID), user_profiles, onboarding_status, consent_records, nutrition_goal_versions, weight_measurements, preferences.

**Diary:** food_log_entries, log_nutrient_snapshots, day_statuses, favorites, saved_meals, meal_copy_operations.

**Offline:** sync_operations, device_state, entity_revisions; soft deletion/tombstones where needed to sync deletes safely.

**Curation:** candidate_food_imports, data_review_records and provenance; no API harvesting or copyrighted bulk imports without rights verification.

## 6. Business invariants

- Food nutritional reference basis and portion weight/volume must be explicit, with units.
- Unknown nutrient values remain null. Daily aggregation must carry known/partial status per nutrient.
- Every log stores a nutrient snapshot, source/version, serving and journal date/timezone context.
- Historical goal comparisons use the goal version effective on that day; auto recalculation must not retroactively rewrite days.
- All mutations are validated server-side; calculations requiring clinical signoff remain tagged experimental/disabled until approved.
- MVP accepts eligible adults 18+ with AUTO targets only; no MANUAL or LOG_ONLY active mode. Screening and clinical validation remain required.
- Data deletion, consent and retention require legal review before launch.

## 7. Implementation alternatives / decision table

The following alternatives are retained as historical analysis. Option B with local PostgreSQL/Fastify is selected for development; cloud hosting is deferred.

### Option A — Firestore + Firebase Auth
Simple service topology. Firestore's document-centric model and native SDK can support offline functionality, but Expo integration and actual persistence semantics need a tested choice of Firebase JS SDK vs React Native Firebase native SDK. Do not assume identical mobile offline behavior across SDKs. Query aggregation and relational search may need precomputed documents. Apply rules per user, test permissions in emulator; Security Rules are not query filters.

### Option B — PostgreSQL + Firebase Auth + API + SQLite (recommended)
Relational model, strong integrity, analytics and controlled food curation. Requires running API service, migration pipeline, backups, monitoring, and maintaining an offline sync algorithm. Hosting provider may be Supabase Postgres-only, Neon, Cloud SQL, or another managed PostgreSQL; shortlist based on regions, quotas, uptime, migration, backups, and cost. Do not enable a second auth system by accident.

### Option C — Mixed Firestore and PostgreSQL
Not recommended in MVP: duplicates user data sources and adds cross-store consistency complexity. Reconsider only when a specific use-case justifies it.

## 8. Cost plan

Historical cost examples below are not verified current quotes or development obligations. Selected development services run locally with a target service spend of Rp0; reassess provider terms when cloud deployment is explicitly requested.

Firestore free tier (Standard, subject to region and billing plan): 1 GiB stored, 50k reads/day, 20k writes/day, 20k deletes/day, 10 GiB network outbound/month. Beyond quota: reads/writes/deletes, indexed reads, storage and bandwidth are billed.

Postgres hosted options vary. Example Supabase Pro starts around USD $25 per month, but resource and egress usage may increase bill; free tier can pause and has limits. PostgreSQL does not charge per SQL row read in that model, but CPU, storage, memory and traffic are finite.

Estimate cost before deciding: daily active users; logs/user/day; screen opens/day; searchable food reads; average recipe ingredients; sync frequency; retained history; backups, expected region, and caching efficiency.

## 9. Security and privacy gate

- Protect authorization at backend for each user-owned resource.
- Firebase ID token verification required; do not trust arbitrary UID from request.
- Backups, incident response, rate limiting, abuse protection and audit logging for admin food changes.
- Encrypt transport; review protection at rest on device and server, secret management and access least privilege.
- Consent and privacy notices for body/health-related data; confirm retention and erase/export semantics under applicable regulations.
- Security tests: cross-user access, replay/retry, account switching, offline queue, revoked accounts, unverified email, deletion race.

### Catalog governance M03-01

**APPROVED DESIGN — pemilik proyek setelah checkpoint 75e43c7; enforcement operasional belum diimplementasikan/diuji.** Struktur audit 0006 dan digest read-only 0007 sudah integration PASS; hal itu tidak membuktikan authorization atau privilege operasional. [Kontrak fisik audit dan digest](postgres-physical-schema-v1.5.md#kontrak-governance-katalog-m03-01) serta [migration plan](sql-migration-plan.md#governance-katalog-m03-01) melengkapi batas curation di atas. APPROVED di sini bukan legal clearance, reviewer authorization, grant operasional atau izin publikasi. Keputusan owner/legal/clinical pada kontrak fisik tetap OPEN.

| Capability konseptual | Izin yang dirancang | Batas wajib |
|---|---|---|
| Application runtime | SELECT lewat proyeksi katalog publik yang aman | Tanpa DML/TRUNCATE katalog/audit, tanpa EXECUTE fungsi editorial dan tanpa akses metadata migrasi; DTO publik tidak membocorkan audit/actor/bukti privat. |
| Editorial operator | EXECUTE entrypoint draft, batch, categories/aliases yang diizinkan | Tanpa DML langsung; tidak otomatis menjadi reviewer/publisher. |
| Nutrition reviewer | EXECUTE pencatatan review nutrisi | Subject terverifikasi; tidak otomatis menentukan hak sumber. |
| Rights reviewer | EXECUTE pencatatan keputusan izin | Bukti/scope aktual, bukan label ALLOWED saja. |
| Publisher | EXECUTE publikasi/withdrawal | Hanya setelah gate; tidak otomatis boleh menyetujui nutrisi atau izin. |
| Function executor | NOLOGIN; privilege tabel minimum untuk fungsi | Tidak memiliki schema/tabel, DDL/CREATE, privilege global atau metadata migrasi; audit hanya SELECT/INSERT, bukan UPDATE/DELETE/TRUNCATE. |
| Migrator | Ownership dan DDL schema/tabel sesuai runner existing | Tidak dipakai runtime atau operator; migration credential tidak dibagikan. |
| Administrator | Provisioning/maintenance yang disetujui | Batas kepercayaan administratif, bukan jaminan immutable terhadap superuser. |

Nama login/role dan membership belum dipilih atau diprovisioning. Tidak ada keputusan bahwa self-review boleh/dilarang atau harus berapa orang; role/capability berbeda tidak membuktikan pemisahan manusia.

Ownership schema nutrasa/nutrasa_migrations dan tabel baru tetap migrator terkait agar cocok dengan pemeriksaan runner. Fungsi privileged dirancang dimiliki executor NOLOGIN terpisah. Prosedur pembentukan/ownership fungsi dan privilege/membership migrator perlu review/approval provisioning terpisah; jangan memberikan CREATE atau hak SET ROLE executor/migrator kepada caller operasional untuk memudahkan instalasi.

SECURITY DEFINER: fixed safe search_path (pg_catalog, pg_temp), seluruh referensi aplikasi schema-qualified nutrasa.*, tanpa dynamic SQL/DDL/role change dari input, tanpa akses metadata migrasi. REVOKE EXECUTE FROM PUBLIC dan GRANT EXECUTE sesuai signature/capability dalam transaksi pembuatan yang sama; helper internal tidak ikut terbuka. Batasi privilege tabel executor pada kebutuhan fungsi. Tidak ada default grant untuk semua fungsi/tabel masa depan kepada runtime.

**APPROVED editorial identity decision (2026-10-18): Firebase Authentication verified by Fastify.** Authentication dan authorization terpisah. Capability authoritative dikelola server-side dan deny-by-default; user biasa tidak mendapat hak editorial otomatis dan custom claims bukan otoritas tunggal. actor_subject/role/GUC client tidak dipercaya; session_user pool adalah service, bukan manusia. Login PostgreSQL individual adalah alternatif historis yang tidak dipilih. Persistence capability, binding service-to-actor, operator aktual, self-review, kualifikasi dan retensi tetap OPEN.

#### Transaction dan publication gate

Status implementasi terbaru: [technical preflight dan approved policy](catalog-lifecycle-publication-gates.md)
memisahkan helper 0010 (owner-reported fresh retest 17/17 PASS, exit 0; riwayat
fixture FAIL dipertahankan) dari enforcement writer yang belum dibuat. Policy
identity/lineage, reviewer independence, lifetime dan transitions kini APPROVED;
[physical actor/lineage delta](postgres-physical-schema-v1.5.md#review-identity-and-contributor-lineage---approved-physical-contract)
telah APPROVED untuk offline structural 0011; suite disiapkan, belum PostgreSQL.
Tidak ada penambahan privileged writer/GRANT. Bukti capability writer 0009 17/17 tidak mengesahkan publication,
clinical/legal review, complete author lineage atau runtime authoring authority.
Tidak ada trigger atau publication endpoint yang ditambahkan.

1. Semua entrypoint penulisan katalog/audit mengambil transaction-level governance advisory lock (1314214994,1) sebelum DML/row lock; lock migration bigint terpisah. Bila keduanya diperlukan, migration lock lebih dahulu, governance berikutnya. Fungsi penulisan VOLATILE, bukan SQL IMMUTABLE; tidak COMMIT/ROLLBACK sendiri. Caller tidak boleh menahan transaksi idle; timeout/konflik direview saat implementasi.
2. Di bawah lock, validasi capability, expected digest/versi dan baca ulang state. Untuk baseline READ COMMITTED, pembacaan validasi dilakukan setelah perolehan lock dalam langkah terpisah; jangan memakai snapshot state sebelum menunggu lock. Dukungan isolation level lain perlu bukti terpisah, bukan asumsi.
3. Publikasi memastikan revisi milik makanan yang sama dan belum pernah diterbitkan; tepat 11 kode kanonis, energy_kcal/protein_g/carbohydrate_g/fat_g diketahui dan ditinjau, tujuh tambahan boleh NULL; basis/numerik/teks valid tanpa nilai buatan.
4. Pilih latest nutrition decision tanpa fallback ACCEPTED lama. Baseline owner: minimal satu reviewer berwenang bukan kontributor revisi, publisher berbeda dari reviewer; kualifikasi dan uniknya manusia tetap gate nyata. Wajib typed identity, complete exact lineage/head dan digest sesuai konten. catalog_review_sources harus tepat mencakup sumber komposisi/serving dengan latest accepted permission, bukti, ketiga penggunaan, atribusi dan interval efektif. NULL expiry tanpa bukti menolak publikasi baru. Locator/snapshot lengkap; serving opsional yang ditawarkan wajib reviewed dengan bukti sah, jika tidak ada hanya basis g/ml didukung.
5. Dalam transaksi sama: catat PUBLICATION yang menunjuk review, atur quality_status/published_at, pasang pointer dan publication_status makanan. Pelanggaran gate atau kegagalan sesudah DML membatalkan seluruh domain dan audit transaksi; error tidak ditelan menjadi sukses.
6. Saat distribusi/read/cache, ulangi pemeriksaan visibilitas dan izin sesuai kondisi kini; gate publikasi bukan hak distribusi abadi. Penarikan memakai WITHDRAWAL yang merujuk publikasi lama dan menghentikan visibilitas tanpa membuka komposisi untuk edit. Dampak cache/histori/retensi saat hak dicabut tetap owner/legal gate.

event_number bukan pengganti lock. Semua writer, termasuk pencatatan izin, review, batch REJECTED, perubahan metadata sumber dan taxonomy harus mengikuti protokol yang sama. Role operasional tidak memiliki bypass DML; arbitrary SQL oleh migrator/superuser tetap batas kepercayaan administratif.

**Immutable published content:** jangan downgrade revisi PUBLISHED untuk membuka edit; tolak UPDATE/DELETE revisi, INSERT/UPDATE/DELETE nutrients/servings serta pemindahan child dari/ke revisi terbit. Basis, komposisi, source_id, locator/snapshot dan import_batch_id terkunci. Koreksi membuat revisi baru. Bibliografi sumber yang telah dipakai revisi terbit tidak ditimpa; gunakan source record baru. Perubahan hak sumber menambah audit dan memperbarui state izin lewat entrypoint, bukan menimpa bukti lama. Archiving/withdrawal mengubah visibilitas, bukan menghapus versi atau menghitung ulang food log historis (D09). Desain fungsi + privilege membatasi jalur operasional; belum ada trigger yang diizinkan/diimplementasikan.

**Draft/review:** perubahan konten atau izin relevan tidak menghapus audit lama, tetapi membuatnya tidak efektif untuk gate. Digest harus dihitung dari snapshot konten yang disetujui operator, dengan expected digest untuk mencegah review konten berbeda setelah race. Riwayat review tidak otomatis menjadikan latest revision sebagai versi yang telah disetujui.

**Category cycles:** di bawah lock yang sama, periksa leluhur calon parent sebelum perubahan; FK dan self-parent CHECK existing tetap dipakai. Serialisasi mencakup perubahan hierarchy lain, bukan recursive query tanpa concurrency control.

**Normalizer:** satu implementasi reusable backend NFC -> trim/collapse whitespace -> lowercase -> NFC untuk canonical_name/alias/query. Belum ada implementasi; CHECK nonblank dan digest tidak menggantikan normalizer.

**Error/concurrency:** konflik expected digest, review stale, izin berubah dan timeout/deadlock menghasilkan kegagalan terkontrol dan rollback; jangan retry keputusan editorial secara otomatis. Error tidak mengekspos SQL/detail internal. Kode domain/API baru masih PROPOSED/OPEN sampai penyelarasan kontrak API tersendiri; tidak menambah enum OpenAPI dalam task dokumentasi ini.

#### Security foundation setelah checkpoint 7174273

**TECHNICAL DESIGN, NOT ACTIVATED.** Batch ini merinci batas teknis dari desain governance yang sudah disetujui. Rancangan instalasi, key lock, dan strategi identitas di bawah belum merupakan approval provisioning, grant, SECURITY DEFINER writer, atau pilihan operator. [Rencana verifikasi](sql-migration-plan.md#security-foundation-verification-plan) memisahkan bukti existing dari pengujian keamanan yang belum dilakukan. Tidak ada tabel capability, nama login baru, enum capability, fungsi writer atau module authorization yang ditetapkan secara spekulatif.

**Trust boundary dan asal identitas.**

| Boundary | Yang dapat dipercaya setelah validasi | Yang tidak menjadi otoritas |
|---|---|---|
| Client -> Firebase/Fastify | Firebase ID token yang diverifikasi server sesuai issuer/project/audience, signature, masa berlaku dan kebijakan revocation yang disetujui | UID/email/actor_subject/capability dari body, header buatan sendiri atau token yang hanya di-decode |
| Fastify -> authorization | Subject terverifikasi dan hasil lookup capability dari pemetaan yang dikelola server; tidak ada akses editorial bawaan bagi app_users ACTIVE | Login berhasil, email verified, status ACTIVE, hash atau claim yang tidak disetujui sebagai sumber kewenangan |
| Fastify -> connection pool | Service DB role dari konfigurasi rahasia server; operasi terkait memakai satu koneksi checked-out dan satu transaksi | session_user pada koneksi pool sebagai identitas manusia; SET ROLE atau GUC sebagai bukti manusia |
| Historical local-operator alternative | Tidak dipilih; identitas editor memakai Firebase/Fastify | Tidak membuat login PostgreSQL individual untuk reviewer |
| PostgreSQL -> functions/audit | Caller DB yang diizinkan, validasi capability/target/state, digest otoritatif dan metadata event dari server | Label actor/capability bebas, payload/digest caller, event lama yang dipilih untuk melewati pencabutan |

Firebase/Fastify untuk identitas editor kini APPROVED; persistence capability dan konfigurasi server tetap OPEN. Pada model pool, service adalah trust boundary: pihak yang menguasai credential service dapat memalsukan assertion aktor service. Tidak ada klaim PostgreSQL dapat membuktikan manusia hanya dari parameter/GUC. Sebelum aktivasi harus disepakati sumber mapping, cara mengikat subject terverifikasi ke panggilan DB dan penanganan revocation. Jangan membangun context setter yang dapat dipanggil caller tanpa otorisasi. Tidak membuat workflow lokal; NOINHERIT sendiri tidak mencegah SET ROLE menuju role privileged.

**Capability evaluation contract.** Hanya kategori konseptual pada matriks existing di atas yang dipakai; ID teknis dan persistence menunggu consumer. Keputusan ALLOW memerlukan seluruh kondisi: identitas tepercaya, mapping aktif yang eksplisit untuk operasi tersebut, target sah, prasyarat state/versi/digest terpenuhi dan policy owner yang diperlukan sudah tersedia. Identitas/mapping tidak ada, sumber lookup gagal, capability tidak dikenal, mapping tidak aktif atau policy belum ditetapkan menghasilkan DENY; tidak ada fallback admin atau inference dari capability lain. Review nutrisi, hak sumber, operator draft dan publikasi tidak saling memberikan kewenangan otomatis. Mapping capability harus mempunyai satu otoritas; jangan menyalin allowlist bisnis ke middleware, SQL dan UI secara independen.

Self-review, jumlah reviewer dan kualifikasi tidak diisi default teknis. Operasi yang memerlukan keputusan tersebut tetap tidak tersedia. Verifikasi request dan validasi capability SQL adalah lapisan berbeda, bukan dua policy bisnis yang bersaing. Bila mapping berada di luar PostgreSQL, atomic revocation lintas Firebase/service/DB tidak boleh diasumsikan; aturan kesegaran/revocation harus disetujui dan diuji sebelum aktivasi.

**Database/schema/privilege boundary.** Matriks konseptual di atas tetap sumber hak per operasi. Semua login operasional hanya CONNECT ke database yang disetujui dan USAGE schema/proyeksi yang dibutuhkan; tidak mendapat database CREATE/TEMPORARY, schema CREATE, ownership, CREATEROLE, SUPERUSER, REPLICATION, BYPASSRLS atau jalur membership/SET ROLE menuju migrator/executor. Tidak ada grant option/admin option untuk mendelegasikan hak. Periksa privilege efektif dari PUBLIC, membership dan default ACL, bukan hanya GRANT langsung; tidak mengubah privilege database lain untuk memenuhi rancangan ini.

Application runtime belum memperoleh SELECT atas seluruh base tables: hanya proyeksi katalog aman yang harus dirancang/diuji, tanpa audit, aktor, evidence privat atau metadata migration. Operator/reviewer/publisher hanya EXECUTE signature entrypoint yang diizinkan. Executor NOLOGIN mendapat USAGE schema serta hak tabel/kolom minimum per fungsi; audit hanya SELECT/INSERT, tanpa UPDATE/DELETE/TRUNCATE. Tidak memberikan REFERENCES/TRIGGER/MAINTAIN atau privilege sequence langsung secara antisipatif; kebutuhan identity sequence diuji sebelum grant tambahan. Executor memerlukan EXECUTE signature helper 0007 dan SELECT yang dibutuhkan ketika memanggil helper INVOKER; grant tersebut juga belum diberikan. Schema/tabel dan metadata migration tetap dimiliki migrator; executor tidak memiliki tabel/schema dan tidak menyentuh nutrasa_migrations.

**Controlled function installation proposal.** PostgreSQL mensyaratkan CREATE schema pada calon owner serta kemampuan SET ROLE ketika owner diubah oleh role biasa; superuser dapat melakukan transfer tanpa persyaratan tersebut. Rekomendasi untuk instalasi awal adalah administrator sah yang menjalankan satu transaksi instalasi terkontrol, bukan memberikan CREATE permanen atau membership executor kepada migrator/operator. Ini batas maintenance tepercaya yang membutuhkan approval terpisah, bukan perluasan runtime runner. [ALTER FUNCTION PostgreSQL 18](https://www.postgresql.org/docs/18/sql-alterfunction.html).

1. Sebelum instalasi, identitas cluster/database/administrator, existing ownership, exact function signatures/hash, ACL/default ACL dan role attributes harus cocok. Caller editorial tetap tanpa EXECUTE; writer belum aktif. Hentikan writer selama perubahan DDL/ownership; jangan mencampur transaksi maintenance dengan transaksi editorial.
2. Tahap domain engine: migration baru yang direview memasang definisi fungsi dengan EXECUTE tertutup bagi PUBLIC dan semua caller operasional; definisi/history/checksum commit bersama melalui engine existing. Tidak ada fungsi yang diaktifkan pada tahap ini. Schema/tabel tetap migrator-owned. Tahap admin terpisah kemudian mentransfer hanya ownership signature yang ditetapkan kepada executor NOLOGIN tanpa CREATE atau membership operasional. Tidak memindahkan ownership schema/tabel atau helper 0007.
3. Terapkan fixed search_path pg_catalog,pg_temp, referensi schema-qualified, VOLATILE untuk writer, tanpa dynamic SQL, client DDL/role/session mutation atau transaction control. Cabut PUBLIC EXECUTE dan semua grant nonowner yang tidak masuk allowlist instalasi; audit juga default ACL sehingga function creation tidak mewarisi akses tersembunyi. [CREATE FUNCTION PostgreSQL 18](https://www.postgresql.org/docs/18/sql-createfunction.html).
4. Pada transaksi admin yang sama dengan transfer, berikan hanya privilege executor yang diperlukan serta akses helper INVOKER sesuai signature, jika sudah termasuk approval instalasi. Verifikasi owner/path/body/ACL/membership dan ketiadaan CREATE/akses metadata sebelum commit; kegagalan membatalkan seluruh perubahan transaksional. Tidak ada grant kepada caller operasional sampai seluruh activation gates dan negative tests selesai.
5. Upgrade/DOWN berikutnya juga maintenance tertutup: cabut akses caller dan selesaikan transaksi aktif melalui prosedur yang disetujui; admin mengembalikan ownership fungsi terkait kepada migrator, engine menjalankan migration forward/DOWN yang direview, lalu admin mentransfer kembali ownership fungsi yang tersisa dan memverifikasi ACL sebelum mempertimbangkan aktivasi. Tidak mengaktifkan fungsi baru dengan owner migrator. Jangan memberi SET ROLE permanen, mengubah runner ownership checks atau mengedit SQL historis sebagai jalan pintas. Fase admin harus diserialisasi dengan maintenance/migration existing dan memverifikasi manifest signature, body/atribut yang direview, file hash serta owner/ACL. History/checksum domain tetap engine-owned; admin tidak menulis ledger/history. Tidak ada ledger atau migration engine kedua. Tidak mengklaim seluruh fase domain/admin/aktivasi atomik: jika salah satu fase gagal, deployment tetap nonaktif, laporkan state parsial dan STOP tanpa retry/reset/grant otomatis. Manifest konkret dan script phase-gated menjadi deliverable batch instalasi berikutnya.

Tidak ada SQL instalasi yang dibuat atau dijalankan di batch ini. CREATE sementara lalu REVOKE oleh migrator adalah alternatif yang belum disetujui; jangan menerapkannya diam-diam. Semua hak owner/superuser/migrator tetap batas administratif tepercaya, bukan jaminan immutable terhadap administrator.

**Append-only dan published content.** Event audit, review-source junction dan batch terminal ditulis melalui entrypoint dan tidak diedit setelah commit oleh role operasional. UUID/event_number/waktu/subject dibentuk dari konteks tepercaya/server, bukan authority caller. Koreksi menambah event; sequence boleh bergap. Permission/review terbaru dan validitasnya diperiksa ulang di bawah lock, bukan memilih ACCEPTED lama. Raw evidence, token dan personal reviewer data tidak otomatis disimpan. Retensi bukan tanpa batas dan tetap owner/legal gate. Pelanggaran gate harus melempar error sehingga domain dan audit batal bersama; hasil REJECTED setelah rollback hanya boleh dicatat dalam transaksi baru yang kembali diautentikasi/diotorisasi.

Semua perubahan revision/nutrients/servings/provenance memeriksa kedua parent lama/baru ketika reparenting dan menolak perubahan konten published. Jangan membuka edit dengan downgrade status. Publication/withdrawal hanya melalui gate lintas tabel yang sudah dirancang. Perubahan bibliografi sumber terpakai published menggunakan source baru. Tidak ada grant writer draft sebelum jalur immutable/append-only terkait lengkap dan teruji; metadata CHECK/RESTRICT dan digest tidak cukup untuk enforcement. Tidak menambahkan trigger tanpa review/approval tersendiri.

**Editorial locking proposal.** Gunakan satu exclusive transaction-level advisory lock dengan pasangan integer (1314214994,1): namespace pertama adalah ASCII NUTR (0x4E555452), kedua katalog. Ini PROPOSED, belum dipakai runtime. Dua-integer key space terpisah dari bigint migration key 7241865325823964 pada node-pg-migrate 9.0.0; namespace pasangan ini harus direservasi pada implementasi agar fitur mendatang tidak memakainya. Sync saat ini dirancang memakai counter/row lock per owner, bukan lock katalog. [Advisory locks PostgreSQL 18](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

Urutan setiap writer: validasi identitas/caller/capability dasar -> ambil lock katalog -> baca ulang mapping/policy dan state otoritatif pada langkah terpisah -> row locks bila perlu dengan urutan tabel yang konsisten dan UUID terurut -> validasi expected digest, review/permission terbaru dan seluruh invariant -> DML domain+audit -> commit/rollback oleh caller. Tidak mengambil row lock sebelum advisory lock, tidak memakai lock session-level atau melepas lock transaksi manual. Target awal hanya READ COMMITTED; isolation lain ditolak sampai dibuktikan. Setiap jalur source permission, review, taxonomy, draft, publication, batch serta perubahan mapping yang dikelola DB harus mengikuti protokol yang disetujui; bypass administratif tetap di luar jaminan operasional.

Call chain dalam satu request memakai koneksi/transaksi yang sama. Jangan memakai pool.query per langkah, membawa actor context ke request berikutnya atau mengembalikan koneksi saat transaksi/context belum dibersihkan. Error/cancellation mengharuskan rollback; koneksi yang tidak dapat dipastikan bersih ditutup, bukan dipakai ulang. Timeout lock/statement/idle-in-transaction harus finite dan direview saat implementasi, tanpa membuat default konfigurasi baru sekarang. Tidak ada HTTP/network/legal lookup sambil memegang lock atau automatic retry keputusan editorial. Advisory lock mencegah race antar writer yang patuh, bukan mencegah DoS oleh pemilik akses SQL yang tidak tepercaya.

Category reparenting membaca leluhur calon parent sesudah lock dan menolak self-parent, leluhur yang mencapai node sendiri, serta chain rusak/siklus existing secara fail-closed. Serialisasi global mencegah dua transaksi membuat cycle yang masing-masing tampak valid sebelum transaksi lain commit. Saat publication, evaluasi waktu server setelah lock; jangan menganggap snapshot lama atau izin saat review tetap efektif. Distribusi/cache/read mengevaluasi kondisi kini, dan kebijakan dampak historis tetap keputusan owner/legal.

**Error boundary dan implementasi minimal.** Baseline sebelum batch identity mengklasifikasikan 400/404/413/415. Boundary identity kini menambah 401 AUTH_REQUIRED dan 403 ACCESS_DENIED melalui handler yang sama; selain status yang dikenali tetap SERVER_ERROR aman. Ini bukan bukti SDK Firebase atau domain account-status mapping sudah aktif. Tidak membuat error class/layer kedua; SQL/token/evidence tidak dikirim ke client/log.

**Owner gates yang belum terselesaikan:** operator yang berwenang; mapping/capability serta revocation; self-review dan separation of duties manusia; jumlah/kualifikasi reviewer nutrisi; hak/scope/bukti/atribusi/expiry/withdrawal per sumber; retensi audit/subject dan dampak distribusi/cache/histori. Seluruh activation gates ini tetap OPEN. Tidak ada pilihan nama role/login/table mapping atau grant operasional dalam dokumen ini.

Batch security foundation sebelumnya memilih dokumentasi/test plan. Sesudah keputusan Firebase editorial, boundary Fastify identity/capability kini ditulis dan diuji dengan verifier/authority mock tepercaya; SDK adapter sudah tersedia; live configuration, persistence capability dan binding aktor SQL belum aktif. Writer, migration 0008 dan editorial endpoint tetap tidak tersedia.

#### Firebase identity boundary dan proposed privilege manifest

**IMPLEMENTED FOUNDATION, NOT LIVE FIREBASE INTEGRATION.** buildApp menerima verifier server-side dengan kontrak verifyIdToken(token,true) dan authority allows(verifiedUid,serverRouteCapability,serverRouteScope). Request identity minimal hanya UID terverifikasi, dibekukan per request. authenticate dan requireCapability adalah hook opt-in; hook capability menyertakan authentication. Health tetap public. Tidak ada capability editorial nyata, mapping store baru atau dependency yang dapat dipilih oleh client.

Bearer header harus tunggal dan tiga segmen; ini pemeriksaan bentuk input, bukan JWT decode/verification buatan sendiri. Missing/malformed/invalid/expired/revoked/disabled token -> 401 AUTH_REQUIRED. Verifier tidak terkonfigurasi, provider failure tak dikenal atau UID result tidak sah -> 500 SERVER_ERROR aman. Identity valid tetapi authority belum ada atau menolak assignment -> 403 ACCESS_DENIED; lookup outage -> 500 dan handler tidak dijalankan. Error envelope tetap melalui app.ts existing; tidak menetapkan 503 baru atau domain account-status mapping.

Token revocation dan capability revocation berbeda: verifier selalu dipanggil dengan checkRevoked=true; authority dipanggil ulang per request tanpa capability cache. Role/admin/email_verified/custom claims tidak disalin ke identity atau mengganti lookup. server.ts tidak memasang verifier dummy. Tests memakai verifier/authority mock dan credential sintetis; SDK juga diuji menolak wrong audience/issuer secara offline sebelum signature lookup. Hasilnya bukan bukti signature verification produksi. Belum ada PostgreSQL pool/context/GUC dalam implementasi ini, sehingga validasi actor hingga SQL tetap OPEN.

[Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens) dan [revocation checks](https://firebase.google.com/docs/auth/admin/manage-sessions) kini didelegasikan oleh adapter src/firebase.ts ke firebase-admin 14.5.0 terpasang (Node >=22, runtime lokal 24.21.0). server.ts memakai FIREBASE_PROJECT_ID eksplisit dan Application Default Credentials eksternal, tanpa membaca .env secara otomatis. Konfigurasi project divalidasi, emulator ditolak, named app dipakai ulang hanya untuk project sama dan error konfigurasi disanitasi. Project kosong tidak menginisialisasi SDK atau mencari credential; health tetap public. Tidak membaca credential aktual atau membuat project/account. Status live CONFIGURATION PENDING: signature verification dan revocation terhadap user sungguhan belum diuji; initialization saja tidak membuktikan credential tersedia. Capability store belum diimplementasikan.

Manifest ini **PROPOSED, NOT EXECUTED**. Nama runtime/migrator existing dipertahankan; executor/runtime disposable baru hanya proposal:

| Environment | Database | Runtime service | Migrator | Executor NOLOGIN (proposed) | Installer |
|---|---|---|---|---|---|
| Development | nutrasa_dev | nutrasa_dev_app | nutrasa_dev_migrator | nutrasa_dev_catalog_executor | Administrator sah, maintenance terpisah |
| Testing utama | nutrasa_test | nutrasa_test_app | nutrasa_test_migrator | nutrasa_test_catalog_executor | Administrator sah, tidak dijalankan batch ini |
| Disposable security test | `nutrasa_it_<id>` | `nutrasa_it_<id>_runtime` (proposed) | `nutrasa_it_<id>_migrator` | `nutrasa_it_<id>_executor` (proposed) | nutrasa_it_admin pada dedicated cluster, sesudah approval target |

Runtime hanya CONNECT database terkait dan USAGE schema/proyeksi yang disetujui, tanpa catalog/audit DML/TRUNCATE, database CREATE/TEMP, schema CREATE, migration metadata atau membership/SET ROLE ke owner/executor. Tidak mendapat writer EXECUTE otomatis. Migrator tetap owner schema/tabel/metadata dan tidak dipakai runtime. Executor tidak LOGIN/CREATE/own schema/table; hak tabel/kolom dan helper EXECUTE minimum sesuai fungsi, audit SELECT/INSERT saja. Installer adalah maintenance authority, bukan role login baru. PUBLIC/default ACL, transitive inheritance, SET ROLE, grant/admin option harus masuk negative tests; NOINHERIT saja tidak cukup.

Exact writer signature list masih kosong karena writer belum disetujui. Tiga signature helper existing pada schema nutrasa: catalog_source_permission_payload_v1(uuid,text,jsonb,boolean,text,timestamptz,timestamptz,text,text), catalog_revision_payload_v1(uuid,uuid[]), catalog_payload_digest_v1(jsonb). Helper tetap migrator-owned, SECURITY INVOKER, fixed search_path pg_catalog,pg_temp, PUBLIC EXECUTE revoked. Prosedur engine-admin di atas hanya mentransfer signature privileged yang kelak disetujui, bukan mengubah ownership helper historis. Tidak membuat grants/ALTER OWNER/DDL atau script SQL instalasi dalam batch ini.

Rencana tests privilege menggunakan actual login disposable runtime/executor sesudah approval, bukan migrator menyamar sebagai runtime. Uji effective ACL/membership, metadata access, SET ROLE, direct DML, exact EXECUTE, pg_temp shadowing dan failure per fase domain/admin. Fastify concurrency tests kini membuktikan request isolation; pool transaction/context isolation hingga PostgreSQL masih planned. Enforcement dan capability persistence tetap memerlukan kontrak/approval berikutnya; tidak menandai M03-01 DONE.

#### Capability persistence contract - desain, belum DDL

Kontrak perilaku berikut memfinalisasi boundary server-side batch ini. Bentuk fisik minimum di bawah masih PROPOSED untuk approval migration; tidak ada tabel, grant atau writer baru. Tidak ada capability operasional yang aktif dan M03-01 belum DONE.

| Aspek | Kontrak dan batas implementasi |
|---|---|
| Binding identitas | Firebase UID terverifikasi dipetakan secara exact/case-sensitive ke app_users.firebase_uid existing, lalu app_users.id menjadi subject internal. Tidak trim, tidak mengikat berdasarkan email/domain. Tidak otomatis membuat akun, assignment atau administrator. Hanya account_status ACTIVE boleh memperoleh izin; missing/PENDING_DELETION/DELETED ditolak. |
| Project boundary | Satu deployment hanya memakai satu Firebase project owner-approved. UID hanya unik dalam project itu; perpindahan project harus melalui review binding/data tersendiri, tidak boleh menafsirkan ulang UID existing sebagai manusia dari project baru. |
| Capability/scope | Identifier capability ditetapkan server dan di-allowlist oleh route, bukan string role dari client. Scope TEXT COLLATE C NOT NULL dengan CHECK nonblank telah disetujui tanpa fixed vocabulary/hierarchy/normalisasi. Nilai tersimpan bukan izin; unknown capability/scope wajib DENY pada authorization. Vocabulary capability/otoritas grant belum disetujui dan tetap OPEN. |
| Default denial | Tidak ada assignment aktif yang cocok, subject tidak aktif, capability/scope tidak dikenal atau store unavailable berarti tidak boleh menjalankan handler. Authentication tidak memberi hak editorial otomatis; custom claims tidak menggantikan store. |
| Grant/revoke | Hanya authority yang ditetapkan owner melalui jalur server tepercaya boleh mengubah assignment. Hak mengedit katalog tidak menyiratkan hak memberikan capability. Tidak ada endpoint self-service, automatic first-admin, grant option, SQL role atau GUC dari client yang mengesahkan actor. |
| Audit | Setiap grant/revoke menyimpan actor internal, target internal, capability/scope, action, reason, server timestamp dan request correlation; event append-only. Tidak menyimpan token, credential atau custom claims mentah. Bootstrap pemberi hak awal memerlukan prosedur eksplisit owner dan audit, bukan akun login pertama. |
| Transaction | Reread otoritas pemberi hak, ubah assignment dan append event dalam satu transaksi; gagal satu berarti rollback semua. Tetapkan lock order yang sama untuk perubahan grant/revoke dan operasi yang dilindungi. Handler writer kelak harus reauthorize pada koneksi/transaksi yang sama dengan DML dan audit, bukan hanya boolean onRequest. |
| Revocation | Lookup ulang tiap request tanpa cache capability. Revocation yang sudah commit harus menolak operasi berikutnya. Operasi in-flight dilinearisasi dengan lock assignment yang konflik dengan revoke; tanpa desain lock dan integration proof ini, tidak boleh mengklaim pencabutan atomik atau mengaktifkan writer. |
| Pool/runtime | Login PostgreSQL runtime tetap identitas service, bukan actor manusia. Binding UID ke internal subject dibuat server; client actor_subject/role/GUC tidak dipercaya. Tidak ada SET ROLE per manusia, runtime tidak boleh menulis store/audit secara langsung. Rollback/release koneksi tidak boleh menyisakan context antar-request. Context hingga restricted SQL writer belum tersedia. |
| Firebase lifecycle | verifyIdToken(token,true) menolak revoked/disabled/deleted user sebelum lookup capability. Grant tidak dihapus otomatis saat outage atau akun dinonaktifkan; reaktivasi akun tidak boleh otomatis dianggap persetujuan editorial baru. Kebijakan suspend/regrant serta penghapusan/retensi subject dan audit perlu keputusan owner. Jangan menghapus bukti secara CASCADE. |
| Outage | SDK credential/network failure dan database authority failure gagal tertutup dengan SERVER_ERROR existing; tidak fallback ke cache, token claims atau role service. Missing/invalid token AUTH_REQUIRED; verified tetapi tidak berhak ACCESS_DENIED. Tidak membuat kode 503 baru. |

**PROPOSED persistence minimum, kini dirinci:** [matriks fisik](postgres-physical-schema-v1.5.md#capability-persistence-foundation-m03-01-proposed) memakai catalog_capability_events (sepuluh kolom) dan catalog_capability_assignments (empat kolom). Projection hanya menyimpan pointer event efektif; state GRANT/REVOKE, actor dan waktu ada pada event, tanpa metadata state duplikat. FK gabungan mengikat pointer pada subject/capability/scope yang sama. UUID subject menggunakan app_users existing. Tidak memakai catalog_reviews sebagai histori hak atau menambahkan hierarchy/tabel role/enum SQL. Struktur 10/4 kolom 0008 dengan scope nonblank telah dilaporkan 16/16 PostgreSQL integration PASS oleh owner pada target disposable; bukan bukti store runtime atau enforcement aktif. Vocabulary teknis kini disetujui pada registry; policy authority dan aktivasi tetap OPEN, tanpa assignment aktif.

**OPEN owner gates:** siapa pemberi/pencabut hak termasuk bootstrap, self-review dan separation of duties, kualifikasi/jumlah reviewer, perluasan vocabulary di luar enam pasangan teknis yang disetujui, retensi dan perlakuan deleted subject, reaktivasi Firebase, legal source permission serta distribusi historis setelah pencabutan. Tidak ada keputusan tersebut yang diasumsikan selesai. Capability database store dan writer tetap nonaktif sampai policy, schema, privilege manifest dan negative/concurrency tests disetujui.

**Administrative bootstrap PROPOSED, nonaktif:** owner harus menetapkan identitas grantor dan prosedur verifikasi/approval out-of-band secara eksplisit. Calon actor wajib login Firebase terverifikasi dan mempunyai binding app_users sah, tetapi login/urutan registrasi tidak memberikan authority. Approval owner harus mengikat actor, target, capability/scope, reason dan satu operasi yang direview; jangan memakai password DB admin, email atau custom claim sebagai bukti actor. Pemberi hak awal dan larangan/pengecualian self-grant bootstrap belum ditentukan; karena itu tidak ada executable bootstrap, seed, CLI assignment atau route administrative. Record event wajib mempunyai actor nyata; tidak mengisi SYSTEM, NULL atau first-user sebagai jalan pintas. Subsequent grant/revoke harus memeriksa authority tersendiri yang ditetapkan owner; capability publish/review tidak menyiratkan boleh mendelegasikan hak.

**Pool dan transaksi PROPOSED:** Firebase diverifikasi sebelum checkout; server memilih capability/scope dari operasi, lookup UID secara exact pada koneksi checked-out. Jangan membuka arbitrary actor/role/context setter untuk client. Untuk writer nanti: BEGIN READ COMMITTED, ambil lock katalog yang sama dengan grant/revoke/lifecycle, baca ulang account dan capability setelah lock, validasi policy/digest, DML+audit, COMMIT; error wajib ROLLBACK sebelum release. Jangan menyimpan actor pada objek pool/session global atau memakai session-level SET/GUC. Gunakan parameter bound dan referensi schema-qualified dalam entrypoint yang direview. Jika context transaksi kelak diperlukan, format dan trusted setter membutuhkan review tersendiri; SET LOCAL saja bukan bukti manusia.

**Batas jaminan:** boolean allows pada hook sekarang hanya precheck, bukan token izin yang boleh dipakai ulang dalam transaksi writer. Projection menunjuk REVOKE/missing/unknown policy => DENY; outage => fail closed, tidak memakai state cached. Grant/revoke dan semua writer harus memegang exclusive transaction-level lock katalog PROPOSED (1314214994,1), bukan membuat lock kedua dengan urutan terbalik. Revoke yang commit lebih dulu menolak writer berikutnya; bila writer mendapat lock lebih dulu, commit writer dapat mendahului revoke. Perubahan status app_users yang relevan juga harus ikut protokol; belum ada implementasi atau bukti concurrency. Firebase disable/delete berada pada sistem eksternal: verifyIdToken(true) bukan transaksi atomik dengan PostgreSQL dan tidak menjamin pencabutan di tengah request langsung membatalkan commit. Batas freshness/in-flight harus disetujui sebelum aktivasi.

Service DB credential tetap trust boundary: PostgreSQL tidak membuktikan Firebase user hanya dari actor parameter/GUC. Credential runtime yang bocor dapat memalsukan assertion service jika endpoint SQL memberinya jalur tersebut. Tidak memberi EXECUTE atau DML pada store sampai actor binding, restricted entrypoint, ACL/owner serta negative tests disetujui end-to-end. Tidak menambahkan trust token/crypto framework kedua sebagai pengganti keputusan ini. Operational audit immutable dibatasi terhadap runtime, bukan superuser/migrator.

**Proposed review separation:** mencegah self-approval dan self-publication adalah default proposal untuk review owner; tidak menandainya APPROVED. Rights review, nutrition review dan publication tetap capability berbeda. Perbedaan nama role tidak membuktikan dua manusia; lineage actor pembuat perubahan/reviewer, reviewer qualification dan pengecualian apa pun harus ditutup sebelum activation. Tidak ada hak operasional sekarang.

**Rencana pengujian persistence (belum dieksekusi):** exact UID/project binding, missing/inactive subject, default denial, grant/revoke atomic dengan audit, pencegahan self-escalation/direct DML, revoke-versus-write lock ordering, pool reuse/cross-request isolation, rollback/outage, disabled/deleted user dan audit preservation. Mock allows boolean saat ini hanya membuktikan boundary request, bukan transaksi/ACL PostgreSQL.

#### Authorization read boundary dan restricted writer plan

**IMPLEMENTED, NOT OPERATIONALLY CONNECTED.** backend/src/capabilities.ts menyediakan createCapabilityAuthority(database,approvedPermissions). Adapter tidak membuat Pool/Client, membaca credential atau environment, melakukan SQL pada import, memasang route, atau dikomposisi server.ts. Default approvedPermissions kosong sehingga semua pasangan DENY tanpa query. Subset aktivasi berasal dari konfigurasi server tepercaya dan harus termasuk registry teknis yang disetujui, bukan body/header/custom claims atau isi tabel; unit tests memakai registry teknis yang disetujui. Tidak ada assignment editorial aktif. Registry di-snapshot saat construction agar mutasi array caller tidak diam-diam menambah hak.

requireCapability(capability,scope) kini meminta dua nilai server-defined; scope wajib nonblank dan diteruskan exact tanpa trim/normalisasi. Identity tetap UID dari verifyIdToken(token,true), bukan actor_subject/role client. Authority membuat satu parameterized SELECT EXISTS dengan $1 UID, $2 capability dan $3 scope. Equality memakai COLLATE C; JOIN app_users ACTIVE, assignment dan event mencocokkan composite key sepenuhnya. Hanya effective GRANT dapat bernilai true. NOT EXISTS menolak pointer ketika ada event_number lebih tinggi untuk key sama; ini pemeriksaan konservatif stale state, bukan klaim event_number membuktikan urutan commit. Event number tetap diagnostik; writer terkontrol/locking masih wajib.

Satu statement membaca account/pointer/event/history dalam satu snapshot PostgreSQL, tanpa N+1 query atau SELECT terpisah yang dapat mencampur status. Default denial meliputi empty/missing binding, account bukan ACTIVE, assignment hilang, effective REVOKE, stale pointer dan unknown pair. DB failure atau bentuk result bukan satu boolean menghasilkan authority failure, bukan grant atau denial sukses: hook mengembalikan SERVER_ERROR aman. DENY menghasilkan ACCESS_DENIED. Hasil tidak di-cache; request berikutnya melakukan lookup baru untuk pair yang dikenal.

**Bukti dan batas:** tests membuktikan known-pair filter, parameter binding, error sanitization, pembacaan ulang state mock, source UID/scope server-side dan concurrent request isolation memakai injected query mock. Reader PostgreSQL kini teruji 8/8 PASS, exit 0: exact binding, missing/nonactive account, revoked/stale pointer, ACL 13 kolom dan reuse Pool max=1 pada skenario yang diuji. Ini tidak membuktikan atomic revoke/write. Firebase disabled/deleted/revoked ditolak boundary SDK sebelum query (mock tests); tidak menambah status DISABLED ke app_users. Race verification Firebase dengan transaksi DB tetap OPEN.

**Activation blocker produksi:** belum ada komposisi Pool/connection lifecycle produksi atau authority operasional. Privilege read pada target disposable sudah diotorisasi dan diuji 8/8 PASS; ini bukan aktivasi produksi. Manifest minimum APPROVED untuk persiapan offline: SELECT app_users(id,firebase_uid,account_status), assignments(subject_id,capability,scope,last_event_id), events(id,subject_id,capability,scope,action,event_number), plus USAGE schema/CONNECT yang sah; tidak memerlukan reason/actor/audit payload, DML, metadata migration, CREATE atau SET ROLE. Ini desain column privileges yang disetujui sebagai tambahan terbatas atas manifest proyeksi publik, bukan GRANT produksi; pemasangan disposable telah diuji; jangan diam-diam memakai migrator/superuser atau memberi SELECT seluruh audit. Alternatif read projection/function memerlukan review tersendiri, tidak dipasang batch ini.

Trusted query boundary kelak harus memakai koneksi runtime bersih dengan autocommit READ COMMITTED dan snapshot baru per lookup, tanpa transaksi REPEATABLE READ tertahan dari request lain. Adapter tidak menulis session GUC, actor global atau SET ROLE; mocked tests bukan bukti Pool produksi; suite disposable kini membuktikan reuse backend max=1 dan isolasi identitas pada skenario yang diuji. Query yang sudah berjalan dapat menyelesaikan snapshot lama ketika revoke commit sesudah snapshot diambil. Boolean precheck bukan izin yang boleh dibawa ke writer kemudian tanpa reauthorization.

**Restricted writer contract PROPOSED, belum function/SQL:**

1. Trusted server telah memverifikasi actor Firebase dan binding subject ACTIVE. Input operasi memuat target internal subject, exact capability/scope, action GRANT/REVOKE, reason, request correlation server serta expected last_event_id (NULL untuk initial grant). actor bukan input client; PostgreSQL tetap mempercayai assertion service sesuai approved trust boundary, bukan membuktikan manusia dari parameter/GUC. Pemegang credential service adalah risiko tersendiri.
2. Approved delegation authority terpisah harus ditetapkan owner dan dibaca ulang. Login, email, ordinary user ACTIVE, publisher/reviewer, first account atau custom claim tidak mengesahkan grant. Vocabulary/scope teknis mengikuti registry yang disetujui; siapa grantor bootstrap masih OPEN. Jangan membuat capability MANAGE/ADMIN atau signature writer aktif untuk mengisi kekosongan ini. Sumber registry vocabulary antara route/read/writer harus tunggal dan dirinci sebelum coding writer.
3. BEGIN READ COMMITTED pada satu koneksi checked-out; ambil transaction-level advisory lock katalog PROPOSED (1314214994,1), lalu statement baru membaca ulang actor, target, delegation authority, expected pointer dan state. Semua writer/revoke/status lifecycle yang relevan mengikuti urutan advisory lock sebelum row lock; lock migration tidak dipakai.
4. GRANT pada effective GRANT ditolak; REVOKE tanpa effective GRANT ditolak. Regrant setelah REVOKE membuat event baru. Mismatch expected pointer ditolak sebelum event; request_id hanya correlation, bukan deduplication receipt. Setelah unknown commit outcome, inspect state/audit, jangan retry administratif otomatis.
5. Dalam transaksi sama INSERT satu event dan INSERT/UPDATE projection ke event itu. Tidak UPDATE/DELETE event atau DELETE projection untuk revoke. Failure setelah salah satu langkah harus melempar error dan membatalkan keduanya; log REJECTED terpisah pun tidak boleh memakai actor palsu. Waktu/UUID/sequence server, reason disanitasi dan tanpa secret. RESTRICT mempertahankan actor/target dan menghalangi physical deletion sampai retensi/anonimisasi disetujui.
6. Runtime tidak mendapat direct INSERT/UPDATE/DELETE/TRUNCATE atas dua tabel. Executor NOLOGIN yang kelak disetujui hanya SELECT kolom prasyarat, INSERT events dan INSERT/UPDATE projection yang diperlukan, tanpa UPDATE/DELETE/TRUNCATE event, DDL atau metadata migration. Sequence privilege hanya jika pengujian identity column membuktikan perlu. SECURITY DEFINER writer kelak memakai fixed search_path pg_catalog,pg_temp, schema-qualified references, tanpa dynamic SQL/session role/transaction control; PUBLIC EXECUTE dicabut pada transaksi pembuatan. Tidak ada function yang dibuat sekarang.
7. Ikuti instalasi engine-domain tertutup lalu admin transfer ownership exact signatures ke NOLOGIN executor sesuai manifest existing, tanpa memindahkan tabel/schema/helper historis atau memberi CREATE/SET ROLE kepada runtime. Fase domain/admin tidak diklaim atomik bersama; gagal satu fase berarti tetap nonaktif dan STOP. Operational EXECUTE baru boleh setelah actor binding, vocabulary, grantor, privileges dan negative tests PASS.
8. Revoke dan protected writer dilinearisasi lock yang sama: revoke commit lebih dulu menolak writer berikutnya; writer lebih dulu dapat selesai sebelum revoke. Writer wajib reauthorize di dalam transaksi yang sama dengan domain/audit, tidak memakai hasil allows yang lama. Pool rollback/release tidak boleh meninggalkan context. Account/Firebase lifecycle dan audit retention tetap gate tersendiri.

**Bootstrap nonaktif:** owner harus menetapkan actor awal, authority out-of-band yang sah, target/pair dan evidence approval. Autentikasi Firebase dan identity binding saja tidak menciptakan delegation authority. Tidak memakai first-user selection atau actor SYSTEM; larangan/pengecualian self-grant, self-review/self-publication dan separation/kualifikasi reviewer belum final. Tidak ada bootstrap seed/CLI/role atau grant pada batch ini.

#### Registry proposal dan reader privilege review

[Kontrak tunggal](authorization-registry-reader-security.md) kini menyatakan enam pair teknis dan manifest 13 kolom APPROVED untuk implementasi offline. Registry typed digunakan hook dan adapter; subset aktivasi default kosong, server tanpa authority. Guard reader nonowner dan suite multi-role telah dijalankan pada disposable: 8/8 PASS, exit 0. Guard migrator dan allowlist CLI tetap. [Kontrak setup/pengujian](../../backend/tests/integration/README.md#capability-reader-security---verified-disposable-checkpoint) mencatat approval target disposable, pemasangan 0001-0008, login dan 13 column privileges. Retry setup berhenti karena collision (exit 1); recovery terarah yang disetujui mendahului suite PASS, tanpa bukti marker/exit aktivasi terpisah. Tidak ada grant/role produksi. Writer authority/bootstrap/separation dan pool operasional tetap OPEN. Lihat [bukti reader 8/8 PASS, exit 0](../../backend/tests/integration/README.md#reader-security-execution-evidence); retained target tidak boleh diulang/reset/cleanup tanpa approval.

## 10. Sequence for developers

1. Use the selected local Fastify/PostgreSQL stack; defer cloud provider, budget and region selection until beta/cloud planning.
2. Decide Firebase Auth SDK configuration and OAuth build requirements (Google/Apple) in Expo.
3. Follow approved Decisions 01–10/O-18 and M00–M10 task order; close task-specific typed payload, eligibility, SDK, security and contract-test gaps without reopening settled product choices.
4. Draw normalized schema and indexes with example queries; freeze minimum catalog/log invariants.
5. Specify API contracts with versions, idempotency, pagination, errors and auth rules.
6. Implement Firebase Auth session + backend token verification and a narrow health-check/auth endpoint.
7. Implement SQLite local schema and one food-log vertical slice with outbox, remote sync and tests.
8. Curate the first 100 foods with source rights and QA, then expand toward 500; no automatic unlicensed import.
9. Expand remaining feature slices; instrument logging, database migrations, monitoring and backup/restore rehearsal.
10. Run security, nutrition-domain and legal reviews before release.

## 11. Acceptance tests / architecture checks

| ID | Scenario | Pass condition |
|---|---|---|
| ARC-01 | User A reads User B's diary | Forbidden server-side |
| ARC-02 | Expired/forged ID token | Rejected |
| ARC-03 | Offline log + app restart | Log and pending outbox survive |
| ARC-04 | Same sync request sent twice | Exactly one logical mutation |
| ARC-05 | Offline delete | Deletion eventually reconciles without resurrection |
| ARC-06 | Catalog recipe changed | Previous log snapshot unaffected |
| ARC-07 | Nutrient sodium unknown | Daily sodium shows partial, not zero-as-known |
| ARC-08 | User switches accounts | Local user data isolated |
| ARC-09 | New weight generates target revision | Historic goals preserved; unsafe result not activated |
| ARC-10 | Two-device edit same log | Last valid server-applied mutation wins transactionally; ordered owner feed and replay/concurrency tests pass |
| ARC-11 | Old app schema + new server | Version compatibility or actionable migration failure |
| ARC-12 | Backup restore test | Verified restore with access permissions intact |

## 12. Open decision register

| Decision | Recommendation | Status |
|---|---|---|
| DB choice | PostgreSQL local | SELECTED — ADR-001 |
| PostgreSQL host | Local during development; future managed host undecided | CLOUD PHASE OPEN |
| Backend runtime | Node.js + Fastify local | SELECTED — ADR-001; hosting later |
| Offline architecture | Expo SQLite/outbox + server-ordered LWW, owner idempotency and transactional cursor | DESIGN SELECTED; IMPLEMENTATION/TESTS OPEN |
| Local encryption | SQLCipher with development build per Decision 08; key/backup/logout testing required | DESIGN SELECTED; SECURITY TESTS OPEN |
| Auth SDK | Expo-compatible Firebase JS vs native modules | TECHNICAL REVIEW |
| Email verification | Optional for onboarding and main features; sensitive Firebase actions retain controls | RESOLVED — Decision 01; security tests OPEN |
| Collision handling | Server-ordered LWW per final sync v1.6, not device timestamps | DESIGN RESOLVED; concurrency/recovery tests OPEN |
| Nutrition preset values | No production automation until clinical approval | CLINICAL REVIEW |
| Data source license | Import only after verifying rights | LEGAL REVIEW |
| Health/body data consent & deletion | Review locally applicable law | LEGAL REVIEW |

## 13. Official references (checked October 2026)

The source document supplied these references and claimed a check date; this documentation merge does not independently verify external prices, quotas, or vendor terms.

- Firebase Firestore pricing: https://firebase.google.com/docs/firestore/pricing
- Firebase data model: https://firebase.google.com/docs/firestore/data-model
- Firebase aggregation: https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- Firestore offline: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firestore Rules & queries: https://firebase.google.com/docs/firestore/security/rules-query
- Firebase Admin ID tokens: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Expo + Firebase: https://docs.expo.dev/guides/using-firebase/
- Expo SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Hosted PostgreSQL overview: https://supabase.com/solutions/hosted-postgres

**This document is planning guidance, not a command to install all tools or deploy resources.**
