# NUTRASA — AI Agent Development Instructions

These instructions apply to all code changes in this repository. Follow higher-priority instructions and established project conventions. When instructions conflict, preserve security, data integrity, and explicitly approved product behavior; identify any unresolved conflict instead of guessing.

## 1. Engineering priorities

- Write the simplest correct, secure, readable, maintainable solution that meets the requested scope.
- Follow official Expo, React Native, Expo Router, and TypeScript conventions **for the versions installed in this project**. Inspect installed versions and existing configuration before choosing APIs or patterns.
- Prefer framework-native solutions and the project's established architecture over custom infrastructure or fashionable design patterns.
- Apply KISS, DRY, YAGNI, and single responsibility pragmatically. Do not create abstractions merely to satisfy a principle.
- Optimize for straightforward future changes to features, UI, and business rules; avoid clever or tightly coupled code.

## 2. Inspect before editing — no fabrication

- Read the relevant files and configuration before coding. Trace related components, hooks, callers, types, tests, routes, and data contracts as needed.
- Search for existing functions, components, utilities, and dependencies before implementing equivalents. Reuse a suitable implementation instead of duplicating it.
- Never invent project files, exports, APIs, function signatures, packages, environment variables, database fields, product requirements, or test results.
- Confirm unfamiliar framework APIs against the installed version and available official documentation. If verification is unavailable, state the uncertainty; do not present assumptions as facts.
- Do not silently infer undefined business behavior. Preserve existing approved behavior; surface consequential ambiguity.

## 3. Architecture and organization

- Keep feature-specific code in its corresponding `src/features/` folder, following the existing structure inside that feature.
- Keep Expo Router files in `src/app/` thin: routing, navigation configuration, and minimal composition only. Put business logic outside route files.
- Place shared code in existing shared locations only when it is genuinely reused across features; avoid generic `utils`/`helpers` dumping grounds.
- Keep UI/presentation, business rules, and data access separated where this improves clarity, while avoiding unnecessary layers, wrappers, classes, and services.
- Prefer cohesive, focused functions and components over large multipurpose ones. Do not split straightforward code into many tiny files or functions without benefit.
- Respect existing data flow, state-management, error-handling, and styling conventions unless the task explicitly requires changing them.

## 4. TypeScript, naming, and parameters

- Use descriptive, consistent English identifiers; follow existing naming conventions and language/framework idioms (for example, `camelCase` for variables/functions and `PascalCase` for React components/types).
- Name functions by what they do and variables by what they represent. Avoid misleading abbreviations, vague names, and unnecessary verbosity.
- Use precise TypeScript types for public interfaces, component props, function boundaries, and domain values. Prefer inference for obvious local values.
- Avoid `any`, unsafe casts, non-null assertions, and suppression comments. If unavoidable, keep them narrowly scoped and explain the reason.
- Represent optional or missing data explicitly (`null`/`undefined` or a suitable union) instead of disguising absence with `0`, empty strings, or made-up defaults.
- Keep parameter lists simple and consistent. Use an options object for several related or optional arguments when it improves call-site clarity; do not wrap every function's parameters by default.
- Use named constants for meaningful business values. Avoid unexplained magic numbers, duplicated configuration, and unnecessary generic types.
- Use the repository's existing formatting and lint rules; do not introduce competing style conventions.

## 5. Reuse and duplication

- Maintain a single authoritative implementation for each business rule, calculation, and data transformation where practical.
- Reuse existing components, hooks, functions, and utilities when semantics truly match. Similar-looking code with different responsibilities need not be forced into one abstraction.
- Extract shared logic when it demonstrably reduces duplication and makes future changes easier; do not prematurely generalize for hypothetical uses.
- Never create a second active implementation of an existing function merely to bypass fixing the original.

## 6. Changes, refactoring, and cleanup

- Keep changes scoped to the requested task and necessary dependent fixes. Avoid unrelated formatting churn, broad rewrites, and speculative improvements.
- When revising a feature, update its existing implementation cleanly instead of stacking patches, duplicate functions, alternate components, or compatibility hacks without a real need.
- Check all known callers and contracts before changing exports, props, types, navigation paths, persisted data formats, or APIs.
- Remove obsolete code, unused imports, abandoned implementations, stale comments, and unnecessary dependencies **only after checking for static and indirect/dynamic usage**.
- Do not leave commented-out old code or backup copies in source files; rely on version control for history.
- Preserve backward compatibility and user data where required. Treat schema, storage, migrations, authentication, and synchronization changes as higher risk.
- Do not auto-commit, push, reset, or perform destructive repository operations unless explicitly requested.

## 7. Comments and documentation

- Code should explain **what** it does through clear names and structure; comments should explain non-obvious **why**, constraints, invariants, or safety-sensitive behavior.
- Put a short comment immediately above the relevant function or block when needed. Document public contracts only when types and names are insufficient.
- Do not comment every line, narrate obvious JSX or assignments, or add decorative section banners.
- Keep comments accurate when code changes. Never use comments to hide confusing naming or unfinished implementation.
- Document important configuration keys or security assumptions without exposing secrets, internal credentials, or sensitive values.

## 8. Reliability, security, and performance

- Validate untrusted inputs at appropriate boundaries; handle loading, empty, missing, partial, and error states explicitly where applicable.
- Prefer clear error handling over broad `catch` blocks, silent failures, or fallback values that mask data-quality problems.
- Follow established security patterns and use framework-supported safe APIs. Never commit secrets, private keys, access tokens, or sensitive configuration; avoid logging sensitive user data.
- Do not bypass authentication, authorization, privacy controls, or data validation for convenience.
- Avoid unnecessary re-renders, repeated computation, duplicate requests, and wasteful data access. Introduce complex caching or memoization only when justified.
- Add dependencies only with a concrete need. Prefer existing dependencies or native APIs; for Expo SDK-compatible packages use `npx expo install`.

## 9. NUTRASA product and nutrition-data invariants

- Preserve all approved NUTRASA product decisions (Decision 01–10 and subsequent approved decisions). Consult their authoritative project documents before changing affected behavior; do not invent missing decision details.
- For Decision 10: a day with no food log is **not** a zero-intake day; historical targets follow their effective dates; a day with at least one food log counts as an active logging day; optional “Selesai Mencatat” completion is tracked separately; partial nutrition data remains marked as partial.
- Keep nutrition calculations, units, rounding, and aggregation consistent and centralized where practical. Do not silently convert missing or partial nutritional values into known zeros.
- UI refactors must not silently change nutrition semantics, daily metrics, historical data, or user-visible product behavior.
- Treat edits to stored nutrition records, historical targets, and completion states as data-integrity-sensitive changes.

## 10. Verification and truthful handoff

- Before completion, review the diff for scope, duplication, dead code, type regressions, and unintended behavioral changes.
- Run relevant project checks when the environment permits: `npm run typecheck` and `npm run lint`; run `npx expo-doctor` when Expo dependencies or configuration change. Run relevant existing tests and targeted checks for the modified behavior when available.
- Fix issues introduced by the change. If checks cannot run, fail, or reveal pre-existing failures, report which commands were run and their actual outcomes; never claim unexecuted checks passed.
- For higher-risk changes, verify affected flows and edge cases, including missing/partial data, navigation, persistence, and relevant regressions.
- End with a concise handoff: what changed, significant files affected, checks performed and results, and any remaining risks or required decisions. Do not exaggerate confidence.

## 11. Mandatory working sequence

1. **Inspect:** understand the existing implementation, scope, decisions, and dependencies.
2. **Reuse:** locate suitable existing logic and confirm the framework-supported approach.
3. **Implement:** make the smallest coherent, maintainable change.
4. **Clean up:** remove verified obsolete code and update affected callers/types/tests.
5. **Verify:** run appropriate checks and inspect the diff.
6. **Report:** state what actually changed and what was or was not verified.

**Non-negotiable:** No invented facts, no needless complexity, no duplicate business logic, no silent product-rule changes, and no unverified claims of success.
