import { useEffect, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { formatLength } from "../document/schema";
import type { Bounds } from "../geometry/bounds";
import type { Vec2 } from "../geometry/line";
import {
  movementOptionsFromState,
  resolveGroupMovement,
  type MovementAxis,
} from "./movement";
import { snapKindLabel } from "./SnapOverlay";
import {
  beginSelectionDrag,
  type SelectionDrag,
  type SelectionDragInfo,
} from "./selectionDrag";
import { useEditor } from "./store";
import { useShallow } from "zustand/react/shallow";

export function useSelectionDrag(scale: number, cursor: Vec2) {
  const s = useEditor(
    useShallow((state) => ({
      cancelVersion: state.cancelVersion,
      revision: state.revision,
      tool: state.tool,
      units: state.document.unitsDisplay,
    })),
  );
  const drag = useRef<SelectionDrag | null>(null);
  const lock = useRef<ReturnType<typeof resolveGroupMovement>["lock"]>(null);
  const [box, setBox] = useState<Bounds | null>(null);
  const [delta, setDelta] = useState<Vec2 | null>(null);
  const [info, setInfo] = useState<SelectionDragInfo | null>(null);
  const [axis, setAxis] = useState<MovementAxis>(null);
  const [issue, setIssue] = useState<string | null>(null);
  useEffect(() => {
    if (!drag.current?.active()) {
      drag.current = null;
      lock.current = null;
      setBox(null);
      setDelta(null);
      setInfo(null);
      setAxis(null);
      setIssue(null);
    }
  }, [s.cancelVersion, s.revision, s.tool]);
  return {
    active: () => !!drag.current?.active(),
    begin(
      itemId: string | undefined,
      point: Vec2,
      pointer: number,
      additive: boolean,
      touch = false,
    ) {
      lock.current = null;
      drag.current = beginSelectionDrag({
        itemId,
        point,
        pointer,
        scale,
        additive,
        resolve: ({ base, selected, anchor, target, axisLock, altKey }) => {
          const result = resolveGroupMovement(base, selected, anchor, target, {
            ...movementOptionsFromState(scale, touch, altKey),
            axisLock,
            previousLock: lock.current,
          });
          lock.current = result.lock;
          return {
            delta: result.delta,
            preview: result.preview,
            issue: result.issue,
            info: result.chosen
              ? {
                  label:
                    result.chosen.label ||
                    snapKindLabel(result.chosen.kind) ||
                    "Snap",
                  kind: result.chosen.kind,
                  choices: result.choices.length,
                  choiceIndex: result.choiceIndex,
                }
              : null,
          };
        },
      });
      setBox(null);
      setDelta(null);
      setInfo(null);
      setAxis(null);
      setIssue(null);
    },
    move(
      point: Vec2,
      pointer: number,
      modifiers?: { shiftKey?: boolean; altKey?: boolean },
    ) {
      if (!drag.current?.move(point, pointer, modifiers)) return false;
      setBox(drag.current.box);
      setDelta(drag.current.delta);
      setInfo(drag.current.info);
      setAxis(drag.current.axis);
      setIssue(drag.current.issue);
      return true;
    },
    finish(
      point: Vec2,
      pointer: number,
      modifiers?: { shiftKey?: boolean; altKey?: boolean },
    ) {
      try {
        if (!drag.current?.finish(point, pointer, modifiers)) return;
      } catch (e) {
        notifications.show({ color: "red", message: (e as Error).message });
      }
      drag.current = null;
      lock.current = null;
      setBox(null);
      setDelta(null);
      setInfo(null);
      setAxis(null);
      setIssue(null);
    },
    info,
    axis,
    issue,
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
            className={
              issue ? "measurement invalid-measurement" : "measurement"
            }
          >
            ΔX {formatLength(delta.x, s.units)} · ΔY{" "}
            {formatLength(delta.y, s.units)}
            {axis === "x" ? " · X only" : axis === "y" ? " · Y only" : ""}
          </text>
        )}
        {issue && (
          <text
            x={cursor.x + 12 / scale}
            y={cursor.y + 4 / scale}
            fontSize={11 / scale}
            className="measurement invalid-measurement"
          >
            Invalid contour · release to cancel
          </text>
        )}
        {info && (
          <text
            x={cursor.x + 12 / scale}
            y={cursor.y + 20 / scale}
            fontSize={12 / scale}
            className="measurement"
          >
            {info.label}
            {info.choices > 1
              ? ` · ${info.choiceIndex + 1} of ${info.choices}`
              : ""}
          </text>
        )}
      </g>
    ),
  };
}
