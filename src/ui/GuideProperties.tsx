import { useState } from "react";
import {
  Button,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { ConstructionGuide } from "../document/guideSchema";
import {
  createGuide,
  offsetGuide,
  removeGuide,
  selectGuide,
  setGuideLocked,
  setGuidePosition,
  setGuideVisible,
} from "../editor/guideActions";
import { useEditor } from "../editor/store";

function report(action: () => void) {
  try {
    action();
  } catch (e) {
    notifications.show({ color: "red", message: (e as Error).message });
  }
}

function GuideEditor({
  guide,
  revision,
}: {
  guide: ConstructionGuide;
  revision: number;
}) {
  const [position, setPosition] = useState<string | number>(guide.positionMm);
  const [offset, setOffset] = useState<string | number>(0);
  const [error, setError] = useState("");
  const applyPosition = () => {
    if (typeof position !== "number" || !Number.isFinite(position)) {
      setError("Enter a finite position in millimetres.");
      return;
    }
    report(() => setGuidePosition(guide.id, position));
    setError("");
  };
  const applyOffset = () => {
    if (typeof offset !== "number" || !Number.isFinite(offset)) {
      setError("Enter a finite offset in millimetres.");
      return;
    }
    report(() => offsetGuide(guide.id, offset));
    setError("");
  };
  return (
    <Stack gap="xs" key={`${guide.id}-${revision}`}>
      <Text size="sm" fw={500}>
        {guide.axis === "x" ? "Vertical" : "Horizontal"} guide ·{" "}
        {guide.axis === "x" ? "x" : "y"} = {guide.positionMm} mm
      </Text>
      <NumberInput
        label="Exact position (mm)"
        value={position}
        error={error}
        onChange={setPosition}
        onKeyDown={(event) => {
          if (event.key === "Enter") applyPosition();
        }}
      />
      <Button variant="default" onClick={applyPosition}>
        Set exact position
      </Button>
      <Group grow align="flex-end">
        <NumberInput
          label="Offset Δ (mm)"
          value={offset}
          onChange={setOffset}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyOffset();
          }}
        />
        <Button variant="default" onClick={applyOffset}>
          Move by offset
        </Button>
      </Group>
      <Switch
        size="xs"
        label="Locked (cannot be dragged)"
        checked={guide.locked}
        onChange={(event) =>
          report(() => setGuideLocked(guide.id, event.currentTarget.checked))
        }
      />
      <Switch
        size="xs"
        label="Visible (eligible for snapping)"
        checked={guide.visible}
        onChange={(event) =>
          report(() => setGuideVisible(guide.id, event.currentTarget.checked))
        }
      />
      <Button
        color="red"
        variant="light"
        onClick={() => report(() => removeGuide(guide.id))}
      >
        Delete guide
      </Button>
    </Stack>
  );
}

export function GuideProperties() {
  const s = useEditor();
  const [newPosition, setNewPosition] = useState<string | number>(0);
  const guides = Object.values(s.document.guides).sort(
    (a, b) =>
      a.axis.localeCompare(b.axis) ||
      a.positionMm - b.positionMm ||
      a.id.localeCompare(b.id),
  );
  const selected = s.selectedGuide
    ? s.document.guides[s.selectedGuide]
    : undefined;
  return (
    <Stack gap="sm">
      <Divider label="Construction guides" labelPosition="left" />
      <Text size="xs" c="dimmed">
        Rulers create guides by dragging into the canvas. These numeric controls
        are the touch-friendly alternative. Values are always stored in mm.
      </Text>
      <Group grow align="flex-end">
        <NumberInput
          label="New guide position (mm)"
          value={newPosition}
          onChange={setNewPosition}
        />
        <Button
          variant="default"
          onClick={() =>
            typeof newPosition === "number" &&
            report(() => createGuide("x", newPosition))
          }
        >
          Add vertical
        </Button>
        <Button
          variant="default"
          onClick={() =>
            typeof newPosition === "number" &&
            report(() => createGuide("y", newPosition))
          }
        >
          Add horizontal
        </Button>
      </Group>
      {guides.length > 0 ? (
        <Select
          label="Select guide"
          placeholder="Choose a guide"
          value={selected?.id ?? null}
          onChange={(value) => selectGuide(value)}
          data={guides.map((guide) => ({
            value: guide.id,
            label: `${guide.axis === "x" ? "x" : "y"} = ${guide.positionMm} mm${
              guide.locked ? " · locked" : ""
            }${guide.visible ? "" : " · hidden"}`,
          }))}
        />
      ) : (
        <Text size="xs" c="dimmed">
          No saved guides yet.
        </Text>
      )}
      {selected && (
        <GuideEditor
          key={`${selected.id}-${s.revision}`}
          guide={selected}
          revision={s.revision}
        />
      )}
    </Stack>
  );
}
