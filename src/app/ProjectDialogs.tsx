import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  ScrollArea,
} from "@mantine/core";
import { commands } from "../editor/commands";
import {
  listSavedProjects,
  type SavedProject,
} from "../persistence/projectBrowser";

export function RenameProjectDialog({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(name);
  const valid = commands.rename.bind(value.trim()).enabled();
  const submit = () => {
    if (!valid) return;
    commands.rename.bind(value.trim()).run();
    onClose();
  };
  return (
    <Stack gap="sm">
      <TextInput
        label="Project name"
        autoFocus
        value={value}
        maxLength={120}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        error={
          !valid && value.length > 0
            ? "Enter a name of 1–120 characters."
            : undefined
        }
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!valid}>
          Rename
        </Button>
      </Group>
    </Stack>
  );
}

export function SavedProjectsDialog({
  currentId,
  onOpen,
  onDelete,
}: {
  currentId: string;
  onOpen: (id: string) => Promise<boolean>;
  onDelete: (id: string, refresh: () => void) => void;
}) {
  const [items, setItems] = useState<SavedProject[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = () => {
    void listSavedProjects()
      .then((result) => {
        setItems(result);
        setError("");
      })
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not read local projects.",
        ),
      );
  };
  useEffect(() => {
    // Keep async reads from updating a closed modal.
    let active = true;
    void listSavedProjects()
      .then((result) => {
        if (active) setItems(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not read local projects.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Projects stay in this browser's local storage. Export JSON to keep a
        separate backup.
      </Text>
      {error && (
        <Text c="red" size="sm" role="alert">
          {error}
        </Text>
      )}
      {items.length === 0 && !error && (
        <Text size="sm">No saved projects yet.</Text>
      )}
      <ScrollArea.Autosize mah={380}>
        <Stack gap="xs">
          {items.map((project) => (
            <Group
              key={project.id}
              justify="space-between"
              wrap="nowrap"
              gap="xs"
            >
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
                disabled={busy || project.id === currentId}
                onClick={() => {
                  setBusy(true);
                  void onOpen(project.id).finally(() => setBusy(false));
                }}
              >
                Open
              </Button>
              <Button
                size="xs"
                color="red"
                variant="subtle"
                disabled={busy}
                onClick={() => onDelete(project.id, reload)}
              >
                Delete
              </Button>
            </Group>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
