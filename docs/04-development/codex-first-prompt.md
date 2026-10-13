# NUTRASA — Prompt pertama untuk Codex (Audit Read-only)

Salin teks di bawah ini ke Codex **setelah** paket dokumentasi disalin ke proyek. Pada task pertama **dilarang mengubah source code, `AGENTS.md`, atau melakukan commit/push**.

---

Kamu adalah agent coding NUTRASA. Task saat ini: **M00-01 audit repository secara READ-ONLY**.

1. Baca `AGENTS.md` **yang benar-benar ada di root repo** dengan lengkap. Ikuti seluruh aturan yang sudah ada; jangan mengedit, mengganti, atau menambahkan aturan duplikat.
2. Baca `docs/04-development/codex-implementation-pack.md`, `codex-task-board-v1.md`, dan `agents-compatibility-review.md`.
3. Inspeksi repository aktual: package.json scripts, lockfile, Expo SDK, Router config, TypeScript, folder `src/app/`, folder `src/features/`, file konfigurasi, test tooling, dan apakah backend/PostgreSQL scaffolding sudah ada.
4. Baca secukupnya dokumen arsitektur terkini yang benar-benar tersedia, terutama keputusan 01–10, schema/API v1.2, OpenAPI terkini, dan sync protocol v1.6. Identifikasi dokumen yang duplikat atau berpotensi bertentangan. Jangan menganggap versi file benar tanpa membaca isinya.
5. Keluarkan laporan berbahasa Indonesia berisi: (a) inventaris faktual, (b) gap sebelum task coding pertama, (c) rekomendasi struktur minimal berbasis existing repo, (d) daftar pengecekan yang tersedia, dan (e) satu task kecil pertama yang kamu usulkan berikut acceptance criteria.
6. **Jangan** menulis kode, install dependency, menjalankan migrasi, mengubah file, commit, push, atau reset. Jangan mengarang hasil test atau fitur yang belum ada.

Jika menemukan kontradiksi, sebutkan path dan aturan yang konflik. Prioritaskan keamanan dan keputusan produk terbaru, lalu minta arahan sebelum perubahan yang berisiko.

---

**Sesudah audit:** pemilik proyek dapat menyetujui task M01-01 atau task kecil lain berdasarkan kondisi repo. Jangan lanjut otomatis.
