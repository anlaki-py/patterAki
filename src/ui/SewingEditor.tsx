import { commands } from "../editor/commands";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DraggableModal } from "./DraggableModal";
import { useEditor } from "../editor/store";
import { createId } from "../editor/ids";
import { pieceBounds } from "../document/pieceTransforms";
import { inverseTransform } from "../document/sewing";
import { updateSewing } from "../document/sewing";
import { addEllipse } from "../document/ellipse";
import { segmentLength } from "../document/segments";
import type { Sewing } from "../document/sewingSchema";
import type { PatternDocument } from "../document/schema";
export type SewingSession = {
  base: PatternDocument;
  pieceId: string;
  kind: "notch" | "dart" | "grainline" | "fold" | "ellipse";
  edgeId: string;
  id: string;
};
export function SewingEditor({
  session,
  onClose,
}: {
  session: SewingSession;
  onClose: () => void;
}) {
  const { base, pieceId, kind, id, edgeId } = session,
    piece = base.pieces[pieceId];
  const notch = piece?.sewing?.notches.find((n) => n.id === id),
    dart = piece?.sewing?.darts.find((d) => d.id === id),
    mark = piece?.sewing?.marks.find((m) => m.id === id);
  const bounds = piece
    ? pieceBounds(base, [pieceId])
    : { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const origin = piece
    ? inverseTransform(piece.transform, {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: bounds.min.y + 20,
      })
    : { x: 0, y: 0 };
  const [x, setX] = useState(dart?.center.x ?? mark?.position.x ?? origin.x),
    [y, setY] = useState(dart?.center.y ?? mark?.position.y ?? origin.y),
    [angle, setAngle] = useState(dart?.rotation ?? mark?.rotation ?? 0);
  const [width, setWidth] = useState(dart?.intakeMm ?? 20),
    [depth, setDepth] = useState(dart?.depthMm ?? 100),
    [length, setLength] = useState(mark?.lengthMm ?? 50);
  const total = base.segments[edgeId]
    ? segmentLength(base, base.segments[edgeId])
    : 1;
  const [distance, setDistance] = useState(
      notch ? notch.fraction * total : Math.min(25, total / 2),
    ),
    [notchDepth, setNotchDepth] = useState(notch?.depthMm ?? 3),
    [style, setStyle] = useState<Sewing["notches"][number]["style"]>(
      notch?.style ?? "single",
    );
  const [attach, setAttach] = useState<string | null>(mark?.segmentId ?? null),
    [error, setError] = useState("");
  const [label, setLabel] = useState(mark?.label ?? "");
  const [fontSize, setFontSize] = useState(mark?.fontSizeMm ?? 4);
  const candidate = useMemo(() => {
    try {
      if (kind === "ellipse")
        return {
          doc: addEllipse(
            base,
            x,
            y,
            width,
            depth,
            (() => {
              let n = 0;
              return () => `${id}-${++n}`;
            })(),
          ),
          error: "",
        };
      return {
        doc: updateSewing(base, pieceId, (s) => {
          if (kind === "notch")
            s.notches = [
              ...s.notches.filter((n) => n.id !== id),
              {
                id,
                segmentId: edgeId,
                fraction: distance / total,
                style,
                depthMm: notchDepth,
              },
            ];
          else if (kind === "dart")
            s.darts = [
              ...s.darts.filter((d) => d.id !== id),
              {
                id,
                center: { x, y },
                rotation: angle,
                intakeMm: width,
                depthMm: depth,
              },
            ];
          else {
            if (kind === "fold" && attach) s.edges[attach] = { role: "fold" };
            s.marks = [
              ...s.marks.filter((m) => m.id !== id),
              {
                id,
                kind,
                position: { x, y },
                rotation: angle,
                lengthMm: length,
                label,
                fontSizeMm: fontSize,
                ...(attach
                  ? {
                      segmentId: attach,
                      ...(mark?.segmentId === attach &&
                      mark.fraction !== undefined
                        ? { fraction: mark.fraction }
                        : {}),
                    }
                  : {}),
              },
            ];
          }
          return s;
        }),
        error: "",
      };
    } catch (e) {
      return { doc: null, error: (e as Error).message };
    }
  }, [
    base,
    label,
    fontSize,
    mark?.segmentId,
    mark?.fraction,
    pieceId,
    kind,
    id,
    edgeId,
    x,
    y,
    width,
    depth,
    angle,
    distance,
    total,
    style,
    notchDepth,
    length,
    attach,
  ]);
  useEffect(() => {
    useEditor.setState({ preview: candidate.doc });
    return () => useEditor.setState({ preview: null });
  }, [candidate.doc]);
  const apply = () => {
    try {
      if (useEditor.getState().document !== base)
        throw new Error("The document changed. Reopen this editor.");
      commands.applySewingPreview
        .bind({ base, candidate: candidate.doc! })
        .run();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const edgeAttached = (kind === "grainline" || kind === "fold") && !!attach;
  const field = (
    label: string,
    value: number,
    set: (n: number) => void,
    min?: number,
  ) => (
    <NumberInput
      label={label}
      value={value}
      min={min}
      onKeyDown={(e) => {
        if (e.key === "Enter" && candidate.doc) {
          e.preventDefault();
          apply();
        }
      }}
      onChange={(v) => set(typeof v === "number" ? v : NaN)}
    />
  );
  return (
    <DraggableModal
      title={`${kind === "ellipse" ? "Draft" : "Edit"} ${kind}`}
      onClose={onClose}
    >
      <Stack gap="xs">
        {kind === "notch" ? (
          <>
            <Text size="sm">
              A → B along the stored edge. Arc distance {total.toFixed(3)} mm.
            </Text>
            {field("Distance from A (mm)", distance, setDistance, 0)}
            {field(
              "Fraction along edge",
              distance / total,
              (v) => setDistance(v * total),
              0,
            )}
            <Select
              label="Notch style"
              data={["single", "double", "V", "T"]}
              value={style}
              onChange={(v) => {
                if (v) setStyle(v as typeof style);
              }}
            />
            {field("Notch depth (mm)", notchDepth, setNotchDepth, 0.1)}
          </>
        ) : (
          <>
            {!edgeAttached && (
              <>
                {field(
                  kind === "ellipse" ? "Ellipse X (mm)" : "Local X (mm)",
                  x,
                  setX,
                )}
                {field(
                  kind === "ellipse" ? "Ellipse Y (mm)" : "Local Y (mm)",
                  y,
                  setY,
                )}
                {kind !== "ellipse" &&
                  field("Angle (degrees)", angle, setAngle)}
              </>
            )}
            {edgeAttached && (
              <Text size="xs">
                This mark follows its edge position and tangent. Clear the
                attachment to edit its position and angle.
              </Text>
            )}
            {kind === "dart" || kind === "ellipse" ? (
              <>
                {field(
                  kind === "dart" ? "Intake (mm)" : "Ellipse width (mm)",
                  width,
                  setWidth,
                  0.1,
                )}
                {field(
                  kind === "dart" ? "Depth (mm)" : "Ellipse height (mm)",
                  depth,
                  setDepth,
                  0.1,
                )}
                {kind === "dart" && (
                  <Text size="sm">
                    Two legs meet at the apex. Intake {width} mm · Depth {depth}{" "}
                    mm. The stitching outline remains intact.
                  </Text>
                )}
              </>
            ) : (
              <>
                {field("Mark length (mm)", length, setLength, 1)}
                <TextInput
                  label="Mark label"
                  value={label}
                  maxLength={120}
                  onChange={(e) => setLabel(e.currentTarget.value)}
                />
                {field("Mark text size (mm)", fontSize, setFontSize, 1)}
                <Select
                  clearable
                  label="Attach mark to edge"
                  placeholder="Piece frame"
                  value={attach}
                  onChange={setAttach}
                  data={piece.stitchingOutline.map((r, i) => ({
                    value: r.segmentId,
                    label: `Edge ${i + 1}`,
                  }))}
                />
              </>
            )}
          </>
        )}
        {(candidate.error || error) && (
          <Text c="red" role="alert">
            {candidate.error || error}
          </Text>
        )}
        <Group justify="end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!candidate.doc} onClick={apply}>
            Apply sewing edit
          </Button>
        </Group>
      </Stack>
    </DraggableModal>
  );
}
export function newSewingSession(
  base: PatternDocument,
  pieceId: string,
  kind: SewingSession["kind"],
  edgeId = "",
  id = createId(),
): SewingSession {
  return { base, pieceId, kind, edgeId, id };
}
