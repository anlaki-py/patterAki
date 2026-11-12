import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import type { PatternPiece } from "../document/schema";
import {
  defaultSeamAllowance,
  type SeamAllowance,
} from "../document/seamSchema";
import { cutOutline } from "../document/seamAllowance";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { commandProps } from "./CommandControls";
import { DraggableModal } from "./DraggableModal";
function SeamDialog({
  piece,
  close,
}: {
  piece: PatternPiece;
  close: () => void;
}) {
  const s = useEditor();
  const [settings, setSettings] = useState<SeamAllowance>(
    piece.seamAllowance ?? defaultSeamAllowance(),
  );
  const [overrides, setOverrides] = useState<
    Record<string, number | undefined>
  >({});
  const [edgeId, setEdgeId] = useState(
    piece.stitchingOutline.find((r) => s.selected.includes(r.segmentId))
      ?.segmentId ?? piece.stitchingOutline[0].segmentId,
  );
  const width = Object.hasOwn(overrides, edgeId)
    ? overrides[edgeId]
    : piece.sewing?.edges[edgeId]?.allowanceMm;
  useEffect(() => {
    commands.previewSeam.run({ id: piece.id, settings, overrides });
  }, [piece.id, settings, overrides]);
  useEffect(
    () => () => {
      useEditor.setState({ preview: null, previewIssue: null });
    },
    [],
  );
  const cancel = () => {
    s.cancel();
    close();
  };
  return (
    <DraggableModal title="Seam allowance" onClose={cancel}>
      <Stack
        gap="xs"
        onKeyDown={(e) => {
          if (e.key === "Enter" && commands.applySeam.enabled()) {
            e.preventDefault();
            if (commands.applySeam.run()) close();
          }
        }}
      >
        <NumberInput
          label="Seam width (mm)"
          value={Number.isFinite(settings.widthMm) ? settings.widthMm : ""}
          min={0}
          max={1000}
          onChange={(v) =>
            setSettings({
              ...settings,
              widthMm: typeof v === "number" ? v : NaN,
            })
          }
        />
        <Select
          label="Corner join"
          value={settings.join}
          data={["miter", "round", "bevel"]}
          onChange={(v) => {
            if (v)
              setSettings({ ...settings, join: v as SeamAllowance["join"] });
          }}
        />
        <NumberInput
          label="Miter limit"
          value={
            Number.isFinite(settings.miterLimit) ? settings.miterLimit : ""
          }
          min={1}
          max={20}
          onChange={(v) =>
            setSettings({
              ...settings,
              miterLimit: typeof v === "number" ? v : NaN,
            })
          }
        />
        <Select
          label="Allowance edge"
          value={edgeId}
          data={piece.stitchingOutline.map((r, i) => ({
            value: r.segmentId,
            label: `Edge ${i + 1}`,
          }))}
          onChange={(v) => {
            if (v) setEdgeId(v);
          }}
        />
        <Checkbox
          label="Override edge width"
          checked={width !== undefined}
          onChange={(e) =>
            setOverrides({
              ...overrides,
              [edgeId]: e.currentTarget.checked ? settings.widthMm : undefined,
            })
          }
        />
        {width !== undefined && (
          <NumberInput
            label="Edge allowance (mm)"
            value={Number.isFinite(width) ? width : ""}
            min={0}
            max={1000}
            onChange={(v) =>
              setOverrides({
                ...overrides,
                [edgeId]: typeof v === "number" ? v : NaN,
              })
            }
          />
        )}
        <Text size="xs">
          Edge overrides take priority. Fold edges default to 0 mm. Curved cut
          contours are approximated within 0.05 mm; source curves stay editable.
        </Text>
        {s.previewIssue && (
          <Text role="alert" c="red">
            {s.previewIssue}
          </Text>
        )}
        <Group>
          <Button
            variant="default"
            {...commandProps(commands.cancelDialog.bind({ execute: cancel }))}
          >
            Cancel
          </Button>
          <Button
            {...commandProps(commands.applySeam.bind())}
            onClick={() => {
              if (commands.applySeam.run()) close();
            }}
          >
            Apply seam allowance
          </Button>
        </Group>
      </Stack>
    </DraggableModal>
  );
}
export function SeamProperties({ piece }: { piece: PatternPiece }) {
  const s = useEditor(),
    [open, setOpen] = useState(false);
  let issue: string | null = null;
  try {
    cutOutline(
      s.preview ?? s.document,
      (s.preview ?? s.document).pieces[piece.id],
    );
  } catch (error) {
    issue = error instanceof Error ? error.message : "Unresolved cut outline.";
  }
  return (
    <Stack gap="xs">
      <Button
        {...commandProps(
          commands.openSeam.bind({
            execute: () => setOpen(true),
            enabled: () =>
              piece.visible &&
              !piece.locked &&
              !s.hasDraft &&
              !s.gestureActive &&
              !s.preview,
          }),
        )}
      >
        Seam allowance…
      </Button>
      <Select
        label="Outline visibility"
        value={s.outlineVisibility}
        data={[
          { value: "stitch", label: "Stitch" },
          { value: "cut", label: "Cut" },
          { value: "both", label: "Both" },
        ]}
        onChange={(v) => {
          if (v) commands.seamVisibility.run(v as "stitch" | "cut" | "both");
        }}
      />
      {issue && (
        <Text size="xs" role="alert" c="red">
          {issue}
        </Text>
      )}
      {open && <SeamDialog piece={piece} close={() => setOpen(false)} />}
    </Stack>
  );
}
