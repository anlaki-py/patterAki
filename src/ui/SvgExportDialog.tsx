import { useState } from "react";
import { Button, Checkbox, Group, Select, Stack, Text } from "@mantine/core";
import { useEditor } from "../editor/store";
import { pieceForItem } from "../document/pieceAccess";
import { exportSvg, type SvgExportOptions } from "../export/svg";
import { downloadSvg } from "../export/download";
import { DraggableModal } from "./DraggableModal";

export function SvgExportDialog({ onClose }: { onClose: () => void }) {
  const s = useEditor();
  const selected = [
    ...new Set(
      s.selected.flatMap((id) => {
        const piece = s.document.pieces[id] ?? pieceForItem(s.document, id);
        return piece?.visible ? [piece.id] : [];
      }),
    ),
  ];
  const [scope, setScope] = useState<string>(
    selected.length ? "selected" : "all",
  );
  const [options, setOptions] = useState<Omit<SvgExportOptions, "annotations">>(
    {
      cut: true,
      stitch: true,
      marks: true,
      internal: true,
      metadata: true,
    },
  );
  const [error, setError] = useState("");
  const pieces = Object.values(s.document.pieces).filter((p) => p.visible);
  const ids = scope === "all" ? pieces.map((p) => p.id) : selected;
  const available = s.ready && !s.preview && !s.hasDraft && !s.gestureActive;
  const hasLayer =
    options.cut ||
    options.stitch ||
    options.marks ||
    options.internal ||
    options.metadata;
  return (
    <DraggableModal title="Export vector SVG" onClose={onClose}>
      <Stack gap="sm">
        <Select
          label="Export scope"
          value={scope}
          onChange={(value) => value && setScope(value)}
          data={[
            { value: "all", label: "All visible pieces" },
            {
              value: "selected",
              label: `Selected pieces (${selected.length})`,
              disabled: !selected.length,
            },
          ]}
        />
        {(
          [
            ["cut", "Cut outlines"],
            ["stitch", "Stitch outlines"],
            ["marks", "Sewing marks and labels"],
            ["internal", "Internal construction paths"],
            ["metadata", "Piece metadata"],
          ] as const
        ).map(([key, label]) => (
          <Checkbox
            key={key}
            label={label}
            checked={options[key]}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setOptions((current) => ({ ...current, [key]: checked }));
            }}
          />
        ))}
        <Text size="xs">
          Physical dimensions use mm at 1:1 scale with a 10 mm margin. Hidden
          pieces are excluded. Internal paths follow their Export setting.
          All-piece exports include free annotations when marks are enabled;
          selected exports include attached marks only.
        </Text>
        {!available && (
          <Text size="sm">
            Finish or cancel the active edit before exporting.
          </Text>
        )}
        {error && (
          <Text role="alert" c="red" size="sm">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!available || !ids.length || !hasLayer}
            onClick={() => {
              try {
                const svg = exportSvg(s.document, ids, {
                  ...options,
                  annotations: scope === "all",
                });
                downloadSvg(
                  svg,
                  ids.length === 1
                    ? s.document.pieces[ids[0]].name
                    : s.document.name,
                );
                onClose();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not export SVG.",
                );
              }
            }}
          >
            Download SVG
          </Button>
        </Group>
      </Stack>
    </DraggableModal>
  );
}
