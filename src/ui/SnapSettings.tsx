import { useEffect, useState } from "react";
import {
  Button,
  Divider,
  NumberInput,
  Popover,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { SlidersHorizontal } from "lucide-react";
import { useEditor } from "../editor/store";
import type { SnapModes } from "../editor/settings";
import {
  validateMajorEvery,
  validateNudge,
  validatePickup,
  validateSpacing,
} from "../editor/settings";

function SettingNumber({
  label,
  value,
  min,
  max,
  step,
  validate,
  onApply,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  validate: (value: number) => number;
  onApply: (value: number) => void;
  unit?: string;
}) {
  const [draft, setDraft] = useState<string | number>(value);
  const [error, setError] = useState("");
  useEffect(() => setDraft(value), [value]);
  const apply = (next: string | number) => {
    setDraft(next);
    if (typeof next !== "number") {
      setError("Enter a number.");
      return;
    }
    try {
      const parsed = validate(next);
      setError("");
      onApply(parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <NumberInput
      label={unit ? `${label} (${unit})` : label}
      value={draft}
      min={min}
      max={max}
      step={step}
      error={error}
      onChange={apply}
    />
  );
}

const modeLabels: Record<keyof SnapModes, string> = {
  endpoints: "Endpoints",
  intersections: "Intersections",
  midpoints: "Midpoints",
  edges: "Edges and on-edge",
  alignments: "Alignment and 45° guides",
  perpendicular: "Perpendicular",
  guides: "Construction guides",
  grid: "Grid points",
};

export function SnapSettings() {
  const s = useEditor();
  const mode = (key: keyof SnapModes, label: string) => (
    <Switch
      key={key}
      size="xs"
      label={label}
      checked={s.snapModes[key]}
      onChange={(event) =>
        useEditor.setState({
          snapModes: {
            ...s.snapModes,
            [key]: event.currentTarget.checked,
          },
        })
      }
    />
  );
  return (
    <Popover width={330} position="bottom-start" withArrow withinPortal>
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<SlidersHorizontal size={16} />}
          aria-label="Snap and grid settings"
        >
          Snap settings
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Snapping and grid
          </Text>
          <Switch
            size="xs"
            label="Magnetic snapping"
            checked={s.snap}
            onChange={(event) =>
              useEditor.setState({ snap: event.currentTarget.checked })
            }
          />
          <Switch
            size="xs"
            label="Show grid"
            checked={s.grid}
            onChange={(event) =>
              useEditor.setState({ grid: event.currentTarget.checked })
            }
          />
          <Switch
            size="xs"
            label="Snap to grid"
            checked={s.gridSnap}
            onChange={(event) =>
              useEditor.setState({ gridSnap: event.currentTarget.checked })
            }
          />
          <Text size="xs" c="dimmed">
            Grid visibility and grid snapping are independent. Logical snapping
            always uses the exact spacing below, not screen pixels.
          </Text>
          <SettingNumber
            label="Grid spacing"
            unit="mm"
            value={s.gridSpacingMm}
            min={0.1}
            max={1000}
            step={0.5}
            validate={validateSpacing}
            onApply={(gridSpacingMm) => useEditor.setState({ gridSpacingMm })}
          />
          <SettingNumber
            label="Major grid every"
            value={s.gridMajorEvery}
            min={1}
            max={100}
            step={1}
            validate={validateMajorEvery}
            onApply={(gridMajorEvery) => useEditor.setState({ gridMajorEvery })}
          />
          <Divider my={2} />
          <Text fw={600} size="sm">
            Snap modes
          </Text>
          {(Object.keys(modeLabels) as (keyof SnapModes)[]).map((key) =>
            mode(key, modeLabels[key]),
          )}
          <Divider my={2} />
          <SettingNumber
            label="Mouse pickup"
            unit="px"
            value={s.mouseRadiusPx}
            min={2}
            max={32}
            step={1}
            validate={(value) => validatePickup(value, "mouse")}
            onApply={(mouseRadiusPx) => useEditor.setState({ mouseRadiusPx })}
          />
          <SettingNumber
            label="Touch pickup"
            unit="px"
            value={s.touchRadiusPx}
            min={4}
            max={48}
            step={1}
            validate={(value) => validatePickup(value, "touch")}
            onApply={(touchRadiusPx) => useEditor.setState({ touchRadiusPx })}
          />
          <SettingNumber
            label="Release multiplier"
            value={s.releaseMultiplier}
            min={1}
            max={3}
            step={0.1}
            validate={(value) => {
              if (!Number.isFinite(value) || value < 1 || value > 3)
                throw new Error("Release multiplier must be between 1 and 3.");
              return value;
            }}
            onApply={(releaseMultiplier) =>
              useEditor.setState({ releaseMultiplier })
            }
          />
          <Divider my={2} />
          <Switch
            size="xs"
            label="Show rulers"
            checked={s.showRulers}
            onChange={(event) =>
              useEditor.setState({ showRulers: event.currentTarget.checked })
            }
          />
          <Switch
            size="xs"
            label="Show guides"
            checked={s.showGuides}
            onChange={(event) =>
              useEditor.setState({ showGuides: event.currentTarget.checked })
            }
          />
          <Switch
            size="xs"
            label="Snap to guides"
            checked={s.snapGuides}
            onChange={(event) =>
              useEditor.setState({ snapGuides: event.currentTarget.checked })
            }
          />
          <SettingNumber
            label="Keyboard nudge"
            unit="mm"
            value={s.nudgeMm}
            min={0.01}
            max={1000}
            step={0.5}
            validate={validateNudge}
            onApply={(nudgeMm) => useEditor.setState({ nudgeMm })}
          />
          <Text size="xs" c="dimmed">
            Arrow moves by the nudge step, Shift+Arrow by 10× and Alt+Arrow by
            0.1×. During a drag, Alt bypasses magnets instead.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
