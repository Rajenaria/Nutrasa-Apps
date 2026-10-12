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
