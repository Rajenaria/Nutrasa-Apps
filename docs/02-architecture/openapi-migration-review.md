# NUTRASA — OpenAPI & Migration Review

**Tanggal:** 13 Oktober 2026  
**Status:** Draft spesifikasi; belum implementasi atau release sign-off.

## Artefak

- `openapi.yaml` — **OpenAPI 3.1** desain endpoint awal, 50 operasi pada 36 path, menggunakan Firebase bearer auth, skema 11 nutrisi, desimal string, dan error umum.
- `sql-migration-plan.md` — urutan 13 kelompok migrasi dan checklist verifikasi, **tanpa kode SQL**.
- Referensi normatif: `database-schema.md` dan `api-contract.md` v1.2 dari paket Engineering Finalization. Jika ada perbedaan semantik, **v1.2 Markdown berlaku sementara** sampai OpenAPI diperbaiki.

## Pemeriksaan konsistensi

- Email tidak diverifikasi bukan alasan menolak fitur inti.
- Goal hanya AUTO, LOG_ONLY tidak tersedia di MVP.
- Nutrisi 11 nilai decimal-string nullable, empat nutrisi utama wajib saat publikasi katalog.
- `NO_LOGS` dipisahkan dari angka nol; completion tidak mengubah coverage nutrisi.
- Snapshot food log tidak dimutasi oleh revisi katalog.
- Sinkronisasi server-ordered last-applied-write-wins, idempotency receipts, tombstone, recovery cursor expired.
- Data privat tidak menerima `owner_user_id` dari pengguna.

## Batasan yang HARUS ditutup sebelum kode backend dibangun

1. Beberapa endpoint masih memakai **objek generik** untuk payload, terutama recipe/custom food/saved meals, analytics points, dan change feed; formal-kan DTO dan contoh per endpoint.
2. Enum `meal_type`, `goal_type`, `activity_level`, `calculation_parameter` harus diturunkan dari business rules dan nutrition engine final. Jangan asal menebak enum.
3. Mutasi REST dan sync push harus menggunakan satu domain operation contract yang terdefinisi; saat ini REST belum mempunyai metadata operation-id eksplisit. Tambahkan header `Idempotency-Key`/envelope seragam sebelum implementasi.
4. Pastikan status code create/delete/async deletion (201/202/204 bila sesuai), dan error-specific 409/410/422 tercantum konsisten untuk setiap operasi terkait.
5. Kontrak ownership typed source revision untuk katalog/custom/resep perlu skema union diskriminator yang tegas.
6. Request/response onboarding dan session masih perlu field persetujuan dan keadaan token verifikasi yang presisi.
7. Response progress/weights harus membawa jumlah seri yang lengkap (hari kosong vs tidak lengkap, target historis, time zone), bukan placeholder generic.
8. Sync push result perlu menampilkan recovery action, entity revision, server-applied sequence dan rejection payload yang aman. Full-resync reset harus mempertahankan outbox.
9. Transaksi account deletion Firebase + PostgreSQL tidak atomik; tetapkan status state machine, retention dan status pada sesi yang sudah tidak berlaku.
10. OpenAPI local server URL hanyalah contoh; Expo pada perangkat fisik memerlukan alamat host jaringan yang benar.

**Kesimpulan:** Dokumen ini adalah rancangan pertama yang berguna untuk alignment dan perencanaan. **Jangan menyatakan OpenAPI final / siap generate client** sebelum sepuluh gap di atas ditutup dan validator OpenAPI dijalankan.
