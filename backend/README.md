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
Belum ada migration domain. Eksekusinya memerlukan persetujuan terpisah dan
bootstrap ledger pada database target; jangan menjalankannya pada review dokumentasi,
termasuk dry-run. Pengujian integration destructive memakai database sementara
`nutrasa_it_<32hex>` tersendiri, bukan kedua database domain tersebut.

Entrypoint hanya menerima up/down; tidak meneruskan flags atau konfigurasi bebas.
Target tetap `nutrasa`, histori `nutrasa_migrations.pgmigrations`, tanpa pembuatan
schema otomatis, dengan transaksi batch, order check, dan advisory lock mode fail.
Environment proses memakai `MIGRATION_DATABASE_URL` untuk migrator lokal yang
sesuai database dev/test. Tidak membaca file `.env` otomatis atau mencetak URL.

Konvensi resmi NUTRASA untuk file di `backend/migrations/` adalah `NNNN_nama.sql`:
nomor urut empat digit `0001`–`9999`, unik; nama diawali huruf kecil ASCII,
kemudian hanya huruf kecil ASCII, angka, atau underscore. Maksimum nama tanpa
`.sql` adalah 251 karakter (filename maksimum 255 karakter pada Windows/Linux).
Contoh: `0001_identity.sql`. Hyphen, timestamp, format UTC, versi nol, dan bentuk
lain yang didukung library sengaja ditolak. Belum ada domain migration, sehingga
tidak ada file lama yang perlu diganti nama. Parser, filter loader, dan constraint
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

Bukti yang dikonfirmasi pemilik proyek pada finalisasi M03-02D:

- Backend unit tests: **39/39 PASS**.
- PostgreSQL integration tests: **11/11 PASS, 0 fail, 0 skipped**.
- Database integration sementara sudah dibersihkan manual; `nutrasa_dev` dan
  `nutrasa_test` tetap dipertahankan.

Hasil tersebut tidak diuji ulang pada koreksi dokumentasi ini. Eksekusi integration
berikutnya memerlukan target sementara baru serta persetujuan terpisah untuk
provisioning, pengujian, dan cleanup. Lihat [prosedur integration](tests/integration/README.md)
untuk instruksi keamanan dan batas pengujian; crash recovery saat commit tetap OPEN.
