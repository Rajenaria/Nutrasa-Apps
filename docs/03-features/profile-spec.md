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
- Lihat target energi/makro otomatis, sumber perhitungan, histori/tanggal efektif dan status; target manual/override post-MVP.
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
| PR-003 | MVP hanya mengubah input profil/tujuan lalu reevaluasi AUTO; edit angka target manual post-MVP | RESOLVED D02; menggantikan usulan manual lama |
| PR-004 | Berat baru memicu hitung ulang otomatis | Agreed (cara aktivasi bergantung safety gate) |
| PR-005 | Body type bersifat opsional dan tidak memengaruhi rumus | Agreed |
| PR-006 | MVP hanya dewasa 18+ eligible; tidak ada LOG_ONLY atau target numerik bagi profil tidak didukung | Agreed D04; detail eligibility/review tetap OPEN |
| PR-007 | Draft onboarding disimpan lokal sampai selesai | Agreed |
| PR-008 | Fitur pencatatan offline-tolerant dengan sync | Agreed |
| PR-009 | Histori target dan nutrisi log tidak boleh diubah diam-diam | Invariant disetujui owner dalam tugas merge; detail teknis/tanggal berlaku masih terbuka |

## 3. Information architecture

**Tab Profil**
1. **Header profil:** avatar default/maskot bila sesuai design system, display name atau sapaan generik, email yang boleh disamarkan, status verifikasi.
2. **Data tubuh & aktivitas:** usia/tanggal lahir, tinggi, berat saat ini (derived from latest measurement), parameter rumus jika relevan, level aktivitas, body type opsional.
3. **Tujuan & target nutrisi:** tujuan, target berat kondisional, target otomatis dan tanggal efektif; manual post-MVP, tanpa target numerik untuk profil tidak eligible.
4. **Preferensi:** satuan berat/tinggi, bahasa Indonesia (default), tanggal/zona waktu jurnal, notifikasi (jika modul reminder ada).
5. **Pengaturan > Data Diri:** status email dan aksi verifikasi/kirim ulang opsional; keamanan, sign out dan pengelolaan akun mengikuti Firebase reauth sensitif.
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
- Tanggal lahir lengkap disimpan sebagai DATE dengan privasi ketat; usia dihitung backend. Edit tinggi, calculation_parameter, activity_level, goal_type dan body_type_visual opsional mengikuti kontrak identity. Transport edit DOB/calculation_parameter belum tersedia di ProfilePatch OpenAPI: **OPEN**, jangan mengarang field request.
- Goal codes: maintenance/cutting/bulking/muscle_gain; activity codes: very_low/light/moderate/high/very_high. Ini vocabulary struktural, bukan approval faktor/rumus klinis. Calculation parameter wajib kode tidak kosong; nilai klinis dan kompatibilitas tetap OPEN, tanpa fallback buatan. Target berat wajib cutting/bulking dan selalu valid bila diberikan.
- Tinggi memakai numeric(8,2), berat numeric(10,3) dan decimal-string API; backend menolak presisi berlebih sebelum pembulatan PostgreSQL, overflow serta nilai nonpositif/non-finite. Body type tidak memengaruhi engine.
- Berat baru harus dicatat sebagai **weight measurement**, bukan sekadar menimpa satu field tanpa histori.
- Jika data yang memengaruhi engine berubah, invalidasi kalkulasi lama dan jalankan evaluasi baru.
- Jika data mengubah eligibility, jelaskan status tidak eligible/NEEDS_REVIEW tanpa target numerik baru; tidak ada jalur LOG_ONLY aktif MVP. Perlakuan target sebelumnya mengikuti review keamanan dan histori.
- Perubahan jenis data sensitif meminta pemberitahuan sesuai kebijakan privasi.

### P-04 Goals & nutrition targets
- Tampilkan tujuan, target berat kondisional, hasil otomatis energi/makro, tanggal efektif, calculationVersion dan sumber AUTO; tidak ada MANUAL aktif MVP.
- Ubah tujuan -> lakukan eligibility check dan kalkulasi ulang; jangan memaksakan target pada profil unsupported.
- Target manual/override ditunda ke post-MVP; jangan tampilkan kontrol edit angka target pada MVP. Review guardrails masa depan tetap OPEN.
- Jika auto-recalculation dari berat baru valid, simpan versi target baru secara atomik dan tanggal berlaku eksplisit. Jika `NEEDS_REVIEW`, jangan mengaktifkan nilai berisiko.
- **RESOLVED D02/D03:** berat valid terbaru memicu reevaluasi target otomatis; versi histori dipertahankan. Precedence manual bukan fitur MVP; kebijakan post-MVP tetap memerlukan review.

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
- Persisted user_preferences dibuat atomik dengan profil lengkap setelah onboarding server valid; bukan row default sebelum onboarding. language_code, time_zone IANA, preferred_weight_unit kg/lb dan updated_at wajib. Locale tampilan awal bukan otomatis language_code tersimpan; mapping bahasa/locale dan transport completion tetap OPEN. Jangan mengasumsikan Asia/Jakarta dari negara pengguna.

### P-07 Account & security
- Email login dan status verified dari auth provider tepercaya, bukan field yang pengguna bisa ubah sendiri tanpa verifikasi ulang.
- Metode login/email/password, Google, Apple: linking/unlinking akun belum final; cegah lockout (tidak boleh hapus metode login terakhir sebelum pengganti terverifikasi).
- Password reset lewat alur provider; jangan pernah menyimpan password di profil atau local storage.
- Logout: pending outbox offers sync first/cancel/clear with loss confirmation; completed logout clears private SQLite/draft/outbox, keys/session and memory. Account deletion coordinates Firebase/PostgreSQL/local with retry; device/security tests OPEN.
- Email verification opsional: status, verify/resend di Profil > Pengaturan > Data Diri; onboarding/main features/sync tetap tersedia. Tindakan sensitif mengikuti reautentikasi Firebase.

### P-08 Privacy & data management
- Privacy notice dan ketentuan dapat diakses sebelum dan setelah login.
- Berikan opsi permintaan data export dengan status proses yang jelas; jangan menjanjikan ekspor lengkap sebelum backend mendukungnya.
- Penghapusan akun harus mencakup reauthentication yang wajar, konfirmasi, proses request, status, pemutusan sesi, dan mekanisme penghapusan data termasuk backup sesuai kebijakan yang disetujui.
- Jelaskan dampak pending sync dan perangkat offline. Data yang dihapus tidak boleh muncul lagi akibat sync tertunda (gunakan tombstone/version rule).
- Persetujuan/notice kesehatan perlu legal review UU PDP dan aturan platform distribusi. Tidak boleh menganggap satu checkbox umum pasti cukup.
- M03-01A menyetujui satu tindakan approval UX registrasi/onboarding dengan notice penjelas tanpa approval berulang untuk tujuan sama; validitas legal gabungan tetap OPEN. Bukti user/notice/type/timestamp server berversi, retry identik tidak menggandakan atau menimpa record. ONBOARDING_PRIVACY hanya PROPOSED. Saat final deletion, bukti direncanakan ikut dihapus kecuali ada retensi sah; withdrawal/backups/legal retention tetap OPEN. FK struktural sudah final pada [kontrak identity](../02-architecture/postgres-physical-schema-v1.5.md#kontrak-identity-m03-01a); RESTRICT mengharuskan acknowledgement diselesaikan sebelum akun dihapus. Retensi setelah penghapusan akun memerlukan review arsitektur terlebih dahulu. PENDING_DELETION adalah status logis yang memblokir mutasi/sync yang tidak diizinkan; CASCADE hanya berlaku pada penghapusan fisik dan bukan workflow lengkap.

### P-09 Help, support, about
- FAQ untuk target, kualitas nutrisi parsial, offline sync, data food source.
- Laporkan data makanan salah dari food detail dengan reference food ID; jangan membiarkan pengguna mengubah katalog publik.
- Laporkan masalah teknis dengan metadata terbatas, tanpa mengirim data kesehatan/PII secara default.
- Tampilkan versi/build aplikasi.

## 5. Domain model konseptual (bukan SQL final)

- `UserAccount`: id, authProviderLinks, emailVerified, timestamps.
- `UserProfile`: user_id PK/FK, date_of_birth DATE, height_cm, calculation_parameter, activity_level, goal_type, onboarding_completed_at dan profile_revision positif semuanya wajib; target_weight_kg kondisional dan body_type_visual opsional. Profil hanya dibuat lengkap bersama preferensi; tidak ada onboarding_status/current_weight atau eligibilityFlags spekulatif. Display name/username konseptual bukan izin menambah kolom identity.
- `WeightMeasurement`: id, userId, measuredAt, weightKg, createdAt, modifiedAt, deletedAt?, syncVersion.
- `NutritionGoal`: id, userId, goalType, targetWeightKg?, mode(AUTO only MVP), effectiveFrom, effectiveTo?, engineVersion, inputSnapshot, kcalTarget?, proteinG?, carbsG?, fatG?, status, provenance; manual post-MVP.
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
| Sync rejection/pending | Honest receipt/error state; recover unsent data; normal cross-device edits follow server-ordered LWW |
| Unauthorized | Redirect/re-auth per auth state, clear sensitive in-memory data |
| Unverified | Optional verify/resend at Pengaturan > Data Diri; main features/onboarding/sync available; sensitive reauth retained |
| Unsupported | Ineligible for MVP; no fabricated target or LOG_ONLY access |
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
6. Target otomatis saja pada MVP; manual/override post-MVP. Histori target tetap mengikuti versi dan waktu efektif.
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
| PF-04 | Email unverified | Main features/onboarding/sync available; optional verification in Data Diri and Firebase sensitive reauth |
| PF-05 | Update weight 70→69 | Recalculation evaluated; goal version updated only if valid |
| PF-06 | Weight 0 or NaN | Reject, preserve previous data |
| PF-07 | Backdated weight | Does not blindly replace current goal |
| PF-08 | Delete most recent measurement | Re-evaluate effective weight source and derived goal |
| PF-09 | Two same-day measurements | Deterministic latest measurement rule |
| PF-10 | Update body height | Recalculate or flag review with versioning |
| PF-11 | Age becomes unsupported | Disable default auto calculation; preserve logs |
| PF-12 | Unsupported profile | Ineligible for MVP; no numeric target or LOG_ONLY fallback |
| PF-13 | User changes goal/target weight beyond reviewed safety policy | Reject unsafe input; no manual calorie/macro target control MVP |
| PF-14 | Weight change in MVP | Automatic reevaluation from latest valid measurement; historical versions preserved; manual post-MVP |
| PF-15 | Two devices edit weight/profile offline | Server-ordered LWW for edits; latest valid measured_at for weight source; serialized target versions |
| PF-16 | Change units kg→lb→kg | Canonical value stable without cumulative rounding |
| PF-17 | Change diary timezone | No silent movement of historical records |
| PF-18 | Logout with pending operations | Sync/cancel/confirmed loss choices; completed logout clears personal data; no cross-account leak |
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
| PF-29 | Two-device edit | Latest valid server-applied write wins; rejected tombstone/payload failures have safe recovery |
| PF-30 | Nutrition goal missing/pending | No zero target; explain pending/review state without LOG_ONLY fallback |

## 9. Accessibility & localization

- Labels and feedback in natural Bahasa Indonesia; avoid medical jargon unless explained.
- Dynamic text, screen reader labels, sufficient hit target and contrast, sensible keyboard/input handling.
- Error messages readable without relying solely on color; no surprise navigation after save.
- Do not presume any user's gender based on name, photo, or appearance.
- Nutrition units and decimal grouping formatted using locale without losing internal numerical precision.

## 10. Security, legal & medical review gates

- **LEGAL REVIEW REQUIRED:** health/body data processing basis, notice/consent, export/delete rights, retention, backup erasure, minor/unsupported access, platform account deletion requirements.
- **MEDICAL/NUTRITION REVIEW REQUIRED:** eligibility, target ranges, auto recalculation, safety gates and personalization; manual override review is post-MVP.
- **TECHNICAL REVIEW REQUIRED:** Firebase SDK/persistence compatibility with Expo 57, account linking, SQLCipher device tests, server-ordered LWW/concurrency, tombstones, background limits and analytics redaction.
- **PRODUCT DECISION REQUIRED:** premium visibility, username uniqueness and export schedule. Email optional, automatic-only MVP and no LOG_ONLY are RESOLVED; do not reopen their scope.

## 11. Open decisions / decision register

| ID | Question | Proposed default | Status |
|---|---|---|---|
| PD-01 | Manual goals versus auto-recalc | RESOLVED scope: manual post-MVP; automatic only MVP | Post-MVP safety/precedence review OPEN |
| PD-02 | Multiple weight measurements per day | Allow; latest measuredAt with deterministic tie-break | Pending approval |
| PD-03 | Automatic goal effective time | Forward from server activation per schema/Decision 03, never retroactive | Design set; boundary fixtures/tests OPEN |
| PD-04 | Account export in MVP | Offer request-based export if supported; otherwise mark roadmap | Pending prioritization |
| PD-05 | Username identifier | Optional display name now; unique username deferred | Pending approval |
| PD-06 | Profile photo upload | Default avatar in MVP, upload later | Pending approval |
| PD-07 | Premium/AI menu | Informational placeholder only if approved | Pending approval |
| PD-08 | Email verification | RESOLVED D01: optional, features available; Data Diri verify/resend | SDK/security tests OPEN |
| PD-09 | Offline policy for sensitive profile edits | Local draft with explicit pending, final server validation | Pending security review |
| PD-10 | Profile deletion and reactivation window | Defined via legal/backend policy, not assumed | Pending legal review |

## 12. Acceptance criteria for developer handoff

- All screens and operations identified have defined empty, loading, error and offline states.
- No nutrition target or medical recommendation is created in UI directly.
- All weight and goal updates preserve version history and effective dates.
- Edit data from Profile is reflected in Progress/Dashboard consistently.
- Unauthorized cross-account access fails on the backend; local data separated.
- Online-only actions and Firebase reauthentication for sensitive operations are clear; email verification does not gate main features.
- Data deletion/export behavior is either implemented and tested or clearly out-of-scope; no misleading UI.
- Test cases PF-01–PF-30 can be converted into unit/integration/E2E tests.
- Pending legal/medical/technical decisions are recorded and block production claims where relevant.

## 13. Dependencies & next steps

**Dependencies:** [onboarding-spec.md](../01-design/onboarding-spec.md), [nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md), [progress-spec.md](progress-spec.md), [dashboard-spec.md](dashboard-spec.md), [food-logging-spec.md](food-logging-spec.md), pending [auth-spec.md](auth-spec.md) and [offline-sync-spec.md](../02-architecture/offline-sync-spec.md).

**Next review:** [docs/03-features/auth-spec.md](auth-spec.md) and [docs/02-architecture/offline-sync-spec.md](../02-architecture/offline-sync-spec.md) are now available as drafts; review their open policies with this specification. Finalize navigation and visual design details before the corresponding implementation task.
