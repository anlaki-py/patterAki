import { useState, useEffect, useRef } from "react";
import {
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Textarea,
  Checkbox,
  Select,
} from "@mantine/core";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import {
  selectedPieceIds,
  previewPieceRotation,
} from "../editor/pieceCommands";
import { pieceBounds } from "../document/pieceTransforms";
import { pieceForItem } from "../document/pieceAccess";
import { formatLength, type PatternPiece } from "../document/schema";
import { commandProps, notifyCommand } from "./CommandControls";
import { DraggableModal } from "./DraggableModal";

function PieceDetails({ piece }: { piece: PatternPiece }) {
  const s = useEditor();
  const [name, setName] = useState(piece.name),
    [metadata, setMetadata] = useState(piece.metadata);
  const box = pieceBounds(s.preview ?? s.document, [piece.id]);
  const angle =
    (Math.atan2(piece.transform.b, piece.transform.a) * 180) / Math.PI;
  return (
    <Stack gap="xs">
      <Text size="sm">
        {s.editPieceId === piece.id ? "Editing geometry" : "Piece selected"} ·{" "}
        {piece.locked ? "Locked" : "Unlocked"} ·{" "}
        {piece.visible ? "Visible" : "Hidden"} · Closed clockwise stitching
        outline
      </Text>
      <Text size="sm">
        Width {formatLength(box.max.x - box.min.x, s.document.unitsDisplay)} ·
        Height {formatLength(box.max.y - box.min.y, s.document.unitsDisplay)}
        <br />X {formatLength(box.min.x, s.document.unitsDisplay)} · Y{" "}
        {formatLength(box.min.y, s.document.unitsDisplay)}
        <br />
        Rotation {Number(angle.toFixed(2))}° ·{" "}
        {piece.transform.a * piece.transform.d -
          piece.transform.b * piece.transform.c <
        0
          ? "Mirrored"
          : "Original orientation"}
      </Text>
      <TextInput
        label="Piece name"
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      {(["size", "fabric", "version"] as const).map((key) => (
        <TextInput
          key={key}
          label={
            key === "fabric"
              ? "Fabric"
              : key === "size"
                ? "Size"
                : "Piece version"
          }
          value={metadata[key]}
          onChange={(e) =>
            setMetadata({ ...metadata, [key]: e.currentTarget.value })
          }
          maxLength={120}
        />
      ))}
      <NumberInput
        label="Quantity to cut"
        min={1}
        max={10000}
        allowDecimal={false}
        value={metadata.cutQuantity}
        onChange={(v) => setMetadata({ ...metadata, cutQuantity: Number(v) })}
      />
      <Checkbox
        label="On fold"
        checked={metadata.onFold}
        onChange={(e) =>
          setMetadata({ ...metadata, onFold: e.currentTarget.checked })
        }
      />
      <Checkbox
        label="Mirrored pair"
        checked={metadata.mirroredPair}
        onChange={(e) =>
          setMetadata({ ...metadata, mirroredPair: e.currentTarget.checked })
        }
      />
      <Textarea
        label="Piece notes"
        maxLength={4000}
        value={metadata.notes}
        onChange={(e) =>
          setMetadata({ ...metadata, notes: e.currentTarget.value })
        }
      />
      <Button
        {...commandProps(
          notifyCommand(
            commands.updatePiece.bind({
              id: piece.id,
              patch: { name, metadata },
            }),
          ),
        )}
      >
        Save piece properties
      </Button>
      <Text size="xs" c="dimmed">
        Cut metadata is descriptive. Fold-edge allowance and attached marks
        arrive in M2.2.
      </Text>
    </Stack>
  );
}
export function PieceProperties() {
  const s = useEditor(),
    ids = selectedPieceIds();
  const parent = s.selected.length
    ? pieceForItem(s.document, s.selected[0])
    : s.activePoint
      ? pieceForItem(s.document, s.activePoint)
      : undefined;
  const piece = ids.length === 1 ? s.document.pieces[ids[0]] : parent;
  const rotating = useRef(false);
  useEffect(
    () => () => {
      if (rotating.current) useEditor.getState().cancel();
    },
    [],
  );
  const [parentId, setParentId] = useState<string | null>(null);
  const [rotate, setRotate] = useState(false),
    [degrees, setDegrees] = useState<string | number>(0),
    [error, setError] = useState("");
  const preview = (v: string | number) => {
    setDegrees(v);
    try {
      if (v === "") throw new Error("Enter a rotation angle.");
      previewPieceRotation(Number(v));
      setError("");
    } catch (e) {
      useEditor.setState({ preview: null });
      setError((e as Error).message);
    }
  };
  const applyRotation = () => {
    const state = useEditor.getState();
    if (!state.preview || error) return;
    try {
      state.commit(state.preview);
      rotating.current = false;
      setRotate(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Pattern pieces
      </Text>
      {piece && (
        <PieceDetails key={`${piece.id}-${s.revision}`} piece={piece} />
      )}
      <Select
        label="Internal path parent"
        placeholder="Choose a piece"
        value={parentId}
        onChange={setParentId}
        data={Object.values(s.document.pieces)
          .filter((p) => p.visible && !p.locked)
          .map((p) => ({ value: p.id, label: p.name }))}
      />
      {parentId && (
        <Button
          variant="default"
          {...commandProps(
            notifyCommand(commands.attachInternalPath.bind(parentId)),
          )}
        >
          Attach selected loose path
        </Button>
      )}
      {!!ids.length && (
        <>
          <Button {...commandProps(commands.editPiece.bind())}>
            Edit points · E
          </Button>
          <Button
            variant="default"
            disabled={!commands.duplicatePiece.enabled()}
            onClick={() => {
              s.cancel();
              rotating.current = true;
              setRotate(true);
              preview(0);
            }}
          >
            Rotate selected pieces…
          </Button>
          <Button
            variant="default"
            {...commandProps(notifyCommand(commands.duplicatePiece.bind()))}
          >
            Duplicate selected pieces
          </Button>
          <Group grow>
            <Button
              variant="default"
              {...commandProps(notifyCommand(commands.mirrorPiece.bind("x")))}
            >
              Mirror left/right
            </Button>
            <Button
              variant="default"
              {...commandProps(notifyCommand(commands.mirrorPiece.bind("y")))}
            >
              Mirror top/bottom
            </Button>
          </Group>
        </>
      )}
      {Object.values(s.document.pieces).map((p) => (
        <Stack gap={4} key={p.id}>
          <Button
            variant="subtle"
            {...commandProps(commands.selectPiece.bind(p.id))}
          >
            {p.name}
            {p.locked ? " · Locked" : ""}
            {!p.visible ? " · Hidden" : ""}
          </Button>
          <Group grow>
            <Button
              size="compact-sm"
              variant="default"
              {...commandProps(
                commands.updatePiece.bind({
                  id: p.id,
                  patch: { locked: !p.locked },
                }),
              )}
            >
              {p.locked ? "Unlock" : "Lock"}
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              {...commandProps(
                commands.updatePiece.bind({
                  id: p.id,
                  patch: { visible: !p.visible },
                }),
              )}
            >
              {p.visible ? "Hide" : "Show"}
            </Button>
          </Group>
        </Stack>
      ))}
      {rotate && (
        <DraggableModal
          onClose={() => {
            s.cancel();
            rotating.current = false;
            setRotate(false);
          }}
          title="Rotate selected pieces"
        >
          <Stack>
            <NumberInput
              label="Clockwise rotation in degrees"
              value={degrees}
              onChange={preview}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyRotation();
                }
              }}
              error={error}
              autoFocus
            />
            <Text size="sm">
              Rotate together around the selection center. Pattern dimensions
              stay unchanged.
            </Text>
            <Group>
              <Button disabled={!s.preview || !!error} onClick={applyRotation}>
                Apply rotation
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  s.cancel();
                  rotating.current = false;
                  setRotate(false);
                }}
              >
                Cancel
              </Button>
            </Group>
          </Stack>
        </DraggableModal>
      )}
    </Stack>
  );
}
