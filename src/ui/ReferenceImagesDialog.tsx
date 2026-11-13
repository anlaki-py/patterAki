import { useReferenceRaster } from "../editor/useReferenceRaster";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  FileButton,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import type { ReferenceImage } from "../document/referenceSchema";
import {
  referenceDimensions,
  referenceSchema,
} from "../document/referenceSchema";
import { useEditor } from "../editor/store";
import { createId } from "../editor/ids";
import { db } from "../persistence/database";
import { calibrationScale, validateCorners } from "../geometry/perspective";
import type { Vec2 as Point } from "../geometry/line";
import { decodeImage } from "../editor/referenceImage";
import { DraggableModal } from "./DraggableModal";
import { downloadFile } from "../export/download";

export function ReferenceDialog({ onClose }: { onClose: () => void }) {
  const s = useEditor();
  const [id, setId] = useState(
    Object.keys(s.document.references ?? {})[0] ?? "",
  );
  const [draft, setDraft] = useState<ReferenceImage | null>(
    s.document.references?.[id] ?? null,
  );
  const [points, setPoints] = useState<Point[]>([]);
  const [mode, setMode] = useState("calibrate");
  const [paperWidth, setPaperWidth] = useState<number | string>(210);
  const [paperHeight, setPaperHeight] = useState<number | string>(297);
  const [distance, setDistance] = useState<number | string>(100);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const projectId = useRef(s.document.id);
  const baseline = useRef(s.document.references);
  const imageSize = draft
    ? referenceDimensions(
        mode === "perspective" ? { ...draft, corners: undefined } : draft,
      )
    : { width: 1, height: 1 };
  const active = s.hasDraft || !!s.preview || s.gestureActive;
  const { url, error: rasterError } = useReferenceRaster(
    draft,
    mode === "perspective",
  );
  const report = (cause: unknown) =>
    setError(
      cause instanceof Error ? cause.message : "Reference operation failed.",
    );
  const change = (fields: Partial<ReferenceImage>) => {
    if (draft) {
      setDraft({ ...draft, ...fields });
      setError("");
    }
  };
  const commit = (next: ReferenceImage | null) => {
    if (!mounted.current)
      throw new Error(
        "Reference dialog was closed. No image layer was committed.",
      );
    const current = useEditor.getState();
    if (
      current.document.id !== projectId.current ||
      current.document.references !== baseline.current
    )
      throw new Error(
        "References changed while this dialog was open. Reopen the dialog to edit the current version.",
      );
    if (current.hasDraft || current.preview || current.gestureActive)
      throw new Error("Finish or cancel the active edit first.");
    const references = { ...current.document.references };
    if (next) references[next.id] = referenceSchema.parse(next);
    else delete references[id];
    current.commit({ ...current.document, references });
    baseline.current = useEditor.getState().document.references;
  };
  const importFile = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const image = await decodeImage(file);
      const ref: ReferenceImage = {
        id: createId(),
        assetId: createId(),
        name: file.name.slice(0, 255) || "Reference",
        widthPx: image.width,
        heightPx: image.height,
        x: 0,
        y: 0,
        mmPerPixel: 1,
        rotation: 0,
        opacity: 0.4,
        locked: true,
        visible: true,
      };
      image.close();
      // Store the original first. A quota failure cannot leave a committed dangling reference.
      await db.assets.add({ id: ref.assetId, blob: file, mime: file.type });
      commit(ref);
      setId(ref.id);
      setDraft(ref);
      setPoints([]);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DraggableModal title="Reference images" onClose={onClose}>
      <Stack gap="sm">
        <Text size="sm">
          Photos are not to scale until calibrated. One distance cannot detect
          uneven scale, curled paper or lens distortion. Perspective correction
          is approximate. Trace using Line, Polyline and Curve after closing
          this dialog.
        </Text>
        <FileButton
          accept="image/png,image/jpeg"
          onChange={(file) => void importFile(file)}
        >
          {(props) => (
            <Button {...props} disabled={busy || active}>
              Import PNG/JPEG
            </Button>
          )}
        </FileButton>
        <Select
          label="Reference layer"
          value={id || null}
          data={Object.values(s.document.references ?? {}).map((r) => ({
            value: r.id,
            label: r.name,
          }))}
          onChange={(value) => {
            if (value) {
              setId(value);
              setDraft(s.document.references?.[value] ?? null);
              setPoints([]);
              setError("");
            }
          }}
        />
        {draft && (
          <>
            <Text size="xs">
              {draft.calibration
                ? `Calibrated from ${draft.calibration.distanceMm} mm. Verify a second distance before cutting.`
                : "Uncalibrated image. Display size is provisional."}{" "}
              Placement and rotation apply around the top left corner.
            </Text>
            <Switch
              label="Lock reference placement"
              checked={draft.locked}
              onChange={(e) => change({ locked: e.currentTarget.checked })}
            />
            <Switch
              label="Show reference"
              checked={draft.visible}
              onChange={(e) => change({ visible: e.currentTarget.checked })}
            />
            <NumberInput
              label="Opacity"
              min={0}
              max={1}
              step={0.1}
              value={draft.opacity}
              onChange={(v) => change({ opacity: Number(v) })}
            />
            <Group grow>
              {(
                [
                  ["x", "X position (mm)"],
                  ["y", "Y position (mm)"],
                  ["rotation", "Rotation (degrees)"],
                ] as const
              ).map(([key, label]) => (
                <NumberInput
                  key={key}
                  label={label}
                  disabled={draft.locked}
                  value={draft[key]}
                  onChange={(v) => change({ [key]: Number(v) })}
                />
              ))}
            </Group>
            <Select
              label="Image operation"
              value={mode}
              onChange={(v) => {
                setMode(v ?? "calibrate");
                setPoints([]);
              }}
              data={[
                { value: "calibrate", label: "Two-point calibration" },
                {
                  value: "perspective",
                  label: "Four-corner perspective correction",
                },
              ]}
            />
            <Text size="xs">
              {mode === "calibrate"
                ? "Click two points on the image, then enter their known distance in mm."
                : "Click the paper corners in perimeter order: top left, top right, bottom right, bottom left. Correct perspective before calibrating. Extreme angles reduce accuracy."}{" "}
              {points.length} points selected.
            </Text>
            {url && (
              <svg
                aria-label="Reference point picker"
                role="img"
                viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                style={{
                  width: "100%",
                  maxHeight: 300,
                  background: "#eee",
                  touchAction: "none",
                  cursor: "crosshair",
                }}
                onClick={(e) => {
                  const p = e.currentTarget.createSVGPoint();
                  p.x = e.clientX;
                  p.y = e.clientY;
                  const matrix = e.currentTarget.getScreenCTM();
                  if (!matrix) return;
                  const local = p.matrixTransform(matrix.inverse());
                  if (
                    local.x < 0 ||
                    local.y < 0 ||
                    local.x > imageSize.width ||
                    local.y > imageSize.height
                  )
                    return;
                  const limit = mode === "calibrate" ? 2 : 4;
                  setPoints((old) =>
                    old.length >= limit
                      ? [{ x: local.x, y: local.y }]
                      : [...old, { x: local.x, y: local.y }],
                  );
                }}
              >
                <image
                  href={url}
                  width={imageSize.width}
                  height={imageSize.height}
                />
                {points.map((p, i) => (
                  <g key={i}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={Math.max(draft.widthPx, draft.heightPx) / 70}
                      fill="red"
                    />
                    <text
                      x={p.x}
                      y={p.y}
                      fontSize={Math.max(draft.widthPx, draft.heightPx) / 25}
                      fill="white"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
              </svg>
            )}
            {mode === "perspective" && (
              <Group grow>
                <NumberInput
                  label="Paper width (mm)"
                  value={paperWidth}
                  min={0.001}
                  onChange={setPaperWidth}
                />
                <NumberInput
                  label="Paper height (mm)"
                  value={paperHeight}
                  min={0.001}
                  onChange={setPaperHeight}
                />
              </Group>
            )}
            {points.map((point, index) => (
              <Group grow key={index}>
                <NumberInput
                  label={`Point ${index + 1} X (pixels)`}
                  value={point.x}
                  min={0}
                  max={imageSize.width}
                  onChange={(value) =>
                    setPoints((old) =>
                      old.map((p, i) =>
                        i === index ? { ...p, x: Number(value) } : p,
                      ),
                    )
                  }
                />
                <NumberInput
                  label={`Point ${index + 1} Y (pixels)`}
                  value={point.y}
                  min={0}
                  max={imageSize.height}
                  onChange={(value) =>
                    setPoints((old) =>
                      old.map((p, i) =>
                        i === index ? { ...p, y: Number(value) } : p,
                      ),
                    )
                  }
                />
              </Group>
            ))}
            {mode === "calibrate" && (
              <NumberInput
                label="Known distance (mm)"
                min={0.001}
                value={distance}
                onChange={setDistance}
              />
            )}
            <Group>
              <Button variant="default" onClick={() => setPoints([])}>
                Clear points
              </Button>
              <Button
                disabled={
                  points.length !== (mode === "calibrate" ? 2 : 4) ||
                  draft.locked
                }
                onClick={() => {
                  try {
                    if (mode === "calibrate")
                      change({
                        mmPerPixel: calibrationScale(
                          points[0],
                          points[1],
                          Number(distance),
                        ),
                        calibration: {
                          a: points[0],
                          b: points[1],
                          distanceMm: Number(distance),
                        },
                      });
                    else {
                      validateCorners(points);
                      const correction = referenceSchema.parse({
                        ...draft,
                        corners: points,
                        perspectiveSize: {
                          widthMm: Number(paperWidth),
                          heightMm: Number(paperHeight),
                        },
                        calibration: undefined,
                        mmPerPixel: 1,
                      });
                      change(correction);
                      setMode("calibrate");
                    }
                    setPoints([]);
                    setError("");
                  } catch (e) {
                    report(e);
                  }
                }}
              >
                {mode === "calibrate"
                  ? "Calibrate preview"
                  : "Correct perspective preview"}
              </Button>
            </Group>
            <Text size="xs">
              Unlock placement to calibrate, correct perspective, move or
              rotate. Changes preview here; Apply creates one undo step.
              Original image bytes stay unchanged.
            </Text>
            <Button
              variant="default"
              onClick={() =>
                void db.assets
                  .get(draft.assetId)
                  .then((asset) => {
                    if (!asset) throw new Error("Original image missing.");
                    downloadFile(
                      asset.blob,
                      draft.name.replace(/\.[^.]+$/, ""),
                      asset.mime === "image/png" ? "png" : "jpg",
                    );
                  })
                  .catch(report)
              }
            >
              Download original image
            </Button>
            <Button
              color="red"
              variant="light"
              disabled={busy || active}
              onClick={() => {
                try {
                  commit(null);
                  setId("");
                  setDraft(null);
                } catch (e) {
                  report(e);
                }
              }}
            >
              Remove reference layer
            </Button>
          </>
        )}
        {(error || rasterError) && (
          <Text c="red" role="alert">
            {error || rasterError}
          </Text>
        )}
        {active && (
          <Text>
            Finish or cancel the active edit before changing references.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!draft || active || busy}
            onClick={() => {
              try {
                commit(draft);
                onClose();
              } catch (e) {
                report(e);
              }
            }}
          >
            Apply reference
          </Button>
        </Group>
      </Stack>
    </DraggableModal>
  );
}
