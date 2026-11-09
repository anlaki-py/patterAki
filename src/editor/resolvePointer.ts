import type { PatternDocument } from "../document/schema";
import { angle, distance, endpoint, type Vec2 } from "../geometry/line";
import type {
  Snap,
  SnapCandidate,
  SnapLock,
  SnapKind,
} from "../geometry/snapping";
import { findPointInsertion } from "./pointTool";
import {
  resolveSnapDetailed,
  stripSnap,
  type SnapResolution,
  type SnapResolutionOptions,
} from "./snapResolver";
import type { Tool } from "./store";

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
  const { tool, scale, touch, origin, movingPoint } = options;
  const tolerance =
    (touch ? (options.touchRadiusPx ?? 16) : (options.mouseRadiusPx ?? 8)) /
    scale;
  if (
    options.panning ||
    tool === "pan" ||
    ((tool === "select" || tool === "curve") && !movingPoint)
  )
    return freeResolution(tolerance);
  // Shift is a hard direction constraint, not magnetic snapping. It stays
  // active with Snap off and Alt bypass, and numeric entry still wins.
  if (options.constrain && origin)
    return {
      chosen: candidate(
        endpoint(
          origin,
          Math.max(distance(origin, point), 1e-9),
          Math.round(angle(origin, point) / 45) * 45,
        ),
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
