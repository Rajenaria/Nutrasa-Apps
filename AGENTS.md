# Development instructions

- Follow official Expo and React Native conventions and consult docs for the installed SDK.
- Prefer simple, readable, maintainable implementations.
- Keep feature-specific code inside its respective `src/features/` folder.
- Keep Expo Router files in `src/app/` minimal; keep business logic outside routes.
- Avoid duplicate business logic and reuse existing utilities and components where appropriate.
- Do not introduce unnecessary abstractions.
- Do not install dependencies without clear justification; use `npx expo install` for SDK-compatible packages.
- Do not implement features beyond the requested task or perform unrelated refactoring.
- Use TypeScript types appropriately; avoid unnecessary `any`.
- Do not add unnecessary comments.
- Do not introduce security-sensitive configuration or secrets into source control.
- Respect the existing architecture unless changes are explicitly requested.
- Verify relevant changes before completing a task: `npm run typecheck`, `npm run lint`, and `npx expo-doctor` when dependencies or Expo configuration change.
