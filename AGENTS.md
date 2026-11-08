# Working on PatternAki

Read both root specification documents and README.md before extending the app. The technical stack specification controls framework and library choices. The builder specification section 13 controls interaction details.

- Use React, strict TypeScript, Vite, Mantine, Lucide, react-resizable-panels v4, Zustand, Dexie and Zod. Add the specified PDF/PWA tools when implementing those milestones. Do not introduce a second UI library.
- Coordinates and distances are millimetres. Rendering and display units never own dimensions. Keep geometry independent of React/DOM/storage.
- Document operations are immutable. Preview transient changes, validate and commit one history entry per logical action. Persist only committed documents.
- Validate imports and stored data. Do not silently discard unsupported schemas. Use explicit migrations for persisted format changes.
- Keep files focused. `src/app` is the shell; `ui` is controls; `editor` is interaction/history; `document` is schema/operations; `geometry` is pure math; `persistence` is IndexedDB.
- Run `npm test`, `npm run lint`, `npm run format:check`, and `npm run build`. Use Node 22.12+. No backend credentials are needed.
- Visual testing is unavailable in the initial environment. Do not claim browser verification or install a browser merely to work around that constraint. Track pending interaction tests and milestone acceptance honestly.
- Preserve both original specification files. Do not edit package-lock.json by hand. Do not commit node_modules, dist or tsbuildinfo.

Done means the scoped behavior is implemented, meaningful tests and checks pass, failure paths preserve user geometry, and README reflects supported behavior and remaining limitations. Full v1 completion additionally requires the original specification's acceptance tests.
