import { Menu } from "@mantine/core";
import { Plus, Ruler, Spline, Trash2, Undo2, Waypoints } from "lucide-react";
import type { EdgeAction } from "../editor/edgeActions";
export function EdgeMenuItems({
  curved,
  count,
  onAction,
  onLength,
  onPoint,
}: {
  curved: boolean;
  count: number;
  onAction: (action: EdgeAction) => void;
  onLength: () => void;
  onPoint: () => void;
}) {
  return (
    <>
      <Menu.Label>
        {count > 1
          ? `${count} selected items`
          : `${curved ? "Curve" : "Line"} actions`}
      </Menu.Label>
      <Menu.Item
        leftSection={<Ruler size={16} />}
        disabled={curved || count > 1}
        onClick={onLength}
      >
        {curved ? "Change length (straight edges only)" : "Change length…"}
      </Menu.Item>
      <Menu.Item
        leftSection={<Plus size={16} />}
        onClick={onPoint}
        disabled={count > 1}
      >
        Point at exact distance…
      </Menu.Item>
      <Menu.Item
        leftSection={<Waypoints size={16} />}
        disabled={count > 1}
        onClick={() => onAction("intersections")}
      >
        Create points at intersections
      </Menu.Item>
      {curved ? (
        <Menu.Item
          leftSection={<Undo2 size={16} />}
          onClick={() => onAction("reset")}
        >
          {count > 1
            ? "Reset selected curves / remove handles"
            : "Reset curve / remove handles"}
        </Menu.Item>
      ) : (
        <Menu.Item
          leftSection={<Spline size={16} />}
          onClick={() => onAction("curve")}
        >
          Convert to curve
        </Menu.Item>
      )}
      <Menu.Divider />
      <Menu.Item
        color="red"
        leftSection={<Trash2 size={16} />}
        onClick={() => onAction("delete")}
      >
        {count > 1 ? `Delete ${count} selected items` : "Delete edge"}
      </Menu.Item>
    </>
  );
}
