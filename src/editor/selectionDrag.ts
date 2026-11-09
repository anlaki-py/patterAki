import { itemsInBox, translateSelection } from "../document/selection";
import type { PatternDocument } from "../document/schema";
import { selectionBounds, type Bounds } from "../geometry/bounds";
import { distance, type Vec2 } from "../geometry/line";
import type { SnapKind } from "../geometry/snapping";
import { constrainToAxis, movementAxis, type MovementAxis } from "./movement";
import { clickSelection } from "./selection";
import { useEditor } from "./store";

export type SelectionDragInfo = {
  label: string;
  kind?: SnapKind;
  choices: number;
  choiceIndex: number;
};

export type SelectionDragResolver = (args: {
  base: PatternDocument;
  selected: string[];
  anchor: Vec2;
  target: Vec2;
  axisLock: MovementAxis;
  altKey: boolean;
  shiftKey: boolean;
}) => {
  delta: Vec2;
  preview: PatternDocument;
  issue: string | null;
  info: SelectionDragInfo | null;
};

export function beginSelectionDrag(options: {
  itemId?: string;
  point: Vec2;
  pointer: number;
  scale: number;
  additive: boolean;
  resolve?: SelectionDragResolver;
}) {
  const { itemId, point: start, pointer, scale, additive, resolve } = options;
  const initial = useEditor.getState();
  initial.cancel();
  const baseSelection = initial.selected;
  const selected = itemId
    ? clickSelection(baseSelection, itemId, additive)
    : additive
      ? baseSelection
      : [];
  useEditor.setState({
    selected,
    selectedGuide: null,
    activePoint: null,
  });
  const snapshot = useEditor.getState();
  let ended = false;
  let moved = false;
  let box: Bounds | null = null;
  let delta: Vec2 | null = null;
  let issue: string | null = null;
  let info: SelectionDragInfo | null = null;
  let axis: MovementAxis = null;
  const active = () => {
    const s = useEditor.getState();
    return (
      !ended &&
      s.cancelVersion === snapshot.cancelVersion &&
      s.revision === snapshot.revision &&
      s.tool === snapshot.tool
    );
  };
  const move = (
    point: Vec2,
    pointerId: number,
    modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
  ) => {
    if (!active() || pointerId !== pointer) return false;
    if (!moved && distance(start, point) * scale < 3) return true;
    moved = true;
    if (!itemId) {
      box = selectionBounds(start, point);
      return true;
    }
    if (!selected.includes(itemId)) return true;
    const rawDelta = { x: point.x - start.x, y: point.y - start.y };
    axis = movementAxis(axis, rawDelta, !!modifiers.shiftKey);
    const target = constrainToAxis(
      start,
      { x: start.x + rawDelta.x, y: start.y + rawDelta.y },
      axis,
    );
    if (resolve) {
      const result = resolve({
        base: snapshot.document,
        selected,
        anchor: start,
        target,
        axisLock: axis,
        altKey: !!modifiers.altKey,
        shiftKey: !!modifiers.shiftKey,
      });
      delta = result.delta;
      issue = result.issue;
      info = result.info;
      useEditor.setState({
        preview: result.preview,
        previewIssue: result.issue,
      });
    } else {
      delta = { x: target.x - start.x, y: target.y - start.y };
      issue = null;
      info = null;
      useEditor.setState({
        preview: translateSelection(snapshot.document, selected, delta),
        previewIssue: null,
      });
    }
    return true;
  };
  return {
    active,
    move,
    get box() {
      return active() ? box : null;
    },
    get delta() {
      return active() ? delta : null;
    },
    get issue() {
      return active() ? issue : null;
    },
    get info() {
      return active() ? info : null;
    },
    get axis() {
      return active() ? axis : null;
    },
    finish(
      point: Vec2,
      pointerId: number,
      modifiers: { shiftKey?: boolean; altKey?: boolean } = {},
    ) {
      if (!move(point, pointerId, modifiers)) return false;
      ended = true;
      if (box) {
        const hits = itemsInBox(snapshot.document, box);
        useEditor.setState({
          selected: additive ? [...new Set([...baseSelection, ...hits])] : hits,
        });
      } else if (delta) {
        const s = useEditor.getState();
        if (issue) {
          s.cancel();
          throw new Error(`Move cancelled. ${issue}`);
        }
        try {
          if (s.preview) s.commit(s.preview);
        } catch {
          s.cancel();
          throw new Error(
            "This move would collapse a connected edge or exceed the coordinate range. Move cancelled.",
          );
        }
      }
      return true;
    },
  };
}
export type SelectionDrag = ReturnType<typeof beginSelectionDrag>;
