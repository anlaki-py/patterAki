import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import {
  AlertTriangle,
  Check,
  Download,
  LoaderCircle,
  RefreshCcw,
  Pencil,
} from "lucide-react";
import { saveKind } from "./saveFeedback";

export function SaveFeedback({
  status,
  onRetry,
  onExport,
}: {
  status: string;
  onRetry: () => void;
  onExport: () => void;
}) {
  const kind = saveKind(status);
  const Icon =
    kind === "error"
      ? AlertTriangle
      : kind === "saved"
        ? Check
        : kind === "saving"
          ? LoaderCircle
          : Pencil;
  const message = kind === "error" ? "Local save failed" : status;
  return (
    <Group gap={5} wrap="nowrap" className="save-feedback">
      <Icon
        size={13}
        aria-hidden="true"
        color={kind === "error" ? "var(--mantine-color-red-6)" : undefined}
      />
      <Tooltip label={status} disabled={kind !== "error"}>
        <Text
          size="xs"
          truncate
          c={kind === "error" ? "red" : undefined}
          role={kind === "error" ? "alert" : "status"}
        >
          {message}
        </Text>
      </Tooltip>
      {kind === "error" && (
        <>
          <Tooltip label="Retry saving to this device">
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={onRetry}
              aria-label="Retry local save"
            >
              <RefreshCcw size={15} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Export your current drawing as a JSON backup">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={onExport}
              aria-label="Export JSON backup"
            >
              <Download size={15} />
            </ActionIcon>
          </Tooltip>
        </>
      )}
    </Group>
  );
}
