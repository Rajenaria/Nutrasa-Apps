# NUTRASA — Feature Scope & Priorities

> Draft scope konsolidasi (2026-10-13). P0 berarti target MVP setelah gate terpenuhi; **bukan** persetujuan otomatis untuk merilis fitur berisiko.

**O-18 RESOLVED — keputusan owner M00-03A:** favorit makanan, recent foods, custom food sederhana, dan salin catatan makanan masuk MVP; resep buatan pengguna post-MVP. Riwayat perbedaan prioritas tetap tercatat di [decision-register.md](../04-development/decision-register.md#o-18--prioritas-rilis-resep-dan-favorit).

| ID | Fitur | Tahap | Kriteria cakupan |
|---|---|---|---|
| F-01 | Firebase Authentication | P0 | Email/password, Google/Apple sesuai platform; verifikasi opsional di Profil > Pengaturan > Data Diri; fitur utama tidak diblokir; reauth tindakan sensitif, reset, logout, isolasi akun |
| F-02 | Onboarding interaktif | P0 | Satu pertanyaan aktivitas, body type opsional, target berat wajib cutting/bulking, draft lokal |
| F-03 | Nutrition engine | P0 gated | Estimasi energi, preset otomatis berbasis profil, makro, validasi, versioning; clinical review wajib |
| F-04 | Eligibility MVP | P0 | Dewasa 18+ dengan profil didukung; tidak ada LOG_ONLY aktif atau target numerik untuk profil tidak eligible |
| F-05 | Food catalogue Indonesia | P0 | 100 makanan terkurasi → 500; alias/kategori/provenance/revision/review; sumber berizin dan empat nutrisi inti tersedia pada katalog published |
| F-06 | Search, browse, detail, portion | P0 | Cari berdasarkan nama/alias/kategori, input g/ml dan porsi terdefinisi |
| F-07 | Journal/meal log | P0 | Sarapan/siang/malam/camilan, tanggal, create/edit/delete, snapshot, partial coverage |
| F-08 | Custom foods sederhana | P0 — O-18 final | Privat; validasi nutrisi inti dan nilai tambahan null dipertahankan |
| F-09 | Custom recipes | Post-MVP — O-18 final | Builder multi-ingredient/yield tidak aktif MVP; spesifikasi disimpan untuk pengembangan setelah MVP |
| F-10 | Recent & favorites | P0 — O-18 final | Recent dari catatan; favorit makanan eksplisit; keduanya MVP |
| F-11 | Copy meal / saved meals | P0 | Salin catatan MVP sesuai O-18, dengan ID baru/snapshot independen; scope saved meals terpisah tidak diubah oleh keputusan O-18 |
| F-12 | Home dashboard | P0 | Kalori, tiga makro, kalender, jurnal; data kosong/parsial dan target belum tersedia tanpa angka palsu |
| F-13 | Progress | P0 | Grafik kalori/makro/berat/konsistensi, data null dan histori target |
| F-14 | Profile/settings | P0 | Data tubuh, tujuan, target otomatis dan histori, akun; target manual post-MVP |
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
