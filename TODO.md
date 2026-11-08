# patterAki TODO

> Working implementation backlog, reconciled from [`patternmaking_webapp_tech_stack_and_ui_spec.md`](./patternmaking_webapp_tech_stack_and_ui_spec.md), [`patternmaking_builder_spec_v2.md`](./patternmaking_builder_spec_v2.md) (especially §13), [`README.md`](./README.md), [`AGENTS.md`](./AGENTS.md), and the checked-in `package.json` on `master` as reviewed on 2026-11-08.
>
> **Goal:** a local-first, precise, approachable 2D sewing-pattern editor. Prioritize ease of use and measurement accuracy over tool count or decoration. This file tracks the remaining work, not a request to rebuild working features.

## How to use this file

- `[x]` = implemented according to the repository documentation; still subject to browser acceptance where noted. `[ ]` = outstanding, partially implemented, or not verified against the full acceptance criteria.
- **P0** = required for a trustworthy first usable release. **P1** = remaining manufacturing/v1 completeness and release hardening. **P2** = useful phase-2 improvements. **Later** = intentionally not blocking the release.
- Work in dependency order: **M0/M1 precision completion → M2 piece semantics → M3 real cut lines and printing → M4 project/offline safety → M5 cross-device validation**. A minimal PDF-export vertical slice may be started as soon as closed-piece geometry is available.
- Do not mark a task complete solely because a button exists. Require the behavior, failure handling, unit tests where applicable, browser verification where possible, and documentation updates.
- No speculative percentage-complete metric. Existing implementation details are based on the README and dependencies, not a fresh hands-on browser audit. Re-check code before changing a checkbox.

## Existing baseline: preserve, don't rebuild

- [x] React, strict TypeScript, Vite, Mantine, Lucide, `react-resizable-panels`, Zustand, Dexie/IndexedDB, Zod, Vitest, ESLint, and Prettier; local-first static frontend with no backend.
- [x] Compact editor shell; light/dark mode; resizable desktop Properties inspector; mobile drawer; semantic canvas colors.
- [x] SVG editor with geometry stored in **millimetres** and display switch for mm/cm/in; zoom/pan does not rescale saved geometry.
- [x] Line, polyline, closed drafting path, and exact-size rectangle creation; live length/angle and numeric input; visible endpoint/midpoint/edge and horizontal/vertical alignment snapping; Alt bypass and Shift constraints.
- [x] Selection, Shift-add, crossing box select, select all, single/group drag preview, point/endpoint editing, and one-history-entry undo/redo.
- [x] Exact straight-line length change with **Start / Center / End** fixed and preview; point insertion and exact A/B distances, including Bézier arc-distance placement; explicit creation of intersection points.
- [x] Cubic Bézier edge bending, independent handles, exact de Casteljau split, adaptive arc-length measurements, and straighten/reset operations.
- [x] Editable text, arrow, grainline, fold guide, and drill-point **visual marks**, including selection, movement, rotation, undo, and persistence. These are **not yet** piece-/edge-attached manufacturing semantics.
- [x] Debounced, ordered IndexedDB autosave; latest project restore; manual save; lossless JSON export; Zod-validated JSON import; schema v1/v2 migration to current schema v3.
- [x] Existing unit tests and CI checks. **Not equivalent to browser or end-to-end verification.**

**Current limitations to respect:** closed polylines are drafting paths, not `PatternPiece` objects; most marks are standalone annotations; no production cut contour, SVG/PDF output, project browser, installed/offline PWA, or Playwright suite yet. Preserve and migrate all existing schema-v3 projects when extending the model.

---

## M0. Finish application shell and command architecture [P0]

### M0.1 Command consistency

- [x] Centralize **every** menu/toolbar/inspector/shortcut action behind one command registry: stable ID, label, enabled predicate, shortcut display, and execute function. Reuse existing command/history infrastructure rather than adding a second implementation. Completed 2026-11-08 for implemented actions, including context menus and dialog apply/cancel. Registry bindings recheck availability at execution, preserve the existing keymap and document/history operations, and share exact insertion across straight/curved inspectors. Automated command coverage passes; browser checks for menu/toolbar/inspector parity and input/dialog precedence remain pending in README.
- [ ] Finish `File`, `Edit`, `View`, `Pattern`, `Tools`, and `Help` action wiring. No dead menu items, placeholder dialogs, or duplicate handlers. Hide features until implemented.
- [ ] Route project actions (new, open, rename, save, import, export, delete) and geometry/piece actions through the same action paths; apply Mantine confirmations only to destructive non-undoable operations.
- [ ] Add contextual help/shortcut reference with the **actual** active keymap. Preserve implemented keys `V`, `L`, `P`, `R`, `C`, `X`, `H`, Space+drag, undo/redo, select-all, and save. Resolve conflicting suggestions in the specs by keeping working bindings stable and documenting changes, never silently rebinding them.
- [ ] Enforce input/dialog precedence: no tool shortcuts while typing; Escape/Enter/Backspace act on the current draft or dialog before any global action; focus returns sensibly after commit/cancel.

### M0.2 Workspace state and interaction feedback

- [ ] Persist inspector visibility/width and reset-layout option. Verify desktop resizing and mobile drawer transitions across reloads.
- [ ] Confirm menu, toolbar, inspector, status bar, and selection controls share Mantine's theme, compact sizing, meaningful tooltips, focus/disabled/error states, and Lucide-only icons.
- [ ] Keep the canvas dominant at desktop, tablet, and phone widths; no glass surfaces, gradients, second design system, oversized cards, or floating IDE-style docking.
- [ ] Make pointer cursor states specific to selectable edge, point, drag, bend, pan, invalid operation, and active snap. Avoid hover-only or right-click-only commands.
- [ ] Show reliable dirty/saving/saved/error status and actionable storage-failure feedback; don't spam autosave notifications.

**M0 gate:** all visible controls execute a real command; shortcuts cannot corrupt numeric editing; inspector settings survive restart; app shell remains consistent at wide and narrow widths.

## M1. Finish precision drafting interactions [P0]

### M1.1 Smart snapping, guides, and movement

- [x] Add **live intersection snapping during drawing/editing** (line/line, line/cubic, cubic/cubic as supported), distinct from the already implemented `Create points at intersections` command. Completed 2026-11-08: exact solver coordinates with endpoint > intersection > midpoint priority, safe overlap skipping, transient previews, stable deduplication, and single-edge Add point insertion. Automated tests pass. Headless Chromium checks confirmed live labels for line/line, line/cubic, cubic/cubic and tangency; exact line/line click commit; Alt/Snap-off bypass; 8 px mouse pickup at 2×/4× zoom; endpoint priority; one-edge Add point split with undo/redo; pan and Shift 45° behavior. Touch, dense-drawing and the remaining interaction checklist remain pending.
- [ ] Add snap hysteresis and deterministic priority among overlapping candidates; offer cycle/choice for genuinely ambiguous targets. Existing exact vertices and intersections win over grid.
- [ ] Add 45° and perpendicular smart guides where geometrically meaningful, plus snap-to-guide and guide-intersection support. Do not make distant unrelated edges magnetic.
- [ ] Add horizontal/vertical rulers with draggable, lockable, hideable, deleteable guides; support exact guide positions and offsets in mm. Keep view/ruler styling independent of geometry.
- [ ] Make snap label and marker consistent for endpoint, midpoint, intersection, guide, grid, and on-edge candidates. Existing silent grid snapping must remain subtle but distinguishable when active, as agreed by the specs.
- [ ] Allow configurable physical grid spacing and snap modes. Snap acquisition remains screen-space (~8px pointer / ~16px touch starting values), not rounded document geometry.
- [ ] Apply snapping to **moving points, edges, and pieces**, not only creation. Add X/Y delta preview, axis-lock movement, numeric move, and keyboard nudging (with selectable step).
- [ ] Ensure typed dimensions override incompatible snap candidates. Keep `Alt` temporary bypass and show feedback when snapping is disabled.
- [ ] Detect/warn about invalid contour self-intersections (including where supported single-cubic self-crossing); never partially commit unresolved/degenerate geometry.

### M1.2 Live dimensions and numeric editing

- [ ] Show affected adjacent lengths/angles during vertex and handle movement; on line/piece movement show delta X/Y. Avoid displaying every dimension at once.
- [ ] Make dimension labels clickable/tappable for direct numeric editing; Enter on a single selected edge should focus its relevant length control.
- [ ] Support units in typed values (`125 mm`, `12.5 cm`) with unambiguous conversion to canonical mm. Display up to a sensible number of decimals but never round stored geometry.
- [ ] Remember and clearly display the last-used **Start / Center / End** length anchor. Visually label A/B endpoints; preserve connected geometry when one moves.
- [ ] Improve numeric-entry focus/commit/cancel behavior in drafting tools, including keyboard-first exact length/angle input, preview, and one undoable commit.
- [ ] Display start/end distance and percent on split hover; add `Split at %`, `Divide into N equal segments`, and `Divide every N mm`, in addition to existing exact A/B distance and midpoint insertion.
- [ ] Make A/B or center origin of split explicit. Reject endpoint duplicates, invalid/zero segments, and over-dense divisions without mutating the document.
- [ ] Add canvas-edge auto-pan during long drafts/drags without altering mm geometry. Make double-click/Enter finish behavior predictable and prevent duplicate points.

### M1.3 Curves that are easy to edit

- [ ] Add point modes `Corner / Smooth / Symmetric`, with linked tangents where appropriate. `Alt` can temporarily decouple handles; existing independent-handle behavior remains available.
- [ ] Support creating a curved point by dragging during line/polygon creation; preserve the current direct drag-to-bend route.
- [ ] Keep handles focused on the active point; provide `Smooth point` and `Convert to straight` commands in context/inspector.
- [ ] Show arc length vs chord clearly and ensure any numeric curve edit labels the exact quantity it changes. Do **not** claim arc-length editing if only the chord is modified.
- [ ] Warn if a bend makes a closed contour invalid or later makes a seam offset impossible. Cancel must restore original geometry and one bend must create one history entry.

**M1 gate:** at any zoom, users can draw a numeric 120 mm line, change it to 150 mm with each anchor, split a cubic by arc distance without changing its shape, snap without jitter, and undo each completed gesture in exactly one step.

## M2. Turn drafting paths into garment pattern pieces [P0/P1]

**Dependency:** finish a stable `PatternPiece` model before sewing metadata, cut offsets, or piece printing. Do not treat a text label as a pattern-piece record.

### M2.1 Piece topology and transforms [P0]

- [ ] Introduce explicit, typed, versioned `PatternPiece` entities containing ordered **closed stitching outlines**, stable point/segment IDs, internal paths, transform, and metadata. Leave free/open drafting paths valid outside pieces.
- [ ] Define and enforce closed-contour winding, connected edges, point/segment identity, degenerate contour rejection, and self-intersection warnings with tested tolerance.
- [ ] Add a deliberate `Create piece from closed path` flow (and optionally create a piece directly when closing a polygon); never auto-convert every closed annotation.
- [ ] Piece selection, rename, select/move/rotate, duplicate, mirror, lock, hide/show, and fit-selection. Multi-piece transforms must preserve relative positions. Warn before any explicit non-uniform scaling.
- [ ] Add piece bounds, width/height, position, rotation, and status to the inspector. Select an individual vertex/segment without losing its parent piece identity.
- [ ] Preserve shared endpoints and attached dependents when reshaping; don't tear a closed outline during exact length edits or split operations.
- [ ] Implement schema-v4+ migration from current v3, preserving loose paths and existing standalone marks. Don't mutate a v3 project into a piece based on guesswork; reject unsupported newer schemas with a recoverable error.

### M2.2 Sewing roles, markings, and metadata [P1]

- [ ] Add edge roles: seam/stitch, hem, raw edge, **on fold**; distinguish canonical stitch outline from derived cut outline.
- [ ] Add internal path roles: construction, dart, fold, stitch, placement. Allow open paths, role-specific styles, visibility, and exports. Construction paths must not become cut boundaries.
- [ ] Upgrade existing grainline and fold _visual marks_ into optionally piece-/edge-attached records; keep legacy free annotations editable. Fold edge default allowance is **0 mm**.
- [ ] Add piece fields: name, size, fabric, quantity to cut, on-fold, mirrored pair, notes, optional version. All metadata survives save/reopen and can print when enabled.
- [ ] Add **edge-attached notches** by segment ID plus normalized location/arc distance and notch style. Moving/splitting another edge must not silently detach a notch; migrate attachment when its own edge splits.
- [ ] Add editable darts with apex, legs, intake, and depth. Preview edits, preserve valid topology, and display meaningful dimensions. Distinguish dart representation from mere drawn lines.
- [ ] Support mirror/unfold around a designated fold edge; preserve notches, grainlines, and derived cut geometry. Make cutting semantics explicit rather than merely duplicating a visual path.
- [ ] Add ellipse drafting if still needed after core piece workflows; keep it under a shape submenu, not as a permanently visible toolbar button.

**M2 gate:** close an outline into a named piece; select, rotate, mirror, duplicate, and edit it without breaking its loop; attach a notch/fold/grainline; save/reopen with metadata intact.

## M3. Seam allowance, cut geometry, and actual-size export [P0]

### M3.1 Real, non-destructive seam offsets

- [ ] Add a seam-allowance property per piece, in **mm**, initially uniform; support per-edge overrides and miter/round/bevel joins after the uniform engine is reliable.
- [ ] Compute the **cut outline** as derived geometry from the untouched **stitching outline**. Never fake allowance using SVG `stroke-width` or move the source seam to make the cut line.
- [ ] Handle straight edges and cubic curves with documented approximation bounds or a verified geometry library; confirm actual API support before adopting Paper.js or an offset library.
- [ ] Support convex/concave corners, acute joins, correct outward side for either winding, close curves, zero-width fold edges, and safe errors for impossible/self-crossing offsets. Avoid unbounded miter spikes.
- [ ] Show live offset preview and width controls; allow separate Stitch / Cut / Both visibility. Changes to source geometry recalculate cut geometry deterministically.
- [ ] Keep derived contours out of editable canonical document data and out of undo history except for the user action changing source settings. Cache only if invalidation is correct.
- [ ] Unit-test rectangle and mixed curve/line fixtures; cover near-degenerate cases, closed-contour validity, extreme sizes, and repeated save/undo/redo.

### M3.2 Vector SVG export

- [ ] Add `src/export/svg.ts` generated from the canonical model (not screen SVG/viewport state), with physical `width`/`height` in mm, correct `viewBox`, and preserved cubic/vector paths.
- [ ] Export selected piece or all pieces, with optional cut/stitch/marks/internal construction layer visibility. Exclude transient handles, snap overlays, and selection adornments.
- [ ] Test SVG physical dimensions, escaping of annotation text, rotations/transforms, and import-independent rendering in a standard viewer.

### M3.3 Exact-scale vector PDF and A4 tiling

- [ ] Add and pin `pdf-lib`; build export logic in `src/export/pdf.ts` and `src/export/tiling.ts`. Never rasterize a screenshot or infer physical size from CSS pixels.
- [ ] Map mm to PDF points using **`72 / 25.4`**, with explicit page orientation and Y-axis transformation. Support **one large sheet** and **tiled A4 (210 × 297 mm)** in portrait/landscape.
- [ ] Separate physical page size, printable margins (default about 10 mm), tile overlap (default about 10 mm), clipping, and registration crosses. Number sheets in deterministic row-major order.
- [ ] Include a **100 × 100 mm calibration square** and 100 mm reference ruler (a secondary 50 mm square is fine); include `Print at actual size / 100%` and `Disable Fit to page` instructions.
- [ ] Maintain uninterrupted cut/stitch paths through tile boundaries with visible alignment marks; never silently shrink pieces to fit a page or draw critical lines only in unprintable margins.
- [ ] Provide export toggles for stitch, cut, fold, grainline, notches, darts, text, and guides where applicable. Ensure paper positions and annotation sizes use mm-based geometry.
- [ ] Unit-test PDFs by inspecting vector coordinates/page transforms, not pixel screenshots; compare a 120 mm line, 100 mm square, curved path, and 5 mm allowance across different zoom levels.
- [ ] Document that printer-driver scaling may still affect actual physical paper; user must measure the test square after printing.

**M3 gate (critical vertical slice):** create a `180 × 240 mm` wallet panel, apply uniform `5 mm` outward mitered allowance, verify **`190 × 250 mm`** cut bounds, export across A4 tiles at 1:1, and verify the calibration square in the PDF coordinate system. Zoom, theme, display units, and inspector width must not affect the output.

## M4. Safe local projects and offline use [P0/P1]

### M4.1 Project manager and persistence safety [P0]

- [ ] Add a project browser for all saved IndexedDB projects: create, open, rename, duplicate, delete with confirmation, and a clear most-recently-edited listing. Existing latest-project restore remains the default quick start.
- [ ] Persist project-local settings (display units, snap toggles, last active project) and workspace settings (theme/inspector layout), using appropriate small preference records.
- [ ] Add optional recovery checkpoints for last known good committed states, plus a restore flow after a crash/storage error. Never treat an unfinished drag as committed work.
- [ ] Guard against cross-tab editing of the same project. Detect stale revisions; refuse silent last-writer-wins overwrites and offer recover/export options.
- [ ] Test ordered saves under rapid edits/switches, IndexedDB quota failures, corrupted stored documents, failed imports, and migrations. Preserve the in-memory document and offer JSON export if persistence fails.
- [ ] Request persistent storage via `navigator.storage.persist()` where supported, explain refusal/eviction risk, and don't promise permanent storage.
- [ ] Verify `Ctrl/Cmd+S`, project switching, and close/reload transitions preserve committed work. Warn before leaving if there are **uncommitted** edits that cannot yet be saved; don't rely on asynchronous `beforeunload` writes.

### M4.2 Installable offline PWA [P1]

- [ ] Add and configure `vite-plugin-pwa`, manifest, appropriate app icons, and a conservative built-asset cache strategy over trusted HTTPS.
- [ ] Verify cold startup after initial installation/cache, fully offline editing, project reopening, and JSON backup without network access.
- [ ] Prompt on new service-worker versions; **never auto-reload while an edit is in progress**. Commit/safeguard state before accepting an update.
- [ ] Test storage migration and offline version updates; recover safely on service-worker or quota errors.

### M4.3 Reference images [P2, unless needed for an immediate workflow]

- [ ] Store original PNG/JPEG file blobs as separate IndexedDB assets, not embedded base64 in every document snapshot.
- [ ] Import into a lockable/translucent/rotatable reference layer; calibrate using two points with a known physical distance.
- [ ] Offer four-corner perspective correction for angled photos, warnings about distortion, and tracing with existing line/curve tools. Do not claim uncalibrated photos are to scale.
- [ ] Exclude reference bitmaps from manufacturing exports by default, with optional review underlay.

**M4 gate:** create two projects, switch between them, close/reopen the app, import/export safely, survive a deliberately corrupt project without losing the current one, then reopen/edit a previously cached project while offline.

## M5. Browser acceptance, mobile usability, and release hardening [P0/P1]

### M5.1 Browser and touch behavior [P0]

- [ ] Add `@playwright/test`, an explicit `test:e2e` script, deterministic fixtures, and a CI job or separate manual browser-verification checklist where browsers are unavailable.
- [ ] Verify live desktop interactions in at least Chromium and one other available engine: selection, Shift-drag, box select in both directions, edge menus, numeric previews, window dragging, Escape/pointer-capture cancellation, and input-focus shortcut safety.
- [ ] Verify mark creation via empty-space context menu and mobile equivalent; edit long text, rotation, mixed selections, group drag, cancel preview, save/reopen.
- [ ] Add two-finger **pinch zoom + pan** while maintaining one-finger draw/select controls; prevent browser page scroll from fighting the editor.
- [ ] Provide a touch alternative to right click, keyboard modifiers, tiny hover-only controls, and overlapping-target selection; enlarge hit areas (about 44 CSS px for main controls) without enlarging model geometry.
- [ ] Verify bottom/side Properties drawer and numerical keyboard behavior at phone width, in landscape, with safe-area insets and `100dvh`; never cover an active field with the keyboard if avoidable.
- [ ] Test touch long-press/`⋯`, crowded vertices and curve handles, and accuracy while zooming in/out. Don't introduce special features that only work with a mouse.
- [ ] Test basic screen-reader labels, tab order, keyboard focus, reduced motion, high-contrast states, and visible error messages.

### M5.2 Quality gates [P0]

- [ ] Expand Vitest fixtures for geometry invariants, arc length, offsets, self-intersections, split stability, marks, schema upgrades, and unit conversions.
- [ ] Add Playwright tests for project workflows, actual numeric input, undo/redo, printing options, mobile layout, and save/reload; test storage failures and bad JSON without losing in-memory work.
- [ ] Run `npm test`, `npm run lint`, `npm run format:check`, and `npm run build` in CI for every scoped change; resolve build warnings where meaningful without blind dependency upgrades.
- [ ] Review screenshots at desktop, tablet, and phone widths against the UI spec. Ensure the same Mantine behavior and consistent tooltips, spacing, icons, and semantic drawing colors.
- [ ] Keep the README, shortcut reference, schema version notes, and `TODO.md` synchronized with what actually shipped. Track manual browser gates separately if automation is temporarily unavailable.

**M5 gate:** a new user can complete the wallet workflow and basic piece edits on a desktop; on a phone they can draw, select, pan/zoom, open properties, type precise measurements, save and export without a physical keyboard.

---

## Exact acceptance fixtures (must pass before calling v1 complete)

| ID  | Test                                                                      | Expected result                                                                                |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A01 | Draw `(0,0)` → `(100,0)` mm                                               | Shown as `10 cm`; exact 100 mm in the model.                                                   |
| A02 | Change 100 mm edge to 120 mm, A fixed                                     | A=`(0,0)`, B=`(120,0)`.                                                                        |
| A03 | Same original, B fixed                                                    | A=`(-20,0)`, B=`(100,0)`.                                                                      |
| A04 | Same original, center fixed                                               | A=`(-10,0)`, B=`(110,0)`.                                                                      |
| A05 | Repeat A02-A04 on vertical/diagonal edges; zoom 25%-400%                  | Correct geometry regardless of viewport, inspector, theme, DPI, and units.                     |
| A06 | Split a cubic at half its **arc length** and another at 30 mm from A      | Original shape and total arc length preserved within documented numerical tolerance.           |
| A07 | Drag a curve, cancel with Escape, then commit and undo                    | Cancel makes no model/save change; one bend means one history entry.                           |
| A08 | Drag near an endpoint, then hold Alt; test two candidate snaps            | Exact stable snap with visible reason; Alt bypasses; no unpredictable jitter.                  |
| A09 | Closed `100 × 100 mm` stitch square + `5 mm` miter allowance              | Stitch stays 100 × 100; cut becomes 110 × 110 mm.                                              |
| A10 | Closed `180 × 240 mm` panel + `5 mm` miter allowance                      | Cut contour bounds 190 × 250 mm; edit/reload/undo maintains correct derivation.                |
| A11 | One edge marked on fold; remaining edges +10 mm                           | Fold edge allowance is zero, other edges stay 10 mm; print has correct fold mark.              |
| A12 | Notch 25/30 mm along a reference segment; dart 20 mm intake, 100 mm depth | Attached IDs survive unrelated edits and reload; related edits update correctly.               |
| A13 | Export vector SVG + 1:1 large-sheet/tiled A4 PDF                          | No rasterized pattern, page scale `72/25.4` pt/mm, repeatable registration/overlap/page order. |
| A14 | PDF calibration square and 120 mm line                                    | Exact PDF vector coordinates; physical print must be checked with ruler at 100% settings.      |
| A15 | Rapid autosave, project switch, corrupted JSON, quota error               | No old revision overwrites new one; current geometry preserved; recoverable feedback.          |
| A16 | Cached PWA offline launch, edit, reload, update available                 | Offline persisted work restored; update cannot silently discard an active edit.                |
| A17 | Narrow phone viewport with touch                                          | Pan/pinch, edit points, open actions/drawer, type length and export without hover/right-click. |

**Numerical policy:** work in unrounded mm with documented geometry tolerance (target ≤0.05 mm for relevant computed fixture comparisons; more precise where algorithms allow). Screen hit radii are separate from model tolerances. Physical print tolerance depends on hardware and driver settings.

## Later: non-blocking improvements [P2 / Later]

- [ ] Persistent Points of Measure (POM) paths, measured seams and edge-pair mismatch display; advanced numeric coordinate editing and guide offsets.
- [ ] Linked/symmetric editing and garment workflow enhancements once duplicate/mirror/unfold are reliable.
- [ ] Optional searchable command palette (`@mantine/spotlight` only after registry), shortcut remapping, and optional clearly labeled CLO-like preset. The existing simple bindings remain default unless explicitly migrated.
- [ ] Additional advanced construction: dart pivot/trueing, pattern measurements, configurable sizing/grading, nesting/fabric utilization, and specialized garment blocks **only when actual users need them**.
- [ ] Standards-conscious DXF interchange and external image/SVG/PDF tracing/import with explicit units. These are not required to ship true-size PDF output.
- [ ] Multi-document tabs and advanced layout organization only after the one-document workflow is solid.

## Out of scope for initial releases

Do **not** add a backend, accounts, cloud sync, collaborative editing, analytics, billing, AI-generated patterns, giant template marketplace, generic CAD constraint solver, 3D avatars/draping, simulation, texture/shader tools, video/animation, custom glass UI, Tailwind/shadcn, a second icon system, screenshot-to-PDF, or a toolbar crowded with unavailable features. These are not missing P0 tasks.

## Agent handoff / definition of done

For each implementation PR or coding-agent increment:

1. Read both specs, especially builder §13, and the relevant code before changing architecture. Check whether the behavior already exists in a partial form.
2. Name the checkbox IDs/section(s) being addressed and the dependency they unlock. Keep the change focused; don't complete unrelated backlog items by assumption.
3. Model geometry in mm, preserve shared identities and previous schemas, make in-progress previews transient, and commit exactly one undoable action per logical edit.
4. Add deterministic geometry/unit/persistence tests. For interaction work, include browser/e2e coverage or identify the manual browser cases that could not be executed.
5. Run the four project checks (`npm test`, `npm run lint`, `npm run format:check`, `npm run build`) on Node 22.12+; document any environmental inability rather than marking an unrun check passed.
6. Exercise cancellation, invalid input, undo/redo, reload, and export. A failed operation must not corrupt or silently discard geometry.
7. Update documentation and check off only verified behavior. **Keep the two original specification files unchanged.**

**Release criterion:** a person can create and edit precise 2D pieces, make basic curves and marks, define stitching/cutting behavior, save/reopen locally, and export a trustworthy 1:1 A4 vector pattern. All critical interactions must remain usable without learning obscure shortcuts.
