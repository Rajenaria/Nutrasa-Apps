# NUTRASA — Decision 03: Aturan Berat Badan, Recalculation & Histori Target

**Status:** Keputusan desain teknis final untuk MVP; detail implementasi harus konsisten dengan schema/API.  
**Tanggal:** 2026-10-13  
**Stack:** Expo + TypeScript; Firebase Auth; Fastify lokal; PostgreSQL lokal; Expo SQLite.  
**Jenis dokumen:** Spesifikasi keputusan, **bukan** SQL migration atau kode.

## 1. Keputusan dan tujuan

Setiap catatan berat baru yang valid memicu evaluasi otomatis apakah **berat acuan terkini** berubah. Jika berubah dan profil didukung, Nutrition Engine menghitung ulang target kalori dan makronutrien. Perubahan target hanya berlaku sejak aktivasi yang tercatat; histori target dan jurnal makanan tidak diubah secara retroaktif.

Ini mempertahankan keputusan produk sebelumnya (Decision 03: recalculate saat pencatatan berat valid) tanpa menyebabkan tanggal historis atau catatan berat yang dimasukkan belakangan mengubah target masa lalu atau menggeser target terkini tanpa alasan.

## 2. Istilah dan sumber kebenaran

- **weight_entry**: pengukuran berat (id, user_id, weight_kg, measured_at, created_at, updated_at, deleted_at, revision). `measured_at` adalah waktu pengukuran yang pengguna maksud, tidak sama dengan waktu sinkronisasi.
- **Berat acuan terkini**: pengukuran valid yang belum dihapus dengan `measured_at` paling baru dan tidak berada di masa depan. Jika ada tie, gunakan urutan deterministik dari server, bukan jam perangkat. Jika tidak ada catatan, gunakan berat onboarding yang masih valid sesuai aturan baseline.
- **Target version**: versi target hasil Nutrition Engine beserta metadata input, aturan/formula, waktu efektif, dan alasan perubahan; **append-only** untuk keperluan histori.
- **Effective time**: waktu aktivasi versi target yang ditetapkan backend pada saat perubahan diterima/diterapkan secara sah. Untuk offline, kalkulasi lokal hanya sementara sampai tersinkron.
- **Source of truth**: PostgreSQL untuk data tersinkron; SQLite untuk antrean dan tampilan offline sementara.

## 3. Aturan perilaku

| Kasus | Hasil | Dampak target |
|---|---|---|
| Tambah berat dengan `measured_at` lebih baru dari acuan saat ini | Simpan; acuan berganti | Hitung ulang jika nilai input berubah dan engine valid |
| Tambah data lampau ketika sudah ada pengukuran lebih baru | Simpan untuk riwayat grafik | Tidak menghitung ulang target terkini |
| Edit pengukuran yang merupakan acuan terbaru | Re-evaluasi acuan dan nilainya | Hitung ulang jika berubah |
| Edit pengukuran lama sehingga menjadi yang terbaru | Re-evaluasi urutan data | Hitung ulang jika acuan berubah |
| Hapus pengukuran terbaru | Tombstone; pilih acuan terbaru tersisa | Hitung ulang jika acuan berubah |
| Hapus atau edit pengukuran lama tanpa mengubah acuan | Riwayat grafik diperbarui | Target terkini tetap |
| Input berat di luar validasi atau profil tidak memenuhi cakupan | Tolak input tidak valid / tampilkan status engine tidak tersedia | Jangan buat target palsu; pertahankan versi terakhir sesuai status validitas, jangan tampilkan sebagai rekomendasi aktif jika sudah tidak valid |
| Dua catatan berat dengan waktu pengukuran sama | Pilih deterministik berdasarkan versi/urutan yang diterapkan backend | Perhitungan tidak tergantung urutan fetch |
| Pengukuran bertanggal masa depan | Tidak menjadi acuan; minta koreksi atau simpan sesuai aturan input UI yang disetujui | Tidak menghitung ulang |

**Penyempurnaan penting:** “setiap berat valid” berarti setiap penyimpanan memicu **evaluasi**, bukan harus membuat versi target baru ketika acuan/hasil target tidak berubah. Ini menghindari histori target berulang tanpa nilai baru.

## 4. Aturan histori dan tanggal

1. Catatan berat historis dapat dimasukkan atau dikoreksi tanpa memundurkan target yang sudah berlaku.
2. Target baru memiliki `effective_at` saat benar-benar diaktifkan; versi lama tetap disimpan dan memiliki rentang validitas historis yang jelas.
3. Food log tidak dihitung ulang akibat perubahan berat atau target. Nilai makanan tetap menggunakan snapshot nutrisi Decision 09.
4. Progress menggunakan target yang efektif pada waktu/tanggal terkait, tidak memakai target terbaru untuk seluruh masa lalu.
5. **Untuk agregat harian jika terjadi perubahan target di tengah hari:** agar UI MVP tidak membingungkan, gunakan target yang berlaku pada **akhir hari lokal pengguna** untuk pembanding ringkasan harian, sedangkan histori versi target menyimpan waktu efektif yang tepat. Aturan ini adalah **default implementasi yang masih perlu dicocokkan** ke Progress/API dan timezone per pengguna.
6. Hari lokal dihitung memakai timezone pengguna yang disimpan secara eksplisit; perubahan zona waktu tidak boleh diam-diam mengubah tanggal food log yang sudah tercatat.

## 5. Offline dan multi-perangkat

- Tulis `weight_entry` dan operasi antrean sinkronisasi secara atomik di SQLite.
- Setelah pencatatan berat offline, jalankan evaluasi di perangkat untuk pengalaman instan **jika** versi aturan Nutrition Engine yang digunakan cocok dengan kontrak server; tandai target sebagai `sementara / menunggu sinkronisasi`. Alternatif paling sederhana bila engine lokal belum siap: tampilkan berat baru dan status `target akan diperbarui setelah sinkronisasi`, **tanpa** mengklaim target terbaru.
- Saat operasi diproses backend, server memverifikasi auth, hak akses, validasi berat, identitas operasi, dan urutan sinkronisasi sesuai Decision 07.
- Setelah server menetapkan keadaan final, hitung ulang dari berat acuan final dan berikan snapshot target kanonis. Rekonsiliasi ke SQLite.
- Pengiriman ulang operasi yang sama tidak boleh menambah weight entry atau target version baru (idempotency).
- Perubahan dari perangkat lain dapat menyebabkan target lokal sementara dikoreksi. UI memberi status sync dan tidak menyembunyikan kegagalan.

## 6. Ketepatan angka dan keamanan

- Kalkulasi hanya untuk orang dewasa 18+ dengan profil yang didukung (Decision 04).
- Target otomatis saja pada MVP; pengaturan manual ditunda (Decision 02).
- Engine memakai parameter yang disetujui dan diberi versi (`engine_version`, `input_snapshot`, `calculated_at`, `effective_at`); parameter klinis/safety perlu review ahli sebelum rilis publik.
- Jangan menjadikan target lama sebagai rekomendasi yang masih berlaku ketika profil terbaru gagal memenuhi validasi.
- Backend melakukan validasi dan otorisasi dari Firebase ID token; jangan percaya `user_id` yang dikirim client.
- Audit pembaruan data berat dan target tidak boleh mengekspos data sensitif pada log operasional.

## 7. Perubahan schema/API yang diperlukan (rencana, belum implementasi)

**PostgreSQL:** `weight_entries` (UUID, owner, measured_at, weight_kg, revision, tombstone, timestamps); `nutrition_target_versions` (owner, source_weight_entry_id nullable, input_snapshot, engine_version, computed values, calculated_at, effective_at, superseded_at nullable, status). Constraint, indeks `(user_id, measured_at DESC)` dan indeks `effective_at` harus ditinjau bersama schema.

**API:** buat/list/edit/hapus weight entry; semua write punya idempotency key, response berisi berat acuan terpilih, status target (`active`, `pending_sync`, `unavailable`) dan target version id jika tersedia; progress menerima histori target berlaku dan status kelengkapan nutrisi. Endpoint detail mengikuti final API Contract, jangan menetapkan path baru sembarangan.

**Perlindungan histori:** hindari update yang menimpa target version lama; perubahan efektif hanya melalui versi baru. Saat koreksi berat backdated, riwayat pengukuran dapat berubah tetapi target historis tidak ditulis ulang.

## 8. Skenario uji wajib

1. Berat onboarding 75 kg → catatan 73 kg terbaru → target berubah sesuai engine valid.
2. Input 74 kg untuk minggu lalu → target terkini tidak berubah.
3. Edit 73 kg menjadi 72 kg → target berubah sekali, versi lama bertahan.
4. Hapus catatan acuan → pilih catatan valid terbaru berikutnya dan evaluasi target.
5. Input invalid → tidak muncul target tak sah.
6. Kirim operasi offline berulang → tidak ada entri/versi target ganda.
7. Perangkat A offline dan B online → hasil final sesuai Decision 07, state konvergen.
8. Progress hari lampau → memakai target historis, bukan target terkini.
9. Catatan makanan historis tetap sama setelah target berubah.
10. Pindah zona waktu → tanggal log dan perbandingan historis stabil.
11. Tidak ada berat tersisa → pakai fallback onboarding bila valid; selain itu target unavailable.
12. Profil berubah menjadi tidak didukung → tidak terus menampilkan target sebagai rekomendasi aktif.

## 9. Keputusan terkait dan batasan

- Decision 01: email verification opsional; akses utama tetap dibuka dengan autentikasi sah.
- Decision 02: target hanya otomatis saat MVP.
- Decision 04: MVP 18+ dengan profil didukung.
- Decision 07: offline sync Server-Ordered LWW, bukan klaim waktu tindakan sebenarnya lintas perangkat; operasi idempotent; tombstone dipertahankan.
- Decision 08: cache pribadi dibersihkan setelah logout sesuai konfirmasi dan kebijakan data offline.
- Decision 09: snapshot makanan historis tidak ditimpa revisi katalog.
- Decision 10: hari tidak dicatat bukan nol; target historis tetap; Hari Aktif vs Hari Selesai terpisah.

## 10. Status sign-off

**Keputusan perilaku inti final.** Masih memerlukan penyelarasan di `nutrition-engine-spec.md`, `progress-spec.md`, `database-schema.md`, `api-contract.md`, `offline-sync-spec.md`, dan `decision-register.md`, serta validasi Nutrition Engine sebelum rilis publik. Belum ada coding atau migration.

**Rekomendasi commit Git (nomor sesuaikan riwayat aktual):** `05 - Tetapkan aturan berat badan dan riwayat target`.
