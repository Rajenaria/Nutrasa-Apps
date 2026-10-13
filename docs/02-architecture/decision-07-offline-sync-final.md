# NUTRASA — Decision 07: Finalisasi Offline Sync MVP

Status: **Diputuskan untuk desain MVP**  
Tanggal: 13 Oktober 2026  
Arsitektur: Expo + SQLite; Fastify API; PostgreSQL; Firebase Authentication.

## Keputusan

Gunakan **Server-Ordered Last Write Wins (LWW)**, yaitu perubahan terakhir yang **berhasil diterapkan secara transaksional oleh server** menjadi keadaan final. Ini menggantikan rumusan sebelumnya bahwa sistem bisa selalu mengetahui waktu tindakan fisik paling baru pada perangkat offline. Jam perangkat tidak dipakai sebagai otoritas konflik.

## Alasan

Pendekatan ini meminimalkan algoritma konflik, ketergantungan jam perangkat, dan interaksi penyelesaian konflik di MVP. Kelemahannya: edit offline yang lebih lama secara waktu tindakan dapat menimpa edit online yang lebih baru apabila baru terkirim belakangan. Risiko diterima untuk MVP dan harus diuji serta didokumentasikan.

## Perilaku minimum

1. Mobile melakukan **local-first write**: catatan dan operasi antrean disimpan dalam satu transaksi SQLite jika memungkinkan, lalu UI segera diperbarui.
2. Operasi antrean persisten mempunyai `operation_id` (UUID), scope akun, `device_id`, `device_sequence`, `entity_type`, `entity_id`, `kind`, dan payload kanonis. Waktu perangkat hanya diagnostik; bukan penentu konflik global.
3. Antrean diproses berurutan **per perangkat**, termasuk lintas entitas, menurut `device_sequence`; gap memicu retry/permintaan operasi hilang. Jangan mengurutkan berdasarkan selesai request jaringan. Retry memakai identity dan payload yang identik.
4. Server memvalidasi token dan ownership; gunakan UNIQUE(owner_user_id, operation_id). Mutasi, receipt dan feed satu transaksi atomik. Retry identik mengembalikan hasil tersimpan tanpa mutasi kedua; key sama payload berbeda ditolak.
5. Server menetapkan `server_revision` monotonik per entitas pada setiap perubahan yang diterima, dan `server_updated_at` untuk audit/tampilan. Revisi bersifat otoritatif; timestamp klien tidak menentukan pemenang.
6. Delete menghasilkan **tombstone**. UPDATE setelah tombstone wajib ditolak dengan `ENTITY_DELETED`; resurrection tidak aktif MVP. Pengguna dapat membuat catatan baru dengan ID baru, bukan menghidupkan ID lama.
7. Setelah push berhasil, mobile melakukan pull perubahan dari server menggunakan cursor/sync token server dan menyelaraskan SQLite. Tidak menghapus operasi antrean sampai ada acknowledgment server yang terverifikasi.
8. Antrean yang gagal karena jaringan tetap tersimpan dengan backoff; status UI: `Tersimpan di perangkat`, `Menyinkronkan`, `Tersinkron`, `Gagal — coba lagi`.
9. Logout mengikuti Decision 08: jika ada operasi belum tersinkron, tawarkan sinkronisasi, batal, atau logout dan hapus data lokal dengan konfirmasi.
10. Seluruh operasi dan cache dipisahkan per Firebase UID. Tidak pernah mengirim operasi akun sebelumnya dengan token akun lain.

## Aturan konsolidasi lokal

- Untuk perubahan berulang pada entitas yang **belum pernah dikirim**, klien boleh menggabungkan update menjadi keadaan terbaru, tetapi hanya jika tidak merusak urutan create/delete dan tidak mengubah kontrak idempotensi operasi yang sudah terkirim.
- Setelah operasi dikirim, jangan memodifikasi `operation_id`/payload-nya saat retry.

## Contoh konflik

- HP A offline mengubah log ke 200 g.
- HP B online mengubah log yang sama ke 150 g dan server menyimpannya.
- Saat HP A kemudian mengirim 200 g dan server menerimanya, hasil akhir 200 g karena urutan penerapan server. Ini **bukan jaminan tindakan terbaru secara waktu nyata**.

## API dan skema yang diperlukan (kontrak, belum kode)

- `sync_operations`: `owner_user_id`, `operation_id`, `device_id`, `device_sequence`, hash payload dan receipt immutable; UNIQUE(owner_user_id, operation_id), UNIQUE(owner_user_id, device_id, device_sequence).
- Food logs: stable UUID, owner UID, `server_revision`, `server_updated_at`, `deleted_at` (tombstone).
- Sync push: batch operasi berurutan dengan hasil per operasi dan error yang dapat di-retry.
- Sync pull: counter transaksional per pengguna melalui `user_sync_heads`, row lock sampai commit, feed PK(owner_user_id, cursor), watermark stabil dan pagination aman; bukan identity/sequence biasa atau timestamp. HTTP 410 `CURSOR_EXPIRED` mempertahankan outbox saat resync.
- Konflik atas delete, pergantian akun, edit beruntun dan retry dibahas eksplisit dalam `api-contract.md`.

## Skenario uji wajib

- Create offline lalu retry ganda menghasilkan satu log.
- Update 3 kali offline lalu online menghasilkan nilai terakhir dari perangkat yang sama.
- Update HP A offline vs HP B online mengikuti urutan diterima server.
- Menghapus entitas tidak dapat dibatalkan secara tidak sengaja oleh update terlambat.
- Koneksi mati setelah server commit sebelum acknowledgment: retry tetap idempotent.
- Pull beberapa perangkat menghasilkan data akhir sama.
- Logout dengan antrean belum tersinkron tidak menghapus tanpa konfirmasi.
- Akun B tidak dapat melihat/menyinkronkan operasi akun A.

## Yang tetap terbuka

- **OPEN:** typed payload per entitas, canonical hashing specification dan validasi OpenAPI penuh; desain cursor mengikuti [sync-protocol-final-design.md](sync-protocol-final-design.md), tetapi concurrency tests belum dijalankan.
- Kebijakan retensi tombstone dan rekam idempotensi agar klien lama tidak membangkitkan data terhapus.
- Detail keamanan SQLite/token serta uji perangkat nyata.

## Dokumentasi yang harus diselaraskan

`docs/04-development/decision-register.md`, `docs/02-architecture/database-schema.md`, `docs/02-architecture/api-contract.md`, dan spesifikasi offline sync yang tersimpan di repository.

**Tidak ada implementasi kode yang dilakukan pada tahap keputusan ini.**
