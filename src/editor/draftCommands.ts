import { exactDraftEndpoint, rectangleDimensions } from "./draftInput";
import { type Vec2 } from "../geometry/line";
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
  const validExact = () => {
    try {
      return !!origin && !!exactDraftEndpoint(origin, exact, degrees, factor);
    } catch {
      return false;
    }
  };
  const validRectangle = () => {
    try {
      return !!origin && !!rectangleDimensions(width, height, factor);
    } catch {
      return false;
    }
  };
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
      enabled: validExact,
      execute: () => {
        if (!origin) return;
        const end = exactDraftEndpoint(origin, exact, degrees, factor);
        if (useEditor.getState().tool === "line") commitPath([origin, end]);
        else {
          setDraft([...draft, end]);
          clearExact();
        }
      },
    }),
    rectangle: commands.rectangle.bind({
      enabled: validRectangle,
      execute: () => {
        if (!origin) return;
        const dimensions = rectangleDimensions(width, height, factor);
        commitPath(
          [
            origin,
            { x: origin.x + dimensions.width, y: origin.y },
            { x: origin.x + dimensions.width, y: origin.y + dimensions.height },
            { x: origin.x, y: origin.y + dimensions.height },
          ],
          true,
        );
      },
    }),
  };
}
