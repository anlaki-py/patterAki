# PatternAki compared with Vector Studio

Review date: 2026-11-14. Reference checkout: `/home/git/vector-studio`. Target: PatternAki in `/home/workspace/patterAki`.

## Verdict

PatternAki has a sound drafting model and substantial correctness coverage. Its weakest area is interaction orchestration: too much state, keyboard routing and pointer handling lives inside one React component. The next concern is repeated work while moving the pointer. These deserve attention before adding more tools.

Vector Studio has useful solutions for both problems: explicit tool lifecycles, transaction ownership, separate artwork/overlay invalidation, snap indexes and bounded undo records. Adopt those ideas selectively within PatternAki's required React/Mantine/SVG architecture. A Canvas/WASM rewrite would be disproportionate to the evidence from this review.

Vector Studio's README calls it professional software. That description alone does not establish production reliability. I inspected its implementation and representative tests, but did not run or certify that application. It also contains large modules and considerable complexity.

## Scope and evidence

The comparison covers document/history design, input and tool lifecycles, rendering, snapping, geometry/units, commands/errors, persistence/recovery, print/export, touch, tests, dependencies and documentation. Both original PatternAki specifications and README informed the review. Findings below distinguish observed code behavior from performance risks and unverified interaction behavior.

This is a source comparison and a focused regression fix, not an exhaustive audit of every feature in the larger application. No browser was installed or run. Existing screenshots and historical README test results are not new verification. No reference dependencies were installed, and no source code was copied from Vector Studio.

For scale, counting non-test `.ts`, `.tsx` and `.js` files under `src` at review time gives about 21,000 lines across 167 files in PatternAki, versus 169,000 across 582 files in Vector Studio. Two PatternAki source files exceed 500 lines; 81 Vector Studio files do. Counts include static code/data and say nothing by themselves about correctness. Vector Studio has a much wider feature set.

## Fixed in this change

Only the interaction defects identified during this review were changed. Other recommendations remain report-only.

### Curve pickup and gesture ownership

Previously, `useCurveDrag.begin` immediately created a cubic preview. Releasing without moving committed the conversion, so a click on a straight segment changed its type and consumed an undo step. Curve gestures also relied on a React effect to invalidate their local reference after cancellation; they did not independently check the opening document revision or tool. Release committed the last preview without reading its final position. The viewport's pointer-down guard omitted active curve drags.

The extracted [curve controller](../src/editor/curveDrag.ts) now:

- Waits for 3 CSS pixels of travel before changing geometry, independently of zoom. Returning to the pickup point leaves the original geometry intact.
- Checks pointer ownership, document revision, tool and cancellation generation synchronously. A later callback cannot publish a cancelled or replaced document's curve preview.
- Recomputes from the opening geometry and consumes the final release position. Handle movement uses the pickup delta, preventing a jump when grabbed off-center.
- Validates contours during preview and rejects invalid/out-of-range commits while keeping the original document. A successful drag creates one undo entry.

[useCurveDrag](../src/editor/useCurveDrag.ts) now adapts DOM targets and notifications to that controller. The viewport refuses another press/move/release while a curve gesture belongs to a different pointer. This does not implement general multi-touch support.

### Undo and Redo before a first preview

The store previously treated a draft or preview as cancellable, but omitted `gestureActive`. With existing history, Undo/Redo could traverse it while a pointer was down before a preview existed. With empty history, those commands were disabled instead of allowing cancellation.

[store.ts](../src/editor/store.ts) and [commands.ts](../src/editor/commands.ts) now cancel the active gesture first and preserve document/history/revision. A later invocation traverses history normally. Four new tests reproduced the original failure before the fix.

## Comparison by area

| Area                  | Vector Studio evidence                                                                                                                                | PatternAki evidence and judgment                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical geometry    | `src/model/document.js`, `src/model/bezier.js`; node store, independent geometry, point-based units                                                   | `src/document`, `src/geometry`; physical mm independent of rendering. Keep this choice. A sewing tool benefits from its explicit physical-unit contract.                                                                                     |
| Transactions and undo | `src/model/document.js`; touched-node before/after maps, selection restoration, step and node budgets, optional coalescing                            | `src/editor/store.ts`; full validated document snapshots, 100-step cap, selection cleared on undo. Simpler and understandable, but less efficient at scale.                                                                                  |
| Tool lifecycle        | `src/tools/tool.js`, `src/input.js`, `src/tools/transform-session.js`; input normalization, lifecycle methods and transaction ownership               | `src/editor/EditorViewport.tsx`, drag controllers/hooks; similar responsibilities exist but are spread between component state, refs and Zustand. Largest structural weakness.                                                               |
| Rendering             | `src/render/canvas-view.js`, `src/render/draw.js`; separate dirty flags, animation-frame scheduling, cached paths, culling, bitmap pan/zoom fallback  | `src/editor/SvgGeometry.tsx`; SVG is appropriate, but pointer-driven parent renders repeat geometry/path work. Borrow invalidation and caching principles.                                                                                   |
| Snapping              | `src/tools/snap.js`; gesture-scoped spatial lookup using coordinate-sorted arrays                                                                     | `src/editor/snapResolver.ts`, `geometrySnaps.ts`, `intersectionSnaps.ts`; richer pattern-specific priorities, hysteresis and intersection behavior, with some caches already present. Improve lookup cost without replacing these semantics. |
| Commands and errors   | `src/commands/registry.js`, `src/lib/errors.js`; shared enabled state, shortcut resolution, expected-error distinction and async error boundary       | `src/editor/command.ts`, `commands.ts`, `src/ui/CommandControls.tsx`; already shared commands and availability checks. Error display depends on the caller choosing `notifyCommand` or its own catch.                                        |
| Persistence/recovery  | `src/features/files/autosave.js`, `recovery.js`, `format.js`; revision-aware recovery across storage backends, serialization, stale-backup safeguards | `src/persistence/repository.ts`, `autosave.ts`, reference backup tests; queued writes, atomic IndexedDB transactions, cross-tab revision/fingerprint guards, explicit recovery/export. Keep these. No evidence justifies a storage rewrite.  |
| Schema/import         | `src/features/files/format.js`; explicit migration and extensive manual format checks                                                                 | `src/document/schema.ts`; strict TypeScript plus runtime Zod validation and explicit legacy migrations. Good fit. Its size is a maintenance concern, not a reason to weaken validation.                                                      |
| Printing              | `src/features/io/print-layout.js`; pure layout shared with preview, broader media/scaling choices                                                     | `src/export/tiling.ts`, `pdf.ts`, `pdfDrawing.ts`; exact mm-to-point conversion, exact A4 mm dimensions, vector geometry and calibration. Preserve actual-size defaults and current pattern-only pages. A preview would help.                |
| Touch/pen             | `src/input.js`; deferred touch initiation, pinch arbitration, pointer ownership, long press and palm handling                                         | `EditorViewport.tsx`, `SvgGeometry.tsx`; basic pointer/touch paths and Pan tool, but no equivalent gesture arbitration. This is an existing specification gap.                                                                               |
| Verification          | Many focused lifecycle and recovery tests, including `tests/anchor-drag-corners.test.js` and `tests/autosave-discard-race.test.js`                    | 600 baseline unit tests passed. Existing Playwright sources cover meaningful workflows, but current CI runs unit/lint/format/build only. Browser acceptance still matters.                                                                   |
| Product structure     | Feature registration separates many tool/feature modules, with some very large files                                                                  | Required layer boundaries generally hold. No benefit in importing an illustration editor's paint/type/collaboration/plugin machinery into a focused pattern tool.                                                                            |

## Remaining work, ranked and left unchanged

### 1. Make the remaining interaction state explicit

**Observed:** `EditorViewport.tsx` is over 1,300 lines. It combines drafting, vertex dragging, guides, pan, snapping, exact entry, keyboard routing, context actions and rendering. Curve ownership is now checked, but the other paths still use different lifecycle rules.

Two concrete examples deserve follow-up:

- Resolved in the focus-loss follow-up: its window `blur` listener previously called `s.cancel()` unconditionally, clearing unfinished drawing/preview state when changing windows. Focus loss now preserves click-to-click drafts and idle numeric previews, and interrupts pressed gestures separately. Regression controller tests pass; browser/file-dialog triggers remain unverified.
- `resolvePointer.ts` keeps module-global `lastDraftOrigin` to compensate for pointer-down not explicitly receiving the drafting origin. Revision/tool/cancel guards limit leakage, but this is hidden state compensating for an incomplete caller contract.

**Suggested next patch:** Extract the existing draft/vertex/guide controllers incrementally. Normalize input once and explicitly pass origin, pointer owner and opening revision. Retain the focus-loss distinction between interrupting pressed gestures and preserving unfinished click-to-click polylines.

**Acceptance:** No-op clicks, foreign-pointer release, Escape followed by delayed events, tool/project change during drag, focus loss and final-position release all have controller coverage. Browser tests verify pointer-capture and focus wiring. Preserve exact typed dimensions and snap priorities.

### 2. Remove repeated artwork and geometry work from pointer movement

**Observed:** `EditorViewport`, `useSelectionDrag` and several controls subscribe to the whole editor store. Cursor updates rerender the viewport. `SvgGeometry` is not memoized and calls `cutPath`, ownership lookups and segment path generation during render. `pieceForItem` searches pieces and their edges; the renderer calls it repeatedly for edges and points. Intersection snapping filters nearby hulls but still starts by scanning every segment.

**Impact:** This creates avoidable work and can approach quadratic ownership traversal as documents grow. It is a scaling risk, not a measured claim that ordinary drawings currently lag. No browser frame-time or memory benchmark was run.

**Suggested next patch:** Profile fixed small/medium/large drafting fixtures first. Then memoize stable SVG artwork separately from cursor overlays, use narrow Zustand selectors, and cache ownership/derived cut geometry outside serialization. Build stationary snap data once per document/gesture and invalidate it on real geometry changes. Preserve exact live geometry in SVG and export.

**Acceptance:** Compare before/after pointer frame time and geometry-call counts on the same fixtures. Tests must show edits, hidden paths, undo/redo and seam overrides invalidate every cache correctly. Add culling or another renderer only if measurements justify it.

### 3. Bound history by retained geometry, not only step count

**Observed:** `store.commit` runs Zod parsing, seam checks and JSON comparisons before storing another complete document. Zod parsing produces a new document graph, limiting structural sharing across committed snapshots. Keeping up to 100 snapshots bounds action count, but not memory relative to document size. Reference-image blobs are already kept out of history, which is correct.

**Suggested next patch:** Measure commit cost and retained memory with realistic large patterns. Consider immutable change records or validated structural sharing, plus a geometry/size budget. Keep strict validation at load/import/storage boundaries. History improvements must not bypass topology or lock checks.

**Acceptance:** Long edit/undo/redo sequences restore exact geometry, failed edits preserve the redo stack, history trimming cannot affect the current drawing, and recovery/dirty status remains correct. Do not copy collaboration rebasing or timed coalescing without a separate need.

### 4. Finish touch interaction as a defined workflow

**Observed:** The README already records missing two-finger pan/pinch and ambiguous first-tap snap choice. `SvgGeometry` uses point hit radii of `12 / scale` and edge widths of `18 / scale`, giving about 24 px point diameters and 18 px edge bands regardless of coarse pointer input. These are below the builder's approximate 44 px important-touch-target goal. Canvas geometry targets need overlap arbitration as well as larger hit areas.

**Suggested next patch:** Define how a second finger cancels or suspends an active tool before changing the viewport. Add a coarse-pointer hit strategy, first-tap preview/confirmation for crowded targets, and visible touch alternatives. Vector Studio's `CanvasInput` is a useful architectural reference. Its precise timings and gestures need not become PatternAki defaults.

**Acceptance:** Repeat the wallet workflow with touch, test pinch beginning after one finger, cancellation/capture loss, crowded snap choices and exact numeric entry. Emulation supplements real-device testing; it does not replace it.

### 5. Make command errors and acceptance status consistent

**Observed:** `defineCommand` rechecks availability but has no common error-reporting contract. `notifyCommand` catches synchronous exceptions only, while other callers implement their own catches or invoke commands directly. The curve adapter previously replaced commit failures with a guessed coordinate-range explanation; this change preserves the actual failure message.

Documentation also mixes current behavior with accumulated milestone notes. README's older model description names schema versions 1–9 while later sections describe schema 12. Historical passing browser runs appear alongside pending acceptance statements. CI does not execute the existing Playwright suites.

**Suggested next patches:** Establish one command failure contract that supports awaited results and preserves inline form errors, with a distinction between expected invalid edits and programming failures. Separately consolidate README into current behavior, current limits, commands and a dated acceptance record. Add browser CI in an environment explicitly equipped for it.

**Acceptance:** The same invalid command gives useful feedback through menu, shortcut and inspector without unhandled rejection or geometry/history change. Documentation identifies exactly which build/scenario/browser was verified. Browser CI should cover core drafting, cancellation, save/reload, export and safe PWA update behavior.

## What to keep, and what to avoid importing

Keep React, strict TypeScript, Mantine, SVG, mm coordinates, the existing command registry, tested pure geometry, explicit migrations, separate reference-image blobs, IndexedDB conflict checks and actual-size vector exports. These choices match the product's specifications and do not become wrong because the reference uses plain JavaScript, Canvas and Rust/WASM.

The highest-value ideas to adopt later are explicit interaction ownership, artwork/overlay invalidation, stationary snap indexes, history resource budgets and lifecycle-focused regression tests. Implement these within the current boundaries.

Avoid the reference's cloud/collaboration architecture, broad feature-hook system, general illustration feature set and bitmap transform previews unless a measured requirement appears. Its print media table uses rounded point values for A4; PatternAki should retain exact `210 × 297 mm` conversion. Its snap-to-grid branch takes precedence over point snapping; PatternAki should retain its specified geometry-over-grid priorities. Its custom UI system would conflict with the Mantine contract.

Vector Studio declares AGPL-3.0-only in its README/package metadata. This review uses it as a design reference; the changes here were implemented independently.

## Verification and limits

The baseline `npm test` run passed all 600 tests. Four added history/gesture regressions failed against the original implementation, establishing the Undo/Redo defect before the fix. The focused post-fix suite passed 19 tests across `curveDrag.test.ts` and `historyGesture.test.ts`, including invalid edits, stale callbacks, pointer ownership, zoom-independent pickup, final release, handle movement and exact undo/redo.

Final full-suite and static-check results are recorded in README's review note. Browser interaction, physical printing and real-device acceptance remain pending. In particular, controller tests do not establish DOM pointer-capture, Mantine focus or multi-touch correctness.

The production build passes with a main JavaScript chunk of about 1.09 MB before gzip, about 334 kB compressed, and a separate lazy PDF chunk. Vite warns about chunk size. This is an additional reason to measure startup cost and consider lazy loading infrequently used dialogs, not evidence for a renderer rewrite.

The cleanup pass was limited to this session's changes. Removed: the old inline curve-gesture implementation and its effect-dependent cancellation rule, replaced by one controller using the existing geometry functions. Flagged, not removed: the viewport, repeated rendering work and other report-only findings above. Left alone on purpose: document validation, shared curve mathematics, history representation, persistence and the required stack. The new controller and adapter are reached from the viewport; no unused session additions or duplicate curve algorithms were found.
