# NUTRASA - M03-01 Backend Pause Handoff

Tanggal checkpoint: 18 Oktober 2026. Keputusan owner: **M03-01 PAUSED/PARTIAL**.
Prioritas sementara: **React Native/Expo Portfolio Prototype dengan mock data
terisolasi**. Dokumentasi ini tidak memulai implementasi prototype atau menyatakan
backend, publikasi katalog maupun keseluruhan MVP selesai.

## 1. Identitas repository dan checkpoint Git

- Repository utama: D:/Rajendra/NUTRASA - NUTRISI NUSANTARA APPS.
- Branch terverifikasi: feat/database-foundation.
- Catatan historis sebelum checkpoint dokumentasi authority: HEAD e9e8e82,
  tiga dokumen modified dan unstaged, staged diff kosong.
- Tiga dokumen tersebut: authorization-registry-reader-security.md,
  sql-migration-plan.md dan codex-task-board-v1.md.
- Preflight sesi handoff menemukan HEAD aktual **3e4cf3c**,
  docs(auth): preserve governance authority design and open decisions;
  working tree bersih dan staged diff kosong. Commit itu sudah menyimpan ketiga
  dokumen, bukan perubahan lokal yang hilang. Tidak ada Git mutation oleh agen.
- Urutan commit terakhir: 7174273 -> 38295b4 -> e9e8e82 -> 3e4cf3c.
  38295b4 menyimpan capability persistence/Firebase; e9e8e82 menyimpan registry
  dan guarded reader setup; 3e4cf3c menyimpan desain authority yang masih OPEN.
- Local tracking menunjukkan ahead 11 pada preflight; tidak ada fetch/push atau
  pemeriksaan remote langsung pada sesi ini. Owner sendiri mereview dan push.

Dokumen ini dan tautannya pada task board adalah perubahan baru sesi handoff.
Path workspace lama dan repository OneDrive/Prisma bukan target. Selalu cek
repository root, branch dan HEAD aktual saat resume; jangan mengasumsikan hash
handoff tetap menjadi HEAD setelah commit manual berikutnya.

## 2. Cara membaca bukti

Bukti dibedakan: (a) file/Git yang diperiksa langsung; (b) hasil terminal pemilik
proyek yang sudah dikonfirmasi dan dicatat; (c) desain/tests yang belum dieksekusi.
Tidak ada koneksi PostgreSQL atau test ulang pada checkpoint dokumentasi ini.
Jumlah test mengikuti total Node runner, termasuk parent test; bukan jumlah
checkpoint anak saja. PASS suatu suite tidak mensertifikasi fitur operasional lain.

Mulai dari [task board](codex-task-board-v1.md), lalu
[backend README](../../backend/README.md),
[integration README](../../backend/tests/integration/README.md),
[registry/security](../02-architecture/authorization-registry-reader-security.md),
[system architecture](../02-architecture/system-architecture.md) dan
[migration plan](../02-architecture/sql-migration-plan.md).
[Checkpoint awal M03](m03-session-checkpoint.md) tetap merupakan riwayat 13 Oktober:
pernyataan belum ada migration/checksum pada saat itu telah dilampaui batch berikut.
Kontrak logis/fisik pada [database schema](../02-architecture/database-schema.md)
dan [physical schema](../02-architecture/postgres-physical-schema-v1.5.md) tetap
rujukan kontrak; handoff ini tidak menggantikannya.

## 3. Kronologi fondasi backend

1. **M00-M02:** audit/penyelarasan keputusan, fondasi Fastify terpisah dari mobile,
   environment hygiene, tooling, health dan error handling selesai berdasarkan
   checkpoint yang sudah dilaporkan. Malformed 400 INVALID_REQUEST; schema 400
   VALIDATION_FAILED; 404 NOT_FOUND; 500 SERVER_ERROR; status 413/415 dipertahankan.
   Liveness minimal tidak berarti PostgreSQL atau governance siap.
2. **Fondasi database:** pg + node-pg-migrate dipilih; backend memiliki migration
   engine, validasi environment, SHA-256 ledger immutable dan advisory locking.
   Core yang sama dipakai CLI dan harness; fixture terpisah dari migration domain.
   UP mencatat DDL/history/checksum secara transaksional; DOWN mempertahankan
   baseline immutable. File berubah/hilang dan history/ledger mismatch ditolak.
3. **Isolasi PostgreSQL:** pengujian dipindah ke cluster testing khusus port 5433,
   terpisah dari PostgreSQL utama 5432. Provisioning dan password dilakukan melalui
   prosedur owner-approved. Target fresh dan marker/identity guard wajib.
4. **Identity dan engine:** percobaan awal identity menemukan parser metadata
   name[] dan SQLSTATE RESTRICT; koreksi test-only memakai text[] serta 23001
   untuk RESTRICT, tetap 23503 untuk referensi child tidak valid. Schema identity
   tidak diubah untuk memaksa PASS. Target gagal dipertahankan. Fresh identity
   akhirnya 15/15 PASS dan engine B 11/11 PASS; rincian pada integration README.
5. **Katalog struktural 0002-0005:** sumber, revisi/nutrien, taxonomy/alias,
   servings dan provenance diimplementasikan bertahap setelah kontrak disetujui.
   Lifecycle, failure rollback dan preservasi domain terdahulu telah diuji pada
   disposable masing-masing, tanpa seed makanan nyata atau aktivasi publikasi.
6. **Audit/digest 0006-0007:** struktur review/batch dan helper digest read-only
   diuji; helper SECURITY INVOKER tidak memberikan legal clearance, writer atau
   grant editorial. Golden vectors membedakan NULL/nol/row absent dan menjaga
   presisi, urutan serta canonical bytes sesuai kontrak.
7. **Identity/Firebase dan 0008:** adapter firebase-admin dan boundary Fastify
   disiapkan; capability events/projection struktural dibuat, lalu registry enam
   pair dan reader nonowner diuji. Tidak ada first-user administrator atau
   authority otomatis dari email/UID/custom claims.
8. **Reader & Pool:** setup sebelumnya parsial, kemudian retry owner setelah salah
   input berhenti pada collision preflight, exit 1. Inspeksi read-only membuktikan
   state existing; recovery password/LOGIN terarah mendapat approval, lalu suite
   reader 8/8 PASS, exit 0. Marker/exit aktivasi terpisah tidak tersedia: jangan
   menyatakan seluruh original installer end-to-end PASS. Target telah terpakai.
9. **Authority planning:** kontrak bootstrap/writer diperdalam dari e9e8e82 dan
   disimpan owner pada 3e4cf3c. Writer SQL tetap belum dibuat karena keputusan
   authority/delegation/actor binding belum selesai. Owner kini mem-pause backend.

## 4. Migration 0001-0008 dan validasi aktual

| Migration | Cakupan | Bukti validasi PostgreSQL yang sudah tersedia |
|---|---|---|
| 0001_identity.sql | app_users, profiles, preferences, privacy acknowledgements | Identity 15/15 PASS, 0 fail/skip, exit 0; constraints dan UP/DOWN/UP. |
| 0002_food_sources.sql | Delapan kolom metadata sumber | 13/13 PASS, 0 fail/skip, exit 0; rollback/lifecycle dan preservasi identity. |
| 0003_food_catalog.sql | foods, food_revisions, food_revision_nutrients | 18/18 PASS, 0 fail/skip, exit 0; same-food FK, 11 kode, NULL versus nol, lifecycle. |
| 0004_food_taxonomy.sql | categories, food_categories, food_aliases | Suite gabungan 0004/0005 24/24 PASS, 0 fail/skip, exit 0; bukan 24 test terpisah per migration. |
| 0005_food_servings_provenance.sql | Serving definitions dan dua kolom provenance revisi | Suite gabungan yang sama; rollback ALTER+DDL, nullable paired references, source evidence dan preservasi taxonomy. |
| 0006_catalog_audit.sql | Reviews, review sources, import batches dan revision link | 16/16 PASS, 0 fail/skip, exit 0; empty DOWN dan penolakan populated DOWN atomik. |
| 0007_catalog_digest.sql | Tiga helper internal digest/canonical payload | 15/15 PASS, 0 fail/skip, exit 0; golden vectors, ACL, rollback dan DOWN/UP/re-run. |
| 0008_catalog_capabilities.sql | Events 10 kolom dan assignments 4 kolom | Owner mengirim 16/16 PASS, 0 fail/skip. Numeric suite exit dan final-state JSON tidak tersedia sebagai bukti terpisah; provisioning exit 0 tidak diganti menjadi suite exit. |

Engine B terpisah: 11/11 PASS, exit 0, mencakup transaksi, failure rollback,
DOWN/UP, changed/missing checksum, mismatch metadata, concurrent migration,
advisory lock/release dan recovery/re-run. Ini bukan crash recovery saat commit.
Percobaan B kemudian ditolak schemas_empty karena sudah terpakai; suite tidak
berjalan dan PASS sebelumnya tetap sah.

Delapan file migration diperiksa byte-identik terhadap HEAD pada sesi ini.
SHA-256 file aktual (jangan mengedit applied migration):

| Migration | SHA-256 |
|---|---|
| 0001_identity.sql | a86a276c6d99080cd123a57647b0c51c53ad1fbce3951e13ddaddfbd113be5af |
| 0002_food_sources.sql | 9485a3b5e9d7f26afde5cf94454fac5d76fd384489574a4a960583cad19528b6 |
| 0003_food_catalog.sql | 24c93dd8ed1985e0326460dbca7645d819d7458b36b82ed175c988d70c3f6888 |
| 0004_food_taxonomy.sql | d5386fc815162402bb57048858dc16ba2f067237b7a241df25ce0f028f8d3542 |
| 0005_food_servings_provenance.sql | 1b5e8bb150b9102236bd98e2aa21e1625a5bb3f5de8d6942778ba3c919065218 |
| 0006_catalog_audit.sql | c682c41851dd2932e79b66846b696f6ad5d4f8ed8906c77e355f37350ed89961 |
| 0007_catalog_digest.sql | b6df290443a21652ce28776bbf3b2f86fac085151eb8759b6c0c9d2802930425 |
| 0008_catalog_capabilities.sql | 68ddb8d4af1ed64260863c41b93be3699a81956da1cc7233c5456ffa0d5d2328 |

## 5. Identity, registry dan Reader & Pool

Firebase Authentication dipilih sebagai identitas staf, diverifikasi Fastify;
capability PostgreSQL adalah kewenangan server-side yang terpisah. Adapter
firebase-admin 14.5.0 tersedia, verifyIdToken dengan revocation check dipakai,
credential disediakan eksternal; **live configuration CONFIGURATION PENDING**.
Mock/offline SDK coverage bukan bukti live user/signature/revocation produksi.

Registry teknis menyetujui enam pasangan exact scope CATALOG:
source_permission.review, nutrition.review, publication.publish,
publication.withdraw, capability.grant dan capability.revoke, semuanya dengan
prefix catalog. Ini vocabulary, bukan assignment atau otoritas delegasi. Subset
aktivasi default kosong, server.ts tidak memasang capability authority/editorial
route atau Pool operasional. Unknown pair ditolak; UID dicocokkan case-sensitive
ke app_users.id internal, ACTIVE tetap bukan izin.

[Bukti reader](../../backend/tests/integration/README.md#reader-security-execution-evidence):
**8/8 PASS, 0 fail/skip, exit 0**, mencakup initial immutable history dan empty
domains; binding/grant exact; actual max=1 Pool backend reuse pada request
sequential/concurrent; inactive/revoked/stale denial; forbidden write/DDL/sequence/
metadata; audit/history preservation; dan safe failure sesudah Pool milik test
ditutup. Exactly 13 SELECT columns = app_users 3 + assignments 4 + events 6.
Effective ACL, PUBLIC/default privilege, ownership dan membership/SET ROLE guard
serta negative privileges teruji pada nonowner login. Tidak ada runtime produksi
memakai administrator/migrator sebagai reader.

Bukti terakhir non-database sebelum pause: installer focused 30/30 dan backend
unit 130/130 PASS, typecheck/lint PASS; mobile typecheck PASS, sebagaimana catatan
batch sebelumnya. Review authority berikutnya menjalankan backend typecheck dan
lint PASS, tanpa source changes atau full regression baru. Sesi handoff ini hanya
checks dokumentasi/Git/hash; tidak menambahkan hasil test baru.

## 6. Database dan bukti testing yang dipertahankan

Cluster testing: PostgreSQL 18.6, 127.0.0.1:5433, nutrasa_it_pg18,
system identifier 7697229180258678980,
data directory D:/Rajendra/NUTRASA-Postgres-IT/data. Administrator nutrasa_it_admin;
SCRAM dan exact target/role loopback HBA. Checkpoint reader terakhir mencatat
19 valid HBA rules, 0 parsing errors, setelah reload testing saja. Semua ini
bukti terdahulu, bukan klaim server masih berjalan atau HBA diaudit ulang hari ini.

Nama migrator setiap target = nama database + _migrator. Reader target terakhir
juga mempunyai role + _runtime. Database dimiliki admin, schema/objek migrator;
reader nonowner. Nama target bukan credential atau izin koneksi.

| Database retained | Bukti/kondisi terakhir yang diketahui |
|---|---|
| nutrasa_it_19aef3f06cbc428b8928f15d96bee4af | Percobaan metadata identity gagal; UP sempat diterapkan, DOWN belum tercapai; state akhir tidak diaudit ulang. |
| nutrasa_it_b31050e74d094192b8d63e5cbc915d34 | Percobaan RESTRICT assertion gagal; DOWN belum tercapai; jangan menganggap fresh. |
| nutrasa_it_78bb7ba14c944afe860e0424cbfbd9c9 | Identity final PASS; history 0001 dan baseline dipertahankan. |
| nutrasa_it_7058d1b4a4144bd5b63d383ccc4b2478 | Engine B PASS; dua probe/history/baseline retained; subsequent schemas_empty rejection. |
| nutrasa_it_1451d777bc364abf928bf93c278e3f96 | Food sources PASS; history 0001-0002, dua baseline dan synthetic identity retained. |
| nutrasa_it_088c02bb1b884ba794ce8cab56d14603 | Catalog PASS; history 0001-0003, tiga baseline; katalog kosong setelah lifecycle, protected identity/source retained. |
| nutrasa_it_49e23e0805ba43fda3f5078a57d28a10 | Foundation PASS; history 0001-0005, lima baseline, synthetic taxonomy/revisions/nutrients retained; serving kosong. |
| nutrasa_it_283df900c3dc4107b5e0c9aeaacbf2c4 | Audit PASS; history 0001-0006, enam baseline; synthetic REJECTED source review retained, populated DOWN ditolak. |
| nutrasa_it_fe30b453570e472daf0e35ff4d251748 | Digest PASS; tujuh history/baseline, helper ACL dan synthetic protected domains retained. |
| nutrasa_it_00ce468c0642416bb39d7374f11ba412 | Capability persistence owner-reported 16/16 PASS; jangan mengarang final-state JSON/numeric suite exit yang tidak tersedia. |
| nutrasa_it_b6ffd021fd5e4f00b14f135b764a6cdc | Reader 8/8 PASS; delapan history/checksum, synthetic GRANT/REVOKE dan revoked projection retained; bukan fresh target. |

Sepuluh target lama dikonfirmasi retained sebelum reader, ditambah target reader;
jumlah sebelas di atas adalah inventory bukti terdahulu, bukan query katalog baru.
Data target gagal dan target PASS sama-sama bukti: tidak boleh reuse, reset,
manual rollback, DROP, cleanup atau retry tanpa keputusan owner. Target sementara
M03-02D yang jauh lebih awal sudah pernah dibersihkan manual; itu bukan izin
membersihkan target retained di tabel ini.

nutrasa_dev dan nutrasa_test pada cluster utama tetap dipertahankan. Login role
app/migrator serta schema lokal pernah dikonfirmasi owner pada checkpoint awal;
hasil disposable tidak membuktikan migration domain diterapkan pada keduanya.
Tidak mengakses port 5432 atau 5433 untuk handoff/prototype. PUBLIC CONNECT/TEMP
pada maintenance/template database dibedakan dari pembatasan HBA; jangan
mengklaim isolasi ACL seluruh cluster hanya dari exact HBA rules.

## 7. Keputusan disetujui dan batas yang masih OPEN

Sudah disetujui: delapan kontrak struktural/migration di atas, shared guarded
engine dengan ledger immutable, Firebase/Fastify identity, enam registry pairs,
exact reader manifest, isolated disposable test workflow dan keputusan pause
backend/prototype terisolasi. O-18 tetap: favorit/recent/custom food sederhana/
copy log MVP; resep pengguna post-MVP. sugar_g kanonis, nullable nutrient bukan
nol, histori/snapshot dipertahankan. Tidak ada persetujuan legal sumber tertentu
atau data nutrisi nyata dari metadata/DDL kosong.

| OPEN | Batas saat pause |
|---|---|
| Restricted grant/revoke writer | Belum ada SQL writer/migration 0009, executable writer suite atau privileged function. Duplicate transition rejection dan event/pointer atomicity operasional belum dibuktikan. |
| Authority, bootstrap, delegation | Siapa berwenang dan hak apa yang boleh didelegasikan belum ditentukan. No first-user admin, no self-grant/self-revoke, no automatic custom-claim/email authority. Manual bootstrap perlu approval dan aktor pencatat sah tanpa memalsukan FK actor. |
| Service-to-actor binding | UID dari backend trusted service masih memerlukan penerimaan trust boundary; parameter/GUC/session_user tidak membuktikan manusia. Service credential compromise tidak ditangani sekadar SQL CHECK. |
| Separation of duties | Self-review/self-publication, grantor, jumlah/kualifikasi reviewer dan ketentuan legal/clinical belum ditetapkan; tetap nonaktif. |
| Privilege enforcement | Reader disposable sudah teruji; operational writer/executor NOLOGIN, ownership transfer/install, function signatures, PUBLIC/default ACL dan runtime production privileges belum dipasang/disetujui. |
| Audit immutability | Retained struktur/RESTRICT/guarded DOWN tersedia; append-only terhadap caller operasional masih perlu restricted writer dan ACL. Tidak menjanjikan immutable terhadap administrator atau retensi tanpa batas. |
| Publication gate | Published content immutable, pointer menuju revisi PUBLISHED, nutrient completeness/review, izin sumber/expiry/revocation dan concurrency editorial belum enforced end-to-end. Tidak ada aktivasi import/publikasi. |
| Category/source lifecycle | Category cycle prevention, audit/import operasional, source evidence/legal clearance, mixed nutrient provenance dan vocabulary yang belum disetujui tetap OPEN. |
| Firebase/live backend | Live Firebase configuration, real token/account lifecycle dan production authority/Pool belum dibuktikan; read-only test Pool tidak menggantikannya. |
| Security/concurrency | Writer authorization, rollback audit+pointer, grant/revoke races, lock setelah wait, lifecycle/write revocation, production/multi-backend Pool dan network-failure cleanup belum teruji nyata. Migration concurrency yang PASS tetap dibedakan. |
| Crash/retention | Crash recovery saat commit, retensi/anonimisasi account history, reactivation dan distribusi historis setelah izin dicabut tetap OPEN. |

Spesifikasi detail dan satu gate keputusan berada di
[authority/writer foundation](../02-architecture/authorization-registry-reader-security.md#9-authority-and-restricted-grantrevoke-foundation).
Proposal di sana belum berubah menjadi APPROVED oleh keputusan pause ini.

## 8. Prioritas sementara: Portfolio Prototype

Owner mengalihkan prioritas ke React Native/Expo Portfolio Prototype berbasis
mock data terisolasi. Ikuti struktur aktual src/app/ untuk thin routes dan
src/features/ untuk fitur, versi dependency dan AGENTS.md; tidak scaffold ulang.
Prototype belum dibangun oleh task handoff ini. Scope screen/UX dan fixture akan
dikerjakan sebagai batch tersendiri; tidak membuat keputusan produk baru di sini.

Mock tidak membaca backend, credential, Firebase live atau database retained,
tidak memasang capability/role/grant dan tidak mengklaim security, clinical,
licensed food data, sync, kalkulasi atau persistensi produksi sudah tersedia.
Gunakan data sintetis yang jelas untuk demonstrasi, jaga NULL berbeda dari nol,
dan jangan menyisipkan fixture ke migration/ledger. Tidak ada izin mengaktifkan
editorial, publikasi/import atau deployment backend melalui pekerjaan prototype.
Milestone utama M00-M10 tidak diubah urutan atau dianggap otomatis selesai.

## 9. Resume backend tanpa mengulang PASS

1. Baca handoff, AGENTS, task board dan registry/security; cek root/branch/HEAD,
   status dan staged diff read-only. Pertahankan hasil prototype dan perubahan
   owner; jangan menganggap workspace bersih atau commit tertentu masih HEAD.
2. Verifikasi delapan file migration/hashes dan source consumer terkait perubahan
   yang akan dibuat. Jangan edit applied SQL atau replay suite lama sekadar resume.
3. Tutup satu gate owner yang koheren: model service assertion, finite delegation
   matrix, bootstrap recorder/initial authority, revoke penerima nonaktif dan
   lock protocol. Jangan memilih staf, authority atau legal policy sendiri.
4. Setelah coding approval, siapkan closed writer kandidat, perluasan scanner
   minimum hanya untuk grammar aktual, unit/static tests dan integration harness
   fresh. Pertahankan shared engine, history/ledger dan exact registry, tanpa
   generic policy engine atau SECURITY DEFINER terbuka.
5. Jalankan focused scanner/security regression saat perubahan berisiko, lalu
   satu final non-database batch typecheck/lint/unit/diff. Reader 8/8 dan katalog
   lama tidak perlu diulang tanpa perubahan relevan; kode/versi/kontrak yang
   berubah tetap harus mendapat pengujian regresi yang sesuai.
6. Database work membutuhkan approval eksplisit tersendiri: verifikasi instance,
   target fresh, collision/HBA/privilege guards, provisioning dan satu invocation
   suite yang ditetapkan. Jangan memakai ulang sebelas target evidence di atas.
   Kegagalan berarti STOP tanpa retry/reset/cleanup otomatis.
7. Tinjau hasil aktual sebelum operational grant/ownership/activation terpisah;
   jangan membuka publikasi atau menyatakan M03-01 DONE dari test struktural.
   Bila authority belum diputuskan, backend tetap PAUSED/PARTIAL.

## 10. Dua deliverable dokumentasi akhir proyek

Rencana, belum dibuat atau diklaim selesai:

1. **Histori pembangunan komprehensif:** kronologi milestone/commit/approval,
   keputusan dan alternatif, kegagalan beserta koreksinya, sumber bukti test,
   perubahan scope, fase pause/resume serta batas fitur pada setiap rilis.
   Pisahkan bukti owner, pemeriksaan agen dan desain yang belum dieksekusi.
2. **Handbook teknis engineer:** arsitektur dan batas mobile/backend, setup lokal
   tanpa secret, konfigurasi, kontrak API/schema, migration/integrity/ownership,
   identity/authorization, data/provenance, testing, operasi dan troubleshooting,
   security/retention serta prosedur maintenance/rollback yang sudah disetujui.

Gunakan dokumen existing dan Git sebagai bahan; hindari menggandakan sumber
kebenaran atau menyertakan token, password, credential URL, data pengguna nyata
maupun artefak legal yang tidak boleh didistribusikan. Nama/path deliverable akhir
belum ditentukan agar tidak membuat dokumen versi spekulatif sekarang.

## 11. Review dan handoff manual owner

Sesi ini hanya membuat handoff dan menambahkan prioritas/tautan task board.
Checks: file/anchor lokal, whitespace/diff, source/migration preservation dan
pemindaian konten baru untuk credential literal; tidak membaca .env/secret.
Tidak menjalankan typecheck/lint/unit/integration ulang karena source tidak berubah.
Tidak mengakses PostgreSQL, melakukan cleanup atau Git mutation.

Owner mereview dua file dokumentasi ini lalu melakukan staging/commit/push sendiri.
HEAD yang dicatat adalah sebelum commit handoff, bukan prediksi commit berikutnya.
Repository checkpoint layak direview untuk disimpan; backend tetap PAUSED/PARTIAL.
