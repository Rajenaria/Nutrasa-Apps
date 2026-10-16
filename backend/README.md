# NUTRASA backend

Fondasi Fastify lokal, terpisah dari package Expo di root. Memerlukan Node.js
24.12+ pada jalur 24.x. TypeScript dijalankan dengan type stripping bawaan Node;
`npm run typecheck` tetap diperlukan karena runtime tidak memeriksa tipe.

Jalankan dari folder `backend/`:

```sh
npm ci
npm run dev
```

Server mendengarkan `http://127.0.0.1:3000`. `npm start` menjalankan server tanpa
watch mode. Hentikan dengan Ctrl+C.

`GET /api/v1/health/live` tidak memerlukan autentikasi dan mengembalikan HTTP 200
dengan `{"status":"ok"}`. Path mengikuti kontrak API repository; payload minimal
ini hanya menunjukkan proses hidup, bukan kesiapan database atau layanan lain.

```sh
npm run typecheck
npm run lint
npm test
```

Tests memakai Node test runner dan Fastify injection, termasuk akses HTTP lokal.
Tes HTTP menggunakan port acak; setiap test menutup app melalui cleanup hook.
Tests melalui `npm test` tidak membutuhkan Firebase, PostgreSQL, atau file .env.

Lint backend memakai ESLint dan konfigurasi yang sudah terpasang di root; jalankan
`npm ci` di root sebelum `npm run lint` di backend. Parser TypeScript dan globals
Node sudah tersedia pada konfigurasi tersebut. Script memeriksa `src/` dan
`tests/` serta gagal jika ada warning. Tidak ada konfigurasi lint atau dependency
ESLint kedua. Typecheck dan test menggunakan tooling package backend sendiri.

Belum ada integrasi PostgreSQL pada Fastify, Firebase, endpoint bisnis, env rahasia,
atau konfigurasi deployment. PostgreSQL readiness ditunda sampai integrasi nyata.

## Fondasi migration (M03-02D Step B)

Engine tetap `node-pg-migrate` 9.0.0. Command migration domain adalah
`npm run migrate -- up` dan `npm run migrate -- down [jumlah]` dari `backend/`,
hanya untuk `nutrasa_dev` atau `nutrasa_test` dengan role migrator masing-masing.
Migration domain pertama `migrations/0001_identity.sql` sudah ditulis pada
M03-01B.1 dan divalidasi melalui PostgreSQL 18.6 pada database disposable
identity dalam M03-01B.2: **15/15 PASS, exit code 0**, termasuk UP/DOWN/UP.
Hasil ini tidak menyatakan migration sudah diterapkan pada `nutrasa_dev` atau
`nutrasa_test`. Eksekusi pada kedua database domain memerlukan persetujuan terpisah dan
bootstrap ledger pada database target; jangan menjalankannya pada review dokumentasi,
termasuk dry-run. Pengujian integration destructive memakai database sementara
`nutrasa_it_<32hex>` tersendiri, bukan kedua database domain tersebut.

Migration berikutnya `migrations/0002_food_sources.sql` sudah ditulis sesuai
[kontrak delapan kolom yang disetujui](../docs/02-architecture/postgres-physical-schema-v1.5.md#kontrak-food_sources-m03-01).
Suite terpisah `npm run test:integration:food-sources` telah **13/13 PASS,
0 fail, 0 skipped, exit code 0** pada PostgreSQL 18.6 testing port 5433,
berdasarkan output terminal pemilik proyek. Constraint, upgrade, rollback batch,
preservasi identity serta UP/DOWN/UP lulus; verifikasi read-only akhir juga PASS.
Tabel food_sources kembali kosong, empat tabel identity masing-masing memiliki
satu row sintetis, history 0001/0002 dan dua baseline checksum konsisten.
Tidak ada seed sumber/makanan nyata, legal clearance, atau endpoint katalog baru.
Target dipertahankan dan tidak boleh dipakai ulang/reset/cleanup tanpa approval;
lihat [bukti food_sources](tests/integration/README.md#food-sources-m03-01).
Migration food_sources siap ditutup; seluruh M03-01 belum DONE.

Entrypoint hanya menerima up/down; tidak meneruskan flags atau konfigurasi bebas.
Target tetap `nutrasa`, histori `nutrasa_migrations.pgmigrations`, tanpa pembuatan
schema otomatis, dengan transaksi batch, order check, dan advisory lock mode fail.
Environment proses memakai `MIGRATION_DATABASE_URL` untuk migrator lokal yang
sesuai database dev/test. Tidak membaca file `.env` otomatis atau mencetak URL.
URL tanpa port dinormalisasi menjadi `5432`; `PGPORT` tidak dapat mengalihkan
koneksi. `PGOPTIONS` dan `PGREPLICATION` yang tidak kosong ditolak sebelum client
dibuat, termasuk saat wrapper dipanggil langsung. URL tanpa password tetap
didukung seperti sebelumnya; perubahan ini tidak mengubah mekanisme credential.

Konvensi resmi NUTRASA untuk file di `backend/migrations/` adalah `NNNN_nama.sql`:
nomor urut empat digit `0001`–`9999`, unik; nama diawali huruf kecil ASCII,
kemudian hanya huruf kecil ASCII, angka, atau underscore. Maksimum nama tanpa
`.sql` adalah 251 karakter (filename maksimum 255 karakter pada Windows/Linux).
Contoh: `0001_identity.sql`. Hyphen, timestamp, format UTC, versi nol, dan bentuk
lain yang didukung library sengaja ditolak. Domain pertama memakai `0001_identity.sql`;
migration yang sudah diterapkan tidak boleh diedit atau diganti nama. Parser, filter loader, dan constraint
SQL menggunakan batas yang sama. File harus UTF-8 tanpa BOM, LF, dan newline akhir.
Regex CHECK menggunakan collation `C` agar rentang ASCII tidak mengikuti locale database.
Gunakan tepat satu marker
`-- Up Migration`, kemudian satu `-- Down Migration`. `.gitattributes` mengunci LF.
Runner membaca byte setiap file sekali dan menggunakan snapshot yang sama untuk
SHA-256 serta parser SQL publik library. Hash mencakup seluruh file, termasuk down.

`sql/bootstrap-migration-ledger.sql` adalah rancangan manual untuk review, bukan
domain migration dan tidak masuk direktori runner. Bootstrap ditolak bila ledger
sudah ada, histori berisi migration, atau objek bernama `pgmigrations` ditemukan
di schema lain pada database target, termasuk objek kosong. Runner memakai guard
lokasi yang sama sebelum library dapat membuat histori. Tidak ada auto-baseline/backfill.
Ledger hanya menyimpan nama dan SHA-256, bukan histori penerapan kedua.

Wrapper memperoleh session advisory lock menggunakan `PG_MIGRATE_LOCK_ID` publik
library sebelum memeriksa metadata/checksum dan memanggil engine. Library tetap
memperoleh lock yang sama (`noLock: false`) pada koneksi yang sama; acquisition
reentrant ini dilepas masing-masing oleh library dan wrapper. Bootstrap rancangan
menggunakan transaction advisory lock dengan key yang sama. Ini menutup interval
antara preflight dan pembuatan histori untuk proses yang mematuhi protokol lock.
Loader tetap memeriksa ulang integritas setelah library memperoleh lock.
Aksi up/down menambahkan statement ledger ke builder,
sebelum histori bawaan library, dalam transaksi yang sama. Down mempertahankan
baseline. Hash berbeda pada conflict menyebabkan pelanggaran NOT NULL dan rollback.
Tabel histori dapat dibuat library sebelum transaksi batch pertama; bootstrap
metadata bukan bagian dari jaminan atomicity DDL domain. Skenario atomicity,
concurrency, pelepasan lock saat sukses/gagal, dan rollback telah lulus pada database
integration sementara berdasarkan hasil yang dikonfirmasi pemilik proyek.
Crash/kill atau putus koneksi saat commit belum diuji. Advisory lock tidak
menghalangi SQL manual atau proses yang mengabaikan lock; itu tetap risiko
di luar entrypoint resmi.

SQL domain dibatasi secara konservatif: kata kontrol transaksi, termasuk dalam
komentar/literal, dan akses metadata migration ditolak. Ini bukan parser/sandbox SQL;
SQL yang membutuhkan BEGIN/END (misalnya body fungsi atau CASE) membutuhkan review
kebijakan tersendiri sebelum didukung. SQL migration tetap kode tepercaya.

Semua npm command migration proyek melewati wrapper integritas. Pemilik credential
migrator masih bisa memanggil CLI library atau SQL secara langsung; kode proyek
tidak dapat mencegah bypass di luar entrypoint. Jalur tersebut tidak didukung dan
dapat merusak histori/checksum. Ledger tidak mendeteksi schema drift manual atau
pemalsuan oleh administrator/owner metadata.

Unit tests hanya memakai file sementara, builder SQL publik, dan callback engine
palsu; tidak menjalankan runner asli atau mengakses PostgreSQL. Integration tests
memakai core yang sama dan PostgreSQL nyata untuk bootstrap kosong,
commit/rollback DDL+histori+checksum, mismatch/missing file, up/down/up,
dua proses bersamaan, dan recovery melalui re-run pada database sementara.

## Isolated integration harness (M03-02D C1)

Core migration digunakan bersama oleh CLI dan harness. CLI tetap membatasi target
dev/test dan direktori domain; harness memiliki guard terpisah untuk database baru
`nutrasa_it_<32hex>` (tepat 32 karakter hex kecil) dengan role khusus.
Tidak ada override CLI produksi. Unit tests tetap melalui `npm test`;
script `npm run test:integration` terpisah dan melakukan DDL, rollback,
serta injeksi korupsi metadata hanya pada target sementara yang terisolasi.
Jangan menargetkan `nutrasa_dev` atau `nutrasa_test` untuk suite destructive ini.
Fixture tidak masuk folder domain; harness tidak membuat/menghapus database atau role.

Suite identity M03-01B.1 terpisah melalui `npm run test:integration:identity` dan
memakai setup harness serta guard yang sama dengan suite engine. Ia menyalin byte
SQL domain ke workspace sementara, bukan membuat salinan DDL fixture yang berbeda.
Setiap suite memerlukan database integration baru karena baseline checksum immutable;
jangan menjalankan suite engine dan identity pada target yang sama. Instance khusus
integration memakai PostgreSQL 18 pada `127.0.0.1:5433`, cluster `nutrasa_it_pg18`,
administrator `nutrasa_it_admin`, dan migrator khusus untuk setiap database.
Guard memeriksa identitas koneksi, marker, ownership dan privilege sebelum mutasi;
preflight eksternal juga memverifikasi data directory dan system identifier.

Bukti M03-01B.2 yang dikonfirmasi pemilik proyek pada 16 Oktober 2026:

- Identity integration: **15/15 PASS, 0 fail, 0 skipped, exit code 0**.
- Migration-engine integration B: **11/11 PASS, 0 fail, 0 skipped, exit code 0**.
- Backend unit tests pada final review: **47/47 PASS**.
- UP/DOWN/UP identity, commit/rollback DDL+data+history+checksum, baseline immutable,
  penolakan file berubah/hilang, history-ledger mismatch, concurrency dan pelepasan
  advisory lock telah lulus pada target disposable masing-masing.
- Percobaan berikutnya pada B dihentikan preflight `schemas_empty`: suite tidak
  dijalankan dan PASS sebelumnya tetap berlaku. Target yang sudah digunakan
  tidak boleh dipakai ulang, di-reset atau dibersihkan tanpa approval terpisah.
- Seluruh database disposable M03-01B.2 dipertahankan sebagai bukti; tidak ada
  cleanup pada finalisasi ini atau akses ke cluster utama port 5432.

Catatan historis M03-02D tetap berlaku untuk sesi terdahulu: unit 39/39 PASS,
integration 11/11 PASS, dan target sementara sesi tersebut dibersihkan manual.
Catatan cleanup historis itu tidak berlaku untuk target M03-01B.2 saat ini.
Integration tidak dijalankan ulang pada finalisasi dokumentasi ini. Eksekusi
berikutnya memerlukan target fresh dan approval baru. Lihat
[hasil dan prosedur integration](tests/integration/README.md) untuk identitas target,
kondisi terakhir dan batas pengujian; crash recovery saat commit tetap OPEN.

Fondasi katalog lanjutan M03-01 menambah migration domain `0004_food_taxonomy.sql`
dan `0005_food_servings_provenance.sql`. Output terminal pemilik proyek mengonfirmasi
**24/24 integration PASS, 0 fail/skip, exit code 0**, termasuk final state PASS. Script `npm run test:integration:catalog-foundation`
menjalankan satu suite gabungan pada satu database disposable fresh, dengan
bootstrap sekali, lifecycle 0004 lalu lifecycle 0005; bukan dua suite mandiri
yang memakai ulang target. Jangan menjalankannya pada nutrasa_dev/nutrasa_test
atau tujuh target yang kini sudah dipakai. Lihat [bukti dan batas pengujian](tests/integration/README.md#katalog-lanjutan-m03-01).
Eksekusi berikutnya memerlukan target fresh dan approval baru; seluruh gate editorial
tetap OPEN. Hasil ini tidak menandai keseluruhan M03-01 DONE.

## Catalog audit foundation M03-01 — PostgreSQL integration PASS

Migration `0006_catalog_audit.sql` contains the approved 21/13/3 audit-table columns
and nullable revision batch link: nine RESTRICT/non-deferrable FKs, 37 CHECKs and
thirteen B-tree indexes including PK/UNIQUE indexes. It does not implement
append-only privileges, actor verification, canonical review digest calculation,
publication or editorial workflow.

The lexical policy distinguishes comments, quoted data and executable code.
Initial supported function syntax: CREATE FUNCTION nutrasa.name([name type,...])
RETURNS type LANGUAGE plpgsql AS a tagged or untagged dollar-quoted body.
Static statements/nested BEGIN-END blocks are supported. DECLARE, IF/loops,
LANGUAGE SQL, SECURITY DEFINER/SET clauses, OR REPLACE and unsupported forms fail
closed and require later compatibility review before governance functions.
No function is installed by 0006. The scanner is not PostgreSQL semantic validation
or an SQL sandbox; migrations remain trusted, reviewed code.

DOWN takes ACCESS EXCLUSIVE table locks before its data guard and refuses with
22012 if audit or a revision batch link is populated. Empty DOWN retains prior
domains and immutable checksums; populated audit is not deleted by routine DOWN.
DOWN also refuses isolation other than READ COMMITTED so an older transaction
snapshot cannot hide committed inserts after waiting for the table locks.
Owner-provided PostgreSQL 18.6 output confirms 16/16 integration PASS, 0 fail/skip,
exit code 0: upgrade, failure rollback, empty DOWN/UP/re-run and atomic populated
DOWN refusal passed. Concurrent DOWN writers and crash recovery at commit remain
untested; no governance function or runtime security is established.

Local verification: scanner-focused tests 9/9 PASS, full backend unit tests 70/70
PASS, backend typecheck/lint PASS and mobile typecheck/lint PASS. These checks do
not execute the PostgreSQL integration suite or establish SQL/security correctness.

The approved invocation completed once on a fresh disposable target at
127.0.0.1:5433. Any future execution requires a new isolated target and separate
approval. Never use permanent or previously used databases.

```powershell
npm.cmd run test:integration:catalog-audit
```

See [audit integration evidence and safety boundaries](tests/integration/README.md#catalog-audit-foundation-m03-01).
