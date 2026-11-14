import { segmentProjection } from "../document/segments";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import {
  placementDistanceFromStart,
  placementAtVertex,
  placementOnEdge,
} from "../document/pointPlacement";
import { distance, type Vec2 } from "../geometry/line";
import { formatLength } from "../document/schema";
import {
  PointPlacementDialog,
  type PlacementSession,
} from "../ui/PointPlacementDialog";
import { createId } from "./ids";
import { findPointInsertion } from "./pointTool";
import { useEditor } from "./store";
export function usePointPlacement(scale: number) {
  const [session, setSession] = useState<
    (PlacementSession & { cancelVersion: number }) | null
  >(null);
  const cancelVersion = useEditor((s) => s.cancelVersion);
  const preview = useEditor((s) => s.preview);
  const active = session?.cancelVersion === cancelVersion ? session : null;
  const close = () => {
    useEditor.setState({ preview: null });
    setSession(null);
  };
  const open = (point: Vec2, tolerance: number, edgeId?: string) => {
    const state = useEditor.getState(),
      doc = state.document;
    try {
      const vertex = Object.entries(doc.points)
        .filter(
          ([id, p]) =>
            distance(p, point) <= tolerance &&
            (!edgeId ||
              doc.segments[edgeId]?.from === id ||
              doc.segments[edgeId]?.to === id),
        )
        .sort((a, b) => distance(a[1], point) - distance(b[1], point))[0];
      const forced = edgeId ? doc.segments[edgeId] : undefined;
      const hit = forced
        ? { edgeId: forced.id, t: segmentProjection(doc, forced, point) }
        : findPointInsertion(doc, point, tolerance);
      if (!vertex && !hit) return;
      const target = vertex
        ? placementAtVertex(doc, vertex[0])
        : placementOnEdge(doc, hit!.edgeId, hit!.t, {
            pointId: createId(),
            newEdgeId: createId(),
          });
      setSession({
        document: doc,
        revision: state.revision,
        cancelVersion: state.cancelVersion,
        target,
      });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };
  const target = active?.target;
  const p = target && preview?.points[target.pointId];
  return {
    open,
    dialog: active ? (
      <PointPlacementDialog session={active} onClose={close} />
    ) : null,
    overlay:
      target && p ? (
        <g pointerEvents="none">
          {[
            { point: target.start, label: "A" },
            { point: target.end, label: "B" },
          ].map(({ point, label }) => (
            <text
              key={label}
              className="measurement"
              x={point.x + 8 / scale}
              y={point.y - 12 / scale}
              fontSize={12 / scale}
            >
              {label}
            </text>
          ))}
          <circle cx={p.x} cy={p.y} r={6 / scale} className="snap-marker" />
          <text
            className="measurement"
            x={p.x + 12 / scale}
            y={p.y + 20 / scale}
            fontSize={12 / scale}
          >
            A:{" "}
            {formatLength(
              placementDistanceFromStart(target, p),
              active.document.unitsDisplay,
            )}{" "}
            · B:{" "}
            {formatLength(
              target.lengthMm - placementDistanceFromStart(target, p),
              active.document.unitsDisplay,
            )}
          </text>
        </g>
      ) : null,
  };
}
