# Isolated migration integration tests — M03-02D

Hasil yang dikonfirmasi pemilik proyek pada finalisasi M03-02D:

- Backend unit tests: **39/39 PASS**.
- PostgreSQL integration tests: **11/11 PASS, 0 fail, 0 skipped**.
- Database integration sementara sudah dibersihkan manual; `nutrasa_dev` dan
  `nutrasa_test` tetap dipertahankan.

Hasil tersebut tidak diuji ulang pada koreksi dokumentasi ini. Untuk eksekusi
berikutnya, provisioning, pengujian, dan cleanup masing-masing tetap membutuhkan
persetujuan pemilik proyek serta target sementara baru.

## Target dan batas keamanan

Gunakan satu database baru untuk setiap eksekusi penuh:

Suite ini destructive: menjalankan DDL, rollback, serta injeksi korupsi metadata.
Hanya boleh memakai `nutrasa_it_<32hex>` yang terisolasi. Jangan menargetkan
`nutrasa_dev` atau `nutrasa_test`; keduanya dipakai CLI migration domain.

- Database `nutrasa_it_<id>`: ID tepat 32 karakter hex kecil.
- Role `nutrasa_it_<id>_migrator`: terpisah dari role dev/test utama.
- PostgreSQL lokal pada loopback port 5432. Tidak membutuhkan Docker.
- Dua schema `nutrasa` dan `nutrasa_migrations` owned oleh role khusus.
- Role tanpa SUPERUSER, CREATEDB, CREATEROLE, INHERIT, REPLICATION, BYPASSRLS
  atau membership. Database owned oleh administrator provisioning.
- Komentar database `NUTRASA migration integration:<id>` menjadi marker target.
- Role hanya mendapat CONNECT ke target dan DDL pada dua schema miliknya.
  PUBLIC tidak mendapat CONNECT/CREATE/TEMP pada database integration.
- Database utama harus tetap REVOKE CONNECT FROM PUBLIC sesuai provisioning
  sebelumnya. Role baru tidak otomatis terisolasi dari database lain yang
  masih memberikan CONNECT kepada PUBLIC.

Harness menolak URL tanpa password eksplisit agar tidak mengambil password PG
utama secara implisit. Gunakan password khusus. Tidak membaca `.env`/credential
file. Guard memeriksa database, current_user, session_user, ownership kedua schema,
alamat/port server, marker dan privilege role sebelum tindakan mutatif. CLI normal
tetap memakai allowlist dev/test dan direktori domain tetap, tanpa override.

## Provisioning manual untuk review

Dari `backend/`, setelah persetujuan terpisah, gunakan administrator lokal sah.
Ganti `postgres` bila nama administrator berbeda:

```powershell
psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -W -v ON_ERROR_STOP=1 -f tests/integration/provision.sql
```

Masukkan ID baru saat diminta, misalnya hasil `(New-Guid).ToString('N')`.
Script menolak database/role yang sudah ada, membuat role NOLOGIN dan database
template0, lalu schema, search_path, default privileges dan marker. Password SCRAM
diisi lewat `\password`; LOGIN diaktifkan setelah konfirmasi nama role.

Jangan bootstrap ledger manual: checkpoint pertama harness memerlukan schema kosong.
Jika provisioning berhenti di tengah, STOP dan review objek parsial. Jangan mengulang
atau menghapus objek otomatis. NOLOGIN membatasi akses sebelum provisioning selesai.

Verifikasi login terpisah tanpa password pada command (ganti ID pada kedua nama):

```powershell
psql -X -h 127.0.0.1 -p 5432 -U nutrasa_it_ID_migrator -d nutrasa_it_ID -W
```

Query read-only:

```sql
SELECT current_database(), current_user, session_user, inet_server_addr(), inet_server_port();
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

Expected: identitas khusus sesuai; schema owned oleh migrator; CONNECT true,
CREATE/TEMP false, semua flag role false. Kedua schema belum memiliki tabel.
Jangan membaca pg_authid/rolpassword.

## Menjalankan tests setelah persetujuan

`npm test` tetap unit-only. Integration suite hanya masuk `npm run test:integration`.
Set environment pada sesi lokal, tanpa credential literal pada history:

```powershell
$itRunId = Read-Host 'ID integration yang telah diprovision'
$itDatabase = 'nutrasa_it_' + $itRunId
$itRole = $itDatabase + '_migrator'
$itPassword = Read-Host 'Password role integration khusus' -AsSecureString
try {
  $itEncodedPassword = [Uri]::EscapeDataString([Net.NetworkCredential]::new('', $itPassword).Password)
  $env:NUTRASA_IT_CONFIRM_DATABASE = $itDatabase
  $env:NUTRASA_IT_DATABASE_URL = 'postgresql://{0}:{1}@127.0.0.1:5432/{2}' -f $itRole, $itEncodedPassword, $itDatabase
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

## Cleanup manual dan risiko OPEN

Setelah hasil/sisa kegagalan direview dan penghapusan disetujui:

```powershell
psql -X -h 127.0.0.1 -p 5432 -U postgres -d postgres -W -v ON_ERROR_STOP=1 -f tests/integration/cleanup.sql
```

Script meminta ID dan konfirmasi nama database lengkap. Ia memeriksa marker,
ownership database/schema, role dan ketiadaan sesi aktif. Tidak memakai FORCE atau
memutus sesi lain. DROP ROLE ditolak bila ada dependency di tempat lain; STOP dan
review. Jangan memakai DROP OWNED/REASSIGN otomatis. Harness tidak memanggil script.

Hasil PASS yang dikonfirmasi mencakup skenario lifecycle di atas, termasuk
atomicity, rollback, concurrency, pelepasan lock, dan recovery melalui re-run.
Provisioning dan cleanup target sementara telah dilakukan manual oleh pemilik
proyek; harness tidak melakukan cleanup database otomatis.

OPEN: crash/kill atau putus koneksi saat commit belum diuji. Pengujian kegagalan
transaksi dan re-run bukan jaminan crash recovery menyeluruh. Hasil pada lingkungan
yang diuji tidak otomatis membuktikan seluruh kondisi, versi, atau konfigurasi lain.
