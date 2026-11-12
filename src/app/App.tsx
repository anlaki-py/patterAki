import { createId } from "../editor/ids";
import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Menu,
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
  nudgeCommands,
  toolCommands,
} from "../editor/commands";
import { EditorViewport } from "../editor/EditorViewport";
import { handleEditorEscapeDelete } from "../editor/editorKeyboard";
import { CommandMenuItem, commandProps } from "../ui/CommandControls";
import { Inspector } from "../ui/Inspector";
import { SnapSettings } from "../ui/SnapSettings";
import { SaveFeedback } from "../ui/SaveFeedback";
import { emptyDocument, parseProject } from "../document/schema";
import { saveNow, startPersistence } from "../persistence/autosave";
import {
  getSavedProject,
  deleteSavedProject,
} from "../persistence/projectBrowser";
import {
  defaultWorkspaceLayout,
  readWorkspaceLayout,
  saveWorkspaceLayout,
} from "./workspaceLayout";
import { RenameProjectDialog, SavedProjectsDialog } from "./ProjectDialogs";
import { SvgExportDialog } from "../ui/SvgExportDialog";
import { ShortcutHelp } from "./ShortcutHelp";
import "./m02.css";

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
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const s = useEditor();
  const mobile = useMediaQuery("(max-width: 760px)");
  const [svgExport, setSvgExport] = useState(false);
  const [layout, setLayout] = useState(readWorkspaceLayout);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const properties = layout.inspectorVisible;
  const setProperties = (value: boolean | ((previous: boolean) => boolean)) => {
    setLayout((current) => ({
      ...current,
      inspectorVisible:
        typeof value === "function" ? value(current.inspectorVisible) : value,
    }));
  };
  const file = useRef<HTMLInputElement>(null);
  const { toggleColorScheme } = useMantineColorScheme();
  useEffect(startPersistence, []);
  useEffect(() => {
    saveWorkspaceLayout(layout);
  }, [layout]);
  const reportError = (error: unknown) =>
    notifications.show({
      color: "red",
      message:
        error instanceof Error
          ? error.message
          : "Could not complete this action.",
    });
  const switchWorkspace = (
    action: () => void | Promise<void>,
  ): Promise<boolean> => {
    const perform = async () => {
      try {
        if (!(await saveNow())) {
          notifications.show({
            color: "red",
            message:
              "Could not save your current project. Export JSON before switching.",
          });
          return false;
        }
        // A draft is transient and must not be carried into another project.
        useEditor.getState().cancel();
        await action();
        return true;
      } catch (error) {
        reportError(error);
        return false;
      }
    };
    const state = useEditor.getState();
    if (!state.hasDraft && !state.preview && !state.gestureActive)
      return perform();
    return new Promise((resolve) => {
      let confirmed = false;
      modals.openConfirmModal({
        title: "Discard the unfinished edit?",
        children: (
          <Text size="sm">
            Committed changes will be saved. The active drawing or drag will be
            discarded.
          </Text>
        ),
        labels: {
          confirm: "Discard edit and continue",
          cancel: "Keep editing",
        },
        onClose: () => {
          if (!confirmed) resolve(false);
        },
        onConfirm: () => {
          confirmed = true;
          void perform().then(resolve);
        },
      });
    });
  };
  const openProjects = () =>
    modals.open({
      modalId: "saved-projects",
      title: "Open saved project",
      size: "lg",
      children: (
        <SavedProjectsDialog
          currentId={useEditor.getState().document.id}
          onOpen={async (id) => {
            const opened = await switchWorkspace(async () => {
              const doc = await getSavedProject(id);
              useEditor.getState().load(doc);
            });
            if (opened) modals.close("saved-projects");
            return opened;
          }}
          onDelete={(id, refresh) => deleteProject(id, refresh)}
        />
      ),
    });
  const deleteProject = (id: string, refresh?: () => void) => {
    modals.openConfirmModal({
      title: "Delete saved project?",
      children: (
        <Text size="sm">
          This permanently deletes this project's local copy. Export JSON first
          if you need a backup. Other projects are not affected.
        </Text>
      ),
      labels: { confirm: "Delete project", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        void (async () => {
          const wasCurrent = useEditor.getState().document.id === id;
          // Flush queued writes before deleting, so an earlier autosave cannot restore it.
          if (wasCurrent && !(await saveNow()))
            throw new Error(
              "Local storage could not save. Export JSON before deleting.",
            );
          await deleteSavedProject(id);
          if (wasCurrent) useEditor.getState().load(emptyDocument(createId()));
          refresh?.();
        })().catch(reportError);
      },
    });
  };
  const renameProject = () =>
    modals.open({
      modalId: "rename-project",
      title: "Rename project",
      children: (
        <RenameProjectDialog
          name={useEditor.getState().document.name}
          onClose={() => modals.close("rename-project")}
        />
      ),
    });
  const help = () =>
    modals.open({
      title: "Drafting help and keyboard shortcuts",
      size: "lg",
      children: (
        <div style={{ maxHeight: "65dvh", overflowY: "auto" }}>
          <ShortcutHelp tool={useEditor.getState().tool} />
        </div>
      ),
    });
  const fileCommands = [
    commands.newProject.bind({
      execute: () => {
        void switchWorkspace(() =>
          useEditor.getState().load(emptyDocument(createId())),
        );
      },
    }),
    commands.openProject.bind({ execute: openProjects }),
    commands.renameProjectDialog.bind({ execute: renameProject }),
    commands.save.bind({ execute: saveNow }),
    commands.importProject.bind({ execute: () => file.current?.click() }),
    commands.exportProject.bind({ execute: exportJson }),
    commands.exportSvg.bind({ execute: () => setSvgExport(true) }),
    commands.deleteProject.bind({
      execute: () => deleteProject(useEditor.getState().document.id),
    }),
  ];
  const themeCommand = commands.theme.bind({ execute: toggleColorScheme });
  const propertiesCommand = commands.properties.bind({
    execute: () => setProperties((visible) => !visible),
  });
  const resetLayout = () => {
    setLayout({ ...defaultWorkspaceLayout });
    // Remount the group so the saved width is reset even without a page reload.
    setLayoutEpoch((number) => number + 1);
  };
  const layoutResetCommand = commands.resetLayout.bind({
    execute: resetLayout,
  });
  const helpCommand = commands.help.bind({ execute: help });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!useEditor.getState().ready) return;
      if (handleEditorEscapeDelete(event)) {
        event.stopImmediatePropagation();
        return;
      }
      dispatchShortcut(event, [
        ...toolCommands,
        ...editCommands,
        ...nudgeCommands,
        ...fileCommands,
      ]);
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  });
  if (!s.ready) return <Text p="md">Opening local pattern…</Text>;
  return (
    <div className="app-shell">
      <Group className="menu-bar" gap={0} justify="space-between" wrap="nowrap">
        <Group gap={0} wrap="nowrap">
          <Menu>
            <Menu.Target>
              <Button size="compact-sm" variant="subtle">
                File
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {fileCommands.map((command) => (
                <CommandMenuItem key={command.id} command={command} />
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu>
            <Menu.Target>
              <Button size="compact-sm" variant="subtle">
                Edit
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {editCommands.map((command) => (
                <CommandMenuItem key={command.id} command={command} />
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu>
            <Menu.Target>
              <Button size="compact-sm" variant="subtle">
                View
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {[
                themeCommand,
                commands.grid.bind(),
                propertiesCommand,
                layoutResetCommand,
              ].map((command) => (
                <CommandMenuItem key={command.id} command={command} />
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu>
            <Menu.Target>
              <Button size="compact-sm" variant="subtle">
                Pattern
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {[
                commands.createPiece.bind(
                  s.selected.find((id) => !!s.document.segments[id]) ?? "",
                ),
                commands.intersections.bind(),
                commands.curve.bind(),
                commands.reset.bind(),
              ].map((command) => (
                <CommandMenuItem key={command.id} command={command} />
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu>
            <Menu.Target>
              <Button size="compact-sm" variant="subtle">
                Tools
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {toolCommands.map((command) => (
                <CommandMenuItem key={command.id} command={command} />
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu>
            <Menu.Target>
              <Button size="compact-sm" variant="subtle">
                Help
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <CommandMenuItem command={helpCommand} />
              <CommandMenuItem
                command={commands.shortcutReference.bind({ execute: help })}
              />
            </Menu.Dropdown>
          </Menu>
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
                size="compact-sm"
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
              size="sm"
              variant="default"
              aria-label={editCommands[i].label}
              {...commandProps(editCommands[i])}
            >
              <Icon size={16} />
            </ActionIcon>
          </Tooltip>
        ))}
        <Tooltip label="Enable or disable drafting snap targets">
          <Switch
            size="xs"
            label={commands.snap.label}
            checked={s.snap}
            onChange={() => commands.snap.bind().run()}
          />
        </Tooltip>
        <SnapSettings />
        <Tooltip label="Toggle light / dark theme">
          <ActionIcon
            size="sm"
            variant="default"
            aria-label="Toggle color scheme"
            {...commandProps(themeCommand)}
          >
            <Moon size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Show or hide the Properties panel">
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<SlidersHorizontal size={16} />}
            {...commandProps(propertiesCommand)}
            aria-expanded={properties}
          >
            {propertiesCommand.label}
          </Button>
        </Tooltip>
      </Group>
      <main className="main-area">
        {mobile ? (
          <EditorViewport />
        ) : (
          <PanelGroup
            key={layoutEpoch}
            orientation="horizontal"
            onLayoutChanged={(sizes, meta) => {
              // Only persist direct resize gestures, not responsive constraint changes.
              if (!properties || !meta?.isUserInteraction) return;
              const width = sizes.properties;
              if (typeof width !== "number" || !Number.isFinite(width)) return;
              const nextWidth =
                Math.round(Math.min(40, Math.max(22, width)) * 10) / 10;
              setLayout((current) =>
                current.inspectorWidthPct === nextWidth
                  ? current
                  : { ...current, inspectorWidthPct: nextWidth },
              );
            }}
          >
            <Panel id="workspace" minSize="40%">
              <EditorViewport />
            </Panel>
            {properties && (
              <Separator
                className="panel-separator"
                aria-label="Resize properties panel"
              />
            )}
            {properties && (
              <Panel
                id="properties"
                defaultSize={`${layout.inspectorWidthPct}%`}
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
        <Text size="xs" truncate>
          {s.tool} ·{" "}
          {s.tool === "select"
            ? `${s.selected.length} selected · Shift-click to add/remove · Drag empty space to select`
            : s.tool === "curve"
              ? "Drag an edge to bend; drag arms to shape"
              : s.tool === "point"
                ? "Click an existing edge to insert a point"
                : "Click in the workspace to begin"}
        </Text>
        <SaveFeedback
          status={s.saveStatus}
          onRetry={() => {
            void commands.save.bind({ execute: saveNow }).run();
          }}
          onExport={() =>
            commands.exportProject.bind({ execute: exportJson }).run()
          }
        />
      </Group>
      <Drawer
        opened={!!mobile && properties}
        onClose={() => {
          // Mantine handles Escape at window capture before a child modal can stop it.
          if (document.querySelector('[data-drafting-modal="true"]')) return;
          commands.hideProperties
            .bind({ execute: () => setProperties(false) })
            .run();
        }}
        title="Pattern properties"
        position={mobile ? "bottom" : "right"}
        size={mobile ? "75%" : "sm"}
      >
        <Inspector />
      </Drawer>
      {svgExport && <SvgExportDialog onClose={() => setSvgExport(false)} />}
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
            void switchWorkspace(() =>
              useEditor.getState().load({ ...doc, id: createId() }),
            );
          } catch {
            notifications.show({
              color: "red",
              title: "Import failed",
              message:
                "Choose a valid version 1–5 PatternAki JSON project under 10 MB. Your current pattern is unchanged.",
            });
          }
        }}
      />
    </div>
  );
}
