import { projectBackup } from "../persistence/referenceBackup";
import { documentSchema } from "../document/schema";
import { useRef } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { emptyDocument, type PatternDocument } from "../document/schema";
import {
  defaultSettings,
  settingsFromState,
  type EditorSettings,
} from "../editor/settings";
import { createId } from "../editor/ids";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { saveNow, needsLeaveWarning } from "../persistence/autosave";
import { db } from "../persistence/database";
import { ProjectRepository, repository } from "../persistence/repository";
import { rememberProject } from "../persistence/preferences";
import { listCheckpoints, recoveryDocument } from "../persistence/recovery";
import { downloadProjectJson } from "./projectFiles";
import { ProjectNameDialog } from "./ProjectNameDialog";
import {
  SavedProjectsDialog,
  type ProjectBrowserActions,
} from "./ProjectDialogs";

type Workspace = { document: PatternDocument; settings: EditorSettings };
function confirm(title: string, message: string, label: string) {
  return new Promise<boolean>((resolve) => {
    let accepted = false;
    modals.openConfirmModal({
      title,
      closeButtonProps: { "aria-label": "Close confirmation" },
      children: <Text size="sm">{message}</Text>,
      labels: { confirm: label, cancel: "Keep editing" },
      onConfirm: () => {
        accepted = true;
        resolve(true);
      },
      onClose: () => {
        if (!accepted) resolve(false);
      },
    });
  });
}
export function useProjectActions() {
  const busy = useRef(false);
  const reportError = (cause: unknown) =>
    notifications.show({
      color: "red",
      message:
        cause instanceof Error
          ? cause.message
          : "Could not complete project action.",
    });
  const replace = async (
    prepare: () => Promise<Workspace>,
    saveCurrent = true,
  ): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      let s = useEditor.getState();
      if (
        (s.hasDraft || s.preview || s.gestureActive) &&
        !(await confirm(
          "Discard the unfinished edit?",
          "Only committed geometry can be saved. Discard the active drawing or drag and continue?",
          "Discard edit and continue",
        ))
      )
        return false;
      if (saveCurrent && !(await saveNow()))
        throw new Error(
          "Could not save the current project. Export JSON or save a recovery copy before switching.",
        );
      s = useEditor.getState();
      const revision = s.revision,
        id = s.document.id,
        settings = JSON.stringify(settingsFromState(s));
      const next = await prepare();
      await rememberProject(next.document.id);
      const current = useEditor.getState();
      if (
        current.document.id !== id ||
        current.revision !== revision ||
        JSON.stringify(settingsFromState(current)) !== settings
      )
        throw new Error(
          "The current drawing changed during the project action. It has been kept; retry when editing is finished.",
        );
      // No awaits between loading document/preferences and marking their saved status.
      useEditor.getState().load(next.document);
      useEditor.getState().applySettings(next.settings);
      useEditor.setState({ saveStatus: "Saved locally" });
      return true;
    } catch (cause) {
      reportError(cause);
      return false;
    } finally {
      busy.current = false;
    }
  };
  const nameDialog = (
    title: string,
    name: string,
    action: string,
    submit: (name: string) => Promise<void>,
  ) => {
    const id = createId();
    modals.open({
      modalId: id,
      title,
      closeButtonProps: { "aria-label": "Close project name dialog" },
      closeOnClickOutside: false,
      children: (
        <ProjectNameDialog
          name={name}
          action={action}
          onSubmit={submit}
          onClose={() => modals.close(id)}
        />
      ),
    });
  };
  const newDocument = async (
    document: PatternDocument,
    settings: EditorSettings,
  ) => {
    await repository().save(document, settings);
    return { document, settings };
  };
  const create = (name = "Untitled pattern") =>
    replace(() =>
      newDocument(
        { ...emptyDocument(createId()), name },
        structuredClone(defaultSettings),
      ),
    );
  const createNamed = () =>
    nameDialog("Create project", "Untitled pattern", "Create", async (name) => {
      if (!(await create(name)))
        throw new Error(
          "Project creation did not complete. Your current drawing is retained.",
        );
      modals.close("saved-projects");
    });
  const copyCurrent = () =>
    nameDialog(
      "Save recovery copy",
      `${useEditor.getState().document.name.slice(0, 105)} recovered`,
      "Save copy",
      async (name) => {
        if (
          !(await replace(() => {
            const s = useEditor.getState();
            return newDocument(
              { ...s.document, id: createId(), name },
              settingsFromState(s),
            );
          }, false))
        )
          throw new Error(
            "Could not save a recovery copy. Export JSON to keep your drawing.",
          );
      },
    );
  const open = async (id: string) => {
    const same = useEditor.getState().document.id === id;
    if (same && needsLeaveWarning()) {
      if (
        !(await confirm(
          "Reload saved version?",
          "This replaces your in-memory drawing. Export JSON or save a recovery copy before discarding unsaved work.",
          "Reload saved version",
        ))
      )
        return false;
      useEditor.getState().cancel();
    }
    const result = await replace(() => repository().open(id), !same);
    if (result) modals.close("saved-projects");
    return result;
  };
  const rename = async (id = useEditor.getState().document.id) => {
    if (id === useEditor.getState().document.id) {
      nameDialog(
        "Rename project",
        useEditor.getState().document.name,
        "Rename",
        async (name) => {
          commands.rename.bind(name).run();
          if (!(await saveNow()))
            throw new Error(
              "The name changed in memory but could not save. Export JSON or save a recovery copy.",
            );
        },
      );
    } else {
      const catalog = new ProjectRepository(db),
        source = await catalog.open(id);
      nameDialog(
        "Rename saved project",
        source.document.name,
        "Rename",
        async (name) => {
          await catalog.save({ ...source.document, name }, source.settings);
          modals.close("saved-projects");
        },
      );
    }
  };
  const duplicate = async (id: string) => {
    const source = await new ProjectRepository(db).open(id);
    nameDialog(
      "Duplicate saved project",
      `${source.document.name.slice(0, 115)} copy`,
      "Duplicate",
      async (name) => {
        if (
          !(await replace(() =>
            newDocument(
              { ...source.document, id: createId(), name },
              source.settings,
            ),
          ))
        )
          throw new Error(
            "Could not duplicate project. Your drawing is retained.",
          );
        modals.close("saved-projects");
      },
    );
  };
  const remove = async (id: string, refresh?: () => void) => {
    const current = useEditor.getState().document.id === id;
    const catalog = current ? repository() : new ProjectRepository(db);
    if (!current) await catalog.observe(id);
    if (
      !(await confirm(
        "Delete saved project?",
        "This deletes the local project, preferences and its recovery checkpoints. Export JSON first if you need a backup. Other projects are kept.",
        "Delete project",
      ))
    )
      return;
    if (busy.current) return;
    busy.current = true;
    let deleted = false;
    try {
      const baseline = useEditor.getState();
      const settings = JSON.stringify(settingsFromState(baseline));
      const stillCurrent = () => {
        const state = useEditor.getState();
        if (state.document.id !== id) return false;
        if (
          baseline.document.id !== id ||
          state.revision !== baseline.revision ||
          state.preview !== baseline.preview ||
          state.hasDraft !== baseline.hasDraft ||
          state.gestureActive !== baseline.gestureActive ||
          JSON.stringify(settingsFromState(state)) !== settings
        ) {
          if (deleted)
            useEditor.setState({
              saveStatus:
                "Save failed. The saved project was deleted, but newer work was kept in memory. Save a recovery copy or export JSON.",
            });
          throw new Error(
            "Deletion stopped because the drawing changed. Newer work was kept in memory.",
          );
        }
        return true;
      };
      if (baseline.document.id === id) {
        if (!(await saveNow()))
          throw new Error(
            "Could not save the current drawing before deletion. Export JSON or save a recovery copy first.",
          );
        stillCurrent();
      }
      if (useEditor.getState().document.id === id)
        useEditor.setState({ saveStatus: "Deleting project…" });
      await catalog.remove(id);
      deleted = true;
      if (stillCurrent()) {
        const next = await newDocument(
          emptyDocument(createId()),
          structuredClone(defaultSettings),
        );
        await rememberProject(next.document.id);
        if (stillCurrent()) {
          useEditor.getState().load(next.document);
          useEditor.getState().applySettings(next.settings);
          useEditor.setState({ saveStatus: "Saved locally" });
        }
      }
      refresh?.();
    } catch (cause) {
      if (useEditor.getState().document.id === id)
        useEditor.setState({
          saveStatus: `Save failed. ${deleted ? "The saved project was deleted, but your drawing is still in memory." : cause instanceof Error ? cause.message : "Could not delete the saved project."} Save a recovery copy or export JSON.`,
        });
      throw cause;
    } finally {
      busy.current = false;
    }
  };
  const recover = async (id: string) => {
    const points = await listCheckpoints(id);
    const modalId = createId();
    modals.open({
      modalId,
      title: "Recovery checkpoints",
      closeButtonProps: { "aria-label": "Close recovery checkpoints" },
      children: (
        <Stack gap="xs">
          <Text size="xs">
            Only committed, successfully saved geometry appears here. Recovery
            opens a new project and preserves the source record.
          </Text>
          {!points.length && (
            <Text size="sm">No recovery checkpoints are available.</Text>
          )}
          {points.map((point) => (
            <Button
              key={point.id}
              variant="default"
              onClick={() => {
                void replace(async () => {
                  const doc = await recoveryDocument(point.id);
                  return newDocument(
                    {
                      ...doc,
                      id: createId(),
                      name: `${doc.name.slice(0, 105)} recovered`,
                    },
                    structuredClone(defaultSettings),
                  );
                }).then((opened) => {
                  if (opened) {
                    modals.close(modalId);
                    modals.close("saved-projects");
                  }
                });
              }}
            >
              Open recovery copy · revision {point.revision} ·{" "}
              {new Date(point.savedAt).toLocaleString()}
            </Button>
          ))}
        </Stack>
      ),
    });
  };
  const exportStored = async (id: string) => {
    const row = await db.projects.get(id);
    if (!row) throw new Error("This saved project no longer exists.");
    const parsed = documentSchema.safeParse(row.document);
    downloadProjectJson(
      parsed.success
        ? await projectBackup(parsed.data).catch((cause) => {
            reportError(cause);
            return row.document;
          })
        : (row.document ?? row),
      `Stored project ${id}`,
    );
  };
  const actions: ProjectBrowserActions = {
    create: createNamed,
    open,
    rename,
    duplicate,
    remove,
    recover,
    exportStored,
  };
  const openProjects = () =>
    modals.open({
      modalId: "saved-projects",
      title: "Open saved project",
      closeButtonProps: { "aria-label": "Close project browser" },
      size: "lg",
      children: <SavedProjectsDialog actions={actions} />,
    });
  return {
    create,
    rename: () => {
      void rename().catch(reportError);
    },
    remove: () => {
      void remove(useEditor.getState().document.id).catch(reportError);
    },
    openProjects,
    copyCurrent,
    importProject: (doc: PatternDocument) =>
      replace(() =>
        newDocument(
          { ...doc, id: createId() },
          structuredClone(defaultSettings),
        ),
      ),
  };
}
