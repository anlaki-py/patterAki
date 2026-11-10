import type { PatternDocument } from "../document/schema";
import { distance, type Vec2 } from "../geometry/line";
import type {
  Snap,
  SnapCandidate,
  SnapLock,
  SnapKind,
} from "../geometry/snapping";
import { findPointInsertion } from "./pointTool";
import { resolveConstrainedSnap, resolveDraftSnap } from "./draftingSnap";
import {
  resolveSnapDetailed,
  stripSnap,
  type SnapResolution,
  type SnapResolutionOptions,
} from "./snapResolver";
import { useEditor, type Tool } from "./store";

export type ResolvePointerOptions = {
  tool: Tool;
  scale: number;
  touch: boolean;
  origin?: Vec2;
  movingPoint?: string;
  panning: boolean;
  snap: boolean;
  grid: boolean;
  bypass: boolean;
  constrain: boolean;
  excludedPoints?: ReadonlySet<string>;
  excludedEdges?: ReadonlySet<string>;
  modes?: SnapResolutionOptions["modes"];
  gridSpacingMm?: number;
  mouseRadiusPx?: number;
  touchRadiusPx?: number;
  releaseMultiplier?: number;
  previousLock?: SnapLock | null;
  cycleOffset?: number;
  showGuides?: boolean;
  snapGuides?: boolean;
  axisLock?: "horizontal" | "vertical" | null;
  axisOrigin?: Vec2;
};

/**
 * Round to one of the eight exact 45° directions. Building horizontal and
 * vertical candidates by copying the origin coordinate prevents tiny cos(90°)
 * errors from turning into non-90° geometry.
 */
export function exactShiftPoint(origin: Vec2, pointer: Vec2): Vec2 {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return { ...origin };
  const octant = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  const directions = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ] as const;
  const [ux, uy] = directions[octant];
  const component = ux && uy ? length / Math.SQRT2 : length;
  return {
    x: ux === 0 ? origin.x : origin.x + ux * component,
    y: uy === 0 ? origin.y : origin.y + uy * component,
  };
}

// The viewport passes the origin while moving, but its pointer-down currently
// resolves the final click without it. Retain the active drafting origin only
// within the same document revision/tool/cancel generation. This also avoids
// pulling an origin from a previous, already finished drawing.
let lastDraftOrigin: {
  origin: Vec2;
  documentId: string;
  revision: number;
  cancelVersion: number;
  tool: Tool;
} | null = null;

const idle = (point: Vec2): Snap => ({ point, label: "" });
const freeResolution = (tolerance: number): SnapResolution => ({
  choices: [],
  choiceIndex: 0,
  lock: null,
  tolerance,
});

function candidate(
  point: Vec2,
  label: string,
  kind: SnapKind,
  targetId: string,
  extra: Partial<SnapCandidate> = {},
): SnapCandidate {
  return {
    point,
    label,
    kind,
    targetId,
    priority: extra.priority ?? 1,
    ...extra,
  };
}

/**
 * Detailed pointer resolution used by the viewport. Keeps the legacy
 * `resolvePointer` shape available for callers and tests while exposing the
 * chosen candidate, overlapping choices and transient lock.
 */
export function resolvePointerDetailed(
  doc: PatternDocument,
  point: Vec2,
  options: ResolvePointerOptions,
): SnapResolution {
  const { tool, scale, touch, movingPoint } = options;
  const state = useEditor.getState();
  const drawing =
    tool === "line" || tool === "polyline" || tool === "rectangle";
  if (!drawing || !state.hasDraft) lastDraftOrigin = null;
  if (drawing && options.origin) {
    lastDraftOrigin = {
      origin: options.origin,
      documentId: doc.id,
      revision: state.revision,
      cancelVersion: state.cancelVersion,
      tool,
    };
  }
  const origin =
    options.origin ??
    (drawing &&
    state.hasDraft &&
    lastDraftOrigin &&
    lastDraftOrigin.documentId === doc.id &&
    lastDraftOrigin.revision === state.revision &&
    lastDraftOrigin.cancelVersion === state.cancelVersion &&
    lastDraftOrigin.tool === tool
      ? lastDraftOrigin.origin
      : undefined);
  const tolerance =
    (touch ? (options.touchRadiusPx ?? 16) : (options.mouseRadiusPx ?? 8)) /
    scale;
  if (
    options.panning ||
    tool === "pan" ||
    ((tool === "select" || tool === "curve") && !movingPoint)
  )
    return freeResolution(tolerance);

  // Shift constrains the angle, but compatible magnetic targets can still
  // snap the *length*. Alt still explicitly bypasses magnetic snapping.
  if (options.constrain && origin) {
    const constrained = exactShiftPoint(origin, point);
    if (options.snap && !options.bypass) {
      const snapped = resolveConstrainedSnap(doc, constrained, {
        ...options,
        origin,
      });
      if (snapped.chosen) {
        // A magnetic candidate is only valid if it preserves the locked axis.
        // Never use a near-vertical coordinate as the final drafted point.
        const hit = snapped.chosen.point;
        const strict = {
          x: constrained.x === origin.x ? origin.x : hit.x,
          y: constrained.y === origin.y ? origin.y : hit.y,
        };
        const tolerance = 1e-8;
        if (distance(strict, hit) <= tolerance) {
          return {
            ...snapped,
            chosen: { ...snapped.chosen, point: strict },
            lock: snapped.lock ? { ...snapped.lock, point: strict } : null,
          };
        }
      }
    }
    return {
      chosen: candidate(
        constrained,
        "45° constraint",
        "angle",
        "constraint:shift",
        { priority: 0 },
      ),
      choices: [],
      choiceIndex: 0,
      lock: null,
      tolerance,
    };
  }

  if (!options.snap || options.bypass) {
    if (tool === "point") {
      const hit = findPointInsertion(doc, point, tolerance);
      if (hit)
        return {
          chosen: candidate(
            hit.point,
            hit.atEndpoint ? "Existing point" : "Insert point",
            hit.atEndpoint ? "endpoint" : "on-edge",
            hit.atEndpoint ? "existing-point" : `insert:${hit.edgeId}`,
            { edgeId: hit.edgeId, t: hit.t },
          ),
          choices: [],
          choiceIndex: 0,
          lock: null,
          tolerance,
        };
    }
    return freeResolution(tolerance);
  }

  // An active line can use a 90° direction derived from a nearby straight
  // edge; other tools retain their existing snap behavior.
  if (origin && (tool === "line" || tool === "polyline"))
    return resolveDraftSnap(doc, point, {
      ...options,
      origin,
    });
  return resolveSnapDetailed(doc, point, {
    ...options,
    movingPoint,
    excludedPoints: options.excludedPoints,
    excludedEdges: options.excludedEdges,
  });
}

/**
 * Backward-compatible snap result. New resolver metadata is deliberately
 * omitted so existing callers and saved previews keep their exact shape.
 */
export function resolvePointer(
  doc: PatternDocument,
  point: Vec2,
  options: ResolvePointerOptions,
): Snap {
  const resolution = resolvePointerDetailed(doc, point, options);
  if (!resolution.chosen) return idle(point);
  return stripSnap(resolution.chosen) ?? idle(point);
}
