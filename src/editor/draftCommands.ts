import { endpoint, type Vec2 } from "../geometry/line";
import { commands } from "./commands";
import { useEditor } from "./store";
export function bindDraftCommands({
  draft,
  exact,
  degrees,
  width,
  height,
  factor,
  commitPath,
  setDraft,
  clearExact,
}: {
  draft: Vec2[];
  exact: string | number;
  degrees: string | number;
  width: string | number;
  height: string | number;
  factor: number;
  commitPath: (points: Vec2[], closed?: boolean) => void;
  setDraft: (points: Vec2[]) => void;
  clearExact: () => void;
}) {
  const origin = draft.at(-1);
  return {
    finish: commands.finish.bind({
      enabled: () => draft.length > 1,
      execute: () => commitPath(draft),
    }),
    removePoint: commands.removeDraftPoint.bind({
      enabled: () => draft.length > 0,
      execute: () => setDraft(draft.slice(0, -1)),
    }),
    exactLine: commands.exactLine.bind({
      enabled: () =>
        !!origin &&
        typeof exact === "number" &&
        Number.isFinite(exact) &&
        exact > 0 &&
        typeof degrees === "number" &&
        Number.isFinite(degrees),
      execute: () => {
        if (!origin || typeof exact !== "number" || typeof degrees !== "number")
          return;
        const end = endpoint(origin, exact * factor, degrees);
        if (useEditor.getState().tool === "line") commitPath([origin, end]);
        else {
          setDraft([...draft, end]);
          clearExact();
        }
      },
    }),
    rectangle: commands.rectangle.bind({
      enabled: () =>
        !!origin &&
        typeof width === "number" &&
        Number.isFinite(width) &&
        width > 0 &&
        typeof height === "number" &&
        Number.isFinite(height) &&
        height > 0,
      execute: () => {
        if (!origin || typeof width !== "number" || typeof height !== "number")
          return;
        commitPath(
          [
            origin,
            { x: origin.x + width * factor, y: origin.y },
            { x: origin.x + width * factor, y: origin.y + height * factor },
            { x: origin.x, y: origin.y + height * factor },
          ],
          true,
        );
      },
    }),
  };
}
