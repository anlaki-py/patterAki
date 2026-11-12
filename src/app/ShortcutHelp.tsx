import { Stack, Table, Text } from "@mantine/core";
import { commandRegistry } from "../editor/commands";
import type { Tool } from "../editor/store";

/** Derive shortcut text from the one command registry, never from a second keymap. */
export function shortcutReference() {
  return commandRegistry
    .filter((command) => command.shortcut.length > 0)
    .map(({ id, label, shortcut }) => ({ id, label, shortcut }));
}

const toolHints: Record<Tool, string> = {
  select:
    "Select: click an item; Shift-click to extend selection. Drag the selected edge or drag empty space to box-select.",
  line: "Line: click start and end. Use the numeric length and angle inputs to set exact dimensions.",
  polyline:
    "Polyline: click successive points for straight segments; Enter or Finish line commits; click the first point to close. Use Curve (C) afterward to bend an edge.",
  rectangle:
    "Rectangle: choose an origin, enter exact width and height, then create the rectangle.",
  curve: "Curve: drag an edge to bend it, then drag its handles.",
  point:
    "Add point: click an existing edge; the point stays on the edge. Exact distance is available from edge actions.",
  pan: "Pan: drag the canvas, or hold Space while using another tool.",
};

export function ShortcutHelp({ tool }: { tool: Tool }) {
  return (
    <Stack gap="xs">
      <Text size="sm">{toolHints[tool]}</Text>
      <Text size="xs" c="dimmed">
        Shortcuts below come from the active command registry. Enter, Escape,
        and Delete depend on whether you are editing text, a dialog, or a
        drawing draft. Alt bypasses magnetic snapping while drawing or moving.
      </Text>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Action</Table.Th>
            <Table.Th>Keys</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shortcutReference().map((command) => (
            <Table.Tr key={command.id}>
              <Table.Td>{command.label}</Table.Td>
              <Table.Td>
                <Text size="xs" ff="monospace">
                  {command.shortcut}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
