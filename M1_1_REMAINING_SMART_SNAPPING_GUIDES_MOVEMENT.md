# patterAki: finish M1.1 smart snapping, guides, and movement

> **Instructions for the coding agent.** Implement **all remaining unchecked tasks in `TODO.md` → `M1.1 Smart snapping, guides, and movement`** in the existing patterAki application. Deliver working code, meaningful automated tests, documentation, and accurate TODO updates. Do not stop after making UI controls.
>
> **Repository:** <https://github.com/anlaki-py/patterAki>  
> **Companion document:** `M1_1_LIVE_INTERSECTION_SNAPPING.md`. That document covers **only** the first M1.1 checkbox (live intersections of existing line/line, line/cubic, cubic/cubic segments). **Do not duplicate its implementation here.** Use its intersection candidates in the unified snapping system, if available.
>
> **Written:** 2026-11-08. **Reinspect the current checkout first.** Paths and code responsibilities below were checked against `master` during preparation; newer commits are authoritative. Do not revert recent changes or mark implemented work as incomplete merely because this guide shows an older state.

## 0. The exact checklist and scope

**These are the eight tasks this document covers. Keep the first live-intersection task separate.**

- [ ] M1.1-B: Snap hysteresis, deterministic priority, and deliberate candidate cycling/choice. Existing exact vertices and intersections beat grid.
- [ ] M1.1-C: 45° and perpendicular smart guides, snap-to-guide, and guide intersections without distant magnetism.
- [ ] M1.1-D: Horizontal/vertical rulers and draggable, lockable, hideable, deleteable guides, including exact position/offset in mm; ruler styling must not change geometry.
- [ ] M1.1-E: Consistent marker/label for endpoint, midpoint, intersection, guide, grid, and on-edge snaps; grid remains subtle but identifiable.
- [ ] M1.1-F: Configurable _physical_ grid spacing and per-type snap modes; pickup is measured in screen pixels.
- [ ] M1.1-G: Snapping while moving vertices, selected edges, and groups/pieces; delta preview, axis lock, numeric translation, and configurable keyboard nudging.
- [ ] M1.1-H: Exact typed dimensions override incompatible snaps; Alt bypass works; disabled snapping is visibly indicated.
- [ ] M1.1-I: Warn about invalid closed-contour self-intersections, including a single cubic crossing itself where supported; never partially commit invalid geometry.

**Not part of this assignment:** M1.2 editable dimensions, equal-distance edge division, auto-pan, M1.3 linked curve handles, seam allowances, real pattern piece modeling (M2), PDF printing, PWA, or unrelated visual redesign. However, ensure that M1.1 movement is prepared for M2 pieces, and clearly document the temporary dependency described below.

### Completion rule for the piece dependency

The original M1.1-G checkbox mentions **pieces**, but the reviewed schema still stores **points/segments/annotations**, not `PatternPiece` objects. Implement translation and snapping for a vertex, a selected edge, multi-edge groups, and recognizable connected closed paths **now**, without pretending this creates true pattern-piece semantics. Reuse the exact same transform pipeline when `PatternPiece` objects become available in M2. If M2 has already landed when you work, add real piece selection/movement. **Do not check M1.1-G in full while its piece-movement part is absent; annotate the remaining dependency instead of falsely claiming completion.** Other M1.1 checkboxes can be checked individually when their own acceptance tests pass.

## 1. Required reading and safety rules

Read these files **before** changing code:

1. `AGENTS.md`, `README.md`, latest `TODO.md`.
2. `patternmaking_builder_spec_v2.md` §§2.1–2.4, 4, **13.1**, **13.7**, **13.8**.
3. `patternmaking_webapp_tech_stack_and_ui_spec.md` §§2–5, and the relevant tests.
4. The companion intersection guide and any files it changed.

Apply the project's existing rules:

- **All saved geometry is in millimetres** (`Vec2 = { x, y }`); conversions are for display/input only. No SVG pixel positions in the document.
- Snapping is a **pure, transient calculation**. Hovering, toggling a snap, cycling targets, dragging a ruler, or rendering guides must not silently create vertices or split edges.
- Immutable document operations. Preview without saving; validate; commit **one undo entry** per gesture; Escape/pointer cancellation restores the original state.
- Reuse **React + strict TypeScript + SVG + Zustand + Mantine + Lucide + Dexie + Zod + Vitest**. No second UI framework, coordinate engine, backend, or unnecessary dependency.
- Use the current command registry for menu/toolbar/keyboard actions. Do not attach a second set of ad-hoc global listeners.
- Keep the existing keyboard bindings. Input focus, dialogs, accessibility, and mobile alternatives take precedence over new shortcuts.
- Do not edit the original two specification files. Do not weaken tests or validation to turn CI green.

### Current code map (verify actual signatures in your checkout)

| Current file                                                            | What it does / what to extend                                                                                                                                                      |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/geometry/snapping.ts`                                              | `Snap`, `SnapGuide`, `snapPoint`, alignment priority. Extend candidate metadata and resolution; avoid duplicating ranking elsewhere.                                               |
| `src/editor/geometrySnaps.ts`                                           | Nearby edge midpoints, edge projections, alignment-on-edge. Add eligible geometry candidates here or in focused pure helpers.                                                      |
| `src/editor/resolvePointer.ts`                                          | Current snap gating (`Alt`, Snap toggle, `Shift`, pan, tool), ~`8/scale` mouse / `16/scale` touch mm pickup. Make it a caller of the unified resolver.                             |
| `src/editor/intersectionSnaps.ts`                                       | **If the companion guide is implemented**, supplies live intersection candidates. Preserve it.                                                                                     |
| `src/editor/EditorViewport.tsx`                                         | SVG viewport, pointer event routing, view `{x,y,scale}`, preview vs commit, grid rendering. Host rulers/guide overlay and shared snap preview without introducing a second solver. |
| `src/editor/SnapOverlay.tsx`                                            | Existing snap ring, transient alignment lines, label. Reuse for standardized feedback.                                                                                             |
| `src/editor/store.ts`                                                   | Document, selection, transient preview, snap/grid toggles, history. Add only focused UI settings or transient state needed here.                                                   |
| `src/editor/selectionDrag.ts`                                           | Selection-drag gesture and preview through `translateSelection`; extend its _translation calculation_, not its undo semantics.                                                     |
| `src/editor/useSelectionDrag.tsx`                                       | Wrapper and live ΔX/ΔY overlay. Ensure it displays the _applied_ snapped delta.                                                                                                    |
| `src/document/selection.ts`                                             | `translateEdges`, `translateSelection`: immutable translation of shared points, controls, annotations. Reuse for group moves/nudges/numeric move.                                  |
| `src/document/curves.ts`                                                | `moveVertex` moves attached cubic handles with a point. Use for individual vertex moves.                                                                                           |
| `src/document/segments.ts`                                              | Segment projection / cubic conversion. Reuse for on-edge/perpendicular candidates.                                                                                                 |
| `src/geometry/bezier.ts`                                                | Existing cubic math, axis parameters. Use for cubic/guide crossings, not polyline approximations.                                                                                  |
| `src/geometry/intersections.ts`                                         | Existing line/cubic intersection solvers. Reuse for geometric crossings/validation.                                                                                                |
| `src/document/schema.ts`                                                | Strict Zod schema; currently schema v3 in the reviewed version. New _persistent_ guides require an explicit migration.                                                             |
| `src/editor/commands.ts`, `src/editor/geometryCommands.ts`              | Shared command registry; add real menu/inspector/nudge/settings actions here.                                                                                                      |
| `src/editor/geometrySnaps.test.ts`, `src/editor/resolvePointer.test.ts` | Existing snapping tests. Extend, don't remove.                                                                                                                                     |

The reviewed baseline already has: endpoint/midpoint/on-edge/horizontal/vertical snapping, 45° **Shift constraint**, silent 10 mm grid snap, Alt bypass, vertex drag, group translation, and ΔX/ΔY on selected-group drags. **Refine these; do not reimplement them from scratch.**

## 2. Architecture: implement one candidate-and-resolution pipeline first

### Step 2.1 — Standardize candidates without breaking old callers

In `src/geometry/snapping.ts` (or a small adjacent pure file), extend existing `Snap` **compatibly**. Keep `point`, `label`, optional `guides`, `edgeId`, `t`, because the **Add Point** tool expects `edgeId/t`.

Recommended _internal_ candidate shape (adapt property names to actual code):

```ts
type SnapKind =
  | "endpoint"
  | "intersection"
  | "guide-intersection"
  | "midpoint"
  | "perpendicular"
  | "on-edge"
  | "guide"
  | "angle"
  | "alignment"
  | "grid";

type SnapCandidate = Snap & {
  kind: SnapKind;
  targetId: string; // stable across pointer-move frames
  priority: number; // lower = stronger
  selectable?: boolean; // can this tool actually use this target?
};

type SnapLock = {
  targetId: string;
  point: Vec2; // exact chosen target in document mm
  kind: SnapKind;
};
```

**Important:** This is an _internal_ design outline, not permission to overwrite existing types blindly. `Snap` currently returns `label: ""` for free movement and the renderer uses `label` for a visible ring. Keep existing public behavior unless deliberately upgraded in Step 6.

Stable identity examples:

- Endpoint: `point:<pointId>` (do **not** construct IDs from rounded coordinates).
- Midpoint: `midpoint:<edgeId>`.
- Existing segment intersection: stable ordered edge IDs + solver hit index / parameter; use the companion collector's ID or add metadata without changing its calculations.
- Edge projection: `edge:<edgeId>`; the **point changes** with pointer. Treat this as a _dynamic target_: hysteresis retains the edge identity, but recomputes its closest point from the current raw pointer, not from stale coordinates.
- Guide: `guide:<guideId>` (recompute projection during drag).
- Two guides: sorted IDs, `guide-cross:<idA>:<idB>`.
- Grid: integer grid indices at the configured spacing, e.g. `grid:<ix>:<iy>`.

Never use array index, unrounded `Vec2.toString()`, DOM nodes, or random IDs generated each frame as candidate identity.

### Step 2.2 — Define deterministic priority once

Recommended descending priority (tool-specific filtering comes **before** ranking):

| Rank | Kind                                        | Why                                 |
| ---- | ------------------------------------------- | ----------------------------------- |
| 1    | Existing endpoint / exact vertex            | Don't miss existing topology.       |
| 2    | Existing geometric intersection             | Exact crossing beats midpoint/grid. |
| 3    | Guide–guide or guide–edge intersection      | Exact construction reference.       |
| 4    | Midpoint                                    | Stable significant feature.         |
| 5    | Perpendicular foot on an eligible edge      | Meaningful anchored geometry.       |
| 6    | Ordinary on-edge / guide                    | Useful constrained placement.       |
| 7    | 45° / horizontal / vertical smart alignment | Relative guidance.                  |
| 8    | Grid                                        | Last resort before raw pointer.     |

For the **Add Point** tool, a candidate must identify one actual document segment **and** a valid `t` inside that segment; a free guide/grid point must not be advertised as insertable by itself. Where a crossing also lies on an edge, preserve `edgeId/t` so it can insert **on one selected edge only**. Do not auto-split or weld a second edge.

Candidate comparator:

1. Reject non-finite points or candidates outside pickup radius.
2. Reject candidates ineligible for the tool or snap mode.
3. Compare rank.
4. Within the same rank compare **raw-pointer distance** (not distance from previously snapped coordinates).
5. Ties: stable `targetId` lexical order, then a stable `t`/coordinate fallback.

**Make deterministic order testable as a pure function.** Object iteration order must never determine the winner. Ensure a crossing that is also the midpoint says `Intersection`, except when it is literally an existing vertex (then `Endpoint` wins).

### Step 2.3 — Snap hysteresis must use _raw_ pointer movement

- Acquisition: baseline radius `R = 8 CSS px` mouse / `16 CSS px` touch, converted to mm as `R / view.scale`.
- Release: hold the selected candidate until raw pointer distance is greater than **`1.5 × R`** (`12 px` / `24 px`, respectively) or the target disappears/becomes ineligible.
- A held **static point** keeps the same exact mm coordinates. A held **dynamic edge/guide** recomputes its projected target and must still satisfy proximity to the target geometry.
- Releasing Alt, changing tool/mode, committing, cancelling, switching project, zooming such that the candidate is no longer in range, or changing document geometry must revalidate/reset the lock.
- If a held low-priority candidate (e.g. grid) conflicts with a **much stronger exact vertex/intersection newly within a small near-hit radius** (recommend ~`0.4 × R`), let the strong exact target replace it. Document/test this explicit exception; otherwise hysteresis could make endpoints unreachable.
- A lock never outlives the current gesture/hover session in a way that makes a later click unexpectedly snap to an unrelated old position.
- No hysteresis when `snap=false`, Alt bypass is held, or pointer mode is pan/idle select.

**State placement:** Keep the lock in transient editor state (`useRef` in the gesture host or focused snap-controller hook). **Do not store it in `PatternDocument`, IndexedDB, or the undo stack.** Keep candidate generation/ranking as pure functions receiving `previousLock` and returning `{result, nextLock, nearbyChoices}`. This separation makes tests straightforward.

**Critical:** `resolvePointer` is currently a pure function used by tests. Prefer a backward-compatible optional `previousLock`/configuration parameter or a pure `resolveSnapping` helper. Do **not** hide state in a global variable: different editors/documents/tests must not share a stale snap lock.

### Step 2.4 — Explicit choice when candidates overlap

- If two or more **eligible distinct targets** are inside the pickup circle and have the same or effectively indistinguishable location/priority, display `1 of N` and let **Tab** cycle them. `Shift+Tab` may cycle backwards.
- Tab is intercepted **only** while a snap-target selection is actually active, canvas/drafting has focus, and no input/dialog/menu is focused. Otherwise Tab remains normal keyboard focus navigation.
- On every cycle, keep a stable target selection, display its reason/identity, and use it for the eventual click/release. Cycling must not create geometry or history.
- Provide a **touch-accessible** `Choose target` button/popover/list using Mantine whenever ambiguity exists; no keyboard-only essential action. Make the list meaningful (`Endpoint — point …`, `On edge — …`), not raw opaque IDs.
- If candidates overlap exactly but have **different geometric semantics** (e.g. two coincident edges), keep them separate for Add Point only if choosing the edge changes which edge is split. Deduplicate redundant preview points where semantics are identical. For ambiguous infinite overlaps, **do not invent a unique intersection**.
- If geometry changes while the chooser is open, close/revalidate it and never commit a stale target.

**Tests:** Two collinear/overlapping edges where Add Point could select either edge; two nearby vertices; three candidates with equal distances generated in opposite insertion orders; Tab/Shift+Tab; keyboard focus safety; touch choice; tool change resets. Confirm the chosen `edgeId/t` belongs to the displayed edge.

## 3. Smart angular, perpendicular, and guide snapping

### Step 3.1 — 45° smart alignment (without breaking Shift)

When a drawing operation has a meaningful active origin `O`, add optional angular guide candidates along **eight rays** from `O`: multiples of 45° (`0°,45°,…,315°`).

For each angle θ, let `u=(cosθ,sinθ)`, raw pointer `P`, `d=P−O`, `lengthAlong=dot(d,u)`, and `Q=O+max(0,lengthAlong)*u`. Only use `Q` when:

- `lengthAlong > 0` (the ray points toward the pointer),
- perpendicular screen distance `|cross(d,u)| × scale <= acquisitionPx`, and
- origin is actually active (not every document vertex within thousands of mm).

Label as `45°`, `Horizontal`, or `Vertical` where appropriate, and show the temporary guide from origin to `Q`.

**Existing Shift behavior stays stronger than magnetism:** when `Shift` is held during drawing, keep the hard nearest-45° directional constraint regardless of the snap toggle or Alt magnetic bypass. No candidate may silently move the endpoint off the constrained ray. Numeric length/angle input is still authoritative when committed. Do not make an idle canvas attracted to arbitrary imaginary diagonal lines.

### Step 3.2 — Perpendicular snapping to finite edges

This applies when the tool has a meaningful origin or anchor and the user is placing the other point. **Do not show random perpendicular feet when no reference anchor exists.**

For a straight edge A→B and origin O:

```ts
const ab = B - A;
const t = dot(O - A, ab) / dot(ab, ab);
const foot = A + t * ab;
```

- Require nondegenerate `AB`; require `t` inside `[0,1]` (do not turn an infinite-line foot outside the segment into an edge snap).
- Require the **raw pointer** to be within acquisition radius of `foot`, converted from CSS px to mm.
- Label `Perpendicular`; display a small 90° cue or simple origin→foot guide without inventing a new decorative component.
- If the tool is Add Point, include the chosen `edgeId` and `t`; do not pick a point off the edge.
- Exclude selected/moving edges and incident edges as needed to avoid self-snapping.

**Curves:** An ordinary nearest-point projection on a cubic is not automatically a 90° relation in every numerical approximation. For a cubic C(t), the mathematical perpendicular candidates satisfy `(C(t)−O)·C′(t)=0` for t within `[0,1]`. Reuse existing cubic projection/numeric-root facilities if they can robustly find all relevant roots. If not supported reliably, ship **perpendicular to straight segments** first, explicitly leave curve perpendicular unclaimed, and do not invent a fake result. Do not label a chord-based approximation `Perpendicular` to the curve.

### Step 3.3 — Persistent guides and intersections

Represent persistent guides as exact geometries in model mm:

```ts
type ConstructionGuide = {
  id: string;
  axis: "x" | "y";
  positionMm: number; // x=constant when axis='x'; y=constant when 'y'
  locked: boolean;
  visible: boolean;
};
```

Keep `positionMm` **finite** and within the same safe coordinate bounds as document points. A guide is a construction reference, **not** a sewing edge, `PatternPiece`, notch, or exportable cut stroke.

Implement snapping to:

1. A **visible eligible vertical guide** (`x = g`) by projecting raw P to `(g,P.y)`.
2. A **visible eligible horizontal guide** (`y = g`) by projecting raw P to `(P.x,g)`.
3. Vertical + horizontal guide intersection `(vertical.positionMm, horizontal.positionMm)`.
4. A guide intersecting an existing **finite straight segment** (solve its one coordinate; reject parallel/no-crossing cases).
5. A guide intersecting an existing **finite cubic**. Use `cubicAxisParameters(asCubic(...), 'x'|'y', positionMm)`; evaluate all valid roots with `segmentPoint`; filter `t` in `[0,1]`, finite, near pointer.
6. Where meaningful, an active 45° ray hitting a persistent guide; only keep the crossing on the ray in front of the active origin and within acquisition radius.

Reuse the tested existing real-segment intersection candidates from the companion guide. Do **not** use SVG path pixels or sample a curve at fixed intervals. Filter by screen-space proximity, and ensure an invisible guide never creates a snap. Locking prevents guide **movement**, not snapping to a visible guide.

**Ambiguity policy:** multiple guide/edge hits at the same point receive a deterministic ordering and are offered through the target chooser if the tool needs to select a particular edge. A parallel guide and edge with an overlapping interval do not form a unique `guide-intersection` target.

### Step 3.4 — Correct ranking and scope of references

- Endpoint/intersection priority from §2 still applies. Guide intersections beat ordinary on-guide/grid targets.
- Existing horizontal/vertical **remote** alignments may stay available per old tests. New **45° and perpendicular** candidates must have an active origin or selected local reference; they must not cause distant geometry to attract the pointer in unrelated directions.
- Grid is a fallback. Guides do not become magnetic outside the screen pickup radius.
- Moving a point should not use that point itself, its moving incident edges, or a group member as a candidate source.

## 4. Rulers and editable construction guides

### Step 4.1 — Persistence without mixing with cutting geometry

If the checked-out schema is still v3, add a **versioned v4 migration** for project guides. Suggested document field: `guides: Record<string, ConstructionGuide>` with an explicit Zod definition and validation for IDs/position. If `schemaVersion` has already advanced, create the next version rather than resetting/reusing an existing number.

Migration requirements:

- v1 → v2 → v3 → v4, preserving all existing points, segments, annotations, units and project name. v3 becomes v4 by adding `guides: {}`. Verify real import/restore paths, not just a standalone parser.
- Exported editable JSON contains the guides; importing the JSON restores them. Legacy v1/v2/v3 files remain importable without data loss.
- Reject bad guide axes, non-finite positions, duplicate/mismatched IDs and invalid versions; no partial import.
- All changes to guide **position, visibility, locking, creation, deletion** are one undoable document change each. Mere guide hover/drag preview is not an autosaved commit.
- Do not put viewport origin, ruler pixel measurements, temporary snap locks, or hover state into this schema.

**Potential alternative:** If a newer document model already has project-scoped guide data, reuse it and **do not add a second guide collection**. The essential contract is that guides are persistently project-specific, validated, undoable, and excluded from sewing/cutting geometry.

### Step 4.2 — Draw rulers in viewport CSS pixels

- Draw a **horizontal ruler along the top** of the workspace and a **vertical ruler along the left**, independent of the SVG geometry transform. They must not zoom as document strokes do.
- For a doc coordinate `xMm`, its viewport pixel is `xPx = view.x + xMm * view.scale`. Likewise `yPx = view.y + yMm * view.scale`.
- Reverse mapping is `(pointerPx − viewTranslationPx) / view.scale`. Use the SVG's bounding rect to convert `clientX/clientY` first.
- Scale ticks according to zoom with a readable 1/2/5 × 10^n step; show labels in the current display units, but compute positions from exact mm. Prevent thousands of DOM tick elements when zoomed far out; generate only ticks in the visible region.
- Show both negative and positive coordinates; default ruler origin is document `(0,0)`. Moving/resetting ruler origin is **not required** for this checkbox unless already implemented; do not silently change the document origin.
- Put ruler size in a single CSS variable/theme token. The SVG drawing area must not unexpectedly shift beneath existing geometry when rulers are toggled.

### Step 4.3 — Create and manage guides

Required actions:

1. **Drag from top horizontal ruler** into canvas to make a horizontal (`y=constant`) guide; **drag from left vertical ruler** to make a vertical (`x=constant`) guide.
2. Preview guide in a distinct nonprinting SVG style. Capture pointer, allow Escape/pointer-cancel to discard with no history entry. Commit one creation on release inside a valid workspace area.
3. Drag an **unlocked** existing guide handle/line to reposition. The previous guide remains unchanged during preview. Commit only on release. Locked guides cannot move, but can still be snapped to when visible.
4. Select a guide and edit **exact position in mm**, **Move/offset by Δ mm**, **Lock/Unlock**, **Show/Hide**, **Delete** in a compact Mantine inspector/context menu. Input/display may follow units chosen by the user, but values stored remain mm. Explicit mm labels are required when the control is mm-specific.
5. Expose `Show rulers`, `Show guides`, and `Snap to guides` as distinct settings (view visibility vs snap eligibility); hiding a guide must prevent its snap acquisition. A global "hide all guides" should not delete the saved guides.
6. On phone/tablet without precise ruler dragging, expose a **Create horizontal guide / Create vertical guide** numeric action (menu or inspector). Important touch actions need roughly 44px hit areas; not hover-only, not right-click-only.
7. Include an accessible label and visible selected/locked state. Do not let guide hit areas intercept geometry editing unless guide-edit mode/selection is active.

**Guide operation tests:** creation from each ruler, negative/mm positions, exact offsets, locking, visibility, deletion, undo/redo, import/export, project reload, pointer cancellation, responsive numeric alternative, change in view zoom without position drift.

## 5. Configurable physical grid and snapping modes

### Step 5.1 — Settings, not geometry

Keep the existing `snap` and `grid` toggles, but clarify that **grid visible** and **snap to grid** are distinct preferences. Implement one canonical settings shape, e.g.:

```ts
type SnapSettings = {
  enabled: boolean;
  modes: {
    endpoints: boolean;
    intersections: boolean;
    midpoints: boolean;
    edges: boolean;
    alignments: boolean;
    perpendicular: boolean;
    guides: boolean;
    grid: boolean;
  };
  mouseRadiusPx: number; // default 8
  touchRadiusPx: number; // default 16
  releaseMultiplier: number; // default 1.5
};
type GridSettings = {
  visible: boolean;
  snapEnabled: boolean;
  minorSpacingMm: number; // default 10, matching current grid behavior
  majorEvery: number; // default 5 (major = 50mm)
};
```

These names are examples. The important result is one source of truth; **do not keep an old `grid` flag silently fighting a new `gridVisible` state.** Use existing Zustand and the project's local persistence approach. Preferences are **local app settings** unless the current project model already defines document-scoped preferences. Apply sensible defaults to previously saved projects. Do not reset settings unexpectedly when changing tools.

Validation:

- All spacings finite and **strictly positive**. Recommended sensible configurable range: `0.1…1000 mm`; reject zero/negative/NaN/Infinity instead of creating an infinite grid.
- `majorEvery` positive integer, e.g. `1…100`.
- Mouse/touch radius positive and bounded (recommend `2…32 px` mouse, `4…48 px` touch); warn on invalid input rather than throwing from pointer move.
- Persist settings using existing Dexie/settings storage (or existing validated settings infrastructure); settings are not geometry and should not generate document undo entries.

### Step 5.2 — Exact snap math and rendered grid

For `spacingMm = s`, nearest grid candidate is:

```ts
const gridPoint = {
  x: Math.round(raw.x / s) * s,
  y: Math.round(raw.y / s) * s,
};
```

Only acquire it when `distance(raw, gridPoint) * view.scale <= pickupPx`; **do not globally round the pointer**. Keep the candidate in exact floating-point mm (no UI formatting/rounding before commit). Snap-to-grid off must not affect visible grid; grid hidden must not necessarily disable snapping if the user explicitly turned snap-to-grid on, but the status must make that configuration obvious.

Render minor/major grid consistently with `s` and `majorEvery`. At extreme zoom, suppress overly dense visual minor lines for performance/readability while keeping **logical snapping at the configured physical spacing**. Prevent grid aliasing and enormous DOM rendering. Never derive snap coordinates from CSS background pixels or SVG patterns.

Add a compact `Snap settings` UI using Mantine `Switch`/`Checkbox`/`NumberInput`. Include the main Snap toggle, per-mode toggles, grid spacing, and mouse/touch pickup. Keep this out of the primary toolbar except a concise control/popover.

**Tests:** default 10mm snapping, changed 5mm/2.5mm/1mm spacing, negative coordinates, zoom 0.5/2/10, invalid config rejection, grid visible versus snap-to-grid independently, disabled types, preference persistence.

## 6. Consistent preview and disabled feedback

### Step 6.1 — One visual language for snap reasons

Use `src/editor/SnapOverlay.tsx` to render the selected `SnapCandidate` consistently:

| Candidate              | Feedback                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Endpoint               | Small ring, label `Endpoint`                                                                                                  |
| Midpoint               | Same marker size/style, label `Midpoint`                                                                                      |
| Existing crossing      | Same, label `Intersection`                                                                                                    |
| Guide / guide crossing | Same, label `Guide` / `Guide intersection`; show relevant construction line                                                   |
| Perpendicular          | Same, label `Perpendicular`; simple right-angle cue or short guide                                                            |
| On-edge                | Same, label `On edge`                                                                                                         |
| 45°                    | Same, label `45°`; angle guide line                                                                                           |
| Grid                   | **Subtle** small dot/cross/tick, optional short `Grid` status text, **not** the same prominent ring as exact topology targets |

The reviewed code currently **removes `Grid` text** in `resolvePointer` and the overlay renders no marker when the label is empty. Preserve the quiet visual weight, but expose the **snap kind separately from label text** so active grid snap can be distinguished from unsnapped movement. A compact status indicator is enough; do not produce an intrusive popup on every move.

Render overlay geometry in document mm with `vectorEffect="non-scaling-stroke"` where appropriate, and marker radius/font offsets expressed as `px / view.scale`. Guide/ruler overlay pointer interception must be disabled except when actually editing guides. Keep label positioning clear of the target/cursor, with readable contrast in both themes. Don't put 20 measurements on screen.

### Step 6.2 — Snap-off / Alt feedback

- The main Snap switch must visually show ON/OFF. During a drawing or move gesture, holding **Alt** temporarily bypasses magnetic acquisition; show a quiet `Snapping temporarily off` status (or comparable compact indicator) so the cursor isn't silently behaving differently.
- Release Alt and reacquire from the current **raw** pointer. Clear any prior lock while bypass is active.
- Shift hard-angle constraint remains available, because it is a **direction constraint**, not magnetic snapping. Exact numeric dimensions retain priority even if Snap ON.
- Pan, idle Select, modal text entry, and guide/ruler drag are not to display unrelated geometry snap markers.

## 7. Snap movement, axis lock, numeric move, and nudging

### Step 7.1 — Use one immutable translation operation

For a **selected edge/group**, reuse `translateSelection(doc, selectedIds, delta)` in `src/document/selection.ts`. It already handles shared vertices and attached cubic handles. For an individual vertex, use `moveVertex(doc, pointId, newPosition)`.

**Do not** manually alter SVG `transform` attributes and treat that as moved geometry. **Do not** move shared points once per selected edge. **Do not** snap the moving objects to themselves.

For edge/group drag:

1. Snapshot `baseDocument`, selection, pointer start position `P0` and a stable **grab anchor** `A0` in document mm. Use the actual pointer/edge hit position as anchor so dragging doesn't jump. For selected group, the primary anchor can be the hit point on the selected edge; document the choice.
2. Each pointer move yields raw delta `Δraw = Pcurrent − P0`.
3. Target anchor before snapping = `A0 + Δraw`.
4. Resolve _eligible stationary_ candidate snaps near that target anchor, after excluding all selected geometry and points moving with it.
5. Compute applied delta `Δapplied = snappedAnchor − A0` (or the constrained unmagnetized delta).
6. Render preview as `translateSelection(baseDocument, selectedIds, Δapplied)`; show **applied** ΔX/ΔY, not misleading raw pointer delta.
7. Commit the last valid preview **once on release**; Escape/pointer cancel clears it. No autosave during move.

For vertex drag, resolve the moving point against the stationary scene, exclude incident edges where required, and `moveVertex(baseDocument, vertexId, resolved.point)`. Keep attached curve handles following their endpoint per existing behavior.

**Important shared-edge behavior:** selecting one edge moves its endpoint vertices, which may affect neighboring unselected edges. This is already how `translateEdges` behaves. Preserve topology and explicitly test the outcome. Later real piece movement will select all relevant piece geometry and use the same translate primitive.

### Step 7.2 — Axis-lock dragging

While moving a point or group, **Shift** locks movement to X or Y based on the dominant displacement after the existing drag threshold (~3 CSS px):

- If `|Δraw.x| >= |Δraw.y|`, lock Y delta to 0 (move along X).
- Else lock X delta to 0 (move along Y).
- Hold that axis for the current Shift-lock interval; don't oscillate when the cursor is near diagonal. Releasing Shift returns to unconstrained motion without adding a history entry.
- Constraint is applied **before** candidate acquisition; only snap candidates compatible with the locked axis may be chosen. Never change the locked axis to chase a nearby endpoint.
- If Shift is used during _drawing_, existing 45° behavior still applies. Do not reuse move-axis logic for line placement.

### Step 7.3 — Numeric translation

Expose a consistent **Move…** command through the current command registry and a compact Mantine modal/inspector panel with `ΔX` and `ΔY`, both documented in mm or current display units with clear conversion. Prepopulate `0`, permit negative and decimal values, validate finite bounded results, show preview, **Apply** to commit one history entry, **Cancel** to restore.

- Selected edges/groups: use `translateSelection`.
- Active vertex: use `moveVertex`. Add a transient selected-vertex ID / active point context if the editor currently only stores selected segment IDs; do not persist this UI selection as geometry.
- Selected annotations: preserve existing `translateSelection` behavior.
- Future `PatternPiece`: use its ordered member IDs to drive the same translation, and move associated marks appropriately once their attachment semantics exist.

Inputs must **never** round the final mm coordinates because the screen shows fewer decimals. The user should be able to move `+2.5 mm X, −3 mm Y` precisely and undo as one operation.

### Step 7.4 — Configurable keyboard nudging

Use the command registry's keyboard routing, respecting focused inputs/dialogs/menus and default shortcut precedence. Suggested defaults (from builder spec §2.3):

- `Arrow` = 1 mm.
- `Shift+Arrow` = 10 mm.
- `Alt+Arrow` = 0.1 mm.

Expose base step as a numeric Setting (default **1mm**); Shift multiplies by 10, Alt by 0.1. **Do not repurpose Alt while a pointer drag is active**: in a drag it bypasses snapping; in a keyboard nudge it selects fine step. A keyboard nudge must not snap to arbitrary candidates or drift due to zoom; it is an exact translation in mm. Choose and document undo grouping: one discrete keypress = one undo entry (safe starting rule). If key repeat is coalesced intentionally, it must be deterministic and covered by tests; never create dozens of autosaves for a single long-press without design.

**Movement tests:** vertex to endpoint/intersection/guide/grid; selected straight edge; multi-edge shared vertex moves once; cubic control handles translate exactly; self-snap exclusion; axis lock; Alt bypass; numeric decimals; negative nudges; typing in an input; Escape; pointer cancellation; drag commit is one undo item; undo/redo reconstruct original coordinates. Check stale target IDs after undo/edit.

## 8. Exact numeric dimensions take precedence

Audit **all** operations that accept typed lengths/angles (e.g. `src/editor/draftCommands.ts`, the `exactLine` action, rectangle dimensions, `changeLength`, point-placement controls):

- A typed `125 mm` must commit **125 mm**, even with a nearby 120 mm grid/endpoint. The endpoint is computed with `endpoint(origin, exactLengthMm, typedAngleDegrees)` or an equivalent exact geometry operation; **do not** run magnetic snap selection on that computed point after numeric confirmation.
- Exact width/height and numeric move ΔX/ΔY similarly take precedence over magnetic targets.
- For an incompatible explicit snap preview, keep the typed dimension authoritative, or show a clear conflict and ask the user to resolve it. Never silently adjust exact input.
- While the user edits a number, suspend tool letter shortcuts and Tab snap-cycling; `Enter` commits the current input rather than accidentally finishing another draft.
- Alt bypasses only magnetic snapping, not explicit numeric input or a hard Shift direction constraint.
- Use the current unit conversion (`unitFactor` or newer), validate non-finite/zero/negative length where inappropriate, and never round stored coordinates.

Tests: **125mm requested vs 120mm grid**, 18cm × 24cm rectangle near other geometry, exact angle, negative decimal numeric move, input-focus precedence, undo/cancel.

## 9. Closed-contour validation and atomic failure handling

### Step 9.1 — Define what must be validated

A **closed contour** is an explicitly closed drafting path (rectangle / closed polyline), or a recognized simple closed cycle of connected segments in an existing project. **Do not call every crossing of open construction lines an invalid pattern**. Open lines may intentionally intersect.

The reviewed schema lacks explicit `PatternPiece`/closed-path membership. Follow this rule:

1. If the checkout now has real closed-path/piece metadata, use it.
2. Otherwise validate a **new closed draft before `addPath` commits** and infer preexisting _unambiguous simple closed loops_ from the segment graph for edited geometry: every vertex on such a loop has degree two within the connected component, and segment IDs form one cycle.
3. If ambiguous/branched topology prevents reliable closed-contour identification, **do not silently certify it valid**. Display a specific warning and avoid destructive mutation; do not invent arbitrary edge ordering. Persistent closed-path metadata may be introduced in the next schema version if needed for correctness, but keep it separate from true M2 piece semantics and migrate old projects safely.

**Do not reject legitimate intersections between two separate contours** or construction lines merely because they cross in the same drawing.

### Step 9.2 — Implement a pure validation helper

Create a focused helper in `src/geometry/` or `src/document/` such as `validateContourGeometry.ts` / `contourValidation.ts`. It should produce a structured result, not a notification:

```ts
type ContourIssue = {
  code: "self-intersection" | "overlap" | "zero-length" | "unknown-topology";
  segmentIds: string[];
  point?: Vec2;
  message: string;
};
type ContourCheck = { valid: boolean; issues: ContourIssue[] };
```

Requirements:

- Validate finite coordinates and nonzero edges using the existing Zod constraints, **plus** geometry validity. Geometry invalidity must be discovered **before committing**, not only when `documentSchema.parse` throws afterwards.
- Check pairs of **nonadjacent** edges on the same closed contour using existing `lineIntersections`/`cubicIntersections`. Filter valid parameter ranges `[0,1]`, and flag internal crossings/tangencies/overlaps. Adjacent edges touching exactly at their intentional shared endpoint are allowed; overlapping beyond that endpoint is not.
- If two nonadjacent contour edges cross at an existing shared vertex or touch, do **not** automatically consider it valid: that usually indicates a self-touching contour. Explain and test the policy.
- Broad-phase bounds should reject distant edge pairs before expensive cubic–cubic computation; do not introduce `O(N²)` work on every idle pointer event.
- A single cubic can form a **self-crossing loop**. Pairwise edge testing alone cannot detect it. Add a dedicated cubic self-crossing check or use an existing well-tested one. Do not fake it by testing the curve's chord.
- Solvers may report ambiguous collinear or overlapping geometry. Treat unresolved overlap within **one contour** as invalid/needs correction; do not swallow the error and approve the contour.
- Tolerances must be explicit, deterministic, and much smaller than typical drawing dimensions. Distinguish numeric near-equality from visual CSS pickup radius.

**Suggested mathematical route for a single cubic (optional implementation aid, not blind copy/paste):** Write Bézier as polynomial `C(t) = a t³ + b t² + c t + d`, with vector coefficients. For distinct `t,u`, equality `C(t)=C(u)` implies `a(t²+tu+u²)+b(t+u)+c=0`. Set `s=t+u`, `q=t²+tu+u²`. Solve the 2×2 vector equation `a q + b s = −c` when `cross(a,b)` is well conditioned. Then `tu = s²−q`, and solve roots of `z² − s z + tu = 0`; require two **distinct** parameters in `(0,1)` and verify `distance(C(t),C(u))` is within a strict geometric tolerance. For nearly singular/collinear coefficient cases, handle explicitly (e.g. robust fallback or conservative ambiguous result), **not** by dividing by nearly zero. This is a derivation hint; test against known looping and nonlooping curves before trusting it.

### Step 9.3 — Check preview and commit at the right points

- **On closure:** validate the candidate closed draft **before** committing it. If invalid, show a non-spamming Mantine error with affected edge/point; keep the draft available for correction instead of partly committing a path.
- **On vertex/edge/group move:** compute preview from original document. If it makes an affected closed contour invalid, display a clear red invalid preview/indicator; **on pointer-up do not commit** an invalid preview. Restore original geometry and show one actionable warning. Do not spam toasts every frame.
- **On curve edit:** when a bend/handle change affects a closed contour, apply the same validation before final commit. M1.3 curve UX remains a separate task, but no invalid contour should be silently committed via the current curve tool.
- **Numeric move/nudge/length edit:** run the same validation before committing; reject the **entire** operation if invalid. Never commit the first of multiple selected edges and fail halfway through.
- **Undo/redo:** previously valid states should restore exactly; no new validation history entry on rollback.
- **Existing imported legacy invalid projects:** load safely if the schema accepts them, but flag invalid contours and prevent an unrelated edit from silently "fixing" them. Do not destroy existing data or rewrite the project during import. A migration is not a geometry repair pass.

**Useful tests:** bow-tie polygon; simple nonintersecting rectangle; adjacent edges sharing endpoint; nonadjacent touching; near tangent; overlapping same-contour segments; two separate crossing open lines (valid); two separate closed contours crossing (do not call each self-intersecting); self-looping cubic vs ordinary arch; zero-length attempted edit; move of a vertex that creates a crossing; invalid numeric move; cancellation and no partial history/autosave.

## 10. Recommended work order (finish one stable layer at a time)

Complete these steps in order; compile and test after each. **Do not implement every UI control first and geometry last.**

1. **Baseline:** inspect current checkout, read specs, run tests, identify existing live-intersection work. Preserve existing tests/shortcuts and record branch/commit locally.
2. **Snap model:** extend candidate metadata, deterministic priority, per-tool filtering, pure resolver and stable target identity. First get old snapping tests passing.
3. **Hysteresis/choice:** add pure lock logic, preview/commit state ownership, Tab and accessible target chooser. Add race/invalid-target tests.
4. **Settings/grid:** separate view-grid from grid-snap, implement spacing/modes/pickup preferences and persistence. Update rendered grid.
5. **Guides math:** 45° smart alignment, straight perpendicular, guide/guide and guide/line/cubic crossings, filtering and no distant magnetism.
6. **Document guides + migration:** validated persistent guide data, import/restore tests, immutable guide operations and undo/redo.
7. **Ruler UX:** pixel-aligned rulers, creation/selection/dragging, lock/show/hide/delete/offset, mobile numeric alternative.
8. **Visual feedback:** centralize marker/label semantics, subtle grid indicator, Alt/snap-off status and `1 of N` chooser.
9. **Movement:** reuse vertex and group translations with candidate filtering, axis lock, applied delta, numeric move, keyboard nudging and commands.
10. **Contour safety:** geometric validator with cubic self-intersections; integrate into all affected commit paths and invalid-preview handling.
11. **Regressions:** test all focused cases and run the full project checks; manually inspect desktop and touch where available.
12. **Documentation:** update README truthfully; mark only fully verified individual TODO items; report outstanding M2 piece dependency if it remains.

## 11. Automated test contract

Use Vitest; put tests next to their modules. Do not test only helpers: verify **`resolvePointer` → preview → commit/cancel** where an integration-level unit test is feasible. Add focused tests for view-coordinate/ruler mapping, guide persistence, and selection transforms. Recommended file names, if not already present:

- `src/geometry/snapping.test.ts`, `src/editor/snapController.test.ts`
- `src/editor/guideSnaps.test.ts`, `src/editor/guideOperations.test.ts`
- `src/editor/rulerMath.test.ts`, `src/editor/gridSettings.test.ts`
- `src/editor/selectionDrag.test.ts`, `src/document/selection.test.ts`
- `src/geometry/contourValidation.test.ts`
- Existing `geometrySnaps.test.ts`, `resolvePointer.test.ts`, document schema/migration tests.

### Minimum cases to add (use these IDs in test names or review notes)

| ID  | Test setup and expected outcome                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | Endpoint and intersection both within radius: correct rank; crossing that is also midpoint shows `Intersection`.                             |
| S02 | Multiple same-rank targets at equal raw-pointer distance in different insertion orders: identical winner.                                    |
| S03 | Acquire endpoint at 6 px, move to 10 px: retain; move to >12 px (mouse): release.                                                            |
| S04 | Grid held, raw pointer moves very close to exact endpoint: strong exact-target exception acquires endpoint.                                  |
| S05 | Dynamic on-edge lock follows pointer projection; no frozen old-coordinate snap.                                                              |
| S06 | Change geometry/undo/redo/Alt/Snap-off/tool: previous target lock invalidated or revalidated.                                                |
| S07 | Tab cycles 2+ valid candidates; Shift+Tab reverses; no history change.                                                                       |
| S08 | Tab while numeric field focused does not cycle; ordinary focus traversal remains intact.                                                     |
| S09 | A crowded Add Point target can choose edge A vs B; `edgeId/t` matches selected target.                                                       |
| S10 | Touch choice is accessible without a physical keyboard; selected candidate preview equals committed target.                                  |
| G01 | Active origin `(0,0)`, raw pointer near `(40,41)` snaps to 45° ray `(40.5,40.5)` within tolerance.                                           |
| G02 | No active origin: distant arbitrary 45° line does not magnetize the pointer.                                                                 |
| G03 | Shift hard-constrains 45° even when Snap off; typed exact length remains exact.                                                              |
| G04 | Finite horizontal line from `(0,50)` to `(100,50)`, anchor `(30,0)` gives perpendicular foot `(30,50)` if pointer near.                      |
| G05 | Foot outside finite line endpoints is not a perpendicular candidate.                                                                         |
| G06 | Vertical guide x=25 and horizontal guide y=40 snap at `(25,40)`.                                                                             |
| G07 | Guide x=50 intersects finite line; guide y=75 tangent to cubic arch (as applicable) gives one deduplicated exact candidate.                  |
| G08 | Guide hidden / guide snapping disabled: no guide candidate; locked visible guide still snaps.                                                |
| G09 | Overlapping/parallel guide-edge pair creates no fabricated unique intersection.                                                              |
| G10 | Candidate outside 8 px mouse / 16 px touch does not acquire, including at different zoom levels.                                             |
| R01 | x/y ruler ticks convert mm→px→mm correctly under pan, zoom, and negative coordinates.                                                        |
| R02 | Top ruler creates horizontal guide; left creates vertical guide; Escape/pointer-cancel creates nothing.                                      |
| R03 | Guide moves by exact +2.5mm offset, one history entry; locked guide doesn't move.                                                            |
| R04 | Hide/delete/undo/redo work; JSON export/import and old v3 migration preserve geometry.                                                       |
| R05 | Touch numeric creation and guide position edit are available without ruler drag.                                                             |
| V01 | Endpoint/midpoint/on-edge/intersection/guide markers and labels use common style; grid marker remains subtle.                                |
| V02 | Grid point has distinct kind even if its visible `label` is suppressed.                                                                      |
| V03 | Alt disables magnetic pickup, status changes, release restores; no irrelevant label during pan.                                              |
| F01 | Default grid 10mm, changed 5mm and 2.5mm, negative coordinates, no rounded saved geometry.                                                   |
| F02 | Visible grid off but snap-grid on; visible grid on but snap-grid off: independent behavior.                                                  |
| F03 | Invalid spacing/radii are rejected; saved settings reload with no stale old flags.                                                           |
| M01 | Drag unrelated vertex near stationary endpoint/intersection: preview and commit hit exactly the target.                                      |
| M02 | Drag selected edge/group near stationary target: applied Δ moves all selected points once and preserves attached cubic controls.             |
| M03 | Moving group never acquires its own vertices/edges/marks as snap targets.                                                                    |
| M04 | Start edge/group dragging at a nonvertex grab point: no visual jump at first move.                                                           |
| M05 | Shift axis lock chooses dominant axis, remains stable, and rejects incompatible off-axis snaps.                                              |
| M06 | Numeric ΔX=+2.5mm / ΔY=−3mm commits exact movement as one undo entry.                                                                        |
| M07 | Arrow/Shift+Arrow/Alt+Arrow default 1/10/0.1mm nudge; focus in input does not move anything.                                                 |
| M08 | Escape, pointer cancel, commit failure: document/history/autosave unchanged.                                                                 |
| M09 | Shared vertex on two selected edges moves once; neighboring unselected connected edges remain topologically connected.                       |
| M10 | Undo/redo after dragged, numeric, and nudged moves restores original mm coordinates exactly.                                                 |
| E01 | Exact typed 125mm line near 120mm grid remains exactly 125mm, with no post-input snap.                                                       |
| E02 | Exact-size rectangle and typed angle ignore incompatible endpoint/guide snaps; no silent rounding.                                           |
| E03 | Alt bypass and Shift direction constraint keep distinct roles during drawing and movement.                                                   |
| C01 | Ordinary rectangle and simple non-self-intersecting closed polyline validate.                                                                |
| C02 | Bow-tie closed contour is rejected before commit; draft remains editable.                                                                    |
| C03 | Adjacent edge shared endpoint allowed; nonadjacent self-touch/retrace rejected.                                                              |
| C04 | Closed contour with nonadjacent cubic/line or cubic/cubic crossing rejected.                                                                 |
| C05 | Single looping cubic with two distinct interior parameters crossing itself is detected.                                                      |
| C06 | Two intersecting _separate_ open lines are still valid; unrelated crossing closed contours are not misclassified as each being self-crossed. |
| C07 | Move/bend/numeric edit creating invalid contour is fully rolled back; no half-commit or extra history entry.                                 |
| C08 | Overlap, degeneracy, near-tangency, old/ambiguous topology produce a safe, actionable result without throwing during every hover.            |

**Test fixture precision rules:** The `scale` is CSS px per mm, not a model-scale multiplier. A raw pointer 9 screen px from a point must fail an 8 px mouse acquisition even if its mm distance changes with zoom. Expected geometry must be computed from analytic lines/curves, not rounded display labels. Avoid inadvertently putting a stronger endpoint into a test intended for a guide/grid candidate.

### Required regression checks

- The separate live-intersection guide remains correct: real line/line, line/cubic, cubic/cubic intersections; no implicit topology splits.
- Existing on-edge, midpoint, aligned-edge, Alt, Shift, exact length, point insertion, curve edit, undo/redo and JSON import tests pass.
- No temporary snap/ruler state gets persisted in JSON or saved as document edits.
- Existing schema v1/v2/v3 sample files still import and migrate correctly; no unknown-version relabeling or loss of annotations.

## 12. Manual browser acceptance checklist

Run `npm ci && npm run dev` using **Node.js 22.12+**. If browser interaction is available, verify:

- [ ] Create two close snap targets, move between them slowly. The marker doesn't jitter; Tab (or target chooser on touch) selects the intended one and click commits that exact target.
- [ ] Draw a line near horizontal, vertical, 45° and perpendicular targets; see transient smart guides, with no attraction to distant unrelated geometry.
- [ ] Create horizontal/vertical guides from rulers, set an exact coordinate and offset, lock, hide, delete; reload project and undo/redo. Test negative ruler positions and different zoom.
- [ ] Cross a straight edge and a cubic with a guide; choose the exact intersection. Hide the guide and verify it no longer snaps.
- [ ] Change grid spacing, turn grid drawing on/off independently from grid snapping, enable/disable individual snap modes. Labels are readable in light and dark themes; grid stays visually quieter than endpoints.
- [ ] Drag a vertex and a selected multi-edge group. Show applied ΔX/ΔY; Shift locks an axis; Alt bypasses magnets; movement does not jump or snap to itself. Undo reverts one drag.
- [ ] Use Move… and arrow nudges with decimal/negative values. The document coordinates actually change in mm. Typing in a form never nudges the canvas.
- [ ] Type an exact `125 mm` length near a 120 mm grid target; confirm stored length is exactly 125 mm and marker does not override it.
- [ ] Try to close a bow-tie polygon and bend/move an existing closed contour into a self-crossing. Invalid preview is visible, error is understandable, and no partial geometry/history is committed.
- [ ] On a phone/touch viewport, set guide coordinates and resolve ambiguous targets without mouse hover, right click, or a physical keyboard. Verify touch snap radius.
- [ ] Reopen a saved legacy project and current project; check guides, grid preferences, geometry, and no data loss.

If a browser or phone test could not be performed, **say `NOT RUN`**, not `PASS`. Do not assume CSS/mobile accessibility from a compiled TypeScript build.

## 13. Commands to run and quality gate

Run the following from the repository root, fix introduced failures, and rerun after formatting:

```bash
npm ci
npm test
npm run lint
npm run format:check
npm run build
```

If Prettier fails, use the project's formatting command (typically `npm run format`) on touched files, then rerun all checks. Preserve strict TypeScript, existing lint settings, and `package-lock.json` integrity. No ignored failing tests, no fake test results, no committed build outputs.

Performance sanity check: in a drawing with hundreds of mostly distant segments and a few guides, pointer hover/drag must stay responsive. Reuse spatial bbox filtering around the raw pointer before expensive curve solves. Don't enumerate all pairwise intersections and all ruler ticks every frame. Any cache must invalidate when immutable document geometry, guide positions, grid spacing or snap modes change.

## 14. Documentation and TODO updates

Update `README.md` with the **actual** implemented behavior: snap modes/priority and hysteresis, Tab/touch choice, angle/perpendicular/guide snapping, ruler/guide controls, grid settings, movement controls/nudges, numeric-vs-snap priority, invalid-contour warnings and limitations. Keep original spec files intact.

Check **only** those M1.1 TODO items whose behavior and relevant checks genuinely pass. Do **not** check the first intersection-snapping item unless the **companion guide** has been independently implemented and verified. Do not check movement for true pieces until actual `PatternPiece` selection/movement exists. If a feature is partially built, keep its checkbox unchecked and add a short factual sub-bullet explaining exactly what remains.

### Definition of done for each remaining checkbox

- **B:** stable deterministic resolver, hysteresis, Tab/touch target choice and tests.
- **C:** tested 45°/perpendicular + guide/guide and guide/edge crossing, finite-segment filtering, no distant magnetism.
- **D:** proper pixel-aligned rulers + exact persistent guide create/move/offset/lock/hide/delete with undo, schema migration, mobile alternative.
- **E:** coherent per-kind feedback including subtle detectable grid and disabled/Alt status.
- **F:** separately configurable validated grid spacing, grid view vs grid snap, snap modes and radius with persistence.
- **G:** tested vertex, edge, group/connected-path and (if available) **real pattern-piece** movement snaps, applied delta, axis lock, numeric move, keyboard nudge and undo/cancel safety. Keep open if real pieces do not exist yet.
- **H:** typed lengths/angles/position overrides magnets everywhere relevant, Alt bypass, disabled feedback, input focus safety.
- **I:** closed-contour pairwise and cubic self-crossing validation integrated into all affected edit/commit paths, no partial commits, tests.

### Final report required from the agent

```text
Implemented:
- [specific behavior, not generic 'snapping improved']

Files changed:
- [exact paths]

Checks:
- npm test: PASS/FAIL [test count if known]
- npm run lint: PASS/FAIL
- npm run format:check: PASS/FAIL
- npm run build: PASS/FAIL
- Browser manual checks: PASS / NOT RUN [reason]
- Touch manual checks: PASS / NOT RUN [reason]

M1.1 checkbox B: CHECKED / UNCHECKED [reason]
M1.1 checkbox C: CHECKED / UNCHECKED [reason]
M1.1 checkbox D: CHECKED / UNCHECKED [reason]
M1.1 checkbox E: CHECKED / UNCHECKED [reason]
M1.1 checkbox F: CHECKED / UNCHECKED [reason]
M1.1 checkbox G: CHECKED / UNCHECKED [explicit PatternPiece dependency if any]
M1.1 checkbox H: CHECKED / UNCHECKED [reason]
M1.1 checkbox I: CHECKED / UNCHECKED [reason]

Known limitations:
- [remaining tested/unverified cases; no fabricated completion]
```

**Do not call this task finished just because a settings dialog exists or tests compile. A user must see a predictable snap before editing, commit precisely the same coordinate, move geometry with one undoable action, and be protected against an invalid closed contour.**
