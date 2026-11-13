import {
  drawingScope,
  resolveExportScope,
  type ExportScope,
} from "../export/drawingScope";
import { ExportScopeSelect } from "./ExportScopeSelect";
import { reviewSvg } from "../export/referenceReview";
import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Group, Stack, Text } from "@mantine/core";
import { useEditor } from "../editor/store";
import { exportSvg, type SvgExportOptions } from "../export/svg";
import { downloadSvg } from "../export/download";
import { DraggableModal } from "./DraggableModal";

export function SvgExportDialog({ onClose }: { onClose: () => void }) {
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);
  const close = () => {
    cancelled.current = true;
    onClose();
  };
  const s = useEditor();
  const availableScopes = drawingScope(s.document, s.selected);
  const [scope, setScope] = useState<ExportScope>(availableScopes.initial);
  const [drawingLines, setDrawingLines] = useState(true);
  const [options, setOptions] = useState<Omit<SvgExportOptions, "annotations">>(
    {
      cut: true,
      stitch: true,
      marks: true,
      internal: true,
      metadata: true,
    },
  );
  const [underlay, setUnderlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = resolveExportScope(
    s.document,
    s.selected,
    scope,
    drawingLines,
  );
  const ids = target.pieceIds;
  const available = s.ready && !s.preview && !s.hasDraft && !s.gestureActive;
  const hasLayer =
    (ids.length > 0 &&
      (options.cut ||
        options.stitch ||
        options.marks ||
        options.internal ||
        options.metadata)) ||
    !!target.drawing?.segmentIds.length ||
    (options.marks &&
      (!!target.drawing?.annotationIds.length ||
        (target.annotations &&
          Object.keys(s.document.annotations).length > 0)));
  return (
    <DraggableModal title="Export vector SVG" onClose={close}>
      <Stack gap="sm">
        <ExportScopeSelect
          label="Export scope"
          value={scope}
          onChange={setScope}
          selectedPieces={availableScopes.selectedPieces.length}
          selectedItems={availableScopes.selectedItems.length}
        />
        {(scope === "drawing" || scope === "selection") && (
          <Checkbox
            label="Drawing lines and curves"
            checked={drawingLines}
            onChange={(event) => setDrawingLines(event.currentTarget.checked)}
          />
        )}
        {(
          [
            ["cut", "Cut outlines"],
            ["stitch", "Stitch outlines"],
            ["marks", "Sewing marks and labels"],
            ["internal", "Internal construction paths"],
            ["metadata", "Piece metadata"],
          ] as const
        )
          .filter(([key]) => ids.length > 0 || key === "marks")
          .map(([key, label]) => (
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
        <Checkbox
          label="Reference underlay for review only"
          checked={underlay}
          onChange={(e) => setUnderlay(e.currentTarget.checked)}
        />
        {underlay && (
          <Text size="xs" c="orange">
            Review SVG includes visible raster references within the pattern
            bounds. Photos may be uncalibrated or distorted. Manufacturing
            SVG/PDF excludes them by default.
          </Text>
        )}
        <Text size="xs">
          Physical dimensions print at 1:1 with a 10 mm margin. Drawings need no
          piece conversion. Hidden pieces are excluded; piece paths follow their
          Export setting.
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
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!available || !hasLayer || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const svg = exportSvg(s.document, ids, {
                  ...options,
                  annotations: target.annotations,
                  drawing: target.drawing,
                });
                const output = underlay
                  ? await reviewSvg(svg, s.document)
                  : svg;
                if (cancelled.current) return;
                downloadSvg(
                  output,
                  ids.length === 1 && scope !== "drawing"
                    ? s.document.pieces[ids[0]].name
                    : s.document.name,
                );
                close();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not export SVG.",
                );
              } finally {
                setBusy(false);
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
