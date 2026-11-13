import {
  drawingScope,
  resolveExportScope,
  type ExportScope,
} from "../export/drawingScope";
import { ExportScopeSelect } from "./ExportScopeSelect";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { useEditor } from "../editor/store";
import { defaultPdfLayers } from "../export/pdfDrawing";
import {
  defaultPdfLayout,
  pdfLayoutSchema,
  type PdfLayoutOptions,
} from "../export/tiling";
import { downloadPdf } from "../export/download";
import { DraggableModal } from "./DraggableModal";

export function PdfExportDialog({ onClose }: { onClose: () => void }) {
  const s = useEditor();
  const availableScopes = drawingScope(s.document, s.selected);
  const [scope, setScope] = useState<ExportScope>(availableScopes.initial);
  const [drawingLines, setDrawingLines] = useState(true);
  const [layout, setLayout] = useState<
    Pick<PdfLayoutOptions, "mode" | "orientation">
  >({
    mode: defaultPdfLayout.mode,
    orientation: defaultPdfLayout.orientation,
  });
  const [margin, setMargin] = useState<number | string>(
      defaultPdfLayout.marginMm,
    ),
    [overlap, setOverlap] = useState<number | string>(
      defaultPdfLayout.overlapMm,
    );
  const [layers, setLayers] = useState({ ...defaultPdfLayers });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const close = () => {
    active.current = false;
    onClose();
  };
  const target = resolveExportScope(
    s.document,
    s.selected,
    scope,
    drawingLines,
  );
  const ids = target.pieceIds;
  const parsed = pdfLayoutSchema.safeParse({
    ...layout,
    marginMm: margin,
    overlapMm: overlap,
  });
  const available = s.ready && !s.preview && !s.hasDraft && !s.gestureActive;
  return (
    <DraggableModal title="Export actual-size PDF" onClose={close}>
      <Stack gap="xs">
        <ExportScopeSelect
          label="PDF scope"
          value={scope}
          onChange={setScope}
          disabled={busy}
          selectedPieces={availableScopes.selectedPieces.length}
          selectedItems={availableScopes.selectedItems.length}
        />
        {(scope === "drawing" || scope === "selection") && (
          <Checkbox
            label="Drawing lines and curves"
            checked={drawingLines}
            disabled={busy}
            onChange={(event) => setDrawingLines(event.currentTarget.checked)}
          />
        )}
        <Select
          label="Paper layout"
          value={layout.mode}
          disabled={busy}
          onChange={(mode) => {
            if (mode === "a4" || mode === "large")
              setLayout((o) => ({ ...o, mode }));
          }}
          data={[
            { value: "a4", label: "Tiled A4" },
            { value: "large", label: "One large sheet" },
          ]}
        />
        <Select
          label="Paper orientation"
          value={layout.orientation}
          disabled={busy}
          onChange={(orientation) => {
            if (orientation === "portrait" || orientation === "landscape")
              setLayout((o) => ({ ...o, orientation }));
          }}
          data={[
            { value: "portrait", label: "Portrait" },
            { value: "landscape", label: "Landscape" },
          ]}
        />
        <Group grow align="start">
          <NumberInput
            label="Print margin (mm)"
            min={0}
            max={20}
            value={margin}
            onChange={setMargin}
            disabled={busy}
            error={
              typeof margin !== "number" || margin < 0 || margin > 20
                ? "Use 0–20 mm."
                : undefined
            }
          />
          <NumberInput
            label="Tile overlap (mm)"
            min={4}
            max={50}
            value={overlap}
            onChange={setOverlap}
            disabled={busy || layout.mode === "large"}
            error={
              typeof overlap !== "number" || overlap < 4 || overlap > 50
                ? "Use 4–50 mm."
                : undefined
            }
          />
        </Group>
        <SimpleGrid cols={2} spacing="xs">
          {(
            [
              ["stitch", "Stitch outlines"],
              ["cut", "Cut outlines"],
              ["fold", "Fold marks"],
              ["grainline", "Grainlines"],
              ["notches", "Notches"],
              ["darts", "Darts"],
              ["text", "Text and labels"],
              ["guides", "Workspace guides"],
              ["internal", "Internal paths"],
              ["metadata", "Piece metadata"],
            ] as const
          )
            .filter(
              ([key]) =>
                ids.length > 0 ||
                key === "fold" ||
                key === "grainline" ||
                key === "text" ||
                key === "guides",
            )
            .map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={layers[key]}
                disabled={busy}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setLayers((current) => ({ ...current, [key]: checked }));
                }}
              />
            ))}
        </SimpleGrid>
        <Text size="xs">
          Print at actual size / 100%. Disable Fit to page. Printer-driver
          scaling can change paper output.
        </Text>
        <Text size="xs">
          Pages contain pattern content and graphical tile alignment marks only.
          Hidden pieces are excluded. Geometry prints at 1:1.
        </Text>
        {!available && (
          <Text size="xs">
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
            disabled={
              !available ||
              !target.hasContent ||
              !parsed.success ||
              (!Object.values(layers).some(Boolean) &&
                !target.drawing?.segmentIds.length)
            }
            onClick={async () => {
              if (!parsed.success || busy) return;
              setBusy(true);
              setError("");
              try {
                const { exportPdf } = await import("../export/pdf");
                if (!active.current) return;
                const bytes = await exportPdf(s.document, ids, {
                  ...parsed.data,
                  layers,
                  annotations: target.annotations,
                  drawing: target.drawing,
                });
                if (!active.current) return;
                downloadPdf(
                  bytes,
                  ids.length === 1 && scope !== "drawing"
                    ? s.document.pieces[ids[0]].name
                    : s.document.name,
                );
                close();
              } catch (cause) {
                if (active.current)
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not export PDF.",
                  );
              } finally {
                if (active.current) setBusy(false);
              }
            }}
          >
            Download PDF
          </Button>
        </Group>
      </Stack>
    </DraggableModal>
  );
}
