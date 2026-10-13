# NUTRASA — Decision Register

> `APPROVED` = explicitly chosen by product owner; `PROPOSED` = recommendation only; `BLOCKED` = needs named reviewer, not approved. 2026-10-13.

## Approved decisions
| ID | Decision | Source / implication |
|---|---|---|
| D-001 | Expo + React Native + TypeScript | Mobile stack |
| D-002 | Firebase Auth existing project | Identity |
| D-003 | Fastify API local + PostgreSQL local | Rp0 infrastructure in development |
| D-004 | SQLite offline-tolerant client | Offline logging with later sync |
| D-005 | Indonesia-first catalog 100 curated → 500 | Food quality over quantity |
| D-006 | 11 nutrient fields; unknown can remain unknown | Partial coverage preserved |
| D-007 | Login before personalization onboarding | Routing |
| D-008 | One activity question, optional body type after body inputs | Onboarding |
| D-009 | Goal weight mandatory for cutting/bulking | Onboarding |
| D-010 | Name/username optional after registration | Profile |
| D-011 | Local draft then server save upon completion | Onboarding data |
| D-012 | Email verification optional; main features, final onboarding, Home and sync available | D01 supersedes historical restrictions; sensitive Firebase reauth retained |
| D-013 | Targets auto-activate only when eligible/safe | Clinical gate remains |
| D-014 | Profile-dependent energy preset, adaptive 25–30% initial fat | Candidate values subject to nutrition review |
| D-015 | Latest valid weight triggers automatic recalculation with preserved history | D03; backdated measurements do not arbitrarily replace current source; manual post-MVP |
| D-016 | Protein weight/goal-based, carbohydrate remaining energy | Coefficients open |
| D-017 | Historical LOG_ONLY proposal superseded by D04 | MVP only eligible adults 18+; no active LOG_ONLY or numeric target for ineligible profiles |
| D-018 | MVP: food favorites, recents, simple custom food, copying food logs; user recipes post-MVP | O-18 RESOLVED by owner M00-03A; models/endpoints are not implementation evidence |
| D-019 | Nutrition/weight/consistency progress | P0 scope |
| D-020 | UI style provisionally approved (six groups), compact | May iterate |
| D-021 | Food logging retains historical nutrient snapshots; weight/target changes preserve history | Explicit owner constraints in documentation merge task; technical versioning/effective-date details remain open |

## Decision follow-up — resolved scope and remaining OPEN gates
| ID | Open decision | Recommendation for discussion | Gate | Owner |
|---|---|---|---|---|
| O-01 | RESOLVED D01: email optional for final save/Home/sync | Sensitive Firebase reauthentication implementation/testing OPEN | Before auth implementation | Security |
| O-02 | Cut/bulk profile presets and boundaries | Parameter tables with peer/clinical review | P0 release | Nutrition reviewer |
| O-03 | Protein coefficients, reference weight, activity mapping | Review representative and extreme profiles | P0 release | Nutrition reviewer |
| O-04 | OPEN: contraindications, eligibility screening and numeric guardrails | No unreviewed automatic targets; manual override post-MVP | P0 release | Nutrition + legal |
| O-05 | RESOLVED D02/D03: automatic-only MVP, forward-effective historical versions | Date/time fixtures and exceptional invalid-target handling OPEN; manual post-MVP | Before goal implementation | Engineering/nutrition |
| O-06 | RESOLVED D07: server-ordered LWW, per-owner receipts, tombstone ENTITY_DELETED, per-user transactional cursor | Payload DTO, concurrency tests and retention remain OPEN; HTTP 410 CURSOR_EXPIRED | Before sync implementation/release | Backend/security |
| O-07 | D08 privacy/encryption/logout design set; implementation OPEN | SQLCipher device/key tests, pending sync/cancel/confirmed discard, account isolation, coordinated deletion | Before storing real sensitive data | Security |
| O-08 | Firebase email/Google/Apple provider details in Expo | Technical proof in development build | P0 | Mobile engineer |
| O-09 | TKPI/Panganku/FatSecret license, terms, provenance | Document permission per source | P0 release | Legal/data steward |
| O-10 | OPEN: recipe yield and source nutritional qualification | Catalog derivation still needs review; user recipe builder post-MVP under O-18 | Before relevant catalog/recipe calculation | Data/nutrition |
| O-11 | D10 optional completion and O-18 food-log copying scope RESOLVED | OPEN: edit/delete completion-marker behavior and offline copy/recovery tests | Before relevant implementation | Product/engineering |
| O-12 | RESOLVED scope: eligible adults 18+ only, no LOG_ONLY; legal/privacy obligations OPEN | Consent, retention, export, deletion and age-screening legal review | P0 release | Legal/privacy |
| O-13 | DDL migration tool, numeric precision, ID generation | Engineering review | P0 | Tech lead |
| O-14 | API conventions, paging, quotas, error mapping and OpenAPI sign-off | Verify schema and contract parity | P0 | Tech lead |
| O-15 | Staging/public-beta HTTPS, hosting, backup and incident response | Deployment checklist | Beta gate | Ops/security |
| O-16 | Final navbar AI placeholder, camera, visual details | Do not expose unimplemented feature as available | P1 | Product/design |
| O-17 | Multiple weight readings/day; historical chart grouping | One documented rule | P1 | Product |
| O-18 | RESOLVED: food favorites, recents, simple custom food, copying food logs MVP; user recipes post-MVP | Explicit owner decision M00-03A supersedes historical draft priorities | Scope settled; implementation/release gates remain | Product owner |

## O-18 — Prioritas rilis resep dan favorit

- **Status:** RESOLVED — keputusan eksplisit owner pada task M00-03A.
- **Riwayat perbedaan (bukan aturan aktif):** roadmap sumber menempatkan resep/favorit setelah MVP; paket scope/D-018 lama mengklaim P0; endpoint Recipes/Favorites API draft memakai P1.
- **Arahan historis saat merge, 13 Oktober 2026:** jangan memilih P0 sepihak; catat sebagai OPEN. Arahan tersebut dipenuhi pada M00-02 dan pilihan rilis kini ditetapkan owner dalam M00-03A.
- **Keputusan final:** favorit makanan MVP; recent foods MVP; custom food sederhana MVP; salin catatan makanan MVP; resep buatan pengguna POST-MVP. Tidak ada recipe builder aktif MVP; scope saved meals terpisah tidak diubah.
- **Dokumen terdampak:** master-roadmap, feature-list, product-brief, food-logging-spec, food-database-spec, database-schema, api-contract, development-task-board, dan audit.
- **Batas:** model/endpoint resep dipertahankan sebagai desain post-MVP, bukan fitur aktif MVP. Keputusan scope bukan bukti implementasi atau penutupan review klinis/legal/keamanan.
- **Approver / sumber:** pemilik proyek, instruksi eksplisit task NUTRASA M00-03A. Dokumen di luar allowlist task ini belum diselaraskan.

## Catatan keputusan merge, 13 Oktober 2026

**Catatan historis FASE 2:** owner menyetujui merge dokumentasi, path pengarah, stack/aset dan koreksi status implementasi; saat itu O-01–O-18 belum ditutup dan coding/commit/deployment tidak diizinkan. M00-03A kini mengizinkan penyelarasan pada allowlist dan menetapkan keputusan final di atas, tetap tanpa coding atau commit.

## Change template
`ID | date | proposed rule | options | chosen rule | approver | dependencies impacted | required tests | status`.

**Never convert an open decision to approved solely because a draft describes one option.**
