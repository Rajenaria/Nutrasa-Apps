# NUTRASA — Task Board untuk Codex v1.0

**Cara pakai:** satu task pada satu waktu; ikuti AGENTS.md root dan struktur src/app/ + src/features/. M00-01, M00-02 dan M00-03A telah dilaporkan selesai pada sesi sebelumnya. M00-03B selesai dalam allowlist: link relatif, preservasi SHA-256, git diff --check, typecheck dan lint lulus; klausul roadmap di luar allowlist dilaporkan untuk task berikutnya. M01–M10 tetap BELUM DIKERJAKAN; tidak ada bukti fitur bisnis sudah diimplementasikan.

| ID | Task | Input yang wajib dibaca | Bukti selesai | Dependensi |
|---|---|---|---|---|
| M00-01 | Audit root, scripts, Expo SDK, dependencies, existing AGENTS, src/app vs app | `AGENTS.md`, `package.json`, struktur repo, docs README | Laporan inventaris dan gap, tanpa edit | — |
| M00-02 | Audit konflik dokumen aktif: v1.2/1.6 vs lampiran lama | Decision register, schema, API, openapi, sync spec | Tabel konflik, usulan pemutakhiran tanpa overwrite | M00-01 |
| M00-03A | Penyelarasan dokumentasi kanonis | Decisions 01–10/O-18, schema/API, sync v1.6 | Laporan M00-03A sebelumnya; kontrak kanonis dipertahankan | M00-02 |
| M00-03B | Penyelarasan sekunder dan indeks | Allowlist 13 dokumen, hasil M00-03A, AGENTS root | Laporan diff, link relatif, scope dan Git aktual; berhenti sebelum M01 | M00-03A |
| M01-01 | Pilih tempat backend dan testing berdasarkan repo | Struktur existing dan AGENTS | Rancangan minimal file tree, disetujui sebelum buat | M00 |
| M01-02 | Tetapkan checks yang benar-benar tersedia | package scripts, tooling existing | typecheck/lint/test baseline nyata | M00 |
| M02-01 | Buat Fastify health-only skeleton | API/architecture, versi Node tersedia | Startup lokal dan health test | M01 |
| M02-02 | Firebase token verify middleware dan ownership boundary | auth spec, security decisions | valid/invalid/missing auth tests | M02-01 |
| M03-01 | Migration awal users, catalog source and traceability | Schema/API terselaraskan M00-03A; physical v1.5 dibaca bersama database decisions v1.6 | up/down tested in isolated local PG | M02 |
| M03-02 | Migration logs/snapshots/goals/weights/completion, simple custom foods and food favorites MVP | Decisions 03/06/09/10/O-18, schema/API | FK/check/index and owner isolation tests; user recipes excluded from MVP | M03-01 |
| M03-03 | Migration sync head, feed, receipts, tombstones | sync final v1.6 | concurrent cursor tests | M03-02 |
| M04-01 | Auth UI & Firebase integration (email optional) | Auth, onboarding, profile spec | auth + unverified user happy paths | M02-02 |
| M05-01 | Onboarding supported adult/profile/draft | Onboarding + decisions | valid and invalid flows, no false target | M04-01 |
| M06-01 | Catalog browse/search/serving, dummy & licensed data only | Food DB spec, license rules | search/filter/null nutrient tests | M03-01 |
| M07-01 | Diary add/edit/delete/copy + snapshots, recent foods, food favorites and simple custom foods MVP | Logging, Decisions 09/O-18, schema/API | Independent copied IDs/snapshots, portion edits, recent/favorite/custom ownership tests | M03-02,M06-01 |
| M08-01 | Local SQLCipher storage & account boundary | Decision 08, installed Expo capabilities | development build encryption/logout tests | M04,M07 |
| M08-02 | Persistent ordered outbox; server-ordered push/pull LWW | Decision 07, sync v1.6; typed payload/hashing closure | Owner-idempotent immutable retry, device order, transactional owner cursor, tombstone and HTTP 410 CURSOR_EXPIRED resync tests | M03-03,M08-01 |
| M09-01 | Dashboard rings, accurate calorie/macros, offline states | UI approval, dashboard spec | screenshot + partial/missing tests | M07,M08 |
| M09-02 | Progress chart + historical goals/completion | Progress spec, Decision 03/10 | day/time/target and no-log tests | M09-01 |
| M10-01 | End-to-end hardening and production blockers | Engineering readiness review | verified security/privacy/nutrition/license checklist | All relevant |

Scope O-18 RESOLVED: favorit makanan, recent foods, custom food sederhana dan copy food log adalah MVP; resep pengguna post-MVP. Target AUTO saja untuk eligible 18+, tanpa MANUAL/LOG_ONLY; saved meals mempertahankan scope terpisah. Milestone M00–M10 tidak diurut ulang; payload sync, Firebase SDK Expo 57, SQLCipher dan validasi semantik OpenAPI tetap OPEN.

### Operating rules

- Each task starts with a *read-only impact inspection* and ends with tests and diff review.
- Work should not combine an API redesign, screen redesign and schema rewrite into one task.
- If an assumption is unverifiable, stop and explain instead of guessing.
- Tasks involving unverified nutrient formulas can use **synthetic test cases**, not public live recommendations.
- Do not add code generators or unnecessary wrappers just to match an architecture picture.
- Keep task IDs stable in commit/PR descriptions; user handles commits manually in Indonesian numbered format.
