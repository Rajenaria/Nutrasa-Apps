# NUTRASA — Nutrition Engine Specification

**Versi:** 0.5 (draft perencanaan)  
**Tanggal:** 13 Oktober 2026  
**Lokasi repo:** `docs/02-architecture/nutrition-engine-spec.md`  
**Status:** DRAFT — **BUKAN** algoritma klinis yang sudah divalidasi / belum boleh diaktifkan sebagai rekomendasi produksi.  
**Owner keputusan:** Product owner NUTRASA; review ahli gizi/dokter yang kompeten diperlukan sebelum rilis.

## 0. Cara membaca keputusan

- **APPROVED-PRODUCT:** keputusan produk yang sudah disetujui dalam diskusi.
- **PROPOSED:** rancangan teknis atau UX yang direkomendasikan; masih perlu persetujuan.
- **REVIEW-REQUIRED:** parameter gizi, keamanan, atau asumsi yang harus diperiksa profesional berkompeten.
- **DEFERRED:** tidak termasuk kalkulator otomatis MVP.
- **BLOCKED:** tindakan yang dilarang saat persyaratan kelayakan belum terpenuhi.

**Aturan untuk Codex:** Dokumen ini spesifikasi perencanaan, bukan izin mengimplementasikan atau menerapkan angka rekomendasi. Jangan mengubah status `PROPOSED`/`REVIEW-REQUIRED` menjadi final. Implementasi pada tahap coding hanya berdasarkan task eksplisit dan konfigurasi yang telah disetujui.

## 1. Tujuan, cakupan, dan non-goals

**Tujuan:** menghasilkan target energi dan makronutrien harian yang transparan, dapat dijelaskan, memiliki versi, dapat diuji, dan tidak mengeluarkan rekomendasi otomatis ketika profil tidak sesuai.

**APPROVED-PRODUCT:**
1. NUTRASA melayani pasar Indonesia; kalkulator otomatis MVP difokuskan pada dewasa yang memenuhi kriteria.
2. Tujuan: maintenance, cutting, bulking, muscle gain; body recomposition butuh aturan tersendiri bila diaktifkan.
3. Preset defisit/surplus dipilih otomatis berdasarkan profil, tanpa meminta pengguna memilih kecepatan.
4. Protein ditentukan berdasarkan berat acuan, tujuan, dan aktivitas; lemak adaptif 25–30% energi sebagai rancangan; karbohidrat dari sisa energi.
5. Target dapat disesuaikan pengguna dengan validasi.
6. Ketika berat berubah, sistem **menghitung ulang otomatis**; pemberlakuan hasil tetap tunduk pada validasi keselamatan.
7. Nilai nutrisi makanan parsial tetap boleh dicatat dan harus diberi indikator ketidaklengkapan.
8. Kondisi khusus belum didukung oleh kalkulator standar MVP.

**Non-goals:** diagnosis, terapi medis, rekomendasi untuk anak/remaja, kehamilan/menyusui, penyakit yang mensyaratkan diet medis, eating disorder, atau prediksi berat badan presisi. Tidak menggunakan foto tubuh, klasifikasi somatotype, maupun AI generatif untuk menentukan angka dasar.

## 2. Prinsip keselamatan & kejujuran angka

1. RMR/TDEE adalah **estimasi**, bukan hasil pengukuran metabolisme.
2. Jangan menghitung defisit/surplus bagi profil yang tidak lolos eligibility gate.
3. Jangan menjadikan batas kalori generik, BMI, atau data ekstrem sebagai satu-satunya bukti keamanan. Nilai ambang produk ditetapkan setelah review profesional.
4. Jangan membuat klaim bahwa semua orang dengan tujuan sama membutuhkan persentase makro yang sama.
5. Jika satu parameter keamanan belum disetujui: kembalikan `NEEDS_REVIEW` atau `UNSUPPORTED`, bukan menebak nilai.
6. Perhitungan ulang tidak boleh membuat pengguna tiba-tiba menerima target yang ditandai berisiko.
7. Catat versi formula, konfigurasi, sumber referensi, waktu berlaku, dan input yang digunakan.
8. Terapkan bahasa netral: 'perkiraan kebutuhan' dan 'target yang direkomendasikan', bukan 'batas pasti tubuh Anda'.

## 3. Data input (kontrak konseptual, bukan skema SQL)

| Field | Tipe | Wajib | Penggunaan | Aturan |
|---|---|---|---|---|
| `date_of_birth` / `age_years` | tanggal/int | Ya | eligibility, RMR | usia saat tanggal kalkulasi; bukan usia yang tersimpan statis |
| `height_cm` | decimal | Ya | RMR, pemeriksaan profil | >0, nilai aneh -> konfirmasi/review |
| `weight_kg` | decimal | Ya | RMR, protein dan recalculation | >0; simpan timestamp dan sumber |
| `formula_sex_parameter` | enum/null | Bersyarat | konstanta rumus Mifflin | hanya bila rumus sesuai; tidak disimpulkan dari ekspresi gender |
| `primary_goal` | enum | Ya | strategi energi | maintenance/cutting/bulking/muscle_gain |
| `daily_activity_level` | enum | Ya | faktor aktivitas | bedakan aktivitas kerja/hari biasa |
| `exercise_pattern` | structured | Disarankan | profil olahraga/protein | jangan hitung olahraga ganda |
| `target_weight_kg` | decimal/null | Bersyarat | konsistensi tujuan, bukan otomatis penentu agresivitas | bila cutting/bulking, opsional sesuai flow |
| `special_condition_screen` | enum | Ya untuk rekomendasi | eligibility | `no_disclosed`, `yes`, `unknown`, `declined`; jangan memaksa detail diagnosis |
| `manual_goal_preferences` | structured/null | Opsional | override tervalidasi | input eksplisit dan riwayat perubahan |
| `body_type_visual` | enum/null | Opsional | personalisasi tampilan saja | **DILARANG** sebagai parameter engine |
| `effective_date`, `timezone` | date/string | Ya | versi target harian | aturan tanggal lokal konsisten |

**Privacy:** simpan data minimal; jangan mencatat diagnosis bebas-text jika tidak diperlukan. Pengguna harus diberi tahu untuk apa data diminta.

## 4. Pipeline deterministik

`INPUT -> SANITIZE -> ELIGIBILITY -> RMR -> ACTIVITY/TDEE -> GOAL_PRESET -> SAFETY_CHECK -> PROTEIN_REFERENCE_WEIGHT -> PROTEIN -> FAT -> CARBS -> MACRO_VALIDATION -> SECONDARY_NUTRIENTS -> VERSIONED_RESULT`

Semua langkah adalah pure/domain functions bila memungkinkan. Kalkulasi tidak melakukan network request. Penyimpanan/sync berada di luar domain engine.

### 4.1 Eligibility gate (PROPOSED; aturan rinci REVIEW-REQUIRED)

- Umur <18: `UNSUPPORTED_AGE` untuk target otomatis.
- Hamil/menyusui, kebutuhan medis khusus atau kondisi yang tidak sesuai, atau faktor fisiologis tidak dapat dipakai: `UNSUPPORTED_PROFILE`/`NEEDS_REVIEW`.
- Data kelayakan belum terjawab: `NEEDS_INPUT`, jangan menyiratkan 'sehat' secara default.
- Pengguna tidak memenuhi penilaian penurunan berat: `GOAL_NOT_ELIGIBLE` untuk cutting, bukan otomatis maintenance tanpa pemberitahuan.
- Nilai tinggi/berat di luar rentang wajar: minta konfirmasi angka, kemudian gate sesuai kebijakan yang ditinjau; jangan menolak hanya karena tidak biasa.
- Status `UNSUPPORTED` membatasi kalkulator otomatis; keputusan akses ke food logging perlu ditetapkan terpisah pada user-flow produk.

### 4.2 RMR (kandidat yang memiliki referensi penelitian; suitability masih REVIEW-REQUIRED)

Mifflin–St Jeor (dewasa, estimasi):

- Kategori konstanta laki-laki rumus asli: `10 × berat(kg) + 6.25 × tinggi(cm) − 5 × usia(tahun) + 5`.
- Kategori konstanta perempuan rumus asli: `10 × berat(kg) + 6.25 × tinggi(cm) − 5 × usia(tahun) − 161`.

**Penting:** parameter di atas merupakan kategori model penelitian, bukan asumsi tentang identitas gender seseorang. Jangan tebak konstanta bagi pengguna yang model ini tidak sesuai; rancang jalur alternatif setelah review.

Rujukan: Mifflin et al. (1990), PMID 2305711.

### 4.3 Estimasi TDEE (faktor kandidat REVIEW-REQUIRED)

`TDEE = RMR × activity_factor`

| Level | Faktor ilustratif | Status |
|---|---:|---|
| sangat rendah | 1.20 | REVIEW-REQUIRED |
| ringan | 1.375 | REVIEW-REQUIRED |
| sedang | 1.55 | REVIEW-REQUIRED |
| tinggi | 1.725 | REVIEW-REQUIRED |
| sangat tinggi | 1.90 | REVIEW-REQUIRED |

Jangan memetakan 'gym 3 kali/minggu' langsung ke faktor tertentu tanpa mempertimbangkan aktivitas keseharian. Perubahan aktivitas -> kandidat recalculation.

### 4.4 Pemilih preset energi berbasis profil

**APPROVED-PRODUCT:** preset dipilih otomatis. **Belum disetujui:** tabel persentase, batas mutlak, dan parameter pemilihan.

Rancangan selektor:

- `maintenance` -> energy adjustment nol sebagai baseline.
- `cutting` -> preset defisit sesuai kelas profil/kelayakan.
- `bulking` -> preset surplus sesuai kelas profil/kelayakan.
- `muscle_gain` -> preset yang mempertimbangkan latihan teratur; bila tidak cukup data, `NEEDS_INPUT`.
- `recomposition` -> `UNSUPPORTED_GOAL` sampai kebijakan khusus disetujui.
- Semua preset memiliki `preset_id`, `preset_version`, `eligibility_requirements`, `adjustment_method`, `adjustment_value`, `safety_limits`, `rationale`.

**Tabel hipotesis untuk eksperimen, BUKAN angka produksi:** defisit ringan mungkin -5 sampai -10%; surplus ringan +5 sampai +10%. **JANGAN** memprogram rentang ini sebagai rekomendasi sebelum review klinis dan keputusan produk. Tidak ada klaim bahwa persentase tersebut cocok untuk seluruh profil.

**Algoritme seleksi:**
1. Periksa eligibility dan kelengkapan profil.
2. Tentukan `profile_class` menggunakan activity, training, data tubuh, tujuan, dan status validasi.
3. Cari rule preset eksplisit yang disetujui untuk `profile_class + primary_goal`.
4. Jika tidak ada rule -> `NEEDS_REVIEW`; **jangan fallback ke angka hardcoded**.
5. Terapkan safety gates setelah adjustment dan sebelum result aktif.
6. Simpan alasan pemilihan yang dapat dibaca pengguna.

### 4.5 Protein (koefisien REVIEW-REQUIRED)

`protein_g = reference_weight_kg × approved_protein_factor_g_per_kg`

- Kandidat faktor berbeda menurut maintenance/sedentary, olahraga reguler, cutting, bulking, dan muscle gain.
- Literatur ISSN menyebut sekitar 1.4–2.0 g/kg/hari untuk sebagian besar individu sehat yang berolahraga; tidak otomatis berlaku bagi semua orang atau kondisi khusus.
- **Reference weight policy perlu keputusan profesional:** kapan menggunakan berat aktual dan kapan memakai berat acuan yang berbeda. Jangan otomatis menetapkan reference weight = target weight, atau menggunakan berat aktual tanpa pemeriksaan.
- Bila tidak ada kebijakan berat acuan atau faktor tervalidasi untuk profil -> `NEEDS_REVIEW`.

### 4.6 Lemak, karbohidrat, konsistensi

- Kandidat adaptif lemak 25–30% energi (`fat_share`), **APPROVED sebagai rancangan, REVIEW-REQUIRED sebagai parameter produksi**.
- `fat_g = energy_target_kcal × fat_share / 9`
- `carb_g = (energy_target_kcal − 4×protein_g − 9×fat_g) / 4`
- Jika `carb_g` negatif, tidak finite, atau di luar aturan yang disetujui -> `MACRO_ALLOCATION_CONFLICT`.
- Gunakan presisi internal yang cukup; bulatkan hanya untuk tampilan. Simpan angka lebih presisi untuk menghitung total.
- 4/4/9 adalah pendekatan energi makro standar; nilai energi pangan dalam katalog dapat berbeda karena metode analisis, serat, dan pembulatan.

### 4.7 Nutrisi tambahan (konfigurasi terpisah)

11 field: energy_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, total_sugars_g, saturated_fat_g, trans_fat_g, cholesterol_mg, sodium_mg, potassium_mg.

- `target`: energi/makro; `minimum/adequacy`: serat dan kalium bila sesuai; `limit`: natrium, lemak jenuh/trans; `information`: gula total, kolesterol sesuai konteks.
- **Gula total bukan gula bebas/gula tambahan.** Jangan menerapkan batas WHO untuk *free sugars* pada kolom `total_sugars_g`.
- Referensi sekunder harus mencantumkan `source`, `year`, `population_group`, `unit`, dan status review.
- Jika pedoman sekunder tidak sesuai profil, beri `not_applicable` atau `not_configured`; jangan membuat batas palsu.

## 5. Output contract konseptual

```ts
type CalculationStatus =
  | 'READY'
  | 'NEEDS_INPUT'
  | 'NEEDS_REVIEW'
  | 'UNSUPPORTED'
  | 'INVALID_INPUT'
  | 'MACRO_ALLOCATION_CONFLICT';

type NutritionPlanResult = {
  status: CalculationStatus;
  reasonCodes: string[];
  estimatedRmrKcal?: number;
  estimatedTdeeKcal?: number;
  targetEnergyKcal?: number;
  targetProteinG?: number;
  targetFatG?: number;
  targetCarbohydrateG?: number;
  supplementalTargets?: Record<string, { value: number | null; unit: string; kind: string }>;
  selectedPresetId?: string;
  calculationVersion: string;
  rulesetVersion: string;
  calculatedAt: string;
  effectiveFromLocalDate?: string;
  explanation: string[];
};
```

**Kontrak mutlak:** `READY` hanya bila seluruh required inputs, eligibility, approved coefficients, dan safety checks lengkap. Status lain **tidak boleh** dianggap target aktif, meski terdapat angka parsial untuk debugging.

## 6. Perubahan berat dan auto-recalculation

**APPROVED-PRODUCT:** hitung ulang otomatis setelah berat terbaru yang valid dicatat. **PROPOSED detail berikut:**

1. Simpan `weight_entry` dengan `id`, value, waktu pengukuran, waktu pencatatan, asal perangkat, dan revisi.
2. Setelah disimpan, jadwalkan operasi hitung ulang deterministik berdasarkan entri berat terbaru yang sah.
3. Pastikan hasil dengan revisi profil lebih lama tidak dapat menimpa revisi yang baru (*stale result guard*).
4. Jika hasil `READY`, buat versi target baru dengan `effective_from` yang eksplisit (usulan: tanggal lokal berikutnya; keputusan produk masih terbuka), sambil menampilkan informasi bahwa target diperbarui.
5. Jika hasil `NEEDS_REVIEW`/`UNSUPPORTED`, jangan aktifkan target baru; tandai target lama sebagai **perlu ditinjau** dan tentukan secara eksplisit apakah boleh tetap ditampilkan sebagai histori/reference saja.
6. Perubahan data berat typo, delete, atau koreksi tanggal harus memicu evaluasi ulang yang dapat direproduksi.
7. Target manual pengguna tidak boleh diam-diam ditimpa: rekomendasi awal adalah simpan `manual_override` terpisah dan minta penegasan kebijakan precedence sebelum implementasi.
8. Riwayat target bersifat immutable/versioned. Laporan tanggal lama menggunakan target yang berlaku pada tanggal itu.
9. Offline: kalkulasi lokal boleh menampilkan **preview** jika ruleset tervalidasi dan lengkap; aktifkan melalui strategi sinkronisasi terversi untuk mencegah konflik dua perangkat.

**Keputusan yang perlu disetujui:** waktu efektif (hari yang sama atau esok), prioritas override manual, dan status target lama ketika target baru diblokir.

## 7. Validasi berlapis

**Syntax:** tipe numerik, tidak NaN/Infinity, tanggal valid, satuan benar, nilai positif.  
**Semantic:** goal dan target weight konsisten; activity tidak bertentangan; parameter model tersedia.  
**Eligibility:** usia, kondisi khusus, kelayakan penggunaan rumus, risiko rekomendasi otomatis.  
**Mathematical:** hasil finite, energy positif, makro nonnegatif, selisih energi dari makro dalam toleransi pembulatan.  
**Safety:** batas produk yang belum ditentukan *fail closed*; override tidak dapat melewati batas tanpa kebijakan.  
**Versioning:** hasil memiliki ID preset, versi ruleset dan effective date.

**Semua batas teknis (seperti nilai maksimal input) dan ambang klinis (seperti kapan cutting diperbolehkan) adalah dua hal berbeda** dan harus didefinisikan terpisah.

## 8. Error states dan interaksi aplikasi

| Situasi | Status internal | Perilaku UI |
|---|---|---|
| Input kosong | NEEDS_INPUT | sorot field yang diperlukan, simpan draft |
| Input tidak valid | INVALID_INPUT | pesan kontekstual, jangan hitung |
| Profil di luar cakupan | UNSUPPORTED | jelaskan keterbatasan kalkulator; jangan munculkan target rekomendasi |
| Preset/guardrail belum disetujui | NEEDS_REVIEW | jangan fallback; tampilkan perencanaan belum tersedia |
| Konflik makro | MACRO_ALLOCATION_CONFLICT | jangan tampilkan angka makro seolah final |
| Rekomendasi lengkap dan lolos | READY | tampilkan sumber estimasi, target dan penjelasan |
| Berat baru mengubah target | READY atau NEEDS_REVIEW | buat/update versi, tidak merombak histori |
| Tidak ada koneksi | pending_sync | simpan data sesuai kebijakan offline; tampilkan status sinkronisasi |
| Data makanan sebagian null | log_partial | tetap log; total numerik hanya bagian yang diketahui, tampilkan indikator partial |
| Hari tanpa log | no_data | jangan mengartikan konsumsi nol |

## 9. Test matrix — hasil konseptual

### 9.1 Unit & contoh dasar

| ID | Kondisi | Expected |
|---|---|---|
| U-01 | pria kategori rumus, 25 th, 70 kg, 170 cm | RMR = 1642.5 kcal/hari (rumus Mifflin) |
| U-02 | perempuan kategori rumus, data sama | RMR = 1476.5 kcal/hari |
| U-03 | U-01 aktivitas 1.375 | TDEE = 2258.4375 sebelum pembulatan |
| U-04 | mantenimiento/maintenance, preset disetujui | adjustment = 0; output READY jika semua gate lolos |
| U-05 | cutting dengan preset belum terkonfigurasi | NEEDS_REVIEW, tanpa target aktif |
| U-06 | protein 120g, energi 2200, fat 25% | lemak = 61.111...g; karbo = 292.5g |
| U-07 | faktor/berat acuan protein belum ada | NEEDS_REVIEW |
| U-08 | protein + fat lebih besar dari energi | MACRO_ALLOCATION_CONFLICT |
| U-09 | dua permintaan input sama dan ruleset sama | keluaran numerik identik |

### 9.2 Profil normal

| ID | Profil | Expected |
|---|---|---|
| N-01 | dewasa, maintenance, sedentary, data lengkap | RMR/TDEE; output READY hanya bila ruleset & gate disetujui |
| N-02 | dewasa, cutting, olahraga sedang | pemilihan rule spesifik; tidak default -10% |
| N-03 | dewasa, bulking, latihan kekuatan | preset surplus dan protein sesuai rule yang disetujui |
| N-04 | dewasa, muscle gain, latihan tidak diketahui | NEEDS_INPUT |
| N-05 | pengguna edit target manual dalam nilai wajar | cek validasi dan simpan override/version |
| N-06 | berat berubah dua kali berdekatan | hanya versi profil terbaru berhak aktif |
| N-07 | user kembali hari lalu | tampilkan target versi tanggal tersebut |

### 9.3 Profil ekstrem dan unsupported

| ID | Kondisi | Expected |
|---|---|---|
| E-01 | usia 17 | UNSUPPORTED |
| E-02 | usia 18 | lanjut gate; tidak otomatis READY |
| E-03 | usia 80 | evaluasi kesesuaian dan policy, bukan penolakan otomatis |
| E-04 | berat 0 / tinggi negatif | INVALID_INPUT |
| E-05 | angka sangat tinggi/rendah tapi positif | konfirmasi; gate khusus, tidak langsung memutuskan aman |
| E-06 | cutting untuk profil yang tidak memenuhi safety | UNSUPPORTED/NEEDS_REVIEW |
| E-07 | parameter rumus tidak sesuai | NEEDS_REVIEW atau alternatif yang disetujui |
| E-08 | jawaban kondisi khusus unknown/declined | NEEDS_REVIEW, bukan otomatis sehat |
| E-09 | target makro menghasilkan karbo negatif | MACRO_ALLOCATION_CONFLICT |
| E-10 | usia berubah pada ulang tahun | evaluasi target dengan umur per tanggal kalkulasi |

### 9.4 Data, offline, konkurensi, dan regresi

| ID | Kondisi | Expected |
|---|---|---|
| X-01 | user edit berat saat offline | simpan lokal, antre sync, versi diisolasi per akun |
| X-02 | dua perangkat edit berat | resolusi konflik berbasis revisi/urutan yang dirancang, tidak overwrite diam-diam |
| X-03 | retry create target | idempotent, tidak buat target kembar |
| X-04 | data makanan kalium null | total diketahui + indikator parsial, bukan nol |
| X-05 | update data katalog setelah logging | snapshot makanan lama tidak berubah |
| X-06 | user menghapus berat yang memicu target | target dievaluasi ulang; histori audit tetap dapat dijelaskan |
| X-07 | data ruleset berubah | rencana lama tetap menjelaskan ruleset versi lama |
| X-08 | timezone berganti | tanggal target dijelaskan dan stabil; tidak dua target aktif untuk satu hari tanpa kebijakan |
| X-09 | app crash saat queue sync | operasi lokal tidak hilang; proses idempotent |
| X-10 | override manual vs recalc otomatis | precedence eksplisit, jangan overwrite diam-diam |
| X-11 | sync gagal permanen | indikator retry/error; tidak mengaku tersinkron |
| X-12 | logout dengan perubahan lokal | peringatan; tidak membocorkan data antar akun |

## 10. Acceptance criteria sebelum implementasi aktif

- [ ] Product owner menyetujui daftar tujuan dan alur pengguna unsupported.
- [ ] Tenaga kesehatan kompeten meninjau eligibility, safety rules, preset energi, protein, lemak, dan aturan override.
- [ ] Setiap koefisien produksi punya sumber, alasan, cakupan dan versi.
- [ ] Algoritme seleksi tidak punya fallback angka tidak disetujui.
- [ ] Semua unit & test matrix lulus dengan expected values yang terkunci.
- [ ] Perubahan berat, target lama, dan override manual teruji end-to-end.
- [ ] Privacy, pembatasan akses data, dan offline conflict plan disetujui.
- [ ] Teks UI membedakan estimasi, target, batas, dan data tidak lengkap.
- [ ] Mode unsupported tidak memberikan rekomendasi otomatis.
- [ ] Semua keputusan yang masih `PROPOSED` didokumentasikan dalam decision log.

## 11. Decision register — wajib dibahas sebelum final

| ID | Pertanyaan | Usulan awal | Pemilik |
|---|---|---|---|
| D-01 | Persentase preset per profil | Tabel konfigurasi, default tanpa angka jika belum disetujui | Product + ahli gizi |
| D-02 | Safety eligibility cutting/bulking | Tidak ditentukan hanya dari BMI/umur; butuh protokol review | Ahli gizi |
| D-03 | Policy berat acuan protein | Tergantung profil; bukan selalu berat aktual | Ahli gizi |
| D-04 | Faktor aktivitas dan kuesioner | Pemetaan tervalidasi yang tidak double-count | Product + ahli gizi |
| D-05 | Waktu efektif target setelah timbang | Kandidat hari berikutnya, histori tetap | Product |
| D-06 | Interaksi target manual dengan recalculation | Kandidat manual override dipertahankan dan diinformasikan | Product |
| D-07 | Penanganan target lama saat target baru needs review | Tampilkan sebagai historis, tandai tidak otomatis diperbarui | Product + ahli gizi |
| D-08 | Jalur pengguna dewasa dengan profil unsupported | Tidak ada rekomendasi otomatis; tentukan apakah tracking nonpersonal boleh | Product + compliance |
| D-09 | Penyajian body type visual | opsional, tanpa dampak engine, tidak menghakimi bentuk tubuh | Product + UX |
| D-10 | Frekuensi dan ambang auto recalc | Hitung setiap berat valid, kebijakan perubahan target/notification TBD | Product + ahli gizi |

## 12. Rencana implementasi setelah keputusan final

1. Onboarding field contract dan UI states (dari input di §3).
2. Pure calculation engine + tipe output + structured error codes.
3. Versioned ruleset (konfigurasi yang ditinjau), deterministic unit tests.
4. Data persistence: profile, weight history, target history, overrides, audit references.
5. Orkestrasi recalc yang idempotent & concurrency-safe.
6. Dashboard dengan semantik progress (target vs batas vs minimal), explanation UI.
7. Offline sync & integration tests.
8. Review profesional, QA ekstrem, beta, dan approval release.

## 13. Referensi untuk review (bukan klaim bahwa algoritme telah divalidasi)

- Mifflin et al. (1990), *A new predictive equation for resting energy expenditure in healthy individuals* — https://pubmed.ncbi.nlm.nih.gov/2305711/
- NIDDK, Body Weight Planner dan pembatasan cakupan — https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner
- Jäger et al. (2017), ISSN position stand: protein and exercise — https://pubmed.ncbi.nlm.nih.gov/28642676/
- WHO (2023), saturated fatty acid and trans-fatty acid guideline — https://www.who.int/publications/i/item/9789240073630
- WHO, Healthy diet (sodium dan free sugar) — https://www.who.int/health-topics/healthy-diet
- Kementerian Kesehatan RI, Permenkes 28/2019 tentang AKG — https://jdih.kemkes.go.id/storage/documents/pdfs/2019permenkes028.pdf

**Catatan:** referensi tersebut mendukung komponen tertentu, bukan keseluruhan preset NUTRASA. Uji kasus dan professional review tetap diwajibkan.
