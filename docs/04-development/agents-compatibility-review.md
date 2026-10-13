# NUTRASA — AGENTS.md Compatibility Review

**Source inspected:** user-uploaded `AGENTS_NUTRASA_FINAL.md` (100 lines; read in this session). **Not verified:** current local repository `AGENTS.md` content; it must be inspected by Codex before any edit. **Action:** NO replacement, merge, or change to `AGENTS.md` is included in this pack.

## Compatibility table

| Existing AGENTS instruction | Integration decision | Conflict status |
|---|---|---|
| Official versions first; inspect before edit | M00 requires checking Expo/Router/TS/package scripts | Compatible |
| `src/features/` for modules and `src/app/` thin route files | Implementation pack explicitly honors **`src/app/`**; no root `app/` move | Compatible |
| Reuse, DRY/KISS/YAGNI; avoid functions doing same thing | Tasks scoped; no duplicate shared abstractions | Compatible |
| No invented files, APIs, test outcomes | Task M00 records reality; paths marked proposed | Compatible |
| Maintain features cleanly; remove verified obsolete code | Per-task diff/caller review; no broad cleanup | Compatible |
| Avoid unnecessary comments; why-focused | Existing comment rules preserved; no competing requirements | Compatible |
| Domain null semantics and Decision 10 | Acceptance tests include null≠0, history and completion | Compatible |
| Security and privacy mandatory | Ownership, encryption, logout and account deletion are gates | Compatible |
| Run actual existing checks and report truthfully | Task board requires evidence, recognizes missing scripts | Compatible |
| Do not auto-commit/push | Explicitly forbidden to Codex; user defers commit until end | Compatible |

## Known differences to resolve by inspection, not by guessing

1. Prior planning examples sometimes said `app/` root; **the uploaded AGENTS file specifically says `src/app/`**. Existing layout is authoritative; inspect Expo Router config and actual files before any path changes.
2. Previous responses mentioned `npm run typecheck`; the script might not exist. Inspect `package.json` and **do not invent** it silently.
3. Previous plans introduced possible `backend/` directory; treat it as proposal only; check whether backend already exists.
4. `AGENTS_NUTRASA_FINAL.md` upload is not proof the local root file has identical content. If different, do not overwrite either version; show a targeted diff and ask owner whether additive changes are desired.
5. Product rules in latest decision documents override outdated draft behavior, but agents must never silently delete source docs or declare a legal/clinical gate passed.

## Safe adoption

- Extract this pack to repository root: it **only adds files under `docs/04-development/`**; it does not include `AGENTS.md` or replace any `docs/02-architecture/` files.
- Before starting M00, the agent reads real root `AGENTS.md` in repository.
- If user later requests an `AGENTS.md` tweak, propose a minimal **append-only or targeted diff**, obtain approval, and avoid duplicates.
- The task pack is subordinate to the actual AGENTS rules; it does **not** establish a second agent rulebook.
