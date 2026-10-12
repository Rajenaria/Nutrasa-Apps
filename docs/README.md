# NUTRASA — Documentation Index

Dokumentasi utama berada di folder ini. Paket ekstraksi `_incoming-documentation-review/` tetap disimpan untuk pemeriksaan sumber, tetapi bukan bagian dari hierarki dokumentasi final dan bukan acuan canonical.

## Source of truth and reading order

1. [Product brief](00-overview/product-brief.md) — tujuan dan audiens.
2. [Feature list](00-overview/feature-list.md) — cakupan draft; prioritas resep/favorit masih OPEN.
3. [Architecture decisions](02-architecture/architecture-decisions.md) — stack terpilih dan istilah canonical.
4. [Documentation audit](04-development/documentation-audit.md) — temuan, provenance, dan penyelarasan.
5. [Decision register](04-development/decision-register.md) — keputusan disetujui versus O-01–O-18 yang masih terbuka.
6. [Database schema](02-architecture/database-schema.md) dan [API contract](02-architecture/api-contract.md) — draft data/REST, belum migration/OpenAPI sign-off.
7. Spesifikasi fitur dan [UI approval summary](01-design/ui-approval-summary.md) — perilaku serta baseline visual provisional.
8. [Development task board](04-development/development-task-board.md) dan [Review sign-off checklist](04-development/review-signoff-checklist.md) — rencana dependensi dan review gates.

## Daftar dokumen utama

### 00 — Overview

- [Product brief](00-overview/product-brief.md)
- [Feature list](00-overview/feature-list.md)
- [Business rules](00-overview/business-rules.md)
- [Master development roadmap](00-overview/master-roadmap.md)

### 01 — Design

- [UI approval summary](01-design/ui-approval-summary.md) — Home tiga lingkaran terpisah; Progress tiga busur setengah lingkaran bertingkat.
- [Design system](01-design/design-system.md)
- [Design system draft](01-design/design-system-draft.md) — proposal lama, tidak mengalahkan approval.
- [Home UI direction](01-design/home-ui-direction.md)
- [Food UI direction](01-design/food-ui-direction.md)
- [Navigation specification](01-design/navigation-spec.md)
- [Onboarding specification](01-design/onboarding-spec.md)
- [Asset placement guide](01-design/asset-placement-guide.md)
- [Visual reference guidelines](01-design/visual-reference-guidelines.md)

Mockup approval: [approved-mockups/](01-design/approved-mockups/). Referensi eksploratif: [references/](01-design/references/). Aset branding resmi: [assets/branding/](../assets/branding/). Master aset tidak diubah oleh merge ini.

### 02 — Architecture

- [Architecture decisions](02-architecture/architecture-decisions.md)
- [System architecture](02-architecture/system-architecture.md) — analisis historis dengan keputusan stack lokal terbaru.
- [Zero-cost development architecture](02-architecture/zero-cost-architecture.md)
- [Database schema](02-architecture/database-schema.md)
- [API contract](02-architecture/api-contract.md)
- [Food database specification](02-architecture/food-database-spec.md)
- [Nutrition Engine specification](02-architecture/nutrition-engine-spec.md)
- [Offline sync specification](02-architecture/offline-sync-spec.md)

### 03 — Features

- [Authentication](03-features/auth-spec.md)
- [Dashboard](03-features/dashboard-spec.md)
- [Food logging](03-features/food-logging-spec.md)
- [Progress](03-features/progress-spec.md)
- [Profile and settings](03-features/profile-spec.md)

### 04 — Development

- [Documentation audit](04-development/documentation-audit.md)
- [Decision register](04-development/decision-register.md)
- [Development task board](04-development/development-task-board.md)
- [Review sign-off checklist](04-development/review-signoff-checklist.md)

## Path lama yang dipertahankan

- [MasterDevelopment-Roadmap.md](00-overview/MasterDevelopment-Roadmap.md) → [master-roadmap.md](00-overview/master-roadmap.md).
- [Apps-Engine-spec.md](02-architecture/Apps-Engine-spec.md) → [nutrition-engine-spec.md](02-architecture/nutrition-engine-spec.md).
- [03-features/offline-sync-spec.md](03-features/offline-sync-spec.md) → [02-architecture/offline-sync-spec.md](02-architecture/offline-sync-spec.md).

File pengarah tidak menyimpan salinan spesifikasi; pembaruan dilakukan pada path utama.

## Status legend

- **APPROVED**: explicit product-owner decision.
- **PROVISIONAL APPROVAL / DESIGN**: UI baseline subject to refinement; bukan screen yang sudah berfungsi.
- **PROPOSED**: candidate, not consent or sign-off.
- **BLOCKED / REVIEW REQUIRED**: clinical, legal, security or technical prerequisite.
- **PLANNED**: task/document exists but no implementation.
- **IMPLEMENTED**: ada bukti kode dan validasi yang sesuai; saat ini fondasi mobile dan route placeholder, bukan fitur bisnis.
- **OPEN**: belum ada keputusan final, termasuk prioritas rilis resep/favorit O-18.

## Agent rules

Never infer approval from the latest file version number. Do not write production nutrition constants based on placeholder examples. Reconcile data contracts before code generation. Confirm sensitive-user access, source permissions, and sync failures explicitly. Respect project [AGENTS.md](../AGENTS.md).
