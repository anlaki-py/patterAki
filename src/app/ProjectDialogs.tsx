import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  ScrollArea,
} from "@mantine/core";
import { useEditor } from "../editor/store";
import {
  listSavedProjects,
  type SavedProject,
} from "../persistence/projectBrowser";
import {
  recoveryEnabled,
  setRecoveryEnabled,
} from "../persistence/preferences";
import { onProjectWrite } from "../persistence/repository";
import { requestStorageProtection } from "../persistence/storageProtection";

export type ProjectBrowserActions = {
  create: () => void;
  open: (id: string) => Promise<boolean>;
  rename: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string, refresh: () => void) => Promise<void>;
  recover: (id: string) => Promise<void>;
  exportStored: (id: string) => Promise<void>;
};
export function SavedProjectsDialog({
  actions,
}: {
  actions: ProjectBrowserActions;
}) {
  const currentId = useEditor((s) => s.document.id);
  const [items, setItems] = useState<SavedProject[]>([]),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [checkpoints, setCheckpoints] = useState(true),
    [protection, setProtection] = useState("");
  const reload = () => {
    void listSavedProjects()
      .then(setItems)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not read local projects.",
        ),
      );
  };
  useEffect(() => {
    let active = true;
    const failure = (cause: unknown) => {
      if (active)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not read local projects.",
        );
    };
    const refresh = () => {
      void listSavedProjects()
        .then((rows) => {
          if (active) setItems(rows);
        })
        .catch(failure);
    };
    refresh();
    void recoveryEnabled()
      .then((enabled) => {
        if (active) setCheckpoints(enabled);
      })
      .catch(failure);
    const stop = onProjectWrite(refresh);
    return () => {
      active = false;
      stop();
    };
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete project action.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack gap="xs">
      <Text size="xs">
        Most recently edited first. Projects stay in this browser; keep JSON
        backups. Open a recovery checkpoint as a separate project, or export a
        damaged record before deleting it.
      </Text>
      <Group>
        <Button onClick={actions.create} disabled={busy}>
          Create project
        </Button>
        <Button
          variant="default"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              setProtection(await requestStorageProtection()),
            )
          }
        >
          Protect local storage
        </Button>
      </Group>
      <Checkbox
        label="Keep last five recovery checkpoints"
        checked={checkpoints}
        disabled={busy}
        onChange={(event) => {
          const enabled = event.currentTarget.checked;
          void run(async () => {
            await setRecoveryEnabled(enabled);
            setCheckpoints(enabled);
          });
        }}
      />
      {protection && (
        <Text role="status" size="xs">
          {protection}
        </Text>
      )}
      {error && (
        <Text c="red" size="sm" role="alert">
          {error}
        </Text>
      )}
      {items.length === 0 && !error && (
        <Text size="sm">No saved projects yet.</Text>
      )}
      <ScrollArea.Autosize mah={420}>
        <Stack gap="xs">
          {items.map((project) => (
            <Stack key={project.id} gap={4} data-project-row={project.id}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                  <Text size="sm" truncate>
                    {project.name}
                    {project.id === currentId ? " (current)" : ""}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {new Date(project.updatedAt).toLocaleString()}
                  </Text>
                </Stack>
                <Button
                  size="xs"
                  variant="default"
                  disabled={busy || !!project.issue}
                  onClick={() => void run(() => actions.open(project.id))}
                >
                  {project.id === currentId ? "Reload" : "Open"}
                </Button>
                <Button
                  size="xs"
                  color="red"
                  variant="subtle"
                  disabled={busy}
                  onClick={() =>
                    void run(() => actions.remove(project.id, reload))
                  }
                >
                  Delete
                </Button>
              </Group>
              {project.issue && (
                <Text size="xs" c="red">
                  {project.issue}
                </Text>
              )}
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  disabled={busy || !!project.issue}
                  onClick={() => void run(() => actions.rename(project.id))}
                >
                  Rename
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  disabled={busy || !!project.issue}
                  onClick={() => void run(() => actions.duplicate(project.id))}
                >
                  Duplicate
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  disabled={busy}
                  onClick={() => void run(() => actions.recover(project.id))}
                >
                  Recovery
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  disabled={busy}
                  onClick={() =>
                    void run(() => actions.exportStored(project.id))
                  }
                >
                  Export stored JSON
                </Button>
              </Group>
            </Stack>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
