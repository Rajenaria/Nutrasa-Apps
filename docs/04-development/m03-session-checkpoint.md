# NUTRASA — Checkpoint sesi M03

Tanggal: 13 Oktober 2026. Branch: `feat/database-foundation`.

## Sudah selesai

**Dikonfirmasi pemilik proyek, tidak diuji ulang melalui database pada checkpoint ini:**

- M00, M01, dan M02 selesai.
- PostgreSQL 18.6 lokal berjalan; `nutrasa_dev` dan `nutrasa_test` telah dibuat.
- Role `nutrasa_dev_app`, `nutrasa_dev_migrator`, `nutrasa_test_app`, dan `nutrasa_test_migrator` telah dibuat.
- Schema `nutrasa` dan `nutrasa_migrations` tersedia pada kedua database.
- Password SCRAM-SHA-256 telah dikonfigurasi; login keempat role berhasil diuji pemilik proyek.
- pgAdmin 4 tersedia untuk sesi berikutnya.

**Diperiksa langsung pada repository:**

- Node lokal `24.21.0`; dependency backend terpasang: `pg` `8.23.1`, `@types/pg` `8.23.1`, dan `node-pg-migrate` `9.0.0`.
- Backend `npm run typecheck` dan `npm run lint` lulus; `npm test` lulus 11/11, termasuk health HTTP lokal dan error handling. Tes tidak menggunakan PostgreSQL.
- `.env` dan variannya, `.secrets/`, pola credential Firebase, serta `node_modules/` tercakup `.gitignore`. Kedua `.env.example` tetap terlacak. Tidak ada `.env` lokal pada direktori root/backend saat pemeriksaan nama file.
- Staged diff kosong. `git diff --check` lulus sebelum penulisan catatan ini.

## Belum selesai

- Belum ada migration domain, konfigurasi/skrip eksekusi migration, atau integrasi koneksi PostgreSQL pada Fastify.
- Health liveness hanya membuktikan proses hidup; database readiness belum diimplementasikan.
- Belum ada pengujian koneksi database melalui backend maupun pengujian migration, constraint, rollback, dan owner isolation.
- M03 secara keseluruhan belum selesai. Keberadaan database dan schema bukan bukti bahwa schema domain siap.

## Risiko dan keputusan OPEN

- Desain integritas/checksum migration belum disetujui; jangan membuat implementasi checksum atau menjalankan migration sebelum keputusan tersebut jelas.
- Privilege efektif, ownership, membership role, default privileges, dan `search_path` aktual belum diaudit ulang oleh Codex melalui koneksi database. Login yang berhasil tidak membuktikan least privilege.
- Hak bawaan `PUBLIC` pada database lain tetap perlu diperiksa bila isolasi seluruh cluster diperlukan.
- Scope recipe builder tetap post-MVP; favorites, recent foods, custom food sederhana, dan salin catatan makanan tetap MVP.
- `docs/02-architecture/sql-migration-plan.md`, bagian 2 baris rencana 006, masih menyebut resep "non-nested MVP". Klausul lama ini bertentangan dengan O-18 dan database implementation decisions v1.6; jangan menjadikannya dasar migration MVP. Dokumen sumber tidak diubah pada checkpoint ini.

## Langkah pertama sesi berikutnya

Review dan sepakati desain integritas migration terlebih dahulu. Gunakan pgAdmin 4 atau psql milik pemilik proyek untuk verifikasi read-only ownership, privilege, dan `search_path`, lalu tentukan acceptance task berikutnya sebelum implementasi. Jangan otomatis menjalankan M03-02D atau M03-03.

## Kandidat commit manual pemilik proyek

- `backend/package.json`: penambahan dependency database yang telah dipilih.
- `backend/package-lock.json`: penguncian dependency tersebut.
- `backend/.env.example`: template konfigurasi backend dari pekerjaan sebelumnya.
- `docs/04-development/m03-session-checkpoint.md`: catatan checkpoint ini.

Checkpoint ini hanya menambahkan catatan tersebut. Tidak ada perubahan source, dependency, database, service, atau konfigurasi Windows. Tidak ada credential yang dibaca atau dicatat. Semua perubahan tetap di working tree; staging, commit, dan push hanya dilakukan pemilik proyek setelah review.
