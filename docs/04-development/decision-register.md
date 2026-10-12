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
| D-012 | Email-unverified can complete questionnaire with restricted operations | Exact restrictions still open |
| D-013 | Targets auto-activate only when eligible/safe | Clinical gate remains |
| D-014 | Profile-dependent energy preset, adaptive 25–30% initial fat | Candidate values subject to nutrition review |
| D-015 | Automatic recalculation on weight changes | Manual precedence open |
| D-016 | Protein weight/goal-based, carbohydrate remaining energy | Coefficients open |
| D-017 | Log-only for unsupported calculator profiles | Legal eligibility distinct |
| D-018 | Custom food, recipes, recent, favorite, copy meal are documented capabilities | Recipe/favorite release priority NOT APPROVED; see O-18. Presence in a feature spec is not P0 approval |
| D-019 | Nutrition/weight/consistency progress | P0 scope |
| D-020 | UI style provisionally approved (six groups), compact | May iterate |
| D-021 | Food logging retains historical nutrient snapshots; weight/target changes preserve history | Explicit owner constraints in documentation merge task; technical versioning/effective-date details remain open |

## Open decisions — required owners
| ID | Open decision | Recommendation for discussion | Gate | Owner |
|---|---|---|---|---|
| O-01 | Unverified email: final save, dashboard, sync | Specify operation-level policy before auth API | P0 | Product + security |
| O-02 | Cut/bulk profile presets and boundaries | Parameter tables with peer/clinical review | P0 release | Nutrition reviewer |
| O-03 | Protein coefficients, reference weight, activity mapping | Review representative and extreme profiles | P0 release | Nutrition reviewer |
| O-04 | Contraindications, screening, target minimums/manual override | Do not auto-activate unapproved results | P0 release | Nutrition + legal |
| O-05 | Manual-vs-auto goals and effective time zone/date | Deterministic goal version policy | P0 | Product |
| O-06 | Cross-device conflict, delete semantics, cursor expiry | Version checks + recoverable conflicts | P0 | Backend/security |
| O-07 | Secure local health data, encryption and account switch | Threat model, leakage tests | P0 | Security |
| O-08 | Firebase email/Google/Apple provider details in Expo | Technical proof in development build | P0 | Mobile engineer |
| O-09 | TKPI/Panganku/FatSecret license, terms, provenance | Document permission per source | P0 release | Legal/data steward |
| O-10 | Recipe yield and source nutritional qualification | Curated rules/test cases | Before recipe implementation; release priority O-18 | Data/nutrition |
| O-11 | Scope and UX of partial-day completion and copy meal offline | Define before feature | P0 | Product |
| O-12 | Underage signup and log-only eligibility; consent/privacy/retention/export/deletion | Specific legal review | P0 release | Legal/privacy |
| O-13 | DDL migration tool, numeric precision, ID generation | Engineering review | P0 | Tech lead |
| O-14 | API conventions, paging, quotas, error mapping and OpenAPI sign-off | Verify schema and contract parity | P0 | Tech lead |
| O-15 | Staging/public-beta HTTPS, hosting, backup and incident response | Deployment checklist | Beta gate | Ops/security |
| O-16 | Final navbar AI placeholder, camera, visual details | Do not expose unimplemented feature as available | P1 | Product/design |
| O-17 | Multiple weight readings/day; historical chart grouping | One documented rule | P1 | Product |
| O-18 | Recipe and favorite release priority: MVP or later? | Compare roadmap (post-MVP), review feature-list (P0), and API draft (P1); owner chooses explicitly | Before recipe/favorite scheduling | Product owner |

## O-18 — Prioritas rilis resep dan favorit

- **Status:** OPEN, belum ada pilihan rilis yang disetujui.
- **Bukti perbedaan:** roadmap sumber menempatkan resep/favorit setelah MVP; feature-list dan D-018 dari paket mengklaim P0; endpoint Recipes/Favorites dalam API draft memakai P1.
- **Arahan owner, 13 Oktober 2026:** merge boleh dilakukan, tetapi jangan menetapkan resep/favorit sebagai P0 secara sepihak. Catat perbedaannya sebagai keputusan terbuka.
- **Pilihan untuk review:** keduanya di MVP; keduanya setelah MVP; atau prioritas berbeda untuk resep dan favorit. Tidak ada pilihan otomatis yang diterapkan.
- **Dokumen terdampak:** master-roadmap, feature-list, product-brief, food-logging-spec, food-database-spec, database-schema, api-contract, development-task-board, dan audit.
- **Batas:** spesifikasi perilaku/data tetap disimpan untuk review. Kehadiran model, endpoint, atau desain bukan bukti implementasi maupun persetujuan prioritas rilis.
- **Keputusan akhir / approver:** belum ditetapkan.

## Catatan keputusan merge, 13 Oktober 2026

Owner menyetujui FASE 2 untuk dokumentasi saja: path canonical dengan pengarah relatif, penyelarasan field nutrisi, stack lokal terpilih, perlindungan approval/aset, dan koreksi status implementasi roadmap. Persetujuan ini tidak menutup O-01–O-18 dan tidak mengizinkan coding, commit, atau deployment.

## Change template
`ID | date | proposed rule | options | chosen rule | approver | dependencies impacted | required tests | status`.

**Never convert an open decision to approved solely because a draft describes one option.**
