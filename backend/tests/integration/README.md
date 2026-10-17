# Isolated migration integration tests — M03-02D / M03-01B.2

## Hasil final M03-01B.2 — 16 Oktober 2026

Berdasarkan output terminal dan konfirmasi pemilik proyek:

- Identity integration: **15/15 PASS, 0 fail, 0 skipped, exit code 0**
  (14 checkpoint dan satu parent test), termasuk migration UP/DOWN/UP.
- Migration-engine B: **11/11 PASS, 0 fail, 0 skipped, exit code 0**
  (10 checkpoint dan satu parent test). Verifikasi read-only akhir B juga PASS.
- Backend unit tests pada final review: **47/47 PASS**.
- Percobaan berikutnya pada B berhenti pada preflight `schemas_empty` karena
  target sudah dipakai. Suite tidak dijalankan pada percobaan tersebut; hasil
  PASS sebelumnya tetap berlaku. Tidak ada retry, reset atau cleanup sesudahnya.

Seluruh target berikut dipertahankan sebagai bukti. Nama role masing-masing
adalah nama database dengan suffix `_migrator`; tidak ada target yang tersedia
untuk dipakai ulang. Kondisi di bawah berasal dari bukti eksekusi, bukan query
database baru pada finalisasi dokumentasi.

| Database disposable | Kondisi terakhir yang diketahui |
|---|---|
| `nutrasa_it_19aef3f06cbc428b8928f15d96bee4af` | Percobaan identity awal berhenti pada assertion metadata `name[]`; UP berhasil, DOWN belum tercapai. Isi akhir tidak diaudit ulang. |
| `nutrasa_it_b31050e74d094192b8d63e5cbc915d34` | Percobaan identity berikutnya berhenti pada ekspektasi SQLSTATE RESTRICT; DOWN belum tercapai. Isi akhir tidak diaudit ulang. |
| `nutrasa_it_78bb7ba14c944afe860e0424cbfbd9c9` | Identity 15/15 PASS; empat tabel identity diterapkan kembali, sentinel dipertahankan, history `0001_identity` dan satu baseline checksum konsisten. |
| `nutrasa_it_7058d1b4a4144bd5b63d383ccc4b2478` | Engine 11/11 PASS; tabel `integration_probe` dan `integration_concurrent`, history `0001_probe` / `0002_concurrent`, dua baseline checksum. Probe berisi `{id: 1, value: "original"}` dan tabel concurrent kosong. |

Koreksi test metadata memakai `attname::text` agar array katalog diparse menjadi
`text[]`; assertion urutan/key tetap ketat. RESTRICT diperiksa dengan SQLSTATE
`23001` beserta schema/tabel/constraint; referensi child tidak valid tetap `23503`.
SQL identity tidak diubah untuk perbaikan tersebut.

Catatan historis finalisasi M03-02D: unit 39/39 PASS, integration 11/11 PASS,
dan target sementara sesi itu dibersihkan manual; `nutrasa_dev` / `nutrasa_test`
dipertahankan. Cleanup historis tersebut tidak mencakup empat target di atas.
Finalisasi M03-01B.2 hanya menjalankan checks non-database dan memperbarui dokumentasi.
Pengujian PostgreSQL telah dihentikan; provisioning, pengujian berikutnya dan
cleanup memerlukan approval terpisah, dengan target fresh untuk setiap suite.

## Target dan batas keamanan

Gunakan satu database baru untuk setiap eksekusi penuh:

Suite ini destructive: menjalankan DDL, rollback, serta injeksi korupsi metadata.
Hanya boleh memakai `nutrasa_it_<32hex>` yang terisolasi. Jangan menargetkan
`nutrasa_dev` atau `nutrasa_test`; keduanya dipakai CLI migration domain.

- Database `nutrasa_it_<id>`: ID tepat 32 karakter hex kecil.
- Role `nutrasa_it_<id>_migrator`: terpisah dari role dev/test utama.
- Instance PostgreSQL 18 khusus integration pada `127.0.0.1:5433`,
  dengan `cluster_name = nutrasa_it_pg18`. Port 5432 ditolak oleh harness.
- Dua schema `nutrasa` dan `nutrasa_migrations` owned oleh role khusus.
- Role tanpa SUPERUSER, CREATEDB, CREATEROLE, INHERIT, REPLICATION, BYPASSRLS
  atau membership. Database owned oleh administrator khusus `nutrasa_it_admin`.
- Komentar database `NUTRASA migration integration:<id>` menjadi marker target.
- Role hanya mendapat CONNECT ke target dan DDL pada dua schema miliknya.
  PUBLIC tidak mendapat CONNECT/CREATE/TEMP pada database integration.
- Katalog dan role terpisah dari cluster utama 5432. Jangan mengubah privilege,
  konfigurasi atau service cluster utama. Pada instance test, HBA harus membatasi
  migrator ke pasangan database/role masing-masing; PUBLIC CONNECT pada maintenance
  database tidak boleh dianggap sebagai isolasi role yang lengkap.

Harness mewajibkan password khusus dan port eksplisit `5433` pada URL; URL tanpa
port ditolak agar `PGPORT` tidak dapat mengalihkan koneksi. `PGOPTIONS` dan
`PGREPLICATION` yang tidak kosong ditolak sebelum client dibuat. Guard tidak
mengubah environment proses untuk menimpa pengaturan tersebut. Validasi target
tetap berlaku saat helper koneksi dipanggil langsung. Tidak membaca `.env`/credential
file. Guard memeriksa database, current_user, session_user, ownership kedua schema,
owner database `nutrasa_it_admin`, alamat/port server, versi 18, cluster name,
marker dan privilege role sebelum tindakan mutatif. CLI normal tetap memakai
allowlist dev/test dan port 5432, dengan direktori domain tetap, tanpa override.
Cluster name adalah marker operasional tambahan, bukan identitas kriptografis.
Pada eksekusi yang disetujui, preflight eksternal juga memeriksa proses/listener,
data directory dan system identifier `7697229180258678980` terhadap control data.
Pemeriksaan system identifier ini bukan fitur otomatis guard TypeScript.

## Instance test khusus dan approval gates

Target setup: `D:\Rajendra\NUTRASA-Postgres-IT\data`, terpisah dari data directory
service utama. Gunakan binary PostgreSQL 18 yang sudah tersedia, SCRAM-SHA-256,
administrator dan password khusus, ACL direktori terbatas, serta startup manual.
Jangan memakai credential utama, trust authentication, fallback port atau Windows
service tambahan. Setup dan authenticated verification telah PASS pada PostgreSQL
18.6, endpoint `127.0.0.1:5433`, administrator `nutrasa_it_admin`, cluster
`nutrasa_it_pg18`, UTF8 dan system identifier di atas. HBA setelah recovery
memiliki 11 aturan valid tanpa parsing error; migrator hanya diizinkan ke pasangan
database/role masing-masing pada `127.0.0.1/32` dengan SCRAM. Cluster utama 5432
tidak diakses atau diubah dalam rangkaian testing ini.

Approval terpisah diperlukan sebelum: (1) membuat direktori/ACL, initdb,
konfigurasi dan startup; (2) provisioning dua database/role; (3) eksekusi kedua
suite; (4) cleanup atau penghentian instance. Penghapusan seluruh data directory
memerlukan keputusan terpisah. Sebelum provisioning, verifikasi versi, port,
cluster name, data directory, administrator dan system identifier aktual.
Jangan mengarang system identifier atau menjalankan bootstrap ledger manual.

## Provisioning manual untuk review

Dari `backend/`, setelah instance diverifikasi dan provisioning disetujui terpisah,
gunakan hanya administrator `nutrasa_it_admin` pada maintenance database `postgres`:
Sebelum psql, tolak environment nonkosong `PGOPTIONS`, `PGREPLICATION`,
`PGHOSTADDR`, `PGSERVICE` atau `PGSERVICEFILE` tanpa mencetak nilainya; jangan
menghapus atau menimpa setting tersebut diam-diam. Gunakan path binary absolut
bila psql tidak tersedia di PATH. Setiap pesan STOP berarti hentikan workflow,
meskipun exit code psql tidak menunjukkan kegagalan.

```powershell
psql -X -h 127.0.0.1 -p 5433 -U nutrasa_it_admin -d postgres -W -v ON_ERROR_STOP=1 -f tests/integration/provision.sql
```

Masukkan ID baru saat diminta, misalnya hasil `(New-Guid).ToString('N')`.
Nama target M03-01B.2 di tabel hasil sudah digunakan dan tidak boleh diprovisioning
ulang. Untuk eksekusi lain yang disetujui, ketersediaan database dan role
`<database>_migrator` wajib diperiksa read-only pada cluster yang diverifikasi
sebelum provisioning; nama kandidat bukan bukti bahwa target belum ada.
Script menolak database/role yang sudah ada, membuat role NOLOGIN dan database
template0, lalu schema, search_path, default privileges dan marker. Password SCRAM
diisi lewat `\password`; LOGIN diaktifkan setelah konfirmasi nama role.

Jangan bootstrap ledger manual: checkpoint pertama harness memerlukan schema kosong.
Jika provisioning berhenti di tengah, STOP dan review objek parsial. Jangan mengulang
atau menghapus objek otomatis. NOLOGIN membatasi akses sebelum provisioning selesai.

Verifikasi login terpisah tanpa password pada command (ganti ID pada kedua nama):

```powershell
psql -X -h 127.0.0.1 -p 5433 -U nutrasa_it_ID_migrator -d nutrasa_it_ID -W
```

Query read-only:

```sql
SELECT current_database(), current_user, session_user, inet_server_addr(), inet_server_port();
SELECT current_setting('server_version_num'), current_setting('cluster_name');
SELECT nspname, pg_get_userbyid(nspowner) AS owner
FROM pg_catalog.pg_namespace WHERE nspname IN ('nutrasa', 'nutrasa_migrations');
SELECT datname, pg_get_userbyid(datdba) AS owner,
       shobj_description(oid, 'pg_database') AS marker,
       has_database_privilege(current_user, oid, 'CONNECT') AS can_connect,
       has_database_privilege(current_user, oid, 'CREATE') AS can_create,
       has_database_privilege(current_user, oid, 'TEMP') AS can_temp
FROM pg_catalog.pg_database WHERE datname = current_database();
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls
FROM pg_catalog.pg_roles WHERE rolname = current_user;
```

Expected: port 5433, versi 18, cluster name `nutrasa_it_pg18`, owner database
`nutrasa_it_admin`; identitas khusus sesuai; schema owned oleh migrator; CONNECT true,
CREATE/TEMP false, semua flag role false. Kedua schema belum memiliki tabel.
Jangan membaca pg_authid/rolpassword.

## Menjalankan tests setelah persetujuan

`npm test` tetap unit-only. Suite engine memakai `npm run test:integration`;
suite identity memakai `npm run test:integration:identity`. Keduanya memakai
guard dan setup harness yang sama, tetapi **wajib target database baru terpisah**:
baseline immutable `0001_probe` dan `0001_identity` tidak dapat dipertukarkan.
Preflight harus memastikan schema fresh dan metadata belum ada. Penolakan
`schemas_empty` pada target yang sudah digunakan adalah STOP yang benar, bukan
alasan menghapus objek atau melemahkan guard. Jangan reuse, reset, reprovisioning,
retry atau cleanup tanpa keputusan pemilik. Jangan menjalankan ulang suite yang
sudah PASS. Blok berikut hanya referensi untuk eksekusi baru setelah approval;
set environment pada sesi lokal tanpa credential literal pada history:

```powershell
$itRunId = Read-Host 'ID integration yang telah diprovision'
$itDatabase = 'nutrasa_it_' + $itRunId
$itRole = $itDatabase + '_migrator'
$itPassword = Read-Host 'Password role integration khusus' -AsSecureString
try {
  $itEncodedPassword = [Uri]::EscapeDataString([Net.NetworkCredential]::new('', $itPassword).Password)
  $env:NUTRASA_IT_CONFIRM_DATABASE = $itDatabase
  $env:NUTRASA_IT_DATABASE_URL = 'postgresql://{0}:{1}@127.0.0.1:5433/{2}' -f $itRole, $itEncodedPassword, $itDatabase
  npm run test:integration
} finally {
  $itPassword.Dispose()
  Remove-Item Env:NUTRASA_IT_DATABASE_URL, Env:NUTRASA_IT_CONFIRM_DATABASE -ErrorAction SilentlyContinue
  Remove-Variable itEncodedPassword, itPassword -ErrorAction SilentlyContinue
}
```

Jangan mencetak environment/URL, memakai transcript yang menangkap credential,
atau memakai credential role utama. Worker hanya menerima environment integration
khusus dan SystemRoot; IPC tidak memuat SQL error atau credential.

## Skenario pengujian

Satu lifecycle test menjalankan checkpoint eksplisit. Satu kegagalan menghentikan
checkpoint berikutnya; tidak bergantung pada urutan discovery test Node.

1. Bootstrap kosong memakai deklarasi tabel pada SQL produksi yang direview.
   Guard SQL produksi tetap utuh; harness menambahkan guard integration sebelum
   transaksi bootstrap, tanpa menduplikasi definisi constraint.
2. UP: DDL/data/histori/checksum commit dan lock dilepas.
3. Failure: migration kedua membuat tabel/row lalu gagal. Perubahannya rollback;
   state sukses sebelumnya tetap ada.
4. DOWN: tabel/histori hilang, baseline checksum tetap.
5. UP identik setelah DOWN berhasil.
6. File historis berubah: pending DDL tidak dijalankan.
7. File historis hilang: pending DDL tidak dijalankan.
8. Histori tanpa ledger: ditolak. Injeksi korupsi/restorasi hanya pada target
   sementara, dengan guard identitas dan advisory lock.
9. Concurrency: observer memegang barrier lock terpisah. Proses pertama harus
   terbukti menunggu barrier di pg_locks, lalu proses kedua ditolak karena lock
   migration. Setelah barrier dilepas, proses pertama diselesaikan. Polling
   dibatasi timeout; tidak memakai sleep untuk menebak acquisition.
10. Recovery re-run tidak menggandakan histori/ledger. Lock diperiksa oleh koneksi
    observer saat koneksi runner masih hidup, setelah sukses maupun gagal.

Fixture di tests/integration/fixtures disalin ke workspace OS temporary dengan
marker run ID. Runner normal tidak menemukan fixture. Workspace dibersihkan setelah
verifikasi path. Database/role/schema/ledger tidak dibersihkan otomatis. Eksekusi ulang
memerlukan target baru karena baseline immutable tersisa. Jika proses dihentikan
paksa, workspace OS temporary mungkin perlu dibersihkan manual setelah review.

## Identity suite M03-01B.1 — diverifikasi pada M03-01B.2

Suite `npm run test:integration:identity` telah PASS pada target identity final
di tabel hasil. Untuk eksekusi baru, approval dan target fresh tetap diperlukan.
Jangan bootstrap ledger manual atau memakai kembali target suite engine/identity.

Suite memakai byte `backend/migrations/0001_identity.sql` melalui core yang sama.
Empat belas checkpoint memeriksa struktur/tipe/nullability/default/key/index,
UID case-sensitive dan nonblank, enum, FK, nilai numerik/date khusus, target berat
kondisional, revision, preferensi, acknowledgement, CASCADE/RESTRICT serta UP/DOWN/UP.
Test NUMERIC secara eksplisit menunjukkan coercion skala; penolakan presisi input
asli tetap pekerjaan backend berikutnya. Data hanya sintetis, tanpa aktivasi target.
DOWN juga harus mempertahankan sentinel non-domain dan metadata/history/checksum
sesuai lifecycle engine. Test tidak mengubah metadata secara manual.

Setup/bootstrap dan pemeriksaan lock yang sebelumnya inline pada suite engine
dipakai bersama melalui `harness.ts`. CLI normal tetap di 5432; guard integration
kini membatasi instance khusus 5433 dengan versi, cluster name dan owner yang sesuai.
Kedua suite yang PASS memakai harness bersama ini pada instance khusus 5433.

Scope mutasi pada target sementara: bootstrap ledger, tabel histori engine,
empat tabel identity, satu sentinel pengujian, data sintetis dan lifecycle UP/DOWN/UP.
Target/role tidak dibuat atau dihapus oleh harness; cleanup tetap manual setelah review.
Pengujian runtime app-role belum disiapkan: provisioning saat ini hanya memiliki
migrator khusus. Role integration aplikasi dan privilege minimumnya memerlukan
persetujuan provisioning terpisah; jangan memakai role aplikasi dev/test utama.
Clinical/legal approval, Firebase authorization dan crash recovery saat commit
tidak dibuktikan oleh suite struktural ini.

## Food sources M03-01

Command terpisah dari `backend/`: `npm.cmd run test:integration:food-sources`.
Script ini tidak dipanggil oleh `npm test`, suite identity atau suite engine.
Hasil aktual pemilik proyek: **13/13 PASS, 0 fail, 0 skipped, exit code 0**
(12 checkpoint dan satu parent test), disertai `FOOD SOURCES FINAL STATE PASS`.
Approval gabungan provisioning dan satu kali pengujian sudah diberikan dan
eksekusi selesai. Jangan menjalankan ulang suite pada target yang sudah dipakai.
Keempat target bukti M03-01B.2 tetap dipertahankan; target food_sources kelima
juga dipertahankan. Eksekusi baru memerlukan target fresh dan approval baru.
Instance yang diuji: PostgreSQL 18.6 pada `127.0.0.1:5433`, cluster `nutrasa_it_pg18`,
system identifier `7697229180258678980`. HBA ditambah tepat satu aturan pasangan
baru, 11 aturan lama dipertahankan; reload tanpa restart dan verifikasi administrator
menunjukkan 12 aturan valid, 0 parsing error, serta reload teramati.
Identitas cluster/system identifier, ketersediaan nama, HBA pasangan target,
ownership/marker/privilege/search_path/default privileges dan schema kosong wajib
diverifikasi sebelum mutasi; system identifier tetap diperiksa lewat preflight
eksternal seperti workflow sebelumnya, bukan diklaim sebagai fitur otomatis harness.

Suite menyalin byte aktual `0001_identity.sql` dan `0002_food_sources.sql` ke
workspace harness existing. Setelah bootstrap kosong, identity diterapkan dan
empat tabelnya diisi fixture sintetis. Ini setup upgrade, bukan menjalankan ulang
suite identity yang sudah PASS. Tidak ada food/nutrient seed atau sumber nyata;
status ALLOWED pada fixture tidak memberi izin legal atas sumber mana pun.

Dua belas checkpoint yang telah PASS:

1. Bootstrap fresh, identity dan empat row storage sintetis.
2. Setelah DDL food_sources, fixture `0003_failure.sql` memicu division by zero:
   batch harus rollback, food_sources tidak tersisa, history/checksum tetap identity.
3. Upgrade aktual 0002 berhasil dengan history/checksum matching.
4. Tepat delapan kolom, tipe/nullability sesuai kontrak, hanya default UUID.
5. Hanya PK id dan indeks pendukungnya; tanpa FK, UNIQUE tambahan atau trigger.
6. UUID default berbeda, PK duplikat/NULL ditolak, kolom opsional tetap NULL.
7. NULL kolom wajib dan empty/whitespace-only pada lima kolom teks ditolak.
8. Teks tidak di-trim, source_type bebas nonblank, referensi bibliografis non-URL,
   serta timestamp finite disimpan sebagai instant yang benar.
9. Empat status izin diterima tepat; status lain/NULL/omitted ditolak.
10. Kedua infinity timestamp ditolak; identity dan metadata tetap konsisten.
11. DOWN satu langkah hanya menghapus food_sources; row, OID, kolom/default dan
    constraint identity tetap sama; baseline checksum 0002 tetap dipertahankan.
12. UP identik memulihkan tabel kosong; re-run tidak menggandakan history/checksum
    dan lock dapat diperoleh koneksi observer saat koneksi runner masih terbuka.

Fixture failure hanya berada di `tests/integration/fixtures/food-sources/`, tidak
ditemukan CLI domain. Kegagalan checkpoint menghentikan suite tanpa retry/reset
atau cleanup database otomatis. Kegagalan SQL yang sengaja diuji pada checkpoint 2
adalah assertion rollback, bukan izin mengulang suite yang gagal.
Kondisi akhir berdasarkan verifikasi read-only terminal pemilik proyek:

- Database `nutrasa_it_1451d777bc364abf928bf93c278e3f96`, role
  `nutrasa_it_1451d777bc364abf928bf93c278e3f96_migrator`.
- Tepat lima tabel aplikasi: `app_users`, `food_sources`,
  `privacy_acknowledgements`, `user_preferences`, `user_profiles`.
- food_sources kosong setelah DOWN/UP; empat tabel identity masing-masing satu
  row storage sintetis. Preservasi OID, definisi kolom/default, constraint serta
  data identity diperiksa oleh suite saat upgrade, failure rollback dan DOWN/UP.
- History `0001_identity`, `0002_food_sources`; dua baseline SHA-256 cocok dengan
  file aktual. Tidak ada history/checksum `0003_failure` yang tertinggal.
- Tidak ada seed makanan/nutrisi, reset, cleanup atau pengujian ulang suite lama.

Constraint dan lifecycle food_sources telah terbukti pada target PostgreSQL ini;
final review tidak menjalankan ulang SQL atau integration tests.
Runtime app-role privileges, editorial authorization, kontrak traceability lain,
hak data sumber, publikasi, dan crash recovery saat commit tetap OPEN.
Ini menyelesaikan subtask migration food_sources, bukan seluruh M03-01.

## Food catalog M03-01

Pemilik menyetujui penulisan migration dan persiapan tests, kemudian satu approval
gabungan untuk preflight, HBA, provisioning dan satu integration invocation. Kontrak final ada pada
[schema fisik katalog](../../../docs/02-architecture/postgres-physical-schema-v1.5.md#kontrak-katalog-struktural-m03-01).
Migration aktual `backend/migrations/0003_food_catalog.sql` memakai core/loader
existing: foods (9 kolom), food_revisions (10), food_revision_nutrients (3),
empat FK RESTRICT/NOT DEFERRABLE, pointer gabungan MATCH SIMPLE dan enam indeks
minimum. Unit tests memuat up/down dengan builder publik, menguji checksum/file
hilang/urutan histori dan menjaga hash 0001/0002. Bukti unit dan PostgreSQL dibedakan di bawah.
Verifikasi persiapan tanpa database: backend typecheck/lint PASS, unit tests
**52/52 PASS, 0 fail, 0 skipped, exit code 0**; mobile typecheck/lint PASS.

**Hasil aktual 17 Oktober 2026, berdasarkan terminal pemilik proyek:** PostgreSQL
integration **18/18 PASS, 0 fail, 0 skipped, exit code 0** (17 checkpoint dan satu
parent test); `FOOD CATALOG FRESH PREFLIGHT PASS` dan `FOOD CATALOG FINAL STATE PASS`.
Tidak ada retry. Perintah satu kali yang telah dijalankan dari `backend/` adalah:

```powershell
npm.cmd run test:integration:food-catalog
```

Jangan mengulang perintah pada target yang sudah digunakan. Suite terpisah dan
tidak dijalankan oleh `npm test`; eksekusi berikutnya memerlukan approval baru dan
target fresh. Gunakan environment
`NUTRASA_IT_DATABASE_URL` dan `NUTRASA_IT_CONFIRM_DATABASE` sesuai guard existing;
password hanya melalui prompt lokal aman, tidak dikirim ke chat atau disimpan ke
file/repository/log. Jangan membaca .env. Identitas cluster/system identifier
diverifikasi pada preflight administrator; jangan menganggap pemeriksaan system
identifier sudah otomatis dilakukan guard TypeScript.

Tujuh belas checkpoint lulus: fresh bootstrap + 0001/0002 dengan satu row
sintetis pada masing-masing empat tabel identity dan registry sumber; injeksi
failure setelah DDL 0003; UP aktual; metadata kolom/default; PK/UQ/empat FK;
enam indeks/18 CHECK/tanpa user trigger; UUID/NULL/nama duplikat/kolom wajib;
whitespace dan teks tidak di-trim; referensi invalid/nomor revisi duplikat;
pointer lintas makanan; lima status makanan; tiga status revisi dan waktu finite;
basis/unit/precision; 11 kode nutrisi/NULL/nol/NaN; RESTRICT UPDATE/DELETE;
DOWN; UP identik dan re-run. Array nama kolom metadata memakai `attname::text`.
RESTRICT parent memakai SQLSTATE 23001, child invalid 23503; infinity/overflow
NUMERIC(14,5) ditolak tipe (22003), bukan disamakan dengan CHECK (23514).

Preservasi mencakup OID, owner, definisi kolom/default, constraint, indeks dan
seluruh data sintetis identity/food_sources. Failure fixture hanya pada
`fixtures/food-catalog/0004_failure.sql`, bukan direktori domain. Failure yang
disengaja terbukti me-rollback tiga tabel, histori dan baseline batch; kegagalan
assertion menghentikan suite tanpa retry/cleanup database. DOWN hanya melepas
pointer dan tiga tabel katalog, tanpa CASCADE; baseline checksum tetap dipertahankan.

**Target dan hasil verifikasi aktual:**

- Database `nutrasa_it_088c02bb1b884ba794ce8cab56d14603`, role
  `nutrasa_it_088c02bb1b884ba794ce8cab56d14603_migrator`.
- PostgreSQL 18.6, `127.0.0.1:5433`, cluster `nutrasa_it_pg18`, data directory
  `D:/Rajendra/NUTRASA-Postgres-IT/data`, system identifier `7697229180258678980`.
  Administrator, identitas dan ketersediaan nama telah diverifikasi read-only
  sebelum mutasi. Guard migrator memverifikasi database/current_user/session_user,
  marker, ownership/privilege; pemeriksaan system identifier tetap preflight admin.
- Tepat satu aturan host pasangan target pada 127.0.0.1/32 SCRAM ditambahkan sebelum
  reject umum; 12 aturan lama dipertahankan identik. Reload terverifikasi pada
  `2026-10-17T00:28:16.440519+07:00`; 13 aturan valid, 0 parsing error.
- Provisioning existing selesai dengan exit 0; login migrator, schema privileges,
  default privileges, public schema restriction, search_path dan CONNECT PASS.
  Preflight READ ONLY membuktikan dua schema kosong, tanpa history/ledger atau
  sesi lain, dan default transaksi tetap writable untuk suite yang diizinkan.
- Final state: delapan tabel aplikasi, yaitu app_users, food_revision_nutrients,
  food_revisions, food_sources, foods, privacy_acknowledgements, user_preferences,
  user_profiles. Ketiga tabel katalog kosong setelah DOWN/UP; lima tabel terdahulu
  masing-masing satu row sintetis. Bukan data makanan atau pengguna nyata.
- History tepat `0001_identity`, `0002_food_sources`, `0003_food_catalog`;
  tiga baseline SHA-256 cocok dengan file aktual, tanpa baseline/history failure
  fixture. SHA-256 0003:
  `24c93dd8ed1985e0326460dbca7645d819d7458b36b82ed175c988d70c3f6888`.

Hasil identity 15/15, engine 11/11 dan food_sources 13/13 terdahulu tidak diulang.
Kelima target lama tidak diakses langsung atau diubah; target katalog baru juga
dipertahankan setelah testing. Tidak ada penerapan pada nutrasa_dev/nutrasa_test,
akses cluster utama 5432, cleanup/reset, atau Git mutation. Finalisasi hanya
menjalankan pemeriksaan non-database dan memperbarui bukti dokumentasi.
Jangan reuse, mengulang suite, membuat target pengganti atau cleanup tanpa approval.

Enforcement immutable, pointer menuju revisi PUBLISHED, kelengkapan/review
lintas tabel, authorization, runtime grants, hak sumber dan provenance campuran
tetap OPEN. Tidak ada endpoint/fitur publikasi, seed atau import makanan nyata.
Source locator/riwayat izin, vocabulary operasional, normalisasi, audit editorial
dan crash recovery saat commit juga OPEN. Ini fondasi struktural, bukan seluruh M03-01.

<a id="katalog-lanjutan-m03-01--disiapkan-belum-dijalankan"></a>

## Katalog lanjutan M03-01

Migration `0004_food_taxonomy.sql` dan `0005_food_servings_provenance.sql` serta
`catalog-foundation.integration.ts` telah ditulis berdasarkan
[kontrak fisik yang disetujui](../../../docs/02-architecture/postgres-physical-schema-v1.5.md#kontrak-katalog-lanjutan-m03-01).
**PASS — output terminal pemilik proyek pada 17 Oktober 2026:** satu invocation
suite gabungan menghasilkan **24/24 PASS, 0 fail/cancelled/skipped/todo, exit code 0**
dan `CATALOG FOUNDATION FINAL STATE PASS`. Terdapat satu checkpoint bootstrap,
11 checkpoint taxonomy, 11 checkpoint servings/provenance dan satu parent test;
bukan dua eksekusi suite mandiri. Bukti identity/engine/food_sources/0003 di atas
tetap dipertahankan; suite lama tidak dijalankan ulang.

Verifikasi non-database pada implementasi ini: backend typecheck/lint dan unit
tests **58/58 PASS, 0 fail/skip**; mobile typecheck/lint PASS. Enam unit tests baru
memeriksa discovery lima file, hash historis, isolasi fixture, loader publik,
aksi UP/DOWN/checksum transaksional dan penolakan file historis berubah/hilang.
Unit tests tersebut menguji perilaku tanpa database. Bukti constraint, rollback
dan lifecycle PostgreSQL berasal dari output suite gabungan berikut.

Command yang telah dijalankan pemilik setelah approval gabungan dan fresh preflight,
dari backend dengan environment target disposable terverifikasi:

```powershell
npm.cmd run test:integration:catalog-foundation
```

Jangan menjalankan command ulang pada target ini. Suite telah mengeksekusi
**23 checkpoint dan satu parent test (24 test)**, fail-fast melalui scenario
harness existing. Setiap checkpoint gagal menghentikan urutan berikutnya; tidak
ada retry atau recovery database otomatis.

- Satu invocation memakai **satu database fresh**, migrator khusus dan bootstrap
  ledger sekali; menerapkan SQL aktual 0001-0003 lalu data sintetis DRAFT/UNVERIFIED.
- Tahap taxonomy: failure sesudah DDL aktual 0004, UP, metadata 6/3/5 kolom,
  PK/UQ/empat FK RESTRICT, delapan indeks, tujuh CHECK dan tanpa user trigger;
  NULL/whitespace, slug/self-parent, primary category, alias lintas makanan;
  DOWN/UP identik dan re-run dengan baseline checksum dipertahankan.
- Tahap servings/provenance meneruskan target yang sama dengan taxonomy terisi:
  failure sesudah ALTER/DDL aktual 0005, UP, sepuluh kolom porsi dan dua kolom
  nullable tambahan revisi, PK/dua FK RESTRICT/dua indeks/sembilan CHECK baru;
  pasangan provenance, bukti wajib, numeric/NaN/infinity/overflow/scale coercion,
  JOIN unit g/ml dan sumber bukti berbeda; DOWN/UP identik dan re-run.
- Kasus perilaku DML menggunakan transaksi yang di-rollback dan savepoint untuk
  expected errors, sehingga baseline domain terdahulu tidak berubah. Failure
  injection DDL tetap memakai transaksi runner sebenarnya. Periksa metadata
  array sebagai text[] dan NUMERIC sebagai decimal string, RESTRICT 23001 serta
  child FK invalid 23503; assertion tidak dilonggarkan.
- Fixture failure 0005/0006 hanya berada di `tests/integration/fixtures/food-taxonomy`
  dan `food-servings`, disalin ke workspace sementara oleh harness. CLI domain
  tidak menemukan fixture. Tidak ada salinan DDL katalog alternatif.

Guard tidak dilemahkan: database nutrasa_it_<32hex>, role pasangan, password
khusus, port 5433 eksplisit, endpoint loopback, PG18/cluster/owner/marker,
session_user/current_user dan ownership schema; PGOPTIONS/PGREPLICATION ditolak.
Preflight administrator sebelum provisioning/tes tetap memverifikasi system
identifier `7697229180258678980`, data directory dan identitas target serta
ketersediaan nama. System identifier bukan pemeriksaan yang diklaim dilakukan
oleh migrator non-superuser. URL eksplisit mencegah fallback PGPORT; connection
override tidak disetujui harus ditolak pada prosedur lokal.

Kondisi akhir **PASS berdasarkan output final-state pemilik proyek**: 12 tabel aplikasi;
empat tabel identity masing-masing satu row, satu sumber sintetis, dua foods,
dua revisions, dua nutrient rows (nol dan NULL berbeda), satu category/link/alias
yang dipertahankan, serving_definitions kosong setelah DOWN/UP. Revisi memiliki
12 kolom dan kedua provenance kembali NULL; history tepat 0001-0005, lima baseline
checksum cocok, tidak ada metadata fixture failure. Tahap 0005 mempertahankan
OID/owner/metadata/data baseline kecuali dua kolom/tiga CHECK yang memang disetujui,
serta menjaga taxonomy yang sudah terisi.

Provisioning tetap melalui `provision.sql` existing, bukan harness. Hanya satu
target baru diperlukan untuk invocation gabungan; bukan reuse target dari suite
lain atau alasan mengulang test gagal. Tidak ada bootstrap manual tambahan,
cleanup, perubahan pada enam target lama atau akses port 5432. Jika preflight,
provisioning atau suite gagal, STOP dan pertahankan bukti tanpa retry/reset/DROP.
Keputusan penghapusan memerlukan approval terpisah.

Target yang telah diprovisioning sekali dan diuji dengan approval gabungan:

- Run ID: `49e23e0805ba43fda3f5078a57d28a10`.
- Database: `nutrasa_it_49e23e0805ba43fda3f5078a57d28a10`.
- Migrator: `nutrasa_it_49e23e0805ba43fda3f5078a57d28a10_migrator`.
- Hanya cluster testing `nutrasa_it_pg18`, PG18, endpoint `127.0.0.1:5433`,
  data directory `D:/Rajendra/NUTRASA-Postgres-IT/data`, system identifier
  `7697229180258678980`, administrator `nutrasa_it_admin`.

Aturan HBA pasangan target yang telah ditambahkan sebelum reject umum:

```text
host nutrasa_it_49e23e0805ba43fda3f5078a57d28a10 nutrasa_it_49e23e0805ba43fda3f5078a57d28a10_migrator 127.0.0.1/32 scram-sha-256
```

Preflight administrator mengonfirmasi PostgreSQL 18.6, identitas cluster/system
identifier dan ketersediaan nama. Tepat satu aturan ditambahkan, mempertahankan
13 aturan lama; hanya cluster testing di-reload. Pemeriksaan setelah reload dan
sebelum provisioning mempersyaratkan 14 aturan valid, 0 error dan reload teramati;
blok lokal pemilik selesai hingga provisioning tanpa STOP. Provisioning melalui
script existing selesai dengan `ALTER ROLE`, tanpa bootstrap ledger manual.
Prosedur yang dipakai, untuk referensi (jangan jalankan ulang):

```powershell
psql -X -h 127.0.0.1 -p 5433 -U nutrasa_it_admin -d postgres -W -v ON_ERROR_STOP=1 -f tests/integration/provision.sql
```

Untuk eksekusi baru yang disetujui kelak, masukkan run ID pada prompt khusus,
bukan melalui pipeline bersama blok PowerShell/psql. Password administrator dan
migrator hanya melalui prompt lokal interaktif, tidak di chat/argument/file/log.
Script membentuk role NOLOGIN tanpa privilege global/membership, database owned
administrator, hanya CONNECT untuk migrator, tanpa CREATE/TEMP database atau
hak PUBLIC. Migrator memiliki kedua schema untuk DDL/metadata tests; search_path
pg_catalog,nutrasa dan default privileges PUBLIC direvoke sesuai script existing.
LOGIN baru aktif setelah pengaturan password SCRAM dikonfirmasi.

`CATALOG FOUNDATION FRESH PREFLIGHT PASS` mengonfirmasi login migrator,
session_user/current_user, loopback:5433, read-only preflight dan runtime writable,
search_path, CONNECT, schema privileges, pembatasan PUBLIC pada schema/database,
default privileges, schema kosong dan ketiadaan sesi lain. Guard harness memeriksa
marker serta ownership sebelum mutasi. Environment
NUTRASA_IT_DATABASE_URL/NUTRASA_IT_CONFIRM_DATABASE menunjuk eksplisit target ini.
Setelah preflight, suite dijalankan tepat sekali. Tidak ada rerun PostgreSQL pada
final review dokumentasi, akses port 5432, reuse, reset atau cleanup.

Final state merekam history `0001_identity`, `0002_food_sources`,
`0003_food_catalog`, `0004_food_taxonomy`, `0005_food_servings_provenance` dan
**lima checksum baseline**. `energy_kcal` tetap `0.00000`, `sugar_g` tetap NULL.
Hash SHA-256 SQL yang diuji:

- 0004: `d5386fc815162402bb57048858dc16ba2f067237b7a241df25ce0f028f8d3542`.
- 0005: `1b5e8bb150b9102236bd98e2aa21e1625a5bb3f5de8d6942778ba3c919065218`.

Target baru dan enam target lama tetap dipertahankan: **tujuh database disposable**.
Tidak ada klaim pemeriksaan ulang isi enam target lama pada final review ini.

Siklus kategori lintas baris, immutability, publication gate/review nutrisi,
authorization/identitas reviewer, runtime app privileges, licensing evidence,
catalog_reviews/import_batches, concurrency editorial dan crash recovery saat
commit tetap OPEN. Pemeriksaan self-parent bukan bukti hierarki bebas siklus;
reviewed/status/locator bukan legal clearance. Tidak ada seed makanan nyata,
normalizer, endpoint editorial atau publikasi baru. **M03-01 belum DONE.**

## Catalog audit foundation M03-01

**POSTGRESQL INTEGRATION PASS - 2026-10-17.** Owner-provided terminal output
confirms **16/16 PASS, 0 fail, 0 skipped, exit code 0**, including final state PASS.
This is the one approved invocation for 0006, not a rerun of an older suite. The suite uses the existing harness, guard, core, public loader,
transaction/checksum and advisory lock; fixture
`fixtures/catalog-audit/0007_failure.sql` stays outside domain discovery.

One fresh-target invocation passed 15 fail-fast checkpoints plus a parent:
actual 0001-0005 baseline with protected synthetic rows; failure after audit DDL;
UP; exact 21/13/3 columns plus revision link; PK/UQ/nine RESTRICT FKs; thirteen
B-tree indexes/37 CHECKs/no user triggers or governance functions; target/decision/
evidence/scope/hash/date validation; identity sequence; matching review-source,
batch-source and revision-batch FKs; batch outcomes; empty DOWN; identical UP/re-run;
populated DOWN refusal retaining evidence. Migrator UPDATE is demonstrated inside
a rolled-back scenario: DDL does not implement operational append-only/authorization.
The suite finishes with one synthetic REJECTED source audit, not legal clearance.

Guarded DOWN locks tables before checking data and refuses with division-by-zero
(22012) on populated audit. Concurrent DOWN writers and crash recovery at commit
are not claimed tested; runtime-role security remains OPEN.
DOWN requires READ COMMITTED and refuses other isolation levels; authenticated
preflight for a future run must confirm the configured default as well.

Approved target provisioned once and verified fresh before execution:

- Run ID: `283df900c3dc4107b5e0c9aeaacbf2c4`.
- Database: `nutrasa_it_283df900c3dc4107b5e0c9aeaacbf2c4`.
- Migrator: `nutrasa_it_283df900c3dc4107b5e0c9aeaacbf2c4_migrator`.
- PostgreSQL 18 testing only, `127.0.0.1:5433`, cluster `nutrasa_it_pg18`,
  system identifier `7697229180258678980`,
  data directory `D:/Rajendra/NUTRASA-Postgres-IT/data`.

Combined approval was fulfilled: authenticated preflight confirmed cluster identity,
unused names and all seven older targets present. One HBA SCRAM rule was added,
preserving the 14 old rules; reload verification returned 15 valid rules, zero
errors and reload_observed=true. Provisioning returned exit 0. Fresh migrator
verification passed marker/ownership/privileges, empty schemas, READ COMMITTED
and no other sessions before the one approved invocation. Any future execution
requires fresh-target approval. On failure STOP without reuse/retry/reset/DROP.

Applied HBA rule before general reject; preserve all prior rules:

```text
host nutrasa_it_283df900c3dc4107b5e0c9aeaacbf2c4 nutrasa_it_283df900c3dc4107b5e0c9aeaacbf2c4_migrator 127.0.0.1/32 scram-sha-256
```

For future separately approved targets only: existing provision.sql with local administrator on postgres,
port 5433, one execution. Passwords use local interactive prompts, never command
arguments/chat/files/logs. Reject PGOPTIONS, PGREPLICATION, PGHOSTADDR,
PGSERVICE/PGSERVICEFILE or other unapproved inherited overrides before connecting.
Do not read real .env files. Fresh preflight verifies marker, database/schema owner,
session_user/current_user, server identity, search_path, CONNECT/minimum privileges,
PUBLIC restrictions, defaults, empty schemas/no ledger and no other sessions.
Close psql before tests. The suite bootstraps once; no manual ledger bootstrap.

```powershell
npm.cmd run test:integration:catalog-audit
```

Use explicit NUTRASA_IT_DATABASE_URL/NUTRASA_IT_CONFIRM_DATABASE for this pair only,
credentials entered locally and temporary process environment cleared afterwards.
Administrator preflight proves system identifier; the non-superuser harness does
not claim that check itself. No CLI allowlist bypass, primary port 5432 access,
old-suite rerun or automatic cleanup. Seven existing disposable targets remain
untouched. All eight disposable databases are retained, without cleanup or extra
SQL inspection of the seven older targets during final review.

Final read-only verification reported 15 application tables and preserved synthetic
rows, including one serving and two sources. catalog_reviews contains one synthetic
SOURCE_PERMISSION / REJECTED record, license_status=UNVERIFIED, permission_scope=NULL;
catalog_import_batches and catalog_review_sources are empty. food_revisions has
13 columns and no non-NULL import_batch_id. History contains 0001_identity through
0006_catalog_audit with six matching immutable SHA-256 baselines. energy_kcal=0.00000
remains distinct from sugar_g=NULL. This record is not legal clearance.

Tested 0006 SHA-256:
`c682c41851dd2932e79b66846b696f6ad5d4f8ed8906c77e355f37350ed89961`.
The actual migration passed the scanner; future governance function compatibility,
append-only enforcement, actor/digest runtime, publication, legal/clinical gates,
editorial concurrency and crash recovery at commit remain OPEN. M03-01 not DONE.

## Cleanup manual dan risiko OPEN

Setelah hasil/sisa kegagalan direview dan penghapusan disetujui:

```powershell
psql -X -h 127.0.0.1 -p 5433 -U nutrasa_it_admin -d postgres -W -v ON_ERROR_STOP=1 -f tests/integration/cleanup.sql
```

Script meminta ID dan konfirmasi nama database lengkap. Ia memeriksa marker,
versi/cluster/administrator/port, termasuk setelah reconnect,
ownership database/schema, role dan ketiadaan sesi aktif. Tidak memakai FORCE atau
memutus sesi lain. DROP ROLE ditolak bila ada dependency di tempat lain; STOP dan
review. Jangan memakai DROP OWNED/REASSIGN otomatis. Harness tidak memanggil script.

Hasil PASS yang dikonfirmasi mencakup skenario lifecycle di atas, termasuk
atomicity, rollback, concurrency, pelepasan lock, dan recovery melalui re-run.
Provisioning target dilakukan manual oleh pemilik proyek. Empat target M03-01B.2,
target food_sources dan target food catalog tetap dipertahankan. Bersama target
katalog lanjutan dan catalog-audit di atas, delapan target tidak di-cleanup pada finalisasi ini.
Harness tidak melakukan cleanup database otomatis. Jangan menjalankan prosedur
cleanup atau menghentikan instance tanpa approval terpisah.

OPEN: crash/kill atau putus koneksi saat commit belum diuji. Pengujian kegagalan
transaksi dan re-run bukan jaminan crash recovery menyeluruh. Hasil pada lingkungan
yang diuji tidak otomatis membuktikan seluruh kondisi, versi, atau konfigurasi lain.

## Catalog digest v1 M03-01

**POSTGRESQL INTEGRATION PASS - 2026-10-18.** Owner-provided terminal output
confirms **15/15 PASS, 0 fail, 0 skipped, exit code 0**, including
CATALOG DIGEST FINAL STATE PASS. One approved invocation passed all 14 checkpoints
plus its parent. All six frozen JSONB text/UTF-8 SHA-256 vectors matched PostgreSQL
18.6 exactly; neither expected bytes nor hashes were revised after execution.
Unit hash checks remain separate from this real PostgreSQL evidence.

The suite bootstraps one fresh target, applies actual 0001-0006 and synthetic
source/revision/prior REJECTED event data, then tests 0007 failure rollback, exact
three INVOKER functions and ACL, fixed vectors, UTC/DateStyle/Unicode behavior,
NULL versus zero versus missing rows, independent serving sources/order, invalid
source coverage, meaningful versus excluded changes, READ ONLY calls and preserved
domains. DOWN removes helpers only; UP/re-run retains immutable checksum history.
No actor authorization, append-only, operational role grants, publication gate or
concurrent editorial safety is established. Migrator updates in rolled-back tests
explicitly demonstrate that this calculation package does not enforce immutability.

Future separately approved execution from backend:

```powershell
npm.cmd run test:integration:catalog-digest
```

Do not run on any of the nine retained disposable targets or permanent databases.
Use one new nutrasa_it_<32 lowercase hex> database and matching dedicated migrator
on 127.0.0.1:5433, cluster nutrasa_it_pg18, system identifier 7697229180258678980.
One combined owner approval is required for the exact target, one pair-specific
HBA SCRAM rule/reload, existing manual provisioning, authenticated admin/fresh
migrator preflight and one test invocation. Recheck unused names, prior targets,
marker, ownership, PUBLIC/default privileges, no sessions/objects, environment
overrides and approved file hashes. Passwords remain local interactive input.
No manual ledger bootstrap, automatic retry, reset or cleanup. On any failure STOP
and preserve the target; no fallback to port 5432. Crash recovery at commit stays OPEN.


Execution evidence for the approved target:

- Database: `nutrasa_it_fe30b453570e472daf0e35ff4d251748`.
- Migrator: `nutrasa_it_fe30b453570e472daf0e35ff4d251748_migrator`.
- PostgreSQL 18.6, cluster `nutrasa_it_pg18`, system identifier
  `7697229180258678980`, data directory `D:/Rajendra/NUTRASA-Postgres-IT/data`.
- Existing test cluster started once, pg_ctl exit 0, loopback listener verified.
  Normal startup WAL recovery completed after a previous interrupted shutdown;
  this is not a controlled crash-at-commit integration test or its sign-off.
- Authenticated preflight confirmed unused target names and all eight older
  databases/roles present. One exact HBA SCRAM rule was added, preserving 15 prior
  rules; owner confirmed 16 valid rules and zero errors after reload verification.
- Manual provisioning returned exit 0. The guarded local helper permits the suite
  only after fresh login/marker/ownership/privilege/schema/session checks pass;
  it prevents a second invocation with a local execution receipt.
- Suite PASS covers three INVOKER helper signatures, fixed path, PUBLIC EXECUTE
  removed, no domain DML during helper calls, all fixed vectors, eleven nutrients,
  full numeric precision, missing/NULL/zero, Unicode, UTC microseconds, deterministic
  source/serving ordering, invalid targets, expected content changes and exclusions.
- Actual DDL failure rolls back functions, ACL, history and checksum. DOWN removes
  only helpers despite populated audit; identical UP/re-run preserves domains and
  all seven immutable baselines. Migration 0001-0006 bytes remain unchanged.

The final read-only helper reported PASS against its pinned expectations:
15 application tables, 13 revision columns, three SQL INVOKER helpers (two STABLE,
one IMMUTABLE), fixed pg_catalog,pg_temp paths, migrator ownership, no PUBLIC
EXECUTE, history 0001_identity through 0007_catalog_digest and seven matching
SHA-256 baselines. Synthetic rows: one app_user, two sources, one food, one revision,
two nutrients and two SOURCE_PERMISSION/REJECTED/UNVERIFIED audit events. Other
application tables are empty; no revision import_batch_id is populated.
energy_kcal=0.00000 remains different from sugar_g=NULL. All nine disposable
databases are retained; older targets were not connected to or modified.

Tested 0007 SHA-256:
`b6df290443a21652ce28776bbf3b2f86fac085151eb8759b6c0c9d2802930425`.
This PASS does not establish actor identity, append-only privileges, effective
source permissions, legal/clinical review, publication gate, editorial concurrency
or crash recovery at commit. No operational grant or SECURITY DEFINER was added.
No test rerun, reset, database cleanup or Git mutation occurred in final review.
M03-01 remains incomplete.

## Capability persistence SQL foundation M03-01

PREPARED, NOT EXECUTED. After separate approval and fresh-target verification only,
run from backend: npm.cmd run test:integration:catalog-capabilities.
Use the existing guarded NUTRASA_IT_DATABASE_URL and NUTRASA_IT_CONFIRM_DATABASE
process environment with an explicitly approved disposable database and dedicated
migrator, only on the approved PostgreSQL 18 test cluster at port 5433. Enter the
password using the previously reviewed local interactive procedure, never chat,
command arguments, a repository file or terminal output. Do not reuse a retained
database. Production/dev/test databases and port 5432 are forbidden.

The suite uses the existing harness, bootstrap definition, SHA-256, transaction and
advisory-lock core. It applies actual 0001-0007 as prerequisites, not a repeat of the
catalog/digest integration suites. It then tests actual 0008 plus a separate 0009
failure fixture. No normal runner discovers fixtures. Guards stop after a failed
checkpoint; there is no automatic retry, reset, role/database cleanup or provisioning.

Prepared: DDL/history/hash rollback; exact 10/4 types/defaults/NULL/collation; three
RESTRICT FKs and composite pointer matching; two PK/two UNIQUE/four indexes/nine
CHECKs; blank/nonblank and unnormalized scope; UUID and sequence uniqueness;
subject/actor references; protection against physical deletion/renaming; synthetic
event+pointer transaction rollback; empty DOWN/UP/re-run; populated DOWN refusal;
no nonowner table ACL; preservation of old rows, constraints, helpers and baselines.
Scope/capability fixtures are SYNTHETIC, not a proposed operational vocabulary.

DEFERRED UNTIL WRITER/PRIVILEGE ENFORCEMENT: duplicate active GRANT/inactive REVOKE
rejection, unknown-code or disabled-subject authorization, bootstrap/grantor identity,
self-escalation, unauthorized assignment/audit mutation, concurrent revoke/write,
and pooled identity context. These are acceptance plans, not skipped placeholder
tests or claims of PASS. Direct migrator DML does not prove runtime security.

Expected successful final state: eight history entries and eight immutable hashes,
all old domains retained, two synthetic capability events GRANT then REVOKE, and one
projection pointing to the REVOKE event. No real editorial assignment or authority
exists. Preserve the target as evidence after execution; any cleanup, reuse or reset
requires separate owner approval. Crash recovery at commit remains OPEN.

Capability batch non-database verification: focused migration/scanner 14/14 PASS;
full backend unit regression 102/102 PASS (0 fail/skip); backend typecheck/lint and
git diff --check PASS. These results do not prove PostgreSQL DDL, constraints or
operational authorization. The prepared PostgreSQL suite has not been executed.
