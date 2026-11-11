import { Button, Group, NumberInput } from "@mantine/core";
import type { RefObject } from "react";
import type { BoundCommand } from "../editor/command";
import type { Tool } from "../editor/store";
import { commandProps } from "./CommandControls";
import { LengthInput } from "./LengthInput";

type FieldValue = string | number;
export function DraftPrecision({
  tool,
  units,
  exact,
  degrees,
  width,
  height,
  exactError,
  rectangleError,
  setExact,
  setDegrees,
  setWidth,
  setHeight,
  exactField,
  exactLine,
  rectangle,
  onCancel,
  onConfirm,
}: {
  tool: Tool;
  units: string;
  exact: FieldValue;
  degrees: FieldValue;
  width: FieldValue;
  height: FieldValue;
  exactError: string;
  rectangleError: string;
  setExact: (value: FieldValue) => void;
  setDegrees: (value: FieldValue) => void;
  setWidth: (value: FieldValue) => void;
  setHeight: (value: FieldValue) => void;
  exactField: RefObject<HTMLInputElement | null>;
  exactLine: BoundCommand;
  rectangle: BoundCommand;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const rectangular = tool === "rectangle";
  if (!rectangular && tool !== "line" && tool !== "polyline") return null;
  const action = rectangular ? rectangle : exactLine;
  return (
    <Group
      p="xs"
      gap="xs"
      className="precision-bar"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (action.enabled()) {
            action.run();
            onConfirm();
          }
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {rectangular ? (
        <>
          <LengthInput
            error={rectangleError}
            label={`Width (${units})`}
            value={width}
            onChange={setWidth}
            w={130}
          />
          <LengthInput
            label={`Height (${units})`}
            value={height}
            onChange={setHeight}
            w={130}
          />
        </>
      ) : (
        <>
          <LengthInput
            ref={exactField}
            error={exactError}
            label={`Exact length (${units})`}
            value={exact}
            onChange={setExact}
            w={150}
          />
          <NumberInput
            label="Angle (degrees)"
            value={degrees}
            onChange={setDegrees}
            w={140}
          />
        </>
      )}
      <Button {...commandProps(action)}>{action.label}</Button>
    </Group>
  );
}
