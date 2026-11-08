import { createId } from "../editor/ids";
import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Menu,
  Stack,
  Switch,
  Text,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { Group as PanelGroup, Panel, Separator } from "react-resizable-panels";
import {
  Hand,
  Spline,
  Minus,
  Moon,
  MousePointer2,
  Plus,
  Redo2,
  Route,
  SlidersHorizontal,
  Square,
  Undo2,
} from "lucide-react";
import { useEditor } from "../editor/store";
import {
  commands,
  dispatchShortcut,
  editCommands,
  toolCommands,
} from "../editor/commands";
import { EditorViewport } from "../editor/EditorViewport";
import { CommandMenuItem, commandProps } from "../ui/CommandControls";
import { Inspector } from "../ui/Inspector";
import { emptyDocument, parseProject } from "../document/schema";
import { saveNow, startPersistence } from "../persistence/autosave";
const icons = {
  select: MousePointer2,
  point: Plus,
  curve: Spline,
  line: Minus,
  polyline: Route,
  rectangle: Square,
  pan: Hand,
};
function exportJson() {
  const doc = useEditor.getState().document;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${doc.name.replace(/[^\w -]/g, "_")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const s = useEditor();
  const mobile = useMediaQuery("(max-width: 760px)");
  const [properties, setProperties] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { toggleColorScheme } = useMantineColorScheme();
  useEffect(startPersistence, []);
  const replaceProject = (action: () => void) => {
    modals.openConfirmModal({
      title: "Replace the current workspace?",
      children: (
        <Text size="sm">
          Export JSON first if you need a portable backup. The current project
          will be saved locally before switching.
        </Text>
      ),
      labels: { confirm: "Save and continue", cancel: "Cancel" },
      onConfirm: () => {
        void saveNow().then((saved) => {
          if (saved) action();
          else
            notifications.show({
              color: "red",
              message:
                "Could not save. Export a JSON backup before replacing this workspace.",
            });
        });
      },
    });
  };
  const help = () =>
    modals.open({
      title: "Drafting controls",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Line: click start and end. Polyline: click successive points, then
            Finish line or Enter. Click the first point to close.
          </Text>
          <Text size="sm">
            Rectangle: click its origin, then enter width and height. Select:
            click or drag an edge to select and move it. Shift-click toggles
            edges; drag empty space to box-select. Ctrl/Cmd+A selects all. Drag
            a selected endpoint to reshape, or double-click the edge to insert a
            point. Add point (X) also inserts on click. Right-click an edge for
            Change length, Delete, Reset curve, or Create points at
            intersections. Point at exact distance opens the draggable
            measurement window.
          </Text>
          <Text size="sm">
            Right-click empty space or use Marks to add text, arrows,
            grainlines, fold guides and drill points. Double-click a mark to
            edit its size and angle; drag to move it. Marks support Shift-click,
            box selection and Ctrl/Cmd+A.
          </Text>
          <Text size="sm">
            Curve (C): drag an edge to bend it, then drag the control arms.
            Shared points have an incoming and outgoing arm. Properties offers
            Convert to curve and Convert to straight line.
          </Text>
          <Text size="sm">
            Wheel zooms. Pan tool, middle drag, or Space+drag pans. Shift
            constrains a line to 45° increments. Snapping finds edges, midpoints
            and horizontal/vertical guides from existing points. Alt bypasses
            snap. Escape cancels a draft.
          </Text>
          <Text size="sm">
            Exact typed dimensions take priority over snapping. Save local
            changes with Ctrl/Cmd+S. Export JSON for a portable backup.
          </Text>
          <Text size="sm">
            This version supports straight and cubic drafting paths and
            annotations. Sewing metadata, seam allowance, PDF printing, PWA
            caching and touch pinch are not implemented yet.
          </Text>
        </Stack>
      ),
    });
  const fileCommands = [
    commands.newProject.bind({
      execute: () =>
        replaceProject(() =>
          useEditor.getState().load(emptyDocument(createId())),
        ),
    }),
    commands.importProject.bind({ execute: () => file.current?.click() }),
    commands.save.bind({ execute: saveNow }),
    commands.exportProject.bind({ execute: exportJson }),
  ];
  const themeCommand = commands.theme.bind({ execute: toggleColorScheme });
  const propertiesCommand = commands.properties.bind({
    execute: () => setProperties((visible) => !visible),
  });
  const helpCommand = commands.help.bind({ execute: help });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (useEditor.getState().ready)
        dispatchShortcut(event, [
          ...toolCommands,
          ...editCommands,
          ...fileCommands,
        ]);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  if (!s.ready) return <Text p="md">Opening local pattern…</Text>;
  return (
    <div className="app-shell">
      <Group className="menu-bar" gap={0} justify="space-between" wrap="nowrap">
        <Group gap={0} wrap="nowrap">
          <Menu>
            <Menu.Target>
              <Button variant="subtle">File</Button>
            </Menu.Target>
            <Menu.Dropdown>
              {fileCommands.map((command) => (
                <CommandMenuItem key={command.id} command={command} />
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu>
            <Menu.Target>
              <Button variant="subtle">Edit</Button>
            </Menu.Target>
            <Menu.Dropdown>
              {editCommands.map((command) => (
                <CommandMenuItem key={command.id} command={command} />
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu>
            <Menu.Target>
              <Button variant="subtle">View</Button>
            </Menu.Target>
            <Menu.Dropdown>
              {[themeCommand, commands.grid.bind(), propertiesCommand].map(
                (command) => (
                  <CommandMenuItem key={command.id} command={command} />
                ),
              )}
            </Menu.Dropdown>
          </Menu>
          <Menu>
            <Menu.Target>
              <Button variant="subtle">Tools</Button>
            </Menu.Target>
            <Menu.Dropdown>
              {toolCommands.map((command) => (
                <CommandMenuItem key={command.id} command={command} />
              ))}
            </Menu.Dropdown>
          </Menu>
          <Button variant="subtle" {...commandProps(helpCommand)}>
            {helpCommand.label}
          </Button>
        </Group>
        <Text size="xs" truncate className="project-title">
          {s.document.name}
        </Text>
      </Group>
      <Group className="toolbar" p="xs" gap="xs" wrap="nowrap">
        {toolCommands.map((t) => {
          const Icon = icons[t.id];
          return (
            <Tooltip key={t.id} label={`${t.label} (${t.shortcut})`}>
              <Button
                variant={s.tool === t.id ? "light" : "default"}
                aria-pressed={s.tool === t.id}
                leftSection={<Icon size={16} />}
                {...commandProps(t)}
              >
                {t.label}
              </Button>
            </Tooltip>
          );
        })}
        {[Undo2, Redo2].map((Icon, i) => (
          <Tooltip
            key={i}
            label={`${editCommands[i].label} (${editCommands[i].shortcut})`}
          >
            <ActionIcon
              variant="default"
              aria-label={editCommands[i].label}
              {...commandProps(editCommands[i])}
            >
              <Icon size={16} />
            </ActionIcon>
          </Tooltip>
        ))}
        <Switch
          size="xs"
          label={commands.snap.label}
          checked={s.snap}
          onChange={() => commands.snap.bind().run()}
        />
        <ActionIcon
          variant="default"
          aria-label="Toggle color scheme"
          {...commandProps(themeCommand)}
        >
          <Moon size={16} />
        </ActionIcon>
        <Button
          variant="default"
          leftSection={<SlidersHorizontal size={16} />}
          {...commandProps(propertiesCommand)}
          aria-expanded={properties}
        >
          {propertiesCommand.label}
        </Button>
      </Group>
      <main className="main-area">
        {mobile ? (
          <EditorViewport />
        ) : (
          <PanelGroup orientation="horizontal">
            <Panel id="workspace" minSize="40%">
              <EditorViewport />
            </Panel>
            {properties && <Separator className="panel-separator" />}
            {properties && (
              <Panel
                id="properties"
                defaultSize="280px"
                minSize="230px"
                maxSize="40%"
              >
                <aside className="inspector">
                  <Inspector />
                </aside>
              </Panel>
            )}
          </PanelGroup>
        )}
      </main>
      <Group
        className="status-bar"
        px="xs"
        justify="space-between"
        wrap="nowrap"
      >
        <Text size="xs">
          {s.tool} ·{" "}
          {s.tool === "select"
            ? `${s.selected.length} selected · Shift-click to add/remove · Drag empty space to select`
            : s.tool === "curve"
              ? "Drag an edge to bend; drag arms to shape"
              : s.tool === "point"
                ? "Click an existing edge to insert a point"
                : "Click in the workspace to begin"}
        </Text>
        <Text size="xs" role="status">
          {s.saveStatus}
        </Text>
      </Group>
      <Drawer
        opened={!!mobile && properties}
        onClose={() =>
          commands.hideProperties
            .bind({ execute: () => setProperties(false) })
            .run()
        }
        title="Pattern properties"
        position={mobile ? "bottom" : "right"}
        size={mobile ? "75%" : "sm"}
      >
        <Inspector />
      </Drawer>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const picked = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!picked) return;
          try {
            if (picked.size > 10_000_000)
              throw new Error("Project exceeds the 10 MB import limit.");
            const doc = parseProject(await picked.text());
            replaceProject(() => s.load({ ...doc, id: createId() }));
          } catch {
            notifications.show({
              color: "red",
              title: "Import failed",
              message:
                "Choose a valid version 1, 2 or 3 PatternAki JSON project under 10 MB. Your current pattern is unchanged.",
            });
          }
        }}
      />
    </div>
  );
}
