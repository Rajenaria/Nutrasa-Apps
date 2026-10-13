# NUTRASA — Navigation & Screen Inventory Specification

**Versi:** v1.5 (draft developer review)  
**Platform:** React Native + Expo + Expo Router + TypeScript  
**Lokasi repository:** [docs/01-design/navigation-spec.md](navigation-spec.md)\
**Status:** DRAFT — keputusan yang belum disetujui ditandai `[PROPOSED]`; belum instruksi untuk langsung membangun semua screen.

## 1. Tujuan dan batasan

Dokumen ini mendefinisikan hierarki layar, route map, alur pengguna, aturan akses, tab navigasi, parameter route, deep link, back navigation, modal, dan state navigasi NUTRASA. Fokus rilis pertama adalah fitur pencatatan nutrisi Indonesia, bukan AI ataupun premium yang berfungsi penuh.

**Sumber keputusan terdahulu:** onboarding-spec.md, auth-spec.md, food-database-spec.md, food-logging-spec.md, dashboard-spec.md, progress-spec.md, profile-spec.md, offline-sync-spec.md, nutrition-engine-spec.md, business-rules.md. Jika ada konflik, catat dalam decision register, jangan diam-diam ubah dokumen lain.

### Diputuskan
- Login / register sebelum onboarding; pengguna lama dengan sesi dan onboarding lengkap langsung ke Home.
- Verifikasi email opsional; onboarding, penyimpanan profil final, Home, dan sync tidak diblokir oleh email belum terverifikasi. Tindakan sensitif mengikuti reautentikasi Firebase.
- Draft onboarding lokal hingga selesai; server memvalidasi token dan eligibility saat penyimpanan, bukan mewajibkan email verified.
- Onboarding visual, body type opsional dan tidak memengaruhi perhitungan; target berat wajib untuk cutting/bulking.
- MVP hanya dewasa 18+ dengan profil didukung; tidak ada LOG_ONLY aktif atau target numerik bagi profil tidak eligible.
- Target hasil kalkulator yang layak otomatis aktif, tanpa halaman konfirmasi wajib; status tidak layak tidak boleh diaktifkan.
- Navigasi bawah yang diinginkan: Home, Makanan, Progress, Profil, AI Tracking (AI bukan fitur aktif MVP).
- Makanan MVP: search, kategori, detail, porsi, food log, custom food sederhana, recent, favorit makanan, dan salin catatan. Recipe builder post-MVP (O-18 final).
- Progress: nutrisi, berat badan, konsistensi; kalender dan log mengikuti tanggal jurnal yang dipilih.
- Offline-tolerant dan sinkronisasi; perubahan lokal yang pending tidak boleh hilang.

### Prinsip implementasi
1. `src/app/` Expo Router berisi route dan layout tipis; logika bisnis ada di `src/features/`. Pertahankan konvensi repository.
2. Satu screen memiliki satu route canonical; jangan duplikasi implementasi demi asal navigasi.
3. Gunakan tabs untuk area utama, stack untuk detail, dan modal/sheet hanya untuk tugas singkat.
4. Protected routes adalah proteksi navigasi sisi klien, **bukan otorisasi backend**.
5. Jangan menganggap parameter URL atau data dari deep link tepercaya.
6. Perubahan status sesi/onboarding tidak boleh membuka konten akun sebelumnya dalam satu frame.
7. Navigasi state bukan pengganti server state atau penyimpanan offline.

## 2. Root app entry & akses

### State akses (terpisah)
- `session`: `INITIALIZING | SIGNED_OUT | SIGNED_IN | SESSION_RECHECK | ERROR`.
- `onboarding`: `NOT_STARTED | IN_PROGRESS | NEEDS_REVIEW | COMPLETED | INELIGIBLE`.
- `emailVerification`: `NOT_APPLICABLE | UNVERIFIED | VERIFIED | UNKNOWN`.
- `sync`: `LOCAL_ONLY | PENDING | SYNCING | SYNCED | FAILED` (status data); receipt/rejection ditangani per operasi, normal LWW bukan konflik revisi.

### Route resolution
1. `INITIALIZING`: tahan konten terlindungi di splash/bootstrap; jangan render dashboard sementara.
2. `SIGNED_OUT`: tampilkan Welcome/Auth; deep link terlindungi boleh menyimpan *intended destination* yang telah divalidasi.
3. `SIGNED_IN + NOT_STARTED/IN_PROGRESS`: buka onboarding dari langkah valid terakhir.
4. `SIGNED_IN + NEEDS_REVIEW`: alur peninjauan/penjelasan; jangan masukkan target yang belum layak.
5. `SIGNED_IN + COMPLETED`: buka Home atau deep link yang boleh diakses.
6. `SIGNED_IN + INELIGIBLE`: jelaskan ketidaklayakan MVP; jangan masuk Home lewat LOG_ONLY atau membuat target numerik.
7. Session expired ketika online: bersihkan navigasi terlindungi dan minta autentikasi ulang. Ketika offline, kebijakan membuka cache pribadi memerlukan spesifikasi keamanan tersendiri.
8. `UNVERIFIED` tidak menghalangi fitur utama, onboarding, Home, atau sync; aksi sensitif memakai reautentikasi Firebase bila diperlukan.

**RESOLVED D01:** profil final, Home, dan sync tersedia dengan token valid serta eligibility yang sesuai meski email belum verified. Status/aksi verifikasi berada di Profil > Pengaturan > Data Diri; integrasi SDK dan keamanan tetap perlu diuji.

## 3. Lima tab utama

| Tab | Label | Tujuan landing | Status | Aturan |
|---|---|---|---|---|
| 1 | Home | `/home` | MVP | Dashboard tanggal terpilih dan diary |
| 2 | Makanan | `/foods` | MVP | Cari, recent, favorit, kategori, custom food sederhana; resep pengguna post-MVP |
| 3 | Progress | `/progress` | MVP | Grafik nutrisi, berat badan, konsistensi |
| 4 | Profil | `/profile` | MVP | Data pengguna, tujuan, akun, privacy |
| 5 | AI | `/ai` | [PROPOSED] | Placeholder noninteraktif “Coming Soon”, tidak meminta pembayaran dan tidak menjanjikan fungsi aktif |

**[OPEN]** Tab AI: tampilkan placeholder atau sembunyikan sampai dirilis. Permintaan produk menyebut AI di navbar, maka default desain sementara adalah placeholder yang jelas.

Tab bar hanya tampil dalam shell `(tabs)`; disembunyikan ketika autentikasi dan onboarding. Untuk food detail/log composer, tab bar **[PROPOSED]** ditutup agar fokus; saat selesai kembali ke konteks asal.

## 4. Screen inventory — MVP dan status

Status: `MVP`, `CONDITIONAL`, `FUTURE`, `[PROPOSED]` = masih perlu keputusan UX.

### A. Entry & authentication
| ID | Screen | Route konseptual | Status | Entry / Exit |
|---|---|---|---|---|
| AU-01 | Bootstrap / Session resolution | `/` | MVP | Splash native -> state-aware redirect |
| AU-02 | Welcome | `/welcome` | MVP | -> login/register |
| AU-03 | Login | `/sign-in` | MVP | -> onboarding atau Home |
| AU-04 | Register | `/sign-up` | MVP | -> onboarding |
| AU-05 | Forgot password | `/forgot-password` | MVP | -> cek email / sign-in |
| AU-06 | Reset password callback | `/auth/reset` | CONDITIONAL | deep link -> reset -> sign-in |
| AU-07 | Email verification info | `/verify-email` | MVP | resend / back / continue sesuai kebijakan |
| AU-08 | OAuth callback | `/auth/callback` | CONDITIONAL | Google/Apple sesuai provider terpilih |

### B. Onboarding
| ID | Screen | Route konseptual | Status |
|---|---|---|---|
| OB-01 | Info pemrosesan data + pemberitahuan | `/onboarding/privacy` | MVP |
| OB-02 | Goal selection | `/onboarding/goal` | MVP |
| OB-03 | Umur/kelayakan | `/onboarding/eligibility` | MVP |
| OB-04 | Tinggi, berat, parameter kalkulator | `/onboarding/body` | MVP |
| OB-05 | Body type visual | `/onboarding/body-type` | Optional |
| OB-06 | Activity (satu pertanyaan) | `/onboarding/activity` | MVP |
| OB-07 | Target berat kondisional | `/onboarding/target-weight` | MVP untuk cutting/bulking |
| OB-08 | Kondisi khusus / unsupported | `/onboarding/safety` | MVP |
| OB-09 | Processing & result (otomatis) | `/onboarding/result` | MVP |
| OB-10 | Needs review / unavailable target | `/onboarding/review` | CONDITIONAL |
| OB-11 | Complete and transfer draft | `/onboarding/finish` | MVP |

Langkah diperlakukan sebagai tahapan konsep: setelah UX review boleh digabung dalam satu route wizard jika lebih sederhana. Jika menggunakan banyak route, penjagaan urutan tahap dilakukan via validasi, bukan hanya tombol disabled.

### C. Home, jurnal dan kalender
| ID | Screen | Route konseptual | Status |
|---|---|---|---|
| HM-01 | Home dashboard | `/home` | MVP |
| HM-02 | Calendar/date selector | `/calendar` | MVP (modal atau screen, [PROPOSED]) |
| HM-03 | Daily nutrition detail | `/nutrition/daily` | MVP |
| HM-04 | Meal/day details | `/diary/[date]` | [PROPOSED], boleh dibangun di Home tanpa screen tambahan |

### D. Food catalog & logging
| ID | Screen | Route konseptual | Status |
|---|---|---|---|
| FD-01 | Food landing/search | `/foods` | MVP |
| FD-02 | Category list | `/foods/categories` | MVP |
| FD-03 | Category results | `/foods/categories/[categoryId]` | MVP |
| FD-04 | Food detail | `/foods/[foodId]` | MVP |
| FD-05 | Portion/log composer | `/food-log/new` | MVP |
| FD-06 | Edit existing log | `/food-log/[logId]/edit` | MVP |
| FD-07 | Custom food create/edit | `/custom-food/new`, `/custom-food/[foodId]/edit` | MVP |
| FD-08 | Recipe list | `/recipes` | FUTURE — post-MVP |
| FD-09 | Recipe create/edit | `/recipes/new`, `/recipes/[recipeId]/edit` | FUTURE — post-MVP |
| FD-10 | Recipe detail | `/recipes/[recipeId]` | FUTURE — post-MVP |
| FD-11 | Recent/Favorites | Sections on `/foods` | MVP; dedicated routes unnecessary initially |
| FD-12 | Copy meal source picker | `/food-log/copy` | MVP, modal/sheet [PROPOSED] |
| FD-13 | Food feedback/report | `/foods/[foodId]/report` | [PROPOSED] |

### E. Progress
| ID | Screen | Route konseptual | Status |
|---|---|---|---|
| PR-01 | Progress overview | `/progress` | MVP |
| PR-02 | Nutrition trends detail | `/progress/nutrition` | [PROPOSED] boleh satu layar |
| PR-03 | Weight history | `/progress/weight` | MVP |
| PR-04 | Add/Edit weight | `/weight/new`, `/weight/[entryId]/edit` | MVP |
| PR-05 | Logging consistency | `/progress/consistency` | [PROPOSED] boleh satu layar |

### F. Profile/settings
| ID | Screen | Route konseptual | Status |
|---|---|---|---|
| PF-01 | Profile landing | `/profile` | MVP |
| PF-02 | Account details | `/profile/account` | MVP |
| PF-03 | Body/activity settings | `/profile/body` | MVP |
| PF-04 | Nutrition goals | `/profile/goals` | MVP |
| PF-05 | Edit goal / manual override | `/profile/goals/edit` | FUTURE — post-MVP |
| PF-06 | Preferences | `/profile/preferences` | MVP |
| PF-07 | Security/session | `/profile/security` | MVP |
| PF-08 | Privacy & data | `/profile/privacy` | MVP |
| PF-09 | Account deletion | `/profile/delete-account` | MVP |
| PF-10 | Help/about | `/profile/help` | MVP |
| PF-11 | Data export | `/profile/export` | [PROPOSED] bila tersedia pada MVP |
| PF-12 | Premium | `/premium` | FUTURE, jangan sediakan pembelian palsu |

### G. Future
| ID | Screen | Route | Status |
|---|---|---|---|
| AI-01 | AI entry | `/ai` | Placeholder [PROPOSED] |
| AI-02 | AI photo logging/chat | Belum didefinisikan | FUTURE |
| FUT-01 | Water/sleep/activity tracking | Belum didefinisikan | FUTURE |

## 5. Expo Router — struktur rute rekomendasi (konseptual)

**Catatan:** Repository memakai `src/app/`; pertahankan lokasi ini dan route tipis sesuai AGENTS.md. Contoh konseptual berikut mencakup rute masa depan yang diberi label; bukan instruksi migrasi atau pembuatan semua rute.

```text
src/app/
├── _layout.tsx                 # providers + root stack + route guards
├── index.tsx                   # bootstrap / role-safe redirect
├── (auth)/
│   ├── _layout.tsx
│   ├── welcome.tsx
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   ├── forgot-password.tsx
│   └── verify-email.tsx
├── auth/
│   ├── callback.tsx            # only if required by chosen auth SDK
│   └── reset.tsx               # only if required
├── (onboarding)/
│   ├── _layout.tsx
│   └── onboarding/
│       ├── index.tsx
│       ├── privacy.tsx
│       ├── goal.tsx
│       ├── eligibility.tsx
│       ├── body.tsx
│       ├── body-type.tsx
│       ├── activity.tsx
│       ├── target-weight.tsx
│       ├── safety.tsx
│       ├── result.tsx
│       ├── review.tsx
│       └── finish.tsx
├── (main)/
│   ├── _layout.tsx             # authenticated/onboarded stack
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── home.tsx
│   │   ├── foods.tsx
│   │   ├── progress.tsx
│   │   ├── profile.tsx
│   │   └── ai.tsx
│   ├── calendar.tsx
│   ├── nutrition/daily.tsx
│   ├── foods/
│   │   ├── [foodId].tsx
│   │   └── categories/
│   │       ├── index.tsx
│   │       └── [categoryId].tsx
│   ├── food-log/
│   │   ├── new.tsx
│   │   ├── copy.tsx
│   │   └── [logId]/edit.tsx
│   ├── custom-food/
│   │   ├── new.tsx
│   │   └── [foodId]/edit.tsx
│   ├── recipes/                # POST-MVP; bukan route aktif MVP
│   │   ├── index.tsx
│   │   ├── new.tsx
│   │   ├── [recipeId]/index.tsx
│   │   └── [recipeId]/edit.tsx
│   ├── weight/
│   │   ├── new.tsx
│   │   └── [entryId]/edit.tsx
│   ├── progress/
│   │   └── weight.tsx
│   └── profile/
│       ├── account.tsx
│       ├── body.tsx
│       ├── goals/
│       │   ├── index.tsx
│       │   └── edit.tsx        # manual override POST-MVP
│       ├── preferences.tsx
│       ├── security.tsx
│       ├── privacy.tsx
│       ├── delete-account.tsx
│       └── help.tsx
```

**Jangan buat seluruh file di atas sekarang.** Ini adalah peta target; saat implementasi, buat hanya route yang dipakai milestone aktif. Route konseptual sebelumnya tidak semua harus menjadi file tersendiri.

> Expo Router route groups `(auth)`, `(onboarding)`, `(main)` tidak menjadi bagian path URL. Untuk navigasi antarrute yang ambigu, gunakan typed `href` atau path eksplisit. Jangan menempatkan layar yang sama pada beberapa route guard aktif.

## 6. Navigasi use case kritis

### F-01 Tambah makanan dari Home
1. Pengguna memilih tanggal jurnal `D`, lalu menekan `+` pada Sarapan.
2. Buka `/foods` dalam mode pemilihan dengan konteks `{date:D,mealType:BREAKFAST,returnTo:HOME}` menggunakan mekanisme terstruktur; bila tab Foods sudah ada, hindari stack berlapis yang tak sengaja.
3. Search/kategori -> `/foods/[foodId]` -> composer `/food-log/new`.
4. Pilih ukuran porsi dan jumlah, tampilkan nutrisi saat ini.
5. Simpan lokal atomik, sinkronisasi antrean, kembalikan pengguna ke Home pada tanggal `D`.
6. Jika save gagal, tetap di composer dengan input dipertahankan. Jika save berhasil lokal tetapi server pending, tampilkan badge sync pending.

### F-02 Tambah dari tab Makanan
Pengguna masuk tab Makanan tanpa konteks meal/date. Sebelum simpan, pilih tanggal dan kategori makan (default tanggal hari ini, kategori harus dipilih atau default yang transparan). Setelah simpan: [PROPOSED] kembali ke daftar makanan dengan feedback; jangan mengubah tanggal Home secara diam-diam.

### F-03 Edit dan hapus
Dari jurnal pilih item -> edit. Edit jumlah/porsi menghasilkan snapshot baru untuk entri terkait. Hapus meminta konfirmasi bila risiko kehilangan data. Offline mutation menggunakan idempotent op; back setelah sukses kembali ke tanggal asal.

### F-04 Copy meal
Pilih tanggal+meal sumber -> preview item -> pilih tujuan -> simpan item baru dengan IDs baru dan snapshot sumber; hindari copy ke hari asal secara tidak sengaja. Saat sebagian gagal, tampilkan hasil partial dan retry tanpa duplikat.

### F-05 Profil tidak eligible
MVP hanya dewasa 18+ dengan profil didukung. Jelaskan ketidaklayakan dan arahkan koreksi jawaban bila sesuai; jangan membuka Home LOG_ONLY atau memberi target default.

### F-06 Auto target recalculation
Catat berat -> tampilkan progres tersimpan -> evaluasi mesin nutrisi. Jika hasil layak aktifkan versi target baru menurut kebijakan tanggal berlaku; jika hasil tidak layak, status review dan simpan target terakhir yang valid sesuai peraturan yang masih perlu finalisasi. Jangan ubah nilai target histori diam-diam.

### F-07 Auth, deep link & return
Jika deep link menuju detail makanan ketika signed out, arahkan login; pasca login/onboarding hanya pulihkan tujuan apabila aman, akun punya hak akses dan parameter ID valid. Jika tidak, navigasikan ke default Home.

## 7. Aturan back navigation, modal, tab

- Android hardware back dan gesture back harus mengikuti stack; pada form dirty tampilkan dialog `Simpan draft / Buang perubahan / Tetap mengedit` [PROPOSED].
- Setelah login/register sukses, gunakan transisi reset/replace atau route guard agar tombol back tidak kembali ke login lama.
- Setelah onboarding selesai, jangan bisa kembali ke wizard lewat back; edit data melalui Profil.
- Saat berpindah tab, default pertahankan posisi/filters lokal hanya selama sesi relevan; jangan kehilangan edit form tanpa konfirmasi.
- Untuk date picker gunakan modal/sheet atau screen yang mudah ditutup; pilihan tanggal tetap masuk model jurnal global (bukan disisipkan sebagai string tanpa validasi).
- Pada form komposer yang berasal dari Home, tombol back harus mengembalikan pengguna ke konteks Home+tanggal awal.
- Jika route tidak ditemukan, tampilkan fallback aman dan arah kembali Home/Welcome sesuai sesi.
- Gunakan `replace` untuk transisi status, `push` untuk detail dan form (ketika perlu back); jangan memanggil `back()` tanpa fallback jika stack kosong.
- Aksesibilitas: label tab, screen reader announcement saat perubahan screen, fokus pada heading, area sentuh memadai, reduced motion.

## 8. Kontrak route params dan keamanan

| Parameter | Tipe konseptual | Validasi |
|---|---|---|
| `foodId` | opaque ID | format dan keberadaan, izin akses pada custom food |
| `logId` | opaque ID | kepemilikan, hari, akun dan status perubahan |
| `recipeId` — post-MVP | opaque ID | future private ownership checks, not an active MVP route |
| `categoryId` | string/ID | kategori published dan tidak dihapus |
| `date` | ISO local date `YYYY-MM-DD` | tanggal valid; jangan parsing implicit UTC |
| `mealType` | enum breakfast/lunch/dinner/snack | whitelist |
| `returnTo` | enum intent | jangan menerima arbitrary URL redirect |

Jangan menaruh token login, data tubuh, nutrisi pribadi, atau nilai target lengkap di route params/query. Ambil data dari feature store/local DB berdasarkan ID. Sanitize deep links dan tolak unsafe redirects. History navigasi bukan lokasi penyimpanan state kritis.

## 9. State matrix & empty/error transitions

| Peristiwa | UI | Navigasi |
|---|---|---|
| Sesi bootstrap belum selesai | Splash/system loading | Tidak masuk screen private |
| Login gagal | Error terlokalisasi | Tetap login |
| Email belum verified | Info opsional di Profil > Pengaturan > Data Diri | Fitur utama/onboarding/sync tersedia; reauth tindakan sensitif |
| Onboarding draft belum lengkap | Step yang belum valid | Next ditahan, back tetap mungkin |
| Profil tidak eligible | Penjelasan ketidaklayakan MVP | Tidak menyelesaikan onboarding atau membuka Home LOG_ONLY |
| Perhitungan review | Penjelasan review | Jangan tampilkan target otomatis baru |
| Search makanan kosong | Empty state, custom food CTA | Tetap di search |
| Food ID tidak ditemukan | Not found + kembali | Fallback Food list |
| Tidak ada jaringan | Offline indicator | Masih bisa log lokal sesuai cache |
| Save lokal gagal | Error + retry | Tetap di form, jangan hilangkan input |
| Save lokal sukses, sync pending | Pending icon | Kembali konteks sebelumnya |
| Edit lintas perangkat | Server-ordered LWW setelah pull | Antrean persisten; receipt per operasi; penolakan tombstone ENTITY_DELETED |
| Logout saat pending ops | Sinkron dahulu / batal / hapus dengan konfirmasi | Bersihkan data pribadi saat logout selesai; isolasi akun; pengujian OPEN |
| Delete account | Re-auth + konfirmasi | Clear user navigation/cache sesuai hasil backend |
| Berganti akun | Per-account state reset | Re-resolve route dari nol |
| Deep link tidak valid | Safe fallback | Home / Welcome |

## 10. Integrasi lintas spesifikasi

| Dokumen | Hubungan utama |
|---|---|
| [onboarding-spec.md](onboarding-spec.md) | urutan pertanyaan, eligibility, onboarding completion |
| [auth-spec.md](../03-features/auth-spec.md) | providers, session, email opsional, sensitive reauth, reset links |
| [nutrition-engine-spec.md](../02-architecture/nutrition-engine-spec.md) | target READY/NEEDS_REVIEW/UNSUPPORTED, target version |
| [food-database-spec.md](../02-architecture/food-database-spec.md) | public/private food IDs, source status, portion system |
| [food-logging-spec.md](../03-features/food-logging-spec.md) | food selection context, save/copy/edit/delete |
| [dashboard-spec.md](../03-features/dashboard-spec.md) | date selection, diary context, daily summary |
| [progress-spec.md](../03-features/progress-spec.md) | period filters, weight tracking, completeness |
| [profile-spec.md](../03-features/profile-spec.md) | editable body and goals, deletion, privacy |
| [sync-protocol-final-design.md](../02-architecture/sync-protocol-final-design.md) | ordered LWW, owner idempotency, tombstones, transactional cursor, pending/retry states |

## 11. Test matrix (navigation acceptance tests)

| ID | Scenario | Expected |
|---|---|---|
| NAV-01 | Fresh install, signed out | Welcome/auth, no Home flash |
| NAV-02 | Sign in, onboarding incomplete | Resume valid step |
| NAV-03 | Sign in, completed | Home |
| NAV-04 | Sign in, profil tidak eligible | Tidak ada completion/Home LOG_ONLY atau target numerik |
| NAV-05 | Unverified email | Onboarding/final save/Home/sync tersedia; reauth untuk tindakan sensitif |
| NAV-06 | Finish onboarding | Back does not reopen onboarding |
| NAV-07 | Auth state changes while viewing private screen | Protected route is removed |
| NAV-08 | Deep link to food detail while signed out | Auth then guarded destination/fallback |
| NAV-09 | Malformed food ID | Safe not found |
| NAV-10 | Food deleted between search and detail | Not found, preserved search context |
| NAV-11 | Add food to yesterday breakfast from Home | Returns yesterday, breakfast updated |
| NAV-12 | Add food from Foods tab | Meal/date explicitly resolved |
| NAV-13 | Composer back with unsaved changes | Confirm/save draft/discard behavior |
| NAV-14 | Offline save success | Back Home, pending sync shown |
| NAV-15 | Local save error | Composer retained, no fake success |
| NAV-16 | Copy meal multiple times by retry | No accidental duplicates |
| NAV-17 | Edit meal from selected date | Same day selection after return |
| NAV-18 | Cross-account switch | No previous user's state flashes |
| NAV-19 | Password reset deep link | Return safe route after success |
| NAV-20 | Offline reopen app | Only allowed cached data displayed |
| NAV-21 | Calendar invalid date | Error/fallback without crash |
| NAV-22 | Route opened without navigation history | Back fallback valid |
| NAV-23 | AI tab placeholder | Clearly non-functional; no fake actions |
| NAV-24 | Nested routes on Android hardware back | Predictable stack behavior |
| NAV-25 | iOS swipe back with dirty form | Same unsaved-change policy |
| NAV-26 | Screen-reader navigation | Tab labels, headings, focus all usable |
| NAV-27 | Analytics/notification deep link with expired session | No leaked private content |
| NAV-28 | App restore after OS kills process | Correct session/onboarding route |
| NAV-29 | Rapid double-tap add food | No duplicate navigation/actions |
| NAV-30 | Delete account with offline pending queue | Follows data-deletion policy, no resync |

## 12. Implementation milestones (not to build now)

1. **Foundation**: root layouts, session resolver, protected route policy, type-safe paths.
2. **Auth/onboarding**: screen routes with minimal placeholders; guards; resume state.
3. **Tabs & Home**: Home, Foods, Progress, Profile, AI placeholder decision.
4. **Food log slice**: Food search -> detail -> composer -> return to date+meal.
5. **Profile and weight**: account and goal settings, weight entry -> Progress.
6. **Deep link & offline**: return-after-login, sync indicators, failure states.
7. **Accessibility & QA**: Android/iOS back behavior, automation tests.

Success metric: a logged-in eligible user can navigate from Home to add a food to a past-day meal, return to the same date, and see the updated diary without duplicate entries, including offline.

## 13. Decision register / sign-off

| ID | Open decision | Default recommendation | Required approval |
|---|---|---|---|
| NAV-D01 | Show AI tab while unavailable? | Placeholder Coming Soon | Product/UI |
| NAV-D02 | D01 RESOLVED: email optional; fitur utama tersedia | Status/aksi di Data Diri; reauth sensitif Firebase | SDK/security tests OPEN |
| NAV-D03 | Food composer as full screen or bottom sheet? | Full screen for reliable complex portions | UX |
| NAV-D04 | Date picker as modal vs screen? | Modal/sheet with calendar | UX |
| NAV-D05 | Dedicated screens for Progress subsections? | One main view + weight detail | UX |
| NAV-D06 | Save behavior after adding from Foods tab? | Feedback and stay Foods | UX |
| NAV-D07 | Unsaved form exit policy? | Confirm + preserve draft when practical | UX |
| NAV-D08 | AI route deep link while feature disabled? | Fallback placeholder, no AI endpoints | Product/security |
| NAV-D09 | Profile changes and automatic target effective time? | Use versioned targets; policy in nutrition engine | Medical/product |
| NAV-D10 | Deep link after login when onboarding incomplete | Finish onboarding, then validate destination | Security/product |
| NAV-D11 | Cached offline private content after token expires | Governed by security policy | Security |
| NAV-D12 | Sync tidak diblokir email unverified; account linking masih OPEN | Token valid/ownership; kebijakan linking sesuai provider | Security/legal |
| NAV-D13 | Onboarding personal-data legal notice & consent | Align with privacy assessment | Legal |
| NAV-D14 | Logout/delete workflow | D08 design: clear private local data after safe pending-outbox choice; retry coordinated Firebase/PostgreSQL/local deletion | Security/device tests OPEN |
| NAV-D15 | Expo Router installed SDK and API compatibility | Check SDK; do not assume SDK 58 features | Engineering |

**Rules pending medical/legal/security review must not be silently enabled simply because screens are designed.**

## 14. Definition of Done — perencanaan

- [ ] Daftar rute MVP disetujui Product + Developer.
- [ ] Perbedaan route canonical, tab, stack, modal disepakati.
- [ ] Access policy `SIGNED_OUT/IN_PROGRESS/COMPLETED/INELIGIBLE` diuji; tidak ada LOG_ONLY aktif.
- [ ] D01 email opsional dan reautentikasi tindakan sensitif diuji.
- [ ] Semua parameter ID/date/meal punya validasi.
- [ ] Navigasi Food Logging mempertahankan konteks tanggal dan meal.
- [ ] Alur back, deep link, offline, dan account switch diuji di rancangan.
- [ ] UI designer menyetujui wireframe navigasi.
- [ ] Legal/security review diselesaikan untuk alur data dan deep link sensitif.
- [ ] Rute tambahan yang tidak dipakai dieliminasi dari implementasi MVP.

## 15. Rujukan implementasi resmi

- Expo Router: Protected Routes — https://docs.expo.dev/router/advanced/protected/
- Expo Router: Authentication — https://docs.expo.dev/router/advanced/authentication/
- Expo Router: Common Navigation Patterns — https://docs.expo.dev/router/basics/common-navigation-patterns/
- Expo Router: Navigation — https://docs.expo.dev/router/basics/navigation/

**Catatan versi:** Properti seperti `redirectTo` pada protected routes bergantung pada Expo SDK; validasi dokumentasi terhadap SDK aktual sebelum menyalin implementasi.
