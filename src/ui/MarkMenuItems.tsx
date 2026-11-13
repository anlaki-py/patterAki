import { Menu } from "@mantine/core";
import {
  ArrowRight,
  ArrowLeftRight,
  Crosshair,
  FoldVertical,
  Type,
  Circle,
  CircleDot,
  CircleDashed,
  RectangleHorizontal,
  AlignJustify,
} from "lucide-react";
import type { AnnotationKind } from "../document/annotationSchema";
import { commands } from "../editor/commands";
import { CommandMenuItem } from "./CommandControls";
const icons = {
  text: Type,
  arrow: ArrowRight,
  grainline: ArrowLeftRight,
  fold: FoldVertical,
  drill: Crosshair,
  button: CircleDot,
  buttonhole: RectangleHorizontal,
  eyelet: Circle,
  snap: CircleDashed,
  bartack: AlignJustify,
};
export function MarkMenuItems({
  onAdd,
}: {
  onAdd: (kind: AnnotationKind) => void;
}) {
  return (
    <>
      <Menu.Label>Add a pattern mark</Menu.Label>
      {(Object.keys(icons) as AnnotationKind[]).map((kind) => {
        const Icon = icons[kind];
        return (
          <CommandMenuItem
            key={kind}
            command={(kind === "snap"
              ? commands.snapMark
              : commands[kind]
            ).bind({ execute: () => onAdd(kind) })}
            leftSection={<Icon size={16} />}
          />
        );
      })}
    </>
  );
}
