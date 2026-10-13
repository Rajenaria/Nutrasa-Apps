# NUTRASA — Engineering Alignment Report v1.2

**Tanggal:** 2026-10-13. **Status:** spesifikasi bersih dibuat; belum ada code, DDL, deployment atau validasi klinis.

## Hasil perbaikan dari v1.1

| Konflik sebelumnya | Keputusan v1.2 |
|---|---|
| Email belum verifikasi memblokir API | Tidak; verification opsional, aksi sensitif tetap re-auth |
| LOG_ONLY untuk profil unsupported | Tidak tersedia MVP; hanya 18+ eligible |
| Manual target aktif | Dihapus dari kontrak MVP; AUTO saja |
| 409 revision conflict | LWW berdasarkan operasi terakhir diterapkan server, bukan stale-edit 409 |
| Klaim latest offline device timestamp | Tidak dijamin; jam perangkat tidak dapat dipercaya |
| Goal historis berlaku mundur | Goal efektif sejak aktivasi server; dipakai untuk hari berakhir lokal |
| Hari tanpa log terlihat nol | `NO_LOGS`, tidak dianggap asupan nol |
| Hari selesai = nutrisi lengkap | Dua konsep independen |
| Nutrient unknown berubah jadi 0 | `null` + coverage per nutrient |
| Logout langsung buang outbox | Prompt sinkronkan/batal/keluar dengan konfirmasi kehilangan |
| Deleting Firebase saja | Workflow terkoordinasi dengan status dan retry |

## Keputusan engineering yang dibuat untuk mencegah ambiguitas

- JSON decimal sebagai string; server menyimpan NUMERIC, UI formatting terpisah.
- Mencegah nested recipe untuk MVP; typed revision links wajib.
- Mobile memakai UUID untuk mutasi offline; idempotency receipt ditulis atomik bersama perubahan domain dan feed.
- Cursor expired memicu full resync tanpa membuang antrean belum terkirim.
- `PENDING_DELETION` memblokir writes dan reinstatement dari perangkat lama.

## Temuan yang masih terbuka (bukan ditutup palsu)

1. **CLINICAL:** rumus, activity multipliers, batas aman, kebutuhan protein/makro, kriteria eligible memerlukan review ahli sebelum rekomendasi publik.
2. **LEGAL/LICENSE:** hak penggunaan TKPI, Panganku, label, API eksternal harus dibuktikan per sumber sebelum import/publish.
3. **PRIVACY/SECURITY:** kebijakan penyimpanan tanggal lahir, privacy notice, data retention/tombstone, backup/restore, SQLCipher + SecureStore multi-platform dan prosedur hapus akun perlu uji.
4. **SYNC DETAIL:** expiry cursor, transaksi serial processing multi-device, device sequence recovery dari reinstall, tombstone retention, sync batch limits perlu diputuskan dalam desain protokol dan dites.
5. **API MACHINE READABLE:** OpenAPI belum disusun; masih ada kebutuhan mendefinisikan seluruh field request/response dan schema error per route secara formal.
6. **DATABASE DDL:** FK polymorphic, CHECK, indexes, range non-overlap, triggers versi immutable, migration rollback belum disusun.
7. **PLATFORM:** Google/Apple sign-in native Expo Development Build dan flow reauthentication perlu pengujian aktual.

## Artefak & langkah berikutnya

- `database-schema.md` v1.2 dan `api-contract.md` v1.2 menggantikan dokumen versi 1.1 pada *branch review*, setelah diff diperiksa.
- Berikutnya `openapi.yaml` dan `sql-migration-plan.md`, lalu checklist signoff; jangan mencampur revisi produk baru dengan engineering yang rutin.
- Untuk Git gunakan nomor commit selanjutnya yang belum dipakai, contoh `07 - Finalisasi struktur database dan kontrak API NUTRASA` jika 07 belum digunakan.
