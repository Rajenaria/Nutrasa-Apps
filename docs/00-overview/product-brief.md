# NUTRASA — Product Brief

> Status: PRODUCT BASELINE / draft terkonsolidasi, bukan klaim kesiapan klinis maupun legal. Versi review: 2026-10-13.

## Visi dan masalah
NUTRASA adalah aplikasi pelacak makanan, kalori, dan nutrisi dengan pendekatan **Indonesia-first**. Masalah utama yang diselesaikan: sulitnya menemukan makanan Nusantara dengan identitas, ukuran porsi, dan informasi nutrisi yang bisa ditelusuri; serta sulitnya memantau pola makan dengan pengalaman mobile yang sederhana.

## Audiens dan batasan
- Visi jangka panjang: semua kelompok pengguna di Indonesia.
- MVP kalkulator otomatis: dewasa yang lolos skrining kelayakan. Anak/remaja, kehamilan/menyusui, dan kondisi medis dengan kebutuhan khusus **tidak menerima kalkulasi standar**.
- **Log-only mode** direncanakan untuk profil di luar dukungan kalkulator: mencatat asupan tanpa target otomatis. Ini bukan persetujuan akses tanpa batas bagi anak/remaja atau kelompok sensitif; eligibility legal tetap terbuka pada O-12.
- Bukan layanan diagnosis medis, saran klinis individual, atau pengganti ahli gizi.

## Diferensiasi
1. Katalog makanan Nusantara terkurasi: pilot 20 → rilis 100 makanan → perluasan menuju 500; utamakan kualitas daripada kuantitas.
2. Pilihan satuan rumah tangga terverifikasi per makanan, bukan konversi global yang ditebak.
3. Metadata sumber dan tanda nutrisi tidak lengkap; `null` bukan nol.
4. Jurnal offline-tolerant dengan sinkronisasi dan status yang terbaca.
5. Desain compact, clean, forest-green/cream dengan logo resmi dan Bowi strategis; progres ring pada Home.

## User journey ringkas
Splash/session → register/login Firebase (email, Google, Apple sesuai dukungan platform) → pemberitahuan data & onboarding interaktif → skrining kelayakan → target otomatis hanya jika layak / log-only → dashboard → cari makanan → atur porsi → catat → progress/profile.

## Sasaran MVP yang sudah dipilih
- Login dan onboarding, target nutrisi otomatis yang **belum boleh dirilis sebelum review klinis**.
- Pencarian katalog, detail, kategori, porsi, custom food, recent, copy meal. Resep pribadi dan favorit tetap direncanakan, tetapi prioritas rilisnya OPEN menurut O-18; belum dipastikan masuk MVP.
- Jurnal empat waktu makan, edit/hapus, kalender, ringkasan 11 nutrisi dengan parsial coverage.
- Target otomatis/manual tervalidasi, histori target, berat badan dan grafik konsistensi.
- Offline-tolerant, keamanan akun, privasi dan penghapusan akun (pelaksanaan memerlukan review legal).
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
Review klinis algoritma dan safety guardrails; perizinan/atribusi sumber pangan; ketentuan privasi Indonesia; Firebase provider/platform verification; strategi keamanan dan sinkronisasi multi-device; hosting HTTPS/backup untuk beta publik.

## Referensi internal
[docs/00-overview/feature-list.md](feature-list.md), [docs/02-architecture/nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md), [docs/02-architecture/food-database-spec.md](../02-architecture/food-database-spec.md), [docs/04-development/decision-register.md](../04-development/decision-register.md).
