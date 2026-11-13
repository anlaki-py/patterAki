import { Select } from "@mantine/core";
import type { ExportScope } from "../export/drawingScope";
export function ExportScopeSelect({
  label,
  value,
  onChange,
  selectedPieces,
  selectedItems,
  disabled,
}: {
  label: string;
  value: ExportScope;
  onChange: (scope: ExportScope) => void;
  selectedPieces: number;
  selectedItems: number;
  disabled?: boolean;
}) {
  return (
    <Select
      label={label}
      value={value}
      disabled={disabled}
      allowDeselect={false}
      onChange={(scope) => {
        if (
          scope === "drawing" ||
          scope === "selection" ||
          scope === "all" ||
          scope === "selected"
        )
          onChange(scope);
      }}
      data={[
        { value: "drawing", label: "Entire visible drawing" },
        {
          value: "selection",
          label: `Selected drawing items (${selectedItems})`,
          disabled: !selectedItems,
        },
        { value: "all", label: "All visible pieces" },
        {
          value: "selected",
          label: `Selected pieces (${selectedPieces})`,
          disabled: !selectedPieces,
        },
      ]}
    />
  );
}
