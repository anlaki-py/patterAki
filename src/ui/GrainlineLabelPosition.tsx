import { Select } from "@mantine/core";
import {
  labelPositionSchema,
  type LabelPosition,
} from "../document/annotationSchema";
export function GrainlineLabelPosition({
  value,
  onChange,
}: {
  value: LabelPosition;
  onChange: (value: LabelPosition) => void;
}) {
  return (
    <Select
      label="Grainline label position"
      value={value}
      data={[
        { value: "top", label: "Top" },
        { value: "bottom", label: "Bottom" },
        { value: "inside", label: "Inside line" },
      ]}
      allowDeselect={false}
      onChange={(value) => {
        const parsed = labelPositionSchema.safeParse(value);
        if (parsed.success) onChange(parsed.data);
      }}
    />
  );
}
