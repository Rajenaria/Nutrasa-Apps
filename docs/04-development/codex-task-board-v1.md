# NUTRASA — Task Board untuk Codex v1.0

**Prioritas resmi terbaru - 18 Oktober 2026: BACKEND-FIRST.** Owner membatalkan
rencana Portfolio Prototype First dan pengembangan mock/frontend lanjutan.
M03-01 di-resume pada status **PARTIAL**, bukan DONE. Frontend React Native/Expo
baru dilanjutkan setelah alur utama backend nyata siap, tervalidasi dan mendapat
approval owner. Kode prototype yang sudah dibuat tetap dipertahankan sebagai
pekerjaan lokal; tidak dihapus, dilanjutkan atau dianggap integrasi backend.

Preflight keputusan ini: branch feat/database-foundation, HEAD e588f2d,
3 modified + 13 untracked dari batch prototype, semuanya unstaged; staged diff
kosong. Tidak ada kesimpulan push baru dari tracking lokal tanpa verifikasi remote.
[Pause handoff](M03-01-BACKEND-PAUSE-HANDOFF.md) tetap arsip kronologis keputusan
sebelumnya; arahan pause/prototype di dalamnya telah superseded oleh keputusan ini.

**Checkpoint terbaru - restricted writer integration PASS:** A/B/C telah disetujui owner.
[Kontrak dan implementasi terkini](../02-architecture/authorization-registry-reader-security.md#12-approved-abc-and-restricted-writer-offline-implementation)
menggantikan status PROPOSED/tertahan pada catatan historis di bawah. Kandidat
0009, private request-principal adapter, scanner terbatas dan executable isolated
suite kini disiapkan. Focused scanner 13/13, writer/identity 22/22, migration/guard
4/4 serta satu full backend unit regression 142/142 PASS; typecheck/lint PASS.
Approval PostgreSQL terpisah telah dilaksanakan: owner mengirim hasil restricted
writer **17/17 PASS, 0 fail/skip, exit 0** pada PG 18.6 testing port 5433. Bukti
[writer terisolasi](../../backend/tests/integration/governance-writer.README.md)
mencakup ACL/ownership, finite transitions, rollback audit/pointer, path protection,
concurrency/revocation visibility, actual writer Pool dan protected DOWN/UP.
Setup confirmation exit 3 dan authentication preflight 28P01 ditutup lewat recovery
terarah berapproval; preflight gagal tidak menjalankan suite. Target sekarang
retained, history/checksum sembilan entry, fungsi akhir tertutup. Tidak ada bootstrap
nyata atau aktivasi editorial/produksi. Reader/Pool 8/8 tetap bukti batch sebelumnya,
tidak diulang. Unit 142/142 dan typecheck/lint tidak diulang pada finalisasi dokumen.
Firebase live, crash-at-commit, lifecycle concurrency, publikasi/immutability dan
retensi tetap OPEN. M03-01 PARTIAL / ACTIVE, frontend DEFERRED. Batch berikutnya
review enforcement lifecycle dan publication/immutability sebelum approval coding;
tidak melanjutkan M03-02 atau mengaktifkan authority otomatis. Riwayat planning di
bawah dipertahankan; tidak ada izin reuse/reset/cleanup atau Git mutation.

Urutan batch resmi, tanpa mengubah ID/dependensi milestone M00-M10:
Status terbaru: [catalog lifecycle technical preflight](../02-architecture/catalog-lifecycle-publication-gates.md)
0010 telah mendapat bukti owner-run fresh retest **17/17 PASS, 0 fail/skip, exit 0**,
1735.0272 ms (16 checkpoint + parent). Target FAIL 6643ae844e614d2fa430c6e48953f5be
tetap dipertahankan: 42P08 UUID/text fixture, 4 pass / 2 fail termasuk parent, exit 1.
Dua query fixture diperbaiki dengan UUID cast eksplisit tanpa perubahan assertion/
migration; target retest e4c65951b6bf42c2b310b5924372b20d retained dengan sepuluh
history/checksum menurut assertion suite. HBA terverifikasi 28 valid, 0 error.
[Evidence lengkap](../../backend/tests/integration/README.md#catalog-preflight-0010---execution-evidence)
membedakan FAIL lama, retest PASS dan batas fixture lock protocol. Tidak ada
publication/withdrawal writer, trigger, real assignment atau operational activation.

Owner kini APPROVED policy typed actor, complete contributor lineage, independent
nutrition reviewer dan publisher berbeda, ketiga izin sumber, validity boundaries,
publication/replacement dan withdrawal yang mempertahankan histori. Kualifikasi,
orang/staf nyata, legal clearance, retensi/cache dan live Firebase tetap OPEN.
Owner kemudian APPROVED [physical matrix](../02-architecture/postgres-physical-schema-v1.5.md#review-identity-and-contributor-lineage---approved-physical-contract)
untuk satu tabel lineage 13 kolom, tiga kolom audit nullable, tujuh indeks lineage
dan tiga indeks FK audit. Kandidat 0011_catalog_lineage.sql, guard dan executable
structural suite disiapkan offline; tanpa writer/operational grant atau backfill.
Scanner existing cukup, tidak diperluas. [Rencana batch](../02-architecture/sql-migration-plan.md#review-identity-and-lineage---next-offline-batch)
memisahkan constraint struktural dari writer-only enforcement. PostgreSQL 0011
BELUM dijalankan; perlu approval fresh-target terpisah. M03-01 PARTIAL / ACTIVE,
frontend DEFERRED.
Hasil non-database terakhir setelah fixture fix: 146/146 unit, typecheck/lint dan
diff check PASS. Tidak diulang pada batch dokumentasi; bukan bukti lineage enforcement.
Batch structural 0011 sesudahnya: focused scanner/loader/structural guards 22/22
PASS, satu full backend non-database regression 153/153 PASS (0 fail/skip), backend
typecheck/lint PASS. Integration lineage disiapkan dengan 18 checkpoint nyata,
BELUM dijalankan. Tidak ada placeholder/skipped writer tests atau klaim PostgreSQL
PASS untuk 0011. Hash 0001-0010 tetap dipatok, privilege/core/scanner tidak diperluas.

Urutan berikut: finalisasi offline structural SQL/static tests dan prepared suite
-> separate PostgreSQL approval -> reviewed content/review/
publication writer authority/body/privileges dan security/concurrency tests. Jangan
membuka ulang A/B/C atau mengulang suite lama. Urutan 1-3 di bawah adalah riwayat
gate authority/writer sebelumnya; hanya remaining enforcement yang belum terpenuhi.

1. Tutup satu gate [authority/bootstrap/delegation](../02-architecture/authorization-registry-reader-security.md#9-authority-and-restricted-grantrevoke-foundation):
   trust service-to-actor, finite delegation matrix, pencatat/aturan bootstrap tanpa
   self-grant, revoke penerima nonaktif/reactivation, serta protokol lock katalog.
2. Setelah kebijakan disetujui, implementasikan satu batch restricted grant/revoke
   tertutup: kandidat migration berikutnya berdasarkan discovery aktual, scanner
   minimum, atomic event/pointer, duplicate/self-transition rejection dan tests
   offline. Tidak ada operational EXECUTE, role/GRANT atau assignment nyata.
3. Dengan approval database terpisah, validasi writer/install/ownership/ACL,
   append-only audit, immutability, publication gate dan concurrency pada target
   disposable fresh. Tutup acceptance M03-01 berdasarkan bukti, bukan rencana.
4. Lanjutkan M03-02 lalu M03-03; implementasi backend APIs, integrasi PostgreSQL
   dan Firebase live serta security/integration validation sesuai kontrak/gate.
5. Review readiness alur utama end-to-end dan minta approval frontend nyata.
   Mock UI tidak dipakai sebagai pengganti acceptance backend.

Batch Development + Risk-Based Testing tetap berlaku: focused regression untuk
perubahan berisiko, satu full regression pada batas batch yang relevan, tidak
mengulang suite yang sudah PASS tanpa alasan. Tidak ada izin PostgreSQL mutatif,
privileged installation atau aktivasi editorial dari perubahan prioritas ini.

**Batch restricted writer offline:** M03-01 **PARTIAL / ACTIVE**, frontend
**DEFERRED**. Lima prinsip security disetujui sebagai baseline; detail binding
aktor yang enforceable, finite delegation matrix dan bootstrap recorder belum
ditetapkan. [Validasi kontrak dan batas batch](../02-architecture/authorization-registry-reader-security.md#10-approved-offline-writer-foundation-batch)
menahan SQL writer/migration baru serta executable writer suite pada gate tersebut.
Regression discovery/scanner ditambah untuk menolak batch privileged SQL yang
belum didukung sebelum snapshot batch diterima; bukan bukti database writer PASS.
Reader/Pool 8/8 PASS tetap, Firebase live PENDING; tidak ada aktivasi atau GRANT.
Focused migration-policy 12/12 dan satu full backend non-database regression
131/131 PASS (0 fail/skip); backend typecheck/lint PASS. Writer integration masih
berupa spesifikasi, belum executable suite atau bukti privilege/concurrency PASS.

**Authority contract closure:** [paket keputusan A/B/C](../02-architecture/authorization-registry-reader-security.md#11-authority-contract-closure-proposal)
kini merinci trusted backend actor boundary, matriks exact enam CATALOG pair dan
bootstrap dua manusia sah dengan FK existing. Status PROPOSED, belum authority
aktif: issuer runtime hanya boleh mengelola empat hak editorial; dua hak admin
hanya maintenance berapproval owner. Model ini tidak mengklaim DB membuktikan
identitas manusia. Setelah keputusan material A/B/C, lanjut coding offline yang
sudah disetujui tanpa audit ulang; PostgreSQL dan aktivasi tetap gate terpisah.

**Riwayat prioritas sementara - 18 Oktober 2026 (SUPERSEDED):** M03-01 **PAUSED/PARTIAL**; fokus sementara
React Native/Expo Portfolio Prototype dengan mock data terisolasi. Lihat
[backend pause handoff](M03-01-BACKEND-PAUSE-HANDOFF.md) untuk kronologi,
migration/testing evidence, target retained, OPEN gates dan langkah resume.
HEAD aktual preflight handoff 3e4cf3c; e9e8e82 + tiga modified adalah checkpoint
historis yang sudah disimpan owner. Tidak ada aktivasi authority/editorial,
perubahan urutan milestone M00-M10 atau izin database dari prioritas prototype.
Deliverable dokumentasi akhir proyek yang direncanakan: histori pembangunan
komprehensif dan handbook teknis engineer; keduanya belum diklaim selesai.

**Cara pakai:** satu task pada satu waktu; ikuti AGENTS.md root dan struktur src/app/ + src/features/. M00-01, M00-02 dan M00-03A telah dilaporkan selesai pada sesi sebelumnya. M00-03B selesai dalam allowlist: link relatif, preservasi SHA-256, git diff --check, typecheck dan lint lulus; klausul roadmap di luar allowlist dilaporkan untuk task berikutnya. Catatan awal "M01–M10 BELUM DIKERJAKAN" adalah baseline historis, bukan status terkini. M03-01 kini mempunyai bukti identity 15/15, food_sources 13/13 dan [katalog struktural 0003 18/18](../../backend/tests/integration/README.md#food-catalog-m03-01) integration PASS, masing-masing exit 0; engine 11/11 PASS. [Bukti food_sources](../../backend/tests/integration/README.md#food-sources-m03-01) dipertahankan. [Kontrak lanjutan](../02-architecture/postgres-physical-schema-v1.5.md#kontrak-katalog-lanjutan-m03-01) empat tabel dan dua kolom provenance APPROVED; [SQL 0004/0005 dan tests](../02-architecture/sql-migration-plan.md#katalog-lanjutan-m03-01) telah diuji pada satu target disposable yang disetujui: [suite gabungan 24/24 PASS, 0 fail/skip, exit 0](../../backend/tests/integration/README.md#katalog-lanjutan-m03-01), termasuk rollback, DOWN/UP/re-run dan preservasi domain terdahulu. Normalisasi konseptual disetujui, belum diimplementasikan. [Kontrak audit/governance](../02-architecture/postgres-physical-schema-v1.5.md#kontrak-governance-katalog-m03-01) kini APPROVED untuk dokumentasi; Scanner subset awal dan SQL struktur audit 0006 kini ditulis setelah approval berikutnya; [16/16 integration PASS, 0 fail/skip, exit 0](../../backend/tests/integration/README.md#catalog-audit-foundation-m03-01), termasuk failure rollback, empty DOWN/UP/re-run, populated DOWN refusal dan preservasi domain terdahulu. Enforcement/security serta keputusan owner/legal/clinical tetap OPEN. Seluruh M03-01 belum DONE. Hasil migration bukan bukti fitur aplikasi/publikasi operasional. Urutan dan ID milestone di bawah dipertahankan.

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
| M03-01 | Migration awal users, catalog source and traceability | Schema/API terselaraskan M00-03A; physical v1.5 dibaca bersama database decisions v1.6 | Identity 15/15, food_sources 13/13 dan katalog struktural 0003 18/18 integration PASS, exit 0; upgrade/rollback/DOWN-UP/re-run dan preservasi domain terdahulu teruji pada PG disposable. Kontrak taxonomy/aliases/servings/provenance lanjutan APPROVED; SQL 0004/0005 dan suite gabungan 23 checkpoint + parent: 24/24 integration PASS, exit 0; taxonomy/porsi/provenance, rollback dan preservasi baseline teruji. Kontrak reviews/review_sources/import_batches, batch FK, digest dan restricted governance APPROVED untuk dokumentasi; Scanner subset awal dan struktur SQL audit 0006 ditulis; suite audit 16/16 integration PASS, 0 fail/skip, exit 0; struktur/rollback/lifecycle/preservasi teruji. Digest v1 internal SECURITY INVOKER 0007 dan enam golden vectors telah teruji: [15/15 integration PASS, 0 fail/skip, exit 0](../../backend/tests/integration/README.md#catalog-digest-v1-m03-01), termasuk ACL, failure rollback, DOWN/UP/re-run dan preservasi domain; tanpa grant operasional. [Security foundation](../02-architecture/system-architecture.md#security-foundation-setelah-checkpoint-7174273) dan [test plan](../02-architecture/sql-migration-plan.md#security-foundation-verification-plan) dirinci setelah checkpoint 7174273: trust/actor, deny-by-default, ownership installer nonaktif, append-only dan lock/concurrency; dokumentasi saja, tanpa code/privilege/PG execution baru. Identitas editorial Firebase/Fastify APPROVED; request identity/capability boundary dan central 401/403 mapping ditulis serta diuji dengan trusted mocks, adapter firebase-admin 14.5.0 kini terpasang dan diuji offline, live configuration CONFIGURATION PENDING; [capability persistence contract](../02-architecture/system-architecture.md#capability-persistence-contract---desain-belum-ddl) dirinci tanpa DDL/store aktif. Batch capability persistence menyiapkan [proposal fisik 10/4 kolom](../02-architecture/postgres-physical-schema-v1.5.md#capability-persistence-foundation-m03-01-proposed) events/projection, binding app_users, administrative bootstrap nonaktif dan [test plan terarah](../02-architecture/sql-migration-plan.md#capability-persistence-foundation-test-plan); candidate SQL 0008 struktur 10/4 kolom dengan scope nonblank serta unit/static dan integration suite kini disiapkan, tanpa store terpasang/grant/PG execution. Focused migration/scanner 14/14 dan full backend unit 102/102 PASS, typecheck/lint PASS; coding batch integration awal hanya prepared; owner kemudian mengirim output 0008 16/16 PASS, 0 fail/skip. [Read authorization foundation](../02-architecture/system-architecture.md#authorization-read-boundary-dan-restricted-writer-plan) kini berupa adapter query nonoperasional, exact capability/scope hook, registry default kosong dan mocked security tests; focused identity/Firebase/capability 33/33 dan full backend unit 112/112 PASS, typecheck/lint PASS; saat checkpoint itu real runtime/privilege/pool tests belum berjalan. Registry/reader review menyiapkan [vocabulary dan privilege decision package](../02-architecture/authorization-registry-reader-security.md): proposal saat checkpoint review kemudian disetujui owner: enam pair teknis dan reader manifest 13 kolom; shared registry, guard nonowner dan multi-role suite kini teruji pada disposable PG 18.6 port 5433: [reader 8/8 PASS, 0 fail/skip, exit 0](../../backend/tests/integration/README.md#reader-security-execution-evidence), exact 13-column SELECT, effective ACL/negative privileges dan reuse backend Pool max=1 pada skenario sequential/concurrent. Retry setup berhenti karena collision preflight (exit 1), disusul recovery terarah yang disetujui; marker/exit aktivasi terpisah tidak tersedia. Historis non-database installer: focused 30/30, full backend unit 130/130, typecheck/lint dan mobile typecheck PASS; tidak diulang pada checkpoint dokumentasi. Subset aktivasi default kosong dan server tetap tanpa authority. Writer authorization, duplicate transitions, append-only dan concurrency belum diimplementasikan. [Authority/bootstrap dan spesifikasi restricted writer](../02-architecture/authorization-registry-reader-security.md#9-authority-and-restricted-grantrevoke-foundation) dirinci dari checkpoint e9e8e82; SQL writer/scanner/tests executable ditahan pada gate delegation, service-to-actor binding dan bootstrap, tanpa mengubah hasil Reader 8/8 atau membuat migration baru. Enforcement writer/security produksi serta authority/bootstrap/separation, owner/legal/clinical, live Firebase dan crash-at-commit OPEN. Target retained tanpa reuse/reset/cleanup; M03-01 PARTIAL, belum DONE. | M02 |
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
