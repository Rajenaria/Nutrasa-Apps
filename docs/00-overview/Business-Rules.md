# NUTRASA — Business Rules & Test Matrix

**Versi:** Draft v0.4  
**Tanggal:** 13 Oktober 2026  
**Lokasi proyek yang disarankan:** [docs/00-overview/business-rules.md](business-rules.md)\
**Status:** Untuk diskusi dan review. **Bukan spesifikasi klinis tervalidasi atau izin implementasi rekomendasi nutrisi produksi.**

## 0. Legenda status

- **Disepakati:** keputusan produk pengguna yang sudah dikonfirmasi.
- **Kandidat:** metode/parameter yang dipertimbangkan, belum diputuskan atau belum divalidasi.
- **Usulan teknis:** aturan engineering yang dianjurkan tetapi masih perlu persetujuan.
- **Review klinis:** parameter atau kondisi yang wajib ditinjau tenaga profesional sebelum rekomendasi otomatis dirilis.

## 1. Ruang lingkup yang disepakati

1. NUTRASA adalah pelacak nutrisi dengan fokus makanan Nusantara, menggunakan React Native + Expo.
2. Visi untuk semua kelompok; **kalkulator otomatis MVP hanya dewasa yang memenuhi kriteria**. Kondisi medis/khusus tidak didukung untuk rekomendasi otomatis MVP.
3. Onboarding interaktif/visual; body type bersifat opsional dan **tidak masuk rumus**.
4. Target cutting/bulking dipilih otomatis **berdasarkan profil**, bukan satu nilai tetap untuk semua orang.
5. Protein berdasarkan berat acuan, tujuan, dan aktivitas; lemak 25–30% energi secara adaptif; karbohidrat dari energi tersisa, kemudian validasi.
6. Berat terbaru memicu **perhitungan ulang otomatis**; hasil yang tidak lolos validasi tidak diberlakukan sebagai target aktif.
7. Target nutrisi dapat disesuaikan secara manual dengan validasi.
8. Food logging mencakup pencarian, kategori, custom food, resep, favorit, recent foods, copy meal, edit/hapus; offline-tolerant dengan antrean sinkronisasi.
9. Katalog awal 100 makanan terkurasi menuju 500; energi dan tiga makro ditinjau, nutrisi lain boleh tidak tersedia.
10. Makanan dengan data nutrisi parsial boleh dicatat, tetapi harus ada indikator ketidaklengkapan.
11. Progress MVP mencakup kalori, makro, berat badan, dan konsistensi.

## 2. Register aturan bisnis

| ID | Aturan | Status | Catatan |
|---|---|---|---|
| BR-001 | Kalkulasi otomatis hanya untuk dewasa yang memenuhi kriteria | Disepakati | Batas usia MVP: 18+; usia dewasa lanjut perlu peninjauan kesesuaian |
| BR-002 | Kebutuhan khusus tidak memperoleh kalkulator standar | Disepakati | Definisi kondisi dan jalur UX perlu difinalkan |
| BR-003 | RMR diperkirakan dengan Mifflin–St Jeor | Kandidat | Harus sesuai dengan populasi dan parameter fisiologis yang digunakan |
| BR-004 | TDEE berdasarkan RMR dan faktor aktivitas | Kandidat | Pemetaan klasifikasi aktivitas/faktor perlu diuji |
| BR-005 | Defisit/surplus preset berdasar profil | Disepakati (metode) | Angka dan batasnya belum disetujui |
| BR-006 | Protein dihitung dari berat acuan dan tujuan | Disepakati (metode) | Rumus berat acuan dan koefisien belum final |
| BR-007 | Lemak adaptif 25–30% energi | Disepakati (rancangan) | Validasi klinis dan constraint makro diperlukan |
| BR-008 | Karbohidrat dari sisa energi | Disepakati (metode) | Tidak boleh negatif; cek constraint |
| BR-009 | Berat badan baru memicu hitung ulang otomatis | Disepakati | Gunakan berat terbaru yang sah, simpan versi; validasi sebelum aktivasi |
| BR-010 | Target manual dengan validasi | Disepakati | Batas aman dan kebijakan override perlu review |
| BR-011 | Perubahan target menjaga histori | Disepakati sebagai invariant oleh owner | Detail versioning dan effective date masih memerlukan keputusan teknis/produk |
| BR-012 | Nutrisi yang tidak diketahui = null, bukan 0 | Disepakati | Ketidaklengkapan harus dibawa sampai total harian |
| BR-013 | Makanan parsial tetap dapat dicatat | Disepakati | UI memberi partial-data marker |
| BR-014 | Log menyimpan nutrition snapshot | Disepakati sebagai invariant oleh owner | Histori stabil walau katalog/resep berubah; detail implementasi masih draft |
| BR-015 | Offline write + idempotent sync | Disepakati (perilaku), desain teknis usulan | Isolasi per akun dan pemulihan konflik |
| BR-016 | Hari tanpa log != 0 konsumsi | Usulan teknis | Bedakan belum dicatat, sebagian, hari selesai |
| BR-017 | Semua rekomendasi menyimpan calculation_version dan source version | Usulan teknis | Auditability dan reproducibility |

## 3. Engine: kalkulasi dan precedence

### 3.1 Input minimal
- `age_years`, `height_cm`, `weight_kg`, parameter fisiologis yang sesuai dengan metode RMR, `activity_level`, `primary_goal`.
- `target_weight_kg` wajib untuk cutting/bulking sesuai keputusan onboarding; tidak wajib untuk maintenance/general tracking. Deskripsi latihan dan body type visual opsional. **Body type tidak memengaruhi perhitungan.**
- Data kelayakan: hasil penyaringan kondisi yang tidak didukung; hindari mengumpulkan informasi sensitif yang tidak diperlukan.

### 3.2 Formula kandidat

**Mifflin–St Jeor (estimasi RMR untuk populasi yang sesuai):**  
`RMR = 10 × weight_kg + 6.25 × height_cm − 5 × age_years + S`  
`S = +5` untuk kategori laki-laki dan `−161` untuk kategori perempuan sebagaimana rumus aslinya; tidak boleh menebak parameter rumus dari identitas gender pengguna.

`TDEE = RMR × activity_factor`

Faktor aktivitas **kandidat pengujian, bukan final**: 1.20; 1.375; 1.55; 1.725; 1.90. Aturan pemetaannya harus menghindari double-counting aktivitas.

**Energy target:** `goal_kcal = TDEE + profile_adjustment_kcal` dengan `profile_adjustment_kcal` ditentukan preset berbasis profil. Angka penyesuaian, syarat preset, batas, dan constraint keselamatan belum final dan **harus ditinjau profesional**.

**Makro:**
- `protein_g = reference_weight_kg × protein_coefficient` (**koefisien dan berat acuan belum final**).
- `fat_g = goal_kcal × fat_fraction / 9`, dengan `fat_fraction` kandidat adaptif 0.25–0.30.
- `carb_g = (goal_kcal − 4 × protein_g − 9 × fat_g) / 4`.
- Faktor 4/4/9 dipakai sebagai pendekatan sederhana untuk rancangan makro; tidak otomatis dipakai menimpa nilai energi makanan dari sumber.
- Jika constraint makro bertentangan, engine mengembalikan `NEEDS_REVIEW`, **bukan** angka negatif atau target yang dipaksakan.

### 3.3 Urutan keputusan sistem
1. Validasi format dan satuan.
2. Periksa usia dan kriteria kelayakan.
3. Hitung estimasi RMR dan TDEE atau kembalikan kode penolakan terstruktur.
4. Pilih preset penyesuaian berdasarkan profil yang sesuai.
5. Validasi target energi dan alokasi makro secara bersama.
6. Siapkan target nutrisi tambahan berdasar pedoman yang relevan hanya ketika berlaku.
7. Rekam `calculation_version`, `source_version`, `input_snapshot`, `calculated_at`, `effective_from`, `status`.
8. Terapkan sebagai target aktif hanya jika lolos semua pemeriksaan wajib.

### 3.4 Recalculation akibat berat terbaru
- Simpan penimbangan dengan timestamp dan tanggal lokal jurnal.
- Perubahan berat yang valid memicu *recalculation request* otomatis; pekerjaan harus idempotent dan memakai input terkini.
- Jika hasil aman menurut aturan yang sudah ditetapkan, buat versi goal baru secara atomik; jangan menimpa sejarah.
- Jika belum layak, status `NEEDS_REVIEW`; target baru tidak aktif. **Perlu keputusan UX:** apakah target lama tetap terlihat dengan badge usang atau dibekukan dari rekomendasi.
- Jika dua data berat berurutan datang saat offline, hitung ulang terhadap versi berat terbaru yang benar setelah sinkronisasi, hindari stale job.
- Perlu ditentukan apakah koreksi pengukuran lama (backdated) memengaruhi goal pada masa lalu; usulan default: **tidak**.

## 4. Nutrisi yang ditampilkan

| Nutrisi | Unit | Peran | Aturan data kosong |
|---|---|---|---|
| Kalori | kcal | Target energi | null/unknown tidak sama dengan 0 |
| Protein | g | Target | null/unknown |
| Karbohidrat | g | Target/rentang | null/unknown |
| Lemak total | g | Target/rentang | null/unknown |
| Serat | g | Referensi kecukupan | null/unknown |
| Gula total | g | Pantauan; bukan gula bebas/tambahan | null/unknown |
| Lemak jenuh | g | Indikator pembatasan | null/unknown |
| Lemak trans | g | Indikator minimisasi | null/unknown |
| Kolesterol | mg | Pantauan | null/unknown |
| Natrium | mg | Indikator pembatasan | null/unknown |
| Kalium | mg | Referensi kecukupan sesuai kelayakan | null/unknown |

Acuan nutrisi tambahan seperti WHO dan AKG Indonesia perlu dipetakan eksplisit per kelompok dengan versi sumber; tidak semua nutrisi cocok sebagai progress bar 'harus mencapai 100%'.

## 5. Food data: kualitas dan perhitungan

- Tipe makanan: bahan mentah, bahan matang, masakan jadi, produk kemasan, resep pengguna.
- Wajib ada `food_id`, nama/alias, kategori/tag, kondisi pengolahan, `basis_amount`, `basis_unit`, energi+protein+karbohidrat+lemak yang ditinjau, status review, sumber dan basis penggunaan legal.
- Nutrisi tambahan boleh `null`. `0` hanya bila didukung data.
- Perhitungan dari basis 100 g: `portion_value = per_100g_value × grams / 100`, jika gram basisnya jelas. Untuk cairan gunakan basis volume jika sumbernya memang per 100 ml.
- Porsi rumah tangga khusus per makanan (centong, potong, mangkuk), harus disertai berat/volume terdefinisi dan sumber konversi; jangan buat konversi universal.
- Untuk resep, jumlahkan komponen dengan unit konsisten; gunakan berat akhir/yield yang jelas untuk nutrisi per 100 g. Retensi dan penyerapan minyak perlu metode kurasi; hasil tetap estimasi.
- Jika nutrisi satu bahan `null`, total nutrisi terkait berstatus `partial`; boleh tampil subtotal yang diketahui dengan penjelasan dan **jangan mengklaim total pasti**.
- Catatan makanan menyimpan snapshot porsi, unit, energi/makro yang diketahui, nutrisi tambahan beserta completeness metadata, identitas sumber dan versi.
- Revisi katalog tidak mengubah log lama secara diam-diam.
- **Pengelola katalog** perlu alur review sebelum publish, minimal via import CSV tervalidasi.

## 6. Validasi

### Input
- Reject: NaN, infinity, string bukan angka, berat ≤0, tinggi ≤0, tanggal lahir invalid, angka tak masuk akal untuk storage, unit tidak dikenal.
- Extreme-but-possible: **jangan otomatis diperlakukan salah**; beri konfirmasi atau jalur review setelah ambang direview.
- Usia <18: nonaktifkan kalkulator dewasa; kebutuhan khusus: nonaktifkan kalkulator standar.

### Engine
- Tidak boleh ada makro negatif, target nonfinite, faktor aktivitas tidak dikenali, atau hasil target yang tidak konsisten.
- Pembulatan untuk display saja; gunakan toleransi numerik eksplisit dan test.
- Peraturan minimum/maksimum dan kebijakan override **belum ditentukan**; tidak boleh dibuat diam-diam oleh implementer.

### State/Sync
- Status minimal: `LOCAL_PENDING`, `SYNCING`, `SYNCED`, `SYNC_ERROR`, `CONFLICT`.
- ID mutasi stabil, idempotency key, urutan mutasi, soft deletion/tombstone (jika dipilih), pemisahan data lokal per akun.
- Progress membedakan no-log vs tracked-zero vs partial vs completed.
- Jika pengguna offline, log lokal tidak boleh hilang akibat error jaringan; jangan mengklaim sudah synced sebelum konfirmasi server.

## 7. Matriks uji profil normal (fixture sintetis)

| ID | Input | Expected / Oracle |
|---|---|---|
| N-01 | 25th, 70kg, 170cm, aktivitas ringan, maintenance | Kalkulasi finite; tanpa penyesuaian energi untuk maintenance; versi goal tersimpan |
| N-02 | 28th, 80kg, 175cm, aktivitas sedang, cutting | Preset sesuai profil dipilih; nilai **belum dikunci** sampai review; guardrail dipanggil |
| N-03 | 24th, 60kg, 165cm, olahraga teratur, bulking | Surplus berbasis profil dipilih; target makro valid jika memenuhi constraint |
| N-04 | 35th, 65kg, 160cm, aktivitas rendah, maintenance | Tidak ada defisit/surplus; angka reproducible |
| N-05 | 30th, 75kg, 178cm, latihan kekuatan, muscle gain | Protein diturunkan dari berat acuan dan preset valid; tidak pakai body type |
| N-06 | Berat valid berubah 70 → 69kg | Trigger re-evaluation; goal baru berversi; goal lama tidak ditimpa |
| N-07 | Edit target manual dalam batas yang disetujui | Validasi makro-energi dijalankan; audit trail tersimpan |
| N-08 | Input sama di dua perangkat, rule version sama | Hasil deterministik setara (sesuai toleransi) |

**Catatan:** kasus N-02/N-03/N-05 belum bisa mempunyai golden numeric expected value sebelum preset dan koefisien disetujui. Unit test dapat memakai oracle rumus mekanis tanpa mengklaim parameter klinis tervalidasi.

## 8. Matriks uji ekstrem/kelayakan

| ID | Kasus | Expected |
|---|---|---|
| E-01 | Usia 17 | Tidak menjalankan kalkulator dewasa |
| E-02 | Usia tepat 18 | Kelayakan dewasa diperiksa, bukan otomatis langsung rekomendasi |
| E-03 | Usia 80 | Evaluasi kesesuaian; jangan otomatis ditolak hanya berdasarkan usia |
| E-04 | Berat 0 | Reject input |
| E-05 | Tinggi negatif | Reject input |
| E-06 | Berat sangat tinggi | Konfirmasi dan review metode berat acuan; tidak menerbitkan target tidak aman |
| E-07 | Berat sangat rendah | Tidak otomatis memberi defisit; cek kelayakan |
| E-08 | Aktivitas ekstrem | Hindari double counting olahraga |
| E-09 | Cutting ketika guardrail tidak lolos | `NEEDS_REVIEW`; tidak terapkan target baru |
| E-10 | Makro menyebabkan karbo <0 | `MACRO_CONSTRAINT_CONFLICT` |
| E-11 | Berat=Infinity, usia=NaN, angka overflow | Reject input tanpa crash |
| E-12 | Parameter rumus tidak sesuai | Jangan menebak konstanta; alternatif harus disepakati |
| E-13 | Pengguna memilih kondisi khusus | Kalkulator standar tidak tersedia; pesan jelas dan aman |
| E-14 | Aktivitas kosong/berubah saat perhitungan berjalan | Jangan pakai nilai stale; minta input/ulang hitung |

## 9. Matriks uji exception: food, tanggal, offline, concurrency

| ID | Kasus | Expected |
|---|---|---|
| X-01 | Add food saat offline | Tersimpan lokal, `LOCAL_PENDING` |
| X-02 | Retry setelah timeout | Mutasi idempotent; tidak duplikat |
| X-03 | Serat tidak ada | `null` + indikator parsial |
| X-04 | Makanan lengkap + parsial | Subtotal diketahui dengan status partial, bukan total pasti |
| X-05 | Hapus offline | Tombstone/perubahan tertunda tersinkron; tidak muncul lagi setelah konfirmasi |
| X-06 | Food catalog diperbarui | Nutrisi log lama tidak berubah |
| X-07 | Berat diubah saat offline | Tercatat dan dihitung ulang sesuai aturan status sinkronisasi |
| X-08 | Dua update berat cepat | Job lama tidak menimpa hasil versi terbaru |
| X-09 | Tanggal jurnal diganti | Ringkasan sesuai tanggal jurnal yang dipilih |
| X-10 | Hari tanpa log | `NO_DATA`, bukan 0 kcal dikonsumsi |
| X-11 | Custom food tanpa energi | Minta kelengkapan minimum, bukan set energi 0 |
| X-12 | Pengguna ganti akun dengan unsynced writes | Data akun lama tetap terisolasi |
| X-13 | Konflik edit dua perangkat | Deteksi konflik, kebijakan resolusi terdokumentasi; hindari silently lost update |
| X-14 | Recalculation target baru | Riwayat versi sebelumnya tetap tersedia |
| X-15 | Resep diubah setelah dicatat | Snapshot nutrisi lama tetap sama |
| X-16 | Jam lokal melewati tengah malam/ubah zona waktu | Konsisten dengan tanggal jurnal yang dipilih dan kebijakan timezone |
| X-17 | Satu porsi tanpa konversi gram valid | Tidak membuat perkiraan diam-diam; minta gram/ml |
| X-18 | Nilai nutrisi diketahui 0 vs unknown | 0 tetap 0; unknown tetap null |
| X-19 | Sync server gagal permanen | UI status `SYNC_ERROR` + retry aman; catatan lokal tidak hilang |
| X-20 | User logout dengan pending mutations | Peringatan risiko dan prosedur pemulihan sesuai desain |

## 10. Kriteria penerimaan sebelum coding engine

- [ ] Definisi kelayakan, kasus khusus, dan batas keamanan sudah direview ahli gizi/klinis.
- [ ] Tabel preset profil dan koefisien protein sudah diputuskan dan berversi.
- [ ] Berat acuan, faktor aktivitas, dan cara menangani aktivitas olahraga disetujui.
- [ ] Toleransi makro/energi, pembulatan, dan status error distandarkan.
- [ ] Auto-recalc mencatat source input, version, effective date dan menangani konflik.
- [ ] Matriks normal, ekstrem, dan exception dijadikan test fixtures otomatis.
- [ ] Data makanan `null` versus 0 dites menyeluruh sampai grafik dashboard.
- [ ] Perizinan, sumber, dan review kualitas data makanan terdokumentasi.

## 11. Open decisions / belum final

1. Definisi dan jalur UX untuk pengguna dengan kebutuhan khusus, termasuk pilihan untuk tidak menjawab pertanyaan penyaring.
2. Faktor aktivitas final serta aturan menghindari double counting olahraga.
3. Tabel preset otomatis untuk cutting, bulking, muscle gain, dan recomposition, berikut batas kelayakannya.
4. Metode berat acuan dan koefisien protein berdasarkan profil.
5. Alokasi lemak adaptif 25–30% dan pengecualian/constraint makro.
6. Batas dan kebijakan override target manual; siapa yang dapat memvalidasi.
7. Trigger auto-recalc dari pengukuran offline, threshold perubahan signifikan, dan handling outlier measurement.
8. Penanganan target aktif sebelumnya bila perhitungan baru gagal guardrail.
9. Penggunaan target nutrisi tambahan berdasarkan AKG, WHO, dan kelompok pengguna yang didukung.
10. Strategi resolusi konflik sinkronisasi dua perangkat.

## 12. Referensi untuk review (bukan endorsement terhadap seluruh parameter)

- Validasi Mifflin–St Jeor pada dewasa: https://pubmed.ncbi.nlm.nih.gov/23631843/
- Studi validasi lain: https://pubmed.ncbi.nlm.nih.gov/12963943/
- WHO, 2023, rekomendasi lemak jenuh dan trans: https://www.who.int/publications/i/item/9789240073630
- WHO, healthy diet: https://www.who.int/en/news-room/fact-sheets/detail/healthy-diet
- Permenkes 28/2019 AKG: https://peraturan.bpk.go.id/Details/138621/permenkes-no-28-tahun-2019

---

**Implementasi:** Codex boleh menggunakan dokumen ini untuk membuat struktur domain, tipe data, dan test fixtures **setelah scope disetujui**, tetapi **tidak boleh** menganggap kandidat angka nutrisi atau ambang keamanan sebagai parameter produksi yang tervalidasi.
