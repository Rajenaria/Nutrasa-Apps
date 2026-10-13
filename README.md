# NUTRASA

Fondasi aplikasi nutrition tracking yang akan dikembangkan secara bertahap. Tahap ini hanya menyediakan struktur proyek dan satu route placeholder; belum ada implementasi fitur.

## Tech stack

React Native, Expo SDK 57, TypeScript, dan Expo Router.

## Struktur

```text
.
|-- src/
|   |-- app/                 # Expo Router: _layout.tsx dan index.tsx
|   |-- features/
|   |   |-- auth/
|   |   |-- onboarding/
|   |   |-- dashboard/
|   |   |-- food-catalog/
|   |   |-- food-log/
|   |   |-- nutrition-goals/
|   |   |-- progress/
|   |   `-- profile/
|   |-- components/
|   |   |-- ui/
|   |   `-- layout/
|   |-- hooks/
|   |-- lib/
|   |-- services/
|   |-- constants/
|   |-- styles/
|   |-- types/
|   `-- utils/
|-- assets/
|   |-- images/
|   |-- icons/
|   |-- fonts/
|   |-- mascot/
|   `-- expo.icon/           # Ikon iOS bawaan template
|-- docs/
|   |-- 00-overview/
|   |-- 01-design/
|   |-- 02-architecture/
|   |-- 03-features/
|   `-- 04-development/
|-- tests/
|-- AGENTS.md
|-- .env.example
|-- .gitignore
|-- app.json
|-- eslint.config.js
|-- package.json
|-- package-lock.json
`-- tsconfig.json
```

Routing berada di `src/app/`, mengikuti template resmi Expo Router. Folder yang belum digunakan disimpan dengan `.gitkeep`. Aset ikon dan splash masih bawaan template, bukan identitas visual final NUTRASA.

## Instalasi

Gunakan Node.js LTS yang didukung SDK 57 (minimum 22.13.x) dan npm.

```sh
npm ci
```

Belum ada environment variable yang wajib diisi. `.env.example` disediakan untuk kebutuhan berikutnya; jangan memasukkan secret ke source control. Variabel `EXPO_PUBLIC_*` dapat dibaca dari aplikasi dan tidak boleh berisi secret.

## Development

```sh
npm start              # Metro / Expo dev server
npm run android        # Buka pada perangkat atau emulator Android
npm run ios            # Simulator iOS membutuhkan macOS
npm run web            # Buka versi web
npm run typecheck      # TypeScript
npm run lint           # ESLint
npx expo-doctor        # Konfigurasi dan kompatibilitas dependency
```

Android memerlukan perangkat atau emulator yang sudah disiapkan. Gunakan Expo Go yang kompatibel dengan SDK proyek atau development build sesuai kebutuhan.

## Pemeriksaan mobile dan backend

Perintah `npm run typecheck` dan `npm run lint` di root tetap digunakan untuk
fondasi Expo. TypeScript root memeriksa source mobile dan mengecualikan
`backend/`; backend memiliki tsconfig sendiri. Konfigurasi ESLint root dipakai
bersama dan lint root juga dapat memeriksa source backend.

Belum ada script test mobile: source saat ini hanya route/layout placeholder.
Tambahkan tes ketika ada perilaku aplikasi nyata yang perlu diuji, bukan tes
placeholder atau runner tambahan pada tahap fondasi.

Backend membutuhkan Node.js 24.12+ pada jalur 24.x. Setelah dependency root dan
backend terpasang, jalankan dari `backend/`:

```sh
npm run typecheck
npm run lint
npm test
```

Typecheck dan Node test runner backend memakai dependency backend. Lint backend
memakai instalasi ESLint root dan konfigurasi yang sama tanpa memasang linter
kedua. Detail startup dan health tersedia di [backend/README.md](backend/README.md).

## Prinsip arsitektur

- `src/app/` hanya untuk routes dan layouts. Letakkan implementasi fitur di `src/features/<nama-fitur>/`.
- Buat subfolder lokal fitur seperti `components`, `hooks`, atau `types` saat dibutuhkan.
- `src/components/` dan `src/hooks/` untuk kode yang digunakan bersama lintas fitur.
- `src/lib/` untuk konfigurasi library; `src/services/` untuk integrasi global yang tidak dimiliki satu fitur.
- `src/constants/`, `src/styles/`, `src/types/`, dan `src/utils/` untuk kebutuhan global; utility harus berupa fungsi murni.
- `docs/` disiapkan untuk dokumentasi; `tests/` untuk integration atau end-to-end tests jika diperlukan.
- Pertahankan implementasi sederhana. Tambahkan dependency dan abstraksi hanya jika ada kebutuhan nyata.
- Alias `@/*` menunjuk ke `src/*`; `@/assets/*` menunjuk ke `assets/*`.

Referensi: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) dan [struktur src Expo Router](https://docs.expo.dev/router/reference/src-directory/).
