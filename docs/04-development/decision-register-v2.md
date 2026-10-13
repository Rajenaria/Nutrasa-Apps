# NUTRASA — Decision Register v2 (Keputusan Produk 01–10)

**Tanggal:** 13 Oktober 2026  
**Status:** 10 keputusan produk disetujui pemilik produk; rincian teknis dan pemeriksaan eksternal di bawah **belum otomatis disetujui**.  
**Landasan:** Percakapan persetujuan produk; menggantikan usulan yang bertentangan dalam `decision-register.md` lama. **Jangan menimpa file lama tanpa membandingkan/menggabungkan.**

## A. Keputusan produk disetujui

| ID | Status | Keputusan final | Implikasi implementasi |
|---|---|---|---|
| D01 | APPROVED | Verifikasi email opsional; fitur utama termasuk onboarding dan sync tetap tersedia bagi akun yang telah terautentikasi. Jika tindakan tertentu memerlukan verifikasi, arahkan ke Profil → Pengaturan → Data Diri (status, verifikasi, kirim ulang). | Hapus asumsi `email_verified` sebagai prasyarat umum untuk penyimpanan/sinkronisasi; tindakan sensitif tetap memakai kontrol Firebase dan reautentikasi bila perlu. |
| D02 | APPROVED | Target kalori dan makro **otomatis saja** pada MVP; kontrol target manual post-MVP. | Sembunyikan UI target manual pada MVP; jangan hilangkan jalur migrasi masa depan. |
| D03 | APPROVED | Setiap catatan berat valid terbaru memicu evaluasi/perhitungan ulang otomatis; target lama terjaga dalam histori. | Perlu aturan tanggal efektif, pembaruan mundur, edit/hapus berat, penanganan sinkronisasi. |
| D04 | APPROVED | MVP hanya menerima pengguna **18+** dengan profil yang didukung perhitungan. | Revisi draft lama yang menjanjikan log-only untuk profil tak didukung. Penyaringan profil dan aspek legal masih butuh detail. |
| D05 | APPROVED | Katalog internal terkurasi multi-sumber berizin: target 100 makanan → 500; catat asal/metode/revisi/status review; patuhi hak penyimpanan/atribusi sumber. | Persetujuan hak data dilakukan **per sumber**, bukan otomatis karena dipublikasikan online. |
| D06 | APPROVED | sugar_g adalah field gula total kanonis; total_sugar_g istilah lama, bukan API/DB aktif. Empat nutrisi inti katalog published wajib ditinjau; tambahan boleh null. Agregat parsial nonnegatif menampilkan >= nilai diketahui + Data parsial; seluruhnya unknown —, bukan 0. | Pertahankan 11 field, coverage per nutrisi dan null != zero di dashboard/progress; jangan mengubah makna gula total menjadi gula bebas. |
| D07 | APPROVED DESIGN; implementation/tests OPEN | Server-ordered Last Write Wins: perubahan valid terakhir berhasil diterapkan transaksional server menang, bukan waktu perangkat. | Outbox persisten berurutan per-device; UNIQUE(owner_user_id, operation_id), identity/payload identik saat retry; UPDATE tombstone ditolak ENTITY_DELETED; cursor counter transaksional per pengguna. Lihat sync-protocol-final-design.md. |
| D08 | APPROVED | Privasi ketat: bersihkan data pribadi lokal saat logout; untuk antrean tertunda beri pilihan sinkron dahulu, batal, atau hapus dengan konfirmasi kehilangan; isolasi akun; proses hapus akun koordinasikan Firebase, PostgreSQL, dan perangkat. | Wajib desain penghapusan idempotent/retry, keamanan token, data SQLite, pembatasan backup dan audit. |
| D09 | APPROVED | Food log menyimpan snapshot nutrisi dan versi asal; perubahan katalog tidak mengubah histori. Edit/hapus/salin diperbolehkan; edit porsi hitung ulang dari versi terkait; salinan memiliki ID baru, snapshot asal independen. | Perlu menyimpan nilai komposisi dasar/versi yang cukup untuk menghitung ulang secara konsisten; tombstone delete untuk sync. |
| D10 | APPROVED | Hari tanpa food log bukan nol; target historis sesuai waktu efektif; Hari Aktif = minimal satu log; Selesai Mencatat opsional/terpisah; nutrisi parsial ditandai. | Zona waktu serta perubahan tanda selesai setelah edit/delete masih perlu fixtures/keputusan rinci; completion tidak mengubah nutrient coverage. |
| O-18 | RESOLVED — owner M00-03A | Favorit makanan, recent foods, custom food sederhana dan salin catatan makanan MVP; resep buatan pengguna post-MVP. | Endpoint/model resep bukan scope MVP; histori di decision-register.md; scope saved meals terpisah tidak diubah. |

## B. Stack yang telah dipilih

- Expo + React Native + TypeScript + Expo Router.
- Firebase Authentication dari proyek yang sudah dimiliki.
- Node.js/Fastify **lokal** + PostgreSQL **lokal** untuk development biaya layanan Rp0.
- Expo SQLite untuk pencatatan offline/cache lokal. Pindah backend/database ke cloud baru saat kebutuhan beta/produksi muncul.
- Backend menjadi trust boundary; verifikasi Firebase ID token dan otorisasi setiap objek pengguna.

## C. Daftar hambatan teknis/keamanan sebelum sign-off

| Kode | Prioritas | Yang belum diputuskan/diuji | Kriteria penutupan |
|---|---|---|---|
| B01 | P0 sebelum implementasi sync multi-perangkat | Kebijakan D07 RESOLVED: server-ordered LWW dengan counter transaksional per pengguna; jam perangkat bukan otoritas. | OPEN: typed payload, canonical hashing, idempotency/concurrency/device-order tests, tombstone dan resync; jangan mengklaim desain sudah teruji. |
| B02 | P0 sebelum implementasi tujuan/progress | D03/D10: tanggal/waktu efektif target, zona waktu, backdated weight, edit/delete berat, beberapa berat per hari. | Aturan deterministik dan test case histori; rekalkulasi target tidak menulis ulang perbandingan historis tanpa ketentuan. |
| B03 | P0 sebelum onboarding | D04: daftar atribut/profil didukung, skrining kondisi khusus, pesan tidak memenuhi syarat, ketentuan usia. | Matriks eligibility dan kondisi gagal divalidasi; tidak ada target untuk pengguna di luar cakupan. |
| B04 | P0 sebelum mengaktifkan rekomendasi target ke user/beta | Rumus dan parameter engine (activity multiplier, cut/bulk, protein, fat, guardrails) belum disetujui ahli terkait. | Kajian nutrisi yang kompeten + skenario pengujian; jangan mengklaim validasi medis. |
| B05 | P0 sebelum katalog diterbitkan | Hak penggunaan/redistribusi tiap sumber; mutu referensi dan perhitungan resep, yield dan household measures. | Registry provenance & lisensi, bukti izin, review 100 makanan; bukan impor massal otomatis. |
| B06 | P0 sebelum menyimpan data sensitif lintas akun | Proteksi SQLite (enkripsi/backup), token, batas logging, logout sambil offline, pemulihan proses penghapusan sebagian. | Threat model, keputusan teknis tersurat, pengujian isolasi antar-akun/hapus data. |
| B07 | P0 sebelum API/schema freeze | OPEN: typed mutation/sync DTO, canonical payload hashing, decimal/coverage/snapshot validation, runtime ownership, error/rate-limit wiring. Field sugar_g, CURSOR_EXPIRED dan idempotency per owner sudah final. | Validasi semantik OpenAPI 3.1 termasuk examples/responses, contract tests dan migrasi teruji; pemeriksaan YAML/ref dasar bukan sign-off. |
| B08 | P0 implementasi auth/social | OPEN: kompatibilitas Firebase SDK/persistensi dengan Expo 57, Google/Apple, redirect/dev build, reauth, keamanan backend. Email opsional sudah final. | Proof of concept Android/iOS sesuai cakupan, token/ownership tests; jangan menganggap SDK dipilih/terpasang atau sesi aman otomatis. |
| B09 | P0 review privacy/beta | Notice/privacy, persetujuan dan retensi, penghapusan permanen vs audit, dasar pemrosesan data sensitif. | Review legal/privacy dan kebijakan yang dapat ditampilkan pengguna. |
| B10 | P1 sebelum UX Progress stabil | Mark `Selesai Mencatat` saat log ditambah/dihapus sesudahnya; agregasi lintas tengah malam/waktu lokal. | Tetapkan perilaku yang konsisten dan uji kasus. |
| B11 | Beta deployment | HTTPS, backup database, monitoring, rahasia env, biaya layanan/limit, layanan selalu aktif. | Checklist deployment sebelum tester eksternal. |

## D. Perubahan wajib pada dokumentasi lama

1. `auth-spec.md`, `onboarding-spec.md`, `profile-spec.md`, `api-contract.md`: verifikasi email opsional, halaman Data Diri.
2. `nutrition-engine-spec.md`, `business-rules.md`, `database-schema.md`, `api-contract.md`: mode target hanya otomatis pada MVP; kriteria 18+ didukung; pemicu berat; target historis.
3. offline-sync-spec.md dan api-contract.md: server-ordered LWW, per-owner idempotency, persistent device sequence, ENTITY_DELETED, counter transaksional per pengguna dan HTTP 410 CURSOR_EXPIRED; pilihan desain final, implementasi/tests OPEN.
4. `food-database-spec.md`, `food-logging-spec.md`, `database-schema.md`: provenance/lisensi, nilai `null`, nutrisi wajib pada food published, snapshot dan version pinning.
5. `dashboard-spec.md`, `progress-spec.md`: kelengkapan per nutrisi, target historis, hari kosong, Hari Aktif, Hari Selesai.
6. `review-signoff-checklist.md`, `documentation-audit.md`, `development-task-board.md`: tutup isu produk yang telah diputuskan; biarkan isu teknis/legal/klinis tetap terbuka.

## E. Batas status dokumen

**Keputusan produk 01–10: FINAL dalam ruang lingkup produk.**  
**Dokumen teknis: BELUM FREEZE.**  
**Implementasi SQL, OpenAPI, dan kode: belum disetujui oleh dokumen ini.**  
**Rilis publik dan perhitungan nutrisi otomatis yang ditampilkan ke pengguna: menunggu pengujian dan review keamanan/privasi/nutrisi/lisensi.**

## F. Format commit proyek

Setelah integrasi dan pemeriksaan diff di branch dokumentasi: `03 - Finalisasi keputusan fitur dan catatan review NUTRASA`.
