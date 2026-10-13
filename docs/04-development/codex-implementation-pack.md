# NUTRASA — Codex Implementation Pack v1.0

**Status:** rencana implementasi; **belum** mengubah source code, belum membuat SQL migrasi, belum commit/push. Target development layanan Rp0. Dokumen ini **pelengkap** `AGENTS.md`, bukan pengganti atau instruksi untuk mengabaikannya.

## 1. Dokumen & aturan prioritas

1. Instruksi sistem/developer pada sesi agen dan keamanan data tetap berlaku.
2. `AGENTS.md` yang **sudah ada pada repository pengguna** berlaku utuh dan **tidak boleh diganti/ditimpa** oleh paket ini.
3. Keputusan produk Decision 01–10 dan dokumen keputusan teknis terbaru yang sudah disetujui menentukan perilaku aplikasi.
4. `docs/02-architecture/database-schema.md`, `api-contract.md`, `openapi.yaml`, `sync-protocol-final-design.md`, dan `database-implementation-decisions-v1.6.md` adalah rancangan teknis yang harus dibaca sebelum implementasi terkait; tandai konflik dan ajukan klarifikasi, jangan mengarang.
5. Mockup dan design system merupakan baseline presentasi, tidak boleh mengubah semantik nutrisi demi estetika.

**Catatan verifikasi:** File yang dikirim ke asisten adalah `AGENTS_NUTRASA_FINAL.md`; asisten telah membaca isinya tetapi belum memeriksa file `AGENTS.md` aktual di Git pengguna. Agen wajib membandingkan keduanya secara non-destruktif sebelum usulan perubahan aturan apa pun. Paket ini sengaja **tidak menyertakan `AGENTS.md`**.

## 2. Stack yang ditetapkan

- Client: React Native + Expo + TypeScript + Expo Router.
- Identity: Firebase Authentication; verifikasi email opsional untuk fitur utama.
- API: Node.js + Fastify di lingkungan lokal.
- Main database: PostgreSQL lokal. Tidak ada kredensial database di mobile.
- Offline: Expo SQLite dengan SQLCipher untuk data pribadi pada platform yang didukung; uji dengan development build, bukan mengklaim Expo Go cukup.
- Token/key kecil: mekanisme secure storage yang didukung dan diuji pada platform nyata.
- Jangan menambah penyedia layanan cloud berbayar, framework ORM, state library, atau monorepo tool tanpa membuktikan kebutuhan dan memeriksa kondisi repo saat itu.

## 3. Struktur direktori — prinsip, bukan instruksi rewrite

Dokumen AGENTS yang diunggah secara eksplisit menetapkan **`src/app/` untuk Expo Router** dan **`src/features/` untuk feature code**. Ikuti *layout aktual* di repository; **jangan otomatis memindahkan** route ke `app/` hanya karena contoh umum Expo menggunakannya.

Contoh kemungkinan pembagian tanggung jawab setelah inspeksi repo:

```text
src/
  app/                  # route tipis, jika ini layout existing
  features/             # auth, onboarding, foods, food-log, progress, profile
  theme/                # hanya jika sudah ada/diutuhkan
  lib/                  # hanya integrasi bersama yang nyata dibutuhkan
  providers/            # hanya jika diperlukan
backend/                # lokasi akhir ditetapkan setelah inspeksi repo
  src/                  # Fastify handlers, domain, database adapters
  migrations/           # dibuat saat task implementasi migration disetujui
  tests/
docs/
  00-overview/
  01-design/
  02-architecture/
  03-features/
  04-development/
```

Lokasi `backend/` **usulan**, bukan fakta. Periksa apakah backend sudah ada di repository sebelum membuat struktur baru.

## 4. Milestone berurutan dan gerbang

| Tahap | Tujuan/hasil | Boleh dilakukan | Gerbang sebelum lanjut |
|---|---|---|---|
| M00 | Audit repo & baseline | Inspeksi kode, versi package, folder, docs, perintah cek | Laporan tanpa edit/commit |
| M01 | Fondasi pengujian & konvensi | Perbaiki script check yang benar-benar diperlukan, tentukan batas mobile/backend | Typecheck/lint yang tersedia berhasil atau keterbatasan didokumentasi |
| M02 | Backend skeleton lokal | Fastify skeleton, health routes, konfigurasi aman, testing awal | Tidak ada rahasia ter-commit, tes route dan startup |
| M03 | PostgreSQL schema dasar | Migrasi bertahap: user identity, katalog, log/goal, sync ledger | Migrasi up/down clean DB, constraint & ownership tests |
| M04 | Firebase Auth integration | Verifikasi token backend, login/register UI berdasarkan spec, email opsional | Token salah ditolak, IDOR ditolak, signout bersih |
| M05 | Onboarding & profil | Validasi dewasa/profil supported; draft lokal; server profile | Uji validasi, draft, no numeric targets for unsupported profile |
| M06 | Curated food catalog | Search, food details, servings, 4 mandatory macros | Tidak impor data tanpa review hak pakai; null nutrients remain null |
| M07 | Food log & snapshots | Add/edit/delete/copy, per-food nutrient snapshot | Snapshot immutability and scaling tests |
| M08 | SQLite + sync | SQLCipher, queue, push/pull, ordered feed, retry | Device build, concurrency/idempotence/logout tests |
| M09 | Dashboard & Progress | Approved UI; null vs zero; goals effective timeline; completion marker | Date/time/partial-data and UX regression checks |
| M10 | Release readiness only | Security/privacy review, nutrition validation, food-data rights, end-to-end tests | **No public release without external gates** |

M03 can be subdivided into feature migrations. Do not implement all schema/API in one unreviewable PR. M08 is a **hard gate** before claiming offline-supported MVP. Some safe UI scaffolding may happen earlier with mocked data, clearly labeled.

## 5. Definition of done for each task

- Reuse existing code; no duplicate business logic or deprecated dead implementations.
- Changes scoped to task; every modified caller/type/test covered when relevant.
- Input validation, ownership verification and null nutrition handling preserve the decisions.
- New dependencies justified; official APIs checked against installed versions.
- Tests for changed behavior run where available; report exact commands/outcomes, never fabricate pass results.
- `git diff` manually inspected, no credentials, unexpected deletions, or noisy formatting.
- Brief report in Indonesian: summary, changed files, checked items/results, limitations.
- **Never auto-commit/push**. User wants a single commit/push after review.

## 6. No-go: stop and report

- A requested step assumes code, scripts, database fields or dependencies absent from repo.
- Competing spec documents disagree on auth, nutrition goals, sync LWW, deletion, or time semantics.
- A change needs licensed food material with unclear import rights.
- A target nutrition formula is to be shown as medically safe without qualified review.
- Credential, signing key, or token would be committed or logged.
- Development tool cannot verify claimed behavior; clearly mark incomplete instead.

## 7. Product guardrails

Decision 01 email optional; Decision 02 auto goals only MVP; Decision 03 newest valid weight and forward-effective target history; Decision 04 18+ supported profiles only; Decision 05 food licensing/curation; Decision 06 partial nutritional totals; Decision 07 server-ordered LWW (not phone clock truth), with ordered transactional per-user cursor; Decision 08 clean private local data at logout and handle pending writes; Decision 09 immutable historical nutrition snapshot until explicitly edited; Decision 10 no-log ≠ 0, historical goal effective date, active vs completed day distinct.

## 8. Related documents and release blockers

See `docs/04-development/engineering-readiness-review-v1.6.md` for limitations. **OpenAPI semantic validation, typed sync payload details and executable migrations were not verified by this planning package.** SQLCipher key lifecycle, concurrent writes, account deletion, licensed catalog import, nutrition clinical validation, and public data processing/privacy requirements need actual tests/approval.
