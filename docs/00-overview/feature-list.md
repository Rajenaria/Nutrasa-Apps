# NUTRASA — Feature Scope & Priorities

> Draft scope konsolidasi (2026-10-13). P0 berarti target MVP setelah gate terpenuhi; **bukan** persetujuan otomatis untuk merilis fitur berisiko.

**Prioritas resep/favorit belum disetujui:** draft paket menempatkannya di P0, roadmap lama setelah MVP, dan API draft di P1. Mengikuti arahan owner saat merge, gunakan [O-18](../04-development/decision-register.md#o-18--prioritas-rilis-resep-dan-favorit); jangan menganggap label draft sebagai keputusan rilis.

| ID | Fitur | Tahap | Kriteria cakupan |
|---|---|---|---|
| F-01 | Firebase Authentication | P0 | Email/password, Google/Apple sesuai platform, verification, reset, logout, isolasi akun |
| F-02 | Onboarding interaktif | P0 | Satu pertanyaan aktivitas, body type opsional, target berat wajib cutting/bulking, draft lokal |
| F-03 | Nutrition engine | P0 gated | Estimasi energi, preset otomatis berbasis profil, makro, validasi, versioning; clinical review wajib |
| F-04 | Log-only | P0 | Profil unsupported dapat logging tanpa rekomendasi otomatis |
| F-05 | Food catalogue Indonesia | P0 | 20 pilot → 100 reviewed; alias/kategori/provenance; nutrisi core tersedia |
| F-06 | Search, browse, detail, portion | P0 | Cari berdasarkan nama/alias/kategori, input g/ml dan porsi terdefinisi |
| F-07 | Journal/meal log | P0 | Sarapan/siang/malam/camilan, tanggal, create/edit/delete, snapshot, partial coverage |
| F-08 | Custom foods | P0 | Privat dan memiliki validasi nutrisi inti |
| F-09 | Custom recipes | OPEN — O-18 | Multi-ingredient, hasil jadi/yield, penanganan nilai tak diketahui; prioritas rilis menunggu keputusan owner |
| F-10 | Recent & favorites | Recent: P0 draft; favorites: OPEN — O-18 | Akses cepat makanan yang dicatat dan favorit; jangan mengubah recent hanya karena prioritas favorit belum diputuskan |
| F-11 | Copy meal / saved meals | P0 | Salin tanpa mengubah sumber; mekanisme offline harus didefinisikan |
| F-12 | Home dashboard | P0 | Kalori, tiga makro, kalender, jurnal, log-only state |
| F-13 | Progress | P0 | Grafik kalori/makro/berat/konsistensi, data null dan histori target |
| F-14 | Profile/settings | P0 | Data tubuh, tujuan, preferensi, target manual vs otomatis, akun |
| F-15 | Offline-tolerant | P0 | SQLite, outbox, retry idempoten, account isolation, conflict handling |
| F-16 | Account privacy | P0 gated | Disclosure, hak akses/hapus/ekspor sesuai hasil review legal |
| F-17 | Admin katalog internal | P0 tooling | Minimum import/validasi/review, tidak wajib dashboard admin penuh |
| F-18 | Water tracker | P1 | Opsional |
| F-19 | Sleep/activity tracker | P1 | Opsional |
| F-20 | Reminder notifications | P1 | Opt-in setelah pengguna memahami fitur |
| F-21 | Barcode / kemasan | P1 | Bergantung data dan hak akses |
| F-22 | AI tracking / premium | P2 | Belum aktif dan belum perlu integrasi SDK |

## Batasan scope
- Semua screen punya loading, empty, partial, retry, unsupported, dan offline-state sesuai konteks.
- Tidak ada food entry publik tanpa review sumber dan lisensi.
- Tidak ada prediksi penurunan berat badan yang disajikan sebagai kepastian.
- UI mockup berisi angka contoh, tidak menjadi aturan kalkulasi.

## Definisi selesai per fitur
Specification disetujui → schema/contract konsisten → implementasi satu vertical slice → validasi unit/integrasi → UX/accessibility → observability → owner acceptance. Status progres ada di [docs/04-development/development-task-board.md](../04-development/development-task-board.md).
