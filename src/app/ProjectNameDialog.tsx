import { useState } from "react";
import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
export function ProjectNameDialog({
  name,
  action,
  onSubmit,
  onClose,
}: {
  name: string;
  action: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const valid = value.trim().length > 0 && value.trim().length <= 120;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update project.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack gap="sm">
      <TextInput
        label="Project name"
        autoFocus
        maxLength={120}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        error={!valid ? "Enter a name of 1–120 characters." : undefined}
      />
      {error && (
        <Text role="alert" c="red" size="sm">
          {error}
        </Text>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={!valid} loading={busy}>
          {action}
        </Button>
      </Group>
    </Stack>
  );
}
