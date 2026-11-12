import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import {
  AlertTriangle,
  Check,
  Download,
  LoaderCircle,
  RefreshCcw,
  Pencil,
  Copy,
} from "lucide-react";
import { saveKind } from "./saveFeedback";

export function SaveFeedback({
  status,
  onRetry,
  onExport,
  onRecover,
}: {
  status: string;
  onRetry: () => void;
  onExport: () => void;
  onRecover?: () => void;
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
  const message = /conflict/i.test(status)
    ? "Project changed in another tab"
    : kind === "error"
      ? "Local save failed"
      : status;
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
          {onRecover && (
            <Tooltip label="Save your current drawing as a new project">
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={onRecover}
                aria-label="Save recovery copy"
              >
                <Copy size={15} />
              </ActionIcon>
            </Tooltip>
          )}
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
