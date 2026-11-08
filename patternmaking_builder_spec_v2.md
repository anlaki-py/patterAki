# CLO 3D / Marvelous Designer 2D patternmaking: controls, shortcuts, and a builder specification

**Research date:** 7 November 2026  
**Purpose:** Reference for building a small, precise, easy-to-use, browser-based sewing-pattern editor.  
**Scope:** The **2D Pattern Window** and adjacent production-relevant tools. 3D simulation, avatars, materials, rendering, and animation are out of scope unless they clarify what a 2D control actually does.

> **Important:** This is not a copy of either product's interface or a list of every command in every edition. It synthesizes the public documentation of CLO 3D (CLO) and Marvelous Designer (MD), with shortcuts separated by confidence and age. The later sections are **proposed product requirements**, not claims that CLO or MD work identically. No program was installed or hands-on tested. The company's 2026 MD shortcut-guide announcement was found, but its Windows/Mac download contents could not be independently examined; the comprehensive keymap below is therefore explicitly marked **legacy / verify**.

## 0. Read this first: what the builder should implement

**Copy the interaction model; do not copy the bloat.** Both products organize pattern editing around a small number of essential actions:

1. Select a whole **pattern piece** and move/rotate/duplicate it.
2. Select a **point or edge** to shape its outline.
3. Draw a **polygon**, **rectangle**, **ellipse** or an **internal line**; make precise dimensions available during creation.
4. Draw and adjust **curves** using point/handle editing.
5. Use **snap**, **guides**, numeric movement and line-length editing for accuracy.
6. Add manufacturing metadata: **stitch line vs cutting line**, **seam allowance**, **dart**, **notch**, **grainline**, **cut-on-fold**, **labels**, and **cut quantity**.
7. Save editable vector geometry, then print **1:1** on tiled A4 paper with calibration marks.

**Design priority:** accuracy > predictable control behavior > low learning curve > tool count. **Read §13 in full before writing UI code:** it specifies the small real-time behaviors (snapping, inline measurements, direct curves, numeric split/length editing, endpoint anchors) that make the app pleasant to use. Keep the initial toolbar to Select, Draw, Curve/Edit, Measure, Seam Allowance, and Markings, with a few tools under dropdowns.

### Evidence labels used in this report

- **[D] Documented:** A linked official CLO or MD help article specifically describes it.
- **[L] Legacy shortcut:** Listed by a third-party MD shortcut compilation (updated October 2025), consistent with older CLO/MD guides. It is **not verified as a current 2026 default**.
- **[R] Recommendation:** Proposed behavior for *our* app. It can intentionally differ from CLO/MD.
- **[V] Verify live:** Menu/shortcut likely version-, platform- or customization-dependent; do not assert exact behavior without testing.

---

## 1. The workspace and what its objects mean

### 1.1 CLO/MD's 2D mental model [D]

The 2D Pattern Window is a drafting surface for making flat pattern pieces, editing outlines/internal shapes, and marking sewing-related relationships. CLO/MD commonly expose a toolbar near the 2D viewport and context-sensitive actions from a **right-click** on the canvas, pattern, segment, or point. Selecting an object exposes its properties in a separate **Property Editor**. These are separate modes/tools, not just different handles on one universal pointer. [S01] [S02] [S03]

The high-value distinction is:

| Object | Meaning | Must be independent in our editor? |
|---|---|---|
| Pattern piece | Named, closed contour representing one fabric component | Yes |
| Pattern outline / sewing line | The intended finished contour or seam path | Yes |
| Cutting line | Cut boundary, often generated from the sewing contour + allowance | Yes |
| Vertex / segment | Editable geometry making up the outline | Yes |
| Curve point / Bézier handle | Geometry controls, not a decorative stroke | Yes |
| Internal line/shape | Dart leg, pocket placement, pleat, fold, or construction mark | Yes |
| Baseline / guideline | Drafting reference, not normally cut or sewn | Yes |
| Notch | Edge marker for matching or assembling pieces | Yes |
| Seam allowance | Distance/rules between stitching outline and cutting edge | Yes |
| Grainline / on-fold mark | Fabric cutting orientation metadata | Yes |
| POM (point of measure) | Explicit measurement definition attached to geometry | Later, or basic v1 |
| Sewing connection | Relationship between two edges in 3D simulation | Not in v1; optional 2D seam match later |

**[R] Data model rule:** A pattern is not just an SVG `path`. Use typed objects and preserve separate semantic layers. Visual presentation and printed line styles should be derived from object types.

### 1.2 The simplified workspace [R]

- **Top bar:** project name, undo, redo, unit, Save/Open, Export.
- **Left vertical toolbar:** Select (`V`), Draw (`P`), Shape (`R`), Curve (`C`), Point/Split (`X`), Measure (`M`), Seam (`S`, configurable), Markings (`N`). Show icon + tooltip + hotkey; long-press opens related tools on touch.
- **Canvas center:** infinite 2D plane with subtle millimetre/centimetre grid, pan/zoom, snap highlights, cursor coordinate readout.
- **Right contextual inspector:** selected piece name, geometry, width/height/angle; or vertex X/Y, segment length; or seam width/corner policy; or notch/dart properties. Hide if nothing is selected.
- **Bottom compact strip:** current tool + one-line instructions, snapping toggle, grid toggle, visible dimensions toggle, scale indicator (view zoom only, *not* print scale).
- **Export dialog:** A4 portrait/landscape, 100% / 1:1, margins, overlap, layout preview, per-page numbers, scale test box.
- **Touch layout:** collapse the inspector into a bottom sheet and group tools; never require a right mouse button to reach an essential function.

---

## 2. Navigation, selection, and moving geometry

### 2.1 Viewport navigation [D]

CLO/MD offer zoom-to-selected (select a piece and press **F**) and zoom-extents-all from the canvas context menu. The 2D viewport can automatically pan while the cursor approaches the edge during certain edit/drawing operations (smart panning). Mouse/key view-control combinations are **configurable**, and presets exist: avoid claiming one universal mouse-pan shortcut. Zoom changes viewport presentation, not real-world pattern dimensions. [S04] [S05]

MD's 2D ruler supports inch/cm/mm units. Dragging rulers creates guidelines; dragging the top-left ruler intersection changes the origin, and double/right-click there resets it. Hold Ctrl while dragging a ruler to create a guide for the opposite axis. Guides can be offset, locked and hidden independently of rulers. [S06]

**[R] Implement:** wheel/trackpad pinch = cursor-centered zoom; middle-drag or Space+drag = pan; double-tap/select-fit button = fit all; `F` = fit selection; touch two-finger pan/pinch; view reset. Keep full-resolution coordinates even after thousands of zoom steps.

### 2.2 Select whole pieces vs points [D]

MD explicitly separates **Transform Pattern** from **Edit Pattern**:

| Action | Documented interaction |
|---|---|
| Select a piece | Transform Pattern tool; click its filled area; yellow highlight |
| Multi-select pieces | Shift+click |
| Box-select pieces | Drag a marquee; Ctrl+drag can select partially intersected pieces (introduced 2024.0) |
| Move piece | Drag or arrow keys |
| Constrain movement | Shift or Ctrl while dragging, for axis/45-degree/slope behavior depending on context |
| Precise move | Right-click or F1 *during the drag* opens distance input (Windows documentation; Mac mapping varies) |
| Scale or rotate piece | Selection bounding box with scale handles, an external rotation handle, and a changeable pivot |
| Select a point or segment | Edit Pattern tool; click edge/vertex; Shift+click to add multiple |
| Box-select points/segments | Marquee drag with Edit Pattern active |
| Move points/segments | Drag, arrow keys, or numeric move dialog; point supports X/Y components |
| Transform a point/segment selection | Separate Transform Point/Segment tool with bounding box |

Sources: [S07] [S08] [S09].

**[R] Build a simple default:** `V` selects pieces; double-click a piece enters Edit Points (or `E`), Escape exits. Make both toolbar modes accessible, since automatic double-click is not discoverable on mobile. Selected points and edges should clearly look different from whole-piece selection.

### 2.3 Arrow key movement [D]

MD allows arrow keys to move patterns, internal shapes, points, and lines by a configurable increment. In older MD preferences this is under 2D Pattern Window Properties (`F12` is documented there). [S10]

**[R] Default nudge:** arrow = **1 mm**; Shift+arrow = **10 mm**; Alt+arrow = **0.1 mm**. These values are OUR defaults, not asserted CLO defaults. Expose them in Settings. Never move a selected object when focus is in a text input.

### 2.4 Hitting overlapping objects [D] / [R]

MD shows a choice popup when a click hits multiple overlapping points or segments. [S08] Our editor should do the same, or cycle candidates with `Tab`; do not silently pick the wrong layer.

---

## 3. Drafting patterns with the mouse, keyboard, and exact input

### 3.1 Polygon / custom pattern [D]

Documented CLO/MD workflow:

1. Activate **Polygon** (legacy key `H`).
2. Click once for the starting vertex; click successive vertices to build the outline.
3. Click the starting vertex to close it into a pattern piece.
4. **Shift** while placing points reveals horizontal/vertical/45-degree guidance.
5. **Ctrl+click** while placing a point creates a free curved point (Windows docs).
6. **Click-drag** a point can create Bézier handles (newer CLO behavior).
7. **Right-click while drafting** opens numeric length and, in MD, symmetric/mirror-creation choices.
8. **Delete/Backspace during a draft** removes the most recent point. **Esc** or **Ctrl+Z during creation** cancels the current draft, rather than undoing the last committed project operation.

MD's numeric polygon dialog documents a `Length` input and mirror creation relative to a local/start or X/Y axis. [S11] [S12] [S13]

**[R] Add to the app:** transparent preview of next segment, live length and angle; type a length while placing the next point and press Enter to commit; arrow-key angle or a numeric angle field. Context button `Enter Length…` on touch. Closing must be explicit and require three valid points; warn on self-intersection.

### 3.2 Rectangle [D]

- Click-drag for an arbitrary rectangle.
- **Shift** while dragging makes a square.
- **Ctrl** while dragging draws from center.
- **Shift+Ctrl** draws a centered square.
- **Single-click** (without drag) opens width/height numeric input, including an aspect-ratio link option. [S14]

**[R] Make a precise rectangle the fastest path:** toolbar shape dropdown -> Rectangle -> single-click -> Width 18 cm / Height 24 cm -> Create. Preserve width and height as real-world geometry, not a raster box. Allow changing them in the inspector later.

### 3.3 Ellipse and other shapes [D]/[R]

Ellipse exists in both programs' 2D pattern shape group; internal ellipses are separate from exterior pattern ellipses. The verified articles cover the tool's presence, but do **not** establish identical modifiers for every version. [S15]

**[R]** Provide ellipse with numerical width/height and a Shift-to-circle constraint. Treat ellipses as editable arcs or closed curve paths, not bitmap graphics.

### 3.4 Internal polygon / line / rectangle [D]

MD/CLO internal geometry is created *inside an existing piece*, not as a separate cut piece:

- Click to add points; click start to close an internal **shape**; double-click final point to finish an open **line**.
- Right-click mid-draft opens precision input including length and position relative to the pattern boundary.
- Shift enables axis and diagonal guidance; Ctrl enables curved points on Windows.
- `Delete` undoes the last point in the current draft; `Esc` cancels drafting. [S16]
- Recent MD has optional **2D Measurements** displayed to the left/right/top/bottom outline while using internal tools or selecting internal shapes. [S17]

**[R] Expose a clear `Line type` on the contextual inspector:** construction (dashed grey), dart, fold, stitch, placement, grainline, annotation. Do not let a construction line accidentally become a cut line.

### 3.5 Curve creation [D]

CLO documents two different ways to work with curves:

- While drawing a polygon/internal line, **drag** when adding a point to create and adjust Bézier handles (similar to vector illustration software).
- While drawing, **Ctrl+click** produces a free curve point.
- **Edit Curvature** turns a straight segment into a curve when dragged, or adjusts an existing curve by dragging it.
- **Edit Curve Point** adds a curve point by clicking the edge, then lets you drag/nudge it or enter X/Y movement.
- CLO warns that some Bézier constructions are converted to different curve-point representations on DXF export. [S13] [S18] [S19]

**[R] Simplify the learning curve:** one `Curve` tool performs drag-to-bend; when selected, show Bézier handles. Double-click an edge to insert a curve point. Keep an advanced `Convert to straight / smooth / cusp` menu rather than three default curve tools.

### 3.6 Split edge, insert point, change length [D]

**Add Point/Split Line:** hover edge, click to insert a point; **right-click** opens a split dialog. Official options include split into two distances, split by ratio, repeated divisions by length, and equal/uniform divisions. [S20]

**Change Length:** Edit Pattern -> right-click a segment -> `Change Length`; enter the new length and select direction/which side moves. Connected curve points can be moved or locked. [S21]

**[R] Critical:** length editing must change actual geometry in millimetres and update measurements, not just edit a label. For curved segments, decide explicitly whether the value means arc length or chord distance; display both when relevant. Add split by midpoint, length-from-start, ratio (e.g. 1/3), and N equal segments.

---

## 4. Precision: ruler, grid, snap, and measurements

### 4.1 MD snapping modes [D]

- **Snap to Grid:** coordinates/pieces/internal shapes can snap to grid intersections; grid spacing is configurable. [S22]
- **Snap to Pattern:** internal shapes and sewing lines are pulled to nearby existing pattern points/lines; the MD support page says it is enabled by default for the described version. [S23]
- **Smart Guide:** uses nearby point positions to guide/snap newly drawn or moved patterns and internal shapes. [S24]
- **Grid auto-adjust with zoom:** MD can automatically change visible grid spacing at different zoom levels; alternatively it can stay fixed. [S25]
- **Ruler guidelines:** horizontal/vertical guides can be dragged, offset by numeric distances, locked, hidden, or deleted. [S06]

**[R]** Show snap reasons inline (small label `endpoint`, `midpoint`, `grid`, `perpendicular`, `45°`, `guide`). Allow independent toggles and temporary `Alt` to disable snapping. Never let a screen-pixel snap override an explicitly typed numeric length.

### 4.2 POM / dimension tools [D]

CLO's **Point of Measure (POM)** tool lets users click a pattern/internal segment to build a measurement path, double-click or press Enter to finish, and later read the length from its POM collection. Shift triggers axis/45-degree guides. `P` toggles a particular POM creation mode (along a segment vs polygon) in versions after 2024.1. [S26]

MD also supports displays showing the distance of an internal shape to the surrounding pattern outline, measured from its center or boundary, with per-side left/right/top/bottom toggles. [S17]

**[R] Two measurement types:**

1. **Passive:** live segment lengths, curve arc lengths, angles, bounding dimensions, perimeter, and coordinates; toggle via `Show Dimensions`.
2. **Active:** persistent measurement annotations attached to a point/edge/path. When the shape changes, their displayed values recompute. A later advanced mode may allow driving geometry via editable measurement constraints.

Do not fake measurements by using pixel ratios at the browser display layer. Millimetres are the source of truth.

### 4.3 Modern CLO Pattern Drafter (relevant but out of v1) [D]

The current CLO Pattern Drafter has a measurement-first approach: choose a pattern type, use Simple/General/Custom measurement fields, generate a parametric piece, update the dimensions later, and optionally grade sizes. Its manual warns that directly editing a parametric pattern can break its connection to the drafter; changing POM values or editing in the Pattern Drafter preserves it. [S27]

**[R] Architectural lesson:** do not promise a full parametric constraint solver in v1. Keep a distinction between ordinary editable vector pieces and *parametric templates* generated from body measurements, with a visible `Detached from template` state if later manual edits break that relationship.

---

## 5. Sewing-specific tools, separate from normal graphics editing

### 5.1 Seam allowance [D]

**CLO:** Has a dedicated **Seam Allowance** tool; select a pattern-outline segment to add allowance. Its properties include width, line/point-based width in some versions, joint/corner type, smooth transitions, lock, and custom editing rules. Version warning: CLO's July 2026 help page states that point-specific seam width and Smooth Intersection are not supported in 2026.1; UI/features differ with releases. With default allowance settings, the allowance follows outline updates; custom allowance editing can preserve its own shape until refreshed. [S28] [S29]

**MD:** Has a general **Offset Pattern Outline** command from the right-click menu on selected whole/partial outlines, with extend/retract, distance, number of offsets, corner/side-segment methods, and option to leave the old outline as an internal line. This is not necessarily equivalent to CLO's production seam-allowance object. [S30]

**[R] Our required behavior:**

- Default piece has an editable **stitch/sewing contour**. Set allowance per full piece or per selected segment (`0`, `5`, `10`, `15` mm etc.).
- Display stitch line and generated **cut contour** as separate styles and include both in export when requested.
- For closed paths, use path orientation to compute outward offset; support concave corners, acute corners, curves, and lines.
- Let user choose **miter / round / bevel** corner method and a miter limit; alert on impossible/self-intersecting offsets instead of generating dangerous cut paths.
- When sewing contour changes, recalculate allowance automatically; the cut contour is generated rather than independently freehand-edited in v1.
- **Zero allowance on fold edge**, while other edges retain their allowance; edge-level overrides persist as geometry changes.
- A `0.5 cm` allowance means an **actual 5 mm geometric distance** away from the stitch line, not a 5-pixel line style.
- Print options `Cut only`, `Stitch only`, `Both`.

### 5.2 Darts [D]

Both products have a Dart tool: drag inside a piece to create a dart, or click once to enter values. The dialog can set dimensions independently on four directions relative to dart center and positioning relative to the pattern outline. [S31] CLO separately recognizes base darts. MD also exposes `Add Dart` on a selected *outline point* via context menu, specifying total width and dart length, and `Edit Dart` on dart segments. [S32]

**[R]** For garment drafting, model a dart as an *object* with apex, two legs, intake, edge attachment, and a fold direction. Give controls for width/intake, length/depth, rotation, and `close dart` preview. In early versions, simple two-leg triangular dart with dimension edit is enough; advanced dart manipulation/trueing can come later.

### 5.3 Notches [D]

CLO's Notch tool can add notches on outline edges. Right-click an edge to create by precise segment distance, ratio, or repeated spacing. Properties include notch type (e.g. T/V/I/U/box), length, angle, placement relative to seam allowance, orientation, and locked/fixed placement. [S33] [S34]

**[R]** One-click notch insertion on the stitch edge with editable `distance from nearest corner` (mm), `fraction along edge`, type (`single`, `double`, `V`, `T`) and depth. Notch positions must track geometry rather than fixed screen coordinates. Reflect notches correctly on the cutting contour with allowance.

### 5.4 Grainlines, cut-on-fold and pattern annotations [D]

CLO exposes grain direction as an angle in properties, with orientation rules (one-way/two-way/four-way) and locking. [S35] Pattern Symbols attach to outline/internal segments and can indicate `Place on Fold`. [S36] CLO Pattern Information has cut amount, pattern name, type, grainline, descriptions and version history. [S37]

**[R]** Implement a grain arrow with numeric angle; edge-based `Place on fold` mark; piece name; cut quantity (`Cut 1`, `Cut 2`, `Cut 2 mirrored`, `Cut on fold`); material/group and notes. If a piece is cut on fold, the fold edge should **not** receive a seam allowance by default. Keep text repositionable without moving fabric geometry.

### 5.5 Symmetry, mirror, unfold, linked editing [D]

- CLO supports cloning a pattern with **linked symmetric editing** or linked instances from a context menu. Edits to the source can propagate to linked copies; the link can be removed. [S38]
- CLO's `Unfold` operates by right-clicking a designated center/reference edge in Edit Pattern, mirroring a half-pattern into a full pattern. [S39]
- Several legacy MD keyboard maps list Ctrl+D as a symmetric linked clone and Ctrl+R as mirror paste; do not assume these are universal current defaults. [S40]

**[R]** Provide `Mirror`, `Duplicate`, `Create symmetric partner`, `Unfold across selected edge`, and `Break link`. Visually mark links. Avoid permanently duplicating every mirrored point until export; store a transformation or mirrored relationship where practical. Provide a single easy `Cut on fold` mode for ordinary half-pattern drafting.

### 5.6 Internal offsets and sewing-edge relationships [D]

CLO can offset an internal line or shape a given distance, multiple times, reverse offset direction, and optionally extend an internal line until it reaches the piece boundary. [S41] This is useful for parallel stitch guides, topstitch paths, hems, and pocket-placement guides.

Both programs offer 2D sewing tools such as Edit Sewing, Segment Sewing and Free Sewing, historically under `B`, `N`, `M`. Those are primarily **3D simulation seam connections**, not instructions to automatically cut a larger physical piece. [S40] [S42]

**[R]** v1 should *not* simulate sewing. Implement construction paths and optional named **seam-pair references**: select edge A and edge B -> show their stitch-line lengths and mismatch in mm. Later add pairing markers. Do not overload the term `seam allowance` to mean a sewing relationship.

---

## 6. Shortcut research: what is documented, what is legacy, what should be ours

### 6.1 Warning about versions [D]

CLO and MD offer **customizable keyboard shortcuts**. MD's 2025.0 help places configuration in Settings / Preferences / Shortcuts; CLO has a searchable User Settings / Shortcuts panel. The MD Active Tool Hotkey Viewer shows hotkeys for the currently active tool, which is a useful discoverability pattern. A new MD 2026 keyboard guide was announced June 24, 2026, but its downloadable keymap was not directly verified here. [S43] [S44] [S45] [S46]

Therefore, do **not** write application tests that assume all historical keys remain the installed 2026 defaults. Use the following as a **workflow reference** and implement a clearly labeled `CLO-like` optional shortcut preset if desired.

### 6.2 Historical 2D pattern tool shortcuts (Windows) [L]

This table comes from a third-party MD shortcut compilation maintained in 2025 and aligns with older CLO 2D training references. It is **not a verified 2026 shortcut sheet**. [S40]

| Tool / command | Legacy key | Our suggested treatment |
|---|---|---|
| Transform whole pattern | `A` | Optional CLO preset; our default `V` |
| Edit point/segment | `Z` | Optional CLO preset; our default `E` |
| Polygon | `H` | Optional CLO preset; our default `P` |
| Rectangle | `S` | Optional CLO preset; our default `R` |
| Ellipse | `E` | Shape dropdown; no key by default |
| Internal polygon/line | `G` | `I`, or choose line type within Draw |
| Internal ellipse | `R` | Shape dropdown |
| Edit Curvature | `C` | `C` |
| Edit Curve Point | `V` | Integrated into Curve/Edit Points |
| Add Point / Split Line | `X` | `X` |
| Trace | `I` | Optional digitization tool |
| Edit Sewing | `B` | Out of v1 |
| Segment Sewing | `N` | Out of v1 (reserve `N` for notch in our app) |
| Free Sewing | `M` | Out of v1 (our `M` means Measure) |
| Show line length | `Shift+Z` | Our toggle `D` |
| Focus zoom / fit selection | `F` | Keep `F` |
| Mirror paste | `Ctrl+R` | Keep context menu; avoid reusing browser refresh |
| Linked clone/symmetry | `Ctrl+D` | Optional; browser bookmarks conflict; offer toolbar/context menu |
| Clone as pattern | `Ctrl+Shift+C` | Menu first |
| Invert selection | `Ctrl+Shift+I` | Menu first |
| Layer clone over/under | `Ctrl+Shift+V` / `Ctrl+Shift+B` | Not v1 |

**Additional version-sensitive keyboard conflicts:** A third-party list uses `Shift+0` for Zoom Extents All, while an old CLO PDF/guide is indexed as `Shift+)`. Depending on keyboard layout these can represent a similar key location but are not safe as a hard-coded universal shortcut. MD added `Ctrl+G` for grouping internal shapes in 2025.1, even though older tables use `Ctrl+G` for a 3D operation. These reinforce the need for *tool/context-scoped* key handling. [S40] [S47]

### 6.3 Verified interaction modifiers during tool use [D]

| Active context | Input | Documented result | Source |
|---|---|---|---|
| Polygon/internal line | `Shift` while placing point | Horizontal/vertical/45° guide | [S11] [S16] |
| Polygon/internal line | `Ctrl+click` point (Windows) | Free curve point | [S11] [S16] |
| Polygon/internal line | Click and drag a new point | Bézier handles/curvature | [S13] |
| Polygon/internal line in progress | `Delete` or `Backspace` | Remove latest draft point | [S13] |
| Polygon/internal line in progress | `Esc` (or `Ctrl+Z`) | Cancel **whole current creation** | [S13] |
| Rectangle in progress | `Shift` | Square | [S14] |
| Rectangle in progress | `Ctrl` | From center | [S14] |
| Rectangle in progress | `Shift+Ctrl` | Centered square | [S14] |
| Point/piece selection | `Shift+click` | Add to selection | [S07] [S08] |
| Move selection | `Shift` or `Ctrl` modifier | Constrain motion along guides/axis/slope, depending on context | [S08] |
| Move selection (Windows) | Right-click *during drag* or `F1` | Numeric move dialog | [S07] [S08] |
| Move selection | Arrow keys | Nudge by configured step | [S10] |
| Selected piece | `F` | Focus/zoom selected | [S04] |
| Ruler | Drag from ruler | Add guide | [S06] |
| Ruler | `Ctrl`+drag | Guide in opposite axis | [S06] |
| POM tool | `P` | Switch measurement creation method (2024.1+) | [S26] |

**Do not transplant these modifiers verbatim when they conflict with a browser/OS or with a simpler app.** For our app, tooltips should state *exactly* what a modifier does in the active tool.

### 6.4 Proposed native shortcuts for a lightweight web pattern editor [R]

| Command | Windows/Linux | macOS | Notes |
|---|---|---|---|
| Select piece | `V` | `V` | Primary pointer |
| Edit points / edges | `E` | `E` | Distinct edit mode |
| Draw polygon / pattern | `P` | `P` | Cycle line/polygon subtype in toolbar |
| Rectangle | `R` | `R` | Opens size entry on single click |
| Curve / bend | `C` | `C` | Click-drag line to bend |
| Add / split point | `X` | `X` | Right-click for exact division |
| Measure | `M` | `M` | Persistent measurements |
| Notch | `N` | `N` | Click edge |
| Seam allowance | `S` | `S` | Apply/edit on current selection; disambiguate with save Ctrl+S |
| Toggle dimension labels | `D` | `D` | Segment lengths & angles |
| Fit selected | `F` | `F` | No effect if no selection; optionally fit all |
| Fit all | `Shift+F` | `Shift+F` | |
| Undo committed action | `Ctrl+Z` | `Cmd+Z` | Except tool-in-progress cancellation |
| Redo | `Ctrl+Shift+Z` | `Cmd+Shift+Z` | Optionally Ctrl+Y on Windows |
| Save project | `Ctrl+S` | `Cmd+S` | Browser shortcut intercepted only when app focused |
| Open project | `Ctrl+O` | `Cmd+O` | |
| Select all in current context | `Ctrl+A` | `Cmd+A` | |
| Duplicate piece | `Ctrl+D` **optional** | `Cmd+D` **optional** | Browser bookmark conflict; toolbar always available |
| Delete selected object | `Delete`/`Backspace` | `Delete`/`Backspace` | Confirm only destructive multi-piece deletes |
| Cancel current tool | `Esc` | `Esc` | No accidental project-wide undo |
| Pan temporarily | Hold `Space` + drag | Hold `Space` + drag | Key should not trigger simulation |
| Temporary snap bypass | Hold `Alt` | Hold `Option` | Show bypass state |
| Context actions | Right-click | Secondary click | Also `⋯` on mobile |

### 6.5 Shortcut resolution rules [R]

- Resolve keys in order: **text field > open dialog > active drawing transaction > selected object > global app**.
- If typing into a width field, `P`, `S`, `V` and arrow keys must remain normal text/input controls.
- In an active polygon, `Esc` cancels the current polygon; `Delete` removes its last point; only when not drawing does `Delete` delete selected geometry.
- Never bind plain `S` to save or bind `Space` to simulation.
- Show a searchable in-app `?` shortcut/help popover, plus tool-local hints; allow remapping and two presets (`Simple`, optional `CLO-like`).
- On touch, display alternatives for Shift/Ctrl/right-click. No essential action should exist *only* on keyboard.

---

## 7. Full tool behavior specification for builder agent

The following is **normative for our proposed app**. Labels in this section describe our target product, not an exact reconstruction of CLO/MD.

### 7.1 State machine

Use `mode = SELECT_PIECE | EDIT_GEOMETRY | DRAW_PATTERN | DRAW_INTERNAL | CURVE | SPLIT | MEASURE | ALLOWANCE | DART | NOTCH | GRAIN | PAN | CALIBRATE_IMAGE` plus `transaction = IDLE | PREVIEW | DRAGGING | NUMERIC_ENTRY | COMMIT_PENDING`.

- Every drawing action has a live preview, a clear commit step, and cancellability.
- In-progress edits are temporary until commit; cancel must revert the preview.
- Undo/redo should operate on semantic actions (`CreatePiece`, `MoveVertex`, `SetAllowance`, `SplitEdge`) rather than individual pointer-move frames.
- Object selection survives changing display toggles, but may be cleared by starting a new creation.
- Hover and selected states must be distinct in color, shape, and accessible label.

### 7.2 Select and transform acceptance criteria

1. Click a piece; property panel shows name, bounding width/height, position, rotation, cut count, allowance preset.
2. Drag selection; live X/Y displacement appears in mm; release commits one undo action.
3. Shift+click selects multiple pieces; moving all preserves relative positions.
4. Right-click piece reveals context actions `Duplicate`, `Mirror`, `Rename`, `Lock`, `Bring to front`, `Unfold`, `Add allowance`, `Export selected` (only valid actions enabled).
5. `E` enters point mode; click/drag a vertex; live adjacent lengths/angles update.
6. Non-uniform scaling should be explicit and warn that it changes pattern dimensions. **No accidental resizing using selection corners** when intending only to move.

### 7.3 Precise shapes acceptance criteria

1. Enter `18 cm` width and `24 cm` height for a rectangle. Its bounding box is exactly `180 × 240 mm` internally.
2. Polygon: click three points and return to the first; shape closes, validates simple contour, is editable.
3. Shift constrains next segment to 0/45/90 degrees; after entering a numeric length, the committed segment has that physical length.
4. `Edit segment length` on a straight edge changes the geometry, moving a chosen endpoint, without changing the other unless specifically chosen.
5. Split by `50%`, `10 mm from start`, or `4 equal` creates correctly located vertices.
6. Undo after a committed split restores the original single segment. Undo during in-progress polygon creation remains separate from project undo.

### 7.4 Curves acceptance criteria

1. Click-drag a selected straight edge to introduce a smooth curve.
2. Handle dragging adjusts the curve and keeps other piece coordinates stable unless expressly connected.
3. Numeric curve/arc length is computed geometrically with bounded numerical tolerance, not based on number of screen pixels.
4. Curves remain curves in saved JSON and vector PDF; no rasterization on export.
5. Splitting a curve preserves its original shape to within a numeric tolerance.
6. Tangency options can be deferred, but curve editing must not generate self-intersections without warning.

### 7.5 Seam allowance acceptance criteria

1. Draw a 100 × 100 mm square stitch contour; apply uniform 5 mm outward allowance. The cut boundary should be 110 × 110 mm under a mitered-square corner policy.
2. Toggle allowance off/on; original stitch contour remains exactly 100 × 100 mm.
3. Change allowance to 10 mm, and cut boundary changes without moving the stitch contour.
4. Set one edge `on fold`: it has 0 mm allowance, other edges retain 5 mm. Corner joining is coherent.
5. Edit a curve; cut line updates; measured offset should be correct within specified tolerance away from problematic high curvature.
6. Concave corners and self-intersecting offsets trigger a preview warning and safe geometry handling, not a silently corrupted cut line.
7. Selected segment can override global allowance width. Values and options survive save/reopen.

### 7.6 Marks and metadata acceptance criteria

- Place notch at `25 mm from start` along a segment; after resizing adjacent parts, its anchor remains semantically attached.
- Dart created with specified intake, legs and apex; edit depth after placement; both geometry and labels update.
- Grainline is a vector with angle, arrowheads and a single source value, e.g. `90°`.
- `Cut on fold` symbol follows its assigned edge, is shown in PDF and makes default seam width 0 on that edge.
- Piece annotation includes `name`, `size`, `fabric`, `cut quantity`, `mirror on cut`, `notes`, and optionally version.
- Visibility toggles never delete metadata.

### 7.7 Image-to-pattern digitization [R]

Reference photo/background images are available in MD via the canvas context menu, and can be traced; official support explicitly identifies this workflow. [S48] **However, reference photo tracing is not automatically dimensionally accurate.**

Implement:

1. Import PNG/JPEG as a background reference layer, locked by default.
2. For a flat scan, select two points known to be `100 mm` apart and type the distance; derive image-to-model scale.
3. For an angled photograph, allow a four-corner perspective correction first; then calibrate using a ruler/test square (do not treat correction as perfect if the paper curls).
4. Trace with Polygon/Curve tools. Preview measured segment lengths live.
5. Optional opacity, lock, rotate, crop; preserve the original image + transform and calibration data in project.
6. Warn if image has only one scale reference, extreme perspective, or unknown lens distortion.
7. Ensure image layer is excluded from manufacturing PDF by default; optionally include an underlay for review.

### 7.8 Print and export accuracy [D]/[R]

**Documented software behavior:** CLO has a **2D Patterns (1:1)** snapshot/export workflow with page presets, size units, image/file format (PDF/PNG/JPEG/DXF listed in current help), line/info toggles, scale and rotation. CLO also supports PDF vector-pattern export and industrial DXF interchange. MD documents its 2D 1:1 snapshot with presets (A4 among them), physical units, resolution, line display options, JPEG/PNG output on the referenced manual page. **Do not claim MD's snapshot exports PDF on the basis of that particular help article.** [S49] [S50] [S51] [S52]

**Our mandatory A4 PDF behavior:**

- Layout engine stores and calculates in **millimetres**. `1 mm = 72/25.4 PDF points`; page A4 = **210 × 297 mm** physically.
- Keep **PDF 1:1 separate from viewport zoom**. Never use CSS screen DPI as a print measurement.
- Two export modes: `One large sheet` and `Tiled A4`.
- Tiling must account for configurable unprintable margins (e.g. 5 mm); default 10 mm overlap between tile content; number pages in row-major order and mark alignment crosses/trim boundaries.
- Add a **100 mm reference ruler** and **50 × 50 mm square**, plus `Print at actual size / 100%, disable Fit to Page` note.
- Export stroke widths in physical units and keep dimensions legible; do not silently scale a too-large piece to fit a page.
- Show `stitch`, `cut`, `grain`, `notches`, `labels`, `guides` as independently controlled export layers/options.
- If a pattern crosses a tile boundary, rejoin as a continuous vector path after taping, not a gap caused by omitted clipping overlap.
- If user chooses 0.5 cm seam allowance, exported cut geometry is offset by 5 mm in PDF world coordinates.

---

## 8. Suggested implementation architecture (not copied from CLO/MD)

### 8.1 Technology [R]

- **TypeScript** and a typed geometry model in **mm**.
- **SVG** for editable, inspectable vector rendering at first; canvas/WebGL only if performance truly requires it. Keep geometry engine independent of renderer.
- State management with reversible command/history objects. Autosave to local storage/IndexedDB, plus import/export JSON files.
- PDF creation with a library supporting vector paths and explicit PDF page sizes. Export from geometry data, **not a screenshot**.
- Dedicated computational geometry helpers for Bézier arc length, offset paths, polygon validity, intersections and clipping. Test these with pure-unit tests without UI.

### 8.2 Suggested serializable data model [R]

```ts
type Mm = number;
type Vec2 = { x: Mm; y: Mm };
type Segment =
  | { id: string; kind: 'line'; from: string; to: string }
  | { id: string; kind: 'cubic'; from: string; to: string; c1: Vec2; c2: Vec2 };

type EdgeRole = 'seam' | 'fold' | 'hem' | 'raw-edge';
type InternalRole = 'construction' | 'dart' | 'fold' | 'stitch' | 'placement';

type PatternPiece = {
  id: string;
  name: string;
  vertices: Record<string, Vec2>;
  segments: Segment[];        // continuous closed sewing outline
  internalPaths: Array<{ id: string; role: InternalRole; segments: Segment[] }>;
  edgeRoles: Record<string, EdgeRole>;
  seamAllowance: {
    defaultMm: Mm;
    overridesMm: Record<string, Mm>;  // by stable segment id
    join: 'miter' | 'round' | 'bevel';
  };
  grainAngleDeg?: number;
  cut?: { quantity: number; onFold: boolean; mirrored: boolean };
  notches: Array<{ id: string; segmentId: string; fraction: number; type: string }>;
  annotations: Array<{ id: string; text: string; position: Vec2 }>;
  transform: { translate: Vec2; rotationDeg: number };
};

type Project = {
  schemaVersion: number;
  unit: 'mm';                // display unit chosen separately
  pieces: PatternPiece[];
  guides: Array<{ id: string; axis: 'x' | 'y'; positionMm: Mm }>;
  references: Array<{ id: string; imageRef: string; transform: number[]; locked: boolean }>;
};
```

**Notes:** In production, replace `string` segment IDs with stable unique IDs and define typed dart/measurement objects instead of encoding everything as `internalPaths`. Offset **cut contours should normally be derived**, not saved as disconnected freehand outlines. Define consistent winding (clockwise or anticlockwise) and a documented unit tolerance.

### 8.3 Geometry and rendering invariants [R]

1. World coordinates and shape measurements always use mm, independent of zoom/pan, DPI, font size or device pixel ratio.
2. A piece contour must close exactly and must not contain unintended self-intersections.
3. Internal lines can be open; cutting contours cannot, unless deliberately representing a special cutting instruction.
4. Splitting a straight or cubic segment preserves the original total path; a Bézier split should preserve shape using de Casteljau subdivision.
5. `Arc length` measurement is separate from the straight endpoint-to-endpoint `chord` length.
6. A point/edge's ID remains stable through unrelated editing; dependent marks refer to IDs, not arbitrary array indices.
7. Importing SVG/PDF/DXF must explicitly handle units and transformations; no silent points↔mm guess.
8. Visual stroke width does not add to or subtract from piece geometry; PDF clipping should not alter offsets.
9. Every committed operation is undoable; redo restores exact geometry and metadata.
10. Numerical validations should have a stated tolerance, e.g. `<= 0.05 mm` for internal coordinate/length test cases and a measured printed-output tolerance appropriate to printer hardware. Never promise the physical printer exceeds its own accuracy.

---

## 9. Implementation order (optimized for ease of use)

### Phase 1: trustworthy core (ship first)

- Millimetre world coordinates, pan/zoom, selectable pieces and point editing.
- Polygon + rectangle, numeric segment lengths and exact size input.
- Curves and editing; split segment; undo/redo.
- Ruler/grid, snap-to-point/edge/grid, line dimensions, persistent save/load JSON.
- **Vector A4 PDF at 100%** with tiled pages and calibration check.

**Exit gate:** A user can draft a wallet panel with known measurements, save/reopen it, export to A4, print at 100%, and verify the reference square with a ruler.

### Phase 2: manufacturing essentials

- Robust seam allowance with independent stitch/cut contours and per-edge overrides.
- Dart, notch, grainline, fold edge, piece metadata, cut quantity, mirror/unfold.
- Basic internal construction/stitch lines and line-type visibility.

**Exit gate:** Piece-specific 0.5 cm allowance shows the correct offset and all fold/notch metadata prints consistently.

### Phase 3: digitization and garment productivity

- Calibrated image import/tracing, guide offsets, `POM` measurements.
- Link / duplicate symmetry; point/edge numeric inspector; seam-edge length comparison.
- Desktop/mobile UX polish, key remapping, optional CLO-like shortcut preset.

### Later; do not block v1

- Fully parametric body-measurement templates, sizes/grading, nested print layouts, sophisticated dart rotation/trueing, industrial DXF-AAMA/ASTM interchange, AI pattern suggestions, automatic photo pattern detection, fabric utilization.
- **Explicitly exclude** 3D avatars, cloth simulation, texture painting, physical fabrics, animation, rendering, rigging, game export, and sewing-line simulation from the initial product.

---

## 10. Practical design decisions and open questions for builder agent

| Question | Default decision |
|---|---|
| Is geometry stored in px? | **No**, only world mm; px is for display and pointer hit testing |
| Do we use SVG alone as the source of truth? | **No**, typed geometry first; SVG render generated from it |
| What does a selected segment length mean? | Exact geometric length, curve **arc length** if curved; separately show chord |
| Does allowance modify the sewing outline? | **No**, derive cut outline from sewing outline |
| Does the fold edge get allowance? | **No by default** |
| Can users freehand draw without numeric input? | Yes, with persistent numeric editing afterward |
| Are we making a 1:1 clone of CLO? | **No**, only familiar, predictable workflows |
| Can one edit a pattern on a phone? | Yes for basic edits; offer touch controls, enlarged hit targets and numeric inspector |
| Does grid snapping guarantee pattern precision? | No, typed dimensions and geometry model do |
| Will the web app support printer calibration? | Yes; include test square and printing instructions |
| What is in the first release? | Precisely measured 2D vector drafting and 1:1 A4 PDF export |

### Concrete end-to-end test scenarios

**Test A: exact rectangle.** Start empty project. Draw a `180 × 240 mm` panel, add 5 mm allowance on all edges. Toggle Cut only. Export 1:1 tiled A4 PDF. The geometry should measure `190 × 250 mm` on the cut contour, assuming mitered outward corners. Verify PDF dimensions independently of browser zoom.

**Test B: fold edge.** Draw a half-piece with one vertical edge designated `cut on fold`. Set 10 mm allowance elsewhere. The fold edge remains at zero offset, mark prints, and the output remains correct after mirror/unfold preview.

**Test C: curved seam.** Make an armhole-like cubic curve and show exact arc length. Copy/mirror a piece; modify one handle; verify cut offset recalculation and no corrupted geometry.

**Test D: darts/notches.** Insert dart with `20 mm` total intake and `100 mm` depth; insert notch 30 mm from a reference edge endpoint. Resize an unrelated edge; metadata retains its references.

**Test E: image tracing.** Import a scan with known 100 mm calibration line. Trace its contour. A traced segment matching the calibration line must measure 100 mm in the project; photo correction warnings appear if distortion is suspect.

**Test F: persistence.** Save JSON, reload into fresh browser session, compare geometry, IDs, seam overrides, fold marks, notch positions, and export page count. They must match.

**Test G: modal keys.** While drawing a polygon, Backspace removes most recent point, Esc cancels the draft, and undo history for completed pieces remains intact. While a numeric field is focused, ordinary typing and arrow keys don't trigger tools or move pieces.

---

## 11. Verified reference index

The `[S##]` IDs above are **clickable source references**, not links to copied material. Sources are mainly official help documentation; the keyboard compilation is identified separately. If a tool is being implemented from a cited source, read the linked full article at that time for version-specific options.

| ID | Source | What it supports |
|---|---|---|
| S01 | [MD 2D Window](https://support.marvelousdesigner.com/hc/en-us/articles/47358246789529-2D-Window) | Scope of the 2D workspace |
| S02 | [MD menu/context popup](https://support.marvelousdesigner.com/hc/en-us/articles/47358240361625-Menu) | Context-sensitive menus |
| S03 | [MD 2D display controls](https://support.marvelousdesigner.com/hc/en-us/articles/47358205499033-2D-Window-Display-Icons-Ver-5-1-4-and-above) | Visibility, ruler, name, length/angle, grainline, locks |
| S04 | [MD 2D view controls](https://support.marvelousdesigner.com/hc/en-us/articles/47358313649177-2D-Pattern-View-Controls) | F to focus, zoom all, smart panning |
| S05 | [MD view-control preferences](https://www.marvelousdesigner.com/en-gb/manuals/articles/47358287009049) | Configurable mouse/keyboard pan and zoom |
| S06 | [MD ruler and guidelines](https://support.marvelousdesigner.com/hc/en-us/articles/47358193902873-2D-Pattern-Window-Ruler-Ver-2024-1) | Ruler units, origin, drag guides, offset/lock |
| S07 | [MD select/transform whole pattern](https://support.marvelousdesigner.com/hc/en-us/articles/47358185711257-Select-Move-Transform-Pattern) | Shift select, drag, numeric move, scale, pivot |
| S08 | [MD edit points/segments](https://support.marvelousdesigner.com/hc/en-us/articles/47358216311193-Select-Move-Point-Segment) | Point/edge select, constrained/numeric movement |
| S09 | [MD transform points/segments](https://support.marvelousdesigner.com/hc/en-us/articles/47358256808857-Transform-Point-Segment) | Bounding box for subselection |
| S10 | [MD arrow-key movement](https://support.marvelousdesigner.com/hc/en-us/articles/47358306474393-2D-Environment-setting-Move-with-Arrow-Keys) | Configurable nudge increments |
| S11 | [MD Polygon](https://support.marvelousdesigner.com/hc/en-us/articles/47358178952345-Polygon) | Polygon click sequence, modifier keys, numeric dialog |
| S12 | [CLO Polygon](https://support.clo3d.com/hc/en-us/articles/115012226887-Polygon) | Polygon controls and cancel behavior |
| S13 | [CLO create Bézier curves](https://support.clo3d.com/hc/en-us/articles/115002752688-How-to-Create-B%C3%A9zier-Curves) | Drag handles and DXF conversion caveat |
| S14 | [MD Rectangle](https://support.marvelousdesigner.com/hc/en-us/articles/47358203451673-Rectangle) | Shift/Ctrl size/center, numeric width/height |
| S15 | [MD pattern-shape tool directory](https://support.marvelousdesigner.com/hc/en-us/categories/51985515993625-Manual) | Shape tool names/categories |
| S16 | [MD Internal Polygon/Line](https://support.marvelousdesigner.com/hc/en-us/articles/47358276422297-Internal-Polygon-Line) | Internal line close/finish, length, position and modifiers |
| S17 | [MD Show 2D Measurements](https://support.marvelousdesigner.com/hc/en-us/articles/47358141416985-Show-2D-Measurements-ver-2025-0) | Internal geometry to edge distances |
| S18 | [CLO Edit Curvature](https://support.clo3d.com/hc/en-us/articles/115000375047-Edit-Curvature) | Drag edge to bend / adjust |
| S19 | [CLO Edit Curve Point](https://support.clo3d.com/hc/en-us/articles/115000375127-Edit-Curve-Point) | Add/move curve point |
| S20 | [CLO Add Point/Split Line](https://support.clo3d.com/hc/en-us/articles/115000375727-Add-Point-Split-Line) | Exact/ratiometric/uniform splits |
| S21 | [CLO Change Length](https://support.clo3d.com/hc/en-us/articles/115000416847-Change-Length) | Numeric segment edit |
| S22 | [MD Snap to Grid](https://support.marvelousdesigner.com/hc/en-us/articles/47358253117849-2D-Environment-setting-Snap-to-Grid) | Grid snapping, spacing |
| S23 | [MD Snap to Pattern](https://support.marvelousdesigner.com/hc/en-us/articles/47358250182681-2D-Environment-setting-Snap-to-Pattern) | Snap internal lines to nearby pattern geometry |
| S24 | [MD Smart Guide](https://support.marvelousdesigner.com/hc/en-us/articles/47358294741017-2D-Environment-setting-Smart-Guide) | Snap/guidance based on neighboring points |
| S25 | [MD fixed/zoom-adaptive grid](https://support.marvelousdesigner.com/hc/en-us/articles/47358226342297-2D-Environment-setting-Fix-Grid-Display) | Grid spacing display options |
| S26 | [CLO Create POM](https://support.clo3d.com/hc/en-us/articles/360025716774-Create-POM) | Measurement path, shortcuts, graduation |
| S27 | [CLO Pattern Drafter](https://support.clo3d.com/hc/en-us/articles/45053653355545-Pattern-Drafter) | Measurement-driven parametric drafting (updated Nov 2026) |
| S28 | [CLO Create Seam Allowance](https://support.clo3d.com/hc/en-us/articles/115013215727-Create-Seam-Allowance) | Dedicated allowance tool |
| S29 | [CLO seam allowance properties](https://support.clo3d.com/hc/en-us/articles/115013370408-Edit-Seam-Allowance-Properties) | Width/corners/custom rules and 2026.1 caveats |
| S30 | [MD Offset Pattern Outline](https://support.marvelousdesigner.com/hc/en-us/articles/47358359572121-Offset-Pattern-Outline) | Extend/retract, offset options |
| S31 | [MD Dart](https://support.marvelousdesigner.com/hc/en-us/articles/47358304858265-Dart) | Numeric dart sizes/position |
| S32 | [MD Segment Darts](https://support.marvelousdesigner.com/hc/en-us/articles/47358357640345-Segment-Darts) | Edge-attached darts |
| S33 | [CLO Create Notch](https://support.clo3d.com/hc/en-us/articles/115013214287-Create-Notch) | Notch and distance/ratio placement |
| S34 | [CLO Edit Notch Properties](https://support.clo3d.com/hc/en-us/articles/115013369268-Edit-Notch-Properties) | Notch types and cutting relation |
| S35 | [CLO Grainline](https://support.clo3d.com/hc/en-us/articles/37494551581593-Grainline) | Grain angle/orientation/locking |
| S36 | [CLO Pattern Symbols](https://support.clo3d.com/hc/en-us/articles/115014763827-Create-Pattern-Symbols) | Cut-on-fold symbols |
| S37 | [CLO Pattern Information](https://support.clo3d.com/hc/en-us/articles/59635504938777-2D-Pattern-Information) | Name, cut qty, stages, revision history |
| S38 | [CLO Linked Editing](https://support.clo3d.com/hc/en-us/articles/115000354528-Linked-Editing) | Linked symmetry/instances |
| S39 | [CLO Unfold](https://support.clo3d.com/hc/en-us/articles/115000337267-Unfold) | Mirror half pattern across edge |
| S40 | [Tutorial Tactic MD shortcut map (secondary, 2025)](https://tutorialtactic.com/blog/marvellous-designer-shortcuts/) | Historical keyboard table, **verify in modern builds** |
| S41 | [CLO Offset as Internal Line](https://support.clo3d.com/hc/en-us/articles/115012380888-Offset-as-Internal-Line) | Repeat/offset internal lines |
| S42 | [MD Seamline Property](https://support.marvelousdesigner.com/hc/en-us/articles/47358171818521-Seamline-Property-ver-2025-0) | Sewing line as a simulation property, distinct from physical cut allowance |
| S43 | [MD Shortcut Preferences](https://support.marvelousdesigner.com/hc/en-us/articles/47358120094361-Shortcuts-Hotkeys-2025-0) | Customizable shortcut map |
| S44 | [CLO Set Shortcuts](https://support.clo3d.com/hc/en-us/articles/115002563107-Set-Shortcuts) | Customizable shortcut map |
| S45 | [MD Active Tool Hotkey Viewer](https://www.marvelousdesigner.com/en-gb/manuals/articles/47358326346521) | Tool-context hotkey help |
| S46 | [MD 2026 shortcut-guide announcement](https://www.marvelousdesigner.com/resources/newsroom/d9fffb13e83a401baa91b639c7795f15) | Existence of new 2026 shortcut publication, **not verified contents** |
| S47 | [MD group internal lines/shapes](https://support.marvelousdesigner.com/hc/en-us/articles/48977895500825-Group-Internal-Lines-and-Shapes) | Ctrl+G in newer 2025.1 context |
| S48 | [MD background image support](https://support.marvelousdesigner.com/hc/en-us/community/posts/48269274549273-Bring-up-graphics-and-make-them-visible-in-the-full-graphics-2D-window) | Background reference image and tracing route |
| S49 | [CLO 2D Snapshot (1:1)](https://support.clo3d.com/hc/en-us/articles/115000556948-2D-Snapshot-1-1) | Physical 1:1 output and format controls |
| S50 | [MD 2D Snapshot 2025.0](https://support.marvelousdesigner.com/hc/en-us/articles/47358119414937-2D-Snapshot-2025-0) | A4 size and measured 1:1 raster snapshot workflow |
| S51 | [CLO Adobe AI/PDF import/export](https://support.clo3d.com/hc/en-us/articles/115004273427-2D-Pattern-AI-PDF-Import-Export) | PDF vector interchange |
| S52 | [CLO DXF import/export](https://support.clo3d.com/hc/en-us/articles/115000493067-2D-Pattern-DXF-Import-Export) | Industrial interchange, cutting/sewing distinction |

## 12. Final instructions to the coding agent

Treat this as a **research-backed UX and technical requirements document**. Reproduce the **discoverable, precision-first 2D experience**, not the brand identity or exact tool arrangement of either proprietary application.

Before implementing any feature, classify it as `v1 must-have`, `phase 2`, or `later`. Don't add 3D simulation, avatar tools or texture workflows to the baseline. Start with a tested, unit-correct geometry model, then build simple tools, then add garment-specific semantics, then accurate export. Where the sources describe multiple historical variants, choose one simple behavior and show it in the UI rather than mixing variants unpredictably.

---

## 13. Micro-interactions that make drafting feel effortless (builder-critical addendum)

**This section is a mandatory interaction specification, not optional polish.** A program can offer all the correct drawing tools and still be miserable to use if these details are wrong. Implement and test the behavior here alongside the core geometry features. Unless marked **[D]**, the precise behavior, shortcut, numeric default, and acceptance criterion below are **[R] proposed for our editor**, not a claim that CLO/MD implements it identically.

### 13.1 Automatic snapping: magnetic but predictable [D] / [R]

**Documented inspiration:** MD has separate Smart Guide, Snap to Pattern, and Snap to Grid settings [S22–S24]. CLO's Add Point/Split Line documentation explicitly says that hovering an edge displays a smart guide and the cursor snaps to an intersection [S20]. The following priority scheme and hysteresis are our design proposal.

**[R] Required snap targets (when eligible):**

- Existing endpoints/vertices, including on internal construction lines.
- Midpoints of straight segments; optional arc-length midpoints of curves.
- Points projected onto an existing segment or curve; segment intersections.
- Horizontal/vertical/45° alignments with the active starting point or nearby significant vertices.
- Perpendicular projections, tangencies where geometrically defined, guide intersections.
- Grid intersections at a configurable *physical* spacing (e.g., 10 mm major / 1 mm minor); never snap to the rendered grid image itself.
- Pattern edges/curves and guide lines when a tool expects an on-edge location.

**[R] Recommended resolution rules:**

1. Start with a screen-space acquisition radius of ~8 px on pointer devices, ~16 px on touch; make both configurable. These are hit-testing radii **only**, never model-unit offsets.
2. Show the candidate before committing: small ring/marker + short label such as `Endpoint`, `Midpoint`, `Grid`, `Horizontal`, `On edge`, plus a faint guide line. Do not wait until mouse-up.
3. Give exact vertices/intersections higher priority than grid; prioritize the active tool's relevant targets. Do not silently pull a point to an unrelated faraway edge.
4. Use snap hysteresis: once a candidate is acquired, keep it until the cursor moves distinctly farther away (e.g. 1.5× acquisition radius). This prevents jitter between competing snap targets.
5. When equally good candidates overlap, show a choice/cycle mechanism (`Tab` or a target selector) rather than random switching.
6. Hold `Alt`/`Option` to bypass snaps temporarily; also provide an obvious toolbar toggle and per-type settings.
7. Holding `Shift` during line drawing **constrains the direction** (0°, 45°, 90°, etc.) relative to the current start. Show angle and constraint; make the modifier behavior visible and consistent.
8. Explicit numeric input wins over snapping. If a user enters exactly `125 mm`, the committed line must remain exactly `125 mm`, even when a grid point is nearby. Angle constraints and typed dimensions must have an explicit, documented priority.
9. Zooming changes the pickup radius in pixels, **not** the stored millimetre coordinates. A snapped point must land on the exact target coordinates.
10. On touch, show target preview on initial press, offer optional snap-lock, and require clear visual confirmation before committing a crowded target.

**[R] Edge case:** if a typed length and a proposed endpoint snap conflict, show a constraint conflict or prioritize the typed length with an unsnapped endpoint. Never secretly change the length.

### 13.2 Measurements while *doing* something, not merely after selecting [D] / [R]

**Documented inspiration:** CLO/MD support numeric dimensions and measurement displays [S03, S16, S17, S21]. Specific transient overlay design below is **[R]**.

**[R] Always show relevant, transient, direct-on-canvas values:**

| Operation | Visible live values | Placement / behavior |
|---|---|---|
| Draft next polygon/line segment | Length in cm/mm, direction/angle, X/Y when useful | Floating near segment midpoint; update while pointer moves |
| Move a vertex | Adjacent segment lengths (before → now), relevant angles, delta X/Y | Near affected segments and a compact cursor tooltip |
| Move an entire pattern | Delta X / delta Y and optional selected-piece dimensions | Near dragged piece; dimensions do not imply scale |
| Resize or change line length | Current vs target length, delta, active anchor (Start/End/Both) | Adjacent to edited edge; preview follows entry |
| Draw rectangle | Width × Height; show from-center mode if active | Adjacent to opposite corner while dragging |
| Insert point on edge | Distance from start and end, percentage of edge, arc length for curves | Hover tooltip before clicking, editable from context action |
| Bend curve / drag handle | Curve arc length, optionally chord length, nearby segment changes | Near curve, throttle label layout only (not geometry) |
| Offset / seam allowance | Signed or unsigned width and preview of cutting contour | Next to selected edge; allow direct numeric typing |
| Move internal line | Distance to nearby outline or construction guide | Optional per-direction dimensions; hide unrelated measurements |

**[R] Display rules:**

- User-friendly units (e.g. `12.5 cm`) but source-of-truth geometry in millimetres. User can toggle mm/cm; input accepts `125 mm` and `12.5 cm`.
- Show 1–2 decimal places for cm as appropriate; don't round the underlying geometry. Respect explicit numeric precision when editing.
- An overlay must not cover its own draggable handle. Place labels dynamically; allow `D` to toggle passive dimensions, but show the most relevant one *temporarily* during a numeric edit even if global dimensions are hidden.
- On drag start, capture the original exact geometry. During drag, calculate dimensions from the current candidate state; on Esc revert; on release commit one undo step.
- Make a displayed dimension directly editable: click/tap the length label or press `Enter` while an edge is selected to focus a length field. Show draft change before confirmation.
- If multiple edges are affected, emphasize the selected edge and show neighboring lengths subdued; never flood the screen with all dimensions at once.
- Distinguish **curved path length** from **straight chord** (`Arc 13.25 cm`, `Chord 12.80 cm`). Never display one as the other.

### 13.3 Drawing a line should feel almost automatic [D] / [R]

**Documented inspiration:** Polygon/internal lines support click-to-place, directional guides, right-click precision dialogs, and special finish/cancel gestures [S11, S12, S16]. The streamlined flow is **[R]**.

**[R] Interaction contract:**

1. Select Draw; first click sets origin; mouse movement previews the next segment **without committing** it.
2. Preview shows `length • angle` at all times, with snap marker/guide whenever applicable.
3. Click commits an endpoint; continue from that endpoint. `Shift` uses constrained directions.
4. While previewing, start typing `120` to open a compact inline numeric length field (or press `Enter` / click displayed dimension). Support explicit units and optional angle. Confirm to create an exact-length line along the currently previewed/constrained direction.
5. Right-click / the on-screen `⋯` gives `Enter length`, `Enter angle`, `Add curve point`, `Close pattern`, `Finish open line`, and `Cancel` if available in context.
6. Click the first vertex to close a valid outline. Double-click the last endpoint or use `Finish` to finish an open construction line. Clearly distinguish open internal/construction paths from closed cut pieces.
7. Backspace while creating removes the last newly placed point, **not** an already completed project object. Esc cancels the unfinished creation and restores prior content.
8. Prevent accidental doubled vertices from a double-click, reject zero-length edges, and flag intersections instead of silently producing a broken pattern.
9. Auto-pan near canvas borders while drafting, without changing draft geometry or model scale.
10. Snap highlights and measurements must work *before* the click on all drawing operations, including rectangle corners and internal lines.

### 13.4 Making and editing curves without fighting handles [D] / [R]

**Documented inspiration:** CLO's Edit Curvature bends an edge by dragging it; Edit Curve Point adds editable curve points; point-drag can create Bézier handles [S13, S18, S19]. The specific unified UI below is **[R]**.

**[R] Primary route (easy):**

- Select `Curve`, hover a straight edge, and **drag the edge itself** to bend it. Show a translucent preview and transient arc-length label. Release commits a smooth curve.
- Drag a newly placed point during line drawing to introduce a smooth curve immediately. A plain click makes a corner vertex, not a curved point.
- Double-click an existing edge to add an editable point. On a curve, split the cubic with **de Casteljau**, preserving the visible curve exactly at insertion.
- Clicking a curve shows **few** visible controls; only show handles for the actively edited point, not every handle on the page.
- Dragging a Bézier handle moves curvature; default smooth handles preserve tangency at that point. `Alt`/`Option` temporarily breaks handle coupling (cusp mode). Expose `Corner / Smooth / Symmetric` in context menu so this does not depend on learning a shortcut.
- The cursor/tooltip must distinguish `Drag edge to bend`, `Drag point to move`, and `Drag handle to change tangent`.
- Provide `Convert to straight` and `Smooth point` actions without switching into an advanced mode.
- On touch, increase the selectable handle radius, allow selecting a curve first before dragging, and offer a compact bottom-sheet length/angle editor.

**[R] Accuracy / behavior rules:**

- Curved lengths are true integrated arc lengths within a tested tolerance, not the distance between endpoints.
- When splitting at the visual center of a curve, explicitly choose **half arc length** for the midpoint function, not `t = 0.5` unless those happen to coincide.
- Keep adjacent endpoints stationary when bending an edge. When moving a shared endpoint, update adjacent segments coherently; expose smooth/join-preservation semantics.
- If a curve becomes too sharp for its seam offset, warn during preview rather than producing a corrupted cutting outline.
- Offer an `Undo` action that reverses a full bend, not every mouse-move sample.

### 13.5 Adding and splitting points: click first, precision one step away [D] / [R]

**Documented inspiration:** CLO's Add Point/Split Line supports hover/snap, click-to-insert, exact split distances and ratios, repeated splits from start/opposite/center, and uniform splits [S20]. The behavior below is our proposed simplified UI.

**[R] Primary flow:**

- In `Edit points` mode, **double-click any segment** to insert a normal point. For a dedicated `Split` tool, one click inserts. Show hover ghost-point so placement is predictable.
- Hovering a segment displays `From start: 42 mm | To end: 78 mm`; show `35%` when useful. Mark the actual snapped location.
- Right-click / tap `⋯` on segment offers `Add point at distance…`, `Add at midpoint`, `Add at %…`, `Divide equally…`, and `Divide every N mm…`.
- In the precision dialog, show a tiny visual `A → B` arrow and choose `From A`, `From B`, or `From center`. **Never assume “start” is obvious from the screen orientation.**
- Optionally toggle `Keep existing shape`; when inserting onto a cubic, preserve its geometry exactly. Inserting a point must not introduce a kink unless the user subsequently moves it.
- Allow deleting a newly inserted control point; warn if doing so would alter the path beyond tolerance. Explicit `Delete point and straighten` is a separate operation.
- Snapped insertion should behave consistently when the line is extremely short or the canvas is highly zoomed out; if ambiguous, zoom or use numeric placement.

### 13.6 Change length: keep start, keep end, or change both sides [D] / [R]

**Documented inspiration:** CLO `Edit Pattern → right-click segment → Change Length` offers numeric `Length`, `Direction`, and `Lock Curve Points` [S21]. The public help page does **not enumerate a guaranteed current three-choice UI**. The **three anchor behaviors below are explicitly our app's requirement**, matching the user's requested workflow.

**[R] Required mini-dialog / inline edge inspector:**

```text
Change segment length
Current:   10.00 cm       New: [ 12.00 ] cm
Anchor:    (●) Keep A fixed   (○) Keep B fixed   (○) Both / center
           A ●────────────● B    (preview updates immediately)
[ ] Preserve adjacent curve shape where possible
                                Cancel  Apply
```

- `Keep A fixed`: leave starting vertex A fixed, move B along the original A→B direction.
- `Keep B fixed`: leave ending vertex B fixed, move A in the opposite direction.
- `Both / center`: preserve segment midpoint; distribute length difference **equally** between endpoints.
- When both endpoints are part of a closed outline, adjacent segments must reconnect to their updated endpoints. State/preview whether neighboring angles/curves will change. Never tear the polygon open or silently move unrelated vertices.
- Show visible A/B glyphs at the actual endpoints and highlight which endpoint(s) will move. Let user click an endpoint on canvas to change anchor.
- Length field shows real-time preview; Enter applies, Esc reverts. Invalid/zero/negative values do not commit.
- When **multiple selected segments** or compound curves are selected, require explicit scope (`this segment`, `selected chain`, etc.) rather than applying a dubious single-segment interpretation.
- For a **curved edge**, label the target as `Arc length` and also show chord. A simple v1 may disable arc-length changing and offer chord-only changes with an explicit label; it must not claim to set arc length while merely moving endpoints.

**[R] Exact straight-line example:** original segment A=(0, 0) mm, B=(100, 0) mm, length 100 mm. Set new length **120 mm**:

| Anchor | New A | New B | Intuition |
|---|---|---|---|
| Keep A fixed | (0, 0) | (120, 0) | Add 20 mm at B side |
| Keep B fixed | (-20, 0) | (100, 0) | Add 20 mm at A side |
| Both / center | (-10, 0) | (110, 0) | Add 10 mm each side |

Set new length **80 mm**:

| Anchor | New A | New B | Intuition |
|---|---|---|---|
| Keep A fixed | (0, 0) | (80, 0) | Remove 20 mm from B side |
| Keep B fixed | (20, 0) | (100, 0) | Remove 20 mm from A side |
| Both / center | (10, 0) | (90, 0) | Remove 10 mm from each side |

For a nonzero straight segment with A and B and user-supplied `newLength > 0`:

```ts
const ux = (B.x - A.x) / oldLength;
const uy = (B.y - A.y) / oldLength;
const delta = newLength - oldLength;

switch (anchor) {
  case 'A':    newA = A; newB = {x: B.x + ux*delta, y: B.y + uy*delta}; break;
  case 'B':    newA = {x: A.x - ux*delta, y: A.y - uy*delta}; newB = B; break;
  case 'BOTH': newA = {x: A.x - ux*delta/2, y: A.y - uy*delta/2};
               newB = {x: B.x + ux*delta/2, y: B.y + uy*delta/2}; break;
}
```

This describes **only the edited segment's endpoints**. A real pattern engine also updates shared vertices, adjacent edges, curve handles/constraints, seam offsets, notches and dimension annotations *transactionally*; save/reopen must preserve resulting topology. Warn if endpoint movement introduces self-intersections. Do not attempt to preserve every neighbor's length without a constraint solver.

### 13.7 Direct editing, hover feedback and low-friction defaults [R]

- Hovering an edge highlights only that edge; clicking selects it; double-clicking inserts a point. Hovering a vertex highlights it distinctly.
- The inspector must allow editing properties by **clicking on canvas labels** and also through a persistent panel, so frequent actions don't require navigating menus.
- After creating one line/point/curve, remain in the active tool so repeated actions are quick; pressing Esc once exits/cancels current unfinished action, pressing Esc again goes to Select if needed.
- Right-click on an element presents only actions applicable to its type, with direct precision commands near the top.
- New pattern projects default to **cm** display, **mm** internal storage, smart snap ON, guides ON, dimension overlays ON during editing; avoid clutter when idle.
- Selection should not change merely because the mouse crossed another shape while dragging; highlight only the stable active target.
- Touch devices must have a usable way to do every desktop action: toolbar controls, large handles, long-press or `⋯`, bottom sheet for exact lengths, pinch zoom, two-finger pan; no keyboard-only essential actions.
- Display an immediate ghost/preview of geometry transformations. Apply only after release/Enter; Esc restores original. One logical action equals one undo entry.
- Preserve the last used `length anchor` choice for the project/session, but **always display it** in the next length dialog so it never acts invisibly.
- Give small hints on first use (`Drag edge to bend`, `Double-click edge to add point`, `Enter to type a precise length`), without modal tutorials.

### 13.8 Mandatory usability tests [R]

**T1 Snap:** While drawing 2 mm away (on screen) from a known vertex, ghost endpoint snaps to *exactly* that vertex and a snap label appears. Hold Alt: it does not snap. Zoom changes without changing saved coordinates.

**T2 Live dimensions:** Draw a line, drag its second endpoint, and watch length/angle update each frame without needing a separate Measure tool. Press Esc: previous length/angle return exactly. Undo after commit reverses one edit.

**T3 Easy curve:** Draw straight segment, activate Curve, drag the middle to bend, release. Arc length increases appropriately, endpoints don't move, and saved/printed outputs remain vectors.

**T4 Add point:** Double-click a cubic edge to insert a point. Before moving the point, the curve must remain geometrically identical within test tolerance. Add another point 30 mm from A by numeric entry; verify its **arc-distance** placement when editing a curve.

**T5 Length anchors:** Given A=(0,0), B=(100,0) mm, change length to 120 and to 80 mm under each of the three anchors. Verify exactly the coordinates in §13.6, plus the closed-pattern neighbor update on a separate polygon test.

**T6 Mixed constraints:** Type `125 mm` while a nearby grid snap would land at `120 mm`; saved length must be exactly `125 mm`, and UI must not silently round or shift it.

**T7 Ease-of-use:** A first-time user can draw a `180 × 240 mm` wallet panel, round/bend one edge, insert a point 25 mm from a chosen endpoint, extend a 100 mm line equally to 120 mm, apply a 5 mm allowance, and export at physical 1:1 scale **without consulting external instructions**.

**T8 Touch:** Repeat T7 (except complex precision keyboard gestures) on a phone with toolbar/bottom-sheet alternatives, readable live measurements, and handles large enough to select.

**Implementation order:** Complete §13.2 live preview and §13.6 exact length anchors early; they are foundational. Then implement §13.1 snapping with conflict resolution, §13.5 exact point placement, and §13.4 direct curve bending. Treat all as *v1 essential* for this specific product, even if other advanced garment features are deferred.

**Evidence boundary:** Verified external references for the *underlying CLO/MD affordances* are [S11], [S13], [S16]–[S24] and the CLO help articles [Change Length](https://support.clo3d.com/hc/en-us/articles/115000416847-Change-Length) and [Add Point/Split Line](https://support.clo3d.com/hc/en-us/articles/115000375727-Add-Point-Split-Line). Thresholds, exact micro-interaction choices, three-option anchor UI, formulas, and test scenarios in this addendum are intentionally **our app's proposed specification**, not independently verified CLO/MD defaults.
