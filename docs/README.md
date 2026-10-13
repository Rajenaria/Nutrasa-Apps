# NUTRASA — Documentation Index

Dokumentasi utama berada di folder ini. `_incoming-documentation-review/` adalah label paket sumber historis, bukan acuan kanonis; folder tersebut tidak ditemukan pada inspeksi M00-03B dan tidak dibuat atau dihapus oleh task ini.

## Source of truth and reading order

1. [AGENTS.md root](../AGENTS.md) — aturan agen dan konvensi repository, termasuk `src/app/` dan `src/features/`.
2. [Decision register v2](04-development/decision-register-v2.md) — keputusan 01–10 dan O-18 RESOLVED; [register lama](04-development/decision-register.md) menyimpan sejarah serta rincian isu tersisa.
3. [Product brief](00-overview/product-brief.md), [feature list](00-overview/feature-list.md), dan [architecture decisions](02-architecture/architecture-decisions.md) — cakupan MVP dan stack terpilih.
4. [Database schema](02-architecture/database-schema.md) dan [API contract](02-architecture/api-contract.md) — kontrak terselaraskan M00-03A; belum sign-off DDL/OpenAPI.
5. [Decision 03](02-architecture/decision-03-weight-history-final.md), [Decision 07](02-architecture/decision-07-offline-sync-final.md), [Decision 08](02-architecture/decision-08-security-privacy-final.md), [sync protocol v1.6](02-architecture/sync-protocol-final-design.md), dan [database decisions v1.6](02-architecture/database-implementation-decisions-v1.6.md) — desain aktif.
6. Spesifikasi fitur dan [UI approval summary](01-design/ui-approval-summary.md) — perilaku serta approval visual yang tetap dipertahankan.
7. [Implementation pack](04-development/codex-implementation-pack.md), [task board M00–M10](04-development/codex-task-board-v1.md), [compatibility review](04-development/agents-compatibility-review.md), dan [readiness review](04-development/engineering-readiness-review-v1.6.md) — rencana implementasi dan hambatan OPEN.
8. [Development task board](04-development/development-task-board.md) dan [review checklist](04-development/review-signoff-checklist.md) — pemetaan slice dan gates; [documentation audit](04-development/documentation-audit.md) adalah sejarah FASE 2, bukan status keputusan terkini.

## Daftar dokumen utama

### 00 — Overview

- [Product brief](00-overview/product-brief.md)
- [Feature list](00-overview/feature-list.md)
- [Business rules](00-overview/business-rules.md)
- [Master development roadmap](00-overview/master-roadmap.md) — roadmap sekunder; klausul lama yang bertentangan mengikuti register v2 dan task board M00–M10.

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
- [Sync protocol v1.6](02-architecture/sync-protocol-final-design.md)
- [Database implementation decisions v1.6](02-architecture/database-implementation-decisions-v1.6.md)
- [Decision 03](02-architecture/decision-03-weight-history-final.md), [Decision 07](02-architecture/decision-07-offline-sync-final.md), [Decision 08](02-architecture/decision-08-security-privacy-final.md)
- [OpenAPI](02-architecture/openapi.yaml) — draft tersedia; validasi semantik dan kontrak belum selesai.
- Review schema/API, physical v1.5 dan migration plan adalah bahan review; keputusan v1.6 mengatasi klausul lama yang bertentangan, bukan bukti migrasi teruji.

### 03 — Features

- [Authentication](03-features/auth-spec.md)
- [Dashboard](03-features/dashboard-spec.md)
- [Food logging](03-features/food-logging-spec.md)
- [Progress](03-features/progress-spec.md)
- [Profile and settings](03-features/profile-spec.md)

### 04 — Development

- [Documentation audit](04-development/documentation-audit.md) — historis FASE 2.
- [Decision register v2](04-development/decision-register-v2.md) — aktif; [register lama](04-development/decision-register.md) — sejarah dan isu rinci.
- [Implementation pack](04-development/codex-implementation-pack.md), [task board M00–M10](04-development/codex-task-board-v1.md), [first audit prompt](04-development/codex-first-prompt.md)
- [Agents compatibility review](04-development/agents-compatibility-review.md), [engineering readiness v1.6](04-development/engineering-readiness-review-v1.6.md)
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
- **OPEN**: keputusan rinci atau pengujian belum selesai; lihat B01–B11 register v2.
- **RESOLVED**: keputusan telah ditetapkan; O-18 selesai, bukan bukti fitur sudah diimplementasikan.

## Agent rules

Never infer approval from the latest file version number. Do not write production nutrition constants based on placeholder examples. Reconcile data contracts before code generation. Confirm sensitive-user access, source permissions, and sync failures explicitly. Respect project [AGENTS.md](../AGENTS.md).
