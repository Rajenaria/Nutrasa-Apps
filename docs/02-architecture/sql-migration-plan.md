# NUTRASA — SQL Migration Plan v1.0

**Status:** Rencana, **bukan skrip SQL**, tidak dieksekusi. Baseline: `database-schema.md` v1.2 dan `api-contract.md` v1.2. Target: PostgreSQL lokal pada masa development. 13 Oktober 2026.

## 1. Prinsip eksekusi nanti

- Gunakan engine yang sudah tersedia: `node-pg-migrate` 9.0.0 dengan histori `nutrasa_migrations.pgmigrations`, ledger SHA-256 immutable dan advisory lock melalui wrapper proyek. **Jangan menjalankan schema sync otomatis** yang bisa menghapus kolom produksi.
- Setiap migration memiliki nomor urut, nama jelas, checksum, petunjuk rollback/roll-forward, dan tes terhadap database kosong serta database berisi data.
- Mulai dengan seed **dummy nonlisensi** untuk pengujian. Jangan mengimpor 100 makanan sebelum sumber dan hak penggunaan dinyatakan boleh.
- Jangan masukkan rahasia Firebase Admin ke SQL/commit. Database URL dan kredensial hanya melalui environment server lokal yang diabaikan Git.
- Idempotency, unique constraints, foreign keys, CHECK constraints, dan perubahan domain + change feed harus dibuat dalam transaksi yang sesuai.
- Postgres trusted dev host saja; jangan expose port 5432 ke internet publik.

## 2. Urutan migration yang direncanakan

**APPROVED M03-01A:** domain pertama `backend/migrations/0001_identity.sql`, belum dibuat atau dijalankan. Runner menerima `NNNN_nama.sql` dengan empat digit 0001–9999, UTF-8 tanpa BOM dan LF, marker up/down resmi library. Bootstrap ledger manual dan provisioning schema/role terpisah dari nomor domain; tidak ada dummy foundation atau extension UUID hanya untuk mengisi 0001. Lihat [konvensi runner](../../backend/README.md#fondasi-migration-m03-02d-step-b).

ID 003–013 di bawah adalah label kelompok rencana historis, **bukan nomor filename final**; tidak mengubah task board M03-01/M03-02/M03-03. Nomor file sesudah 0001 ditetapkan saat scope migration disetujui.

| ID | Kelompok | Tabel/objek | Kriteria penerimaan |
|---|---|---|---|
| 0001_identity.sql | Identity (menggantikan rencana lama 001 Foundation / 002 Identity) | `app_users`, `user_profiles`, `user_preferences`, `privacy_acknowledgements` | Kontrak struktural M03-01A final; PK/FK/UQ/NN/CHECK/default dan privilege diuji pada database disposable; fitur onboarding/clinical/legal tetap mempunyai gate terpisah |
| 003 | Catalog provenance | `food_sources`, `categories`, `foods`, `food_aliases`, `food_categories` | food_sources SQL 0002: 13/13 integration PASS, exit 0. Kelompok belum selesai: alias/parent category dan kontrak tabel lainnya tetap perlu dirinci; status izin eksplisit. |
| 004 | Catalog composition | `food_revisions`, `food_revision_nutrients`, `serving_definitions`, `catalog_reviews`, `catalog_import_batches` | Revisi published immutable; empat nutrisi wajib & nonnegatif; nilai lain NULL |
| 005 | Private food | `custom_foods`, `custom_food_revisions` | Revisi immutable; ownership dan soft-delete |
| 006 | Recipes | `recipes`, `recipe_revisions`, `recipe_ingredients` | Bahan mengacu revisi sumber yang benar dan tidak lintas owner; non-nested MVP |
| 007 | Favorites/meal templates | `favorite_foods`, `saved_meals`, `saved_meal_items` | Tombstone; salinan snapshot independen |
| 008 | Journal | `food_log_items`, `journal_day_states` | Snapshot 11 nutrisi; nonnegative; status OPEN/CONFIRMED_COMPLETE independen |
| 009 | Weights/goals | `weight_measurements`, `nutrition_goal_versions` | AUTO-only; rentang target tidak overlap per user; histori immutable |
| 010 | Offline sync | `sync_operations`, `change_feed`, device-sequence tracking, tombstone retention bookkeeping | Receipt atomik dengan mutasi; operation-id+digest; per-account cursor |
| 011 | Account deletion | `account_deletion_requests`, minimal durable retry metadata | Pending deletion memblokir penulisan; retry aman |
| 012 | Indeks & search | Indeks owner/date, owner/cursor, measured_at, normalized names | Query plans diperiksa; pg_trgm opsional jika tersedia |
| 013 | Seed development | Minimal katalog dummy, category dummy, test user fixtures terpisah | Tidak berisi data identitas nyata atau food source ilegal |

**Keputusan desain yang perlu diwujudkan dalam DDL:** polymorphic references pada `recipe_ingredients`, favorites, dan `food_log_items` harus memakai typed nullable FKs plus CHECK tepat-satu-referensi, atau pendekatan penghubung tervalidasi di transaksi. Jangan gunakan `source_revision_id` bebas tanpa validasi relasi dan kepemilikan.

## 3. Invariant yang wajib diuji

1. `app_users.firebase_uid` unik; akun email belum diverifikasi tetap dapat mengakses fitur sesuai aturan Auth.
2. Food published hanya jika sumber berizin dan komposisi energi, protein, karbohidrat, lemak sudah ditinjau; status sumber dan proses editorial diverifikasi saat publikasi, bukan hanya CHECK sederhana.
3. Kandungan nutrisi tujuh metrik tambahan boleh NULL; unknown tidak direpresentasikan sebagai nol.
4. Food log menyimpan revision-source dan immutable nutrient snapshot. Revisi katalog tidak mengubah histori.
5. Delete menjadi tombstone; stale update tidak resurrect.
6. `sync_operations` mencatat result receipt atomik dengan perubahan domain dan feed; retry operation_id identik memberi hasil identik; payload berbeda ditolak.
7. Urutan operasi dari satu device dijaga; sequence gap, replay dan perangkat yang di-reset mempunyai aturan recovery.
8. Weight yang dicatat mundur masuk grafik tetapi tidak mengganti pengukuran terbaru; edit/hapus latest dapat memicu goal recalculation serialized.
9. Target baru berlaku sejak aktivasi server; histori versi lama tidak hilang; progress satu hari memakai target efektif di akhir hari lokal.
10. Pemilik lain tidak dapat membaca/menulis data personal lewat seluruh query backend; test negatif wajib.
11. Akun PENDING_DELETION tidak menerima sync mutasi baru.
12. Hari tanpa log berbeda dari total nol; day completion tidak dianggap bukti kelengkapan nutrisi.

## 4. Rencana pengujian migration

- **Fresh install:** domain migration dimulai pada database terisolasi tanpa tabel domain setelah provisioning schema/role dan bootstrap ledger yang disetujui. Runner tidak membuat schema atau melakukan baseline histori lama otomatis. Bootstrap yang sudah berhasil tidak diulang.
- **Re-run:** migration runner tidak mengulang script yang sudah sukses; checksum menolak perubahan migration historis.
- **Upgrade:** dari versi sebelumnya dengan fixtures dummy, semua tabel dan foreign key tetap valid.
- **Rollback/roll-forward:** sediakan backup `pg_dump` sebelum migrasi berisiko. Pada perubahan destruktif, gunakan expand-migrate-contract, hindari DROP mendadak.
- **Load tests sederhana:** 100 dan 500 makanan; indeks pencarian, query food diary tanggal, 30 hari progress, 1.000 operasi sync dengan duplikasi dan order berbeda.
- **Security tests:** SQL injection dihalangi prepared parameter, pemisahan akun, non-disclosure ID, dan batas akses database role.
- **Failure injection:** transaksi putus tengah sync, retry deletion Firebase gagal, perubahan berat bersamaan, kehilangan koneksi mobile.

### Identity M03-01A → M03-01B

- **PROPOSED urutan DDL:** UP app_users → user_profiles → user_preferences → privacy_acknowledgements; DOWN urutan terbalik, tanpa DROP CASCADE luas atau menghapus schema/ledger/history engine; baseline checksum tetap setelah DOWN. **APPROVED lifecycle:** profil lengkap dan preferensi dibuat dalam satu transaksi backend saat onboarding valid; migration DDL tidak membuat draft/profil dummy. Runtime grants mengikuti keputusan privilege yang direview.
- Wrapper memegang advisory lock, check order dan batch transaction; file domain tidak membungkus transaksi sendiri atau menyentuh metadata. Ikuti batas parser pada README (termasuk larangan BEGIN/END); jangan menambahkan trigger/prosedur atau engine kedua. Rollback DDL saat runtime berbeda dari workflow penghapusan akun.
- **READY penulisan/pengujian DDL identity:** [FK dan DEFAULT final](postgres-physical-schema-v1.5.md#kontrak-identity-m03-01a) telah disetujui. Profiles → app_users CASCADE, preferences → profiles CASCADE tanpa FK langsung tambahan ke akun, acknowledgement → app_users RESTRICT. Default status akun tidak ada; backend wajib mengisinya. Completion timestamp tidak mempunyai default; acknowledgement memakai now() sebagai waktu rekam server. FK preferensi tidak menjamin keberadaan preferensi untuk setiap profil; transaksi pembuatan keduanya tetap tanggung jawab backend.
- Domain identity boleh dibentuk sebelum weight_measurements, nutrition_goal_versions dan implementasi backend onboarding tersedia. Initial weight/AUTO goal dan batas transaksi completion tetap **OPEN untuk implementasi fitur**, bukan blocker struktur identity. Jangan membuat profil produksi dengan parameter klinis belum disetujui, fake weight/target AUTO, atau kolom identity tambahan; keberadaan profil tidak berarti target aktif. Bootstrap ledger bukan domain migration 0001.
- PENDING_DELETION bukan DELETE fisik. RESTRICT mewajibkan acknowledgement diselesaikan eksplisit sebelum app_users dihapus; CASCADE/RESTRICT bukan workflow deletion lengkap. Jika legal mewajibkan bukti tetap ada setelah akun dihapus, arsitektur retensi harus direview sebelum implementasi, tanpa retensi personal diam-diam.
- **OPEN API/security:** request preference/acknowledgement/eligibility, bahasa vs locale dan update field profil; Firebase token verification pada Fastify; app-role grants/default privileges untuk tabel baru. Parameter klinis, faktor aktivitas, safety thresholds, legal basis, withdrawal/retensi/backups tetap OPEN; tidak ada izin data nyata/rekomendasi produksi.
- Test berikutnya memakai target sementara `nutrasa_it_<32hex>` dan harness existing setelah persetujuan provisioning/pengujian terpisah: UP struktur/default/constraint, kasus invalid/NaN/precision, FK dan akses role, failure rollback, DOWN/UP identik dan immutable checksum. Jangan memakai suite destructive pada nutrasa_dev/nutrasa_test. Belum ada test identity yang dijalankan pada task dokumentasi ini.

### Food sources M03-01

- **APPROVED oleh pemilik proyek:** kontrak fisik tepat delapan kolom registry pada [food_sources M03-01](postgres-physical-schema-v1.5.md#kontrak-food_sources-m03-01); rujukan logis [§3.2](database-schema.md#32-katalog-nusantara-dan-provenance). Nullability, DEFAULT dan CHECK mengikuti matriks tunggal tersebut, bukan ringkasan empat kolom fisik lama. Tidak ada enum source_type, indeks tambahan, relasi, source seed atau legal clearance baru. Approval awal dokumentasi dilanjutkan approval penulisan, kemudian approval gabungan provisioning dan satu kali integration test. Subtask food_sources PASS; **M03-01 belum DONE**.
- **Sudah ditulis dan diuji:** `backend/migrations/0002_food_sources.sql`, mengikuti `0001_identity.sql` yang tidak diubah; bukan ID milestone baru. UP hanya membentuk `nutrasa.food_sources` dengan PK/default/CHECK yang disetujui; DOWN hanya melepas tabel tersebut, tanpa CASCADE, tanpa menyentuh identity, schema, atau metadata migration secara langsung. [Suite food-sources terpisah](../../backend/tests/integration/README.md#food-sources-m03-01) **13/13 PASS, 0 fail/skip, exit code 0**, berdasarkan output terminal pemilik proyek. Unit tests 49/49 PASS. Tidak ada seed/import sumber nyata atau endpoint; role/schema/privilege target disposable hanya diprovisioning melalui prosedur existing yang disetujui.
- **Runner existing:** UTF-8 tanpa BOM, LF/newline akhir, marker up/down resmi, SHA-256 dari snapshot byte yang sama, order check, transaksi dan advisory lock tetap melalui core existing. Tidak ada transaksi/manual metadata di file SQL, engine kedua atau perubahan `0001_identity.sql`.
- **Verifikasi non-database selesai:** dua unit tests baru memeriksa discovery aktual 0001 → 0002, hash identity yang tidak berubah, isolasi fixture failure, serta pemuatan up/down SQL aktual bersama checksum pada builder publik tanpa koneksi. Backend typecheck/lint dan seluruh 49 unit tests PASS; mobile typecheck/lint serta diff check juga PASS. Tests checksum/config/guard existing tetap digunakan. Hasil ini bukan bukti constraint PostgreSQL telah bekerja.
- **Integration PASS setelah approval:** target `nutrasa_it_1451d777bc364abf928bf93c278e3f96`, migrator khusus bersuffix `_migrator`, PostgreSQL 18.6 `127.0.0.1:5433`, cluster `nutrasa_it_pg18`, system identifier `7697229180258678980`. HBA terverifikasi 12 aturan valid/0 error setelah penambahan satu aturan dan reload. Metadata delapan kolom/tipe/nullability/default, UUID/PK, NULL/whitespace, teks tanpa trim/referensi non-URL, empat status izin dan nilai invalid, waktu finite/infinity telah lulus. Bootstrap dan migrasi memakai harness/core existing.
- **Upgrade/lifecycle PASS:** upgrade identity berisi data sintetis ke food_sources, rollback batch saat division by zero, DOWN satu langkah dan UP identik/re-run lulus. OID, kolom/default, constraint serta row identity tidak berubah; baseline checksum dipertahankan. Verifikasi read-only akhir PASS: food_sources kosong, empat tabel identity masing-masing satu row sintetis, history 0001/0002 dan dua baseline cocok. Kelima target disposable dipertahankan, tanpa cleanup/reset/reuse; jangan menjalankan ulang suite yang sudah PASS. Runtime app-role privileges, editorial authorization serta crash recovery saat commit tetap OPEN. Tidak ada penerapan pada database dev/test utama yang diklaim oleh hasil ini.
- **OPEN traceability:** field/constraint lengkap tabel katalog lain, FK/source food code dan provenance per revisi/nutrien, audit reviewer/keputusan/batch hash, aturan editorial dan immutability publikasi. Hak data per sumber, atribusi dan review kualitas nutrisi tetap gate sebelum data nyata diimpor/dipublikasikan sesuai [D05](../04-development/decision-register-v2.md) dan [Food Database Specification](Food-Database-spec.md). Registry kosong tidak perlu mengarang izin, nilai nutrisi atau keputusan klinis untuk direncanakan.

## 5. Strategi database lokal → cloud

Pengembangan awal menjalankan PostgreSQL pada komputer developer dan Fastify lokal. Ketika beta eksternal siap, gunakan managed PostgreSQL dan tempat deployment Fastify yang sesuai; pindahkan via backup/restore/migration yang teruji. **Jangan mengandalkan akses ponsel ke localhost komputer tanpa konfigurasi alamat LAN/emulator.** Simpan semua konfigurasi koneksi di server, tidak pada aplikasi mobile.

## 6. Hal yang masih diblokir sebelum menulis migration eksekusi

Untuk `0001_identity.sql`, keputusan struktural identity/FK/default sudah final dan siap untuk penulisan/pengujian terisolasi pada M03-01B. Daftar lintas-domain di bawah tetap gate bagi migration/fitur terkait, bukan kewajiban menyelesaikan seluruh domain sebelum menulis identity. Belum ada SQL identity yang dibuat atau dijalankan pada task dokumentasi ini.

- Definisi schema fisik field per tabel dan constraints yang belum disebut rinci di v1.2. Registry `food_sources` adalah pengecualian scope yang sudah disetujui, ditulis dan diuji pada target disposable; tabel katalog lainnya belum ikut disetujui oleh keputusan tersebut.
- Strategi typed foreign key referensi katalog/custom/resep.
- Runner lokal sudah dipilih; deployment/connection role produksi tetap OPEN dan tidak ditetapkan oleh task identity.
- Kebijakan retensi tombstone/change_feed, expiry cursor serta strategi full resync saat purge.
- Struktur job penghapusan akun yang durable tanpa layanan berbayar.
- Review periode target, unit fisik, cakupan nilai, timezone DST, dan batas numerik.

**Sign-off yang diperlukan:** Engineering lead review kontrak dan migration checklist. Legal/clinical food review terpisah sebelum publikasi katalog/target kepada pengguna.
