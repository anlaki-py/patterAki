import { useEffect, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { formatLength } from "../document/schema";
import type { Bounds } from "../geometry/bounds";
import type { Vec2 } from "../geometry/line";
import { beginSelectionDrag, type SelectionDrag } from "./selectionDrag";
import { useEditor } from "./store";

export function useSelectionDrag(scale: number, cursor: Vec2) {
  const s = useEditor();
  const drag = useRef<SelectionDrag | null>(null);
  const [box, setBox] = useState<Bounds | null>(null);
  const [delta, setDelta] = useState<Vec2 | null>(null);
  useEffect(() => {
    if (!drag.current?.active()) {
      drag.current = null;
      setBox(null);
      setDelta(null);
    }
  }, [s.cancelVersion, s.revision, s.tool]);
  return {
    active: () => !!drag.current?.active(),
    begin(
      itemId: string | undefined,
      point: Vec2,
      pointer: number,
      additive: boolean,
    ) {
      drag.current = beginSelectionDrag({
        itemId,
        point,
        pointer,
        scale,
        additive,
      });
      setBox(null);
      setDelta(null);
    },
    move(point: Vec2, pointer: number) {
      if (!drag.current?.move(point, pointer)) return false;
      setBox(drag.current.box);
      setDelta(drag.current.delta);
      return true;
    },
    finish(point: Vec2, pointer: number) {
      try {
        if (!drag.current?.finish(point, pointer)) return;
      } catch (e) {
        notifications.show({ color: "red", message: (e as Error).message });
      }
      drag.current = null;
      setBox(null);
      setDelta(null);
    },
    overlay: (
      <g pointerEvents="none">
        {box && (
          <rect
            x={box.min.x}
            y={box.min.y}
            width={box.max.x - box.min.x}
            height={box.max.y - box.min.y}
            className="selection-box"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {delta && (
          <text
            x={cursor.x + 12 / scale}
            y={cursor.y - 12 / scale}
            fontSize={12 / scale}
            className="measurement"
          >
            ΔX {formatLength(delta.x, s.document.unitsDisplay)} · ΔY{" "}
            {formatLength(delta.y, s.document.unitsDisplay)}
          </text>
        )}
      </g>
    ),
  };
}
