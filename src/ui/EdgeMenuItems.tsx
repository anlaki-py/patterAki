import { Menu } from "@mantine/core";
import { Plus, Ruler, Spline, Trash2, Undo2, Waypoints } from "lucide-react";
import type { BoundCommand } from "../editor/command";
import { CommandMenuItem } from "./CommandControls";
export function EdgeMenuItems({
  curved,
  count,
  actions,
}: {
  curved: boolean;
  count: number;
  actions: {
    length: BoundCommand;
    point: BoundCommand;
    intersections: BoundCommand;
    curve: BoundCommand;
    reset: BoundCommand;
    delete: BoundCommand;
  };
}) {
  return (
    <>
      <Menu.Label>
        {count > 1
          ? `${count} selected items`
          : `${curved ? "Curve" : "Line"} actions`}
      </Menu.Label>
      <CommandMenuItem
        command={actions.length}
        leftSection={<Ruler size={16} />}
      />
      <CommandMenuItem
        command={actions.point}
        leftSection={<Plus size={16} />}
      />
      <CommandMenuItem
        command={actions.intersections}
        leftSection={<Waypoints size={16} />}
      />
      <CommandMenuItem
        command={curved ? actions.reset : actions.curve}
        leftSection={curved ? <Undo2 size={16} /> : <Spline size={16} />}
      />
      <Menu.Divider />
      <CommandMenuItem
        command={actions.delete}
        color="red"
        leftSection={<Trash2 size={16} />}
      />
    </>
  );
}
