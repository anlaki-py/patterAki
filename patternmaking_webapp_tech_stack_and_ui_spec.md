# Patternmaking Web App: Technical Stack, UI System & Engineering Contract

**Status:** implementation specification for a coding/builder agent  
**Date:** 2026-11-07  
**Application type:** local-first, installable 2D sewing-pattern drafting web application  
**Companion document:** CLO 3D / Marvelous Designer 2D patternmaking controls, interaction and shortcut research  
**Priority order:** (1) ease of use, (2) measurement accuracy, (3) predictable native-software behavior, (4) maintainability, (5) visual polish, (6) minimum dependencies.

> **Read this first, builder agent:** Build a focused, professional patternmaking **tool**, not a landing page, dashboard, moodboard, illustration app, or general CAD package. The UI must use an established component library consistently. Do not invent a visual design language, custom buttons, random color palettes, glass effects, huge cards, decorative gradients, or feature-stuffed toolbars. Avoid premature backend and 3D work. The **document model and geometry engine** own the measurements; rendering does not.

---

## 1. Approved stack (decision, not a menu)

| Concern | Required choice | Job | Rules |
|---|---|---|---|
| Language | **TypeScript, strict** | All app, commands, geometry, storage, exports | `strict: true`; no untyped geometry payloads |
| UI framework | **React** | Editor shell, inspectors, dialogs, state subscriptions | Functional components; keep geometry outside React |
| Build / dev server | **Vite** | Local development and production static site | No Next.js or server-rendering |
| Component system | **Mantine** (`@mantine/core`, `@mantine/hooks`) | One standardized set of inputs, menus, popovers, tooltips, dialogs, toolbars | **Only** general-purpose UI design system |
| App UI feedback | `@mantine/notifications` and `@mantine/modals` | Toasts, confirmations, consistent dialogs | No custom modal/toast implementation |
| Icon set | **Lucide React** (`lucide-react`) | Consistent functional icons | One icon family, 16–18 px in desktop controls |
| Dock/resizing | **react-resizable-panels** | Resizable inspector and document workspace | Use current v4+ `Group`, `Panel`, `Separator` API; no homemade drag-resize |
| Drafting surface | **Native SVG** | Vector outlines, points, handles, labels, hover targets, snap guides | Controlled by document model; no pixel-based source of truth |
| Geometry | **Pure TypeScript module**, optionally `paper` for vetted path operations | Line/curve math, arc length, intersection, projection, offsets | Test every algorithm; never let UI SVG path text be canonical data |
| App state | **Zustand** | Active tool, selection, viewport, command execution, undo/redo | Distinguish temporary UI state from document data |
| Local database | **Dexie** + browser IndexedDB | Projects, project metadata, imported reference images, settings | No backend, auth, or sync in v1 |
| Vector PDF | **pdf-lib** | A4 tiled print PDFs, page marks, real-world dimensions | Preserve exact scale, no canvas screenshots |
| PWA | **vite-plugin-pwa** | Offline startup, installability, cached app shell | Safe update prompt; never discard unsaved edits |
| Validation | **Zod** | Import/schema validation and migrations | Reject corrupt/unknown geometry safely |
| Unit tests | **Vitest** | Coordinate math, geometry, measurements, commands, serialization | Required in CI |
| UI/e2e | **Playwright** | Editing, shortcuts, storage, print workflow, responsive checks | Required for core flows |
| Lint/format | **ESLint + Prettier** | Uniform code style | No contradictory formatters or custom styling conventions |

**Do not add** Tailwind, shadcn/ui, Material UI, Chakra, Ant Design, Bootstrap, Chakra-style wrappers, or a second icon pack. Mantine already handles regular UI components. Do not install heavy charting/data visualization/animation libraries. Browser-native APIs handle pan/zoom pointers and file downloads.

**Version policy:** Pick current compatible stable releases **at implementation time**. Pin resolved versions in the lockfile. Read the matching documentation for installed versions. Especially note: newer `react-resizable-panels` calls its parts `Group`, `Panel`, `Separator`; older AI examples using `PanelGroup` and `PanelResizeHandle` are version-specific and may be wrong. Do not blindly copy older tutorials.

### Why Mantine rather than shadcn/ui here?

The user wants standardized, native-feeling controls without giving an AI agent room to improvise arbitrary visual design. Mantine ships cohesive prebuilt controls and a centralized theme and component styling API. shadcn/ui can be excellent but tends to invite locally copied and freely altered components; that is not desirable for this project's strict visual consistency.

### Why SVG rather than HTML Canvas as v1 editor?

SVG makes edit nodes, strokes, guides, hover/selection targets, and text accessible to ordinary DOM tooling and easy to debug. Physical dimensions are stored in millimetres and mapped into SVG coordinates. If performance later demands it, **only the renderer** can be replaced. Do not rewrite the model around rendering technology.

---

## 2. Locked UI/UX design system

### Non-negotiable visual direction

**A compact, neutral desktop drafting application** like a modern native vector editor. Think a conventional menu + tool strip + workspace + contextual properties inspector, not a website with cards.

- Default **light** neutral workspace, with a polished dark mode toggle. Both fully supported by Mantine color-scheme facilities.
- Use Mantine's defaults as the baseline. Override only a small centralized set of tokens.
- System UI font stack; numeric fields use tabular figures where practical.
- Quiet borders, minimal shadows, no gradients, no glassmorphism, no glowing strokes, no decorative emojis.
- Primarily neutral surfaces. **One** restrained accent (default Mantine blue unless user changes it). Colors encode tool state, selection, invalid geometry, or seam/cut distinction, never decoration.
- Compact controls and visible labels/tooltips. No textless ambiguous actions.
- Use standard menu structure (`File`, `Edit`, `View`, `Pattern`, `Tools`, `Help`) and standard undo/redo behavior.
- Functional discoverability: tooltips, shortcut hints, informative cursor and live previews, status text.

### UI layout (desktop / tablet landscape)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ File  Edit  View  Pattern  Tools  Help                 Project name   Saved   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Select  Point  Line  Rectangle  Curve  Dart  Seam   | Undo  Redo  Export   │
├───┬───────────────────────────────────────────────────────────────┬──────────┤
│   │                                                               │          │
│ T │                                                               │ Properties
│ o │                                                               │          │
│ o │               2D drafting workspace                           │ Length   │
│ l │      rulers / grid / snap guides / pattern geometry            │ Anchor   │
│ s │                                                               │ Offset   │
│   │                                                               │ Units    │
│   │                                                               │          │
├───┴───────────────────────────────────────────────────────────────┴──────────┤
│ Tool: Line   X: 120 mm  Y: 80 mm   Length: 230 mm   Snap: midpoint   100% │
└──────────────────────────────────────────────────────────────────────────────┘
```

Layout specifications:

1. **Top menu bar**: document/file actions and app settings. No marketing/navigation header.
2. **Primary compact tool strip**: core operations only. Less frequent operations in menus or the inspector.
3. **Optional small vertical tool rail**: use only if it genuinely improves ergonomics; **do not duplicate actions** in both rail and toolbar without reason. Default to a single visible primary toolbar for v1.
4. **Central workspace**: gets the overwhelming majority of space. Continuous pan and zoom; no page scrollbar.
5. **Right inspector**: properties of selection, contextual edit controls, numeric inputs. Typical initial width 280 px; adjustable and collapsible. Inspector is not a floating card.
6. **Bottom status bar**: tool hint, pointer coordinates, current snap, measured length, zoom, save state. Compact, non-invasive.
7. **Optional document tabs** in v2, after one-document workflow works. Do not add IDE-like floating docking windows in v1.

**Resizing:** use `react-resizable-panels` between workspace and inspector. Preserve inspector width locally in settings; provide a reset-layout action. When a narrow viewport cannot fit both, hide inspector behind a drawer rather than squeezing canvas below usability.

### Mobile / touch adaptation

- Mobile remains **functional**, but primary fine drafting may be easier with mouse/keyboard. Do not pretend small touch targets are accurate editing tools.
- The canvas is still primary, full width/height. Use a bottom tool shelf or scrollable compact toolbar, not a miniature desktop menu bar.
- Selected-entity properties open in a Mantine `Drawer` from bottom or side, using the library's built-in accessibility behaviors.
- Larger hit targets on coarse pointers, minimum approximately **44 CSS px** for important touch actions. Visual handles may be smaller, hit areas must not be.
- One-finger tool interactions, two-finger pinch zoom/pan; provide an obvious Pan tool or gesture modifier so drawing does not fight scrolling.
- Hide optional labels under space constraints; keep accessible names and long-press tooltips/help.
- Use `100dvh`, safe area insets, avoid page scrolling inside drawing view, and avoid covering the active numeric input with mobile keyboard.
- No hover-only functionality, no right-click-only workflow: contextual menu actions also accessible through inspector/menu.

### Component-to-task mapping (do not reinvent)

| Task | Approved UI component/pattern |
|---|---|
| Top-level actions | Mantine `Menu`, `Menu.Item`, `Divider` |
| Compact toolbar | Mantine `ActionIcon` inside `Group`, `Tooltip`; optionally `SegmentedControl` for exclusive modes |
| Numeric length / angle | Mantine `NumberInput`, validated finite number; unit suffix text adjacent or within supported layout |
| Anchor mode for line length | Mantine `SegmentedControl` with `Start`, `Center`, `End` **and accompanying explanation** |
| Pattern visibility toggles | Mantine `Switch` / `Checkbox` |
| Tool / setting choice | Mantine `Select`, `Radio.Group` or `SegmentedControl` (choose based on item count) |
| New project / import / export | Mantine `Modal` and `Button` |
| Narrow-screen properties | Mantine `Drawer` |
| Inline state / tool help | Mantine `Tooltip`, `Text`, compact status bar |
| Save completion / nonfatal alerts | Mantine notifications; do not spam notifications on every autosave |
| Destructive actions | Mantine confirmation via `@mantine/modals` |
| Shortcut / command search (later) | `@mantine/spotlight` only once command registry exists |
| Property inspector sections | Mantine `Stack`, `Group`, `Accordion` or plain bordered sections |
| Resizable side inspector | `react-resizable-panels` |
| Drawing-specific handles, guides and dimension overlays | Custom SVG elements **only** because these are canvas graphics, not ordinary app controls |

### Strict token policy

Create a single `src/app/theme.ts` using `createTheme` and `MantineProvider`.

- Font: platform/system UI stack. Keep typography hierarchy small.
- Use Mantine spacing scale, colors and radius tokens. No component-level arbitrary values other than necessary drawing dimensions.
- Suggested shell measurements (these are **product defaults**, not library defaults): menu ~36 px, toolbar ~44 px, status bar ~26 px, inspector ~280 px, compact form fields ~32–36 px. Adjust by usability testing.
- Standard corner radius: `sm` for controls; do not put oversized rounded corners on every pane.
- Choose one system for shadows: use **none or subtle** within docked panels. Modals/popovers may use Mantine defaults.
- All interactive states required: default, hover, pressed, selected, focused, disabled, error.
- No inline random color hexes in feature components. Selection/grainline/stitch/cut/invalid colors defined as **semantic tokens** in one CSS/theme location.
- `prefers-reduced-motion` respected; avoid animated canvas decoration.

### Mandatory visual review checklist

A PR fails UI review if it includes: mixed icon packs; emoji buttons; gradient buttons/backgrounds; shadows on every element; glass/blur surfaces; floating glass panels; random 16/24/32px gaps; visually different button styles for identical actions; large cards for properties; an enormous branded header; disappearing canvas behind chrome; hidden precision controls; keyboard shortcuts missing from tooltips/menus; fields that display fake measurements.

---

## 3. Data model: millimetres are the source of truth

**All stored coordinates and distances are floating-point millimetres, never DOM pixels and never cm formatted strings.** UI may display mm/cm/in as a presentation layer only. Screen zoom has zero influence on saved dimensions.

Minimum schema, illustration only (refine with Zod and explicit versioned migrations):

```ts
type ID = string;
type Vec2 = { x: number; y: number }; // mm

type Segment =
  | { id: ID; kind: 'line'; from: ID; to: ID }
  | {
      id: ID;
      kind: 'cubic';
      from: ID;
      to: ID;
      control1: Vec2;
      control2: Vec2;
    };

type PatternPiece = {
  id: ID;
  name: string;
  pointIds: ID[];
  segmentIds: ID[]; // ordered for each outline
  closed: boolean;
  grainline?: { start: Vec2; end: Vec2 };
  seamAllowance?: {
    defaultWidthMm: number;
    perSegmentMm?: Record<ID, number>;
    join: 'miter' | 'round' | 'bevel';
  };
};

type PatternDocument = {
  schemaVersion: number;
  id: ID;
  name: string;
  points: Record<ID, Vec2>;
  segments: Record<ID, Segment>;
  pieces: PatternPiece[];
  unitsDisplay: 'mm' | 'cm' | 'in';
  updatedAt: string;
};
```

Implementation notes:

- Avoid duplicates as source of truth: shared endpoint IDs must stay shared so edits are consistent.
- Separate **drafting paths**, **sewing/stitch line**, and **derived cutting outline** conceptually. A seam allowance is a computed operation on a canonical stitch-line boundary, not a destructive replacement of the boundary.
- Keep derived geometry caches outside serialization and invalidate on relevant edits.
- Make all geometry edits undoable commands with clear before/after documents or inverse operations.
- Save the document schema version and migrate old projects safely.
- Imported reference images are separate blobs/records, not giant base64 strings inside every document.
- Incomplete drafts must be allowed; do not force every line into a closed garment outline.

---

## 4. Drawing engine contract

### Coordinate systems

1. **Document:** mm coordinates and length; high-precision floating point.
2. **Viewport:** SVG `viewBox` or transform mapping between document and screen; keep scale/pan in UI state only.
3. **Pointer:** browser client coordinates (`clientX/Y`), transformed using the current screen-to-SVG mapping (e.g. `getScreenCTM().inverse()` where appropriate).
4. **PDF:** PDF points, with **1 mm = 72 / 25.4 PDF points**; explicit axis conversion and fixed print scale.

Do not use CSS pixel measurements to set geometry length. A change in viewport, browser zoom, device pixel ratio, or monitor DPI must not alter project measurements.

### Interactive rendering

- Canonical model -> selectors -> SVG primitives: `<path>`, `<line>`, `<circle>`, `<text>`.
- Provide separate **visible strokes** and **larger invisible hit-target paths** for thin lines.
- Node markers and control handles remain visually predictable through zoom; interactive hit radius is expressed in **screen pixels**, then translated to document distance for hit tests.
- Render snap guides and measurement labels in a distinct overlay layer, not permanently into piece geometry.
- Use pointer events and pointer capture for consistent drag behavior; support Esc to cancel, Enter to commit, Space temporarily pans.
- Avoid committing edits on every pointer movement to IndexedDB. Create a **draft transaction** while dragging, commit one command on pointer-up, undo it as one action, then autosave.

### Snapping, minimum v1

- Candidate types: endpoint, existing point, midpoint, line intersection, horizontal/vertical from starting point, grid (optional), guide intersection.
- Convert a constant pixel tolerance into current document units using viewport scale.
- Prioritize explicit geometry snap candidates over grid and alignment; select closest valid candidate within priority tiers, with stable behavior near ties.
- A snap **must** be visible with a small marker and short label like `Endpoint`, `Midpoint`, `Intersection`.
- Snapping should not make the pointer jump unpredictably. Implement mild snap hysteresis if needed.
- Configurable toggle and optional per-mode toggles. Modifier bypass while held (exact shortcut defined in shortcut registry).
- Geometric calculations remain exact in model units, even if snapping tolerance is measured in screen pixels.

### Live measurement overlay

- While a line is drawn/edited: continuously display length and angle near the line/pointer; show exact typed result on numeric commit.
- While an outline is selected: show segment lengths and relevant totals selectively, never all labels at once if cluttered.
- Curve lengths must be **actual arc lengths** via a tested numerical algorithm (e.g. adaptive subdivision/integration), not endpoint distance.
- Display units with explicit suffix (`12.0 cm`, `120 mm`) and consistent precision rules. Never alter underlying stored values simply because display rounds.
- Numeric entry while a drawing tool is active must not steal keyboard shortcuts while the input has focus.

### Low-friction editing rules

- Select line -> click/drag endpoint moves endpoint.
- Double-click line segment -> insert a point on the segment, preserving approximate curve shape (for cubic, use de Casteljau splitting at projected parameter), one undoable command.
- Select line -> edit **Length** in inspector -> choose `Start fixed`, `Center fixed`, `End fixed`. No guessing which endpoint moves.
- For straight segment from **A** to **B** with target length **L**, define unit direction **u = (B-A)/|B-A|**:
  - Start fixed: `A' = A`, `B' = A + L*u`.
  - End fixed: `B' = B`, `A' = B - L*u`.
  - Center fixed: `M = (A+B)/2`; `A'=M-(L/2)*u`, `B'=M+(L/2)*u`.
  - Zero-length source: require a valid direction/angle; do not divide by zero.
  - Connected segments: if changing endpoint changes shared point, show the resulting connected geometry in preview; do not silently detach edges.
- Click/drag a straight segment (while appropriate curve-edit tool is active) -> preview a smooth curve, commit cubic control points; include a reset-to-straight action.
- Numeric position/length/angle edits preview before commit where practical. Esc cancels, Enter commits.
- While drawing, click to add point; Enter or double-click ends open path; clicking first point closes it; Backspace removes last unfinished point; Esc cancels.
- Existing outlines and points are never silently deleted or changed by a new tool.

### Offset and seam allowance mathematics

Do **not** use naive polygon expansion or merely change SVG `stroke-width` and call it a seam allowance.

- Seam allowance is a true offset at specified distance in mm from the **sewing line**.
- Support convex and concave corners, multiple join styles, acute angles, self-intersections, and curved segments.
- Start with constant-width offset of closed outlines. **Per-segment seam allowances, internal holes, sharp-angle conflict handling and complex partial offsets are later work** unless already covered by proven algorithms and tests.
- Paper.js current online reference documents `PathItem.offset(distance, options)`, but the builder **must verify this exact API exists in the installed package/version**, and test its results. If it is missing/insufficient, use a well-maintained offset/boolean geometry implementation (e.g. vetted Clipper2 JS integration for flattened paths). Do not fabricate APIs or treat sampled polyline offsets as exact curves.
- Curved paths can be adaptively flattened within a documented maximum tolerance before polygon offsetting; keep source cubic geometry intact and use the sampled result **only** for derived cut paths, with explicit error bounds.
- Every exported cut outline must be a real geometric path, not a visual line with fat stroke.
- Side detection and outward direction must be stable for clockwise/counterclockwise outlines, with tests.

---

## 5. Interaction architecture and native-software behavior

### One command registry

Do not hard-wire menu callbacks, toolbar handlers, and keyboard shortcuts independently. Define a single central command registry and invoke it from every UI surface.

```ts
type EditorCommand = {
  id: string;                  // e.g. 'edit.undo', 'tool.line'
  label: string;               // menu/tooltip label
  defaultShortcut?: string;    // e.g. 'Mod+Z'
  enabled: (ctx: EditorContext) => boolean;
  run: (ctx: EditorContext) => void | Promise<void>;
};
```

The exact API can vary, but commands need stable IDs, enabled state, shortcut labels, and shared actions. Any command that modifies the document participates in undo/redo and save-state tracking.

### Suggested initial shortcuts (proposed for **this app**, not assertions of CLO defaults)

| Action | Suggested shortcut |
|---|---|
| Select | `V` |
| Line / polyline | `L` |
| Point tool | `P` |
| Curve tool | `C` |
| Pan temporarily | Hold `Space` + drag |
| Undo / redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Save local snapshot | `Ctrl/Cmd+S` (intercept browser save, persist project; offer export separately) |
| Open project picker | `Ctrl/Cmd+O` (where permitted) |
| Delete selected geometry | `Delete` / `Backspace` when not editing text |
| Cancel current gesture/tool | `Escape` |
| Commit active numeric input / drawn path | `Enter` |
| Fit to patterns | `F` (when canvas focused) |
| Toggle snap | `S` (when canvas focused) |
| Zoom | wheel + modifier where necessary; dedicated buttons always available |

**Shortcut safety:** Never catch single-letter shortcuts while focus is inside `input`, `textarea`, contenteditable, a modal form, or an open select. Respect native browser gestures; offer menu alternatives. Show shortcut in the relevant tooltip/menu. Provide remapping in a later release if demand warrants it.

### Native application affordances

- Visible dirty/saving/saved/error state in shell.
- Undo/redo enabled/disabled affordances; drag actions create one history entry.
- Context menu for selected point/segment/piece, but all actions reachable elsewhere.
- Keyboard-accessible inspector controls and tool selection.
- Immediate feedback for invalid numeric input; never silently clamp geometry without explaining why.
- Explicit cursor for select, draw, curve, pan, move, forbidden, and precision snap states.
- Focus returns sensibly to the editor after confirming a dialog or numeric edit.
- One consistent pattern for destructive commands: preview where meaningful, confirmation only for important irreversible actions (e.g. delete entire project), not for ordinary undoable point deletion.

---

## 6. Local-first storage: no backend in v1

Use Dexie on IndexedDB for **projects and large reference image blobs**. Use a small local settings store (Dexie or `localStorage`) for user preferences such as theme, last active project, inspector width, preferred display units, and snap toggle. Never store a large project in `localStorage`.

### Suggested stores

```ts
projects:       id, name, updatedAt, createdAt, schemaVersion, documentJson
assets:         id, projectId, fileName, mimeType, blob
preferences:    key, value
recovery:       projectId, savedAt, documentJson // optional checkpoint
```

- On project open: validate document schema and migrate if needed; refuse destructive migration on invalid input.
- On each completed edit: mark dirty and schedule an IndexedDB write (e.g. 300–700 ms idle debounce). Serialize while preserving project revision ordering.
- Ensure writes cannot complete out-of-order and overwrite a newer edit. Persist a revision number and serialize/queue writes per project.
- Save immediately on explicit `Ctrl/Cmd+S`, document switch, or safe app closure hooks; **do not rely on `beforeunload` async writes**.
- Show real saving/saved/error state. If quota or write error occurs, preserve in-memory document and clearly offer export.
- Ask for storage persistence (`navigator.storage.persist()`) where supported/appropriate, and handle refusal. Browsers may evict IndexedDB data in low-storage situations; do **not** promise it is permanent.
- Offer `Export editable project (.json)` / `Import project`, and perhaps a package format with referenced blobs in v2. Backup must work offline.
- Test offline launch after initial install/cache, offline editing, reload persistence, upgrade migration, quota error behavior, and corrupted project handling.

### PWA safety

- Include manifest, icons, offline cache of built app assets. No server required after first installed/cached load.
- On update available, prompt for an update and reload **only after** current edits are committed to IndexedDB. Do not auto-reload while working on a pattern.
- A PWA service worker is **not** a substitute for IndexedDB project persistence.
- Deploy over HTTPS in production for service workers and modern browser capabilities.
- No analytics or telemetry by default.

---

## 7. Exports: actual-size sewing patterns

### Output formats

1. **Editable JSON project** — lossless canonical model, schema versioned.
2. **SVG export** — vector geometry with explicit `width`/`height` in `mm`, correct `viewBox`; note third-party viewers may apply differing print defaults.
3. **PDF export** — 1:1 vector drawing, full page or automatically tiled A4 pages, calibration marks.

### PDF accuracy and printer workflow

- All source geometry is mm. Convert to PDF points with factor `72/25.4`.
- A4 size is **210 mm × 297 mm**. Support portrait/landscape.
- Separate **paper dimensions**, **printable area margins**, **tile overlap**, and **registration marks**.
- Default conservative print margin e.g. 10 mm, configurable; avoid drawing important cut lines in unprintable margin.
- Tile pieces using an explicit world-to-page transform. Do not generate PDFs from screenshots, CSS scale transforms, or SVG raster snapshots.
- Print a **100 × 100 mm calibration square** and a clear instruction: print at `Actual size`/`100%`, disable `Fit to page` / printer scaling.
- Registration crosses / page numbers and overlap alignment guides on tiled PDF.
- Explain that a correct PDF cannot override a printer driver silently scaling the page. The user should measure the calibration square.
- Distinguish layers/styles for stitch line, cut line, grainline, fold, dart, notch, text labels; optional export visibility toggles.
- Round UI labels for readability; never round geometry before PDF conversion.
- Test with a 100 mm square, 120 mm line, curved segment with known dimensions, 5 mm seam allowance, and a pattern crossing at least two A4 sheets.

### Accuracy target

- Internal basic straight-line operations: floating-point precision within sensible numerical tolerances; tests should assert **sub-0.01 mm** absolute differences for basic exact line transforms where expected.
- Curves / offsets: establish algorithm-specific bounded error, preferably **≤ 0.1 mm** for derived printable cut paths (or smaller if feasible), clearly documented and verified with fixtures.
- Print calibration: PDF vector coordinates must be exact for 100 mm; physical printed size depends on the printer.

---

## 8. Folder organization / boundaries

```text
src/
  app/
    App.tsx
    theme.ts
    providers.tsx
    shortcuts.ts
  ui/
    shell/              # menu bar, toolbar, inspector, status bar
    dialogs/            # project, measurements, export
    panels/             # property editor, layers (later)
    components/         # small wrappers only when necessary
  editor/
    EditorViewport.tsx
    SvgRenderer.tsx
    overlays/           # snapping indicators, dimensions, handles
    tools/              # select, point, line, curve, pan
    interactions/       # pointer gestures, hit tests, keyboard routing
    commands/           # registry, command implementations, history
    state/              # Zustand UI state and selectors
  geometry/
    types.ts
    line.ts
    bezier.ts
    intersections.ts
    snapping.ts
    offsets.ts
    measurements.ts
    transforms.ts
  document/
    schema.ts           # Zod, runtime validation
    migrations.ts
    model.ts
    operations.ts
  persistence/
    db.ts               # Dexie
    projects.ts
    autosave.ts
    settings.ts
  export/
    svg.ts
    pdf.ts
    tiling.ts
  tests/
    geometry/
    commands/
    persistence/
    export/
    e2e/
```

### Boundaries an agent must not break

- `geometry/` **cannot import** React, Mantine, Zustand, SVG DOM, or IndexedDB.
- `document/` **cannot import** UI or browser-specific globals. It is data and transformations only.
- `editor/` can orchestrate geometry + state + SVG interaction, but **does not own project persistence**.
- `ui/` can invoke registry commands; it does **not** manipulate SVG path data strings directly.
- `export/` reads canonical document geometry and explicit options; never screen pixels or temporary overlays.
- `persistence/` does not mutate geometry during serialization; it validates and versions.
- Each editing operation has one logical command path used by menu, toolbar, shortcut and inspector.

---

## 9. Dependency install plan (illustrative; verify compatibility)

```bash
npm create vite@latest patternmaking-studio -- --template react-ts
cd patternmaking-studio

# General UI, app state, storage, export
npm install @mantine/core @mantine/hooks @mantine/modals \
  @mantine/notifications lucide-react react-resizable-panels \
  zustand dexie zod pdf-lib

# Geometry helper (adopt only where its tested operations add value)
npm install paper

# Dev, offline, tests, formatting
npm install -D vite-plugin-pwa vitest @playwright/test \
  eslint prettier typescript
```

Mantine's official Vite setup may require CSS imports, PostCSS configuration and associated plugins depending on the chosen version. **Follow the official setup guide for the installed Mantine version**, not an old AI snippet. The package install block is intentionally not a complete working bootstrap command.

Example concept for root providers:

```tsx
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { theme } from './theme';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <ModalsProvider>
        <Notifications position="bottom-right" />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}
```

Design note: import style sheets of extra Mantine packages **if their documentation for the installed version requires them**. Use default Mantine styles rather than recreating them. Build the shell, toolbar, menu and property panel using Mantine components before integrating complex geometry.

---

## 10. Implementation milestones (frontend-first)

### M0: App shell, design discipline

- Scaffold React + TypeScript + Vite.
- Configure Mantine globally, dark mode, Lucide icons, compact menu+toolbar+inspector+status layout.
- Resizable inspector and mobile drawer.
- Build real command registry and functioning empty project menu.
- **Acceptance:** desktop and mobile layouts match this spec; all UI controls are Mantine; no placeholder cards, fake dashboard metrics or decorative UI.

### M1: Accurate drawing MVP

- mm-based document model and SVG viewport.
- Line, polyline, point insertion, select/move, undo/redo.
- Live length and angle, typed exact dimensions, start/end/center anchors.
- Grid toggle, endpoint/midpoint/horizontal/vertical snapping and visible feedback.
- **Acceptance:** create/edit a 120 mm line, change it to 150 mm using all three anchors, undo/redo in single commands, unaffected by zoom.

### M2: Curves + pattern concepts

- Bézier editing with intuitive controls.
- Exact geometric split when inserting a point on a curve.
- Curve arc length, grainline, fold indicator, notch, dart representation.
- **Acceptance:** shape remains continuous on split, curve lengths update, guide overlays do not alter cut geometry.

### M3: Seam allowance and true-size export

- Proven closed-piece offset; choose width in mm; retain stitch line and generated cut line.
- SVG and tiled A4 PDF with calibration square and alignment marks.
- **Acceptance:** measured 5 mm offset is correct on a line and tested curved/acute-corner fixtures; printed PDF has correct coordinate scaling.

### M4: Real local-first project workflow

- Dexie projects, autosave, recovery, schema versioning, import/export JSON.
- PWA offline startup, install, persistence prompts, safe update handling.
- **Acceptance:** edit offline, reload, data remains; handle corrupt project and storage failure without silent data loss.

### M5: Polish through tests, not decorations

- More intuitive hover feedback, better hit targets, contextual menus, refined tooltips.
- Keyboard accessibility and focused input rules, mobile touch gestures.
- Cross-browser geometry/export tests; responsive e2e tests.
- **Acceptance:** feels predictable and accurate, not visually busy.

---

## 11. Non-goals / refused scope for v1

- No user accounts, server APIs, backend database, auth, subscriptions, telemetry, collaborative editing, remote sync.
- No 3D draping, avatar simulation, garment physics or fabric shader.
- No AI pattern generation, design prompt field, chat sidebar, or image generator UI.
- No plugin marketplace, templates store, social sharing features.
- No enormous generic CAD constraint solver. Add constraints only when concrete user workflows justify them.
- No full docking IDE framework, draggable floating windows, floating palettes, ribbon maze, or 40-button toolbar.
- No Tailwind/shadcn alongside Mantine; no second component library.
- No screenshot-to-PDF printing or stored pixel distances.
- No 'coming soon' interface controls pretending to work; hide unimplemented features until real.

---

## 12. Tests the builder must demonstrate

### Geometry correctness

1. Line from `(0,0)` to `(100,0)` mm: displayed 10 cm.
2. Change target to 120 mm with **start fixed**: `(0,0)` to `(120,0)`.
3. Change same original with **end fixed**: `(-20,0)` to `(100,0)`.
4. Change same original with **center fixed**: `(-10,0)` to `(110,0)`.
5. Same operations on vertical and diagonal lines; same direction/length and proper anchor.
6. Zero-length source handled explicitly without NaN/infinite values.
7. Zoom from 25% to 400% and resize inspector: geometry dimensions unchanged.
8. Snapping to midpoint and endpoints chooses exact model geometry and renders a readable indicator.
9. Curve split preserves the original cubic shape within a very tight tolerance.
10. 5 mm seam allowance on rectangle and mixed curve/line outline uses verified geometric offsets; handle concave corners safely.
11. Live curve measurements use arc length, not point-to-point chord.

### User interaction

12. Start drawing, see live length, type a dimension, commit, undo, redo.
13. Double-click adds a point without producing an unwanted move.
14. Drag endpoint previews without saving 100 intermediate history commands.
15. Escape cancels current preview with no accidental document mutation.
16. Shortcuts work when canvas focused and do **not** fire while typing in inspector fields.
17. New/delete project and file import/export use standardized Mantine confirmations and errors.
18. Inspector panel can resize/collapse, and layout persists on reload.
19. Mobile narrow viewport can draw/pan, open properties, enter measurements, and access all critical commands without hover/right click.

### Persistence + print

20. Offline-loaded PWA edits and saves projects through reload.
21. Saving in quick succession never lets an old write overwrite the latest revision.
22. Schema version and corrupt-file checks give recoverable errors.
23. PDF tile positions are computed from mm; 100 mm calibration square stays 100 mm in PDF coordinate units.
24. Tiled A4 export has deterministic registration marks, page order, overlap and page numbers.
25. Browser update/reload does not silently lose unfinished work.

### Design conformance

26. One Mantine theme, one Lucide icon family, no second UI kit.
27. No excessive shadows/glassmorphism/gradients/cards; canvas remains dominant.
28. UI labels, shortcuts, control dimensions and panels are coherent across tools.
29. All dialogs/buttons/menus have keyboard focus and accessible names.
30. Screenshot at desktop, tablet and phone viewports reviewed against the stated shell and compact standards.

---

## 13. Ready-to-paste master instruction for the builder agent

> Build a local-first 2D sewing-pattern web app using **React + strict TypeScript + Vite**. Use **Mantine as the sole component and theme system** and **Lucide React as the sole icon family**, with a compact native-editor shell: conventional File/Edit/View/Pattern/Tools menus, simple tool strip, dominant SVG canvas, resizable right properties inspector, and small status bar. Use `react-resizable-panels` for resizing, native SVG for drawing, a pure mm-based geometry model, Zustand for transient editor state, Dexie/IndexedDB for autosaved local projects, pdf-lib for exact A4 tiled PDF export, and vite-plugin-pwa for offline installation. Do not add a backend, shadcn, Tailwind, 3D, decorative gradients, floating glass panels, marketing UI, placeholder controls, or bloated generic-CAD functionality. Implement accurate line drawing, snapping, continuous live measurements, easy point/curve editing, and exact line-length editing with three anchor modes (keep start, keep end, extend equally). Make undo/redo and keyboard shortcuts reliable. Keep geometry separate from SVG and React; store all measurements in millimetres. Verify complex offsets numerically and keep cut and stitch outlines separate. Follow the milestones and acceptance tests in this document. **When uncertain about visuals, use Mantine's documented default pattern instead of inventing a new component.**

---

## 14. Documentation and technical reference links

These are implementation references, not substitutes for the installed-version docs.

- **Mantine:** https://mantine.dev/getting-started/ ; Vite setup https://mantine.dev/guides/vite/ ; theme/CSS variables https://mantine.dev/styles/css-variables/ ; AppShell https://mantine.dev/core/app-shell/
- **Mantine Styles API:** https://mantine.dev/styles/styles-api/
- **React resizable panels:** https://github.com/bvaughn/react-resizable-panels ; check the README for installed v4+ exports (`Group`, `Panel`, `Separator`)
- **Lucide:** https://lucide.dev/guide/packages/lucide-react
- **Zustand:** https://zustand.docs.pmnd.rs/
- **Dexie:** https://dexie.org/ ; persistence discussion https://dexie.org/docs/StorageManager
- **Paper.js (Path reference / offsets):** https://paperjs.org/reference/path/ (confirm API against actual package)
- **Clipper2 JS possible fallback:** https://www.npmjs.com/package/clipper2-js (offsetting uses integer-scaled geometry; evaluate maintenance + precision first)
- **pdf-lib:** https://pdf-lib.js.org/ ; https://github.com/Hopding/pdf-lib
- **PWA for Vite:** https://vite-pwa-org.netlify.app/ ; https://github.com/vite-pwa/vite-plugin-pwa
- **SVG coordinate transforms:** https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getScreenCTM
- **Browser storage:** https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- **Vite:** https://vite.dev/
- **Vitest:** https://vitest.dev/
- **Playwright:** https://playwright.dev/

**Revision note:** This spec deliberately changes the earlier loose suggestion of “Tailwind + shadcn/ui” to **Mantine only**, because the explicit requirement is to prevent the coding model from inventing an inconsistent design system. It also treats geometry offset APIs as version-verified dependencies and keeps cut lines separate from stitch lines.
