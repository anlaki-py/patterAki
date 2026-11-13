import { ClipboardPaste, Copy, CopyPlus, Scissors } from "lucide-react";
import { commands } from "../editor/commands";
import type { Vec2 } from "../geometry/line";
import { CommandMenuItem } from "./CommandControls";

export function MarkPasteItem({ point }: { point?: Vec2 }) {
  const command = commands.pasteMarks.bind(point);
  return (
    <CommandMenuItem
      command={{
        ...command,
        label: point ? "Paste marks here" : command.label,
        shortcut: point ? "" : command.shortcut,
      }}
      leftSection={<ClipboardPaste size={16} />}
    />
  );
}
export function MarkClipboardItems({ point }: { point?: Vec2 }) {
  return (
    <>
      <CommandMenuItem
        command={commands.copyMarks.bind()}
        leftSection={<Copy size={16} />}
      />
      <CommandMenuItem
        command={commands.cutMarks.bind()}
        leftSection={<Scissors size={16} />}
      />
      <CommandMenuItem
        command={commands.duplicateMarks.bind()}
        leftSection={<CopyPlus size={16} />}
      />
      <MarkPasteItem point={point} />
    </>
  );
}
