# NUTRASA — Visual Reference & Asset Guidelines

> **Status:** Instruksi interpretasi aset untuk desainer, developer, dan AI coding/design agent.
> **Tujuan:** Mempertahankan identitas NUTRASA sambil memberi ruang untuk meningkatkan kualitas UI/UX.
> **Cakupan:** File referensi visual, logo, maskot, tipografi, warna, ikon, dan contoh tata letak yang disertakan dalam paket aset.

## 1. Pesan utama untuk AI agent

Paket ini berisi sejumlah referensi desain NUTRASA yang dikumpulkan selama proses pengembangan. **Tidak semua contoh merupakan desain final atau spesifikasi pixel-perfect.** Referensi dapat memperlihatkan perbedaan logo, maskot, font, warna, ukuran elemen, maupun peletakan komponen karena dibuat pada tahap eksplorasi.

**Logo dan maskot final adalah aset yang disediakan di folder khusus `logo/` dan `mascot/` (atau folder final dengan nama sepadan yang jelas).** Gunakan versi final tersebut sebagai sumber identitas visual; jangan mengganti dengan logo/maskot dari gambar referensi lama. Jika ada beberapa kandidat di folder final tanpa penanda yang jelas, **minta konfirmasi**, jangan memilih sendiri berdasarkan tebakan.

Referensi desain dimaksudkan untuk menyampaikan **arah visual, nuansa, kepribadian merek, dan pengalaman aplikasi**—bukan untuk menuntut agar setiap tombol, card, posisi, atau komponen disalin persis. AI agent **boleh dan diharapkan mengembangkan desain** selama tetap sejalan dengan karakter NUTRASA dan kebutuhan fungsional aplikasi.

## 2. Hierarki sumber kebenaran

Jika ditemukan perbedaan atau konflik, gunakan prioritas berikut:

1. **Keputusan produk dan spesifikasi fitur NUTRASA yang sudah disetujui** (fungsi, alur, keamanan, aksesibilitas, dan validasi).
2. **Aset identitas resmi terbaru di folder `logo/` dan `mascot/`** (bentuk/logo/maskot, proporsi, dan varian yang sudah dinyatakan final).
3. **Design system final yang nantinya disetujui** di [docs/01-design/design-system.md](design-system.md).
4. **Arahan visual lintas referensi** dalam paket ini (suasana, ilustrasi, bahasa bentuk, dan karakter umum).
5. **Contoh layout/screen individual** (inspirasi, bukan blueprint wajib).

Jika design system belum final, **jangan menganggap pilihan warna atau font dalam screenshot sebagai aturan resmi**. Buat usulan yang konsisten beserta alasan, lalu tandai untuk review.

## 3. Logo dan maskot

- Gunakan **file asli final** dari direktori resmi. Jangan melakukan redraw, stylization, generasi ulang, atau modifikasi bentuk karakter/logo tanpa izin eksplisit.
- Pertahankan proporsi dan identitas; jangan meregangkan, memotong bagian penting, atau memberi efek yang merusak keterbacaan.
- Maskot boleh dipakai secara kontekstual di welcome, onboarding, empty state, dan micro-interaction **jika tersedia varian aset yang sesuai**.
- Jangan mengasumsikan ekspresi atau pose baru tersedia; jika perlu pose baru, catat sebagai kebutuhan desain, bukan membuatnya diam-diam.
- Pastikan implementasi memakai format dan resolusi yang sesuai dengan Expo/React Native; tetap simpan master aset tanpa perubahan.

## 4. Warna, font, ikon dan gaya UI

**Color palette:** Agent boleh mengevaluasi seluruh referensi dan **mengusulkan palet NUTRASA terbaik** yang harmonis, konsisten, dan mudah diakses. Pertimbangkan primary, secondary, accent, background, surface, text, border, success, warning, danger, serta state disabled dan dark mode (jika diputuskan akan didukung). **Jangan menetapkan hex final sebelum review/approval.** Sertakan alasan pemilihan dan cek kontras teks/komponen menurut pedoman aksesibilitas yang relevan.

**Typography:** Font dalam contoh referensi mungkin berbeda-beda dan belum tentu final. Pilih kandidat font dengan keterbacaan baik di Android/iOS, dukungan karakter bahasa Indonesia, lisensi yang sesuai, dan hierarchy yang jelas. Jangan menganggap font gambar referensi sebagai kewajiban, kecuali nanti secara eksplisit disetujui.

**Iconography:** Gunakan satu gaya ikon yang konsisten (stroke, ketebalan, ukuran, radius). Ikon harus tetap menjelaskan fungsi, bukan sekadar dekorasi. Jangan mencampur beberapa style ikon tanpa alasan.

**Layout:** Boleh memperbaiki hierarki informasi, grid, spacing, ukuran tombol, bottom tabs, card, kalender, grafik, dan posisi CTA untuk meningkatkan kegunaan pada layar kecil maupun besar. Prioritaskan safe area, touch target, aksesibilitas, dan perilaku state.

## 5. Prinsip UX yang harus dipertahankan

- NUTRASA adalah aplikasi **nutrition/calorie tracker untuk pengguna Indonesia**, dengan fokus utama pada makanan Nusantara.
- Fungsi dan informasi lebih penting daripada dekorasi. Dashboard harus memudahkan melihat konsumsi kalori/makro dan mencatat makanan.
- Alur pengguna: autentikasi → onboarding → dashboard; pengguna yang telah menyelesaikannya tidak perlu mengulang tanpa alasan.
- Food search, ukuran porsi, input manual, custom food, dan jurnal makan harus praktis.
- Buat desain untuk loading, empty, error, offline, syncing, data nutrisi parsial, log-only mode, dan hasil kalkulasi yang belum tersedia.
- Jangan menggunakan ilustrasi, grafik atau warna untuk menyembunyikan ketidakpastian data nutrisi.
- Jangan mengubah business rules atau memperkenalkan fitur baru hanya karena muncul dalam gambar referensi.

## 6. Cara kerja AI agent saat memproses paket ini

1. **Inventarisasi file** dan identifikasi aset logo/maskot final, referensi eksploratif, variasi screen, dan font yang benar-benar disertakan.
2. **Ringkas visual direction** yang berulang di antara referensi (misalnya kepribadian, tone, bentuk elemen, gaya ilustrasi). Jangan mengarang detail yang tidak terlihat.
3. **Deteksi perbedaan/konflik** antar-referensi: logo lama vs final, maskot lama vs final, font atau palet yang berbeda.
4. **Susun proposal design system**: token warna (dengan nilai HEX usulan), typography, spacing, radius, elevation, ikon, dan komponen penting; jelaskan alasan dan periksa aksesibilitas.
5. **Ajukan keputusan yang berdampak besar** untuk review, khususnya palet final, font final, style ikon, dan bentuk navigasi. Jangan menganggap usulan otomatis disetujui.
6. Setelah disetujui, dokumentasikan keputusan pada [docs/01-design/design-system.md](design-system.md) dan buat rencana pemetaan aset untuk implementasi Expo.
7. Baru buat wireframe/high-fidelity UI berdasarkan spesifikasi fungsional dan design system yang disetujui.

## 7. Larangan dan batasan

- **JANGAN** menyalin setiap layout referensi secara kaku atau pixel-perfect tanpa instruksi khusus.
- **JANGAN** mengambil logo atau maskot dari screenshot jika file final tersedia.
- **JANGAN** membuat ulang atau mengubah identitas logo/maskot resmi secara sepihak.
- **JANGAN** menganggap setiap warna/font di gambar referensi bersifat final.
- **JANGAN** menambah fitur, mengubah alur, rumus nutrisi, aturan data, atau struktur navigasi hanya karena terlihat pada referensi.
- **JANGAN** memasukkan aset berlisensi tidak jelas ke produk final, atau mengasumsikan font/gambar boleh dipakai secara komersial.
- **JANGAN** melakukan implementasi besar sebelum proposal design system dan konflik utama direview.

## 8. Output yang diharapkan dari AI agent

Hasil tahap analisis aset sebaiknya berupa:

- `asset-inventory.md` — daftar aset, format, kegunaan, dan catatan varian final.
- `visual-direction.md` — ringkasan nuansa visual dan pola referensi; apa yang dipertahankan vs diperbaiki.
- **Draft** [design-system.md](design-system.md) — palet usulan, tipografi, ikon, spacing, radius, serta komponen dan state.
- `open-design-decisions.md` — keputusan terbuka dan hal yang memerlukan persetujuan.

File tambahan tersebut **opsional**, dan hanya dibuat jika diminta pada task terkait. Untuk tugas awal, cukup analisis dan laporkan temuan tanpa membuat kode UI.

## 9. Catatan untuk developer React Native + Expo

Desain nantinya diimplementasikan dengan **React Native + Expo + TypeScript + Expo Router**. Gunakan komponen dan sistem styling yang dipilih proyek; jangan memasang library UI, font, atau animasi baru tanpa kebutuhan yang jelas. Jaga aset master terpisah dari aset hasil optimasi aplikasi.

---

**Ringkasan:** Referensi ini adalah **kompas arah desain, bukan cetak biru yang harus dijiplak**. Gunakan logo dan maskot final sebagai identitas resmi. Pilih dan usulkan warna, font, komponen, dan layout yang paling sesuai dengan tema keseluruhan NUTRASA, dengan ruang perbaikan UX—dan mintakan persetujuan untuk keputusan desain final.
