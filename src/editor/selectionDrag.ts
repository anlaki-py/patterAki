import { itemsInBox, translateSelection } from "../document/selection";
import { selectionBounds, type Bounds } from "../geometry/bounds";
import { distance, type Vec2 } from "../geometry/line";
import { clickSelection } from "./selection";
import { useEditor } from "./store";

export function beginSelectionDrag(options: {
  itemId?: string;
  point: Vec2;
  pointer: number;
  scale: number;
  additive: boolean;
}) {
  const { itemId, point: start, pointer, scale, additive } = options;
  const initial = useEditor.getState();
  initial.cancel();
  const baseSelection = initial.selected;
  const selected = itemId
    ? clickSelection(baseSelection, itemId, additive)
    : additive
      ? baseSelection
      : [];
  useEditor.setState({ selected });
  const snapshot = useEditor.getState();
  let ended = false;
  let moved = false;
  let box: Bounds | null = null;
  let delta: Vec2 | null = null;
  const active = () => {
    const s = useEditor.getState();
    return (
      !ended &&
      s.cancelVersion === snapshot.cancelVersion &&
      s.revision === snapshot.revision &&
      s.tool === snapshot.tool
    );
  };
  const move = (point: Vec2, pointerId: number) => {
    if (!active() || pointerId !== pointer) return false;
    if (!moved && distance(start, point) * scale < 3) return true;
    moved = true;
    if (!itemId) box = selectionBounds(start, point);
    else if (selected.includes(itemId)) {
      delta = { x: point.x - start.x, y: point.y - start.y };
      useEditor.setState({
        preview: translateSelection(snapshot.document, selected, delta),
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
    finish(point: Vec2, pointerId: number) {
      if (!move(point, pointerId)) return false;
      ended = true;
      if (box) {
        const hits = itemsInBox(snapshot.document, box);
        useEditor.setState({
          selected: additive ? [...new Set([...baseSelection, ...hits])] : hits,
        });
      } else if (delta) {
        const s = useEditor.getState();
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
