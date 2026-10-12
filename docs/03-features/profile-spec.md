# NUTRASA — Profile & Settings Specification

**Versi:** Draft v1.2\
**Status:** DRAFT — untuk review produk, teknis, legal, dan nutrisi\
**Lokasi repository:** [docs/03-features/profile-spec.md](profile-spec.md)\
**Platform:** React Native + Expo (Android/iOS)

> Dokumen ini adalah spesifikasi perilaku dan data, bukan persetujuan final untuk implementasi produksi. Parameter medis, aturan perlindungan data, serta detail autentikasi memerlukan review.

## 1. Tujuan dan ruang lingkup

Halaman Profil adalah pusat pengelolaan identitas, data tubuh, tujuan nutrisi, preferensi, keamanan akun, kontrol privasi, dan bantuan. Pisahkan profil pengguna dari layar Progress: pengukuran berat bisa ditambah dari Progress dan dilihat/diatur dari Profil, tetapi memakai sumber data yang sama.

### In-scope MVP
- Ringkasan akun (nama tampilan opsional, email/metode login, status verifikasi).
- Lihat/ubah data tubuh dan aktivitas; body type opsional hanya untuk tampilan.
- Lihat target energi dan makro, sumber perhitungan, status target, serta target manual dengan validasi.
- Riwayat versi target, termasuk hasil perubahan berat otomatis.
- Pengaturan satuan, zona waktu jurnal dan preferensi dasar.
- Status sinkronisasi, opsi retry, dan penjelasan data offline.
- Keamanan dan privasi: sign out, informasi penggunaan data, permintaan ekspor data, permintaan hapus akun/data.
- Bantuan, pelaporan masalah, versi aplikasi, kebijakan privasi dan ketentuan layanan.
- State loading, empty, error, offline, pending, conflict, restricted.

### Di luar MVP / placeholder
- Pembelian premium, AI coach, integrasi wearable, manajemen keluarga, foto progress, personalisasi medis.
- Jangan memasang paywall atau payment SDK hanya karena entry premium ada di desain.

## 2. Keputusan produk yang sudah disepakati

| ID | Aturan | Status |
|---|---|---|
| PR-001 | Nama/username opsional setelah pendaftaran | Agreed |
| PR-002 | Target dihitung otomatis dari profil yang memenuhi syarat | Agreed (parameter engine belum tervalidasi) |
| PR-003 | Pengguna dapat menyesuaikan target dengan validasi | Agreed |
| PR-004 | Berat baru memicu hitung ulang otomatis | Agreed (cara aktivasi bergantung safety gate) |
| PR-005 | Body type bersifat opsional dan tidak memengaruhi rumus | Agreed |
| PR-006 | Pengguna unsupported dapat menggunakan log-only tanpa target otomatis | Agreed |
| PR-007 | Draft onboarding disimpan lokal sampai selesai | Agreed |
| PR-008 | Fitur pencatatan offline-tolerant dengan sync | Agreed |
| PR-009 | Histori target dan nutrisi log tidak boleh diubah diam-diam | Invariant disetujui owner dalam tugas merge; detail teknis/tanggal berlaku masih terbuka |

## 3. Information architecture

**Tab Profil**
1. **Header profil:** avatar default/maskot bila sesuai design system, display name atau sapaan generik, email yang boleh disamarkan, status verifikasi.
2. **Data tubuh & aktivitas:** usia/tanggal lahir, tinggi, berat saat ini (derived from latest measurement), parameter rumus jika relevan, level aktivitas, body type opsional.
3. **Tujuan & target nutrisi:** tujuan, target berat untuk cutting/bulking, rincian target kalori/makro, sumber otomatis/manual, tanggal berlaku, status READY/NEEDS_REVIEW/UNSUPPORTED.
4. **Preferensi:** satuan berat/tinggi, bahasa Indonesia (default), tanggal/zona waktu jurnal, notifikasi (jika modul reminder ada).
5. **Akun & keamanan:** email/metode login, verifikasi, sign out, opsi pengelolaan akun.
6. **Privasi & data:** kebijakan, ringkasan izin/pemrosesan, ekspor data, hapus akun, status pending sync.
7. **Bantuan & tentang aplikasi:** FAQ, laporkan bug/data makanan, app version.
8. **AI & Premium:** entry point informational/coming soon hanya jika disetujui; tidak menjanjikan fitur yang belum tersedia.

## 4. Spesifikasi layar

### P-01 Profile overview
- Menampilkan identitas opsional, ringkasan tujuan serta navigasi ke subhalaman.
- Bila nama kosong, gunakan label netral tanpa asumsi gender.
- Tampilkan status verification dan sync bila relevan; jangan memaparkan token/login secret.
- Bila profil belum tersinkron, jelaskan bahwa beberapa data hanya tersedia di perangkat ini.

### P-02 Edit basic profile
- Field: display name (opsional), foto avatar (opsional untuk fase berikutnya), username (opsional, hanya jika kebijakan keunikan sudah dibuat).
- Pisahkan `displayName` dari `username`; email tidak otomatis dipakai sebagai username publik.
- Trim spasi, normalisasi Unicode secara aman, batasi panjang dan karakter sesuai aturan final; jangan menetapkan angka arbitrer tanpa spesifikasi.
- Simpan optimistik hanya jika recovery dan sync state jelas; kegagalan server tidak boleh dianggap sukses tersinkron.

### P-03 Body data & activity
- Edit tanggal lahir/usia (berdasarkan kebijakan onboarding), tinggi, kategori fisiologis rumus, aktivitas, body type visual opsional.
- Berat baru harus dicatat sebagai **weight measurement**, bukan sekadar menimpa satu field tanpa histori.
- Jika data yang memengaruhi engine berubah, invalidasi kalkulasi lama dan jalankan evaluasi baru.
- Data yang mengubah kelayakan dapat mengalihkan pengguna ke `LOG_ONLY` atau `NEEDS_REVIEW` tanpa memunculkan target asal.
- Perubahan jenis data sensitif meminta pemberitahuan sesuai kebijakan privasi.

### P-04 Goals & nutrition targets
- Tampilkan tujuan, target berat (wajib cutting/bulking pada profil supported), hasil energi/makro, tanggal efektif, `calculationVersion`, dan status sumber (`AUTO`/`MANUAL`).
- Ubah tujuan -> lakukan eligibility check dan kalkulasi ulang; jangan memaksakan target pada profil unsupported.
- Ubah target manual -> cek format, kelayakan, komposisi makro, dan aturan guardrail; blok bila melanggar aturan keselamatan yang telah disetujui.
- Jika auto-recalculation dari berat baru valid, simpan versi target baru secara atomik dan tanggal berlaku eksplisit. Jika `NEEDS_REVIEW`, jangan mengaktifkan nilai berisiko.
- **Perlu keputusan:** setelah edit manual, apakah update berat berikutnya otomatis menimpa override? Rekomendasi: manual override tetap berlaku sampai pengguna memilih kembali mode otomatis, kecuali safety gate mengharuskan review.

### P-05 Weight entry / history
- Tambah pengukuran dengan berat, tanggal/waktu pengukuran, satuan, sumber (manual).
- Edit/hapus measurement menggunakan ID stabil; hitung ulang target berdasarkan **measurement terbaru yang sah menurut waktu pengukuran dan aturan yang disepakati**, bukan urutan sync.
- Bila menambahkan data historis, jangan otomatis merombak target saat ini tanpa evaluasi hubungan tanggal.
- Pengukuran salah yang diedit/dihapus harus dapat membatalkan recalculation yang berasal darinya, dengan audit yang jelas.
- Progress dan Profil harus memakai measurement store yang sama.

### P-06 Preferences
- Satuan UI: kg/lb dan cm/ft-in bila dipilih; simpan nilai canonical sebagai kg/cm.
- Locale awal `id-ID`, dukungan en-ID/en-US nanti bila disetujui.
- Tanggal jurnal disimpan sebagai *local calendar date* yang konsisten; simpan timezone relevant untuk timestamp.
- Izin notifikasi diminta saat fitur notifikasi benar-benar dipakai, bukan saat membuka Profil.
- Ubah zona waktu jangan otomatis menggeser food logs ke tanggal berbeda tanpa kebijakan migrasi.

### P-07 Account & security
- Email login dan status verified dari auth provider tepercaya, bukan field yang pengguna bisa ubah sendiri tanpa verifikasi ulang.
- Metode login/email/password, Google, Apple: linking/unlinking akun belum final; cegah lockout (tidak boleh hapus metode login terakhir sebelum pengganti terverifikasi).
- Password reset lewat alur provider; jangan pernah menyimpan password di profil atau local storage.
- Sign out harus memperingatkan pending offline operations. Jangan membocorkan data lokal pengguna sebelumnya setelah pergantian akun.
- Verification pending: batasi **operasi terdefinisi** dan tampilkan CTA resend/refresh status; daftar operasi final perlu keputusan auth spec.

### P-08 Privacy & data management
- Privacy notice dan ketentuan dapat diakses sebelum dan setelah login.
- Berikan opsi permintaan data export dengan status proses yang jelas; jangan menjanjikan ekspor lengkap sebelum backend mendukungnya.
- Penghapusan akun harus mencakup reauthentication yang wajar, konfirmasi, proses request, status, pemutusan sesi, dan mekanisme penghapusan data termasuk backup sesuai kebijakan yang disetujui.
- Jelaskan dampak pending sync dan perangkat offline. Data yang dihapus tidak boleh muncul lagi akibat sync tertunda (gunakan tombstone/version rule).
- Persetujuan/notice kesehatan perlu legal review UU PDP dan aturan platform distribusi. Tidak boleh menganggap satu checkbox umum pasti cukup.

### P-09 Help, support, about
- FAQ untuk target, kualitas nutrisi parsial, offline sync, data food source.
- Laporkan data makanan salah dari food detail dengan reference food ID; jangan membiarkan pengguna mengubah katalog publik.
- Laporkan masalah teknis dengan metadata terbatas, tanpa mengirim data kesehatan/PII secara default.
- Tampilkan versi/build aplikasi.

## 5. Domain model konseptual (bukan SQL final)

- `UserAccount`: id, authProviderLinks, emailVerified, timestamps.
- `UserProfile`: userId, displayName?, username?, dateOfBirth?, heightCm?, activityLevel?, visualBodyType?, eligibilityFlags/status.
- `WeightMeasurement`: id, userId, measuredAt, weightKg, createdAt, modifiedAt, deletedAt?, syncVersion.
- `NutritionGoal`: id, userId, goalType, targetWeightKg?, mode(AUTO/MANUAL), effectiveFrom, effectiveTo?, engineVersion, inputSnapshot, kcalTarget?, proteinG?, carbsG?, fatG?, status, provenance.
- `UserPreference`: userId, units, locale, diaryTimezone, notificationSettings.
- `DataRequest`: id, userId, type(EXPORT/DELETE_ACCOUNT), status, requestedAt, completedAt?, errorCode?.
- `SyncOperation`: opId, userId, entityId, operation, payloadVersion, status, retryCount.

Sensitive body data should be minimized and access-controlled; final schema will be specified in architecture/database-schema.md.

## 6. State handling

| State | UI behavior |
|---|---|
| Loading | Skeleton / progress, disable duplicate submissions |
| Empty | Helpful CTA to complete profile or add weight |
| Offline | Show locally available data + accurate saved locally status |
| Pending Sync | Indicate unsynced, provide retry and potential sign-out warning |
| Sync Conflict | Explain conflict and safe recovery, never silently discard new data |
| Unauthorized | Redirect/re-auth per auth state, clear sensitive in-memory data |
| Unverified | Explain restricted operations, resend verification |
| Unsupported | Display log-only; no fabricated nutrition target |
| Needs Review | Show stale/suspended target state; no unsafe auto activation |
| Invalid Input | Field-specific error; preserve edit draft |
| Server Error | Retry without duplicate mutation; retain local data if permitted |
| Deleting Account | Prevent reappearance from stale offline operations |

## 7. Cross-feature rules

1. Target calculations only via versioned Nutrition Engine; never reimplement formula in Profile UI.
2. Editing body data or goal should emit one domain event that invalidates affected views, not maintain separate competing stores.
3. Dashboard and Progress consume the same effective-dated goal history.
4. Weight entered through Progress and Profile is the same entity set.
5. Food log snapshots remain unchanged when profile/target changes.
6. Manual goal adjustments must be distinguished from automatically generated goals.
7. Sync status is not the same as save success; local save can succeed before server confirms.
8. PII must never be placed in analytics logs or error reports by default.
9. Backend always enforces account ownership and authorization, regardless of route guards.
10. Cached user data is isolated by account ID, including pending writes.

## 8. Validation & edge cases

| ID | Test scenario | Expected outcome |
|---|---|---|
| PF-01 | New account, no display name | Generic greeting, no broken UI |
| PF-02 | Edit display name offline | Local pending; no false synced label |
| PF-03 | Duplicate username | Conflict message if unique usernames supported |
| PF-04 | Email unverified | Appropriate restrictions; onboarding draft preserved |
| PF-05 | Update weight 70→69 | Recalculation evaluated; goal version updated only if valid |
| PF-06 | Weight 0 or NaN | Reject, preserve previous data |
| PF-07 | Backdated weight | Does not blindly replace current goal |
| PF-08 | Delete most recent measurement | Re-evaluate effective weight source and derived goal |
| PF-09 | Two same-day measurements | Deterministic latest measurement rule |
| PF-10 | Update body height | Recalculate or flag review with versioning |
| PF-11 | Age becomes unsupported | Disable default auto calculation; preserve logs |
| PF-12 | Unsupported profile | Log-only without fabricated progress goals |
| PF-13 | User edits target beyond safety policy | Block unsafe target; explain why |
| PF-14 | Manual target then weight change | Apply agreed override precedence; no unexpected overwrite |
| PF-15 | Two devices change goal offline | Resolve conflict safely with audit trail |
| PF-16 | Change units kg→lb→kg | Canonical value stable without cumulative rounding |
| PF-17 | Change diary timezone | No silent movement of historical records |
| PF-18 | Logout with pending operations | Warn; data isolated, no leakage to next account |
| PF-19 | Re-login on same device | Correct account-local queue restored safely |
| PF-20 | Delete request with offline backlog | Old operations cannot resurrect deleted profile |
| PF-21 | Export request offline | Clear queued/unsupported status, no false completion |
| PF-22 | Invalid or expired session | Secure reauthentication without losing safe draft |
| PF-23 | Link external auth that already belongs to another account | Safe conflict handling, no data merging by default |
| PF-24 | App reinstall with only local unsynced data | Explain that un-synced data may be lost |
| PF-25 | Rapid repeated save taps | Idempotent or debounced, no duplicates |
| PF-26 | Reset password | Use approved provider flow; never store password locally |
| PF-27 | App offline and privacy docs not cached | Show a safe fallback and ability to view once online |
| PF-28 | Account deletion after reauthentication | Request tracked, access revoked per agreed policy |
| PF-29 | Offline edit conflict with server version | Non-destructive recovery and clear status |
| PF-30 | Profile screen with missing nutrition goal | Do not render 0 target; display setup/log-only context |

## 9. Accessibility & localization

- Labels and feedback in natural Bahasa Indonesia; avoid medical jargon unless explained.
- Dynamic text, screen reader labels, sufficient hit target and contrast, sensible keyboard/input handling.
- Error messages readable without relying solely on color; no surprise navigation after save.
- Do not presume any user's gender based on name, photo, or appearance.
- Nutrition units and decimal grouping formatted using locale without losing internal numerical precision.

## 10. Security, legal & medical review gates

- **LEGAL REVIEW REQUIRED:** health/body data processing basis, notice/consent, export/delete rights, retention, backup erasure, minor/unsupported access, platform account deletion requirements.
- **MEDICAL/NUTRITION REVIEW REQUIRED:** eligibility, target ranges, auto recalculation, safety gates, personalization, and manual override restrictions.
- **TECHNICAL REVIEW REQUIRED:** auth provider choices, account linking, local data encryption posture, conflict strategy, delete tombstones, background limitations, and analytics redaction.
- **PRODUCT DECISION REQUIRED:** premium entry visibility, username uniqueness, email verification operation restrictions, export implementation schedule, manual goal precedence, weight measurement conflict policy.

## 11. Open decisions / decision register

| ID | Question | Proposed default | Status |
|---|---|---|---|
| PD-01 | Manual goals versus later auto-recalc | Preserve manual override; auto mode opt-in | Pending approval |
| PD-02 | Multiple weight measurements per day | Allow; latest measuredAt with deterministic tie-break | Pending approval |
| PD-03 | Effective date of automatic goal revision | From valid new measurement onward; never retroactive | Pending approval |
| PD-04 | Account export in MVP | Offer request-based export if supported; otherwise mark roadmap | Pending prioritization |
| PD-05 | Username identifier | Optional display name now; unique username deferred | Pending approval |
| PD-06 | Profile photo upload | Default avatar in MVP, upload later | Pending approval |
| PD-07 | Premium/AI menu | Informational placeholder only if approved | Pending approval |
| PD-08 | Email verification restrictions | Define exact protected operations in auth spec | Pending auth design |
| PD-09 | Offline policy for sensitive profile edits | Local draft with explicit pending, final server validation | Pending security review |
| PD-10 | Profile deletion and reactivation window | Defined via legal/backend policy, not assumed | Pending legal review |

## 12. Acceptance criteria for developer handoff

- All screens and operations identified have defined empty, loading, error and offline states.
- No nutrition target or medical recommendation is created in UI directly.
- All weight and goal updates preserve version history and effective dates.
- Edit data from Profile is reflected in Progress/Dashboard consistently.
- Unauthorized cross-account access fails on the backend; local data separated.
- Operations needing verification and online connectivity are clearly marked.
- Data deletion/export behavior is either implemented and tested or clearly out-of-scope; no misleading UI.
- Test cases PF-01–PF-30 can be converted into unit/integration/E2E tests.
- Pending legal/medical/technical decisions are recorded and block production claims where relevant.

## 13. Dependencies & next steps

**Dependencies:** [onboarding-spec.md](../01-design/onboarding-spec.md), [nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md), [progress-spec.md](progress-spec.md), [dashboard-spec.md](dashboard-spec.md), [food-logging-spec.md](food-logging-spec.md), pending [auth-spec.md](auth-spec.md) and [offline-sync-spec.md](../02-architecture/offline-sync-spec.md).

**Next review:** [docs/03-features/auth-spec.md](auth-spec.md) and [docs/02-architecture/offline-sync-spec.md](../02-architecture/offline-sync-spec.md) are now available as drafts; review their open policies with this specification. Finalize navigation and visual design details before the corresponding implementation task.
