import { Menu } from "@mantine/core";
import {
  ArrowRight,
  ArrowLeftRight,
  Crosshair,
  FoldVertical,
  Type,
} from "lucide-react";
import type { AnnotationKind } from "../document/annotationSchema";
export function MarkMenuItems({
  onAdd,
}: {
  onAdd: (kind: AnnotationKind) => void;
}) {
  return (
    <>
      <Menu.Label>Add a pattern mark</Menu.Label>
      <Menu.Item leftSection={<Type size={16} />} onClick={() => onAdd("text")}>
        Text / piece label…
      </Menu.Item>
      <Menu.Item
        leftSection={<ArrowRight size={16} />}
        onClick={() => onAdd("arrow")}
      >
        Arrow…
      </Menu.Item>
      <Menu.Item
        leftSection={<ArrowLeftRight size={16} />}
        onClick={() => onAdd("grainline")}
      >
        Grainline…
      </Menu.Item>
      <Menu.Item
        leftSection={<FoldVertical size={16} />}
        onClick={() => onAdd("fold")}
      >
        Place on fold guide…
      </Menu.Item>
      <Menu.Item
        leftSection={<Crosshair size={16} />}
        onClick={() => onAdd("drill")}
      >
        Drill point / cross…
      </Menu.Item>
    </>
  );
}
