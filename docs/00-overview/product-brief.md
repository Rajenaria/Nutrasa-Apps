# NUTRASA — Product Brief

> Status: PRODUCT BASELINE / draft terkonsolidasi, bukan klaim kesiapan klinis maupun legal. Versi review: 2026-10-13.

## Visi dan masalah
NUTRASA adalah aplikasi pelacak makanan, kalori, dan nutrisi dengan pendekatan **Indonesia-first**. Masalah utama yang diselesaikan: sulitnya menemukan makanan Nusantara dengan identitas, ukuran porsi, dan informasi nutrisi yang bisa ditelusuri; serta sulitnya memantau pola makan dengan pengalaman mobile yang sederhana.

## Audiens dan batasan
- Visi jangka panjang: semua kelompok pengguna di Indonesia.
- MVP hanya pengguna **18+ dengan profil eligible**. Anak/remaja, kehamilan/menyusui, dan profil dengan kebutuhan khusus di luar dukungan tidak menerima target standar.
- Tidak ada mode **LOG_ONLY** aktif pada MVP. Detail skrining profil dan review legal/klinis tetap OPEN; jangan memberi akses pencatatan sebagai fallback untuk profil tidak eligible.
- Bukan layanan diagnosis medis, saran klinis individual, atau pengganti ahli gizi.

## Diferensiasi
1. Katalog makanan Nusantara terkurasi: target 100 makanan → perluasan menuju 500, dengan review mutu dan hak sumber.
2. Pilihan satuan rumah tangga terverifikasi per makanan, bukan konversi global yang ditebak.
3. Metadata sumber dan tanda nutrisi tidak lengkap; `null` bukan nol.
4. Jurnal offline-tolerant dengan sinkronisasi dan status yang terbaca.
5. Desain compact, clean, forest-green/cream dengan logo resmi dan Bowi strategis; progres ring pada Home.

## User journey ringkas
Splash/session → register/login Firebase → onboarding (verifikasi email opsional) → skrining 18+ dan profil eligible → target AUTO valid → dashboard → cari makanan → atur porsi → catat → progress/profile. Target belum valid ditampilkan sebagai pending/review, bukan target palsu atau mode LOG_ONLY.

## Sasaran MVP yang sudah dipilih
- Login dan onboarding serta fitur utama tetap tersedia untuk akun terautentikasi tanpa wajib verifikasi email; target AUTO belum boleh dirilis sebelum review klinis.
- Pencarian katalog, detail, kategori, porsi, custom food sederhana, recent foods, favorit makanan dan copy food log termasuk MVP. Resep buatan pengguna post-MVP (O-18 RESOLVED); scope saved meals terpisah tidak diubah.
- Jurnal empat waktu makan, edit/hapus, kalender, ringkasan 11 nutrisi dengan parsial coverage.
- Target **AUTO saja**, histori target, berat badan dan grafik konsistensi. Kontrol target manual post-MVP; hari tanpa log bukan nol dan snapshot nutrisi tetap dipertahankan.
- Offline dengan server-ordered LWW, retry idempotent per owner dan cursor transaksional per owner; privasi ketat, isolasi akun serta pembersihan data pribadi lokal saat logout sesuai Decision 08. Antrean tertunda: sinkron dahulu, batal logout, atau hapus dengan konfirmasi kehilangan data.
- AI dan premium adalah pengembangan berikutnya; tampilan mockup tidak menandakan fungsi tersedia.

## Keputusan teknologi
React Native + Expo + TypeScript, Expo Router; Firebase Authentication (project sudah ada); Fastify lokal + PostgreSQL lokal; Expo SQLite untuk data offline. Biaya layanan development ditargetkan Rp0; perangkat, jaringan, distribusi dan opsi cloud beta tidak dihitung sebagai gratis permanen.

## Ukuran keberhasilan (target angka belum ditetapkan)
- Pengguna dapat mencatat makanan Nusantara secara cepat dan akurat terhadap referensi katalog.
- Tidak ada food log yang hilang atau terduplikasi pada simulasi offline/retry.
- Tidak ada akses lintas akun terhadap data pribadi.
- Data nutrisi parsial ditampilkan jujur dan target historis tetap konsisten.
- Pengguna dapat menyelesaikan alur onboarding tanpa kehilangan progres.

## Ketergantungan sebelum rilis
Review klinis dan eligibility; hak/atribusi sumber pangan; review legal/privasi; kompatibilitas Firebase SDK Expo 57 dan provider; typed payload sync, hashing dan pengujian concurrency; pengujian SQLCipher; validasi semantik OpenAPI; hosting HTTPS/backup beta tetap OPEN.

## Referensi internal
[docs/00-overview/feature-list.md](feature-list.md), [docs/02-architecture/nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md), [docs/02-architecture/food-database-spec.md](../02-architecture/food-database-spec.md), [docs/04-development/decision-register.md](../04-development/decision-register.md).
