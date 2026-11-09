import {
  assertValidDocumentEdit,
  validateDocumentEdit,
} from "../document/contourValidation";
import { moveVertex } from "../document/curves";
import { translateSelection } from "../document/selection";
import type { PatternDocument } from "../document/schema";
import { formatContourIssues } from "../geometry/contourValidation";
import type { Vec2 } from "../geometry/line";
import type { SnapCandidate, SnapLock } from "../geometry/snapping";
import { resolveSnapDetailed } from "./snapResolver";
import type { SnapModes } from "./settings";
import { useEditor } from "./store";

export type MovementTarget = {
  selected: string[];
  activePoint: string | null;
};

export type MovementAxis = "x" | "y" | null;

export type MovementSnapOptions = {
  scale: number;
  touch: boolean;
  alt: boolean;
  snap: boolean;
  grid: boolean;
  modes: SnapModes;
  gridSpacingMm: number;
  mouseRadiusPx: number;
  touchRadiusPx: number;
  releaseMultiplier: number;
  showGuides: boolean;
  snapGuides: boolean;
  previousLock?: SnapLock | null;
  cycleOffset?: number;
  axisLock?: MovementAxis;
};

export type MovementResolution = {
  point: Vec2;
  delta: Vec2;
  preview: PatternDocument;
  issue: string | null;
  chosen?: SnapCandidate;
  choices: SnapCandidate[];
  choiceIndex: number;
  lock: SnapLock | null;
};

export function translatedDocument(
  doc: PatternDocument,
  target: MovementTarget,
  delta: Vec2,
): PatternDocument {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new Error("Move distances must be finite.");
  if (target.activePoint && doc.points[target.activePoint]) {
    const point = doc.points[target.activePoint];
    return moveVertex(doc, target.activePoint, {
      x: point.x + delta.x,
      y: point.y + delta.y,
    });
  }
  if (target.selected.length)
    return translateSelection(doc, target.selected, delta);
  throw new Error("Select a point, edge, mark or group to move.");
}

export function currentMovementTarget(): MovementTarget {
  const s = useEditor.getState();
  return { selected: s.selected, activePoint: s.activePoint };
}

/** Preview stays visible when invalid so the user sees the red warning. */
export function previewTranslation(delta: Vec2): PatternDocument {
  const s = useEditor.getState();
  const next = translatedDocument(
    s.document,
    { selected: s.selected, activePoint: s.activePoint },
    delta,
  );
  const check = validateDocumentEdit(s.document, next);
  useEditor.setState({
    preview: next,
    previewIssue: check.valid ? null : formatContourIssues(check),
  });
  return next;
}

/** One discrete command (numeric apply or nudge) creates one history entry. */
export function commitTranslation(delta: Vec2): PatternDocument {
  const s = useEditor.getState();
  const next = translatedDocument(
    s.document,
    { selected: s.selected, activePoint: s.activePoint },
    delta,
  );
  assertValidDocumentEdit(s.document, next);
  s.commit(next);
  return next;
}

/** Shift chooses the dominant raw axis after the drag threshold and holds it. */
export function movementAxis(
  previous: MovementAxis,
  rawDelta: Vec2,
  shiftKey: boolean,
): MovementAxis {
  if (!shiftKey) return null;
  if (previous) return previous;
  return Math.abs(rawDelta.x) >= Math.abs(rawDelta.y) ? "x" : "y";
}

export function constrainToAxis(
  origin: Vec2,
  target: Vec2,
  axis: MovementAxis,
): Vec2 {
  if (axis === "x") return { x: target.x, y: origin.y };
  if (axis === "y") return { x: origin.x, y: target.y };
  return target;
}

function movingSet(doc: PatternDocument, selected: string[]) {
  const points = new Set<string>(),
    edges = new Set<string>();
  for (const id of selected) {
    const edge = doc.segments[id];
    if (!edge) continue;
    edges.add(id);
    points.add(edge.from);
    points.add(edge.to);
  }
  return { points, edges };
}

function movementResult(
  base: PatternDocument,
  preview: PatternDocument,
  point: Vec2,
  delta: Vec2,
  resolution: ReturnType<typeof resolveSnapDetailed>,
): MovementResolution {
  const check = validateDocumentEdit(base, preview);
  return {
    point,
    delta,
    preview,
    issue: check.valid ? null : formatContourIssues(check),
    chosen: resolution.chosen,
    choices: resolution.choices,
    choiceIndex: resolution.choiceIndex,
    lock: resolution.lock,
  };
}

function resolveMovementCandidates(
  base: PatternDocument,
  target: Vec2,
  options: MovementSnapOptions,
  excludedPoints: ReadonlySet<string>,
  excludedEdges: ReadonlySet<string>,
  movingPoint?: string,
  axisOrigin?: Vec2,
) {
  if (!options.snap || options.alt)
    return {
      chosen: undefined,
      choices: [],
      choiceIndex: 0,
      lock: null,
      tolerance: 0,
    } as ReturnType<typeof resolveSnapDetailed>;
  return resolveSnapDetailed(base, target, {
    tool: "select",
    scale: options.scale,
    touch: options.touch,
    panning: false,
    snap: options.snap,
    grid: options.grid,
    bypass: options.alt,
    constrain: false,
    modes: options.modes,
    gridSpacingMm: options.gridSpacingMm,
    mouseRadiusPx: options.mouseRadiusPx,
    touchRadiusPx: options.touchRadiusPx,
    releaseMultiplier: options.releaseMultiplier,
    showGuides: options.showGuides,
    snapGuides: options.snapGuides,
    previousLock: options.previousLock,
    cycleOffset: options.cycleOffset,
    axisLock:
      options.axisLock === "x"
        ? "horizontal"
        : options.axisLock === "y"
          ? "vertical"
          : null,
    axisOrigin,
    excludedPoints,
    excludedEdges,
    movingPoint,
  });
}

/** Resolve the moving vertex against stationary geometry, then build a preview. */
export function resolveVertexMovement(
  base: PatternDocument,
  pointId: string,
  rawTarget: Vec2,
  options: MovementSnapOptions,
): MovementResolution {
  const origin = base.points[pointId];
  if (!origin) throw new Error("This point no longer exists.");
  const target = constrainToAxis(origin, rawTarget, options.axisLock ?? null);
  const excludedPoints = new Set([pointId]);
  const excludedEdges = new Set(
    Object.values(base.segments)
      .filter((edge) => edge.from === pointId || edge.to === pointId)
      .map((edge) => edge.id),
  );
  const resolution = resolveMovementCandidates(
    base,
    target,
    options,
    excludedPoints,
    excludedEdges,
    pointId,
    origin,
  );
  const snapped = resolution.chosen?.point ?? target;
  const preview = moveVertex(base, pointId, snapped);
  return movementResult(
    base,
    preview,
    snapped,
    {
      x: snapped.x - origin.x,
      y: snapped.y - origin.y,
    },
    resolution,
  );
}

/**
 * Resolve a group/edge/animation anchor against stationary geometry. The grab
 * anchor is the original pointer hit, so the first move never jumps.
 */
export function resolveGroupMovement(
  base: PatternDocument,
  selected: string[],
  anchor: Vec2,
  rawTarget: Vec2,
  options: MovementSnapOptions,
): MovementResolution {
  const target = constrainToAxis(anchor, rawTarget, options.axisLock ?? null);
  const moving = movingSet(base, selected);
  const resolution = resolveMovementCandidates(
    base,
    target,
    options,
    moving.points,
    moving.edges,
    undefined,
    anchor,
  );
  const snapped = resolution.chosen?.point ?? target;
  const delta = { x: snapped.x - anchor.x, y: snapped.y - anchor.y };
  const preview = translateSelection(base, selected, delta);
  return movementResult(base, preview, snapped, delta, resolution);
}

export function movementOptionsFromState(
  scale: number,
  touch: boolean,
  alt: boolean,
): MovementSnapOptions {
  const s = useEditor.getState();
  return {
    scale,
    touch,
    alt,
    snap: s.snap,
    grid: s.gridSnap,
    modes: s.snapModes,
    gridSpacingMm: s.gridSpacingMm,
    mouseRadiusPx: s.mouseRadiusPx,
    touchRadiusPx: s.touchRadiusPx,
    releaseMultiplier: s.releaseMultiplier,
    showGuides: s.showGuides,
    snapGuides: s.snapGuides,
  };
}
