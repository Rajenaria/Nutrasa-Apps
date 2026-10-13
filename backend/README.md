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
Tests tidak membutuhkan Firebase, PostgreSQL, atau file .env.

Lint backend memakai ESLint dan konfigurasi yang sudah terpasang di root; jalankan
`npm ci` di root sebelum `npm run lint` di backend. Parser TypeScript dan globals
Node sudah tersedia pada konfigurasi tersebut. Script memeriksa `src/` dan
`tests/` serta gagal jika ada warning. Tidak ada konfigurasi lint atau dependency
ESLint kedua. Typecheck dan test menggunakan tooling package backend sendiri.

Tidak ada database, Firebase, endpoint bisnis, env rahasia, atau konfigurasi
deployment dalam fondasi ini. PostgreSQL readiness ditunda sampai integrasi nyata.
